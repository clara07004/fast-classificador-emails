/**
 * Ponto de entrada do classificador de emails.
 *
 * Uso:
 *   npm start          → produção
 *   npm run dev        → desenvolvimento (hot reload)
 */

import 'dotenv/config';

import { runEnvelope } from './envelope.js';
import { getLogger } from './logger.js';

const log = getLogger('main');

async function main() {
  await runEnvelope('classificador-emails-main', async (_env) => {
    log.info('Classificador de emails iniciado');

    // TODO (T08): iniciar worker IMAP com ImapFlow
    // import { startImapWorker } from './imap/worker.js';
    // await startImapWorker();

    log.info('Worker aguardando emails via IMAP IDLE...');
  });
}

main().catch((err) => {
  log.fatal({ err }, 'Falha fatal — encerrando processo');
  process.exit(1);
});
