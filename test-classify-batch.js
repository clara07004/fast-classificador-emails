/**
 * Teste batch — Classificar todos os 20 emails de teste
 * Compara resultado contra gabarito esperado
 */

import 'dotenv/config';
import { ClassifierV2 } from './src/classifiers/v2-classifier.js';
import { emails, PRIORIDADES } from './test-sender/emails.js';

const classifier = new ClassifierV2();

// Mapa esperado — qual prioridade esperamos para cada índice
const GABARITO = {
  0: { expected: 'P1', desc: 'Obra parada — falta de drywall' },
  1: { expected: 'P1', desc: 'Vistoria ANVISA amanhã' },
  2: { expected: 'P1', desc: 'Acidente em obra' },
  3: { expected: 'P1', desc: 'Cliente Grupo Mega ameaça processo' },
  4: { expected: 'P2', desc: 'Proposta técnica — prazo HOJE' },
  5: { expected: 'P2', desc: 'Aprovação orçamento R$220k' },
  6: { expected: 'P2', desc: 'Reclamação formal — Franquia' },
  7: { expected: 'P2', desc: 'Reunião investidor amanhã' },
  8: { expected: 'P3', desc: 'Dúvida técnica acústica' },
  9: { expected: 'P3', desc: 'Visita técnica Alphaville' },
  10: { expected: 'P3', desc: 'Atualização fase 2' },
  11: { expected: 'P3', desc: 'Catálogo técnico' },
  12: { expected: 'P4', desc: 'Confirmação pedido' },
  13: { expected: 'P4', desc: 'Webinar treinamento' },
  14: { expected: 'P4', desc: 'Manutenção ERP' },
  15: { expected: 'P4', desc: 'Atualização dados cadastrais' },
  16: { expected: 'P5', desc: 'Newsletter' },
  17: { expected: 'P5', desc: 'Pesquisa satisfação' },
  18: { expected: 'P5', desc: 'Feriado Corpus Christi' },
  19: { expected: 'P5', desc: 'Oferta especial parceiro' }
};

async function classifyBatch() {
  console.log(`\n🚀 TESTE BATCH — 20 EMAILS DE TESTE\n`);
  console.log(`Classificador: ${classifier.model}`);
  console.log(`─`.repeat(100));

  const results = [];
  let acertos = 0;
  let erros = 0;

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const expectedPrio = GABARITO[i].expected;
    const emailDesc = GABARITO[i].desc;

    // Prepara dados para classificação
    const emailData = {
      from: 'barbosa.claraia@gmail.com (Teste)',
      to: 'clara.barbosa@fastdrywall.com.br',
      cc: '',
      subject: email.assunto,
      body: email.corpo,
      timestamp: new Date().toISOString(),
      isForwarded: false,
      forwardedFrom: null,
      forwardedBody: null,
      attachmentsSummary: null,
      threadContext: null,
      userContext: null,
      senderEnrichment: null
    };

    try {
      console.log(`\n[${i + 1}/20] ${emailDesc}`);
      console.log(`   Assunto: ${email.assunto.substring(0, 80)}`);

      const result = await classifier.classify(emailData);

      if (!result.success) {
        console.log(`   ❌ Erro: ${result.error}`);
        erros++;
        results.push({
          index: i,
          email: emailDesc,
          expected: expectedPrio,
          actual: 'ERROR',
          match: false,
          error: result.error
        });
        continue;
      }

      const actual = result.classification.prioridade;
      const match = actual === expectedPrio;
      const confidence = (result.classification.confianca * 100).toFixed(0);
      const hasSubtext = result.classification.subtexto_relevante;
      const hasManipulation = result.classification.manipulacao_detectada;
      const secondaryRequests = result.classification.pedidos_secundarios || [];

      if (match) {
        acertos++;
        console.log(`   ✅ ${actual} (confiança: ${confidence}%)`);
      } else {
        erros++;
        console.log(`   ❌ Esperado: ${expectedPrio}, Recebido: ${actual} (confiança: ${confidence}%)`);
      }

      if (hasSubtext) console.log(`      💡 Subtexto detectado`);
      if (hasManipulation) console.log(`      ⚠️  Tentativa de manipulação detectada`);
      if (secondaryRequests.length > 0) console.log(`      📋 Pedidos secundários: ${secondaryRequests.join(', ')}`);

      console.log(`      Raciocínio: ${result.classification.raciocinio}`);

      results.push({
        index: i,
        email: emailDesc,
        expected: expectedPrio,
        actual: actual,
        match: match,
        confidence: confidence,
        subtexto: hasSubtext,
        manipulacao: hasManipulation,
        pedidos: secondaryRequests,
        raciocinio: result.classification.raciocinio
      });

      // Pequeno delay para não sobrecarregar a API
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.log(`   ❌ Exceção: ${error.message}`);
      erros++;
      results.push({
        index: i,
        email: emailDesc,
        expected: expectedPrio,
        actual: 'EXCEPTION',
        match: false,
        error: error.message
      });
    }
  }

  // Relatório final
  console.log(`\n${'─'.repeat(100)}`);
  console.log(`\n📊 RESULTADO FINAL\n`);
  console.log(`Total: ${emails.length} emails`);
  console.log(`✅ Acertos: ${acertos} (${((acertos / emails.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Erros: ${erros} (${((erros / emails.length) * 100).toFixed(1)}%)`);

  // Análise por nível
  console.log(`\n📈 Distribuição de Acertos por Nível:`);
  for (let p = 1; p <= 5; p++) {
    const levelResults = results.filter(r => GABARITO[r.index].expected === `P${p}`);
    const levelAccertos = levelResults.filter(r => r.match).length;
    const levelTotal = levelResults.length;
    console.log(`   P${p}: ${levelAccertos}/${levelTotal} (${((levelAccertos / levelTotal) * 100).toFixed(0)}%)`);
  }

  // Erros
  const failedResults = results.filter(r => !r.match && r.actual !== 'ERROR' && r.actual !== 'EXCEPTION');
  if (failedResults.length > 0) {
    console.log(`\n❌ ERROS DE CLASSIFICAÇÃO (${failedResults.length}):`);
    failedResults.forEach((r, idx) => {
      console.log(`\n   ${idx + 1}. ${r.email}`);
      console.log(`      Esperado: ${r.expected} → Recebido: ${r.actual}`);
      console.log(`      Confiança: ${r.confidence}%`);
      console.log(`      Raciocínio: ${r.raciocinio}`);
    });
  }

  // Salvar JSON
  const reportFile = 'test-results.json';
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: emails.length,
      acertos,
      erros,
      taxa_acerto: ((acertos / emails.length) * 100).toFixed(1)
    },
    resultados: results
  };

  console.log(`\n📝 Relatório salvo em: ${reportFile}`);
  console.log(`${'─'.repeat(100)}\n`);

  return report;
}

classifyBatch().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
