/**
 * Operações de Funcionários
 *
 * Consultas para gerenciar os funcionários cadastrados no sistema.
 */

import { internalQuery } from "./_generated/server";

/**
 * Query: Listar todos os funcionários ativos.
 *
 * Retorna o registro completo de cada funcionário, incluindo as credenciais
 * IMAP (imapUser, imapPassword, imapHost, imapPort) quando presentes.
 * O worker usa esses campos para criar conexões IMAP por funcionário.
 * Campos IMAP ausentes fazem o worker cair no fallback de variáveis de ambiente.
 */
export const listarAtivos = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("funcionarios")
      .filter(q => q.eq(q.field("ativo"), true))
      .collect();
  },
});
