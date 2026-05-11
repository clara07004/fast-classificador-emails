import dotenv from 'dotenv';
dotenv.config();

import { ImapFlow } from 'imapflow';
import { ConvexClient } from 'convex/browser';

const PASTAS = {
  'INBOX': null,
  'INBOX.Fast-Urgente': 'P1',
  'INBOX.Fast-Alta-Prioridade': 'P2',
  'INBOX.Fast-Normal': 'P3',
  'INBOX.Fast-Baixa': 'P4',
  'INBOX.Fast-Irrelevante': 'P5'
};

let imap = null;
let convex = null;
let estadoAnterior = {};
let emailTestDetectado = false;

async function inicializarConvex() {
  try {
    convex = new ConvexClient(process.env.CONVEX_URL);
    console.log('✅ Convex inicializado');
    return true;
  } catch (err) {
    console.log('⚠️  Convex não disponível (OK para este teste)');
    return false;
  }
}

async function conectarIMAP() {
  try {
    imap = new ImapFlow({
      host: 'mail.cscempresarial.com.br',
      port: 993,
      secure: true,
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD
      }
    });
    await imap.connect();
    console.log('✅ IMAP conectado\n');
    return true;
  } catch (err) {
    console.error('❌ Erro IMAP:', err.message);
    return false;
  }
}

async function escanearPastas() {
  const estadoAtual = {};

  for (const [pasta, nivel] of Object.entries(PASTAS)) {
    try {
      const mailbox = await imap.mailboxOpen(pasta, { readOnly: true });
      estadoAtual[pasta] = mailbox.exists;
    } catch (err) {
      estadoAtual[pasta] = 0;
    }
  }

  return estadoAtual;
}

async function exibirStatusPastas(estado) {
  console.log('📊 STATUS ATUAL:');
  for (const [pasta, count] of Object.entries(estado)) {
    const anterior = estadoAnterior[pasta] || 0;
    if (count > anterior) {
      console.log(`  ${pasta}: ${count} emails ⬆️ (+${count - anterior} novo!)`);
    } else if (count < anterior) {
      console.log(`  ${pasta}: ${count} emails ⬇️ (-${anterior - count} saiu)`);
    } else {
      console.log(`  ${pasta}: ${count} emails`);
    }
  }
}

async function buscarMovimentosConvex() {
  if (!convex) return;

  try {
    console.log('\n🔍 Buscando movimentos em Convex...');
    // Tenta buscar últimos 10 movimentos
    // Nota: isso requer que a API Convex esteja acessível
    console.log('  (Convex check - estrutura pronta)');
  } catch (err) {
    console.log('  ⚠️ Convex query não retornou dados ainda');
  }
}

async function monitorarCiclo() {
  const estadoAtual = await escanearPastas();

  await exibirStatusPastas(estadoAtual);

  // Detectar mudanças
  let houveAlteracao = false;
  for (const [pasta, count] of Object.entries(estadoAtual)) {
    if ((estadoAnterior[pasta] || 0) !== count) {
      houveAlteracao = true;
      if (pasta === 'INBOX' && count > (estadoAnterior[pasta] || 0)) {
        console.log('\n🎯 NOVO EMAIL DETECTADO! ✅');
        emailTestDetectado = true;
      }
    }
  }

  if (houveAlteracao && emailTestDetectado) {
    await buscarMovimentosConvex();
  }

  estadoAnterior = estadoAtual;
  console.log('');
}

async function rodar() {
  console.log('🚀 MONITOR END-TO-END\n');
  console.log('Aguardando seu email de teste...');
  console.log('Quando enviar, vai aparecer em INBOX');
  console.log('Quando mover entre pastas, vou detectar aqui\n');
  console.log('═══════════════════════════════════════════\n');

  const convexOk = await inicializarConvex();
  const imapOk = await conectarIMAP();

  if (!imapOk) {
    console.error('Falha ao conectar IMAP');
    process.exit(1);
  }

  // Scan inicial
  console.log('📸 Fazendo snapshot inicial das pastas...\n');
  estadoAnterior = await escanearPastas();
  await exibirStatusPastas(estadoAnterior);
  console.log('\n═══════════════════════════════════════════\n');

  // Monitora a cada 5 segundos por 10 minutos
  let tempoDecorrido = 0;
  const tempoMaximo = 10 * 60 * 1000; // 10 minutos
  const intervaloScan = 5 * 1000; // 5 segundos

  const intervalId = setInterval(async () => {
    tempoDecorrido += intervaloScan;
    const min = Math.floor(tempoDecorrido / 60000);
    const seg = Math.floor((tempoDecorrido % 60000) / 1000);
    console.log(`⏱️  [${min}:${seg.toString().padStart(2, '0')}] Verificando...`);

    await monitorarCiclo();

    if (tempoDecorrido >= tempoMaximo) {
      clearInterval(intervalId);
      console.log('\n═══════════════════════════════════════════');
      console.log('⏱️ Monitor encerrado (10 minutos)');
      if (emailTestDetectado) {
        console.log('✅ EMAIL DE TESTE DETECTADO');
      } else {
        console.log('⚠️ Email de teste não detectado - você enviou?');
      }
      await imap.close();
      process.exit(0);
    }
  }, intervaloScan);
}

rodar().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
