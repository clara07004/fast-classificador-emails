#!/usr/bin/env node

/**
 * Script: Executar Relatório Semanal
 *
 * Uso: node scripts/run-weekly-report.js
 *
 * Cron: 0 9 * * 1 (segunda-feira 9am)
 *
 * Responsabilidades:
 * 1. Buscar todos os funcionários ativos
 * 2. Para cada funcionário, gerar relatório
 * 3. Enviar via email
 */

import { ConvexClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { WeeklyFeedbackReport } from '../src/reports/weekly-feedback-report.js';
import dotenv from 'dotenv';

dotenv.config();

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'mail.cscempresarial.com.br',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  from: process.env.SMTP_FROM || 'noreply@fastdrywall.com.br',
};

async function executarRelatorioSemanal() {
  try {
    console.log('📊 Iniciando geração de relatórios semanais...\n');

    // Inicializar Convex
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error('CONVEX_URL não configurada em .env');
    }

    const convexClient = new ConvexClient(convexUrl);

    // Inicializar gerador de relatórios
    const relatorioGenerator = new WeeklyFeedbackReport(convexClient, SMTP_CONFIG);

    // TODO: Buscar lista de funcionários ativos quando schema existir
    // const funcionarios = await convexClient.query(
    //   api.funcionarios.buscarAtivos
    // );

    // Por enquanto, usar placeholder
    const funcionarios = [
      {
        _id: 'placeholder-1',
        email: process.env.TEST_EMAIL || 'clara.barbosa@fastdrywall.com.br',
        nome: 'Clara Barbosa (Teste)',
      }
    ];

    console.log(`📋 Processando ${funcionarios.length} funcionário(s)...\n`);

    for (const func of funcionarios) {
      console.log(`👤 ${func.nome} (${func.email})`);

      try {
        await relatorioGenerator.executarRelatorioCompleto(func._id, func.email);
        console.log(`   ✅ Relatório enviado\n`);
      } catch (err) {
        console.error(`   ❌ Erro: ${err.message}\n`);
      }
    }

    console.log('✅ Relatórios semanais completos!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao gerar relatórios:', err.message);
    process.exit(1);
  }
}

// Executar
executarRelatorioSemanal();
