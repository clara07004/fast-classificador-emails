/**
 * Endpoint HTTP de healthcheck do worker.
 *
 * Expõe GET /health para monitoramento externo (UptimeRobot, etc).
 *
 * Multi-tenant: verifica TODOS os funcionários ativos (via funcionarios.listarAtivos),
 * não um único PILOTO_FUNCIONARIO_ID fixo. Retorna 503 se QUALQUER worker ativo
 * estiver sem atividade há mais de STALE_THRESHOLD_MIN.
 *
 * Retornos:
 *   200 OK  → todos os workers ativos com atividade dentro do threshold
 *   503     → pelo menos um worker sem atividade (stale) ou sem estado
 *   500     → erro interno (Convex)
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const STALE_THRESHOLD_MIN = 60; // minutos sem atividade = problema

export const healthCheck = httpAction(async (ctx) => {
  // 1. Carregar funcionários ativos (mesma fonte de verdade do worker)
  let funcionarios;
  try {
    funcionarios = await ctx.runQuery(internal.funcionarios.listarAtivos, {});
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: `Erro ao listar funcionários: ${(err as Error).message}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!funcionarios || funcionarios.length === 0) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Nenhum funcionário ativo cadastrado.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Avaliar o estado de cada funcionário ativo
  const agora = Date.now();
  const detalhes: Array<Record<string, unknown>> = [];
  let algumStale = false;

  for (const f of funcionarios) {
    let estado;
    try {
      estado = await ctx.runQuery(internal.estado.obterEstado, {
        funcionarioId: f._id,
      });
    } catch (err) {
      algumStale = true;
      detalhes.push({
        funcionarioId: f._id,
        nome: f.nome,
        status: "error",
        erro: (err as Error).message,
      });
      continue;
    }

    const ultimaAtividade = estado?.ultimaAtualizacao ?? 0;
    const diffMin = Math.round((agora - ultimaAtividade) / 1000 / 60);
    const stale = ultimaAtividade === 0 || diffMin > STALE_THRESHOLD_MIN;
    if (stale) algumStale = true;

    detalhes.push({
      funcionarioId: f._id,
      nome: f.nome,
      status: stale ? "stale" : "ok",
      minutosDesdeUltimaAtividade: diffMin,
      statusConexaoIMAP: estado?.statusConexao ?? "desconhecido",
      ultimaAtividade:
        ultimaAtividade > 0 ? new Date(ultimaAtividade).toISOString() : "nunca",
    });
  }

  const payload = {
    status: algumStale ? "stale" : "ok",
    thresholdMin: STALE_THRESHOLD_MIN,
    totalFuncionariosAtivos: funcionarios.length,
    checkedAt: new Date(agora).toISOString(),
    funcionarios: detalhes,
  };

  return new Response(JSON.stringify(payload), {
    status: algumStale ? 503 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
