/**
 * Dashboard web para disparo manual de emails de teste
 * Acesse: http://localhost:3099
 * Uso: node test-sender/server.js
 */

import express from 'express';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import { emails, emailsPorPrioridade, emailAleatorio, PRIORIDADES } from './emails.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3099;
const REMETENTE = process.env.GMAIL_USER || 'barbosa.claraia@gmail.com';
const DESTINATARIO = process.env.DEST_EMAIL || 'clara.barbosa@fastdrywall.com.br';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: REMETENTE, pass: process.env.GMAIL_APP_PASSWORD },
});

const historico = [];

app.post('/api/send', async (req, res) => {
  const { prioridade, index } = req.body;
  const pool = prioridade ? emailsPorPrioridade(prioridade) : emails;
  const email = (index != null) ? pool[index] : pool[Math.floor(Math.random() * pool.length)];
  if (!email) return res.status(400).json({ erro: 'Email não encontrado' });
  try {
    await transporter.sendMail({ from: `"Teste Classificador Fast" <${REMETENTE}>`, to: DESTINATARIO, subject: email.assunto, text: email.corpo });
    const registro = { id: Date.now(), hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), prioridade: email.prioridade, label: PRIORIDADES[email.prioridade], assunto: email.assunto };
    historico.unshift(registro);
    if (historico.length > 100) historico.pop();
    res.json({ ok: true, registro });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/send-all', async (req, res) => {
  const enviados = [];
  for (let p = 1; p <= 5; p++) {
    const pool = emailsPorPrioridade(p);
    const email = pool[Math.floor(Math.random() * pool.length)];
    try {
      await transporter.sendMail({ from: `"Teste Classificador Fast" <${REMETENTE}>`, to: DESTINATARIO, subject: email.assunto, text: email.corpo });
      const r = { id: Date.now() + p, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), prioridade: email.prioridade, label: PRIORIDADES[email.prioridade], assunto: email.assunto };
      historico.unshift(r); enviados.push(r);
    } catch (err) { enviados.push({ prioridade: p, erro: err.message }); }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (historico.length > 100) historico.splice(100);
  res.json({ ok: true, enviados });
});

app.get('/api/historico', (req, res) => res.json(historico));
app.get('/api/emails', (req, res) => res.json(emails.map(({ prioridade, assunto }, i) => ({ i, prioridade, label: PRIORIDADES[prioridade], assunto }))));

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fast — Test Email Sender</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f5f7; color: #1a1a2e; }
header { background: #1a1a2e; color: white; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
header h1 { font-size: 18px; font-weight: 600; }
.badge { background: #e63946; color: white; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; }
.container { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.info-bar { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #555; display: flex; gap: 24px; flex-wrap: wrap; }
h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #333; }
.priority-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 10px; margin-bottom: 24px; }
.p-btn { border: none; border-radius: 8px; padding: 14px 10px; cursor: pointer; font-size: 13px; font-weight: 600; transition: transform 0.1s; text-align: center; }
.p-btn:hover { transform: translateY(-1px); opacity: 0.92; }
.p-btn small { display: block; font-weight: 400; font-size: 11px; margin-top: 3px; opacity: 0.8; }
.p1{background:#e63946;color:white} .p2{background:#f4845f;color:white} .p3{background:#f4a261;color:#1a1a2e} .p4{background:#2a9d8f;color:white} .p5{background:#a8dadc;color:#1a1a2e} .p-all{background:#1a1a2e;color:white} .p-random{background:#457b9d;color:white}
.select-section { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
.select-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
select { border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; font-size: 13px; flex: 1; min-width: 200px; }
.send-btn { background: #1a1a2e; color: white; border: none; border-radius: 6px; padding: 9px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
.log-section { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; }
.log-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.clear-btn { font-size: 12px; color: #888; background: none; border: 1px solid #ddd; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
.log-empty { text-align: center; color: #aaa; font-size: 13px; padding: 32px; }
.log-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.log-item:last-child { border-bottom: none; }
.log-hora { color: #888; font-size: 12px; min-width: 56px; }
.log-badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 10px; min-width: 62px; text-align: center; }
.lb1{background:#fde8ea;color:#c0202d} .lb2{background:#fde8dc;color:#c05000} .lb3{background:#fef3e2;color:#904000} .lb4{background:#e0f5f2;color:#1a7a6e} .lb5{background:#e8f5f6;color:#2c7a80}
.log-assunto { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast { position: fixed; bottom: 24px; right: 24px; background: #1a1a2e; color: white; padding: 12px 20px; border-radius: 8px; font-size: 13px; opacity: 0; transform: translateY(10px); transition: all 0.3s; pointer-events: none; }
.toast.show { opacity: 1; transform: translateY(0); } .toast.error { background: #c0202d; }
</style>
</head>
<body>
<header>
  <h1>⚡ Fast — Test Email Sender</h1>
  <span class="badge">DEV</span>
  <span style="margin-left:auto">Para: <strong>${DESTINATARIO}</strong></span>
</header>
<div class="container">
  <div class="info-bar">
    <span>De: <strong>${REMETENTE}</strong></span>
    <span>Para: <strong>${DESTINATARIO}</strong></span>
    <span>Banco: <strong>20 emails × 5 prioridades</strong></span>
  </div>
  <h2>Disparo rápido por prioridade</h2>
  <div class="priority-grid">
    <button class="p-btn p1" onclick="enviar({prioridade:1})">🔴 P1 — Urgente<small>1 aleatório</small></button>
    <button class="p-btn p2" onclick="enviar({prioridade:2})">🟠 P2 — Alta<small>1 aleatório</small></button>
    <button class="p-btn p3" onclick="enviar({prioridade:3})">🟡 P3 — Média<small>1 aleatório</small></button>
    <button class="p-btn p4" onclick="enviar({prioridade:4})">🟢 P4 — Baixa<small>1 aleatório</small></button>
    <button class="p-btn p5" onclick="enviar({prioridade:5})">⚪ P5 — Mínima<small>1 aleatório</small></button>
    <button class="p-btn p-random" onclick="enviar({})">🎲 Aleatório<small>qualquer nível</small></button>
    <button class="p-btn p-all" onclick="enviarTodos()">📦 Enviar todos<small>1 de cada</small></button>
  </div>
  <div class="select-section">
    <h2>Escolher email específico</h2>
    <div class="select-row">
      <select id="emailSelect"><option>Carregando...</option></select>
      <button class="send-btn" onclick="enviarEspecifico()">Enviar este →</button>
    </div>
  </div>
  <div class="log-section">
    <div class="log-header">
      <h2>Histórico de envios</h2>
      <button class="clear-btn" onclick="hist=[];renderLog()">Limpar</button>
    </div>
    <div id="log"><div class="log-empty">Nenhum email enviado ainda.</div></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const LABELS={1:'URGENTE',2:'ALTA',3:'MÉDIA',4:'BAIXA',5:'MÍNIMA'};
const LCLS={1:'lb1',2:'lb2',3:'lb3',4:'lb4',5:'lb5'};
let hist=[];
fetch('/api/emails').then(r=>r.json()).then(lista=>{
  document.getElementById('emailSelect').innerHTML=lista.map(e=>\`<option value="\${e.i}" data-p="\${e.prioridade}">[P\${e.prioridade}] \${e.assunto.slice(0,65)}\${e.assunto.length>65?'…':''}</option>\`).join('');
});
async function enviar(body){
  try{
    const r=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!d.ok) throw new Error(d.erro);
    hist.unshift(d.registro); renderLog();
    toast(\`✅ P\${d.registro.prioridade} enviado às \${d.registro.hora}\`);
  }catch(e){toast('❌ '+e.message,true);}
}
async function enviarTodos(){
  toast('Enviando 5 emails…');
  const r=await fetch('/api/send-all',{method:'POST',headers:{'Content-Type':'application/json'}});
  const d=await r.json();
  d.enviados.forEach(x=>{if(!x.erro)hist.unshift(x);}); renderLog();
  toast('✅ 5 emails enviados!');
}
function enviarEspecifico(){
  const sel=document.getElementById('emailSelect');
  const p=parseInt(sel.options[sel.selectedIndex].dataset.p);
  const poolIdx=[...sel.options].filter(o=>parseInt(o.dataset.p)===p).indexOf(sel.options[sel.selectedIndex]);
  enviar({prioridade:p,index:poolIdx});
}
function renderLog(){
  const el=document.getElementById('log');
  if(!hist.length){el.innerHTML='<div class="log-empty">Nenhum email enviado ainda.</div>';return;}
  el.innerHTML=hist.map(r=>\`<div class="log-item"><span class="log-hora">\${r.hora}</span><span class="log-badge \${LCLS[r.prioridade]}">P\${r.prioridade} \${LABELS[r.prioridade]}</span><span class="log-assunto" title="\${r.assunto}">\${r.assunto}</span></div>\`).join('');
}
let tt;function toast(msg,err=false){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show'+(err?' error':'');clearTimeout(tt);tt=setTimeout(()=>t.className='toast',3000);}
</script>
</body></html>`);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard: http://localhost:${PORT}`);
  console.log(`📬 De: ${REMETENTE} → Para: ${DESTINATARIO}\n`);
});
