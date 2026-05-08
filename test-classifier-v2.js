import { ClassifierV2 } from './src/classifiers/v2-classifier.js';
import dotenv from 'dotenv';

dotenv.config();

const classifier = new ClassifierV2();

// Exemplos de teste baseados no gabarito do prompt
const testEmails = [
  {
    name: 'Email promocional',
    data: {
      from: 'promo@fornecedor.com',
      to: 'clara@fastdrywall.com.br',
      cc: '',
      subject: 'URGENTE: ÚLTIMA CHANCE - 50% OFF nos materiais!',
      body: 'Aproveite nossa promoção especial de 50% de desconto em todos os materiais drywall. Válido apenas hoje!',
      timestamp: new Date().toISOString(),
      isForwarded: false
    },
    expectedPriority: 'P5'
  },
  {
    name: 'Cliente longevo sinalizando insatisfação',
    data: {
      from: 'Jose Silva <jose@cliente-longevo.com>',
      to: 'clara@fastdrywall.com.br',
      cc: '',
      subject: 'Podemos conversar sobre o contrato?',
      body: `Clara, podemos conversar sobre o contrato?
      Acho que precisamos rever algumas coisas.
      José.`,
      timestamp: new Date().toISOString(),
      isForwarded: false
    },
    expectedPriority: 'P1'
  },
  {
    name: 'Franqueado com problema operacional',
    data: {
      from: 'franqueado@obra.com',
      to: 'clara@fastdrywall.com.br',
      cc: 'gerente@fastdrywall.com.br',
      subject: 'Cliente Tatuapé - Situação crítica',
      body: `Boa tarde Clara, tenho três coisas urgentes:

1) Cliente do Tatuapé está reclamando muito, vai chamar a imprensa amanhã se as placas não chegarem
2) Preciso aprovar folga do Renato para amanhã
3) Lembre da reunião de quinta-feira

Fico no aguardo.`,
      timestamp: new Date().toISOString(),
      isForwarded: false
    },
    expectedPriority: 'P1'
  },
  {
    name: 'Órgão público com prazo',
    data: {
      from: 'sistema@receita.gov.br',
      to: 'financeiro@fastdrywall.com.br',
      cc: '',
      subject: 'Notificação Receita Federal — Pendência DCTFWeb',
      body: 'Notificação Receita Federal — Pendência DCTFWeb — Prazo 5 dias úteis para regularização.',
      timestamp: new Date().toISOString(),
      isForwarded: false
    },
    expectedPriority: 'P1'
  },
  {
    name: 'Dúvida interna não bloqueadora',
    data: {
      from: 'colega@fastdrywall.com.br',
      to: 'clara@fastdrywall.com.br',
      cc: '',
      subject: 'Dúvida sobre procedimento X',
      body: 'Oi Clara, você sabe como é o procedimento para solicitar materiais? Preciso analisar um caso aqui.',
      timestamp: new Date().toISOString(),
      isForwarded: false
    },
    expectedPriority: 'P3'
  },
  {
    name: 'Newsletter informativa',
    data: {
      from: 'newsletter@associacao.com.br',
      to: 'clara@fastdrywall.com.br',
      cc: '',
      subject: 'Boletim mensal - Setor de Construção',
      body: 'Confira as principais notícias do setor este mês...',
      timestamp: new Date().toISOString(),
      isForwarded: false
    },
    expectedPriority: 'P4'
  }
];

async function runTests() {
  console.log('🚀 Testando Classificador V2\n');
  console.log('=' .repeat(80) + '\n');

  let passed = 0;
  let failed = 0;

  for (const test of testEmails) {
    console.log(`📧 ${test.name}`);
    console.log(`   Esperado: ${test.expectedPriority}`);

    try {
      const result = await classifier.classify(test.data);

      if (!result.success) {
        console.log(`   ❌ ERRO: ${result.error}`);
        failed++;
      } else {
        const actualPriority = result.classification.prioridade;
        const confianca = result.classification.confianca;
        const match = actualPriority === test.expectedPriority;

        console.log(`   Obtido: ${actualPriority}`);
        console.log(`   Confiança: ${(confianca * 100).toFixed(0)}%`);
        console.log(`   Raciocínio: ${result.classification.raciocinio}`);

        if (match) {
          console.log(`   ✅ PASSOU`);
          passed++;
        } else {
          console.log(`   ⚠️  NÃO ESPERADO (mas pode estar correto — revise o raciocínio)`);
          failed++;
        }
      }
    } catch (error) {
      console.log(`   ❌ EXCEÇÃO: ${error.message}`);
      failed++;
    }

    console.log();
  }

  console.log('=' .repeat(80));
  console.log(`\n📊 Resultados: ${passed} corretos, ${failed} não esperados/erros\n`);
}

runTests().catch(console.error);
