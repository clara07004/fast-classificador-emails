import { ImapFlow } from 'imapflow';
import { getLogger } from '../logger.js';
import {
  obterEstadoProcessamento,
  atualizarUltimoBuscado,
  atualizarStatusConexao,
} from '../convex/cliente.js';
import { garantirPastasFast, moverComFallback } from './pastas.js';

const log = getLogger('imap');
const INTERVALO_RECONEXAO_PREVENTIVA = 28 * 60 * 1000;

let client = null;
let timerReconexao = null;

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

async function criarConexao() {
  if (timerReconexao) { clearTimeout(timerReconexao); timerReconexao = null; }

  log.info('Tentando conectar ao servidor IMAP...');

  client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10),
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASSWORD,
    },
    logger: false,
  });

  client.on('error', (err) => {
    log.error({ err: err.message }, 'Erro na conexão IMAP');
    agendarReconexao(5000);
  });

  try {
    await client.connect();
    log.info('Conectado com sucesso ao servidor IMAP');
    await atualizarStatusConexao(estadoGlobal.funcionarioId, 'conectado');

    await client.mailboxOpen('INBOX');
    log.info('INBOX aberta — monitorando via IMAP IDLE');

    // Garantir que pastas Fast/* existem (primeira conexão ou após admin deletar)
    try {
      const resultadoPastas = await garantirPastasFast(client);
      if (!resultadoPastas.sucesso) {
        log.warn(
          { detalhes: resultadoPastas.pastas },
          'Aviso: Algumas pastas Fast/* não puderam ser criadas. Movimentação pode falhar.'
        );
      }
    } catch (err) {
      log.error({ err: err.message }, 'Erro crítico ao garantir pastas Fast/*');
      // Continua mesmo assim — fallback em moverComFallback vai proteger
    }

    // Restaurar estado de processamento da reconexão anterior
    try {
      const estado = await obterEstadoProcessamento(estadoGlobal.funcionarioId);
      if (estado && estado.ultimoUidProcessado > 0) {
        estadoGlobal.ultimoUidProcessado = estado.ultimoUidProcessado;
        log.info(
          { ultimoUidProcessado: estado.ultimoUidProcessado },
          'Estado restaurado após reconexão — buscando apenas UIDs novos'
        );
      }
    } catch (err) {
      log.warn({ err: err.message }, 'Não consegui restaurar estado, começando do zero');
      estadoGlobal.ultimoUidProcessado = 0;
    }

    client.on('exists', (data) => {
      log.info({ data }, 'Novo email detectado');
      // Enfileirar sem await — permite que o próximo 'exists' chegue e se fila também
      filaProcessamento.enfileirar(() => processarNovosEmails());
    });

    await iniciarIdle();
    agendarReconexaoPreventiva();

  } catch (err) {
    log.error({ err: err.message }, 'Falha ao conectar ao servidor IMAP');
    agendarReconexao(10000);
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

function agendarReconexao(delay = 5000) {
  if (timerReconexao) clearTimeout(timerReconexao);
  log.info({ delay_ms: delay }, 'Reagendando conexão...');
  timerReconexao = setTimeout(criarConexao, delay);
}

function agendarReconexaoPreventiva() {
  if (timerReconexao) clearTimeout(timerReconexao);
  const proxima = new Date(Date.now() + INTERVALO_RECONEXAO_PREVENTIVA).toISOString();
  log.info({ proxima_reconexao: proxima }, 'Reconexão preventiva agendada para 28 min');

  timerReconexao = setTimeout(async () => {
    log.info('Executando reconexão preventiva...');
    try { await client.logout(); } catch (_e) { /* ignora */ }
    await criarConexao();
  }, INTERVALO_RECONEXAO_PREVENTIVA);
}

/**
 * Processar novos emails
 *
 * ORDEM CRÍTICA DE OPERAÇÕES (para garantir idempotência):
 * 1. Registrar UID como processado (ANTES de qualquer coisa)
 * 2. Buscar email do IMAP (sempre vai ter, foi visto em 'exists')
 * 3. Normalizar dados
 * 4. Classificar (Claude API)
 * 5. Mover para pasta Fast/*
 * 6. Criar rascunho
 * 7. Salvar em Convex
 *
 * Se falhar em qualquer passo:
 * - UID já está registrado em Convex
 * - Na reconexão, busca apenas UIDs > ultimoUidProcessado
 * - Máximo reprocessa 2x (safe)
 */
async function processarNovosEmails() {
  const runId = Math.random().toString(36).slice(2, 8);
  log.info({ run_id: runId }, 'Iniciando processamento de novos emails');

  try {
    // PLACEHOLDER: Será implementado nas próximas tasks
    // Aqui vai: buscar novos emails, classificar, mover, salvar em Convex

    // Exemplo de fluxo (pseudocódigo):
    // const emails = await client.search({
    //   uid: [`${estadoGlobal.ultimoUidProcessado + 1}:*`]
    // });
    //
    // for (const { uid, source } of emails) {
    //   // ANTES de qualquer coisa, registrar como processado
    //   await registrarUidProcessado(uid);
    //
    //   // Depois: normalizar, classificar, mover, etc
    //   const email = normalizar(source);
    //   const classificacao = await classificarComClaude(email);
    //   await moverParaPasta(uid, classificacao.pasta);
    //   await salvarEmConvex({ uid, email, classificacao });
    // }

    log.info({ run_id: runId, ultimoUidProcessado: estadoGlobal.ultimoUidProcessado }, 'Processamento concluído (stub)');
  } catch (err) {
    log.error({ run_id: runId, err: err.message }, 'Falha ao processar emails');
    throw err;
  }
}

export async function startImapWorker() {
  criarConexao(); // dispara sem await — event loop mantém o processo vivo
  await new Promise(() => {}); // mantém o envelope aberto indefinidamente
}
