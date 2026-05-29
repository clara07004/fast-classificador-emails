import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  funcionarios: defineTable({
    nome: v.string(),
    email: v.string(),
    areas: v.array(v.string()),
    ativo: v.boolean(),
    criadoEm: v.number(),
    atualizadoEm: v.number(),
  }).index("by_email", ["email"]),

  perfis: defineTable({
    funcionarioId: v.id("funcionarios"),
    mapaRemetentes: v.array(v.object({
      email: v.optional(v.string()),
      dominio: v.optional(v.string()),
      nivelMinimo: v.number(),
      nivelMaximo: v.optional(v.number()),
      fonte: v.string(),
    })),
    blacklistDominios: v.array(v.string()),
    padroesAssuntoUrgente: v.array(v.string()),
    guardRails: v.array(v.object({
      dominio: v.optional(v.string()),
      email: v.optional(v.string()),
      pisoNivel: v.number(),
    })),
    versao: v.number(),
    atualizadoEm: v.number(),
  }).index("by_funcionario", ["funcionarioId"]),

  style_cards: defineTable({
    funcionarioId: v.id("funcionarios"),
    saudacaoPreferida: v.string(),
    despedidaPreferida: v.string(),
    formalidade: v.string(),
    comprimentoMedioWords: v.number(),
    vocabularioRecorrente: v.array(v.string()),
    padroesFechamento: v.array(v.string()),
    versao: v.number(),
    atualizadoEm: v.number(),
  }).index("by_funcionario", ["funcionarioId"]),

  emails_processados: defineTable({
    funcionarioId: v.id("funcionarios"),
    messageId: v.string(),
    remetenteId: v.id("remetentes"),
    assunto: v.string(),
    idioma: v.string(),
    threadId: v.string(),
    temAnexos: v.boolean(),
    tiposAnexos: v.array(v.string()),
    nivelClassificado: v.number(),
    nivelCorrigido: v.optional(v.number()),
    justificativa: v.string(),
    confidenceScore: v.optional(v.number()),
    modeloUsado: v.string(),
    rascunhoResposta: v.optional(v.string()),
    aceitoSemCorrecao: v.optional(v.boolean()),
    versaoPrompt: v.string(),
    exemplosFewShotUsados: v.array(v.string()),
    regrasDeterministicasAplicadas: v.array(v.string()),
    recebidoEm: v.number(),
    processadoEm: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .index("by_message", ["messageId"])
    .index("by_thread", ["threadId"])
    .index("by_remetente", ["remetenteId"]),

  // vectorIndex "by_embedding" adicionado para RAG da Fase 2 via Convex Vector Search.
  // dimensions: 1024 = voyage-3-lite. filterFields: ["funcionarioId"] = busca isolada por funcionário.
  correcoes: defineTable({
    emailId: v.id("emails_processados"),
    funcionarioId: v.id("funcionarios"),
    nivelOriginal: v.number(),
    nivelCorrigido: v.number(),
    embedding: v.optional(v.array(v.float64())),
    timestamp: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .index("by_email", ["emailId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["funcionarioId"],
    }),

  remetentes: defineTable({
    funcionarioId: v.id("funcionarios"),
    email: v.string(),
    nome: v.optional(v.string()),
    dominio: v.string(),
    totalEmailsRecebidos: v.number(),
    nivelMedio: v.number(),
    ultimoContato: v.number(),
    silencioProlongado: v.boolean(),
  })
    .index("by_funcionario_email", ["funcionarioId", "email"])
    .index("by_funcionario_dominio", ["funcionarioId", "dominio"]),

  // Estado de processamento IMAP — garante idempotência na reconexão
  // Rastreia qual foi o último UID processado por funcionário
  // Previne duplicação quando worker reconecta a cada 28 minutos
  estadoProcessamento: defineTable({
    funcionarioId: v.id("funcionarios"),
    ultimoUidProcessado: v.number(),
    ultimoTimestampProcessamento: v.number(),
    statusConexao: v.string(), // "conectado" | "desconectado" | "processando"
    ultimaAtualizacao: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"]),

  // Diff entre rascunho gerado e email realmente enviado pelo funcionário.
  // Alimenta o style card na Fase 2 — aprende como cada pessoa edita os rascunhos.
  draft_diffs: defineTable({
    funcionarioId: v.id("funcionarios"),
    emailOriginalId: v.id("emails_processados"),  // email recebido que gerou o rascunho
    rascunhoGerado: v.string(),        // texto que Claude gerou
    textoEnviado: v.string(),          // texto que o funcionário realmente enviou
    similaridadePercent: v.number(),   // 0–100: quanto do rascunho foi preservado (Jaccard)
    inReplyTo: v.string(),             // Message-ID do email original (chave de cruzamento)
    messageIdEnviado: v.string(),       // Message-ID do email enviado (evita duplicatas)
    timestamp: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .index("by_in_reply_to", ["inReplyTo"])
    .index("by_message_enviado", ["messageIdEnviado"]),

  email_movements: defineTable({
    funcionari