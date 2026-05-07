/**
 * Cliente Convex para o Worker IMAP
 *
 * Implementação real usando ConvexClient e API gerada.
 */

import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { getLogger } from "../logger.js";

const log = getLogger("convex-client");

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60000; // 60s — Convex pode ser muito lento, especialmente em cold starts

let clienteGlobal = null;

/**
 * Fazer chamada ao Convex com retry e timeout
 *
 * @param {function} funcaoApi - Referência da API (ex: api.estado.obterEstado)
 * @param {object} args - Argumentos da função
 * @param {boolean} ehMutation - true para mutations, false para queries
 * @returns {Promise<object>}
 */
async function chamarConvex(funcaoApi, args, ehMutation = false) {
  if (!clienteGlobal) {
    throw new Error("Cliente Convex não inicializado");
  }

  for (let tentativa = 0; tentativa < MAX_RETRIES; tentativa++) {
    try {
      // Usar query para queries e mutation para mutations
      const promise = ehMutation
        ? clienteGlobal.mutation(funcaoApi, args)
        : clienteGlobal.query(funcaoApi, args);

      // Usar Promise.race para timeout robusto
      const resultado = await Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout ao chamar Convex")),
            TIMEOUT_MS
          )
        ),
      ]);

      return resultado;
    } catch (err) {
      const ehTimeout = err.message?.includes("Timeout");
      const ehRetentavel =
        ehTimeout || err.message?.includes("ECONNREFUSED");

      if (tentativa < MAX_RETRIES - 1 && ehRetentavel) {
        const delay = Math.pow(2, tentativa) * 1000; // Backoff exponencial
        log.warn(
          { tentativa, delay, erro: err.message },
          "Convex falhou, tentando novamente..."
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      log.error(
        { tentativa, erro: err.message, args },
        "Erro ao chamar Convex após retries"
      );
      throw err;
    }
  }
}

/**
 * Inicializar cliente Convex
 *
 * Cria instância do cliente e valida conexão.
 */
export async function inicializarConvex() {
  try {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error("CONVEX_URL não configurada em .env");
    }

    log.info(
      { url },
      "Inicializando cliente Convex..."
    );

    clienteGlobal = new ConvexClient(url);

    // Teste de conexão simples com ID fake (vai falhar, mas prova que API responde)
    try {
      await chamarConvex(api.estado.obterEstado, {
        funcionarioId: "test-conexao-xyz",
      });
    } catch (err) {
      // Esperado falhar com ID fake, mas prova que API está acessível
      if (err.message?.includes("Could not find")) {
        log.debug("Teste de conexão: API respondeu conforme esperado");
      } else {
        log.warn({ erro: err.message }, "Aviso durante teste de conexão");
      }
    }

    log.info("Cliente Convex inicializado com sucesso");
    return true;
  } catch (err) {
    log.error(
      { erro: err.message },
      "Falha ao inicializar Convex"
    );
    throw err;
  }
}

/**
 * Obter estado de processamento IMAP
 *
 * Retorna último UID processado para buscar apenas novos emails.
 * @param {string} funcionarioId - ID do funcionário
 * @returns {Promise<{ultimoUidProcessado: number, statusConexao: string}>}
 */
export async function obterEstadoProcessamento(funcionarioId) {
  try {
    const resultado = await chamarConvex(api.estado.obterEstado, {
      funcionarioId,
    });

    log.debug(
      { funcionarioId, ultimoUid: resultado.ultimoUidProcessado },
      "Estado obtido"
    );
    return resultado;
  } catch (err) {
    log.error(
      { funcionarioId, erro: err.message },
      "Erro ao obter estado de processamento"
    );
    throw err;
  }
}

/**
 * Atualizar último UID processado
 *
 * DEVE ser chamado ANTES de qualquer ação (mover, salvar) para garantir idempotência.
 * Previne duplicação quando worker reconecta.
 *
 * @param {string} funcionarioId - ID do funcionário
 * @param {number} ultimoUid - Último UID processado
 * @param {string} status - Status da conexão (opcional)
 */
export async function atualizarUltimoBuscado(
  funcionarioId,
  ultimoUid,
  status = "processando"
) {
  try {
    const resultado = await chamarConvex(
      api.estado.atualizarUltimoBuscado,
      {
        funcionarioId,
        ultimoUid,
        statusConexao: status,
      },
      true
    );

    log.debug(
      { funcionarioId, ultimoUid, status },
      "UID atualizado com sucesso"
    );
    return resultado;
  } catch (err) {
    log.error(
      { funcionarioId, ultimoUid, erro: err.message },
      "Erro ao atualizar UID processado"
    );
    throw err;
  }
}

/**
 * Atualizar status de conexão IMAP
 *
 * @param {string} funcionarioId - ID do funcionário
 * @param {string} status - "conectado" | "desconectado" | "processando"
 */
export async function atualizarStatusConexao(funcionarioId, status) {
  try {
    const resultado = await chamarConvex(
      api.estado.atualizarStatusConexao,
      {
        funcionarioId,
        status,
      },
      true
    );

    log.debug({ funcionarioId, status }, "Status de conexão atualizado");
    return resultado;
  } catch (err) {
    log.error(
      { funcionarioId, status, erro: err.message },
      "Erro ao atualizar status de conexão"
    );
    throw err;
  }
}

/**
 * Salvar email processado
 *
 * Registra um email que foi classificado com seu nível e justificativa.
 *
 * @param {string} funcionarioId
 * @param {object} email - {messageId, subject, from, attachments?}
 * @param {number} nivel - 1-5
 * @param {string} justificativa
 * @param {object} contexto - {confidenceScore?, rascunho?, idioma?}
 */
export async function salvarClassificacao(
  funcionarioId,
  email,
  nivel,
  justificativa,
  contexto = {}
) {
  try {
    const resultado = await chamarConvex(
      api.emails.salvarEmailProcessado,
      {
        funcionarioId,
        messageId: email.messageId || email.uid,
        assunto: email.subject,
        remetenteEmail: email.from,
        remetenteDominio: email.from.split("@")[1],
        nivelClassificado: nivel,
        justificativa,
        idioma: contexto.idioma || "pt-br",
        temAnexos: (email.attachments?.length || 0) > 0,
        confidenceScore: contexto.confidenceScore,
        rascunhoResposta: contexto.rascunho,
      },
      true
    );

    log.debug(
      {
        funcionarioId,
        messageId: email.messageId,
        nivel,
        emailId: resultado.emailId,
      },
      "Email salvo com sucesso"
    );
    return resultado;
  } catch (err) {
    log.error(
      {
        funcionarioId,
        messageId: email.messageId,
        nivel,
        erro: err.message,
      },
      "Erro ao salvar classificação"
    );
    throw err;
  }
}

/**
 * Buscar emails processados de um funcionário
 *
 * @param {string} funcionarioId
 * @param {number} limite - Quantos emails (default: 50)
 * @param {number} ultimosDias - Últimos N dias (default: 30)
 */
export async function buscarEmailsProcessados(
  funcionarioId,
  limite = 50,
  ultimosDias = 30
) {
  try {
    const resultado = await chamarConvex(
      api.emails.buscarEmailsPorFuncionario,
      {
        funcionarioId,
        limite,
        ultimosDias,
      }
    );

    log.debug(
      { funcionarioId, quantidade: resultado.length, limite, ultimosDias },
      "Emails buscados"
    );
    return resultado;
  } catch (err) {
    log.error(
      { funcionarioId, erro: err.message },
      "Erro ao buscar emails processados"
    );
    throw err;
  }
}
