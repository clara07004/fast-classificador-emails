import { ImapFlow } from 'imapflow';
import { getLogger, mascarEmail } from '../logger.js';
import { runEnvelope } from '../envelope.js';
import {
  obterEstadoProcessamento,
  atualizarUltimoBuscado,
  atualizarStatusConexao,
  salvarClassificacao,
  listarFuncionariosAtivos,
  getConvexClient,
} from '../convex/cliente.js';
import { garantirPastasFast, moverComFallback } from './pastas.js';
import { classificarEmail } from './classificador.js';
import { analisarContextoConversa, ajustarClassificacaoPorContexto } from './thread-context.js';
import { MovimentoMonitor } from './movimento-monitor.js';
import { extrairCorpoEmail } from './sanitizador.js';
import { gerarRascunho } from '../drafts/draft-generator.js';
import { salvarRascunhoIMAP } from '../drafts/draft-saver.js';
import { SentMonitor } from '../drafts/sent-monitor.js';

const log = getLogger('imap');

// ---------------------------------------------------------------------------
// FilaProcessamento — serializa processamento de emails por worker
//
// Garante que emails de um mesmo funcionário são processados um a um,
// evitando race conditions no IMAP (messageMove em paralelo com IDLE).
// Cada WorkerState tem sua própria instância — workers diferentes são
// completamente independentes.
// ---------------------------------------------------------------------------
class FilaProcessamento {
  constructor() {
    this.promiseAtual = Promise.resolve();
  }

  enfileirar(fn) {
    this.promiseAtual = this.promiseAtual
      .then(async () => {
        try {
          return await fn();
        } catch (err) {
          log.error({ err: err.message, stack: err.stack }, 'Erro ao processar email');
          throw err;
        }
      })
      .catch(err => {
        log.error({ err: err.message }, 'Erro na fila de processamento — continuando');
      });
    return this.promiseAtual;
  }
}

// ---------------------------------------------------------------------------
// WorkerState — todo o estado mutable de um worker é encapsulado aqui.
//
// Uma instância por funcionário. Substitui as variáveis globais do design
// single-tenant anterior (client, monitorClient, estadoGlobal, etc).
// ---------------------------------------------------------------------------
class WorkerState {
  constructor(funcionario) {
    // Dados do funcionário (vêm do Convex — tabela `funcionarios`)
    this.funcionario = funcionario;

    // Conexões IMAP (3 conexões — cada uma com papel exclusivo)
    this.client = null;             // Conexão principal: INBOX IDLE + processamento + APPEND de rascunhos
    this.monitorClient = null;      // MovimentoMonitor: IDLE em Fast/* para detectar moves manuais
    this.sentMonitorClient = null;  // SentMonitor: IDLE em Enviados para capturar diff rascunho×enviado

    // Monitores de feedback
    this.movimentoMonitor = null;
    this.sentMonitor = null;

    // Fila de processamento serial — uma por worker
    this.fila = new FilaProcessamento();

    // Estado de processamento
    this.ultimoUidProcessado = 0;

    // Watchdog e controle de reconexão
    this.ultimoHeartbeat = Date.now();
    this.tentativaReconexao = 0;
    this.watchdogInterval = null;
  }

  /** Atalho para o ID do funcionário no Convex */
  get id() { return this.funcionario._id; }

  /** Nome legível para logs */
  get nome() { return this.funcionario.nome || this.funcionario.email || this.funcionario._id; }

  /**
   * Cria um cliente ImapFlow para este funcionário.
   * Usa credenciais do Convex quando disponíveis; cai no .env como fallback
   * (compatibilidade com o funcionário piloto original).
   */
  criarClienteImap() {
    const host   = this.funcionario.imapHost || process.env.IMAP_HOST;
    const port   = parseInt(this.funcionario.imapPort || process.env.IMAP_PORT, 10);
    const secure = process.env.IMAP_TLS !== 'false';
    const user   = this.funcionario.imapUser   || process.env.IMAP_USER;
    const pass   = this.funcionario.imapPassword || process.env.IMAP_PASSWORD;

    if (!user || !pass) {
      throw new Error(
        `Credenciais IMAP não configuradas para "${this.nome}". ` +
        `Adicione imapUser/imapPassword no registro Convex ou defina IMAP_USER/IMAP_PASSWORD no .env.`
      );
    }

    return new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
  }
}

// ---------------------------------------------------------------------------
// Helpers puros (sem estado)
// ---------------------------------------------------------------------------

/**
 * Registra UID como processado no Convex e atualiza o estado local.
 * Deve ser chamado ANTES de qualquer ação sobre o email (idempotência).
 */
async function registrarUidProcessado(ws, uid) {
  try {
    const resultado = await atualizarUltimoBuscado(ws.id, uid);
    if (resultado?.sucesso !== false) {
      ws.ultimoUidProcessado = Math.max(ws.ultimoUidProcessado, uid);
      log.debug({ uid, funcionarioId: ws.id }, 'UID registrado como processado');
    }
  } catch (err) {
    log.error({ err: err.message, uid, funcionarioId: ws.id }, 'Erro ao registrar UID processado');
    // Não para o processamento — melhor tentar do que desistir
  }
}

/**
 * Normaliza a mensagem do ImapFlow para o formato padrão interno.
 */
function normalizarEmail(message, uid) {
  const envelope = message.envelope || {};
  return {
    uid,
    messageId: envelope.messageId || `<${uid}@unknown>`,
    inReplyTo:  envelope.inReplyTo,
    references: envelope.references,
    from:    envelope.from?.[0]?.address || 'desconhecido',
    to:      envelope.to?.[0]?.address   || '',
    subject: envelope.subject || '(sem assunto)',
    text:    extrairCorpoEmail(message.source),
    date:    envelope.date ? new Date(envelope.date).getTime() : Date.now(),
    attachments: detectarAnexos(message),
  };
}

/**
 * Detecta anexos na estrutura MIME da mensagem.
 */
function detectarAnexos(message) {
  const anexos = [];
  if (!message.bodyStructure) return anexos;
  const struct = message.bodyStructure;
  if (Array.isArray(struct.childNodes)) {
    struct.childNodes.forEach((child) => {
      if (child.disposition === 'attachment') {
        anexos.push({ filename: child.filename || 'unknown', size: child.size || 0 });
      }
    });
  }
  return anexos;
}

// ---------------------------------------------------------------------------
// processarEmailIndividual
// ---------------------------------------------------------------------------

/**
 * Processa um único email: classifica, move, gera rascunho e salva no Convex.
 *
 * Ordem crítica (para idempotência):
 *   1. Registrar UID ANTES de qualquer ação
 *   2. Buscar do IMAP
 *   3. Classificar
 *   4. Mover para Fast/*
 *   5. Gerar rascunho (best-effort)
 *   6. Salvar em Convex
 */
async function processarEmailIndividual(ws, uid, env) {
  try {
    // 1. Registrar UID primeiro (idempotência)
    await registrarUidProcessado(ws, uid);

    // 2. Buscar email do IMAP
    let message;
    try {
      message = await ws.client.fetchOne(uid, {
        envelope: true,
        source: true,
        bodyStructure: true,
      });
    } catch (err) {
      if (err.message?.includes('no such message')) {
        log.warn({ uid, funcionarioId: ws.id }, 'Email desapareceu (deletado no servidor)');
        env.addProcessed();
        return;
      }
      throw err;
    }

    if (!message) {
      log.warn({ uid, funcionarioId: ws.id }, 'Email vazio do IMAP');
      env.addProcessed();
      return;
    }

    // 3. Normalizar
    const email = normalizarEmail(message, uid);

    if (!email.from || !email.subject) {
      log.warn({ uid, funcionarioId: ws.id }, 'Email com dados insuficientes');
      env.addProcessed();
      return;
    }

    // 4. Contexto de thread
    let contextoThread = null;
    if (email.inReplyTo || email.references) {
      contextoThread = analisarContextoConversa(email);
    }

    // 5. Classificar
    let classificacao;
    try {
      classificacao = await classificarEmail(email, { id: ws.id }, contextoThread);
    } catch (err) {
      log.error(
        { uid, funcionarioId: ws.id, remetenteDominio: mascarEmail(email.from), err: err.message },
        'Erro ao classificar — usando fallback Nível 3'
      );
      classificacao = {
        nivel: 3,
        metodo: 'fallback-error',
        reasoning: `Erro na classificação: ${err.message}`,
        confidenceScore: 0,
      };
    }

    // 6. Mover para pasta Fast/*
    const resultadoMover = await moverComFallback(ws.client, uid, classificacao.nivel);

    if (!resultadoMover.sucesso && resultadoMover.motivo === 'fallback_inbox') {
      log.warn(
        { uid, funcionarioId: ws.id, nivel: classificacao.nivel },
        'Email ficou em INBOX por falha de movimentação'
      );
    }

    // 7. Gerar rascunho (best-effort, níveis 1–4)
    let rascunhoTexto = undefined;
    if (classificacao.nivel <= 4) {
      try {
        const resultadoRascunho = await gerarRascunho(email, classificacao.nivel, {
          funcionarioId: ws.id,
        });

        if (resultadoRascunho.sucesso && resultadoRascunho.rascunho) {
          rascunhoTexto = resultadoRascunho.rascunho;

          // Usa ws.client para APPEND — neste ponto o IDLE já foi interrompido pelo NOOP
          // e moverComFallback já liberou o lock. ws.monitorClient pertence ao MovimentoMonitor
          // (IDLE em Fast/*) e não deve ser interrompido para outros usos.
          if (ws.client) {
            const emailFuncionario = ws.funcionario.imapUser || process.env.IMAP_USER;
            const resultadoSalvar = await salvarRascunhoIMAP(
              ws.client,
              email,
              rascunhoTexto,
              emailFuncionario
            );
            if (!resultadoSalvar.sucesso) {
              log.warn(
                { uid, funcionarioId: ws.id, erro: resultadoSalvar.erro },
                'Rascunho gerado mas não salvo no IMAP'
              );
            }
          }
        }
      } catch (err) {
        log.warn(
          { uid, funcionarioId: ws.id, err: err.message },
          'Falha na geração de rascunho — email processado normalmente'
        );
      }
    }

    // 8. Salvar em Convex
    try {
      await salvarClassificacao(
        ws.id,
        {
          messageId: email.messageId,
          uid,
          subject:     email.subject,
          from:        email.from,
          attachments: email.attachments,
        },
        classificacao.nivel,
        classificacao.reasoning,
        {
          idioma:          'pt-br',
          confidenceScore: classificacao.confidenceScore,
          metodo:          classificacao.metodo,
          pastaUsada:      resultadoMover.pastaUsada,
          contextoThread:  contextoThread ? 'sim' : 'nao',
          rascunho:        rascunhoTexto,
        }
      );
    } catch (err) {
      log.error(
        { uid, funcionarioId: ws.id, err: err.message },
        'Erro ao salvar em Convex (email já movido)'
      );
      // Não falha — email já foi movido, salvamento é best-effort
    }

    log.info(
      {
        uid,
        funcionarioId:    ws.id,
        remetenteDominio: mascarEmail(email.from),
        nivel:            classificacao.nivel,
        metodo:           classificacao.metodo,
        pastaUsada:       resultadoMover.pastaUsada,
        rascunhoGerado:   !!rascunhoTexto,
      },
      'Email processado com sucesso'
    );

    env.addProcessed();
  } catch (err) {
    log.error(
      { uid, funcionarioId: ws.id, err: err.message, stack: err.stack },
      'Erro inesperado ao processar email'
    );
    env.addFailed(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// processarNovosEmails
// ---------------------------------------------------------------------------

/**
 * Busca e processa todos os emails com UID > ultimoUidProcessado.
 * Encadeia processamento serial via FilaProcessamento (sem race conditions).
 */
async function processarNovosEmails(ws) {
  await runEnvelope('processar-novos-emails', async (env) => {
    if (!ws.client || !ws.client.mailbox) {
      log.warn({ funcionarioId: ws.id }, 'IMAP client não pronto');
      env.set('motivo', 'client_not_ready');
      return;
    }

    try {
      const queryRange = `${ws.ultimoUidProcessado + 1}:*`;
      const novoUIDs = await ws.client.search({ uid: queryRange });

      if (novoUIDs.length === 0) {
        log.debug({ funcionarioId: ws.id, ultimoUidProcessado: ws.ultimoUidProcessado }, 'Nenhum email novo');
        env.set('novos_uids', 0);
        return;
      }

      log.info(
        { funcionarioId: ws.id, total: novoUIDs.length, ultimoUidProcessado: ws.ultimoUidProcessado },
        `Encontrados ${novoUIDs.length} email(s) novo(s)`
      );
      env.set('novos_uids', novoUIDs.length);

      // Encadeia processamento serial — aguarda a fila esvaziar antes de retornar
      // (sem isto, o IDLE entra em paralelo e gera "Connection not available" no messageMove)
      let ultimaPromise;
      for (const uid of novoUIDs) {
        ultimaPromise = ws.fila.enfileirar(() =>
          processarEmailIndividual(ws, uid, env)
        );
      }
      if (ultimaPromise) {
        await ultimaPromise;
      }
    } catch (err) {
      log.error({ funcionarioId: ws.id, err: err.message }, 'Erro ao buscar UIDs novos');
      env.addFailed(err.message);
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// Watchdog
// ---------------------------------------------------------------------------

/**
 * Detecta IDLE morto silenciosamente (sem atividade por 30 min).
 * Força reconexão fechando o client para que o loop while externo reconecte.
 */
function iniciarWatchdog(ws) {
  if (ws.watchdogInterval) clearInterval(ws.watchdogInterval);

  ws.watchdogInterval = setInterval(() => {
    const tempoSemAtividade = Date.now() - ws.ultimoHeartbeat;

    if (tempoSemAtividade > 30 * 60 * 1000) {
      log.warn(
        { funcionarioId: ws.id, tempoSemAtividade },
        'Watchdog: nenhuma atividade detectada, reconectando...'
      );
      ws.ultimoHeartbeat = Date.now(); // evita disparo em loop
      try { ws.client?.close()?.catch?.(() => {}); } catch (_) {}
    }
  }, 60000);
}

// ---------------------------------------------------------------------------
// Loop IDLE
// ---------------------------------------------------------------------------

/**
 * Loop IDLE com ciclos de 60s.
 *
 * A cada ciclo:
 *   1. Entra em IDLE
 *   2. Aguarda 60s
 *   3. Força saída do IDLE com NOOP
 *   4. Processa emails novos (busca ativa — não depende só do evento 'exists')
 *   5. Volta ao topo
 *
 * Sai do loop após 24 min para que o while externo refaça conexão limpa (RFC 2177).
 */
async function iniciarIdleComTimeout(ws) {
  const TEMPO_LIMITE_TOTAL_MS  = 24 * 60 * 1000; // 24 min
  const TEMPO_IDLE_CYCLE_MS    = 60 * 1000;        // 60s por ciclo
  const inicioTotal = Date.now();

  if (!ws.client || !ws.client.mailbox) {
    throw new Error(`[${ws.nome}] IMAP client não pronto para IDLE`);
  }

  log.info({ funcionarioId: ws.id }, 'Entrando em loop IDLE (ciclos de 60s)...');

  while (true) {
    if (!ws.client || !ws.client.mailbox) {
      throw new Error(`[${ws.nome}] IMAP client desconectado durante loop IDLE`);
    }

    const elapsedTotal = Date.now() - inicioTotal;
    if (elapsedTotal >= TEMPO_LIMITE_TOTAL_MS) {
      log.info(
        { funcionarioId: ws.id, elapsedMin: Math.round(elapsedTotal / 60000) },
        'RFC 2177: saindo para reconnect preventivo'
      );
      return;
    }

    ws.ultimoHeartbeat = Date.now();

    const idlePromise = ws.client.idle();

    await new Promise((r) => setTimeout(r, TEMPO_IDLE_CYCLE_MS));

    try {
      await ws.client.noop();
    } catch (err) {
      if (err.message === 'Connection closed' || err.message?.includes('Connection')) {
        log.warn({ funcionarioId: ws.id, erro: err.message }, 'Conexão fechou durante NOOP');
        throw err;
      }
      log.error({ funcionarioId: ws.id, erro: err.message }, 'Erro inesperado no NOOP');
    }

    try {
      await idlePromise;
    } catch (err) {
      if (err.message === 'Connection closed') {
        log.info({ funcionarioId: ws.id }, 'IDLE encerrado por conexão fechada — reconectando');
        throw err;
      }
      log.error({ funcionarioId: ws.id, erro: err.message }, 'Erro durante IDLE');
      throw err;
    }

    try {
      await processarNovosEmails(ws);
    } catch (err) {
      log.error(
        { funcionarioId: ws.id, erro: err.message },
        'Erro ao processar emails no ciclo IDLE — continuando'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Conectar com retry
// ---------------------------------------------------------------------------

const MAX_TENTATIVAS = 5;

/**
 * Estabelece todas as conexões IMAP de um worker e inicia o loop IDLE.
 * Inclui retry com backoff exponencial (até 5 tentativas antes de escalar).
 */
async function conectarComRetry(ws) {
  try {
    log.info(
      { funcionarioId: ws.id, tentativa: ws.tentativaReconexao + 1, max: MAX_TENTATIVAS },
      `[${ws.nome}] Conectando ao IMAP...`
    );

    // Fechar conexões anteriores (se existirem)
    if (ws.sentMonitor)      { ws.sentMonitor.stop(); ws.sentMonitor = null; }
    if (ws.sentMonitorClient) {
      try { ws.sentMonitorClient.logout(); } catch (_) {}
      ws.sentMonitorClient = null;
    }
    if (ws.movimentoMonitor) { ws.movimentoMonitor.stop(); ws.movimentoMonitor = null; }
    if (ws.monitorClient) {
      try { ws.monitorClient.logout(); } catch (_) {}
      ws.monitorClient = null;
    }
    if (ws.client) {
      try { await ws.client.logout(); } catch (_) {}
      ws.client = null;
    }

    // Criar nova conexão principal
    ws.client = ws.criarClienteImap();
    await ws.client.connect();
    ws.tentativaReconexao = 0;
    log.info({ funcionarioId: ws.id }, `✓ [${ws.nome}] Conectado ao IMAP`);
    await atualizarStatusConexao(ws.id, 'conectado');

    await ws.client.mailboxOpen('INBOX');

    // Garantir pastas Fast/*
    try {
      const resultadoPastas = await garantirPastasFast(ws.client);
      if (!resultadoPastas.sucesso) {
        log.warn({ funcionarioId: ws.id }, 'Algumas pastas Fast/* não criadas, usando fallback');
      } else {
        log.info({ funcionarioId: ws.id }, '✓ Pastas Fast/* garantidas');
      }
    } catch (err) {
      log.error({ funcionarioId: ws.id, erro: err.message }, 'Erro ao garantir pastas Fast/*');
    }

    // Restaurar último UID processado
    try {
      const estado = await obterEstadoProcessamento(ws.id);
      if (estado?.ultimoUidProcessado > 0) {
        ws.ultimoUidProcessado = estado.ultimoUidProcessado;
        log.info({ funcionarioId: ws.id, ultimoUid: estado.ultimoUidProcessado }, '✓ Estado restaurado');
      }
    } catch (err) {
      log.warn({ funcionarioId: ws.id, erro: err.message }, 'Estado não encontrado, começando do zero');
    }

    // Processar emails que chegaram enquanto desconectado
    try {
      await processarNovosEmails(ws);
      log.info({ funcionarioId: ws.id }, '✓ Emails pendentes processados');
    } catch (err) {
      log.error({ funcionarioId: ws.id, erro: err.message }, 'Erro ao processar emails pendentes');
    }

    // Listener de heartbeat para o watchdog
    ws.client.on('exists', (data) => {
      log.debug({ funcionarioId: ws.id, count: data.count }, '📬 Notificação IMAP IDLE recebida');
      ws.ultimoHeartbeat = Date.now();
    });

    // MovimentoMonitor — conexão própria para não interromper o IDLE
    try {
      ws.monitorClient = ws.criarClienteImap();
      await ws.monitorClient.connect();
      ws.movimentoMonitor = new MovimentoMonitor(ws.monitorClient, getConvexClient());
      await ws.movimentoMonitor.start();
      log.info({ funcionarioId: ws.id }, '✓ MovimentoMonitor iniciado');
    } catch (err) {
      log.warn({ funcionarioId: ws.id, erro: err.message }, 'MovimentoMonitor não iniciou — feedback loop desativado');
      ws.movimentoMonitor = null;
      if (ws.monitorClient) {
        try { ws.monitorClient.logout(); } catch (_) {}
        ws.monitorClient = null;
      }
    }

    // SentMonitor — conexão própria (independente do MovimentoMonitor)
    try {
      ws.sentMonitorClient = ws.criarClienteImap();
      await ws.sentMonitorClient.connect();
      ws.sentMonitor = new SentMonitor(ws.sentMonitorClient, getConvexClient(), ws.id);
      await ws.sentMonitor.start();
      log.info({ funcionarioId: ws.id }, '✓ SentMonitor iniciado');
    } catch (err) {
      log.warn({ funcionarioId: ws.id, erro: err.message }, 'SentMonitor não iniciou — diff desativado');
      ws.sentMonitor = null;
      if (ws.sentMonitorClient) {
        try { ws.sentMonitorClient.logout(); } catch (_) {}
        ws.sentMonitorClient = null;
      }
    }

    // Watchdog + loop IDLE
    iniciarWatchdog(ws);
    await iniciarIdleComTimeout(ws);

  } catch (err) {
    ws.tentativaReconexao++;

    // Observabilidade: resposta real do servidor IMAP (ImapFlow expõe estes campos no erro)
    const detalheImap = {
      code: err.code,
      responseText: err.responseText,
      serverResponseCode: err.serverResponseCode,
      authenticationFailed: err.authenticationFailed,
      responseStatus: err.responseStatus,
    };

    if (ws.tentativaReconexao > MAX_TENTATIVAS) {
      log.error(
        { funcionarioId: ws.id, tentativas: ws.tentativaReconexao, erro: err.message, ...detalheImap },
        `❌ [${ws.nome}] Falha após ${MAX_TENTATIVAS} tentativas`
      );
      ws.tentativaReconexao = 0;
    } else {
      const delay = Math.min(30000, 1000 * Math.pow(2, ws.tentativaReconexao - 1));
      log.warn(
        { funcionarioId: ws.id, tentativa: ws.tentativaReconexao, delay_ms: delay, erro: err.message, ...detalheImap },
        `[${ws.nome}] Reconectando em ${delay}ms...`
      );
      await new Promise(r => setTimeout(r, delay));
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker por funcionário — loop principal de reconexão
// ---------------------------------------------------------------------------

/**
 * Mantém um worker IMAP vivo indefinidamente para um funcionário.
 * Reconecta automaticamente em caso de falha.
 */
async function iniciarWorkerParaFuncionario(ws) {
  log.info({ funcionarioId: ws.id, nome: ws.nome }, `Iniciando worker para ${ws.nome}...`);

  while (true) {
    try {
      await conectarComRetry(ws);
      // conectarComRetry só retorna quando o loop IDLE sai (timeout 24 min ou desconexão)
      // O while volta ao topo para reconectar
    } catch (err) {
      log.error(
        { funcionarioId: ws.id, erro: err.message },
        `[${ws.nome}] Worker falhou, tentando reconectar em 10s...`
      );
      ws.tentativaReconexao = 0;
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Inicia workers IMAP para todos os funcionários ativos no Convex.
 *
 * Fluxo:
 * 1. Carrega lista de funcionários ativos do Convex (com credenciais IMAP)
 * 2. Fallback: se Convex não retornar ninguém, usa PILOTO_FUNCIONARIO_ID do .env
 * 3. Cria um WorkerState por funcionário
 * 4. Inicia um loop de reconexão independente por funcionário
 * 5. Mantém o processo vivo indefinidamente
 */
export async function startImapWorker() {
  // 1. Carregar funcionários do Convex
  let funcionarios;
  try {
    funcionarios = await listarFuncionariosAtivos();
  } catch (err) {
    log.error({ err: err.message }, 'Falha ao carregar funcionários do Convex');
    throw err;
  }

  // 2. Fallback para o piloto via .env (compatibilidade com deploy existente)
  if (!funcionarios || funcionarios.length === 0) {
    const pilotoId = process.env.PILOTO_FUNCIONARIO_ID;
    if (pilotoId) {
      log.warn(
        { pilotoId },
        'Nenhum funcionário ativo no Convex — usando PILOTO_FUNCIONARIO_ID do .env como fallback. ' +
        'Adicione credenciais IMAP ao registro no Convex para usar o modo multi-tenant.'
      );
      funcionarios = [{
        _id:   pilotoId,
        nome:  'Piloto',
        email: process.env.IMAP_USER || '',
        ativo: true,
        // Sem imapUser/imapPassword → criarClienteImap() usa .env
      }];
    } else {
      log.error(
        'Nenhum funcionário ativo encontrado no Convex e PILOTO_FUNCIONARIO_ID não configurado. ' +
        'Configure pelo menos um funcionário antes de iniciar o worker.'
      );
      process.exit(1);
    }
  }

  log.info({ total: funcionarios.length }, `Iniciando ${funcionarios.length} worker(s) IMAP...`);

  // 3. Iniciar um worker por funcionário (fire-and-forget — cada um tem seu próprio loop)
  for (const f of funcionarios) {
    const ws = new WorkerState(f);
    iniciarWorkerParaFuncionario(ws).catch(err => {
      // Só chega aqui se o loop while interno quebrar — não deveria acontecer
      log.error(
        { funcionarioId: f._id, err: err.message },
        'Worker encerrou inesperadamente — processo pode precisar de restart'
      );
    });
  }

  // 4. Manter processo vivo (workers rodam em background)
  await new Promise(() => {});
}
