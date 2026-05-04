/**
 * Smoke tests — garantem que módulos básicos importam e logger/envelope funcionam.
 */

import { describe, it, expect } from 'vitest';
import { getLogger } from '../src/logger.js';
import { runEnvelope, ExecutionEnvelope } from '../src/envelope.js';

describe('logger', () => {
  it('retorna logger com binding de módulo', () => {
    const log = getLogger('test');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
  });
});

describe('envelope', () => {
  it('processa execução de sucesso', async () => {
    const result = await runEnvelope('test-sucesso', async (env) => {
      env.addProcessed(5);
      env.set('origem', 'teste');
      return env.toObject();
    });

    expect(result.processed).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.metadata.origem).toBe('teste');
  });

  it('propaga exceção e marca falha', async () => {
    await expect(
      runEnvelope('test-falha', async (env) => {
        env.addProcessed(1);
        throw new Error('erro proposital');
      }),
    ).rejects.toThrow('erro proposital');
  });

  it('mede duração', () => {
    const env = new ExecutionEnvelope('teste');
    expect(env.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(env.runId).toHaveLength(8);
  });
});
