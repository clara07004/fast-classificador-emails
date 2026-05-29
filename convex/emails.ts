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

/**
 * Query: Buscar email por Message-ID original
 *
 * Usado pelo SentMonitor para cruzar In-Reply-To do email enviado
 * com o messageId do email original processado.
 */
export const buscarEmailPorMessageId = query({
  args: {
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails_processados")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
  },
});

/**
 * Mutation: Registrar diff rascunho × enviado (T39)
 *
 * Salva a diferença entre o rascunho gerado por Claude e o email
 * que o funcionário realmente enviou. Alimenta o style card na Fase 2.
 *
 * Idempotente: ignora silenciosamente se messageIdEnviado já foi registrado.
 */
export const registrarDiffRascunho = mutation({
  args: {
    funcionarioId: v.id("funcionarios"),
    emailOriginalId: v.id("emails_processados"),
    rascunhoGerado: v.string(),
    textoEnviado: v.string(),
    similaridadePercent: v.number(),
    inReplyTo: v.string(),
    messageIdEnviado: v.string(),
  },
  handler: async (ctx, args) => {
    // Idempotência: evitar registrar o mesmo email enviado duas vezes
    const jaExiste = await ctx.db
      .query("draft_diffs")
      .withIndex("by_message_enviado", (q) =>
        q.eq("messageIdEnviado", args.messageIdEnviado)
      )
      .first();

    if (jaExiste) {
      return { sucesso: true, diffId: jaExiste._id, duplicata: true };
    }

    const diffId = await ctx.db.insert("draft_diffs", {
      ...args,
      timestamp: Date.now(),
    });

    return { sucesso: true, diffId, duplicata: false };
  },
});

/**
 * Mutation: Registrar movimento de email (Feedback Loop)
 *
 * Detecta quando usuário move um email pra pasta diferente,
 * interpretando como feedback sobre classificação automática.
 */
export const registrarMovimento = mutation({
  args: {
    funcionarioId: v.id("funcionarios"),
    uid: v.number(),
    subject: v.string(),
    from: v.string(),
    received_at: v.number(),
    classified_as: v.string(), // P1-P5
    confidence: v.optional(v.number()),
    system_folder: v.string(),
    classification_timestamp: v.number(),
    user_moved_to: v.string(),
    feedback_timestamp: v.number(),
    expected_priority: v.optional(v.string()),
    correction_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const feedbackDelayMs = args.feedback_timestamp - args.classification_timestamp;
    const feedbackDelayMinutes = Math.round(feedbackDelayMs / (60 * 1000));

    // Mapear pasta para nível
    const PASTA_PARA_NIVEL = {
      'INBOX.Fast-Urgente': 'P1',
      'INBOX.Fast-Alta-Prioridade': 'P2',
      'INBOX.Fast-Normal': 'P3',
      'INBOX.Fast-Baixa': 'P4',
      'INBOX.Fast-Irrelevante': 'P5',
      'INBOX.Fast-Pendente-Classificacao': 'PENDENTE',
    };

    const systemLevel = args.classified_as;
    const userLevel = PASTA_PARA_NIVEL[args.user_moved_to] || 'DESCONHECIDO';
    const isCorrect = systemLevel === userLevel;

    const movimentoId = await ctx.db.insert("email_movements", {
      funcionarioId: args.funcionarioId,
      uid: args.uid,
      subject: args.subject,
      from: args.from,
      received_at: args.received_at,
      classified_as: args.classified_as,
      confidence: args.confidence,
      system_folder: args.system_folder,
      classification_timestamp: args.classification_timestamp,
      user_moved_to: args.user_moved_to,
      feedback_timestamp: args.feedback_timestamp,
      feedback_delay_minutes: feedbackDelayMinutes,
      is_correct: isCorrect,
      expected_priority: args.expected_priority || (isCorrect ? systemLevel : userLevel),
      correction_reason: args.correction_reason,
      is_learning_example: true, // Sempre True pra Fase 2
    });

    return {
      sucesso: true,
      movimentoId,
      isCorrect,
      feedbackDelayMinutes,
    };
  },
});

/**
 * Query: Buscar movimentos recentes por funcionário (para LearningBlock / RAG Fase 2)
 */
export const buscarMovimentosPorFuncionario = query({
  args: {
    funcionarioId: v.id("funcionarios"),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limite = args.limite ?? 20;
    return await ctx.db
      .query("email_movements")
      .withIndex("by_funcionario", (q) =>
        q.eq("funcionarioId", args.funcionarioId)
      )
      .order("desc")
      .take(limite);
  },
});

/**
 * Query: Buscar movimentos recentes (para relatório semanal)
 */
export const buscarMovimentosPorPeriodo = query({
  args: {
    funcionarioId: v.id("funcionarios"),
    dataInicio: v.number(),
    dataFim: v.number(),
  },
  handler: async (ctx, args) => {
    const movimentos = await ctx.db
      .query("email_movements")
      .withIndex("by_funcionario", (q) =>
        q.eq("funcionarioId", args.funcionarioId)
      )
      .order("desc");

    // Filtrar por período
    return movimentos
      .filter((m) =>
        m.feedback_timestamp >= args.dataInicio &&
        m.feedback_timestamp <= args.dataFim
      );
  },
});
