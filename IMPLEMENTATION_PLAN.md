# Implementation Plan — classificador-emails-fast

**Versão:** 1.0
**Data:** 2026-04-24

---

## Pré-requisitos antes de qualquer código

As tarefas abaixo bloqueiam o MVP. Resolver antes de começar o Dia 1.

| # | Tarefa | Responsável | Impacto se não resolvido |
|---|---|---|---|
| P1 | Confirmar com TI: CSC Empresarial suporta IMAP IDLE estável | Clara / TI | Pode exigir polling como fallback |
| P2 | Confirmar com TI: credenciais SMTP do CSC Empresarial | Clara / TI | Bloqueia notificação de reflexão mensal |
| P3 | Confirmar com Jurídico: envio de conteúdo de email à Claude API é viável (LGPD) | Clara / Jurídico | Pode restringir o que é enviado à API |
| P4 | Definir política de retenção de dados no Convex | Clara / TI / Jurídico | Bloqueia schema final |
| P5 | Assinar DPA com Anthropic (se jurídico exigir) | Clara / Jurídico | Bloqueia uso da API em prod |

---

## Fase 1 — MVP (piloto com 1–2 funcionários)

**Objetivo:** validar acurácia da classificação em condições reais e ajustar prompt antes de escalar.
**Critério de saída:** taxa de aceitação da classificação ≥ 70% por 2 ciclos consecutivos.

---

### Dia 1 — Infraestrutura e conexão IMAP

#### Tarefas

**1.1 — Setup Convex**
- Criar projeto Convex (ou usar existente da empresa)
- Implementar schema completo conforme SOLUTION_DESIGN.md
- Criar registro inicial de funcionário piloto
- Criar perfil vazio (sem remetentes, sem guard rails além dos globais Fast)
- Criar style card inicial com valores padrão corporativo Fast

**1.2 — Setup Railway (ou Render)**
- Criar projeto Node.js
- Configurar variáveis de ambiente:
  - `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS` (CSC Empresarial)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (CSC Empresarial — mesmo servidor)
  - `ANTHROPIC_API_KEY`
  - `VOYAGE_API_KEY`
  - `CONVEX_URL`, `CONVEX_DEPLOY_KEY`
- Configurar restart automático em caso de crash

**1.3 — Conexão IMAP IDLE**
- Instalar ImapFlow
- Implementar conexão com CSC Empresarial
- Implementar IMAP IDLE com listener de novos emails
- Implementar reconexão automática antes de 29 min
- Implementar health check a cada 5 min com log no Convex
- Testar estabilidade da conexão por 24h antes de continuar

**Critério de aceite do Dia 1:**
- Worker conecta ao IMAP e detecta novos emails em tempo real
- Reconexão automática funciona sem intervenção manual
- Schema Convex criado, funcionário piloto registrado

---

### Dia 2 — Normalizador + Pré-classificador

#### Tarefas

**2.1 — Normalizador**
- Implementar strip de HTML (htmlparser2)
- Implementar remoção de assinatura (regex por separadores padrão)
- Implementar detecção de idioma (franc)
- Implementar extração de thread ID e detecção de Re:/Fwd:
- Implementar busca das últimas 2 mensagens da thread via IMAP
- Implementar extração de metadados de anexos (nome + tipo MIME)
- Testar com 50 emails reais (variados) e validar saída do objeto `EmailNormalizado`

**2.2 — Pré-classificador determinístico**
- Implementar lookup de blacklist no Convex por domínio
- Implementar lookup de whitelist no Convex por email/domínio
- Implementar aplicação de guard rails globais Fast
- Implementar retorno de `{ nivel, regraAplicada }` quando decidido
- Testar com emails conhecidos (newsletter, email de diretoria, domínio bloqueado)

**2.3 — Estrutura base de prompts**
- Criar pasta `prompts/`
- Criar `prompts/classificacao.md` com definição dos 5 níveis, critérios e 3 exemplos fixos por nível
- Versionar em Git; registrar hash como `promptVersion`

**Critério de aceite do Dia 2:**
- Normalizador produz objeto estruturado correto para 95%+ dos emails de teste
- Pré-classificador resolve blacklist/whitelist/guard rails sem chamar API
- Prompts versionados em Git

---

### Dia 3 — Integração Claude API + geração de rascunho

#### Tarefas

**3.1 — Classificação via Claude API**
- Implementar builder do prompt de classificação:
  - Injeta definição dos níveis
  - Injeta perfil do funcionário (do Convex)
  - Injeta histórico do remetente (do Convex)
  - Injeta email normalizado
  - (fase 1: sem few-shot RAG ainda — exemplos fixos por enquanto)
- Implementar chamada ao `claude-haiku-4-5-20251001` com parsing do JSON retornado
- Implementar mecanismo de confidence: se < 0.7, repetir com `claude-sonnet-4-6`
- Implementar retry com backoff exponencial (1s, 3s, 9s)
- Implementar fallback: mover email para pasta `Fast/Pendente-Classificacao` (funcionário vê ao abrir a caixa)

**3.2 — Geração de rascunho**
- Criar `prompts/rascunho.md` com instrução de geração no idioma do remetente
- Implementar chamada ao `claude-sonnet-4-6` para rascunho
- Implementar salvamento do rascunho como email draft via IMAP (`APPEND` na pasta Drafts)
- Testar: rascunho aparece na caixa do funcionário piloto para os níveis 1–4

**3.3 — Registro no Convex**
- Implementar inserção em `emails_processados` após cada email processado
- Campos obrigatórios: `nivelClassificado`, `justificativa`, `confidenceScore`, `modeloUsado`, `promptVersion`, `temRascunho`, `processadoEm`

**Critério de aceite do Dia 3:**
- Email recebido → classificado → rascunho salvo na caixa em < 30 segundos
- Todo processamento registrado no Convex com promptVersion
- Fallback funciona: email com API indisponível vai para `pendente-classificacao`

---

### Dia 4 — Ações, feedback e go-live piloto

#### Tarefas

**4.1 — Executor de ações por nível**
- Implementar movimentação de email para pastas:
  - `Fast/Urgente`, `Fast/Alta-Prioridade`, `Fast/Normal`, `Fast/Baixa`, `Fast/Irrelevante`, `Fast/Pendente-Classificacao`
  - Criar pastas se não existirem (IMAP `CREATE`)
- Implementar lógica: rascunho só para níveis 1–4

**4.2 — Monitoramento de MOVE entre pastas Fast/***
- Implementar listener de eventos MOVE no IMAP (adicional ao listener de emails novos)
- Mapear nomes de pastas `Fast/*` para níveis numéricos (1–5)
- Filtrar eventos irrelevantes: MOVE para fora de `Fast/*` ou entre pastas do mesmo nível
- Implementar lookup no Convex: busca `messageId` em `emails_processados`
- Salvar correção no Convex: `nivelOriginal`, `nivelCorrigido`, `emailId`, `timestamp`
- Atualizar `emails_processados.nivelCorrigido` e `aceitoSemCorrecao`
- Recalcular `remetentes.nivelMedio`

**4.3 — Health check do worker**
- Implementar heartbeat a cada 5 min registrado no Convex
- Configurar política "Always Restart" no Railway
- Configurar notificação de crash/restart no Railway (email ao desenvolvedor)

**4.4 — Testes e ajuste de prompt**
- Rodar piloto com funcionário 1
- Coletar correções e analisar padrões de erro
- Ajustar prompt de classificação conforme erros mais frequentes
- Documentar ajustes com novo hash de commit

**Critério de aceite do Dia 4 / MVP completo:**
- Pipeline completo funcionando: email recebido → classificado → pasta correta → rascunho (1–4)
- Feedback via MOVE de pasta funcionando e correções salvas no Convex
- Taxa de aceitação ≥ 70% após ajuste inicial de prompts

---

## Fase 2 — Aprendizado individual

**Objetivo:** ativar o aprendizado adaptativo por funcionário (RAG + style card).
**Pré-requisito:** taxa de aceitação ≥ 70% mantida por 2 ciclos consecutivos na fase 1.
**Critério de saída:** correções por funcionário em queda consistente por 4 ciclos.

---

### Dia 5 — RAG de correções e Style Card

**5.1 — Setup Voyage AI**
- Criar conta Voyage AI, obter API key
- Implementar geração de embedding com `voyage-3-lite`
- Input: `assunto + corpo (truncado a 512 tokens)`

**5.2 — Pipeline de embeddings**
- Implementar job assíncrono: quando correção é salva → gerar embedding → salvar em `correcoes.embedding`
- Backfill: gerar embeddings para todas as correções já existentes da fase 1

**5.3 — Busca por similaridade**
- Implementar busca coseno sobre `correcoes` filtradas por `funcionarioId`
- Retornar top-3 a top-5 exemplos mais similares
- Verificar se Convex Vector Search está disponível; se não, implementar coseno manual

**5.4 — Injeção no prompt**
- Atualizar builder do prompt de classificação para incluir few-shot RAG
- Registrar IDs dos exemplos usados em `emails_processados.fewShotIds`

**Critério de aceite do Dia 5 (RAG):**
- Exemplos few-shot injetados no prompt para emails com correções similares disponíveis
- Teste: email similar a uma correção anterior é classificado com o nível corrigido

---

#### Style card (continuação do Dia 5)

**6.1 — Extração inicial de estilo**
- Criar `prompts/style_extraction.md`
- Implementar leitura de últimos 50 emails enviados via IMAP (pasta Enviados)
- Filtrar automáticos e forwards
- Chamar `claude-sonnet-4-6` com prompt de extração
- Salvar style card inicial no Convex

**6.2 — Rotina semanal de atualização**
- Implementar cron semanal (cron job no worker ou Convex scheduled function)
- Implementar lógica de diff: só atualiza se mudança > 20%
- Versionar style card (incrementar `versao`)

**6.3 — Captura de diff rascunho × enviado**
- Implementar monitor: após salvar rascunho, fica watchando a pasta Enviados pelo `threadId`
- Quando email enviado é detectado: calcular diff rascunho × enviado
- Salvar diff como sinal para próxima atualização do style card

**Critério de aceite do Dia 5 (Style card):**
- Style card criado e armazenado por funcionário
- Rascunhos gerados refletem tom do funcionário após 2+ semanas de uso

---

### Dia 6 — Dashboard de métricas, reflexão mensal e Rollout

**7.1 — Dashboard no Convex**
Queries para retornar as métricas definidas nos critérios de sucesso:
- Taxa de aceitação (% emails sem `nivelCorrigido`)
- Tempo entre `processadoEm` e primeira leitura (via flag IMAP `\Seen`)
- Distância média rascunho × enviado
- Correções por funcionário por semana
- Taxa de fallback (emails em `pendente-classificacao`)

Expor via endpoint simples (Convex HTTP action ou painel básico em HTML/React).

**7.2 — Rotina de reflexão mensal**
- Cron mensal: analisa correções do mês por funcionário
- Chamar `claude-sonnet-4-6` para identificar padrões e sugerir atualizações ao perfil
- Aplicar automaticamente: whitelist, guard rails, padrões de assunto urgente
- Sugestões de blacklist: registrar como "pendente de confirmação" no Convex (não aplicar)
- Enviar email ao funcionário via SMTP (CSC Empresarial) listando o que foi alterado e o que está pendente de confirmação

---

## Fase 3 — Rollout

**Objetivo:** expandir para todos os funcionários.
**Pré-requisito:** resultados da fase 2 aprovados. Decisão de expansão deliberada.

#### Multi-tenant e onboarding (continuação do Dia 6)

**8.1 — Parametrização do worker**
- Remover hardcode de credenciais por funcionário
- Worker recebe `funcionarioId` como parâmetro de inicialização
- Scripts de onboarding: criar funcionário + perfil vazio + style card padrão no Convex

**8.2 — Interface de gestão (TI)**
- Painel mínimo para TI:
  - Listar funcionários ativos e status do worker
  - Adicionar / remover funcionários
  - Editar whitelist/blacklist/guard rails por funcionário
  - Visualizar últimas classificações e correções

**8.3 — Documentação de operação**
- Guia de onboarding de novo funcionário
- Runbook de troubleshooting (worker desconectado, IMAP error, API timeout)
- Guia de atualização de prompts sem redeploy

---

## Estimativa de esforço consolidada

| Fase | Dias | Dependências |
|---|---|---|
| Pré-MVP | Dia 1 (paralelo) | TI + Jurídico |
| Fase 1 MVP | Dias 1–4 | P1–P5 resolvidos |
| Fase 2 Aprendizado | Dia 5 | Taxa aceitação ≥ 70% |
| Fase 3 Rollout | Dia 6 | Resultados fase 2 aprovados |
| **Total** | **6 dias** | |

---

## Critérios de sucesso por fase

| Fase | Critério | Meta |
|---|---|---|
| MVP | Taxa de aceitação da classificação | ≥ 70% |
| Aprendizado | Queda de correções por funcionário | Tendência de queda por 4 ciclos |
| Rollout | Funcionários no piloto | 100% da equipe elegível |
