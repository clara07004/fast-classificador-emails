import 'dotenv/config';
import { runEnvelope } from './envelope.js';
import { getLogger } from './logger.js';
import { startImapWorker } from './imap/worker.js';

const log = getLogger('main');

async function main() {
  await runEnvelope('classificador-emails-main', async (_env) => {
    log.info('Classificador de emails iniciado');
    await startImapWorker();
  });
}

main().catch((err) => {
  log.fatal({ err }, 'Falha fatal — encerrando processo');
  process.exit(1);
});
