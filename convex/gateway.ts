/**
 * Gateway HTTP com autenticação Bearer token.
 *
 * Expõe as internal mutations/queries do Convex para o worker Node.js
 * via HTTP simples, evitando o SDK WebSocket (que não exige autenticação).
 *
 * Protocolo:
 *   POST /api
 *   Authorization: Bearer <CONVEX_AUTH_TOKEN>
 *   Content-Type: application/json
 *   Body: { "fn": "emails.salvarEmailProcessado", "type": "mutation", "args": { ... } }
 *
 * Resposta de sucesso:
 *   { "sucesso": true, "resultado": <retorno da função> }
 *
 * Resposta de erro:
 *   { "erro": "<mensagem>" }
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Dispatch maps — lista explícita de funções autorizadas
// ---------------------------------------------------------------------------

const MUTATIONS: Record<string, unknown> = {
  "estado.atualizarUltimoBuscado": internal.estado.atualizarUltimoBuscado,
  "estado.atualizarStatusConexao": internal.estado.atualizarStatusConexao,
  "emails.salvarEmailProcessado":   internal.emails.salvarEmailProcessado,
  "emails.atualizarClassificacao":  internal.emails.atualizarClassificacao,
  "emails.registrarDiffRascunho":   internal.emails.registrarDiffRascunho,
  "emails.registrarMovimento":      internal.emails.registrarMovimento,
};

const QUERIES: Record<string, unknown> = {
  "estado.obterEstado":                    internal.estado.obterEstado,
  "emails.buscarEmailsPorFuncionario":     internal.emails.buscarEmailsPorFuncionario,
  "emails.buscarEmailPorId":               internal.emails.buscarEmailPorId,
  "emails.buscarEmailPorMessageId":        internal.emails.buscarEmailPorMessageId,
  "emails.buscarMovimentosPorFuncionario": internal.emails.buscarMovimentosPorFuncionario,
  "emails.buscarMovimentosPorPeriodo":     internal.emails.buscarMovimentosPorPeriodo,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export const gateway = httpAction(async (ctx, request) => {
  // 1. Verificar Bearer token
  const expectedToken = process.env.CONVEX_AUTH_TOKEN;
  if (!expectedToken) {
    console.error("CONVEX_AUTH_TOKEN não configurado no Convex Environment");
    return jsonResponse({ erro: "Servidor mal configurado" }, 500);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!provided || provided !== expectedToken) {
    return jsonResponse({ erro: "Não autorizado" }, 401);
  }

  // 2. Parse do body
  let body: { fn?: string; type?: string; args?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ erro: "Body JSON inválido" }, 400);
  }

  const { fn, type, args = {} } = body;

  if (!fn || !type) {
    return jsonResponse({ erro: "Campos 'fn' e 'type' são obrigatórios" }, 400);
  }

  // 3. Dispatch
  try {
    if (type === "mutation") {
      const fnRef = MUTATIONS[fn];
      if (!fnRef) {
        return jsonResponse({ erro: `Mutation desconhecida: ${fn}` }, 404);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultado = await ctx.runMutation(fnRef as any, args);
      return jsonResponse({ sucesso: true, resultado });

    } else if (type === "query") {
      const fnRef = QUERIES[fn];
      if (!fnRef) {
        return jsonResponse({ erro: `Query desconhecida: ${fn}` }, 404);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultado = await ctx.runQuery(fnRef as any, args);
      return jsonResponse({ sucesso: true, resultado });

    } else {
      return jsonResponse({ erro: `Tipo inválido: ${type}. Use 'query' ou 'mutation'` }, 400);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Gateway erro ao executar ${type} ${fn}: ${msg}`);
    return jsonResponse({ erro: msg }, 500);
  }
});
