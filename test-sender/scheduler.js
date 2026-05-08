/**
 * Agendador automático — envia emails aleatórios ao longo do dia
 * Uso:
 *   node test-sender/scheduler.js              → 8 emails entre 8h e 18h
 *   node test-sender/scheduler.js --count=12   → 12 emails
 *   node test-sender/scheduler.js --now        → envia 1 agora (teste rápido)
 */

import nodemailer from 'nodemailer';
import 'dotenv/config';
import { emailAleatorio, PRIORIDADES } from './emails.js';

const REMETENTE = process.env.GMAIL_USER || 'barbosa.claraia@gmail.com';
const DESTINATARIO = process.env.DEST_EMAIL || 'clara.barbosa@fastdrywall.com.br';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: REMETENTE, pass: process.env.GMAIL_APP_PASSWORD },
});

function parseArgs() {
  const args = process.argv.slice(2);
  const r = { count: 8, startHour: 8, endHour: 18, now: false };
  for (const arg of args) {
    if (arg === '--now') r.now = true;
    else if (arg.startsWith('--count=')) r.count = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--start=')) r.startHour = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--end=')) r.endHour = parseInt(arg.split('=')[1]);
  }
  return r;
}

function agora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function gerarAgendamentos(count, startHour, endHour) {
  const now = Date.now();
  const startMs = Math.max(new Date().setHours(startHour, 0, 0, 0), now + 5000);
  const endMs = new Date().setHours(endHour, 0, 0, 0);
  if (startMs >= endMs) return [];
  return Array.from({ length: count }, () => Math.round(startMs + Math.random() * (endMs - startMs))).sort((a, b) => a - b);
}

async function enviarEmail(email) {
  await transporter.sendMail({
    from: `"Teste Classificador Fast" <${REMETENTE}>`,
    to: DESTINATARIO,
    subject: email.assunto,
    text: email.corpo,
  });
}

async function main() {
  const { count, startHour, endHour, now: enviarAgora } = parseArgs();

  if (!process.env.GMAIL_APP_PASSWORD) {
    console.error('❌ GMAIL_APP_PASSWORD não definido no .env'); process.exit(1);
  }

  console.log(`\n🕐 Fast Email Scheduler — ${agora()}`);
  console.log(`📬 De: ${REMETENTE} → Para: ${DESTINATARIO}`);

  if (enviarAgora) {
    const email = emailAleatorio();
    console.log(`\n📤 Enviando AGORA [P${email.prioridade} - ${PRIORIDADES[email.prioridade]}]: ${email.assunto}`);
    await enviarEmail(email);
    console.log(`✅ Enviado`);
    return;
  }

  const agendamentos = gerarAgendamentos(count, startHour, endHour);

  if (!agendamentos.length) {
    console.log(`\n⚠️  Janela ${startHour}h–${endHour}h já encerrada. Use --now para envio imediato.`);
    return;
  }

  console.log(`\n📅 ${agendamentos.length} email(s) agendados entre ${startHour}h e ${endHour}h:`);
  agendamentos.forEach((t, i) => {
    console.log(`   ${i + 1}. ${new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  });

  let enviados = 0;
  for (const timestamp of agendamentos) {
    const espera = timestamp - Date.now();
    if (espera > 0) await sleep(espera);

    const email = emailAleatorio();
    console.log(`\n📤 [${agora()}] [P${email.prioridade} - ${PRIORIDADES[email.prioridade]}]: ${email.assunto}`);
    try {
      await enviarEmail(email);
      console.log(`✅ Enviado (${++enviados}/${agendamentos.length})`);
    } catch (err) {
      console.error(`❌ Falha: ${err.message}`);
    }
  }

  console.log(`\n🏁 Encerrado. ${enviados}/${agendamentos.length} enviados.`);
}

main().catch(err => { console.error('❌ Erro fatal:', err.message); process.exit(1); });
