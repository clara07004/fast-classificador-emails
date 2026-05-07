import 'dotenv/config';
import { runEnvelope } from './envelope.js';
import { getLogger } from './logger.js';
import { inicializarConvex } from './convex/cliente.js';
import { startImapWorker } from './imap/worker.js';

const log = getLogger('main');

async function main() {
  await runEnvelope('classificador-emails-main', async (_env) => {
    log.info('Classificador de emails iniciado');

    // Inicializar Convex ANTES de iniciar o worker IMAP
    try {
      await inicializarConvex();
      log.info('✓ Convex inicializado');
    } catch (err) {
      log.error({ err: err.message }, 'Falha ao inicializar Convex');
      throw err;
    }

    await startImapWorker();
  });
}

main().catch((err) => {
  log.fatal({ err }, 'Falha fatal — encerrando processo');
  process.exit(1);
});
