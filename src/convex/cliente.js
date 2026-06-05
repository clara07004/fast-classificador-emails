/**
 * Cliente Convex para o Worker IMAP
 *
 * Implementacao via HTTP Gateway com autenticacao Bearer token.
 * Substitui o ConvexClient WebSocket (que nao exigia autenticacao).
 *
 * O gateway esta em POST https://<deployment>.convex.site/api
 * O token e lido de CONVEX_AUTH_TOKEN no .env.
 */

import { getLogger } from "../logger.js";

const log = getLogger("convex-client");

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60000; // 60s

let clienteGlobal = null;

// ---------------------------------------------------------------------------
// GatewayClient
// ---------------------------------------------------------------------------

class GatewayClient {
  /**
   * @param {string} siteUrl  - Ex: https://chatty-panda-261.convex.site
   * @param {string} token    - Bearer token (CONVEX_AUTH_TOKEN)
   */
  constructor(siteUrl, token) {
    this.endpoint = siteUrl.replace(/\/$/, "") + "/api";
    this.token = token;
  }

  /**
   * Chama uma query ou mutation no gateway.
   *
   * @param {string} fn   - Nome da funcao, ex: 'emails.salvarEmailProcessado'
   * @param {object} args - Argumentos
   * @param {string} type - 'query' ou 'mutation'
   */
  async _call(fn, args, type) {
    const body = JSON.stringify({ fn, type, args });

    for (let tentativa = 0; tentativa < MAX_RETRIES; tentativa++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);

        const json = await res.json();

        if (!res.ok) {
          throw new Error(
            json?.erro || `HTTP ${res.status} ao chamar ${fn}`
          );
        }

        return json.resultado;
      } catch (err) {
        clearTimeout(timer);

        const ehAbort = err.name === "AbortError";
        const ehRetentavel =
          ehAbort ||
          err.message?.includes("ECONNREFUSED") ||
          err.message?.includes("fetch failed");

        if (tentativa < MAX_RETRIES - 1 && ehRetentavel) {
          const delay = Math.pow(2, tentativa) * 1000;
          log.warn(
            { tentativa, delay, erro: err.message, fn },
            "Gateway falhou, tentando novamente..."
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        log.error({ tentativa, erro: err.message, fn }, "Erro ao chamar gateway apos retries");
        throw err;
      }
    }
  }

  /**
   * Executa uma query (leitura).
   * @param {string} fn
   * @param {object} args
   */
  async query(fn, args) {
    return this._call(fn, args, "query");
  }

  /**
   * Executa uma mutation (escrita).
   * @param {string} fn
   * @param {object} args
   */
  async mutation(fn, args) {
    return this._call(fn, args, "mutation");
  }
}

// ---------------------------------------------------------------------------
// Exports publicos
// ---------------------------------------------------------------------------

/**
 * Retorna a instancia raw do GatewayClient.
 * Usado por modulos que chamam .query()/.mutation() diretamente (ex: MovimentoMonitor).
 */
export function getConvexClient() {
  return clienteGlobal;
}

/**
 * Inicializar cliente Convex (gateway HTTP)
 */
export async function inicializarConvex() {
  try {
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error("CONVEX_URL nao configurada em .env");
    }

    const token = process.env.CONVEX_AUTH_TOKEN;
    if (!token) {
      throw new Error("CONVEX_AUTH_TOKEN nao configurado em .env");
    }

    // Derivar siteUrl: trocar .convex.cloud por .convex.site
    const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");

    log.info({ siteUrl }, "Inicializando GatewayClient Convex...");

    clienteGlobal = new GatewayClient(siteUrl, token);

    // Teste de conectividade: faz uma query com ID fake
    // Deve retornar dados padrao (nao ha throw em estado.obterEstado com ID invalido)
    try {
      await clienteGlobal.query("estado.obterEstado", {
        funcionarioId: "test-conexao-xyz",
      });
      log.debug("Teste de conexao gateway: OK");
    } catch (err) {
      // Falha esperada com ID invalido (tipo incompativel) — gateway respondeu
      log.debug(
        { erro: err.message },
        "Teste de conexao gateway: respondeu com erro esperado"
      );
    }

    log.info("GatewayClient Convex inicializado com sucesso");
    return true;
  } catch (err) {
    log.error({ erro: err.message }, "Falha ao inicializar GatewayClient Convex");
    throw err;
  }
}

/**
 * Obter estado de processamento IMAP
 *
 * @param {string} funcionarioId
 * @returns {Promise<{ultimoUidProcessado: number, statusConexao: string}>}
 */
export async function obterEstadoProcessamento(funcionarioId) {
  try {
    const resultado = await clienteGlobal.query("estado.obterEstado", {
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
 * Atualizar ultimo UID processado
 *
 * @param {string} funcionarioId
 * @param {number} ultimoUid
 * @param {string} status
 */
export async function atualizarUltimoBuscado(
  funcionarioId,
  ultimoUid,
  status = "processando"
) {
  try {
    const resultado = await clienteGlobal.mutation(
      "estado.atualizarUltimoBuscado",
      {
        funcionarioId,
        ultimoUid,
        statusConexao: status,
      }
    );

    log.debug({ funcionarioId, ultimoUid, status }, "UID atualizado com sucesso");
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
 * Atualizar status de conexao IMAP
 *
 * @param {string} funcionarioId
 * @param {string} status - "conectado" | "desconectado" | "processando"
 */
export async function atualizarStatusConexao(funcionarioId, status) {
  try {
    const resultado = await clienteGlobal.mutation(
      "estado.atualizarStatusConexao",
      {
        funcionarioId,
        status,
      }
    );

    log.debug({ funcionarioId, status }, "Status de conexao atualizado");
    return resultado;
  } catch (err) {
    log.error(
      { funcionarioId, status, erro: err.message },
      "Erro ao atualizar status de conexao"
    );
    throw err;
  }
}

/**
 * Salvar email processado
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
    const resultado = await clienteGlobal.mutation(
      "emails.salvarEmailProcessado",
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
      }
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
      "Erro ao salvar classificacao"
    );
    throw err;
  }
}

/**
 * Listar todos os funcionários ativos (com credenciais IMAP quando disponíveis)
 *
 * Usado pelo worker no boot para iniciar uma conexão IMAP por funcionário.
 * @returns {Promise<Array>}
 */
export async function listarFuncionariosAtivos() {
  try {
    const resultado = await clienteGlobal.query("funcionarios.listarAtivos", {});
    log.debug({ total: resultado?.length ?? 0 }, 'Funcionários ativos carregados do Convex');
    return resultado || [];
  } catch (err) {
    log.error({ erro: err.message }, 'Erro ao listar funcionários ativos');
    throw err;
  }
}

/**
 * Buscar emails processados de um funcionario
 *
 * @param {string} funcionarioId
 * @param {number} limite
 * @param {number} ultimosDias
 */
export async function buscarEmailsProcessados(
  funcionarioId,
  limite = 50,
  ultimosDias = 30
) {
  try {
    const resultado = await clienteGlobal.query(
      "emails.buscarEmailsPorFuncionario",
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
