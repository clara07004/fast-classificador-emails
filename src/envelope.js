/**
 * Envelope de execução — padrão pra toda execução de automação.
 *
 * Garante que toda execução tenha:
 * - timestamp de início e fim
 * - duração
 * - status (ok / error)
 * - contagem de itens processados
 * - run_id único (rastreável em logs)
 *
 * Uso:
 *   import { runEnvelope } from './envelope.js';
 *
 *   await runEnvelope('triagem-emails', async (env) => {
 *     for (const item of itens) {
 *       try {
 *         await processar(item);
 *         env.addProcessed();
 *       } catch (err) {
 *         env.addFailed(err.message);
 *       }
 *     }
 *   });
 */

import { randomUUID } from 'node:crypto';
import { getLogger } from './logger.js';

const log = getLogger('envelope');

class ExecutionEnvelope {
  constructor(name) {
    this.name = name;
    this.runId = randomUUID().slice(0, 8);
    this.startTime = Date.now();
    this.endTime = null;
    this.processed = 0;
    this.failed = 0;
    this.errors = [];
    this.metadata = {};
  }

  get durationSeconds() {
    const end = this.endTime ?? Date.now();
    return Math.round((end - this.startTime) / 10) / 100;
  }

  addProcessed(n = 1) {
    this.processed += n;
  }

  addFailed(error = null, n = 1) {
    this.failed += n;
    if (error) this.errors.push(String(error));
  }

  set(key, value) {
    this.metadata[key] = value;
  }

  toObject() {
    return {
      envelope: this.name,
      run_id: this.runId,
      duration_seconds: this.durationSeconds,
      processed: this.processed,
      failed: this.failed,
      errors: this.errors.slice(0, 5),
      metadata: this.metadata,
    };
  }
}

/**
 * Executa uma função dentro de um envelope.
 * Retorna o que a função retornar. Re-lança exceção se houver.
 *
 * @param {string} name
 * @param {(env: ExecutionEnvelope) => Promise<any>} fn
 */
export async function runEnvelope(name, fn) {
  const env = new ExecutionEnvelope(name);
  log.info({ envelope: name, run_id: env.runId }, 'Envelope iniciado');

  try {
    const result = await fn(env);
    env.endTime = Date.now();
    log.info({ ...env.toObject(), status: 'ok' }, 'Envelope concluído com sucesso');
    return result;
  } catch (err) {
    env.endTime = Date.now();
    env.addFailed(err?.message);
    log.error(
      { ...env.toObject(), status: 'error', stack: err?.stack },
      'Envelope concluído com erro',
    );
    throw err;
  }
}

export { ExecutionEnvelope };
