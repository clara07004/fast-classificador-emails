# Guia Dia 5 — Fase 2: RAG de Correções + Style Card

**Data:** 2026-05-09 (estimado)  
**Objetivo:** Implementar aprendizado individual — injetar correções passadas como exemplos (few-shot RAG) e extrair estilo pessoal do funcionário para personalizar rascunhos.  
**Tempo estimado:** 6–8 horas  
**Critério de saída:** Few-shot RAG funcionando, style card criado, taxa de aceitação mantida ≥ 70%

---

## Status esperado

Você chegou aqui porque:
- ✅ Dia 1–4 concluídos com sucesso
- ✅ Taxa de aceitação do MVP ≥ 70%
- ✅ Temos histórico de correções registrado em Convex (`correcoes` table)
- ⏳ Agora vamos implementar as 2 camadas de aprendizado individual

---

## O que é Fase 2?

**Fase 1** (MVP): Classificar e gerar rascunhos com critérios genéricos (igual para todos)

**Fase 2** (Aprendizado): Usar histórico de correções do funcionário para:
1. **Few-shot RAG:** "Você já corrigiu um email assim antes? Aqui estão 3–5 exemplos similares de quando corrigiu."
2. **Style Card:** "Você escreve de forma mais ou menos formal? Seus rascunhos devem parecer com seu tom pessoal."

---

## Parte 1: Few-shot RAG (3–4 horas)

### Tarefa 1.1: Setup Voyage AI — 30 minutos

Voyage AI gera **embeddings** (representação vetorial) de texto para medir similaridade.

#### 1.1.1 Criar conta e obter API key

1. Acesse https://www.voyageai.com
2. Crie uma conta gratuita (tier free cobre 50k tokens/mês)
3. Copie sua API key
4. Adicione a `.env.local`:

```bash
VOYAGE_API_KEY=your-api-key-here
```

#### 1.1.2 Instalar dependência

```bash
npm install @voyageai/voyage-ai
```

#### 1.1.3 Criar script de teste

Arquivo: `scripts/test-voyage.js`

```javascript
import Anthropic from "@anthropic-ai/sdk";

const voyageClient = new Anthropic(); // Ou use a biblioteca voyage-ai

const testTexts = [
  "Orçamento para cliente X, preciso de retorno até hoje",
  "Newsletter semanal de construção",
  "Reunião com diretor para discutir novo projeto",
];

async function testarVoyage() {
  console.log("Testando Voyage AI...");
  
  // Você pode usar outra biblioteca de embedding se preferir
  // Por enquanto, vamos usar como placeholder
  
  for (const text of testTexts) {
    console.log(`\nTexto: ${text}`);
    // Chame a API Voyage aqui
    // const embedding = await voyageClient.embed(text);
    // console.log(`Embedding (primeiros 5 dims): ${embedding.slice(0, 5)}`);
  }
}

testarVoyage();
```

**Nota:** A documentação de embedding em JavaScript pode variar. Consulte https://docs.voyageai.com/docs/embeddings para a implementação exata.

### Tarefa 1.2: Implementar pipeline de embeddings — 1.5 horas

#### 1.2.1 Função para gerar embedding

Arquivo: `src/ml/embeddings.js`

```javascript
import { fetch } from 'node-fetch'; // ou use o fetch nativo do Node 18+

export async function gerarEmbedding(texto) {
  // Truncar para 512 tokens (aproximadamente 2000 caracteres)
  const textoTruncado = texto.substring(0, 2000);
  
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: textoTruncado,
      model: 'voyage-3-lite', // Modelo mais leve e barato
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding; // Array de números
}

// Teste
async function teste() {
  const emb = await gerarEmbedding("Teste de embedding");
  console.log(`Embedding dim: ${emb.length}, primeiros 5: ${emb.slice(0, 5)}`);
}
```

#### 1.2.2 Job assíncrono de embeddings

Modificar `src/imap/worker.js` para gerar embedding após cada correção:

```javascript
// Após registrar uma correção em Convex...

async function processarCorrecaoComEmbedding(correcaoId, emailNormalizado) {
  try {
    // Gerar embedding: "assunto + corpo truncado"
    const textoParaEmbed = `${emailNormalizado.assunto} ${emailNormalizado.corpo.substring(0, 1000)}`;
    const embedding = await gerarEmbedding(textoParaEmbed);

    // Salvar embedding no Convex
    await convexClient.mutation(api.correcoes.atualizarEmbedding, {
      correcaoId,
      embedding, // Array de números
    });

    console.log(`[EMBEDDINGS] Embedding gerado e salvo para correção ${correcaoId}`);
  } catch (err) {
    console.warn(`[EMBEDDINGS] Erro ao gerar embedding: ${err.message}`);
    // Não bloqueie o pipeline se embedding falhar
  }
}
```

#### 1.2.3 Backfill de embeddings antigos

Script para gerar embeddings de todas as correções já registradas:

Arquivo: `scripts/backfill-embeddings.js`

```javascript
import { ConvexClient } from 'convex/browser';
import { gerarEmbedding } from '../src/ml/embeddings.js';

const convexClient = new ConvexClient(process.env.CONVEX_URL);

async function backfillEmbeddings() {
  console.log('Iniciando backfill de embeddings...');

  // Buscar todas as correções sem embedding
  const correcoes = await convexClient.query(api.correcoes.listarSemEmbedding, {
    funcionarioId: 'seu-id-aqui', // Ou deixe vazio para todos
  });

  console.log(`Found ${correcoes.length} correções sem embedding`);

  for (let i = 0; i < correcoes.length; i++) {
    const correcao = correcoes[i];
    
    // Buscar email associado para pegar assunto + corpo
    const email = await convexClient.query(api.emails.obter, {
      emailId: correcao.emailId,
    });

    // Gerar embedding
    const textoParaEmbed = `${email.assunto} ${email.corpo.substring(0, 1000)}`;
    const embedding = await gerarEmbedding(textoParaEmbed);

    // Atualizar
    await convexClient.mutation(api.correcoes.atualizarEmbedding, {
      correcaoId: correcao._id,
      embedding,
    });

    console.log(`[${i + 1}/${correcoes.length}] ✓ Embedding gerado: ${correcao._id}`);

    // Rate limiting: não bombardear Voyage AI
    if ((i + 1) % 5 === 0) {
      console.log('Aguardando 2s para rate limiting...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('✓ Backfill concluído!');
}

backfillEmbeddings().catch(console.error);
```

Execute:
```bash
VOYAGE_API_KEY=... CONVEX_URL=... node scripts/backfill-embeddings.js
```

### Tarefa 1.3: Busca por similaridade coseno — 1.5 horas

#### 1.3.1 Função de busca coseno

Arquivo: `src/ml/similarity.js`

```javascript
// Calcular similaridade coseno entre dois embeddings
export function cosineSimilarity(vec1, vec2) {
  const dotProduct = vec1.reduce((sum, a, i) => sum + a * vec2[i], 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0));
  
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  return dotProduct / (magnitude1 * magnitude2);
}

// Encontrar top-N correções mais similares
export async function encontrarCorrecoesSimilares(
  funcionarioId,
  emailEmbedding,
  topN = 5,
  convexClient
) {
  // Buscar todas as correções deste funcionário
  const todosCorreco = await convexClient.query(api.correcoes.listarPorFuncionario, {
    funcionarioId,
  });

  if (todosCorreco.length === 0) {
    return []; // Sem correções anteriores, sem few-shot possível
  }

  // Calcular similaridade com cada uma
  const comSimilaridade = todosCorreco
    .filter(c => c.embedding) // Só as que têm embedding
    .map(c => ({
      ...c,
      similaridade: cosineSimilarity(emailEmbedding, c.embedding),
    }))
    .sort((a, b) => b.similaridade - a.similaridade)
    .slice(0, topN);

  return comSimilaridade;
}
```

#### 1.3.2 Integrar busca no prompt de classificação

Modificar `src/imap/classificador.js`:

```javascript
import { gerarEmbedding } from '../ml/embeddings.js';
import { encontrarCorrecoesSimilares } from '../ml/similarity.js';

export async function classificarEmail(emailNormalizado, funcionarioId, convexClient) {
  // ... código existente ...

  // NOVO: Gerar embedding do email atual e buscar correções similares
  let fewShotExemplos = [];
  try {
    const emailEmbedding = await gerarEmbedding(
      `${emailNormalizado.assunto} ${emailNormalizado.corpo.substring(0, 1000)}`
    );

    const correcoesSimilares = await encontrarCorrecoesSimilares(
      funcionarioId,
      emailEmbedding,
      5, // top-5
      convexClient
    );

    if (correcoesSimilares.length > 0) {
      console.log(`[CLASSIFICADOR] Encontradas ${correcoesSimilares.length} correções similares`);
      
      // Formatar para injeção no prompt
      fewShotExemplos = correcoesSimilares.map(c => ({
        assuntoOriginal: c.emailAssunto,
        nivelOriginal: c.nivelOriginal,
        nivelCorrecto: c.nivelCorrigido,
        similaridade: c.similaridade.toFixed(3),
      }));
    }
  } catch (err) {
    console.warn(`[EMBEDDINGS] Erro ao gerar few-shot: ${err.message}`);
    // Continua sem few-shot se falhar
  }

  // Construir prompt com few-shot
  const prompt = construirPromptComFewShot(
    emailNormalizado,
    perfil,
    historicoRemetente,
    fewShotExemplos // ← NOVO
  );

  // ... resto do classificador ...
}
```

#### 1.3.3 Função de construção de prompt com few-shot

Arquivo: `src/prompts/builder.js`

```javascript
export function construirPromptComFewShot(
  emailNormalizado,
  perfil,
  historicoRemetente,
  fewShotExemplos = []
) {
  let prompt = `
# Tarefa: Classificar email por prioridade

## Definição dos níveis
[... níveis 1-5 existentes ...]

## Perfil do funcionário
[... perfil do funcionário ...]

## Histórico do remetente
[... histórico remetente ...]
`;

  // NOVO: Few-shot baseado em correções anteriores similares
  if (fewShotExemplos.length > 0) {
    prompt += `\n## Exemplos similares de correções anteriores do funcionário\n\n`;
    fewShotExemplos.forEach((ex, i) => {
      prompt += `Exemplo ${i + 1}:\n`;
      prompt += `- Assunto: "${ex.assuntoOriginal}"\n`;
      prompt += `- Classificado como: Nível ${ex.nivelOriginal}\n`;
      prompt += `- Corrigido para: Nível ${ex.nivelCorrigido}\n`;
      prompt += `- Similaridade: ${ex.similaridade}\n\n`;
    });
    prompt += `Use estes exemplos para entender o padrão de preferência do funcionário.\n`;
  }

  prompt += `\n## Email a classificar\n`;
  prompt += `[... email atual ...]`;

  return prompt;
}
```

---

## Parte 2: Style Card (2–3 horas)

### Tarefa 2.1: Criar prompt de extração de estilo — 30 minutos

Arquivo: `prompts/style_extraction.md`

```markdown
# Extração de Estilo Pessoal do Funcionário

## Tarefa
Você vai analisar os últimos emails ENVIADOS por este funcionário e extrair um perfil de estilo pessoal.

## O que extrair

1. **Saudação inicial**: Como este funcionário começa seus emails?
   - "Olá [nome]," / "Oi," / "Prezado/a," / Sem saudação

2. **Nível de formalidade** (1-5):
   - 1 = Muito casual ("E aí?" / "Tá certo?")
   - 3 = Neutro ("Olá, tudo bem?")
   - 5 = Muito formal ("Prezado Senhor/a, ...")

3. **Comprimento médio de parágrafos**:
   - Curto (1-2 linhas) / Médio (3-4 linhas) / Longo (5+ linhas)

4. **Palavras/expressões características**:
   - Exemplos: "abraço", "valeu", "fico no aguardo", "obrigado desde já", etc.

5. **Despedida típica**:
   - "Abraço" / "Até mais" / "Atenciosamente" / Sem despedida formal

6. **Uso de emojis**: Sim/Não, com que frequência e em que contextos?

7. **Estrutura**: Parágrafos soltos / Listas com bullet points / Estruturado em seções

8. **Tom geral**:
   - Cordial / Direto / Amigável / Professsional / Empático

## Output esperado

Retorne um JSON com:
```json
{
  "saudacao": "Olá [nome],",
  "formalidade": 3,
  "comprimentoParagrafos": "curto",
  "palavrasCaracteristicas": ["abraço", "fico no aguardo"],
  "despedida": "Abraço",
  "usaEmojis": false,
  "estrutura": "parágrafos soltos",
  "tonGeral": "cordial",
  "exemplos": [
    "Olá Carlos,\n\nTudo bem? Seguindo o combinado, envio o orçamento em anexo.\n\nAbração",
    "Oi Pedro,\n\nConfirmo presença na reunião de amanhã.\n\nObrigado"
  ]
}
```
```

### Tarefa 2.2: Implementar extração inicial de style card — 1 hora

Arquivo: `src/ml/style-extractor.js`

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { readEmails } from '../imap/imap-utils.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function extrairStyleCardInicial(imapClient, funcionarioId, convexClient) {
  console.log('[STYLE-EXTRACTOR] Iniciando extração de estilo...');

  // Buscar últimos 50 emails enviados
  const emailsEnviados = await readEmails(imapClient, '[Gmail]/Sent Mail', 50);

  // Filtrar automáticos e forwards
  const emailsFiltrados = emailsEnviados.filter(e => {
    const assunto = e.subject.toLowerCase();
    const isAutomático = assunto.includes('out of office') || assunto.includes('automaticamente');
    const isForward = assunto.startsWith('fwd:');
    return !isAutomático && !isForward;
  });

  if (emailsFiltrados.length === 0) {
    console.warn('[STYLE-EXTRACTOR] Nenhum email enviado encontrado!');
    return null;
  }

  // Concatenar últimos 5-10 emails para análise
  const exemplosTexto = emailsFiltrados
    .slice(0, 10)
    .map(e => `---\n${e.text}`)
    .join('\n');

  // Chamar Claude para extrair estilo
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Analise os seguintes emails enviados e extraia o estilo pessoal do autor:\n\n${exemplosTexto}\n\nRetorne um JSON conforme o formato definido em prompts/style_extraction.md`,
      },
    ],
  });

  // Parse do JSON retornado
  const content = response.content[0].text;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const styleCard = JSON.parse(jsonMatch[0]);

  // Salvar no Convex
  await convexClient.mutation(api.styleCards.criar, {
    funcionarioId,
    estilo: styleCard,
    versao: 1,
    criadoEm: new Date().toISOString(),
  });

  console.log('[STYLE-EXTRACTOR] ✓ Style card extraído e salvo');
  return styleCard;
}

// Executar na inicialização do worker (após conectar a IMAP)
export async function inicializarStyleCardSeNecessario(imapClient, funcionarioId, convexClient) {
  const existing = await convexClient.query(api.styleCards.obter, { funcionarioId });
  
  if (!existing) {
    console.log('[STYLE-EXTRACTOR] Style card não encontrado. Extraindo...');
    await extrairStyleCardInicial(imapClient, funcionarioId, convexClient);
  } else {
    console.log('[STYLE-EXTRACTOR] Style card já existe');
  }
}
```

### Tarefa 2.3: Rotina semanal de atualização — 1 hora

Arquivo: `src/scheduled/atualizar-style-card.js` (Convex scheduled function)

```javascript
// convex/scheduled/atualizarStyleCard.ts

import { scheduled } from 'convex/server';

// Executar toda segunda-feira às 09:00
export const atualizarStyleCardSemanal = scheduled('0 9 * * 1', async (ctx) => {
  console.log('[SCHEDULER] Iniciando atualização semanal de style cards...');

  const funcionarios = await ctx.db.query('funcionarios').collect();

  for (const func of funcionarios) {
    try {
      // Buscar últimos 10 emails enviados desta semana
      const emailsRecentes = await ctx.db
        .query('enviados')
        .filter(e => e.funcionarioId === func._id)
        .filter(e => e.enviadoEm > semanaPassada())
        .order('enviadoEm', 'desc')
        .take(10);

      if (emailsRecentes.length < 3) {
        console.log(`[SCHEDULER] Sem emails recentes para ${func.email}, pulando`);
        continue;
      }

      // Chamar Claude para atualizar estilo
      const novoEstilo = await analisarEstilo(emailsRecentes);

      // Comparar com estilo anterior
      const styleAnterior = await ctx.db
        .query('styleCards')
        .filter(s => s.funcionarioId === func._id)
        .order('versao', 'desc')
        .first();

      const diferenca = calcularDiferenca(styleAnterior.estilo, novoEstilo);

      // Só atualizar se diferença > 20%
      if (diferenca > 0.2) {
        console.log(`[SCHEDULER] Atualizando style card de ${func.email} (diferença: ${(diferenca*100).toFixed(1)}%)`);
        
        await ctx.db.insert('styleCards', {
          funcionarioId: func._id,
          estilo: novoEstilo,
          versao: (styleAnterior.versao || 1) + 1,
          diferenca,
          atualizadoEm: new Date().toISOString(),
        });
      } else {
        console.log(`[SCHEDULER] Style card de ${func.email} sem mudanças significativas`);
      }
    } catch (err) {
      console.error(`[SCHEDULER] Erro ao atualizar style card de ${func.email}:`, err);
    }
  }

  console.log('[SCHEDULER] ✓ Atualização semanal concluída');
});
```

### Tarefa 2.4: Injetar style card no prompt de rascunho — 30 minutos

Modificar `src/imap/gerador-rascunho.js`:

```javascript
export async function gerarRascunho(emailNormalizado, funcionarioId, convexClient) {
  // Buscar style card do funcionário
  const styleCard = await convexClient.query(api.styleCards.obterAtual, {
    funcionarioId,
  });

  // Construir instrução com base no style card
  let instrucaoEstilo = '';
  if (styleCard) {
    instrucaoEstilo = `
Estilo pessoal do funcionário:
- Saudação: "${styleCard.estilo.saudacao}"
- Formalidade: ${styleCard.estilo.formalidade}/5
- Despedida: "${styleCard.estilo.despedida}"
- Tom: ${styleCard.estilo.tonGeral}
- Comprimento: ${styleCard.estilo.comprimentoParagrafos}

Mantenha este estilo ao gerar o rascunho.
`;
  }

  const prompt = `
Gere um rascunho de resposta ao email a seguir.

[... definição dos níveis e email ...]

${instrucaoEstilo}

Retorne um texto estruturado, pronto para revisar.
`;

  // Chamar Claude Sonnet
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}
```

---

## Tarefa 3: Teste integrado — 1 hora

### 3.1 Rodar o worker com Fase 2 ativada

```bash
pm2 restart ecosystem.config.cjs
pm2 logs
```

Aguarde:
- ✅ `[STYLE-EXTRACTOR] ✓ Style card extraído e salvo`
- ✅ `[EMBEDDINGS] Embedding gerado e salvo para correção ...`

### 3.2 Enviar email de teste e verificar

Envie um email que seja **similar a uma correção anterior** que você fez no Dia 4.

**Exemplo:**
- Dia 4, você corrigiu: "Reunião com diretor sobre novo projeto" (Nível 3 → Nível 2)
- Dia 5, novo email: "Reunião com diretor para alinhamento de estratégia"
- **Esperado:** Classificação Nível 2 (Alta-Prioridade) direto, porque é similar

Verificar logs:
```
[CLASSIFICADOR] Encontradas 3 correções similares
[CLASSIFICADOR] Few-shot injetado no prompt
[RASCUNHO] Rascunho gerado com estilo: formalidade=3, saudação=Olá
```

### 3.3 Checklist

- [ ] Style card criado no Convex
- [ ] Backfill de embeddings concluído (se houve correções do Dia 4)
- [ ] Few-shot RAG funcionando (logs mostram busca de similares)
- [ ] Rascunho reflete estilo do funcionário (não ultra-formal)
- [ ] Taxa de aceitação mantida ≥ 70% (ou melhorou)

---

## Critério de saída do Dia 5

✅ **Few-shot RAG implementado e ativo**  
✅ **Embeddings gerados para todas as correções anteriores**  
✅ **Style card extraído e injetado em rascunhos**  
✅ **Testes passaram: emails similares a correções anteriores são classificados corretamente**  
✅ **Taxa de aceitação mantida ≥ 70% (ou melhorou)**

Se tudo passou: **Dia 5 concluído** ✅  
Próximo: **Dia 6 — Dashboard de métricas + Reflexão mensal + Preparação para Rollout**
