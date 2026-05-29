import { ImapFlow } from 'imapflow';
import { getLogger, mascarEmail } from '../logger.js';
import { runEnvelope } from '../envelope.js';
import {
  obterEstadoProcessamento,
  atualizarUltimoBuscado,
  atualizarStatusConexao,
  salvarClassificacao,
  buscarEmailsProcessados,
  getConvexClient,
} from '../convex/cliente.js';
import { garantirPastasFast, moverComFallback, obterPastaParaNivel } from './pastas.js';
import { classificarEmail } from './classificador.js';
import { analisarContextoConversa } from './thread-context.js';
import { MovimentoMonitor } from './movimento-monitor.js';
import { gerarRascunho } from '../drafts/draft-generator.js';
import { salvarRascunhoIMAP } from '../drafts/draft-saver.js';
import { SentMonitor } from '../drafts/sent-monitor.js';

const log = getLogger('imap');

let client = null;

// MovimentoMonitor usa conexão IMAP separada para não interromper o IDLE do worker
let movimentoMonitor = null;
let monitorClient = null;
let sentMonitor = null;
let sentMonitorClient = null; // Conexão IMAP dedicada ao SentMonitor

/**
 * Cria um cliente ImapFlow configurado com as credenciais do ambiente.
 * Usado tanto pelo worker principal quanto pelo MovimentoMonitor.
 */
function criarClienteImap() {
  return new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10),
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASSWORD,
    },
    logger: false,
  });
}

/**
 * FilaProcessamento — Serializa processamento de emails
 *
 * PROBLEMA RESOLVIDO:
 * IMAP IDLE dispara múltiplos eventos 'exists' rapidamente quando múltiplos
 * emails chegam. Sem sincronização, cada evento dispara um processamento em paralelo.
 * Se dois processadores tentam buscar "novos emails", ambos processam o mesmo email.
 *
 * SOLUÇÃO:
 * Fila baseada em Promises que encadeia execuções.
 * - Máximo 1 processamento por vez
 * - Próximo aguarda anterior terminar
 * - Ordem de execução garantida
 * - Erros não travam a fila
 *
 * GARANTIAS:
 * ✓ Sem duplicação de processamento mesmo com múltiplos 'exists' events
 * ✓ Sem race conditions ao mover emails ou acessar IMAP
 * ✓ Continuidade mesmo após erro (fail-safe)
 *
 * EXEMPLO:
 *   Email A chega → processamento 1 começa
 *   Email B chega (antes de A terminar) → enfileirado
 *   Email A termina → processamento 2 começa (Email B)
 */
class FilaProcessamento {
  constructor() {
    this.promiseAtual = Promise.resolve();
  }

  /**
   * Enfileira uma função para execução serial.
   * @param {Function} fn - Função async a executar
   * @returns {Promise} - Promise que resolve quando a tarefa completa
   */
  enfileirar(fn) {
    // Encadeia: espera a promise anterior, depois executa fn
    this.promiseAtual = this.promiseAtual
      .then(async () => {
        try {
          return await fn();
        } catch (err) {
          // Log o erro mas não para a fila
          // Próxima execução seguirá normalmente
          log.error({ err: err.message, stack: err.stack }, 'Erro ao processar email');
          throw err;
        }
      })
      .catch(err => {
        // Garantir que a fila continua mesmo após erro
        log.error({ err: err.message }, 'Erro na fila de processamento — continuando');
      });

    return this.promiseAtual;
  }
}

const filaProcessamento = new FilaProcessamento();

// Estado global do worker — rastreia qual é o funcionário sendo processado
// TODO: Quando tiver múltiplos funcionários, isso vira um Map
let estadoGlobal = {
  funcionarioId: null,
  ultimoUidProcessado: 0,
};

/**
 * Registrar UID como processado
 *
 * CRÍTICO: Deve ser chamado ANTES de qualquer ação (mover, classificar, salvar).
 * Garante que se falhar depois, na reconexão não reprocessa.
 *
 * Idempotência: Se reconectar no meio de um processamento:
 *   UID já registrado em Convex → Na busca de "novos", ignora UIDs <= ultimoUidProcessado
 *   Mesmo que reprocesse, é no máximo 2x (safe)
 *
 * @param {number} uid
 */
async function registrarUidProcessado(uid) {
  if (!estadoGlobal.funcionarioId) {
    log.warn('funcionarioId não definido, não registrando UID processado');
    return;
  }

  try {
    const resultado = await atualizarUltimoBuscado(estadoGlobal.funcionarioId, uid);
    if (resultado.sucesso) {
      estadoGlobal.ultimoUidProcessado = Math.max(estadoGlobal.ultimoUidProcessado, uid);
      log.debug({ uid, funcionarioId: estadoGlobal.funcionarioId }, 'UID registrado como processado');
    }
  } catch (err) {
    // Log mas não para o processamento — melhor registrar depois que falhar agora
    log.error({ err: err.message, uid }, 'Erro ao registrar UID processado');
  }
}

async function iniciarIdle() {
  try {
    log.info('Entrando em modo IDLE...');
    await client.idle();
  } catch (err) {
    if (err.message !== 'Connection closed') {
      log.error({ err: err.message }, 'Erro no IDLE');
    }
  }
}

/**
 * Processar novos emails
 *
 * ORDEM CRÍTICA DE OPERAÇÕES (para garantir idempotência):
 * 1. Buscar novos UIDs (> ultimoUidProcessado)
 * 2. Para cada UID:
 *    a. Registrar como processado (ANTES de qualquer ação)
 *    b. Buscar email do IMAP
 *    c. Normalizar dados
 *    d. Analisar contexto de thread
 *    e. Classificar (Claude API ou pré-classificador)
 *    f. Mover para pasta Fast/*
 *    g. Salvar em Convex
 *
 * Se falhar em qualquer passo:
 * - UID já está registrado em Convex
 * - Na reconexão, busca apenas UIDs > ultimoUidProcessado
 * - Máximo reprocessa 2x (safe)
 */
async function processarNovosEmails() {
  await runEnvelope('processar-novos-emails', async (env) => {
    if (!client || !client.mailbox) {
      log.warn('IMAP client não pronto');
      env.set('motivo', 'client_not_ready');
      return;
    }

    try {
      // Buscar novos UIDs (> ultimoUidProcessado)
      const queryRange = `${estadoGlobal.ultimoUidProcessado + 1}:*`;
      const novoUIDs = await client.search({ uid: queryRange });

      if (novoUIDs.length === 0) {
        log.debug({ ultimoUidProcessado: estadoGlobal.ultimoUidProcessado }, 'Nenhum email novo');
        env.set('novos_uids', 0);
        return;
      }

      log.info(
        { total: novoUIDs.length, ultimoUidProcessado: estadoGlobal.ultimoUidProcessado },
        `Encontrados ${novoUIDs.length} email(s) novo(s)`
      );

      env.set('novos_uids', novoUIDs.length);

      // Enfileirar cada email para processamento serial.
      // Coletar a última promise pra aguardar o término real do processamento —
      // sem isto, processarNovosEmails retorna antes das tarefas executarem,
      // o IDLE entra em paralelo e gera "Connection not available" nos commands
      // concorrentes (messageMove) executados pela fila durante o IDLE.
      let ultimaPromise;
      for (const uid of novoUIDs) {
        ultimaPromise = filaProcessamento.enfileirar(() =>
          processarEmailIndividual(client, uid, estadoGlobal.funcionarioId, env)
        );
      }
      if (ultimaPromise) {
        await ultimaPromise;
      }
    } catch (err) {
      log.error({ err: err.message }, 'Erro ao buscar UIDs novos');
      env.addFailed(err.message);
      throw err;
    }
  });
}

/**
 * Processar um email individual
 *
 * Responsável por:
 * 1. Registrar UID (idempotência)
 * 2. Buscar dados do IMAP
 * 3. Classificar
 * 4. Mover para pasta
 * 5. Salvar em Convex
 *
 * @param {ImapFlow} client - Cliente IMAP
 * @param {number} uid - UID do email
 * @param {string} funcionarioId - ID do funcionário
 * @param {ExecutionEnvelope} env - Envelope de execução (para tracking)
 */
async function processarEmailIndividual(client, uid, funcionarioId, env) {
  try {
    // 1. REGISTRAR UID PRIMEIRO (CRÍTICO para idempotência)
    await registrarUidProcessado(uid);

    // 2. Buscar email do IMAP (envelope + estrutura básica)
    let message;
    try {
      message = await client.fetchOne(uid, {
        envelope: true,
        source: true,
        bodyStructure: true,
      });
    } catch (err) {
      if (err.message?.includes('no such message')) {
        // Email foi deletado entre a busca de UIDs e o fetch
        log.warn({ uid }, 'Email desapareceu (deletado no servidor)');
        env.addProcessed();
        return;
      }
      throw err;
    }

    if (!message) {
      log.warn({ uid }, 'Email vazio do IMAP');
      env.addProcessed();
      return;
    }

    // 3. Normalizar email
    const email = normalizarEmail(message, uid);

    if (!email.from || !email.subject) {
      log.warn({ uid, email }, 'Email com dados insuficientes');
      env.addProcessed();
      return;
    }

    // 4. Analisar contexto de thread
    let contextoThread = null;
    if (email.inReplyTo || email.references) {
      contextoThread = analisarContextoConversa(email);
    }

    // 5. Classificar
    let classificacao;
    try {
      classificacao = await classificarEmail(email, { id: funcionarioId }, contextoThread);
    } catch (err) {
      log.error(
        { uid, remetenteDominio: mascarEmail(email.from), err: err.message },
        'Erro ao classificar — usando fallback Nível 3'
      );
      classificacao = {
        nivel: 3,
        metodo: 'fallback-error',
        reasoning: `Erro na classificação: ${err.message}`,
        confidenceScore: 0,
      };
    }

    // 6. Mover para pasta
    const resultadoMover = await moverComFallback(client, uid, classificacao.nivel);

    if (!resultadoMover.sucesso && resultadoMover.motivo === 'fallback_inbox') {
      log.warn(
        { uid, remetenteDominio: mascarEmail(email.from), nivel: classificacao.nivel },
        'Email ficou em INBOX por falha de movimentação'
      );
    }

    // 7. Gerar rascunho de resposta (níveis 1–4, best-effort)
    let rascunhoTexto = undefined;
    if (classificacao.nivel <= 4) {
      try {
        const resultadoRascunho = await gerarRascunho(email, classificacao.nivel, {
          funcionarioId,
        });

        if (resultadoRascunho.sucesso && resultadoRascunho.rascunho) {
          rascunhoTexto = resultadoRascunho.rascunho;

          // Salvar rascunho na caixa IMAP do funcionário (usando conexão do monitorClient)
          const imapParaRascunho = monitorClient || client;
          if (imapParaRascunho) {
            const emailFuncionario = process.env.IMAP_USER;
            const resultadoSalvar = await salvarRascunhoIMAP(
              imapParaRascunho,
              email,
              rascunhoTexto,
              emailFuncionario
            );
            if (!resultadoSalvar.sucesso) {
              log.warn(
                { uid, erro: resultadoSalvar.erro },
                'Rascunho gerado mas não salvo no IMAP'
              );
            }
          }
        }
      } catch (err) {
        // Rascunho é best-effort — não bloqueia o processamento
        log.warn(
          { uid, err: err.message },
          'Falha na geração de rascunho — email processado normalmente'
        );
      }
    }

    // 8. Salvar em Convex
    try {
      await salvarClassificacao(
        funcionarioId,
        {
          messageId: email.messageId,
          uid,
          subject: email.subject,
          from: email.from,
          attachments: email.attachments,
        },
        classificacao.nivel,
        classificacao.reasoning,
        {
          idioma: 'pt-br',
          confidenceScore: classificacao.confidenceScore,
          metodo: classificacao.metodo,
          pastaUsada: resultadoMover.pastaUsada,
          contextoThread: contextoThread ? 'sim' : 'nao',
          rascunho: rascunhoTexto,
        }
      );
    } catch (err) {
      log.error(
        { uid, remetenteDominio: mascarEmail(email.from), err: err.message },
        'Erro ao salvar em Convex (email já movido)'
      );
      // Não falha aqui — email já foi movido, salvamento é best-effort
    }

    log.info(
      {
        uid,
        remetenteDominio: mascarEmail(email.from),
        nivel: classificacao.nivel,
        metodo: classificacao.metodo,
        pastaUsada: resultadoMover.pastaUsada,
        rascunhoGerado: !!rascunhoTexto,
      },
      'Email processado com sucesso'
    );

    env.addProcessed();
  } catch (err) {
    log.error(
      { uid, err: err.message, stack: err.stack },
      'Erro inesperado ao processar email'
    );
    env.addFailed(err.message);
    throw err;
  }
}

/**
 * Normalizar email do ImapFlow para formato padrão interno
 *
 * @param {Object} message - Mensagem do ImapFlow
 * @param {number} uid - UID do email
 * @returns {Object} - Email normalizado
 */
function normalizarEmail(message, uid) {
  const envelope = message.envelope || {};

  return {
    uid,
    messageId: envelope.messageId || `<${uid}@unknown>`,
    inReplyTo: envelope.inReplyTo,
    references: envelope.references,
    from: envelope.from?.[0]?.address || 'desconhecido',
    to: envelope.to?.[0]?.address || '',
    subject: envelope.subject || '(sem assunto)',
    text: extrairTextoSimples(message),
    date: envelope.date ? new Date(envelope.date).getTime() : Date.now(),
    attachments: detectarAnexos(message),
  };
}

/**
 * Extrair texto simples do email
 * Tira HTML e encoding, pega primeiras 800 chars
 *
 * @param {Object} message - Mensagem do ImapFlow
 * @returns {string} - Texto simples
 */
function extrairTextoSimples(message) {
  // ImapFlow retorna source (raw) ou parts (parsed)
  // Para simplicidade, tomar os primeiros 800 chars do source
  if (message.source && typeof message.source === 'string') {
    return message.source.substring(0, 1000);
  }

  // Fallback: tentar bodyStructure
  if (message.bodyStructure) {
    // bodyStructure é complexo, por ora retorna vazio
    return '';
  }

  return '';
}

/**
 * Detectar se email tem anexos
 * @param {Object} message - Mensagem do ImapFlow
 * @returns {Array} - Array de anexos {filename, size}
 */
function detectarAnexos(message) {
  const anexos = [];

  if (!message.bodyStructure) return anexos;

  const struct = message.bodyStructure;
  if (Array.isArray(struct.childNodes)) {
    struct.childNodes.forEach((child) => {
      if (child.disposition === 'attachment') {
        anexos.push({
          filename: child.filename || 'unknown',
          size: child.size || 0,
        });
      }
    });
  }

  return anexos;
}

/**
 * Iniciar Worker IMAP com loop de conexão e reconexão
 *
 * Fluxo:
 * 1. Conecta ao IMAP com retry exponencial (até 5 tentativas)
 * 2. Garante que pastas Fast/* existem
 * 3. Processa emails que chegaram enquanto desconectado
 * 4. Entra em IDLE para detectar novos emails em tempo real
 * 5. Reconecta preventivamente a cada 27 min (RFC 2177)
 * 6. Watchdog detecta desconexões inesperadas a cada 1 min
 * 7. Maneja desconexões inesperadas com retry backoff
 *
 * Garantias:
 * ✓ Reconexão automática em caso de falha (max 5 tentativas)
 * ✓ Heartbeat/watchdog detecta mortes silenciosas
 * ✓ IDLE com timeout robusto
 * ✓ Emails processados serialmente (sem race conditions)
 * ✓ Idempotência: UIDs registrados ANTES de qualquer ação
 */
async function iniciarWorker() {
  const FUNCIONARIO_ID = process.env.PILOTO_FUNCIONARIO_ID;
  if (!FUNCIONARIO_ID) {
    throw new Error('PILOTO_FUNCIONARIO_ID não configurada em .env');
  }

  estadoGlobal.funcionarioId = FUNCIONARIO_ID;

  let tentativaReconexao = 0;
  const MAX_TENTATIVAS = 5;
  let ultimoHeartbeat = Date.now();
  let watchdogInterval = null;

  /**
   * Iniciar watchdog — detecta desconexões silenciosas a cada 1 min
   */
  function iniciarWatchdog() {
    if (watchdogInterval) clearInterval(watchdogInterval);

    watchdogInterval = setInterval(() => {
      const agora = Date.now();
      const tempoSemAtividade = agora - ultimoHeartbeat;

      // Watchdog atua só se algo realmente travou. O reconnect preventivo
      // do RFC 2177 (25 min) já cobre a manutenção rotineira da conexão IDLE,
      // então só fazemos sentido entrar em ação se passar muito mais que isso
      // sem nenhuma atividade — sinal de IDLE morto silenciosamente.
      // (Antes era 90s, mas isso dispara desnecessariamente em horas calmas
      // sem emails chegando, gerando reconnect a cada 2 min.)
      if (tempoSemAtividade > 30 * 60 * 1000) {
        log.warn(
          { tempoSemAtividade },
          'Watchdog: Nenhuma atividade detectada, reconectando...'
        );
        // Reset do heartbeat pra evitar que o watchdog dispare em loop
        // a cada minuto. Se o close() não conseguir derrubar o IDLE
        // (estado zumbi), o RFC 2177 reconnect (25min) cobre.
        ultimoHeartbeat = Date.now();
        if (client) {
          // client.close() pode retornar undefined (não Promise) ou lançar
          // exceção se conexão já foi destruída. Defender ambos os casos.
          try { client.close()?.catch?.(() => {}); } catch (_err) { /* ignora */ }
        }
      }
    }, 60000); // Check a cada 1 min
  }

  /**
   * Conectar ao IMAP com retry exponencial
   */
  async function conectarComRetry() {
    try {
      log.info(
        { tentativa: tentativaReconexao + 1, max: MAX_TENTATIVAS },
        'Tentando conectar ao IMAP...'
      );

      // Fechar conexão anterior se existir
      if (sentMonitor) {
        sentMonitor.stop();
        sentMonitor = null;
      }
      if (sentMonitorClient) {
        try { sentMonitorClient.logout(); } catch (_) {}
        sentMonitorClient = null;
      }
      if (movimentoMonitor) {
        movimentoMonitor.stop();
        movimentoMonitor = null;
      }
      if (monitorClient) {
        try { monitorClient.logout(); } catch (_) {}
        monitorClient = null;
      }
      if (client) {
        try {
          await client.logout();
        } catch (_err) {
          // Ignora erro ao fazer logout da conexão anterior
        }
        client = null;
      }

      // Criar nova conexão
      client = criarClienteImap();

      // Conectar
      await client.connect();
      tentativaReconexao = 0; // Reset contador após sucesso
      log.info('✓ Conectado ao IMAP com sucesso');
      await atualizarStatusConexao(FUNCIONARIO_ID, 'conectado');

      // Abrir INBOX
      await client.mailboxOpen('INBOX');
      log.info('✓ INBOX aberta');

      // 1. Garantir pastas Fast/* existem
      try {
        const resultadoPastas = await garantirPastasFast(client);
        if (!resultadoPastas.sucesso) {
          log.warn(
            { detalhes: resultadoPastas.pastas },
            'Aviso: Algumas pastas Fast/* não criadas, usando fallback'
          );
        } else {
          log.info('✓ Pastas Fast/* garantidas');
        }
      } catch (err) {
        log.error({ erro: err.message }, 'Erro ao garantir pastas Fast/*');
      }

      // 2. Restaurar último UID processado (em caso de reconexão)
      try {
        const estado = await obterEstadoProcessamento(FUNCIONARIO_ID);
        if (estado?.ultimoUidProcessado > 0) {
          estadoGlobal.ultimoUidProcessado = estado.ultimoUidProcessado;
          log.info(
            { ultimoUid: estado.ultimoUidProcessado },
            '✓ Estado restaurado, buscando apenas emails novos'
          );
        }
      } catch (err) {
        log.warn({ erro: err.message }, 'Estado não encontrado, começando do zero');
      }

      // 3. Processar emails que chegaram enquanto desconectado
      try {
        await processarNovosEmails();
        log.info('✓ Emails pendentes processados');
      } catch (err) {
        log.error({ erro: err.message }, 'Erro ao processar emails pendentes');
      }

      // 4. Configurar listener para eventos IDLE.
      // O listener apenas atualiza o heartbeat — o loop em iniciarIdleComTimeout
      // chama processarNovosEmails() em cada ciclo de 60s, então não precisamos
      // disparar processamento aqui (evita race condition entre listener,
      // loop IDLE e reconnect que vimos antes em produção).
      client.on('exists', (data) => {
        log.debug({ count: data.count }, '📬 Notificação IMAP IDLE recebida');
        ultimoHeartbeat = Date.now();
      });

      // 5. Iniciar MovimentoMonitor com conexão IMAP própria (não interfere no IDLE)
      try {
        monitorClient = criarClienteImap();
        await monitorClient.connect();
        movimentoMonitor = new MovimentoMonitor(monitorClient, getConvexClient());
        await movimentoMonitor.start();
        log.info('✓ MovimentoMonitor iniciado (feedback loop ativo)');

      // 5b. Iniciar SentMonitor com conexão IMAP própria (evita conflito de mailboxOpen)
      try {
        const funcionarioId = process.env.PILOTO_FUNCIONARIO_ID;
        sentMonitorClient = criarClienteImap();
        await sentMonitorClient.connect();
        sentMonitor = new SentMonitor(sentMonitorClient, getConvexClient(), funcionarioId);
        await sentMonitor.start();
        log.info('✓ SentMonitor iniciado (captura de diff rascunho×enviado ativa)');
      } catch (err) {
        log.warn({ erro: err.message }, 'SentMonitor não pôde iniciar — diff desativado');
        sentMonitor = null;
        if (sentMonitorClient) {
          try { sentMonitorClient.logout(); } catch (_) {}
          sentMonitorClient = null;
        }
      }
      } catch (err) {
        log.warn({ erro: err.message }, 'MovimentoMonitor não pôde iniciar — feedback loop desativado');
        movimentoMonitor = null;
        if (monitorClient) {
          try { monitorClient.logout(); } catch (_) {}
          monitorClient = null;
        }
      }

      // 6. Iniciar watchdog (salvaguarda) e entrar no loop IDLE
      iniciarWatchdog();
      await iniciarIdleComTimeout();

    } catch (err) {
      tentativaReconexao++;

      if (tentativaReconexao > MAX_TENTATIVAS) {
        log.error(
          { tentativas: tentativaReconexao, erro: err.message },
          '❌ Falha ao conectar após 5 tentativas — aguardando 30s antes de retry'
        );
        // Não rethrow — continua tentando indefinidamente
        tentativaReconexao = 0;
      } else {
        // Backoff exponencial
        const delay = Math.min(30000, 1000 * Math.pow(2, tentativaReconexao - 1));
        log.warn(
          { tentativa: tentativaReconexao, delay_ms: delay, erro: err.message },
          `Reconectando em ${delay}ms...`
        );
        await new Promise(r => setTimeout(r, delay));
      }

      throw err;
    }
  }

  /**
   * Loop IDLE com ciclos curtos (padrão ImapFlow oficial).
   *
   * Por que ciclos curtos:
   * - O IDLE pode "morrer silenciosamente" — conexão TCP fica viva mas o
   *   servidor para de enviar notificações 'exists'. Nessa situação, sem
   *   intervenção, emails ficam parados na INBOX por até 25 min (até o
   *   reconnect preventivo do RFC 2177).
   * - Com ciclos de 60s, o sistema sai do IDLE explicitamente, chama
   *   processarNovosEmails() (que faz search ativo) e volta. Mesmo se o
   *   evento 'exists' tiver parado, a busca direta captura o email.
   *
   * Por que NÃO faz reconnect a cada ciclo:
   * - Em vez de fechar e reabrir a conexão, usamos client.idle() pra entrar,
   *   client.noop() pra forçar sair, e voltamos pro IDLE no mesmo client.
   *   Sem race condition, sem sobrecarregar o servidor IMAP.
   *
   * Saída do loop:
   * - Atingir 24 min totais (sai pra que conectarComRetry refaça connection
   *   limpa, evitando keep-alive infinito da mesma sessão).
   * - Exception não-relacionada a "Connection closed" (propaga pra reconectar).
   * - "Connection closed" — sai pra reconnect via while loop principal.
   */
  async function iniciarIdleComTimeout() {
    const TEMPO_LIMITE_TOTAL_MS = 24 * 60 * 1000; // 24 min
    const TEMPO_IDLE_CYCLE_MS = 60 * 1000; // 60s por ciclo
    const inicioTotal = Date.now();

    if (!client || !client.mailbox) {
      throw new Error('IMAP client não pronto para IDLE');
    }

    log.info('Entrando em loop IDLE (ciclos de 60s)...');

    while (true) {
      if (!client || !client.mailbox) {
        throw new Error('IMAP client desconectado durante loop IDLE');
      }

      const elapsedTotal = Date.now() - inicioTotal;
      if (elapsedTotal >= TEMPO_LIMITE_TOTAL_MS) {
        log.info(
          { elapsedMin: Math.round(elapsedTotal / 60000) },
          'RFC 2177: tempo total de loop IDLE atingido — saindo pra reconnect preventivo'
        );
        return; // while loop principal vai reconectar limpo
      }

      ultimoHeartbeat = Date.now();

      // Inicia IDLE (não await ainda — vai resolver quando algo terminar o IDLE)
      const idlePromise = client.idle();

      // Aguarda o ciclo de 60s
      await new Promise((r) => setTimeout(r, TEMPO_IDLE_CYCLE_MS));

      // Força o IDLE a terminar enviando NOOP — ImapFlow internamente
      // envia DONE pro servidor antes do NOOP. idlePromise vai resolver.
      try {
        await client.noop();
      } catch (err) {
        // NOOP falhou — conexão pode estar quebrada
        if (err.message === 'Connection closed' || err.message?.includes('Connection')) {
          log.warn({ erro: err.message }, 'Conexão fechou durante NOOP, saindo do loop IDLE');
          throw err;
        }
        log.error({ erro: err.message }, 'Erro inesperado no NOOP do ciclo IDLE');
        // Continua mesmo com erro — vai tentar processar e re-IDLE
      }

      // Aguarda IDLE realmente terminar (evita estado intermediário)
      try {
        await idlePromise;
      } catch (err) {
        if (err.message === 'Connection closed') {
          log.info('IDLE encerrado por conexão fechada — saindo pra reconnect');
          throw err;
        }
        log.error({ erro: err.message }, 'Erro durante IDLE');
        throw err;
      }

      // Ciclo IDLE terminou (timeout ou notificação) — processa emails novos
      try {
        await processarNovosEmails();
      } catch (err) {
        log.error(
          { erro: err.message },
          'Erro ao processar emails dentro do loop IDLE — continuando'
        );
        // Não sai do loop — segue tentando no próximo ciclo
      }

      // Loop volta ao topo e reinicia IDLE
    }
  }

  /**
   * Loop principal: manter conexão IDLE com reconexão robusta
   */
  let continuarTentando = true;

  while (continuarTentando) {
    try {
      // Conectar (com retries — lança erro se falhar 5x)
      await conectarComRetry();
      // Se chegou aqui, está conectado e em IDLE (que é bloqueante até disconnect)
      // IDLE saiu (timeout ou disconnect), volta ao início para reconectar
    } catch (err) {
      log.error(
        { erro: err.message },
        'Worker falhou, tentando reconectar em 10s...'
      );
      tentativaReconexao = 0; // Reset para próxima bateria de tentativas
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

export async function startImapWorker() {
  const FUNCIONARIO_ID = process.env.PILOTO_FUNCIONARIO_ID;
  if (!FUNCIONARIO_ID) {
    log.error('PILOTO_FUNCIONARIO_ID não configurada em .env');
    process.exit(1);
  }

  log.info({ funcionarioId: FUNCIONARIO_ID }, 'Iniciando IMAP Worker...');
  await iniciarWorker();
} 