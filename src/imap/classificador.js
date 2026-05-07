/**
 * Classificador de Emails com Claude API
 *
 * Fluxo:
 * 1. Tenta classificar SEM IA (padrões determinísticos)
 * 2. Se falha, chama Claude com timeout de 5s
 * 3. Se Claude falha, fallback para Nível 3 (Normal)
 * 4. Ajusta por contexto de thread (se é resposta)
 *
 * Tracking:
 * - Conta chamadas a Claude (para monitorar quota)
 * - Log de timeouts e fallbacks
 */

import Anthropic from '@anthropic-ai/sdk';
import { tentarClassificarSemIA } from './pre-classificador.js';
import {
  analisarContextoConversa,
  ajustarClassificacaoPorContexto,
} from './thread-context.js';
import { getLogger } from '../logger.js';

const log = getLogger('classificador');

// Criar cliente Anthropic
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

// Tracking de uso
let contador = {
  total: 0,
  preClassificador: 0,
  claudeAPI: 0,
  fallback: 0,
  timeout: 0,
};

const TIMEOUT_CLAUDE = 5000; // 5 segundos
const MAX_TENTATIVAS = 2;

/**
 * Classificar um email
 *
 * @param {Object} email - Email normalizado (from, subject, text, messageId, etc)
 * @param {Object} funcionario - Dados do funcionário (id, email, areas)
 * @param {Object} contexto - (Opcional) Contexto de thread (de analisarContextoConversa)
 *
 * @returns {Promise<{
 *   nivel: 1-5,
 *   metodo: 'pre-classificador' | 'claude-api' | 'fallback',
 *   reasoning: string,
 *   tempoMs: number,
 *   confidenceScore?: number
 * }>}
 */
export async function classificarEmail(email, funcionario, contexto = null) {
  const inicioMs = Date.now();
  contador.total++;

  try {
    // Validar email
    if (!email || !email.from || !email.subject) {
      log.warn({ email }, 'Email inválido para classificação');
      return {
        nivel: 3,
        metodo: 'fallback',
        reasoning: 'Email inválido (faltam campos)',
        tempoMs: Date.now() - inicioMs,
        confidenceScore: 0,
      };
    }

    // 1. Tentar classificar SEM IA
    const preClassificacao = await tentarClassificarSemIA(email, funcionario);
    if (preClassificacao.classificado) {
      contador.preClassificador++;
      let nivelFinal = preClassificacao.nivel;

      // Ajustar por contexto se houver
      if (contexto) {
        nivelFinal = ajustarClassificacaoPorContexto(
          nivelFinal,
          contexto,
          null
        );
      }

      log.debug(
        {
          from: email.from,
          subject: email.subject,
          nivel: nivelFinal,
          motivo: preClassificacao.motivo,
          tempoMs: Date.now() - inicioMs,
        },
        'Email classificado pelo pré-classificador'
      );

      return {
        nivel: nivelFinal,
        metodo: 'pre-classificador',
        reasoning: `${preClassificacao.motivo}: ${preClassificacao.nivel}`,
        tempoMs: Date.now() - inicioMs,
        confidenceScore: 1.0, // Padrões determinísticos tem 100% confiança
      };
    }

    // 2. Chamar Claude API com timeout e retry
    const resultadoClassificacao = await classificarComClaude(
      email,
      funcionario,
      contexto
    );

    if (resultadoClassificacao.sucesso) {
      contador.claudeAPI++;
      log.debug(
        {
          from: email.from,
          subject: email.subject,
          nivel: resultadoClassificacao.nivel,
          confidence: resultadoClassificacao.confidence,
          tempoMs: resultadoClassificacao.tempoMs,
        },
        'Email classificado pela Claude API'
      );

      return {
        nivel: resultadoClassificacao.nivel,
        metodo: 'claude-api',
        reasoning: resultadoClassificacao.reasoning,
        tempoMs: resultadoClassificacao.tempoMs,
        confidenceScore: resultadoClassificacao.confidence,
      };
    }

    // 3. Fallback: Nível 3 (Normal)
    contador.fallback++;
    if (resultadoClassificacao.timeout) {
      contador.timeout++;
      log.warn(
        {
          from: email.from,
          subject: email.subject,
          erro: 'Timeout na Claude API',
          tempoMs: Date.now() - inicioMs,
        },
        'Fallback por timeout — Nível 3'
      );
    } else {
      log.error(
        {
          from: email.from,
          subject: email.subject,
          erro: resultadoClassificacao.erro,
          tempoMs: Date.now() - inicioMs,
        },
        'Fallback por erro na Claude API — Nível 3'
      );
    }

    return {
      nivel: 3,
      metodo: 'fallback',
      reasoning: `Falha em Claude: ${resultadoClassificacao.erro || 'timeout'}`,
      tempoMs: Date.now() - inicioMs,
      confidenceScore: 0.3, // Fallback tem baixa confiança
    };
  } catch (err) {
    log.error(
      {
        from: email?.from,
        subject: email?.subject,
        erro: err.message,
        stack: err.stack,
      },
      'Erro inesperado ao classificar email'
    );

    contador.fallback++;
    return {
      nivel: 3,
      metodo: 'fallback',
      reasoning: `Erro inesperado: ${err.message}`,
      tempoMs: Date.now() - inicioMs,
      confidenceScore: 0,
    };
  }
}

/**
 * Chamar Claude API com timeout e retry
 * @private
 */
async function classificarComClaude(email, funcionario, contexto) {
  const inicioMs = Date.now();

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    try {
      const prompt = construirPrompt(email, funcionario, contexto);

      // Usar AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TIMEOUT_CLAUDE
      );

      let resposta;
      try {
        const clienteClaude = obterClienteClaude();
        resposta = await Promise.race([
          clienteClaude.messages.create(
            {
              model: 'claude-opus-4-7',
              max_tokens: 300,
              system:
                'Você é assistente especialista em triagem de emails para Fast Sistemas Construtivos. Classifique com precisão em 1-5. Responda APENAS no formato especificado.',
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            },
            { signal: controller.signal }
          ),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Timeout Claude API')),
              TIMEOUT_CLAUDE + 500
            )
          ),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      // Extrair resposta
      const textoResposta = resposta.content[0].text;
      const { nivel, reasoning } = extrairNivelDaResposta(textoResposta);

      // Validar nível
      if (!nivel || nivel < 1 || nivel > 5) {
        throw new Error(
          `Nível inválido extraído: ${nivel}. Resposta: ${textoResposta}`
        );
      }

      // Ajustar por contexto se houver
      let nivelFinal = nivel;
      if (contexto) {
        nivelFinal = ajustarClassificacaoPorContexto(
          nivel,
          contexto,
          null
        );
      }

      return {
        sucesso: true,
        nivel: nivelFinal,
        reasoning: reasoning || textoResposta,
        confidence: extrairConfidence(textoResposta),
        tempoMs: Date.now() - inicioMs,
      };
    } catch (err) {
      const ehTimeout = err.message?.includes('Timeout') || err.code === 'ABORT_ERR';

      if (ehTimeout && tentativa < MAX_TENTATIVAS - 1) {
        log.warn(
          { tentativa, erro: err.message },
          'Timeout na Claude API, tentando novamente...'
        );
        await new Promise((resolve) => setTimeout(resolve, 500)); // Pequeno delay antes de retry
        continue;
      }

      // Última tentativa falhou ou é erro permanente
      return {
        sucesso: false,
        timeout: ehTimeout,
        erro: err.message || 'Erro desconhecido',
        tempoMs: Date.now() - inicioMs,
      };
    }
  }

  return {
    sucesso: false,
    timeout: true,
    erro: 'Timeout após retries',
    tempoMs: Date.now() - inicioMs,
  };
}

/**
 * Construir prompt para Claude
 * @private
 */
function construirPrompt(email, funcionario, contexto) {
  const { subject, from, text } = email;
  const corpoTruncado = (text || '').substring(0, 800);

  let prompt = `Classifique o email em um dos 5 níveis:

1 = URGENTE — Cliente em risco, problema crítico, ação imediata necessária
2 = IMPORTANTE — Projeto em andamento, decisão necessária, follow-up ativo
3 = NORMAL — Informação padrão, sem urgência, pode aguardar
4 = BAIXA — Comunicado informativo, referência
5 = FYI — Boletim, notificação passiva, apenas leitura

Email:
De: ${from}
Assunto: ${subject}
Corpo (primeiras linhas):
${corpoTruncado}
---

Responda APENAS neste formato:
Nível: [1-5]
Reasoning: [explicação em 1 frase]`;

  // Adicionar contexto de thread se houver
  if (contexto && contexto.isResposta) {
    prompt += `

Contexto: Este email é uma resposta em uma conversa com ${contexto.profundidadeThread} mensagens.`;
  }

  return prompt;
}

/**
 * Extrair nível da resposta de Claude
 * @private
 */
function extrairNivelDaResposta(resposta) {
  // Procurar "Nível: X"
  const matchNivel = resposta.match(/Nível:\s*(\d)/i);
  let nivel = parseInt(matchNivel?.[1] || '3');
  nivel = Math.max(1, Math.min(5, nivel)); // Clamp 1-5

  // Extrair reasoning (resto da resposta)
  const matchReasoning = resposta.match(/Reasoning:\s*(.+?)$/im);
  const reasoning = matchReasoning?.[1]?.trim() || resposta;

  return { nivel, reasoning };
}

/**
 * Tentar extrair confidence score da resposta (opcional)
 * @private
 */
function extrairConfidence(resposta) {
  const match = resposta.match(/confidence[:\s]+(\d\.?\d*)/i);
  const score = parseFloat(match?.[1] || '0.7');
  return Math.max(0, Math.min(1, score));
}

/**
 * Obter estatísticas de classificação
 */
export function obterEstatisticas() {
  return {
    ...contador,
    percentualPreClassificador:
      contador.total > 0
        ? ((contador.preClassificador / contador.total) * 100).toFixed(1) +
          '%'
        : '0%',
    percentualFallback:
      contador.total > 0
        ? ((contador.fallback / contador.total) * 100).toFixed(1) + '%'
        : '0%',
    percentualTimeout:
      contador.total > 0
        ? ((contador.timeout / contador.total) * 100).toFixed(1) + '%'
        : '0%',
  };
}

/**
 * Resetar estatísticas (para testes)
 */
export function resetarEstatisticas() {
  contador = {
    total: 0,
    preClassificador: 0,
    claudeAPI: 0,
    fallback: 0,
    timeout: 0,
  };
}
