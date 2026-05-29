/**
 * Operações de Estado de Processamento
 *
 * Rastreia o progresso de processamento IMAP por funcionário.
 * Crítico para idempotência e prevenção de duplicação.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Mutation: Atualizar último UID processado
 *
 * IMPORTANTE: Deve ser chamado ANTES de qualquer ação (mover, salvar, etc)
 * para garantir que se falhar depois, na reconexão não reprocessa.
 *
 * Idempotência:
 * - Se chamar 2x com mesmo UID, apenas último valor fica
 * - Próxima busca de "novos emails" ignora UIDs <= ultimoUidProcessado
 */
export const atualizarUltimoBuscado = internalMutation({
  args: {
    funcionarioId: v.id("funcionarios"),
    ultimoUid: v.number(),
    statusConexao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agora = Date.now();

    // Buscar registro existente
    const estado = await ctx.db
      .query("estadoProcessamento")
      .withIndex("by_funcionario", (q) => q.eq("funcionarioId", args.funcionarioId))
      .first();

    if (!estado) {
      // Criar novo se não existir (segurança)
      return await ctx.db.insert("estadoProcessamento", {
        funcionarioId: args.funcionarioId,
        ultimoUidProcessado: args.ultimoUid,
        ultimoTimestampProcessamento: agora,
        statusConexao: args.statusConexao || "desconectado",
        ultimaAtualizacao: agora,
      });
    }

    // Atualizar apenas se o novo UID é maior (never go backwards)
    if (args.ultimoUid > estado.ultimoUidProcessado) {
      await ctx.db.patch(estado._id, {
        ultimoUidProcessado: args.ultimoUid,
        ultimoTimestampProcessamento: agora,
        statusConexao: args.statusConexao || estado.statusConexao,
        ultimaAtualizacao: agora,
      });
    }

    return { sucesso: true, ultimoUid: Math.max(args.ultimoUid, estado.ultimoUidProcessado) };
  },
});

/**
 * Query: Obter estado de processamento
 *
 * Retorna último UID processado para buscar apenas novos emails na reconexão.
 */
export const obterEstado = internalQuery({
  args: {
    funcionarioId: v.id("funcionarios"),
  },
  handler: async (ctx, args) => {
    const estado = await ctx.db
      .query("estadoProcessamento")
      .withIndex("by_funcionario", (q) => q.eq("funcionarioId", args.funcionarioId))
      .first();

    if (!estado) {
      return {
        ultimoUidProcessado: 0,
        ultimoTimestampProcessamento: Date.now(),
        statusConexao: "desconectado",
        ultimaAtualizacao: 0,
      };
    }

    return {
      ultimoUidProcessado: estado.ultimoUidProcessado,
      ultimoTimestampProcessamento: estado.ultimoTimestampProcessamento,
      statusConexao: estado.statusConexao,
      ultimaAtualizacao: estado.ultimaAtualizacao,
    };
  },
});

/**
 * Mutation: Atualizar status de conexão
 *
 * Rastreia se worker está conectado ou processando.
 * Útil para debug e monitoramento.
 */
export const atualizarStatusConexao = internalMutation({
  args: {
    funcionarioId: v.id("funcionarios"),
    status: v.string(), // "conectado" | "desconectado" | "processando"
  },
  handler: async (ctx, args) => {
    const estado = await ctx.db
      .query("estadoProcessamento")
      .withIndex("by_funcionario", (q) => q.eq("funcionarioId", args.funcionarioId))
      .first();

    if (!estado) {
      return await ctx.db.insert("estadoProcessamento", {
        funcionarioId: args.funcionarioId,
        ultimoUidProcessado: 0,
        ultimoTimestampProcessamento: Date.now(),
        statusConexao: args.status,
        ultimaAtualizacao: Date.now(),
      });
    }

    await ctx.db.patch(estado._id, {
      statusConexao: args.status,
      ultimaAtualizacao: Date.now(),
    });

    return { sucesso: true };
  },
});
