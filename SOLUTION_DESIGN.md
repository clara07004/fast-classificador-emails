# Solution Design — classificador-emails-fast

**Versão:** 3.0
**Data:** 2026-04-27
**Status:** Aprovado — pronto para implementação

---

## Mudanças nesta versão (v2.0 → v3.0)

- Mecanismo de feedback substituído: movimentação de email entre pastas `Fast/*` via IMAP detectada pelo worker como sinal de correção
- Reflexão mensal: sugestões de perfil aplicadas automaticamente (exceto blacklist, que requer confirmação manual); notificação ao funcionário via email SMTP
- Health check do worker: monitoramento via PM2 (autorestart: true + startup no boot do servidor)
- SMTP (CSC Empresarial) adicionado ao stack para notificação da reflexão mensal

---

## Arquitetura geral

```
CSC Empresarial (IMAP)
        │
        │ IMAP IDLE — 1 conexão persistente por funcionário
        ▼
┌──────────────────────────────────────────────┐
│               Worker Node.js                 │
│                                              │
│  ┌──────────┐  ┌──────────────┐             │
│  │Normaliz- │  │Pré-classif.  │             │
│  │ador      │→ │determinístico│             │
│  └──────────┘  └──────┬───────┘             │
│                        │ (se não decidido)   │
│                        ▼                     │
│               ┌────────────────┐             │
│               │ Orquestrador   │             │
│               │ Claude API     │             │
│               └────────┬───────┘             │
│                        │                     │
│               ┌────────▼───────┐             │
│               │ Executor de    │             │
│               │ ações por nível│             │
│               └────────┬───────┘             │
│                        │                     │
│               ┌────────▼───────┐             │
│               │ Capturador     │             │
│               │ style diff     │             │
│               └────────────────┘             │
└──────────────────┬───────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   Claude API            Convex DB
   ├── haiku-4-5         ├── funcionarios
   │   (classificação)   ├── perfis
   └── sonnet-4-6        ├── style_cards
       (rascunho +       ├── emails_processados
        baixa conf.)     ├── correcoes
                         └── remetentes
        │                     │
        └──────────┬──────────┘
                   │
                   ▼
          Funcionário revisa
          e envia o rascunho

    [Correção: IMAP MOVE entre
     pastas Fast/* detectado
     pelo worker → Convex DB]
```

---

## Componentes

### Worker Node.js (SaveInCloud VPS)

- **Uma instância por funcionário** — isolamento total, sem risco de dados cruzados
- Conexão IMAP IDLE via ImapFlow — reconexão automática antes de 29 min (RFC 2177)
- Pipeline: receber → normalizar → pré-classificar → (se necessário) classificar via API → executar ações → registrar
- Health check a cada 5 min; monitoramento de saúde e restart automático via PM2 (autorestart: true, ver ecosystem.config.cjs)

### Normalizador

Transforma o email bruto em objeto estruturado antes de qualquer decisão:

```typescript
interface EmailNormalizado {
  messageId: string;
  threadId: string;
  remetente: string;
  dominio: string;
  assunto: string;
  corpo: string;           // texto limpo, sem HTML, sem assinatura
  idioma: "pt-BR" | "en" | "es" | string;
  timestamp: number;
  temAnexos: boolean;
  anexos: Array<{ nome: string; tipo: string }>;
  isThread: boolean;
  threadContext: string[]; // últimas 2 mensagens, se houver
}
```

**Regras do normalizador:**
- Strip HTML via biblioteca (htmlparser2 ou similar)
- Remoção de assinatura: detecta separador padrão (`--\n` ou `---`)
- Detecção de idioma: `franc` ou `langdetect`
- Thread: prefixos "Re:", "Fwd:", "Res:", "Enc:" indicam thread

### Pré-classificador determinístico

Roda **antes** de qualquer chamada à Claude API. Resolve os casos claros sem custo de IA.

| Regra | Fonte | Comportamento |
|---|---|---|
| Blacklist de domínios | Convex — `perfis.remetentes[fonte="blacklist"]` | Nível 5 imediato, sem API |
| Whitelist de remetentes | Convex — `perfis.remetentes[fonte="whitelist"]` | Piso de prioridade garantido; API ainda classifica mas não pode ir abaixo |
| Guard rails globais Fast | Convex — `perfis.guardRails` | Sobrepõem perfil e aprendizado; ex.: diretoria ≥ nível 2 |

**Resultado:**
- Se decidido: nível + regra aplicada → pula a API, vai direto para ações
- Se não decidido: passa para o orquestrador Claude

### Claude API — Classificação

**Modelo padrão:** `claude-haiku-4-5-20251001`
**Modelo de escalada:** `claude-sonnet-4-6` (acionado quando confidence < 0.7)

**Confidence score:** campo `confidence` (0.0–1.0) retornado no JSON da classificação. Se < 0.7, a chamada é repetida com `claude-sonnet-4-6`. O modelo mais capaz prevalece.

**Prompt de classificação — inputs:**
```
[SYSTEM]
Definição dos 5 níveis com critérios e exemplos
Guard rails globais Fast

[CONTEXT]
Perfil do funcionário (mapa de remetentes, áreas, padrões urgentes)
Histórico do remetente (total de emails, nível médio, silêncio prolongado)
3–5 exemplos few-shot das correções mais similares (RAG)

[USER]
Email normalizado (remetente, assunto, corpo, idioma, thread context, lista de anexos)
```

**Prompt de classificação — output esperado (JSON):**
```json
{
  "nivel": 2,
  "confidence": 0.91,
  "justificativa": "Remetente é cliente recorrente. Assunto indica pendência financeira com prazo implícito.",
  "elevadoPorAnexo": false
}
```

**Prompt de rascunho — inputs:**
```
[SYSTEM]
Instrução de geração de resposta corporativa
Style card do funcionário (saudação, despedida, formalidade, vocabulário)
Idioma do email recebido

[USER]
Email normalizado + classificação + justificativa
```

**Modelo de rascunho:** sempre `claude-sonnet-4-6` — qualidade é mais importante que velocidade aqui.

**Output:**
```json
{
  "rascunho": "Olá [nome],\n\nRecebemos sua solicitação...\n\nAtenciosamente,\n[nome do funcionário]"
}
```

### Convex DB — Schema completo

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  funcionarios: defineTable({
    email: v.string(),
    nome: v.string(),
    areas: v.array(v.string()),   // ["comercial", "obra", "financeiro"]
    ativo: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  perfis: defineTable({
    funcionarioId: v.id("funcionarios"),
    remetentes: v.array(v.object({
      email: v.string(),
      dominio: v.optional(v.string()),
      nivelMinimo: v.number(),
      nivelMaximo: v.optional(v.number()),
      fonte: v.string(),          // "whitelist" | "blacklist" | "aprendido"
    })),
    padroeUrgentes: v.array(v.string()),
    guardRails: v.array(v.object({
      dominio: v.optional(v.string()),
      email: v.optional(v.string()),
      pisoNivel: v.number(),
    })),
    versao: v.number(),
    updatedAt: v.number(),
  }).index("by_funcionario", ["funcionarioId"]),

  style_cards: defineTable({
    funcionarioId: v.id("funcionarios"),
    saudacao: v.string(),
    despedida: v.string(),
    formalidade: v.string(),       // "formal" | "semiformal" | "informal"
    comprimentoMedioWords: v.number(),
    vocabulario: v.array(v.string()),
    padroesFechamento: v.array(v.string()),
    versao: v.number(),
    updatedAt: v.number(),
  }).index("by_funcionario", ["funcionarioId"]),

  emails_processados: defineTable({
    funcionarioId: v.id("funcionarios"),
    messageId: v.string(),
    threadId: v.string(),
    remetente: v.string(),
    assunto: v.string(),
    idioma: v.string(),
    nivelClassificado: v.number(),
    nivelCorrigido: v.optional(v.number()),
    justificativa: v.string(),
    confidenceScore: v.optional(v.number()),
    modeloUsado: v.string(),
    promptVersion: v.string(),
    fewShotIds: v.array(v.string()),
    regrasDeterministicas: v.array(v.string()),
    temRascunho: v.boolean(),
    aceitoSemCorrecao: v.optional(v.boolean()),
    processadoEm: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .index("by_message", ["messageId"]),

  // vectorIndex "by_embedding" adicionado para RAG da Fase 2 via Convex Vector Search.
  // dimensions: 1024 = voyage-3-lite. filterFields: ["funcionarioId"] = busca isolada por funcionário.
  correcoes: defineTable({
    funcionarioId: v.id("funcionarios"),
    emailId: v.id("emails_processados"),
    nivelOriginal: v.number(),
    nivelCorrigido: v.number(),
    embedding: v.optional(v.array(v.float64())),
    timestamp: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["funcionarioId"],
    }),

  remetentes: defineTable({
    funcionarioId: v.id("funcionarios"),
    email: v.string(),
    dominio: v.string(),
    totalEmails: v.number(),
    nivelMedio: v.number(),
    ultimaInteracao: v.number(),
    silencioProlongado: v.boolean(), // sem email há mais de 30 dias
  })
    .index("by_funcionario_email", ["funcionarioId", "email"])
    .index("by_funcionario_dominio", ["funcionarioId", "dominio"]),

});
```

### RAG de correções

**Modelo de embeddings:** Voyage AI `voyage-3-lite`
- Melhor relação custo/qualidade para similaridade semântica de texto curto
- Input: `assunto + corpo (truncado a 512 tokens)`

**Fluxo:**
1. Correção salva no Convex → job assíncrono gera embedding via Voyage AI
2. Embedding armazenado em `correcoes.embedding` (array float64)
3. Ao classificar novo email: gera embedding → busca top-5 mais similares por distância coseno, filtrado por `funcionarioId`
4. Top-3 a Top-5 injetados como exemplos few-shot no prompt

**Implementação de busca:** Convex Vector Search nativa via `vectorIndex("by_embedding")` declarado no schema — sem cálculo manual de coseno na memória.

### Style Card — atualização periódica

**Rotina semanal (cron no worker):**
1. Lê últimos 50 emails enviados da pasta Enviados via IMAP
2. Filtra: apenas emails escritos pelo funcionário (não forward, não resposta automática)
3. Envia amostra para `claude-sonnet-4-6` com prompt de extração de estilo
4. Compara com style card anterior — atualiza apenas se mudança significativa (diff > 20%)
5. Salva nova versão no Convex com timestamp

**Sinal forte (captura de diff):**
- Worker monitora pasta Enviados após salvar rascunho
- Quando email com mesmo `threadId` aparece nos Enviados: captura diff rascunho × enviado
- Diff é sinal prioritário para próxima atualização do style card

### Mecanismo de feedback (IMAP MOVE)

O worker monitora eventos de movimentação de emails entre pastas `Fast/*` via IMAP. Quando o funcionário arrasta um email de uma pasta para outra (ex.: `Fast/Normal` → `Fast/Urgente`), o worker detecta o evento, extrai os níveis de origem e destino, e registra a correção no Convex.

- Sem canal externo — feedback acontece dentro da própria caixa de email
- Transparente para o funcionário: reorganizar a caixa já é o sinal de feedback
- Correções alimentam o RAG (fase 2+) e as atualizações de perfil

### SMTP (CSC Empresarial)

Utilizado exclusivamente para envio de email de notificação da reflexão mensal ao funcionário. As credenciais SMTP são as mesmas do servidor CSC Empresarial já utilizado para IMAP.

---

## Decisões de design

| Decisão | Escolha | Razão |
|---|---|---|
| Sem fine-tuning | In-context learning (perfil + RAG) | Auditável, adaptável por funcionário, sem ciclos de retreino |
| Dois modelos Claude | haiku para classificação, sonnet para rascunho/baixa confiança | Otimiza custo sem sacrificar qualidade nas saídas que o funcionário lê |
| Pré-classificador primeiro | Regras determinísticas antes da API | Elimina custo de API para os casos claros (estimativa: ~30% do volume) |
| Rascunho sempre humano | Nunca envio automático | Risco reputacional de email corporativo errado é alto demais |
| Convex como único DB | Perfis + logs + embeddings centralizados | Já usado na empresa, real-time nativo, queries reativos facilitam dashboard |
| Uma instância por funcionário | Worker IMAP dedicado | Isolamento de dados, sem risco de leak entre caixas |
| Voyage AI para embeddings | voyage-3-lite | Melhor qualidade semântica que OpenAI text-embedding-3-small para texto curto em português |

---

## Prompts — versionamento e estrutura de arquivos

```
prompts/
├── classificacao.md      # sistema + instrução de classificação
├── rascunho.md           # instrução de geração de resposta
└── style_extraction.md   # extração de características de estilo
```

- Arquivos em texto plano, versionados em Git
- Cada registro no Convex inclui o hash do commit vigente como `promptVersion`
- Permite reproduzir e auditar qualquer classificação histórica

---

## Orchestrador central (Fase 3)

O orchestrador é o processo responsável por gerenciar o ciclo de vida de todos os workers. Roda como um serviço único no servidor SaveInCloud (gerenciado pelo PM2) e observa a tabela `funcionarios` no Convex via real-time query.

### Responsabilidades

- Subir um worker quando `funcionarios.ativo` passa de `false` para `true`
- Desligar o worker quando `funcionarios.ativo` passa para `false`
- Garantir que nenhum worker duplicado existe para o mesmo funcionário
- Reportar estado de cada worker via logs no Convex e pm2 monit no servidor

### Estrutura do arquivo

```
orchestrator/
├── orchestrator.ts      # processo principal — observa Convex e gerencia workers
├── worker-manager.ts    # sobe/desce processos Node.js filhos via child_process
└── health-registry.ts   # mantém estado atual de cada worker em memória
```

### Fluxo principal

```
Convex (real-time) → funcionarios.ativo mudou?
        │
        ├── true  → WorkerManager.start(funcionario)
        │             └── spawn worker.ts com ENV: EMAIL, IMAP_PASS, FUNCIONARIO_ID
        │
        └── false → WorkerManager.stop(funcionario)
                      └── SIGTERM no processo filho + aguarda graceful shutdown
```

### Variáveis de ambiente por worker (injetadas pelo orchestrador)

```
FUNCIONARIO_EMAIL=joao@fast.com.br
FUNCIONARIO_ID=<convex_id>
IMAP_HOST=imap.csc.com.br
IMAP_PASS=<secret>
```

**Onde fica:** SaveInCloud VPS — processo único do orchestrador gerenciado pelo PM2. Workers são processos filhos gerenciados por ele, não instâncias separadas.

**Fase de ativação:** Fase 3 (rollout). Nas Fases 1 e 2 (MVP e piloto), workers são subidos manualmente, um deploy por funcionário.

---

## Monitoramento e confiabilidade

| Ponto de falha | Detecção | Resposta |
|---|---|---|
| Worker IMAP desconectado | Heartbeat a cada 5 min no Convex | Reconexão automática; PM2 reinicia o processo automaticamente (autorestart: true) |
| Claude API timeout/erro | Retry com backoff exponencial (3 tentativas: 1s, 3s, 9s) | Após 3 falhas: email → pasta `Fast/Pendente-Classificacao`; funcionário vê ao abrir a caixa |
| Voyage AI indisponível | Erro na geração do embedding | Correção salva sem embedding; RAG degrada graciosamente (usa exemplos mais antigos) |
| Drift de aprendizado | Reflexão mensal automatizada | Sugestões aplicadas automaticamente (exceto blacklist); funcionário notificado por email |

---

## Riscos de implementação

| Risco | Mitigação |
|---|---|
| LGPD — conteúdo de email enviado à API externa | Avaliação jurídica antes do MVP; possível DPA com Anthropic; considerar redação de campos sensíveis |
| CSC IMAP IDLE instável | Teste de estabilidade antes do MVP; reconexão automática |
| Drift de aprendizado indesejado | Guard rails globais sobrepõem tudo; blacklist nunca aplicada automaticamente |
| Custo crescente de API | Pré-classificador elimina ~30% das chamadas; monitorar no dashboard |
| Email urgente mal classificado | Guard rails + janela temporal + auditoria mensal de falsos negativos |
