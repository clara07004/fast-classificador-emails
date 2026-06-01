/**
 * Script de Backup do Convex (S5)
 *
 * Exporta as tabelas criticas para um arquivo JSON comprimido (gzip).
 * Tabelas exportadas:
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
import { createWriteStream, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';

// Carregar .env manualmente (sem dependencia de dotenv)
import { readFileSync } from 'fs';

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
// Backup
// ---------------------------------------------------------------------------

async function executarBackup() {
  const inicio = Date.now();
  const funcionarioId = process.env.PILOTO_FUNCIONARIO_ID;

  if (!funcionarioId) {
    console.error('[backup] PILOTO_FUNCIONARIO_ID nao configurado — abortando');
    process.exit(1);
  }

  console.log(`[backup] Iniciando export — funcionarioId: ${funcionarioId}`);

  // 1. Exportar as tres tabelas em paralelo
  let correcoes, movimentos, diffs;
  try {
    [correcoes, movimentos, diffs] = await Promise.all([
      chamarGateway('emails.exportarCorrecoes',     { funcionarioId }),
      chamarGateway('emails.exportarMovimentos',    { funcionarioId }),
      chamarGateway('emails.exportarDiffRascunhos', { funcionarioId }),
    ]);
  } catch (err) {
    console.error(`[backup] Erro ao exportar dados do Convex: ${err.message}`);
    process.exit(1);
  }

  console.log(`[backup] Dados exportados — correcoes: ${correcoes.length}, movimentos: ${movimentos.length}, diffs: ${diffs.length}`);

  // 2. Montar payload
  const payload = JSON.stringify({
    exportadoEm: new Date().toISOString(),
    funcionarioId,
    totais: {
      correcoes: correcoes.length,
      movimentos: movimentos.length,
      diffs: diffs.length,
    },
    correcoes,
    movimentos,
    diffs,
  }, null, 2);

  // 3. Garantir diretorio de backups
  const backupDir = path.join(ROOT, 'backups');
  mkdirSync(backupDir, { recursive: true });

  // 4. Salvar arquivo comprimido
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

  // 5. Limpar backups antigos (manter os 7 mais recentes)
  try {
    const arquivos = readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json.gz'))
      .sort() // ordem lexicografica = ordem cronologica (YYYY-MM-DD)
      .reverse(); // mais recentes primeiro

    const paraApagar = arquivos.slice(7); // manter 7
    for (const arquivo of paraApagar) {
      unlinkSync(path.join(backupDir, arquivo));
      console.log(`[backup] Removido backup antigo: ${arquivo}`);
    }
  } catch (err) {
    console.warn(`[backup] Aviso ao limpar backups antigos: ${err.message}`);
  }

  const duracaoMs = Date.now() - inicio;
  console.log(`[backup] Concluido em ${duracaoMs}ms — arquivo: ${nomeArquivo}`);
}

executarBackup().catch(err => {
  console.error(`[backup] Falha fatal: ${err.message}`);
  process.exit(1);
});
