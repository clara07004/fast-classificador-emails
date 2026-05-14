#!/usr/bin/env node

/**
 * Healthcheck do classificador de emails.
 *
 * Verifica se o worker está vivo e processando, consultando a tabela
 * `estadoProcessamento` no Convex. Se a última atividade for mais antiga
 * que o threshold (30 min), envia email de alerta.
 *
 * Por que via Convex e não direto no PM2:
 * - PM2 pode mostrar processo "online" enquanto o worker está travado
 *   ou em estado zumbi internamente (já vimos isso acontecer).
 * - O Convex é atualizado por dentro do worker — se o worker está
 *   processando de verdade, o `ultimaAtualizacao` fica fresco.
 * - Indireto pega mais cenários de falha real (PM2 morto, IDLE zumbi,
 *   exception silenciosa, IMAP down — todos resultam em ultimaAtualizacao
 *   parando de avançar).
 *
 * Cooldown de 1h entre alertas evita inundar o email se um problema
 * persistir por horas. O arquivo de cooldown fica em /tmp.
 *
 * Uso: node scripts/healthcheck.js
 * Cron sugerido: a cada 5 minutos.
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';
import { ConvexClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import fs from 'fs';

const FUNCIONARIO_ID = process.env.PILOTO_FUNCIONARIO_ID;
const CONVEX_URL = process.env.CONVEX_URL;
const ALERT_EMAIL = process.env.ALERT_EMAIL || process.env.SMTP_USER;
const COOLDOWN_FILE = '/tmp/classificador-healthcheck-last-alert.txt';
const COOLDOWN_MIN = 60; // 1h entre alertas
const STALE_THRESHOLD_MIN = 30; // worker sem atividade nesse tempo = problema

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function verificarEstado() {
  const problemas = [];

  // 1. Validar configuração
  if (!CONVEX_URL) {
    problemas.push('CONVEX_URL não configurada em .env');
    return problemas;
  }
  if (!FUNCIONARIO_ID) {
    problemas.push('PILOTO_FUNCIONARIO_ID não configurada em .env');
    return problemas;
  }
  if (!ALERT_EMAIL) {
    problemas.push('ALERT_EMAIL e SMTP_USER vazios — sem destinatário pra alerta');
    return problemas;
  }

  // 2. Consultar última atividade no Convex
  let client;
  try {
    client = new ConvexClient(CONVEX_URL);
    const estado = await client.query(api.estado.obterEstado, {
      funcionarioId: FUNCIONARIO_ID,
    });

    if (!estado) {
      problemas.push(
        `estadoProcessamento não encontrado pro funcionário ${FUNCIONARIO_ID}`
      );
    } else {
      const ultimaAtividade = estado.ultimaAtualizacao || 0;
      const diffMs = Date.now() - ultimaAtividade;
      const diffMin = Math.round(diffMs / 1000 / 60);

      if (diffMin > STALE_THRESHOLD_MIN) {
        problemas.push(
          `Worker sem atividade há ${diffMin} min (limite: ${STALE_THRESHOLD_MIN} min). ` +
            `Última atualização: ${new Date(ultimaAtividade).toISOString()}. ` +
            `Status conexão IMAP no Convex: ${estado.statusConexao || 'desconhecido'}.`
        );
      }
    }
  } catch (err) {
    problemas.push(`Erro ao consultar Convex: ${err.message}`);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (_e) {
        // ignora
      }
    }
  }

  return problemas;
}

function emCooldown() {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) return false;
    const ultimoAlerta = parseInt(fs.readFileSync(COOLDOWN_FILE, 'utf8'), 10);
    if (Number.isNaN(ultimoAlerta)) return false;
    const diffMin = (Date.now() - ultimoAlerta) / 1000 / 60;
    return diffMin < COOLDOWN_MIN;
  } catch (_err) {
    return false;
  }
}

function registrarAlerta() {
  try {
    fs.writeFileSync(COOLDOWN_FILE, String(Date.now()));
  } catch (err) {
    log(`Aviso: não foi possível gravar cooldown em ${COOLDOWN_FILE}: ${err.message}`);
  }
}

async function enviarAlerta(problemas) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const corpo = [
    'Healthcheck do classificador de emails detectou um ou mais problemas:',
    '',
    ...problemas.map((p, i) => `${i + 1}. ${p}`),
    '',
    'Próximas ações sugeridas:',
    '- Verificar status do PM2 no servidor: `pm2 list`',
    '- Ver logs recentes: `pm2 logs classificador-email --lines 50 --nostream`',
    '- Conferir conectividade IMAP/Convex/Anthropic',
    '',
    `Horário do check: ${new Date().toISOString()}`,
    `Cooldown: 1 hora (próximo alerta só após ${COOLDOWN_MIN} min)`,
  ].join('\n');

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: ALERT_EMAIL,
    subject: '⚠️ ALERTA: Classificador de emails sem atividade',
    text: corpo,
  });
}

async function main() {
  const problemas = await verificarEstado();

  if (problemas.length === 0) {
    log('OK — worker ativo, sem problemas detectados');
    process.exit(0);
  }

  log(`${problemas.length} problema(s) detectado(s):`);
  problemas.forEach((p, i) => log(`  ${i + 1}. ${p}`));

  if (emCooldown()) {
    log(`Em cooldown (último alerta há menos de ${COOLDOWN_MIN} min). Não envia email.`);
    process.exit(0);
  }

  try {
    await enviarAlerta(problemas);
    registrarAlerta();
    log('Alerta enviado por email.');
  } catch (err) {
    log(`ERRO ao enviar alerta: ${err.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  log(`Healthcheck crashou: ${err.message}`);
  process.exit(1);
});
