# Guia Dia 1 — MVP Fase 1: Infraestrutura e Conexão IMAP
*Projeto: classificador-emails-fast | Data: 27/04/2026*

---

## Situação de hoje (leia antes de começar)

**Horas estimadas no plano: ~7h ativas + T10 rodando 24h sozinho.**
Com Claude escrevendo o código, T09 que antes levaria 10h agora leva ~3h. O objetivo realista é: T06 + T07 + T08 + T09 finalizados hoje, T10 disparada antes de dormir.

---

### Blockers identificados

| Item | Status | O que fazer |
|------|--------|-------------|
| Anthropic API Key | ⏳ Aguardando TI | Não bloqueia T06, T07, T09. Bloqueia parte da T08 |
| Voyage API Key | ⏳ Aguardando TI | Mesmo acima |
| Convex Key | ✅ Gerada em T06 | Você mesma vai gerar ao criar o projeto |
| IMAP Credentials | ⚠️ Precisa confirmar | Você tem o email, mas precisa do host IMAP. Ver nota abaixo |
| SMTP Credentials | ⚠️ Precisa confirmar com TI | Host SMTP do CSC Empresarial (normalmente mesmo servidor do IMAP) |

**⚠️ Ação urgente antes de começar T09:** Enquanto faz T06 e T07, descubra as configurações IMAP do CSC Empresarial. Veja como na seção de T09.

---

### Ordem recomendada para hoje

```
Manhã       → T06: Criar projeto no Convex (2h)
Manhã       → T07: Seed data do piloto (1h)
Tarde       → T08: Setup no servidor SaveInCloud (1h)
Tarde       → T09: IMAP IDLE (3h — Claude escreve o código)
Antes de dormir → T10: Disparar teste de 24h
```

---

## Pré-requisitos globais

Faça isso primeiro, antes de qualquer task:

**1. Verificar Node.js**
Abra o PowerShell (tecla Windows → digite "powershell" → Enter) e execute:
```
node --version
```
- Apareceu algo como `v20.x.x`? Perfeito, pode continuar.
- Deu erro "não reconhecido"? Acesse https://nodejs.org → clique em "Download LTS" → instale normalmente.

**2. Verificar Git**
```
git --version
```
- Deu erro? Acesse https://git-scm.com → Download → instale com todas as opções padrão.

**3. Verificar npm**
```
npm --version
```
Se Node.js está instalado, npm já está junto.

---

## T06 — Criar projeto no Convex (2h estimadas)

### O que é o Convex?
Convex é o banco de dados em nuvem do projeto. É onde ficam armazenados os emails processados, os perfis dos funcionários, os style cards, as correções e o histórico de remetentes. Ele já é usado na empresa segundo o briefing — confirme com o TI se já existe uma organização/conta corporativa para usar ao invés de criar uma pessoal.

---

### Passo 1 — Verificar/criar conta no Convex

- Acesse: **https://convex.dev**
- Clique em "Get Started" ou "Sign in"
- Tente fazer login com seu email da empresa (`clara.barbosa@fastdrywall.com.br`)
- Se já existir uma organização da Fast no Convex, o TI deve te adicionar como membro antes de continuar
- Se não existir, crie uma conta nova (pode usar o email da empresa ou GitHub)

> **Não sabe se já existe?** Pergunte ao TI no mesmo momento que você pede as outras chaves. A pergunta é: "Já existe um projeto/organização da Fast no Convex? Se sim, preciso de acesso."

---

### Passo 2 — Criar a pasta do projeto no computador

No PowerShell:
```
mkdir C:\Projetos\classificador-email
cd C:\Projetos\classificador-email
```

---

### Passo 3 — Inicializar o projeto Convex

Execute:
```
npm create convex@latest .
```

Durante o processo vai perguntar:
- **What would you like to call your project?** → `classificador-email`
- **Which framework do you want to use?** → Escolha `Vanilla Node.js` (sem framework)
- **Do you want to use TypeScript?** → `Yes` (recomendado)

Ao final, vai abrir o browser pedindo para conectar ao Convex. Faça login e selecione o projeto `classificador-email`.

Isso vai criar automaticamente um arquivo `.env.local` na pasta com a variável `CONVEX_DEPLOYMENT` preenchida — guarde essa URL, você vai precisar dela na T08.

---

### Passo 4 — Deixar o Convex em modo desenvolvimento

Execute:
```
npx convex dev
```

Deixe esse terminal aberto e rodando. Ele vai sincronizar automaticamente as mudanças que você fizer nos arquivos da pasta `convex/`.

Abra um **segundo terminal** (PowerShell novo) para o resto dos comandos.

---

### Passo 5 — Criar o schema

> **⚡ Atualização do schema (27/04/2026):** A tabela `correcoes` recebeu `.vectorIndex("by_embedding")` — necessário para que o RAG da Fase 2 funcione via busca por similaridade no Convex. O campo `embedding` já existia; a novidade é o índice que permite ao Convex executar vector search nativamente sem carregar todos os embeddings na memória.

Na pasta `convex/`, crie (ou substitua) o arquivo `schema.ts` com o conteúdo abaixo. Este schema foi desenhado com base no briefing v2.0 do projeto:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  // Registro de cada funcionário monitorado
  funcionarios: defineTable({
    nome: v.string(),
    email: v.string(),
    areas: v.array(v.string()),   // ex: ["comercial", "obra", "financeiro"]
    ativo: v.boolean(),
    criadoEm: v.number(),
    atualizadoEm: v.number(),
  }).index("by_email", ["email"]),

  // Perfil de classificação do funcionário — regras determinísticas e guard rails
  perfis: defineTable({
    funcionarioId: v.id("funcionarios"),
    // Remetentes com prioridade mapeada (whitelist e aprendidos)
    mapaRemetentes: v.array(v.object({
      email: v.optional(v.string()),
      dominio: v.optional(v.string()),
      nivelMinimo: v.number(),
      nivelMaximo: v.optional(v.number()),
      fonte: v.string(),          // "whitelist" | "aprendido"
    })),
    blacklistDominios: v.array(v.string()),
    padroesAssuntoUrgente: v.array(v.string()),
    // Guard rails globais — sobrepõem perfil e aprendizado (ex: diretoria >= nível 2)
    guardRails: v.array(v.object({
      dominio: v.optional(v.string()),
      email: v.optional(v.string()),
      pisoNivel: v.number(),
    })),
    versao: v.number(),
    atualizadoEm: v.number(),
  }).index("by_funcionario", ["funcionarioId"]),

  // Tom e estilo de escrita do funcionário — aprende com o tempo
  style_cards: defineTable({
    funcionarioId: v.id("funcionarios"),
    saudacaoPreferida: v.string(),
    despedidaPreferida: v.string(),
    formalidade: v.string(),        // "formal" | "semiformal" | "informal"
    comprimentoMedioWords: v.number(),
    vocabularioRecorrente: v.array(v.string()),
    padroesFechamento: v.array(v.string()),
    versao: v.number(),
    atualizadoEm: v.number(),
  }).index("by_funcionario", ["funcionarioId"]),

  // Registro completo de cada email processado
  emails_processados: defineTable({
    funcionarioId: v.id("funcionarios"),
    messageId: v.string(),          // ID único do email — impede processamento duplicado
    remetenteId: v.id("remetentes"),
    assunto: v.string(),
    // corpo omitido — risco LGPD (pendência P3 do plano; reavaliar após aprovação jurídica)
    idioma: v.string(),
    threadId: v.string(),
    temAnexos: v.boolean(),
    tiposAnexos: v.array(v.string()),
    // Resultado da classificação
    nivelClassificado: v.number(),
    nivelCorrigido: v.optional(v.number()),
    justificativa: v.string(),
    confidenceScore: v.optional(v.number()),  // < 0.7 aciona escalada para Sonnet
    modeloUsado: v.string(),                  // "haiku" | "sonnet"
    rascunhoResposta: v.optional(v.string()),
    aceitoSemCorrecao: v.optional(v.boolean()),
    // Rastreabilidade — reproduz e audita qualquer classificação histórica
    versaoPrompt: v.string(),
    exemplosFewShotUsados: v.array(v.string()),
    regrasDeterministicasAplicadas: v.array(v.string()),
    // Timestamps
    recebidoEm: v.number(),
    processadoEm: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .index("by_message", ["messageId"])
    .index("by_thread", ["threadId"])
    .index("by_remetente", ["remetenteId"]),

  // vectorIndex "by_embedding" adicionado para RAG da Fase 2 via Convex Vector Search.
  // dimensions: 1024 = voyage-3-lite. filterFields: ["funcionarioId"] = busca isolada por funcionário.
  correcoes: defineTable({
    emailId: v.id("emails_processados"),
    funcionarioId: v.id("funcionarios"),
    nivelOriginal: v.number(),
    nivelCorrigido: v.number(),
    embedding: v.optional(v.array(v.float64())), // gerado pelo Voyage AI (voyage-3-lite)
    timestamp: v.number(),
  })
    .index("by_funcionario", ["funcionarioId"])
    .index("by_email", ["emailId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["funcionarioId"],
    }),

  // Histórico de remetentes por funcionário — alimenta contexto do prompt
  remetentes: defineTable({
    funcionarioId: v.id("funcionarios"),
    email: v.string(),
    nome: v.optional(v.string()),
    dominio: v.string(),
    totalEmailsRecebidos: v.number(),
    nivelMedio: v.number(),           // nível médio histórico — sinal injetado no prompt
    ultimoContato: v.number(),
    silencioProlongado: v.boolean(),  // sem email há mais de 30 dias
  })
    .index("by_funcionario_email", ["funcionarioId", "email"])
    .index("by_funcionario_dominio", ["funcionarioId", "dominio"]),

});
```

**Salve o arquivo.** Se o `npx convex dev` estiver rodando, o schema é aplicado automaticamente em segundos.

---

### Passo 6 — Confirmar no dashboard

- Acesse **convex.dev** → seu projeto → aba **"Data"**
- Devem aparecer 6 tabelas: `funcionarios`, `perfis`, `style_cards`, `emails_processados`, `correcoes`, `remetentes`
- Se aparecerem: ✅ T06 concluída

---

## T07 — Criar seed data do funcionário piloto (1h estimada)

### O que é?
Inserir o primeiro registro real no banco: você como funcionária piloto, com perfil vazio e style card no padrão corporativo Fast.

---

### Passo 1 — Criar o arquivo de seed

> **⚡ Atualização da seed (28/04/2026):** Código revisado com verificação de duplicatas via `.withIndex("by_email")` antes de inserir, prevenindo registros duplicados em re-execuções. Perfil inclui `guardRails` comentado como exemplo de uso futuro. Style card com valores padrão alinhados ao código de cultura Fast (tom semiformal, emails curtos).

Na pasta `convex/`, crie (ou substitua) o arquivo `seed.ts`:

```typescript
import { mutation } from "./_generated/server";

export const seedPiloto = mutation({
  args: {},
  handler: async (ctx) => {
    const EMAIL_PILOTO = "clara.barbosa@fastdrywall.com.br";

    // Evitar duplicatas — verificar se já existe
    const existente = await ctx.db
      .query("funcionarios")
      .withIndex("by_email", q => q.eq("email", EMAIL_PILOTO))
      .first();

    if (existente) {
      console.log("Funcionário piloto já existe:", existente._id);
      return { status: "já existe", id: existente._id };
    }

    const agora = Date.now();

    // 1. Inserir funcionário piloto
    const funcionarioId = await ctx.db.insert("funcionarios", {
      nome: "Clara Barbosa",
      email: EMAIL_PILOTO,
      areas: ["planejamento"],  // ← ajuste para sua área real
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    // 2. Perfil vazio — será populado automaticamente com o tempo
    await ctx.db.insert("perfis", {
      funcionarioId,
      mapaRemetentes: [],       // whitelist e aprendidos entram aqui com o tempo
      blacklistDominios: [],
      padroesAssuntoUrgente: [],
      guardRails: [
        // Exemplo de guard rail: emails da diretoria nunca abaixo de nível 2
        // { dominio: "fastdrywall.com.br", pisoNivel: 2 }
        // Descomente e ajuste conforme necessário
      ],
      versao: 1,
      atualizadoEm: agora,
    });

    // 3. Style card com valores padrão corporativo Fast
    // (tom claro, objetivo, direto — alinhado ao código de cultura)
    await ctx.db.insert("style_cards", {
      funcionarioId,
      saudacaoPreferida: "Olá",
      despedidaPreferida: "Att,",
      formalidade: "semiformal",
      comprimentoMedioWords: 80,   // emails curtos e diretos
      vocabularioRecorrente: [],
      padroesFechamento: [],
      versao: 1,
      atualizadoEm: agora,
    });

    console.log("Funcionário piloto criado com sucesso:", funcionarioId);
    return { status: "criado", funcionarioId };
  },
});
```

> **Ajuste:** O campo `areas` está com `"planejamento"` como exemplo. Ajuste para a sua área real antes de rodar (ex.: `"comercial"`, `"administrativo"`, etc.).

---

### Passo 2 — Executar o seed

**Opção A — Via dashboard (mais fácil, recomendada):**
1. Acesse convex.dev → seu projeto → aba **"Functions"**
2. Procure `seed` → `seedPiloto`
3. Clique em **"Run Function"**
4. A saída deve mostrar `{ "status": "criado", "funcionarioId": "..." }`

**Opção B — Via terminal:**
```
npx convex run seed:seedPiloto
```

---

### Passo 3 — Confirmar

No dashboard Convex → aba **"Data"**:
- `funcionarios` → 1 registro (Clara Barbosa)
- `perfis` → 1 registro vinculado
- `style_cards` → 1 registro vinculado

✅ T07 concluída quando os 3 registros aparecerem.

---

## T08 — Setup do worker no servidor SaveInCloud (1h estimada)

### O que é o servidor SaveInCloud?
O worker (programa Node.js que fica monitorando os emails) vai rodar 24h por dia em um VPS (servidor virtual privado) da SaveInCloud — provedor brasileiro. O servidor tem IP fixo e fica no Brasil. O gerenciador de processos usado é o **PM2**, que reinicia o worker automaticamente se ele cair.

Para instruções completas de provisionamento do zero, veja `docs/setup-servidor.md`.

---

### Passo 1 — Acessar o servidor via SSH

```bash
ssh usuario@IP_DO_SERVIDOR
```

O IP e as credenciais de acesso são fornecidos pela SaveInCloud no painel de controle da conta.

---

### Passo 2 — Clonar o repositório no servidor

```bash
git clone <URL_DO_REPOSITORIO> classificador-email
cd classificador-email
npm ci --omit=dev
```

---

### Passo 3 — Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

**Preencha agora (você já tem esses dados):**
```
IMAP_PORT         = 993
IMAP_USER         = clara.barbosa@fastdrywall.com.br
IMAP_PASSWORD     = [sua senha do email CSC Empresarial]
CONVEX_URL        = [a URL do seu deployment Convex]
```

**Preencha com os dados confirmados pelo TI (protocolo CSC 20246):**
```
IMAP_HOST         = mail.cscempresarial.com.br
SMTP_HOST         = mail.cscempresarial.com.br
SMTP_PORT         = 587
SMTP_USER         = [mesmo do IMAP_USER]
SMTP_PASSWORD     = [mesmo do IMAP_PASSWORD]
```

**Ainda pendentes:**
```
ANTHROPIC_API_KEY = [aguardando liberação]
VOYAGE_API_KEY    = [aguardando liberação]
```

Proteja o arquivo:
```bash
chmod 600 .env
```

---

### Passo 4 — Iniciar o worker com PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # seguir as instruções exibidas para auto-start no boot
```

---

### Passo 5 — Verificar que está rodando

```bash
pm2 status
pm2 logs classificador-email --lines 20
```

Você deve ver:
```
[WORKER] Classificador de emails iniciado
[WORKER] Worker aguardando emails via IMAP IDLE...
```

✅ T08 concluída quando o worker aparecer como `online` no `pm2 status` e os logs aparecerem.

---

## T09 — Implementar conexão IMAP IDLE (3h estimadas)

### ✅ Configurações IMAP confirmadas pelo TI (protocolo CSC 20246)

| Configuração | Valor |
|---|---|
| Host IMAP | `mail.cscempresarial.com.br` |
| Porta (SSL) | `993` — **usar este** |
| Porta (sem SSL) | `143` |
| SSL/TLS | Sim |
| IMAP IDLE | Suportado ✅ |
| Conexões externas | Aceitas, sem restrição de IP ✅ |
| Host SMTP | `mail.cscempresarial.com.br` (mesmo host) |
| Porta SMTP | `587` (sem SSL) ou `465` (com SSL) |

---

### O que é IMAP IDLE?

IMAP IDLE é um comando do protocolo de email que mantém uma conexão aberta com o servidor. Em vez do worker ficar perguntando "chegou email?" a cada X minutos (polling), o servidor avisa imediatamente quando chega algo — como uma notificação push.

O RFC 2177 (a especificação oficial) diz que servidores podem encerrar conexões ociosas após 30 minutos. Por isso, o worker vai reconectar preventivamente a cada 28 minutos, antes de qualquer timeout.

---

### Passo 1 — Instalar a biblioteca

```
cd C:\Projetos\email-worker
npm install imapflow
```

---

### Passo 2 — Criar o arquivo de arquivo `.env` local para testes

Crie `C:\Projetos\email-worker\.env`:
```
IMAP_HOST=imap.cscempresarial.com.br
IMAP_PORT=993
IMAP_USER=clara.barbosa@fastdrywall.com.br
IMAP_PASS=sua-senha-aqui
CONVEX_URL=https://... (copie do arquivo .env.local de classificador-email)
```

> Esse arquivo não vai para o Git (já está no .gitignore). Só existe local para testes.

---

### Passo 3 — Criar o módulo IMAP

Crie `C:\Projetos\email-worker\imap.js`:

```javascript
const { ImapFlow } = require('imapflow');

// Reconectar preventivamente antes de 30 minutos (RFC 2177)
const INTERVALO_RECONEXAO_PREVENTIVA = 28 * 60 * 1000; // 28 min em milissegundos

let client = null;
let timerReconexao = null;

async function criarConexao() {
  // Limpar timer anterior se existir
  if (timerReconexao) {
    clearTimeout(timerReconexao);
    timerReconexao = null;
  }

  console.log('[IMAP] Tentando conectar ao servidor...');

  client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    secure: true,  // TLS/SSL
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,  // Remover se quiser logs detalhados do ImapFlow
  });

  // Tratar erros de conexão
  client.on('error', (err) => {
    console.error('[IMAP] Erro na conexão:', err.message);
    agendarReconexao(5000); // Tentar novamente em 5 segundos
  });

  try {
    await client.connect();
    console.log('[IMAP] ✅ Conectado com sucesso em', new Date().toISOString());

    // Abrir INBOX para monitoramento
    await client.mailboxOpen('INBOX');
    console.log('[IMAP] INBOX aberta e pronta para monitoramento');

    // Listener: dispara quando chega email novo
    client.on('exists', async (data) => {
      console.log('[IMAP] 📧 Novo email detectado:', data, '| Hora:', new Date().toISOString());
      await processarNovosEmails();
    });

    // Ativar modo IDLE — aguarda notificações do servidor
    await iniciarIdle();

    // Agendar reconexão preventiva em 28 minutos
    agendarReconexaoPreventiva();

  } catch (err) {
    console.error('[IMAP] ❌ Falha ao conectar:', err.message);
    agendarReconexao(10000); // Tentar novamente em 10 segundos
  }
}

async function iniciarIdle() {
  try {
    console.log('[IMAP] Entrando em modo IDLE...');
    await client.idle(); // Bloqueia até receber notificação ou erro
  } catch (err) {
    // O IDLE pode ser interrompido intencionalmente (reconexão preventiva) — não é erro
    if (err.message !== 'Connection closed') {
      console.error('[IMAP] Erro no IDLE:', err.message);
    }
  }
}

function agendarReconexao(delay = 5000) {
  if (timerReconexao) clearTimeout(timerReconexao);
  console.log(`[IMAP] Reagendando conexão em ${delay / 1000}s...`);
  timerReconexao = setTimeout(criarConexao, delay);
}

function agendarReconexaoPreventiva() {
  if (timerReconexao) clearTimeout(timerReconexao);
  const minutosRestantes = INTERVALO_RECONEXAO_PREVENTIVA / 60000;
  console.log(`[IMAP] Reconexão preventiva agendada para ${minutosRestantes} min | ${new Date(Date.now() + INTERVALO_RECONEXAO_PREVENTIVA).toISOString()}`);

  timerReconexao = setTimeout(async () => {
    console.log('[IMAP] 🔄 Executando reconexão preventiva...');
    try {
      await client.logout();
    } catch (e) {
      // Ignora erro no logout — o importante é reconectar
    }
    await criarConexao();
  }, INTERVALO_RECONEXAO_PREVENTIVA);
}

async function processarNovosEmails() {
  // Placeholder para as próximas tasks do MVP
  // Aqui vai entrar a lógica de: normalização → pré-classificador → Claude API → ações
  console.log('[EMAIL] Processamento pendente — implementar nas próximas tasks');
}

module.exports = { criarConexao };
```

---

### Passo 4 — Atualizar o `index.js` principal

Substitua o conteúdo de `C:\Projetos\email-worker\index.js`:

```javascript
require('dotenv').config();
const { criarConexao } = require('./imap');

console.log('[WORKER] ====================================');
console.log('[WORKER] Classificador de Emails Fast — iniciando');
console.log('[WORKER] ====================================');

// Validar variáveis obrigatórias antes de tentar conectar
const variaveisObrigatorias = ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASS'];
const faltando = variaveisObrigatorias.filter(v => !process.env[v]);
if (faltando.length > 0) {
  console.error('[WORKER] ❌ Variáveis de ambiente faltando:', faltando.join(', '));
  process.exit(1);
}

// Iniciar conexão IMAP
criarConexao();

// Manter processo vivo e logar erros não capturados
process.on('uncaughtException', (err) => {
  console.error('[WORKER] Erro não capturado:', err.message);
  // PM2 reinicia automaticamente após o processo encerrar (autorestart: true)
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WORKER] Promise rejeitada sem handler:', reason);
  process.exit(1);
});
```

---

### Passo 5 — Testar localmente

```
cd C:\Projetos\email-worker
node index.js
```

**O que você deve ver se tudo estiver certo:**
```
[WORKER] ====================================
[WORKER] Classificador de Emails Fast — iniciando
[WORKER] ====================================
[IMAP] Tentando conectar ao servidor...
[IMAP] ✅ Conectado com sucesso em 2026-04-27T...
[IMAP] INBOX aberta e pronta para monitoramento
[IMAP] Entrando em modo IDLE...
[IMAP] Reconexão preventiva agendada para 28 min | 2026-04-27T...
```

**O processo não encerra sozinho** — isso é correto. Ele fica aguardando novos emails. Aperte `Ctrl+C` para encerrar quando quiser parar o teste.

---

### Erros comuns e soluções

| Erro | Causa provável | Solução |
|------|----------------|---------|
| `ENOTFOUND imap.cscempresarial.com.br` | Host IMAP errado | Confirmar com TI o host correto |
| `ETIMEDOUT` | Porta errada ou firewall | Tentar porta 143 com `secure: false` |
| `Authentication failed` | Senha errada | Verificar senha — pode ser diferente da senha do webmail se houver 2FA |
| `Variáveis de ambiente faltando` | .env não criado/incompleto | Verificar arquivo .env |

---

### Passo 6 — Deploy no servidor

Após teste local bem-sucedido:
```
git add .
git commit -m "feat: implementação IMAP IDLE com reconexão preventiva RFC 2177"
git push
```

No servidor SaveInCloud, execute o deploy:
```bash
bash scripts/deploy.sh
```

Atualizar também a variável `IMAP_HOST` no `.env` do servidor com o valor confirmado.

✅ T09 concluída quando os logs do PM2 mostrarem "IDLE ativo" sem erros por pelo menos 30 minutos.
```bash
pm2 logs classificador-email --lines 50
```

---

## T10 — Teste de estabilidade IMAP 24h (2h de atenção, 24h de observação)

### O que é?
Deixar o worker rodando no servidor SaveInCloud sem tocar por 24h, verificando se a conexão se mantém estável, as reconexões preventivas acontecem corretamente, e nenhum email escapa silenciosamente.

---

### Como iniciar
T09 deployada no servidor = T10 já começou. Anote o horário de início.

**Dispare antes de dormir**, mesmo que T09 esteja no limite do dia — o teste roda sozinho.

---

### O que monitorar (via `pm2 logs classificador-email`)

**Sinal saudável a cada ~28 minutos:**
```
[IMAP] 🔄 Executando reconexão preventiva...
[IMAP] ✅ Conectado com sucesso em 2026-04-27T...
[IMAP] INBOX aberta e pronta para monitoramento
[IMAP] Reconexão preventiva agendada para 28 min | ...
```

**Sinal de problema:**
- Período de mais de 30 minutos sem nenhum log
- Linha `❌ Falha ao conectar` repetida sem recuperação
- Worker reiniciado pelo PM2 mais de 2 vezes em 24h (checar: `pm2 describe classificador-email`)

---

### Checklist de conclusão (após 24h)

- [ ] Reconexões preventivas acontecendo a cada ~28 min nos logs
- [ ] Nenhum gap de silêncio maior que 30 min
- [ ] Nenhum crash sem recuperação automática
- [ ] Se chegou algum email real, linha `📧 Novo email detectado` aparece nos logs

✅ T10 concluída quando todos os itens acima estiverem marcados.

---

## Pendências com TI (para resolver hoje em paralelo)

Agrupe tudo em uma mensagem para o TI:

> "Preciso das seguintes informações para o projeto do classificador de emails:
> 1. Anthropic API Key (Claude API)
> 2. Voyage API Key (embeddings)
> 3. Configurações IMAP do CSC Empresarial: host, porta e se usa SSL
> 4. Configurações SMTP do CSC Empresarial: host, porta (para envio de emails de notificação)
> 5. Já existe um projeto/organização da Fast no Convex? Se sim, precisarei de acesso."

---

## Referências rápidas

| Recurso | URL |
|---------|-----|
| Dashboard Convex | https://dashboard.convex.dev |
| Servidor SaveInCloud | Acesso via SSH — ver `docs/setup-servidor.md` |
| Documentação ImapFlow | https://imapflow.com |
| Voyage AI (embeddings) | https://voyageai.com |
