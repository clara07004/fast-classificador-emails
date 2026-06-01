/**
 * Script de Backup do Convex (S5) — v2 multi-tenant
 *
 * Exporta as tabelas criticas para um arquivo JSON comprimido (gzip).
 * Tabelas exportadas por funcionario:
 *   - correcoes       — dados de aprendizado (RAG Fase 2)
 *   - email_movements — feedback de reclassificacao
 *   - draft_diffs     — aprendizado de estilo por funcionario
 *
 * Uso:
 *   node src/backup/exportar-convex.js
 *
 * Saida:
 *   backups/backup-YYYY-MM-DD.json.gz
 *   (mantém os últimos 7 backups, deleta os mais antigos)
 *
 * Agendamento recomendado (crontab):
 *   0 3 * * * cd /home/jelastic/fast-classificador-emails && node src/backup/exportar-convex.js >> logs/backup.log 2>&1
 */

import { createGzip } from 'zlib';
import { createWriteStream, readdirSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Carregar variaveis de ambiente
// ---------------------------------------------------------------------------

function carregarEnv() {
  try {
    const envPath = path.join(ROOT, '.env');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env nao existe — usar variaveis ja no ambiente
  }
}

carregarEnv();

// ---------------------------------------------------------------------------
// GatewayClient minimo (sem dependencia do modulo principal)
// ---------------------------------------------------------------------------

async function chamarGateway(fn, args) {
  const convexUrl = process.env.CONVEX_URL;
  const token = process.env.CONVEX_AUTH_TOKEN;

  if (!convexUrl || !token) {
    throw new Error('CONVEX_URL ou CONVEX_AUTH_TOKEN nao configurados');
  }

  const siteUrl = convexUrl.replace('.convex.cloud', '.convex.site');
  const endpoint = siteUrl.replace(/\/$/, '') + '/api';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ fn, type: 'query', args }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.erro || `HTTP ${res.status}`);
  return json.resultado;
}

// ---------------------------------------------------------------------------
// Export de dados de um funcionario
// ---------------------------------------------------------------------------

async function exportarFuncionario(funcionario) {
  const funcionarioId = funcionario._id;
  const label = funcionario.nome || funcionario.email || funcionarioId;

  let correcoes, movimentos, diffs;
  try {
    [correcoes, movimentos, diffs] = await Promise.all([
      chamarGateway('emails.exportarCorrecoes',     { funcionarioId }),
      chamarGateway('emails.exportarMovimentos',    { funcionarioId }),
      chamarGateway('emails.exportarDiffRascunhos', { funcionarioId }),
    ]);
  } catch (err) {
    console.error(`[backup] Erro ao exportar ${label}: ${err.message}`);
    throw err;
  }

  console.log(
    `[backup] ${label} — correcoes: ${correcoes.length}, movimentos: ${movimentos.length}, diffs: ${diffs.length}`
  );

  return {
    funcionarioId,
    nome: funcionario.nome || null,
    email: funcionario.email || null,
    totais: {
      correcoes: correcoes.length,
      movimentos: movimentos.length,
      diffs: diffs.length,
    },
    correcoes,
    movimentos,
    diffs,
  };
}

// ---------------------------------------------------------------------------
// Backup principal
// ---------------------------------------------------------------------------

async function executarBackup() {
  const inicio = Date.now();

  // 1. Carregar funcionarios ativos do Convex
  let funcionarios;
  try {
    funcionarios = await chamarGateway('funcionarios.listarAtivos', {});
  } catch (err) {
    console.error(`[backup] Erro ao listar funcionarios ativos: ${err.message}`);
    process.exit(1);
  }

  // Fallback: se Convex nao retornar ninguem, tentar PILOTO_FUNCIONARIO_ID do .env
  if (!funcionarios || funcionarios.length === 0) {
    const pilotoId = process.env.PILOTO_FUNCIONARIO_ID;
    if (pilotoId) {
      console.warn('[backup] Nenhum funcionario ativo no Convex — usando PILOTO_FUNCIONARIO_ID como fallback');
      funcionarios = [{ _id: pilotoId, nome: 'Piloto', email: null }];
    } else {
      console.error('[backup] Nenhum funcionario ativo e PILOTO_FUNCIONARIO_ID nao configurado — abortando');
      process.exit(1);
    }
  }

  console.log(`[backup] Exportando dados de ${funcionarios.length} funcionario(s)...`);

  // 2. Exportar todos os funcionarios em paralelo
  const resultados = await Promise.allSettled(
    funcionarios.map(f => exportarFuncionario(f))
  );

  const exportados = [];
  const falhas = [];

  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    if (r.status === 'fulfilled') {
      exportados.push(r.value);
    } else {
      const f = funcionarios[i];
      falhas.push({ funcionarioId: f._id, erro: r.reason?.message });
      console.error(`[backup] Falha ao exportar ${f.nome || f._id}: ${r.reason?.message}`);
    }
  }

  if (exportados.length === 0) {
    console.error('[backup] Nenhum funcionario exportado com sucesso — abortando');
    process.exit(1);
  }

  // 3. Montar payload agregado
  const totaisGerais = exportados.reduce(
    (acc, d) => ({
      correcoes: acc.correcoes + d.totais.correcoes,
      movimentos: acc.movimentos + d.totais.movimentos,
      diffs: acc.diffs + d.totais.diffs,
    }),
    { correcoes: 0, movimentos: 0, diffs: 0 }
  );

  const payload = JSON.stringify({
    exportadoEm: new Date().toISOString(),
    versao: 2, // v1 = single-tenant, v2 = multi-tenant
    totalFuncionarios: exportados.length,
    falhas: falhas.length > 0 ? falhas : undefined,
    totaisGerais,
    funcionarios: exportados,
  }, null, 2);

  // 4. Garantir diretorio de backups
  const backupDir = path.join(ROOT, 'backups');
  mkdirSync(backupDir, { recursive: true });

  // 5. Salvar arquivo comprimido
  const data = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const nomeArquivo = `backup-${data}.json.gz`;
  const caminho = path.join(backupDir, nomeArquivo);

  try {
    const readable = Readable.from([payload]);
    const gzip = createGzip({ level: 9 });
    const saida = createWriteStream(caminho);
    await pipeline(readable, gzip, saida);
  } catch (err) {
    console.error(`[backup] Erro ao gravar arquivo: ${err.message}`);
    process.exit(1);
  }

  // 6. Limpar backups antigos (manter os 7 mais recentes)
  try {
    const arquivos = readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json.gz'))
      .sort()   // ordem lexicografica = ordem cronologica (YYYY-MM-DD)
      .reverse(); // mais recentes primeiro

    const paraApagar = arquivos.slice(7);
    for (const arquivo of paraApagar) {
      unlinkSync(path.join(backupDir, arquivo));
      console.log(`[backup] Removido backup antigo: ${arquivo}`);
    }
  } catch (err) {
    console.warn(`[backup] Aviso ao limpar backups antigos: ${err.message}`);
  }

  const duracaoMs = Date.now() - inicio;
  const sufixoFalhas = falhas.length > 0 ? ` — ${falhas.length} falha(s)` : '';
  console.log(`[backup] Concluido em ${duracaoMs}ms — ${exportados.length} funcionario(s) — arquivo: ${nomeArquivo}${sufixoFalhas}`);

  // Sair com codigo 2 se houve falhas parciais (permite detectar no cron/monitoramento)
  if (falhas.length > 0) process.exit(2);
}

executarBackup().catch(err => {
  console.error(`[backup] Falha fatal: ${err.message}`);
  process.exit(1);
});
