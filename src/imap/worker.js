import { ImapFlow } from 'imapflow';
import { getLogger } from '../logger.js';

const log = getLogger('imap');
const INTERVALO_RECONEXAO_PREVENTIVA = 28 * 60 * 1000;

let client = null;
let timerReconexao = null;

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
    await client.mailboxOpen('INBOX');
    log.info('INBOX aberta — monitorando via IMAP IDLE');

    client.on('exists', async (data) => {
      log.info({ data }, 'Novo email detectado');
      await processarNovosEmails();
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

async function processarNovosEmails() {
  log.info('Email detectado — processamento a implementar nas próximas tasks');
}

export async function startImapWorker() {
  criarConexao(); // dispara sem await — event loop mantém o processo vivo
  await new Promise(() => {}); // mantém o envelope aberto indefinidamente
}
