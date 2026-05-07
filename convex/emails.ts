/**
 * Operações de Emails Processados
 *
 * Salva, busca e atualiza emails que foram classificados pelo sistema.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Mutation: Salvar email processado
 *
 * Cria um registro do email com sua classificação, justificativa e metadados.
 * Retorna o ID do email para rastreamento futuro.
 */
export const salvarEmailProcessado = mutation({
  args: {
    funcionarioId: v.id("funcionarios"),
    messageId: v.string(),
    assunto: v.string(),
    remetenteEmail: v.string(),
    remetenteDominio: v.string(),
    nivelClassificado: v.number(),
    justificativa: v.string(),
    idioma: v.optional(v.string()),
    temAnexos: v.optional(v.boolean()),
    confidenceScore: v.optional(v.number()),
    rascunhoResposta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agora = Date.now();

    // 1. Buscar ou criar remetente
    let remetenteId = null;
    const remetenteExistente = await ctx.db
      .query("remetentes")
      .withIndex("by_funcionario_email", (q) =>
        q.eq("funcionarioId", args.funcionarioId).eq("email", args.remetenteEmail)
      )
      .first();

    if (remetenteExistente) {
      remetenteId = remetenteExistente._id;
      // Atualizar estatísticas do remetente
      await ctx.db.patch(remetenteId, {
        totalEmailsRecebidos: remetenteExistente.totalEmailsRecebidos + 1,
        nivelMedio:
          (remetenteExistente.nivelMedio * remetenteExistente.totalEmailsRecebidos +
            args.nivelClassificado) /
          (remetenteExistente.totalEmailsRecebidos + 1),
        ultimoContato: agora,
        silencioProlongado: false,
      });
    } else {
      // Criar novo remetente
      remetenteId = await ctx.db.insert("remetentes", {
        funcionarioId: args.funcionarioId,
        email: args.remetenteEmail,
        dominio: args.remetenteDominio,
        totalEmailsRecebidos: 1,
        nivelMedio: args.nivelClassificado,
        ultimoContato: agora,
        silencioProlongado: false,
      });
    }

    // 2. Inserir email processado
    const emailId = await ctx.db.insert("emails_processados", {
      funcionarioId: args.funcionarioId,
      messageId: args.messageId,
      remetenteId,
      assunto: args.assunto,
      idioma: args.idioma || "pt-br",
      threadId: `thread-${args.messageId}`, // Placeholder — será atualizado com thread real
      temAnexos: args.temAnexos || false,
      tiposAnexos: [],
      nivelClassificado: args.nivelClassificado,
      justificativa: args.justificativa,
      confidenceScore: args.confidenceScore,
      modeloUsado: "claude-opus-4-7",
      rascunhoResposta: args.rascunhoResposta,
      aceitoSemCorrecao: undefined, // Será preenchido quando usuário revisar
      versaoPrompt: "1.0",
      exemplosFewShotUsados: [],
      regrasDeterministicasAplicadas: [],
      recebidoEm: agora,
      processadoEm: agora,
    });

    return {
      sucesso: true,
      emailId,
      remetenteId,
      timestamp: agora,
    };
  },
});

/**
 * Query: Buscar emails processados por funcionário
 *
 * Retorna lista de emails já classificados, filtrado por data e nível opcionalmente.
 */
export const buscarEmailsPorFuncionario = query({
  args: {
    funcionarioId: v.id("funcionarios"),
    limite: v.optional(v.number()),
    ultimosDias: v.optional(v.number()),
    niveisMinimos: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const limite = args.limite || 50;
    const ultimosDias = args.ultimosDias || 30;
    const dataLimite = Date.now() - ultimosDias * 24 * 60 * 60 * 1000;

    let query = ctx.db
      .query("emails_processados")
      .withIndex("by_funcionario", (q) =>
        q.eq("funcionarioId", args.funcionarioId)
      )
      .order("desc");

    const emails = await query.take(limite);

    // Filtrar por data e níveis se especificado
    return emails.filter((email) => {
      const dentroDoPeríodo = email.processadoEm >= dataLimite;
      const dentroDosNiveis =
        !args.niveisMinimos ||
        args.niveisMinimos.includes(email.nivelClassificado);
      return dentroDoPeríodo && dentroDosNiveis;
    });
  },
});

/**
 * Mutation: Atualizar classificação (correção manual)
 *
 * Registra quando usuário corrige a classificação automática.
 * Importante para feedback e aprendizado futuro.
 */
export const atualizarClassificacao = mutation({
  args: {
    emailId: v.id("emails_processados"),
    novoNivel: v.number(),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) {
      throw new Error("Email não encontrado");
    }

    const nivelOriginal = email.nivelClassificado;

    // Atualizar email
    await ctx.db.patch(args.emailId, {
      nivelCorrigido: args.novoNivel,
      aceitoSemCorrecao: false,
    });

    // Registrar correção para RAG (Fase 2)
    const correcaoId = await ctx.db.insert("correcoes", {
      emailId: args.emailId,
      funcionarioId: email.funcionarioId,
      nivelOriginal,
      nivelCorrigido: args.novoNivel,
      timestamp: Date.now(),
    });

    return {
      sucesso: true,
      correcaoId,
      mudanca: `${nivelOriginal} → ${args.novoNivel}`,
    };
  },
});

/**
 * Query: Buscar email específico
 */
export const buscarEmailPorId = query({
  args: {
    emailId: v.id("emails_processados"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.emailId);
  },
});
