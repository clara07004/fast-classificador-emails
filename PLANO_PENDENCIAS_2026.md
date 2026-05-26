# Plano de Pendências — classificador-emails-fast
**Criado em:** 2026-05-25  
**Base:** varredura completa do código + documentos em 25/05/2026  
**Total estimado:** ~35h distribuídas em 5 sessões

---

## Sessão 1 — Quick wins + feedback loop ativo (3h)

Tudo que está quase pronto e precisa só de ajuste fino. Nenhuma dessas tarefas exige arquitetura nova.

### 1.1 Publicar endpoint `/health` no Convex (5 min)
O arquivo `convex/health.ts` foi criado em 19/05 mas nunca publicado.

```bash
cd /home/jelastic/fast-classificador-emails && npx convex deploy
```

**Critério de saída:** `curl https://chatty-panda-261.convex.cloud/health` retorna 200.

---

### 1.2 Configurar UptimeRobot (15 min)
Criar monitor gratuito em https://uptimerobot.com apontando para `https://chatty-panda-261.convex.cloud/health`. Notificação por email quando cair.

**Critério de saída:** monitor ativo, alerta de teste recebido.

---

### 1.3 Descomentar 3 integrações Convex (30 min)
Três chamadas reais que estão comentadas como TODOs. Ver detalhes em `PROXIMO_PASSO_AGORA.md`.

- `src/imap/movimento-monitor.js` linha ~180 → `await this.convex.mutation(api.emails.registrarMovimento, movimento)`
- `src/feedback/learning-block.js` linha ~40 → `await this.convex.query(api.emails.buscarMovimentosPorFuncionario, ...)`
- `src/reports/weekly-feedback-report.js` linha ~25 → `await this.convex.query(api.emails.buscarMovimentosPorPeriodo, ...)`

**Critério de saída:** `node --check` em todos os arquivos modificados sem erro.

---

### 1.4 Corrigir TODOs em erro.js (30 min)
Dois pontos onde erros de processamento deveriam ser registrados no Convex mas não são.

- `src/imap/erro.js` linha 71 — adicionar chamada real ao Convex após o email ser movido para Pendente
- `src/imap/erro.js` linha 173 — idem

---

### 1.5 Ativar MovimentoMonitor no worker principal (1h)
O `MovimentoMonitor` existe como classe autônoma mas não está instanciado em nenhum lugar. O feedback loop via IMAP MOVE do usuário não está ativo.

**O que fazer em `src/imap/worker.js`:**
- Importar `MovimentoMonitor`
- Instanciar após a conexão IMAP ser estabelecida, passando `client` e o Convex client
- Chamar `monitor.start()` junto com o início do IDLE
- Chamar `monitor.stop()` no cleanup de reconexão

**Critério de saída:** ao mover um email entre pastas Fast/* manualmente, o movimento aparece registrado no Convex.

---

### 1.6 Conectar ValidationDashboard ao Convex real (30 min)
`src/reports/validation-dashboard.js` retorna `metricasPlaceholder()` com zeros. O TODO indica que é só descomentar a query real.

---

**Total Sessão 1: ~3h**  
**Resultado:** feedback loop ativo, monitoramento externo configurado, todos os placeholders resolvidos.

---

## Sessão 2 + 3 — Geração de rascunhos (8h)

A maior lacuna do MVP. Os arquivos `src/drafts/` não existem. Nenhuma linha de código foi escrita para essa feature.

### 2.1 Criar prompt de rascunho v1 (1h) — T19
Novo arquivo: `src/drafts/prompts/rascunho-v1.js`

- Tom corporativo padrão Fast
- Gerar resposta no idioma do email recebido
- Estrutura: abertura + corpo + fechamento
- Rascunho deve ser revisável — não presume aprovação automática

---

### 2.2 Implementar geração de rascunho via Claude (2h) — T20
Novo arquivo: `src/drafts/draft-generator.js`

- Chamar Claude API (sonnet) apenas para níveis 1–4 (nível 5 = irrelevante, sem rascunho)
- Receber email normalizado + classificação como input
- Retornar texto do rascunho
- Timeout e fallback: se Claude falhar, não bloquear o processamento do email

---

### 2.3 Salvar rascunho na caixa IMAP via APPEND (2h) — T21
Novo arquivo: `src/drafts/draft-saver.js`

- Usar `client.append('Drafts', rawMessage)` do ImapFlow
- Construir mensagem RFC 2822 completa (headers + corpo)
- Preencher `To:` com o remetente original, `Subject:` com `Re: [assunto original]`
- Atenção: pasta pode se chamar `Drafts`, `INBOX.Drafts` ou `Rascunhos` dependendo do servidor — verificar com `client.list()` primeiro

**Critério de saída:** receber email P1 → rascunho aparece na pasta Drafts da caixa do funcionário em < 30s.

---

### 2.4 Integrar rascunho no fluxo principal (1h)
Em `src/imap/worker.js`, dentro de `processarEmailIndividual`:

- Após `moverComFallback`, chamar `gerarRascunho` se nível 1–4
- Salvar referência do rascunho no Convex junto com o email processado
- Não bloquear o fluxo se geração de rascunho falhar — email já foi classificado e movido

---

### 2.5 Capturar diff rascunho × enviado (2h) — T39
Quando o funcionário enviar um email a partir do rascunho, capturar a diferença entre o rascunho gerado e o email final enviado. Essa diferença alimenta o style card na Fase 2.

- Monitorar pasta Enviados via IMAP
- Cruzar por Message-ID ou assunto + destinatário
- Salvar diff no Convex

---

**Total Sessões 2+3: ~8h**  
**Resultado:** pipeline MVP completo — email recebido → classificado → rascunho na caixa em < 30s.

---

## Sessão 4 — Segurança (3h)

Duas pendências de segurança que precisam ser resolvidas antes de escalar para mais funcionários.

### 4.1 Mascarar PII nos logs — S7 (1h)
Subject e conteúdo dos emails aparecem em `pm2-out.log` sem tratamento. Risco LGPD.

**O que fazer:**
- Em `src/logger.js`, adicionar serializer que mascara campos sensíveis (`subject`, `from`, `body`, `texto`)
- Ou definir campos permitidos em log vs. campos que precisam de hash/truncagem
- Não é necessário eliminar o dado — mascarar os últimos N chars ou usar hash é suficiente para fins de auditoria

**Critério de saída:** nenhum conteúdo de email legível em `pm2-out.log`.

---

### 4.2 Autenticação Convex — S4 (2h)
A URL `chatty-panda-261.convex.cloud` aceita chamadas anônimas. Qualquer pessoa com a URL pode ler e gravar o banco.

**Solução documentada no backlog:** internal functions + HTTP gateway com token de autenticação.

**O que fazer:**
- Criar função HTTP no Convex com verificação de `Authorization: Bearer <token>`
- Mover as mutations/queries chamadas pelo worker para internal functions
- Gerar token secreto e adicionar ao `.env` do servidor
- Atualizar `src/convex/cliente.js` para enviar o header

**Critério de saída:** chamada sem token retorna 401; chamada com token funciona normalmente.

---

**Total Sessão 4: ~3h**  
**Pré-requisito para Fase 3:** S4 deve estar resolvido antes de adicionar qualquer novo funcionário.

---

## Sessões 5 + 6 — Fase 2: aprendizado individual (13h)

O sistema aprende com as correções do funcionário e gera rascunhos no tom individual de cada um.

**Pré-requisito:** sessões 1–3 concluídas + pelo menos 2 semanas de correções reais acumuladas no Convex.

### 5.1 Setup Voyage AI + embeddings (1h) — T31
- Criar conta Voyage AI, obter API key
- Adicionar `VOYAGE_API_KEY` ao `.env`
- Instalar `voyageai` no projeto
- Criar `src/embeddings/voyage-client.js` com função `gerarEmbedding(texto)`

---

### 5.2 Pipeline assíncrono de embeddings (2h) — T32
Novo arquivo: `src/embeddings/embedding-pipeline.js`

- A cada correção salva no Convex (movimento MOVE detectado), gerar embedding do texto do email
- Salvar embedding no campo `embedding` da tabela `correcoes` (vectorIndex já declarado no schema com dimensions: 1024)
- Rodar de forma assíncrona — não bloquear o processamento principal

---

### 5.3 Backfill de embeddings existentes (1h) — T33
Script único `scripts/backfill-embeddings.js` para gerar embeddings das correções já acumuladas no Convex.

---

### 5.4 Busca por similaridade coseno (2h) — T34
Em `src/embeddings/similarity-search.js`:

- Dado um novo email, gerar seu embedding e buscar os 3–5 mais similares na tabela `correcoes`
- Usar `db.query("correcoes").withIndex("by_embedding")` no Convex (vectorIndex já existe)

---

### 5.5 Injetar few-shot RAG no prompt de classificação (1h) — T35
Em `src/imap/classificador.js`, antes de chamar Claude:

- Chamar `buscarCorrecoesSimilares(email)` 
- Formatar os exemplos encontrados como few-shot no prompt
- Formato: "Emails similares que você reclassificou: [exemplo 1] era P2, não P1"

---

### 5.6 Extração de style card (3h) — T36, T37, T38
Novo arquivo: `src/feedback/style-card.js`

- Prompt de extração: analisa emails enviados pelo funcionário e identifica padrões de tom, saudação, assinatura, vocabulário
- Rotina semanal via `scripts/atualizar-style-card.js`
- Salvar style card na tabela `style_cards` do Convex

---

### 5.7 Injetar style card no prompt de rascunho (1h) — T40
Em `src/drafts/draft-generator.js`, buscar o style card do funcionário antes de gerar o rascunho e injetar no prompt.

---

### 5.8 Reflexão mensal (2h) — T43
Novo arquivo: `src/reports/reflexao-mensal.js`

- Analisa correções do mês via Claude
- Gera sugestões: novos remetentes para whitelist, padrões de urgência novos, termos para blacklist
- Aplica automaticamente: whitelist, urgência, guard rails
- Blacklist: salva como pendente, não aplica sem aprovação humana
- Envia email SMTP para o funcionário listando mudanças

---

**Total Sessões 5+6: ~13h**  
**Resultado:** classificador aprende com o comportamento individual; rascunhos no tom de cada funcionário.

---

## Sessão 7 — Fase 3: preparação para rollout (6h)

**Pré-requisito:** S4 (autenticação Convex) resolvido. Credenciais IMAP do segundo funcionário disponíveis (blocker externo: CSC Empresarial).

### 7.1 Parametrizar worker para múltiplos funcionários (2h) — T44
Hoje o worker é hardcoded para um `FUNCIONARIO_ID`. Precisa virar um processo por funcionário, cada um com seu `.env` isolado.

**Abordagem sugerida:** um `ecosystem.config.cjs` com múltiplas apps, cada uma com suas variáveis de ambiente. PM2 gerencia os processos independentemente.

---

### 7.2 Script de onboarding de novo funcionário (2h) — T45
Novo arquivo: `scripts/onboarding-funcionario.js`

- Cria registro do funcionário no Convex
- Cria as pastas Fast/* na caixa IMAP
- Inicia novo processo PM2 com as credenciais fornecidas
- Valida conexão e primeiros emails

**Critério de saída:** novo funcionário onboardado em < 15 minutos.

---

### 7.3 Documentação de operação (2h) — T46
Atualizar `OPERACAO.md` com:

- Runbook: o que fazer quando o worker cai, quando o Convex dá erro, quando IMAP falha
- Como adicionar novo funcionário
- Como revogar acesso de um funcionário
- Como monitorar métricas de classificação

---

**Total Sessão 7: ~6h**  
**Resultado:** sistema pronto para rollout na rede Fast.

---

## Blocker externo

**Credenciais IMAP por funcionário (CSC Empresarial)**  
Sem email + senha de app por funcionário, a Sessão 7 não pode ser executada. Esse pedido está em aberto com o TI. Cobrar antes de iniciar a Sessão 7.

---

## Resumo do cronograma

| Sessão | Foco | Horas | Pré-requisito |
|--------|------|-------|---------------|
| 1 | Quick wins + feedback loop | 3h | Nenhum |
| 2+3 | Rascunhos (T19–T21, T39) | 8h | Sessão 1 |
| 4 | Segurança (S4 + S7) | 3h | Sessão 1 |
| 5+6 | Fase 2 — RAG + style card | 13h | Sessões 1–3 + 2 semanas de dados |
| 7 | Fase 3 — rollout | 6h | Sessão 4 + credenciais CSC |
| **Total** | | **~35h** | |

---

## O que já está pronto (não precisa tocar)

- Conexão IMAP IDLE com reconexão automática ✓
- Normalizador de email ✓
- Pré-classificador determinístico (blacklist, whitelist, urgência) ✓
- Classificação via Claude API com fallback ✓
- Defesa contra prompt injection ✓
- Movimentação para pastas Fast/* com fallback em 3 camadas ✓
- Registro de emails processados no Convex ✓
- Worker no servidor com PM2 + auto-restart no boot ✓
- Schema Convex completo (incluindo vectorIndex para RAG) ✓

---

*Plano criado em 25/05/2026 com base em varredura completa do código e documentos.*
