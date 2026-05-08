#!/usr/bin/env node

/**
 * Script: Validação de Semana 3
 *
 * Uso: node scripts/check-validation.js [funcionario_id]
 *
 * Responsabilidades:
 * 1. Conectar ao Convex
 * 2. Buscar métricas da semana
 * 3. Validar contra critérios de sucesso
 * 4. Exibir dashboard
 */

import { ConvexClient } from 'convex/browser';
import { ValidationDashboard } from '../src/reports/validation-dashboard.js';
import dotenv from 'dotenv';

dotenv.config();

async function executarValidacao() {
  try {
    const funcionarioId = process.argv[2] || 'placeholder-funcionario';

    console.log('🔍 Iniciando validação de Semana 3...\n');

    // Inicializar Convex
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error('CONVEX_URL não configurada em .env');
    }

    const convexClient = new ConvexClient(convexUrl);

    // Inicializar dashboard
    const dashboard = new ValidationDashboard(convexClient);

    // Exibir métricas e validação
    const resultado = await dashboard.exibir(funcionarioId);

    // Exit code: 0 se passou, 1 se falhou
    process.exit(resultado.validacao.passou ? 0 : 1);
  } catch (err) {
    console.error('❌ Erro ao validar:', err.message);
    process.exit(1);
  }
}

executarValidacao();
