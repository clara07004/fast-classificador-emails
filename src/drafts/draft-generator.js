/**
 * Gerador de Rascunhos via Claude API
 *
 * Gera rascunho de resposta para emails classificados nos níveis 1–4.
 * Nível 5 (irrelevante) não gera rascunho.
 *
 * Garantias:
 * ✓ Falha silenciosa — se Claude falhar, processamento do email continua
 * ✓ Timeout de 20s — mais leniente que classificação (rascunho é assíncrono)
 * ✓ Não bloqueia movimentação do email para pasta correta
 */

import Anthropic from '@anthropic-ai/sdk';
import { construirPromptRascunho, systemPromptRascunho } from './prompts/rascunho-v1.js';
import { getLogger } from '../logger.js';

const log = getLogger('draft-generator');

const TIMEOUT_RASCUNHO_MS = 20000; // 20s — mais leniente que classificação
const MODELO_RASCUNHO = 'claude-sonnet-4-5'; // Sonnet: mais rápido e barato que Opus para rascunhos

let claude = null;

function obterClienteClaude() {
  if (claude) return claude;
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY ou ANTHROPIC_API_KEY não configurada em .env');
  }
  claude = new Anthropic({ apiKey });
  return claude;
}

/**
 * Gerar rascunho de resposta para um email.
 *
 * @param {Object} email - Email normalizado {from, subject, text, messageId}
 * @param {number} nivel - Nível de prioridade classificado (1–5)
 * @param {Object} [opcoes] - Opções adicionais
 * @param {Object} [opcoes.styleCard] - Style card do funcionário (Fase 2)
 * @param {string} [opcoes.funcionarioId] - ID do funcionário (para log)
 *
 * @returns {Promise<{
 *   sucesso: boolean,
 *   rascunho?: string,
 *   motivo?: string,    // por que não gerou (nível 5, timeout, erro)
 *   tempoMs: number
 * }>}
 */
export async function gerarRascunho(email, nivel, opcoes = {}) {
  const inicioMs = Date.now();
  const { styleCard = null, funcionarioId = null } = opcoes;

  // Nível 5 = irrelevante — sem rascunho
  if (nivel === 5) {
    return {
      sucesso: false,
      motivo: 'nivel-5-irrelevante',
      tempoMs: 0,
    };
  }

  if (nivel < 1 || nivel > 4) {
    return {
      sucesso: false,
      motivo: `nivel-invalido:${nivel}`,
      tempoMs: 0,
    };
  }

  try {
    const prompt = construirPromptRascunho(email, nivel, styleCard);
    const clienteClaude = obterClienteClaude();

    // Timeout via Promise.race
    const respostaPromise = clienteClaude.messages.create({
      model: MODELO_RASCUNHO,
      max_tokens: 600,
      system: systemPromptRascunho(),
      messages: [{ role: 'user', content: prompt }],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Timeout ao gerar rascunho')),
        TIMEOUT_RASCUNHO_MS
      )
    );

    const resposta = await Promise.race([respostaPromise, timeoutPromise]);
    const rascunho = resposta.content[0]?.text?.trim();

    if (!rascunho) {
      throw new Error('Claude retornou rascunho vazio');
    }

    log.info(
      {
        nivel,
        funcionarioId,
        tempoMs: Date.now() - inicioMs,
        chars: rascunho.length,
      },
      'Rascunho gerado com sucesso'
    );

    return {
      sucesso: true,
      rascunho,
      tempoMs: Date.now() - inicioMs,
    };
  } catch (err) {
    const ehTimeout = err.message?.includes('Timeout') || err.code === 'ABORT_ERR';

    log.warn(
      {
        nivel,
        funcionarioId,
        erro: err.message,
        timeout: ehTimeout,
        tempoMs: Date.now() - inicioMs,
      },
      ehTimeout
        ? 'Timeout ao gerar rascunho — email processado sem rascunho'
        : 'Erro ao gerar rascunho — email processado sem rascunho'
    );

    return {
      sucesso: false,
      motivo: ehTimeout ? 'timeout' : `erro:${err.message}`,
      tempoMs: Date.now() - inicioMs,
    };
  }
}
