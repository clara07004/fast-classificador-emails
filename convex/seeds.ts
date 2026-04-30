import { mutation } from "./_generated/server";

export const seedPiloto = mutation({
  args: {},
  handler: async (ctx) => {
    const EMAIL_PILOTO = "clara.barbosa@fastdrywall.com.br";

    // Evitar duplicatas — verificar se já existe
    const existente = await ctx.db
      .query("funcionarios")
      .withIndex("by_email", q => q.eq("email", EMAIL_PILOTO))
      .first();

    if (existente) {
      console.log("Funcionário piloto já existe:", existente._id);
      return { status: "já existe", id: existente._id };
    }

    const agora = Date.now();

    // 1. Inserir funcionário piloto
    const funcionarioId = await ctx.db.insert("funcionarios", {
      nome: "Clara Barbosa",
      email: EMAIL_PILOTO,
      areas: ["planejamento"],  // ← ajuste para sua área real
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    // 2. Perfil vazio — será populado automaticamente com o tempo
    await ctx.db.insert("perfis", {
      funcionarioId,
      mapaRemetentes: [],       // whitelist e aprendidos entram aqui com o tempo
      blacklistDominios: [],
      padroesAssuntoUrgente: [],
      guardRails: [
        // Exemplo de guard rail: emails da diretoria nunca abaixo de nível 2
        // { dominio: "fastdrywall.com.br", pisoNivel: 2 }
        // Descomente e ajuste conforme necessário
      ],
      versao: 1,
      atualizadoEm: agora,
    });

    // 3. Style card com valores padrão corporativo Fast
    // (tom claro, objetivo, direto — alinhado ao código de cultura)
    await ctx.db.insert("style_cards", {
      funcionarioId,
      saudacaoPreferida: "Olá",
      despedidaPreferida: "Att,",
      formalidade: "semiformal",
      comprimentoMedioWords: 80,   // emails curtos e diretos
      vocabularioRecorrente: [],
      padroesFechamento: [],
      versao: 1,
      atualizadoEm: agora,
    });

    console.log("Funcionário piloto criado com sucesso:", funcionarioId);
    return { status: "criado", funcionarioId };
  },
});
