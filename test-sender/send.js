/**
 * CLI de disparo manual de emails de teste
 * Uso:
 *   node test-sender/send.js --all
 *   node test-sender/send.js --priority=1
 *   node test-sender/send.js --random --count=3
 */

import nodemailer from 'nodemailer';
import 'dotenv/config';
import { emailsPorPrioridade, emailAleatorio, PRIORIDADES } from './emails.js';

const REMETENTE = process.env.GMAIL_USER || 'barbosa.claraia@gmail.com';
const DESTINATARIO = process.env.DEST_EMAIL || 'clara.barbosa@fastdrywall.com.br';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: REMETENTE, pass: process.env.GMAIL_APP_PASSWORD },
});

async function enviarEmail(email) {
  console.log(`\n📤 [P${email.prioridade} - ${PRIORIDADES[email.prioridade]}]: ${email.assunto}`);
  await transporter.sendMail({
    from: `"Teste Classificador Fast" <${REMETENTE}>`,
    to: DESTINATARIO,
    subject: email.assunto,
    text: email.corpo,
  });
  console.log(`✅ Enviado`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgs() {
  const args = process.argv.slice(2);
  const r = { mode: null, priority: null, count: 1 };
  for (const arg of args) {
    if (arg === '--all') r.mode = 'all';
    else if (arg === '--random') r.mode = 'random';
    else if (arg.startsWith('--priority=')) { r.mode = 'priority'; r.priority = parseInt(arg.split('=')[1]); }
    else if (arg.startsWith('--count=')) r.count = parseInt(arg.split('=')[1]);
  }
  return r;
}

async function main() {
  const { mode, priority, count } = parseArgs();

  if (!process.env.GMAIL_APP_PASSWORD) {
    console.error('❌ GMAIL_APP_PASSWORD não definido no .env'); process.exit(1);
  }

  console.log(`\n🚀 Fast Email Test Sender`);
  console.log(`📬 De: ${REMETENTE} → Para: ${DESTINATARIO}\n`);

  if (mode === 'all') {
    for (let p = 1; p <= 5; p++) {
      const pool = emailsPorPrioridade(p);
      await enviarEmail(pool[Math.floor(Math.random() * pool.length)]);
      if (p < 5) await sleep(2000);
    }
    console.log(`\n✅ 5 emails enviados (1 por prioridade)`);
  } else if (mode === 'priority') {
    const pool = emailsPorPrioridade(priority);
    for (let i = 0; i < count; i++) {
      await enviarEmail(pool[i % pool.length]);
      if (i < count - 1) await sleep(1500);
    }
  } else if (mode === 'random') {
    for (let i = 0; i < count; i++) {
      await enviarEmail(emailAleatorio());
      if (i < count - 1) await sleep(1500);
    }
  } else {
    console.log(`
Uso:
  node test-sender/send.js --all                   → 1 de cada prioridade
  node test-sender/send.js --random                → 1 aleatório
  node test-sender/send.js --random --count=5      → 5 aleatórios
  node test-sender/send.js --priority=1            → 1 urgente
  node test-sender/send.js --priority=3 --count=2  → 2 de prioridade média
`);
  }
}

main().catch(err => { console.error('❌ Erro:', err.message); process.exit(1); });
