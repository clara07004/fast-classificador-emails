/**
 * Endpoint HTTP de healthcheck do worker.
 *
 * Expõe GET /health para monitoramento externo (UptimeRobot, etc).
 *
 * Retornos:
 *   200 OK  → worker ativo, última atividade dentro do threshold
 *   503     → worker sem atividade por mais de STALE_THRESHOLD_MIN
 *   500     → erro interno (Convex ou configuração)
 *
 * Configuração necessária no Convex dashboard (Settings → Environment Variables):
 *   PILOTO_FUNCIONARIO_ID = <id do funcionário na tabela funcionarios>
 *
 * Exemplo de URL para monitorar:
 *   https://chatty-panda-261.convex.cloud/health
 */

import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const STALE_THRESHOLD_MIN = 60; // minutos sem atividade = problema

export const healthCheck = httpAction(async (ctx, _request) => {
  const funcionarioId = process.env.PILOTO_FUNCIONARIO_ID;

  if (!funcionarioId) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "PILOTO_FUNCIONARIO_ID não configurada nas variáveis de ambiente do Convex.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let estado: {
    ultimaAtualizacao: number;
    statusConexao: string;
    ultimoUidProcessado: number;
  } | null;

  try {
    estado = await ctx.runQuery(api.estado.obterEstado, {
      funcionarioId: funcionarioId as never,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: `Erro ao consultar Convex: ${(err as Error).message}`,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const agora = Date.now();
  const ultimaAtividade = estado?.ultimaAtualizacao ?? 0;
  const diffMs = agora - ultimaAtividade;
  const diffMin = Math.round(diffMs / 1000 / 60);
  const ultimaAtividadeISO =
    ultimaAtividade > 0
      ? new Date(ultimaAtividade).toISOString()
      : "nunca";

  const payload = {
    status: diffMin <= STALE_THRESHOLD_MIN ? "ok" : "stale",
    minutosDesdeUltimaAtividade: diffMin,
    thresholdMin: STALE_THRESHOLD_MIN,
    ultimaAtividade: ultimaAtividadeISO,
    statusConexaoIMAP: estado?.statusConexao ?? "desconhecido",
    checkedAt: new Date(agora).toISOString(),
  };

  if (diffMin > STALE_THRESHOLD_MIN || ultimaAtividade === 0) {
    return new Response(JSON.stringify(payload), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
