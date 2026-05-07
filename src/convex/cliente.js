/**
 * Cliente Convex para o Worker IMAP
 *
 * Abstrai chamadas ao Convex database.
 * Implementação será completada quando Convex estiver totalmente integrado.
 */

import { ConvexClient } from "convex/browser";
import { getLogger } from "../logger.js";

const log = getLogger("convex-client");

let cliente = null;

/**
 * Inicializar cliente Convex
 *
 * PLACEHOLDER: Será implementado quando Convex production estiver configurado.
 * Por enquanto, retorna mock para desenvolvimento.
 */
export async function inicializarConvex() {
  // TODO: Implementar inicialização real quando Convex URL estiver configurada
  // const url = process.env.CONVEX_URL;
  // if (!url) {
  //   throw new Error('CONVEX_URL não configurada em .env');
  // }
  // cliente = new ConvexClient(url);

  log.info("Convex cliente inicializado (placeholder)");
  return cliente;
}

/**
 * Obter estado de processamento IMAP
 *
 * Retorna último UID processado para buscar apenas novos emails.
 * @param {string} funcionarioId
 * @returns {Promise<{ultimoUidProcessado: number, statusConexao: string}>}
 */
export async function obterEstadoProcessamento(funcionarioId) {
  if (!cliente) {
    log.warn("Convex não inicializado, retornando estado padrão");
    return {
      ultimoUidProcessado: 0,
      statusConexao: "desconectado",
    };
  }

  try {
    // TODO: Implementar quando Convex estiver integrado
    // return await cliente.query(api.estado.obterEstado, {
    //   funcionarioId,
    // });

    log.debug({ funcionarioId }, "obterEstadoProcessamento (placeholder)");
    return {
      ultimoUidProcessado: 0,
      statusConexao: "desconectado",
    };
  } catch (err) {
    log.error({ err: err.message }, "Erro ao obter estado de processamento");
    throw err;
  }
}

/**
 * Atualizar último UID processado
 *
 * DEVE ser chamado ANTES de qualquer ação (mover, salvar) para garantir idempotência.
 * @param {string} funcionarioId
 * @param {number} ultimoUid
 */
export async function atualizarUltimoBuscado(funcionarioId, ultimoUid) {
  if (!cliente) {
    log.debug({ funcionarioId, ultimoUid }, "atualizarUltimoBuscado (offline)");
    return { sucesso: true };
  }

  try {
    // TODO: Implementar quando Convex estiver integrado
    // return await cliente.mutation(api.estado.atualizarUltimoBuscado, {
    //   funcionarioId,
    //   ultimoUid,
    // });

    log.debug({ funcionarioId, ultimoUid }, "atualizarUltimoBuscado (placeholder)");
    return { sucesso: true };
  } catch (err) {
    log.error({ err: err.message, funcionarioId, ultimoUid }, "Erro ao atualizar UID processado");
    throw err;
  }
}

/**
 * Atualizar status de conexão
 *
 * @param {string} funcionarioId
 * @param {string} status - "conectado" | "desconectado" | "processando"
 */
export async function atualizarStatusConexao(funcionarioId, status) {
  if (!cliente) {
    log.debug({ funcionarioId, status }, "atualizarStatusConexao (offline)");
    return { sucesso: true };
  }

  try {
    // TODO: Implementar quando Convex estiver integrado
    // return await cliente.mutation(api.estado.atualizarStatusConexao, {
    //   funcionarioId,
    //   status,
    // });

    log.debug({ funcionarioId, status }, "atualizarStatusConexao (placeholder)");
    return { sucesso: true };
  } catch (err) {
    log.error({ err: err.message, funcionarioId }, "Erro ao atualizar status de conexão");
    throw err;
  }
}

export function obterCliente() {
  return cliente;
}
