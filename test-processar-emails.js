/**
 * Teste End-to-End: Simulação de Processamento de Email
 *
 * Simula:
 * 1. Email chegando no IMAP
 * 2. Busca de novo UID
 * 3. Normalização
 * 4. Classificação (Claude)
 * 5. Movimentação para pasta
 * 6. Salvamento em Convex
 *
 * NÃO usa IMAP real, apenas valida a lógica
 */

import dotenv from 'dotenv';
import {
  classificarEmail,
  obterEstatisticas,
  resetarEstatisticas,
} from './src/imap/classificador.js';
import { obterPastaParaNivel, nivelValido } from './src/imap/pastas.js';
import { analisarContextoConversa } from './src/imap/thread-context.js';
import { salvarClassificacao } from './src/convex/cliente.js';
import pino from 'pino';

dotenv.config();

const log = pino({ level: 'info' });

const FUNCIONARIO_ID = 'jh752xekmrn5ebqvz66nv5mfsn85pjsa';

// Emails de teste simulados
const EMAILS_TESTE = [
  {
    uid: 1001,
    messageId: '<email-001@csc.com.br>',
    from: 'cliente@empresa.com.br',
    subject: 'URGENTE: Site offline',
    text: 'O site está fora do ar há 1 hora. Clientes não conseguem acessar. Ação imediata necessária.',
    date: Date.now(),
  },
  {
    uid: 1002,
    messageId: '<email-002@csc.com.br>',
    from: 'gerente@cliente.com',
    subject: 'Status do projeto',
    text: 'Pode enviar um update do projeto? Preciso saber se estamos on-track.',
    date: Date.now(),
  },
  {
    uid: 1003,
    messageId: '<email-003@csc.com.br>',
    inReplyTo: '<email-002@csc.com.br>',
    references: '<email-002@csc.com.br>',
    from: 'gerente@cliente.com',
    subject: 'Re: Status do projeto',
    text: 'Obrigado pelo update. Vamos revisar com a equipe.',
    date: Date.now(),
    threadProfundidade: 2,
  },
  {
    uid: 1004,
    messageId: '<email-004@csc.com.br>',
    from: 'noreply@linkedin.com',
    subject: 'Você tem uma nova conexão',
    text: 'Uma nova conexão foi adicionada ao seu perfil.',
    date: Date.now(),
  },
];

async function testarProcessamento(emailTeste) {
  console.log(`\n📧 Testando Email UID ${emailTeste.uid}: ${emailTeste.subject}`);
  console.log('─'.repeat(70));

  try {
    // 1. Simular análise de contexto (se for resposta)
    let contexto = null;
    if (emailTeste.inReplyTo || emailTeste.references) {
      contexto = {
        isResposta: true,
        threadId: emailTeste.messageId,
        parentMessageId: emailTeste.inReplyTo,
        profundidadeThread: emailTeste.threadProfundidade || 2,
        isFollowUp: emailTeste.threadProfundidade >= 3,
      };
      console.log(`   Thread: resposta em conversa (profundidade ${contexto.profundidadeThread})`);
    }

    // 2. Classificar
    const inicio = Date.now();
    const classificacao = await classificarEmail(emailTeste, { id: FUNCIONARIO_ID }, contexto);
    const tempoMs = Date.now() - inicio;

    console.log(`   Nível: ${classificacao.nivel}`);
    console.log(`   Método: ${classificacao.metodo}`);
    console.log(`   Pasta: ${obterPastaParaNivel(classificacao.nivel)}`);
    console.log(`   Confiança: ${(classificacao.confidenceScore * 100).toFixed(0)}%`);
    console.log(`   Tempo: ${tempoMs}ms`);

    // 3. Validar nível
    if (!nivelValido(classificacao.nivel)) {
      throw new Error(`Nível inválido: ${classificacao.nivel}`);
    }

    // 4. Simular salvamento em Convex
    console.log(`   Salvando em Convex...`);
    try {
      await salvarClassificacao(
        FUNCIONARIO_ID,
        {
          messageId: emailTeste.messageId,
          uid: emailTeste.uid,
          subject: emailTeste.subject,
          from: emailTeste.from,
          attachments: [],
        },
        classificacao.nivel,
        classificacao.reasoning,
        {
          metodo: classificacao.metodo,
          confidenceScore: classificacao.confidenceScore,
          pastaUsada: obterPastaParaNivel(classificacao.nivel),
        }
      );
      console.log(`   ✅ Salvo em Convex com sucesso`);
    } catch (err) {
      console.log(`   ⚠️  Aviso ao salvar: ${err.message}`);
    }

    console.log(`   ✅ Email processado com sucesso`);
    return { sucesso: true, classificacao };
  } catch (err) {
    console.log(`   ❌ Erro: ${err.message}`);
    return { sucesso: false, erro: err.message };
  }
}

async function main() {
  console.log('\n🧪 TESTE END-TO-END: Processamento de Emails\n');
  console.log('═'.repeat(70));

  resetarEstatisticas();

  const resultados = [];
  for (const emailTeste of EMAILS_TESTE) {
    const resultado = await testarProcessamento(emailTeste);
    resultados.push(resultado);
  }

  // Resumo
  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 RESUMO DO PROCESSAMENTO\n');

  const totais = resultados.length;
  const sucessos = resultados.filter((r) => r.sucesso).length;
  const falhas = totais - sucessos;

  console.log(`Total de emails: ${totais}`);
  console.log(`✅ Processados com sucesso: ${sucessos}`);
  console.log(`❌ Falhados: ${falhas}`);
  console.log(`Taxa de sucesso: ${((sucessos / totais) * 100).toFixed(1)}%`);

  // Estatísticas do classificador
  console.log('\n📈 ESTATÍSTICAS DA CLASSIFICAÇÃO\n');
  const stats = obterEstatisticas();
  console.log(`Total de emails classificados: ${stats.total}`);
  console.log(`  - Pré-classificador: ${stats.preClassificador} (${stats.percentualPreClassificador})`);
  console.log(`  - Claude API: ${stats.claudeAPI}`);
  console.log(`  - Fallback: ${stats.fallback} (${stats.percentualFallback})`);

  // Resumo de distribuição de níveis
  console.log('\n📋 DISTRIBUIÇÃO DE NÍVEIS\n');
  const niveis = resultados
    .filter((r) => r.sucesso)
    .reduce((acc, r) => {
      acc[r.classificacao.nivel] = (acc[r.classificacao.nivel] || 0) + 1;
      return acc;
    }, {});

  const nomeNiveis = {
    1: 'Urgente',
    2: 'Importante',
    3: 'Normal',
    4: 'Baixa',
    5: 'FYI',
  };

  for (let i = 1; i <= 5; i++) {
    const qtd = niveis[i] || 0;
    const percentual = ((qtd / sucessos) * 100).toFixed(1);
    console.log(`  Nível ${i} (${nomeNiveis[i]}): ${qtd} emails (${percentual}%)`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  if (falhas === 0) {
    console.log('✅ TODOS OS EMAILS FORAM PROCESSADOS COM SUCESSO!\n');
    process.exit(0);
  } else {
    console.log(`❌ ${falhas} EMAIL(S) NÃO PROCESSADO(S)\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
