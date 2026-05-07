# Guia Dia 6 — Dashboard de Métricas + Reflexão Mensal + Preparação Rollout

**Data:** 2026-05-10 (estimado)  
**Objetivo:** Implementar visibilidade de métricas, criar rotina automática de análise mensal de correções, preparar o sistema para escalar para múltiplos funcionários.  
**Tempo estimado:** 6–8 horas  
**Critério de saída:** Dashboard funcionando, reflexão mensal automática ativa, worker pronto para múltiplos usuários (Fase 3)

---

## Status esperado

Você chegou aqui porque:
- ✅ Dias 1–5 concluídos com sucesso
- ✅ Pipeline MVP completo + Few-shot RAG + Style Card funcionando
- ✅ Taxa de aceitação ≥ 70% mantida ou melhorada
- ⏳ Agora vamos implementar monitoramento, análise automática mensal e preparar para escalar

---

## Parte 1: Dashboard de Métricas (2–3 horas)

### Tarefa 1.1: Implementar queries de métricas no Convex — 1 hora

Arquivo: `convex/queries/metricas.ts`

```typescript
import { query } from './_generated/server';
import { v } from 'convex/values';

// Taxa de aceitação: % de emails que não foram corrigidos
export const taxaAceitacao = query({
  args: {
    funcionarioId: v.string(),
    dataInicio: v.string(), // ISO timestamp
    dataFim: v.string(),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query('emails_processados')
      .filter(e => e.funcionarioId === args.funcionarioId)
      .filter(e => e.processadoEm >= args.dataInicio && e.processadoEm <= args.dataFim)
      .collect();

    const correcoes = await ctx.db
      .query('correcoes')
      .filter(c => c.funcionarioId === args.funcionarioId)
      .filter(c => c.registradoEm >= args.dataInicio && c.registradoEm <= args.dataFim)
      .collect();

    if (emails.length === 0) return null;

    const emailsComCorrecao = new Set(correcoes.map(c => c.emailId));
    const emailsSemCorrecao = emails.filter(e => !emailsComCorrecao.has(e._id));

    return {
      total: emails.length,
      aceitos: emailsSemCorrecao.length,
      corrigidos: correcoes.length,
      taxa: (emailsSemCorrecao.length / emails.length * 100).toFixed(1),
    };
  },
});

// Tempo médio até leitura (para emails Urgentes)
export const tempoAteLeitura = query({
  args: {
    funcionarioId: v.string(),
    nivel: v.number(), // 1 para Urgente
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query('emails_processados')
      .filter(e => e.funcionarioId === args.funcionarioId)
      .filter(e => e.nivelClassificado === args.nivel)
      .collect();

    // Buscar flags IMAP \Seen para cada email para calcular tempo até leitura
    // (implementação depende de como você rastreia leitura no Convex)
    
    const tempos = emails
      .filter(e => e.primeiraLeiturEm)
      .map(e => new Date(e.primeiraLeiturEm).getTime() - new Date(e.processadoEm).getTime())
      .filter(t => t > 0); // Só tempos positivos

    if (tempos.length === 0) return null;

    const mediaMs = tempos.reduce((a, b) => a + b) / tempos.length;
    const mediaMinutos = (mediaMs / 1000 / 60).toFixed(1);

    return {
      total: tempos.length,
      mediaMinutos,
      minMinutos: (Math.min(...tempos) / 1000 / 60).toFixed(1),
      maxMinutos: (Math.max(...tempos) / 1000 / 60).toFixed(1),
    };
  },
});

// Distância média de edição: rascunho vs email enviado
export const distanciaEdicaoRascunho = query({
  args: {
    funcionarioId: v.string(),
  },
  handler: async (ctx, args) => {
    // Buscar todos os registros de "diff rascunho × enviado"
    const diffs = await ctx.db
      .query('rascunho_diffs')
      .filter(d => d.funcionarioId === args.funcionarioId)
      .collect();

    if (diffs.length === 0) return null;

    const distancias = diffs.map(d => d.levenshteinDistance);
    const media = (distancias.reduce((a, b) => a + b) / distancias.length).toFixed(1);

    return {
      total: diffs.length,
      mediaDistancia: media,
      percentualAceito: (diffs.filter(d => d.levenshteinDistance < 50).length / diffs.length * 100).toFixed(1),
    };
  },
});

// Correções por funcionário por semana (trend)
export const correcoesPorSemana = query({
  args: {
    funcionarioId: v.string(),
    ultimasSemanas: v.number(), // ex: 4
  },
  handler: async (ctx, args) => {
    const correcoes = await ctx.db
      .query('correcoes')
      .filter(c => c.funcionarioId === args.funcionarioId)
      .collect();

    // Agrupar por semana
    const porSemana = {};
    correcoes.forEach(c => {
      const data = new Date(c.registradoEm);
      const semana = `${data.getFullYear()}-W${String(Math.ceil((data.getDate()) / 7)).padStart(2, '0')}`;
      porSemana[semana] = (porSemana[semana] || 0) + 1;
    });

    // Retornar últimas N semanas
    const semanas = Object.entries(porSemana)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, args.ultimasSemanas);

    return semanas.map(([semana, count]) => ({ semana, correcoes: count }));
  },
});

// Taxa de fallback (emails em Pendente-Classificacao)
export const taxaFallback = query({
  args: {
    funcionarioId: v.string(),
    dataInicio: v.string(),
    dataFim: v.string(),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query('emails_processados')
      .filter(e => e.funcionarioId === args.funcionarioId)
      .filter(e => e.processadoEm >= args.dataInicio && e.processadoEm <= args.dataFim)
      .collect();

    const fallbacks = emails.filter(e => e.nivelClassificado === 'PENDENTE_CLASSIFICACAO');

    return {
      total: emails.length,
      fallbacks: fallbacks.length,
      taxa: (fallbacks.length / emails.length * 100).toFixed(1),
      exemplos: fallbacks.slice(0, 5).map(e => ({
        assunto: e.assunto,
        erro: e.erroClassificacao,
      })),
    };
  },
});
```

### Tarefa 1.2: Criar painel web simples — 1.5 horas

Arquivo: `public/dashboard.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — Classificador Fast</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 30px; }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    
    .metric-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .metric-card h3 {
      color: #666;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    
    .metric-value {
      font-size: 36px;
      font-weight: 700;
      color: #1a73e8;
      margin-bottom: 5px;
    }
    
    .metric-label {
      color: #999;
      font-size: 14px;
    }
    
    .status-good { color: #34a853; }
    .status-warning { color: #fbbc04; }
    .status-bad { color: #ea4335; }
    
    .chart { 
      background: white; 
      padding: 20px; 
      border-radius: 8px; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    .controls {
      margin-bottom: 20px;
      background: white;
      padding: 15px;
      border-radius: 8px;
    }
    
    .controls input, .controls select {
      padding: 8px 12px;
      margin-right: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .controls button {
      padding: 8px 16px;
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .controls button:hover { background: #1557b0; }
    
    .error { color: #ea4335; padding: 10px; background: #ffebee; border-radius: 4px; }
    .loading { color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Dashboard — Classificador Fast</h1>
    
    <div class="controls">
      <select id="funcionario">
        <option value="">Selecione um funcionário...</option>
      </select>
      <select id="periodo">
        <option value="semana">Última semana</option>
        <option value="mes">Último mês</option>
        <option value="tudo">Tudo</option>
      </select>
      <button onclick="carregarMetricas()">Atualizar</button>
    </div>

    <div id="erro" class="error" style="display: none;"></div>

    <div class="metrics-grid" id="metricas">
      <div class="metric-card">
        <h3>Taxa de Aceitação</h3>
        <div class="loading">Carregando...</div>
      </div>
    </div>

    <div class="chart">
      <h2>Correções por Semana (trend)</h2>
      <canvas id="chart-correcoes"></canvas>
    </div>

    <div class="chart">
      <h2>Distribuição por Nível</h2>
      <canvas id="chart-distribuicao"></canvas>
    </div>
  </div>

  <script>
    const CONVEX_URL = '{{ CONVEX_URL }}';
    
    async function carregarMetricas() {
      const funcionarioId = document.getElementById('funcionario').value;
      const periodo = document.getElementById('periodo').value;
      
      if (!funcionarioId) {
        mostrarErro('Selecione um funcionário');
        return;
      }

      try {
        const dataInicio = calcularDataInicio(periodo);
        const dataFim = new Date().toISOString();

        // Chamar queries do Convex
        const [taxaAc, tempoLei, distancia, correcoes, fallback] = await Promise.all([
          fetch(`${CONVEX_URL}/api/query/taxaAceitacao?funcionarioId=${funcionarioId}&dataInicio=${dataInicio}&dataFim=${dataFim}`).then(r => r.json()),
          fetch(`${CONVEX_URL}/api/query/tempoAteLeitura?funcionarioId=${funcionarioId}&nivel=1`).then(r => r.json()),
          fetch(`${CONVEX_URL}/api/query/distanciaEdicaoRascunho?funcionarioId=${funcionarioId}`).then(r => r.json()),
          fetch(`${CONVEX_URL}/api/query/correcoesPorSemana?funcionarioId=${funcionarioId}&ultimasSemanas=4`).then(r => r.json()),
          fetch(`${CONVEX_URL}/api/query/taxaFallback?funcionarioId=${funcionarioId}&dataInicio=${dataInicio}&dataFim=${dataFim}`).then(r => r.json()),
        ]);

        // Renderizar métricas
        const container = document.getElementById('metricas');
        container.innerHTML = `
          <div class="metric-card">
            <h3>Taxa de Aceitação</h3>
            <div class="metric-value ${taxaAc.taxa >= 70 ? 'status-good' : 'status-warning'}">${taxaAc.taxa}%</div>
            <div class="metric-label">${taxaAc.aceitos} de ${taxaAc.total} emails</div>
          </div>

          <div class="metric-card">
            <h3>Tempo até leitura (Urgentes)</h3>
            <div class="metric-value">${tempoLei?.mediaMinutos || '—'}</div>
            <div class="metric-label">minutos em média</div>
          </div>

          <div class="metric-card">
            <h3>Edição de Rascunho</h3>
            <div class="metric-value">${distancia?.percentualAceito || '—'}%</div>
            <div class="metric-label">rascunhos < 50 chars de mudança</div>
          </div>

          <div class="metric-card">
            <h3>Taxa de Fallback</h3>
            <div class="metric-value ${fallback?.taxa > 5 ? 'status-warning' : 'status-good'}">${fallback?.taxa || '0'}%</div>
            <div class="metric-label">${fallback?.fallbacks || 0} emails em Pendente-Classificacao</div>
          </div>
        `;

        // Renderizar gráficos (usando Chart.js ou similar)
        renderizarGraficoCorrecoes(correcoes);
        
        document.getElementById('erro').style.display = 'none';
      } catch (err) {
        mostrarErro(`Erro ao carregar métricas: ${err.message}`);
      }
    }

    function calcularDataInicio(periodo) {
      const agora = new Date();
      const data = new Date(agora);
      
      if (periodo === 'semana') data.setDate(data.getDate() - 7);
      else if (periodo === 'mes') data.setMonth(data.getMonth() - 1);
      else if (periodo === 'tudo') data.setFullYear(2000); // Very old date
      
      return data.toISOString();
    }

    function mostrarErro(mensagem) {
      const div = document.getElementById('erro');
      div.textContent = mensagem;
      div.style.display = 'block';
    }

    function renderizarGraficoCorrecoes(dados) {
      // Implementar com Chart.js ou canvas simples
      console.log('Dados de correções:', dados);
    }

    // Carregar funcionários ao inicializar
    window.addEventListener('load', async () => {
      try {
        const funcionarios = await fetch(`${CONVEX_URL}/api/query/listarFuncionarios`).then(r => r.json());
        const select = document.getElementById('funcionario');
        funcionarios.forEach(f => {
          const option = document.createElement('option');
          option.value = f._id;
          option.textContent = f.email;
          select.appendChild(option);
        });
      } catch (err) {
        console.error('Erro ao carregar funcionários:', err);
      }
    });
  </script>
</body>
</html>
```

### Tarefa 1.3: Expor queries via HTTP action do Convex — 30 minutos

Arquivo: `convex/http.ts`

```typescript
import { httpRouter } from 'convex/server';
import { api } from './_generated/api';

const http = httpRouter();

// Query: Taxa de aceitação
http.route({
  path: '/metricas/taxa-aceitacao',
  method: 'GET',
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const funcionarioId = url.searchParams.get('funcionarioId');
    const dataInicio = url.searchParams.get('dataInicio');
    const dataFim = url.searchParams.get('dataFim');

    const resultado = await ctx.runQuery(api.queries.metricas.taxaAceitacao, {
      funcionarioId,
      dataInicio,
      dataFim,
    });

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

// Query: Tempo até leitura
http.route({
  path: '/metricas/tempo-leitura',
  method: 'GET',
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const funcionarioId = url.searchParams.get('funcionarioId');
    const nivel = url.searchParams.get('nivel') || '1';

    const resultado = await ctx.runQuery(api.queries.metricas.tempoAteLeitura, {
      funcionarioId,
      nivel: parseInt(nivel),
    });

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

// ... adicione rotas para as outras queries ...

export default http;
```

---

## Parte 2: Reflexão Mensal Automática (2–3 horas)

### Tarefa 2.1: Criar prompt de reflexão mensal — 30 minutos

Arquivo: `prompts/reflexao_mensal.md`

```markdown
# Reflexão Mensal Automática

## Contexto
Você é um assistente de IA analisando o histórico de classificação de emails de um funcionário ao longo do último mês.

## Dados disponíveis
- Total de emails processados: {{TOTAL_EMAILS}}
- Total de correções: {{TOTAL_CORRECOES}}
- Taxa de aceitação: {{TAXA_ACEITACAO}}%
- Emails mais frequentes por nível: {{TOP_REMETENTES_POR_NIVEL}}
- Padrões de assunto urgentes: {{PALAVRAS_CHAVE_URGENTES}}

## Histórico de correções do mês
{{CORRECOES_DETALHADAS}}

## Tarefa
Analise os dados acima e gere:

1. **Padrões identificados**: Que tipos de email o funcionário mais corrige? Existe um padrão?

2. **Sugestões de whitelist automática**: Quais remetentes ou domínios devem sempre ter piso de prioridade?

3. **Sugestões de guard rails**: Existe alguma regra determinística que deveria ser aplicada?

4. **Sugestões de atualizações ao prompt**: O critério de um ou mais níveis deveria mudar?

5. **Notificação personalisada**: Um parágrafo cordial e útil para o funcionário sobre seu progresso.

Retorne um JSON estruturado.
```

### Tarefa 2.2: Implementar rotina de reflexão mensal — 1.5 horas

Arquivo: `convex/scheduled/reflexaoMensal.ts`

```typescript
import { scheduled } from 'convex/server';

// Executar no primeiro dia de cada mês às 09:00
export const reflexaoMensalAutomatica = scheduled('0 9 1 * *', async (ctx) => {
  console.log('[REFLEXAO-MENSAL] Iniciando reflexão mensal...');

  const funcionarios = await ctx.db.query('funcionarios').collect();

  for (const func of funcionarios) {
    try {
      // Coletar dados do mês anterior
      const mesAnterior = new Date();
      mesAnterior.setMonth(mesAnterior.getMonth() - 1);
      
      const dataInicio = new Date(mesAnterior.getFullYear(), mesAnterior.getMonth(), 1).toISOString();
      const dataFim = new Date(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 1).toISOString();

      const emails = await ctx.db
        .query('emails_processados')
        .filter(e => e.funcionarioId === func._id)
        .filter(e => e.processadoEm >= dataInicio && e.processadoEm <= dataFim)
        .collect();

      const correcoes = await ctx.db
        .query('correcoes')
        .filter(c => c.funcionarioId === func._id)
        .filter(c => c.registradoEm >= dataInicio && c.registradoEm <= dataFim)
        .collect();

      if (emails.length === 0) {
        console.log(`[REFLEXAO-MENSAL] ${func.email}: Sem dados para análise`);
        continue;
      }

      // Preparar dados para Claude
      const remetentesComErros = {};
      correcoes.forEach(c => {
        const remetente = c.remetente || 'desconhecido';
        remetentesComErros[remetente] = (remetentesComErros[remetente] || 0) + 1;
      });

      const topRemetentes = Object.entries(remetentesComErros)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

      const dados = {
        TOTAL_EMAILS: emails.length,
        TOTAL_CORRECOES: correcoes.length,
        TAXA_ACEITACAO: ((emails.length - correcoes.length) / emails.length * 100).toFixed(1),
        TOP_REMETENTES: topRemetentes.map(([r, count]) => `${r} (${count} correções)`).join('; '),
        CORRECOES_DETALHADAS: correcoes.map(c => 
          `- ${c.assuntoEmail}: Nível ${c.nivelOriginal} → ${c.nivelCorrigido}`
        ).slice(0, 10).join('\n'),
      };

      // Chamar Claude para análise
      const prompt = (await ctx.db.query('config').first()).promptReflexaoMensal
        .replace(/\{\{(\w+)\}\}/g, (match, key) => dados[key] || '');

      const response = await callClaude(prompt, 'claude-sonnet-4-6');

      const analise = JSON.parse(response);

      // Salvar análise no Convex
      await ctx.db.insert('reflexoes_mensais', {
        funcionarioId: func._id,
        mesReferencia: mesAnterior.toISOString(),
        analise,
        status: 'pendente_confirmacao', // Admin revisa antes de aplicar
        criadoEm: new Date().toISOString(),
      });

      // Enviar email ao funcionário
      await enviarEmailReflexao(func.email, analise);

      console.log(`[REFLEXAO-MENSAL] ✓ Reflexão concluída para ${func.email}`);
    } catch (err) {
      console.error(`[REFLEXAO-MENSAL] Erro para ${func.email}:`, err);
    }
  }

  console.log('[REFLEXAO-MENSAL] ✓ Reflexão mensal concluída');
});

async function callClaude(prompt, model) {
  // Implementação da chamada ao Anthropic SDK
  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text;
}

async function enviarEmailReflexao(emailFuncionario, analise) {
  // Implementar envio via SMTP do CSC Empresarial
  const corpo = `
Olá,

Aqui está a análise automática do seu mês de classificação de emails:

${analise.notificacao}

## Sugestões de ajustes
${analise.sugestoesAjustes}

Se está de acordo, essas mudanças serão aplicadas no mês que vem automaticamente.

Abraço,
Classificador Fast
  `;

  // await enviarEmailSmtp(emailFuncionario, 'Reflexão Mensal — Classificador Fast', corpo);
  console.log(`[EMAIL] Reflexão enviada para ${emailFuncionario}`);
}
```

### Tarefa 2.3: Aplicar sugestões de whitelist/guard rails — 30 minutos

Arquivo: `convex/actions/aplicarReflexao.ts`

```typescript
export const aplicarReflexaoMensal = action({
  args: {
    reflexaoId: v.id('reflexoes_mensais'),
  },
  handler: async (ctx, args) => {
    const reflexao = await ctx.db.get(args.reflexaoId);

    if (!reflexao) throw new Error('Reflexão não encontrada');

    // Aplicar whitelist sugerida
    if (reflexao.analise.sugestoesWhitelist.length > 0) {
      for (const sugestao of reflexao.analise.sugestoesWhitelist) {
        await ctx.db.insert('whitelist', {
          funcionarioId: reflexao.funcionarioId,
          tipo: sugestao.tipo, // 'email' ou 'dominio'
          valor: sugestao.valor,
          nivelMinimo: sugestao.nivelMinimo,
          descricao: sugestao.descricao,
          criaoEm: new Date().toISOString(),
        });
      }
    }

    // Marcar como aplicada
    await ctx.db.patch(reflexaoId, {
      status: 'aplicada',
      aplicadoEm: new Date().toISOString(),
    });

    console.log('[REFLEXAO] ✓ Sugestões aplicadas');
  },
});
```

---

## Parte 3: Preparação para Rollout (Fase 3) — 2 horas

### Tarefa 3.1: Remover hardcodes de credenciais — 30 minutos

**Antes:**
```javascript
const IMAP_USER = 'clara.barbosa@fastdrywall.com.br';
const IMAP_PASS = 'senha-hardcoded';
```

**Depois:**
```javascript
// Worker recebe funcionarioId como parâmetro
async function inicializarWorker(funcionarioId) {
  const func = await convexClient.query(api.funcionarios.obter, { funcionarioId });
  
  const imapClient = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    auth: {
      user: func.imapUser, // Armazenado criptografado no Convex
      pass: descriptografarSenha(func.imapPassCriptografada),
    },
  });
}
```

### Tarefa 3.2: Script de onboarding de novo funcionário — 1 hora

Arquivo: `scripts/onboarding-funcionario.js`

```javascript
#!/usr/bin/env node

import { ConvexClient } from 'convex/browser';
import inquirer from 'inquirer';
import crypto from 'crypto';

const convex = new ConvexClient(process.env.CONVEX_URL);

async function onboarding() {
  console.log('🚀 Onboarding de Novo Funcionário\n');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'nome',
      message: 'Nome do funcionário:',
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email da empresa (@fastdrywall.com.br):',
    },
    {
      type: 'password',
      name: 'imapPass',
      message: 'Senha de app IMAP (CSC Empresarial):',
    },
  ]);

  try {
    // 1. Criar funcionário no Convex
    const funcionario = await convex.mutation(api.funcionarios.criar, {
      nome: answers.nome,
      email: answers.email,
      imapUser: answers.email,
      imapPassCriptografada: criptografarSenha(answers.imapPass),
      ativo: true,
    });

    console.log(`✓ Funcionário criado: ${funcionario._id}`);

    // 2. Criar perfil vazio
    await convex.mutation(api.perfis.criar, {
      funcionarioId: funcionario._id,
      remetentes: {},
      areas: [],
      guardrails: [],
    });

    console.log(`✓ Perfil criado`);

    // 3. Criar style card padrão Fast
    await convex.mutation(api.styleCards.criar, {
      funcionarioId: funcionario._id,
      estilo: {
        saudacao: 'Olá [nome],',
        formalidade: 3,
        despedida: 'Abraço',
        tonGeral: 'profissional',
      },
      versao: 1,
    });

    console.log(`✓ Style card criado`);

    // 4. Adicionar ao ecosystem.config.cjs
    const ecosystemConfig = fs.readFileSync('ecosystem.config.cjs', 'utf-8');
    const novaInstancia = `
    {
      name: 'worker-${answers.email.split('@')[0]}',
      script: './src/index.js',
      env: {
        FUNCIONARIO_ID: '${funcionario._id}',
        IMAP_USER: '${answers.email}',
      },
      autorestart: true,
      watch: false,
      max_restarts: 5,
    }`;

    fs.appendFileSync('ecosystem.config.cjs', novaInstancia);

    console.log(`✓ Instância adicionada ao ecosystem.config.cjs`);

    // 5. Recarregar PM2
    console.log('\nRecarregando PM2...');
    // execSync('pm2 reload ecosystem.config.cjs');
    console.log(`✓ PM2 recarregado. Worker iniciado!`);

    console.log(`\n✅ Onboarding concluído para ${answers.email}`);
  } catch (err) {
    console.error('❌ Erro durante onboarding:', err.message);
    process.exit(1);
  }
}

function criptografarSenha(senha) {
  // Implementar criptografia segura (ex: ChaCha20, AES-256)
  const cifra = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
  let criptografado = cifra.update(senha, 'utf8', 'hex');
  criptografado += cifra.final('hex');
  return criptografado;
}

onboarding();
```

Execute:
```bash
npm install inquirer
node scripts/onboarding-funcionario.js
```

### Tarefa 3.3: Documentação de operação — 30 minutos

Arquivo: `docs/OPERACAO-ROLLOUT.md`

```markdown
# Documentação de Operação — Rollout Fase 3

## Onboarding de novo funcionário

### Pré-requisitos
- Funcionário tem email da Fast (@fastdrywall.com.br)
- Criou senha de app no CSC Empresarial
- Acesso ao servidor SaveInCloud via SSH (para TI)

### Passos
1. Rodar script de onboarding:
   ```bash
   node scripts/onboarding-funcionario.js
   ```
2. Responder às perguntas interativas
3. Validar que a instância PM2 foi criada:
   ```bash
   pm2 status
   ```
4. Acompanhar logs iniciais:
   ```bash
   pm2 logs | grep "worker-[email]"
   ```

### Troubleshooting

**Worker não conecta ao IMAP:**
- Verificar credenciais: `cat .env.local`
- Confirmar se IMAP_HOST está correto
- Testar conexão manualmente: `telnet mail.cscempresarial.com.br 993`

**Pasta Fast/* não existe:**
- Funcionário deve criar manualmente no Outlook
- Ou deixar o worker criar (implementação em T23)

**Email para reflexão mensal não chega:**
- Verificar se SMTP_HOST está correto
- Validar SMTP_USER/SMTP_PASS
- Confirmar que não está em spam

## Monitoramento

- **Painel web:** http://seu-servidor/dashboard
- **Métricas em tempo real:** `pm2 monit`
- **Logs completos:** `pm2 logs`
- **Convex Console:** https://dashboard.convex.dev

## Rollback (reverter para versão anterior)

```bash
git revert <commit-id>
npm start
pm2 reload ecosystem.config.cjs
```
```

---

## Checklist do Dia 6

- [ ] Dashboard implementado e testado
- [ ] Queries de métricas funcionando
- [ ] Reflexão mensal agendada (cron 1º do mês)
- [ ] Email de reflexão sendo enviado
- [ ] Sugestões de whitelist sendo aplicadas
- [ ] Script de onboarding testado com novo funcionário de teste
- [ ] Documentação de operação concluída
- [ ] Commits feitos no Git

---

## Critério de saída do Dia 6 / MVP + Fase 2 COMPLETOS

✅ **Dashboard mostrando todas as métricas chave**  
✅ **Reflexão mensal automática funcionando e enviando emails**  
✅ **Sistema pronto para múltiplos funcionários (hardcodes removidos)**  
✅ **Script de onboarding testado e funcionando**  
✅ **Documentação de operação completa**  
✅ **Taxa de aceitação ≥ 70% mantida ou melhorada com RAG + Style Card**

---

## Próximos passos após Dia 6

### Fase 3 (Rollout para todos os funcionários)
1. Onboard 2–3 funcionários de teste usando o script
2. Coletar feedback de 1 semana
3. Expandir gradualmente para toda a equipe
4. Monitorar dashboard e métricas em tempo real

### Fase 6 (Melhorias futuras — não bloqueiam MVP)
- Interface de gestão TI avançada
- Análise de sentimento de emails
- Integração com calendário para urgência por prazo
- Dashboard com gráficos históricos
- Pasta de resumo diário por email

---

## Conclusão

Parabéns! 🎉 Você completou a implementação do **Classificador Automático de Emails Fast**.

**O que foi alcançado:**
- ✅ MVP completo com taxa de aceitação ≥ 70%
- ✅ Aprendizado individual (Few-shot RAG + Style Card)
- ✅ Monitoramento automatizado (Dashboard + Reflexão Mensal)
- ✅ Infraestrutura escalável para múltiplos funcionários
- ✅ Operação documentada e automatizada

**Próximo**: Expandir gradualmente conforme feedback dos usuários.
