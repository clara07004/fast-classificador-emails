# Backlog do Projeto — classificador-emails-fast

**Versão:** 2.0
**Data:** 2026-04-27
**Total de tarefas:** 46
**Total estimado:** ~78h

---

## Legenda de prioridade

| Prioridade | Significado |
|---|---|
| P1 | Bloqueia o projeto — MVP não sai sem isso |
| P2 | Importante, mas não bloqueia o MVP |
| P3 | Melhorias e otimizações — Fase 6 |

---

## PRÉ-MVP — Pendências externas

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T01 | Confirmar IMAP IDLE no CSC Empresarial | Conectar ao servidor IMAP da CSC Empresarial e validar que IDLE funciona de forma estável. Testar reconexão após 29 min. | P1 | 1h | — |
| T02 | Confirmar credenciais SMTP no CSC Empresarial | Obter host, porta e credenciais SMTP para envio de email de notificação da reflexão mensal. | P1 | 1h | — |
| T03 | Avaliação jurídica LGPD | Apresentar ao jurídico: conteúdo de emails de clientes será enviado à Claude API (Anthropic, EUA). Obter parecer sobre viabilidade e restrições. | P1 | 3h | — |
| T04 | Definir política de retenção de dados no Convex | Definir com TI e jurídico: por quanto tempo emails processados ficam no Convex, quem pode acessar, como excluir. | P1 | 1h | T03 |
| T05 | Assinar DPA com Anthropic (se exigido) | Se jurídico exigir: iniciar processo de Data Processing Agreement com Anthropic antes do go-live. | P1 | 3h | T03 |

**Subtotal Pré-MVP:** 9h

---

## FASE 1 — MVP (Dia 1: Infraestrutura e conexão IMAP)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T06 | Criar projeto no Convex | Criar projeto Convex (ou configurar existente). Implementar schema completo: `funcionarios`, `perfis`, `style_cards`, `emails_processados`, `correcoes`, `remetentes`. | P1 | 2h | T04 |
| T07 | Criar seed data do funcionário piloto | Inserir registro do funcionário piloto: `funcionarios`, `perfis` vazio, `style_cards` com valores padrão corporativo Fast. | P1 | 1h | T06 |
| T08 | Setup do worker no servidor SaveInCloud | Seguir `docs/setup-servidor.md`. Instalar Node.js + PM2 no servidor. Configurar variáveis de ambiente (IMAP, SMTP, Anthropic, Voyage, Convex) no `.env`. Iniciar worker com `pm2 start ecosystem.config.cjs` e configurar startup no boot. | P1 | 1h | — |
| T09 | Implementar conexão IMAP IDLE | Instalar ImapFlow. Implementar conexão com CSC Empresarial via IMAP IDLE. Reconexão automática antes de 29 min (RFC 2177). Listener de novos emails. | P1 | 3h | T02, T08 |
| T10 | Teste de estabilidade IMAP 24h | Rodar conexão IMAP IDLE por 24h sem intervenção manual. Verificar reconexão automática, ausência de drops silenciosos. | P1 | 2h | T09 |

**Subtotal Dia 1:** 9h

---

## FASE 1 — MVP (Dia 2: Normalizador + Pré-classificador)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T11 | Implementar normalizador de email | Strip HTML (htmlparser2), remoção de assinatura (regex), detecção de idioma (franc), detecção de thread (Re:/Fwd:), busca de contexto de thread via IMAP, extração de metadados de anexos. Saída: objeto `EmailNormalizado` tipado. | P1 | 3h | T10 |
| T12 | Testes do normalizador com emails reais | Coletar 50 emails variados da caixa do funcionário piloto. Validar saída do normalizador para cada tipo. Documentar edge cases. | P1 | 2h | T11 |
| T13 | Implementar pré-classificador determinístico | Lookup de blacklist/whitelist no Convex. Aplicação de guard rails globais Fast. Retorno de `{ nivel, regraAplicada }` quando decidido. Pula API quando regra resolve. | P1 | 2h | T06, T11 |
| T14 | Criar prompts de classificação v1 | Criar pasta `prompts/`. Escrever `classificacao.md`: definição dos 5 níveis, critérios, 3 exemplos fixos por nível. Versionar em Git. | P1 | 1h | — |

**Subtotal Dia 2:** 8h

---

## FASE 1 — MVP (Dia 3: Integração Claude API + rascunho)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T15 | Implementar builder de prompt de classificação | Monta o prompt completo: definição dos níveis + perfil do funcionário (do Convex) + histórico do remetente + email normalizado. Fase 1: usa exemplos fixos do prompt, sem RAG. | P1 | 2h | T06, T13, T14 |
| T16 | Implementar chamada à Claude API (haiku) | Chamar `claude-haiku-4-5-20251001`. Parse do JSON retornado `{ nivel, confidence, justificativa }`. Validação do schema de resposta. | P1 | 2h | T15 |
| T17 | Implementar mecanismo de confidence e escalada | Se `confidence < 0.7`: repetir chamada com `claude-sonnet-4-6`. Usar resultado do modelo mais capaz. Registrar qual modelo foi usado. | P1 | 1h | T16 |
| T18 | Implementar retry com backoff exponencial | 3 tentativas com delays 1s / 3s / 9s antes de declarar falha. | P1 | 1h | T16 |
| T19 | Criar prompt de rascunho v1 | Escrever `prompts/rascunho.md`: instrução de geração no idioma do remetente, tom corporativo padrão Fast. | P1 | 1h | — |
| T20 | Implementar geração de rascunho | Chamar `claude-sonnet-4-6` com prompt de rascunho + style card padrão + email. Gerar apenas para níveis 1–4. | P1 | 2h | T17, T19 |
| T21 | Implementar IMAP APPEND de rascunho | Salvar rascunho gerado como draft na pasta Drafts do funcionário via IMAP APPEND. Testar: rascunho aparece na caixa. | P1 | 2h | T20 |
| T22 | Implementar registro completo no Convex | Inserir em `emails_processados`: todos os campos obrigatórios incluindo `promptVersion` (hash do commit). | P1 | 1h | T17, T06 |

**Subtotal Dia 3:** 12h

---

## FASE 1 — MVP (Dia 4: Ações + Feedback + Go-live)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T23 | Implementar executor de ações por nível | Criar pastas Fast/Urgente, Fast/Alta-Prioridade, Fast/Normal, Fast/Baixa, Fast/Irrelevante, Fast/Pendente-Classificacao via IMAP CREATE se não existirem. Mover email para pasta correta via IMAP MOVE. | P1 | 2h | T17 |
| T24 | Implementar monitoramento de MOVE entre pastas Fast/* | Adicionar listener de eventos MOVE ao worker (paralelo ao IDLE de novos emails). Mapear nomes de pastas Fast/* para níveis numéricos. Filtrar eventos irrelevantes (MOVE para fora de Fast/* ou entre pastas do mesmo nível). | P1 | 2h | T23 |
| T25 | Processar MOVE como sinal de correção | Ao detectar MOVE relevante: buscar messageId no Convex, extrair nivelOriginal e nivelCorrigido. Inserir em `correcoes`, atualizar `emails_processados.nivelCorrigido` e `aceitoSemCorrecao`, recalcular `remetentes.nivelMedio`. | P1 | 1h | T24, T06 |
| T26 | Implementar health check do worker | A cada 5 min: registrar heartbeat no Convex. PM2 configurado com autorestart: true detecta ausência e reinicia automaticamente. Monitorar via `pm2 logs` e `pm2 monit`. | P1 | 1h | T08 |
| T27 | Teste end-to-end do pipeline completo | Validar fluxo completo: email recebido → classificado → pasta correta → rascunho (níveis 1–4) → MOVE de pasta detectado como correção → salvo no Convex. | P1 | 3h | T23, T25 |
| T28 | Go-live piloto (1 funcionário) + ajuste de prompt | Ativar para 1 funcionário piloto. Coletar correções. Analisar padrões de erro. Ajustar `prompts/classificacao.md`. Novo commit = nova promptVersion. | P1 | 4h | T27 |

**Subtotal Dia 4:** 13h

**Total Fase 1 MVP:** 42h

---

## FASE 2 — Aprendizado individual (Dia 5 — parte 1: RAG de correções)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T31 | Setup Voyage AI e geração de embeddings | Criar conta Voyage AI, configurar API key. Implementar geração de embedding com `voyage-3-lite`. Input: `assunto + corpo truncado a 512 tokens`. | P2 | 1h | T28 |
| T32 | Pipeline assíncrono de embeddings | Job que roda após cada nova correção: gera embedding e salva em `correcoes.embedding`. | P2 | 2h | T31, T25 |
| T33 | Backfill de embeddings das correções da Fase 1 | Script one-shot: gera embeddings para todas as correções salvas durante o piloto da Fase 1. | P2 | 1h | T32 |
| T34 | Implementar busca por similaridade coseno | Busca top-5 correções mais similares por `funcionarioId`. Implementar coseno manual sobre array no Convex (ou usar Convex Vector Search se disponível). | P2 | 2h | T32 |
| T35 | Injetar few-shot RAG no prompt de classificação | Atualizar builder do prompt (T15) para buscar e injetar os top-3 a top-5 exemplos. Registrar `fewShotIds` no Convex. | P2 | 1h | T34, T15 |

**Subtotal Dia 5 (parte 1):** 7h

---

## FASE 2 — Aprendizado individual (Dia 5 — parte 2: Style card)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T36 | Criar prompt de extração de estilo | Escrever `prompts/style_extraction.md`: instrução para extrair saudação, despedida, formalidade, comprimento médio, vocabulário, padrões de fechamento. | P2 | 1h | — |
| T37 | Implementar extração inicial de style card | Ler últimos 50 emails enviados via IMAP, filtrar automáticos/forwards, chamar `claude-sonnet-4-6` com prompt de extração, salvar style card inicial no Convex. | P2 | 2h | T36, T06 |
| T38 | Implementar rotina semanal de atualização | Cron semanal: leitura de Enviados → extração → diff com style card atual → atualiza apenas se mudança > 20%. Incrementa versão. | P2 | 2h | T37 |
| T39 | Implementar captura de diff rascunho × enviado | Após salvar rascunho: monitorar pasta Enviados por 72h pelo mesmo threadId. Ao detectar email enviado: calcular diff e salvar como sinal de estilo prioritário no Convex. | P2 | 2h | T21, T37 |
| T40 | Injetar style card no prompt de rascunho | Atualizar builder do prompt de rascunho (T20) para incluir style card do funcionário do Convex. | P2 | 1h | T37 |

**Subtotal Dia 5 (parte 2):** 8h

---

## FASE 2 — Aprendizado individual (Dia 6 — parte 1: Dashboard + Reflexão mensal)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T41 | Implementar queries de métricas no Convex | Queries para: taxa de aceitação, tempo N1 → leitura, distância média de edição de rascunho, correções/semana, taxa de fallback. | P2 | 2h | T06, T27 |
| T42 | Criar dashboard de métricas | Painel simples (Convex HTTP action + HTML ou React mínimo) para visualizar as métricas de T41 por funcionário. | P2 | 2h | T41 |
| T43 | Implementar rotina de reflexão mensal | Cron mensal: analisa correções do mês → chama Claude para identificar padrões → aplica automaticamente whitelist/guard rails/padrões urgentes → registra sugestões de blacklist como pendentes → envia email de notificação ao funcionário via SMTP. | P2 | 2h | T25, T35 |

**Subtotal Dia 6 (parte 1):** 6h

**Total Fase 2:** 21h

---

## FASE 3 — Rollout (Dia 6 — parte 2)

| ID | Nome | Descrição | Prioridade | Horas | Dependências |
|---|---|---|---|---|---|
| T44 | Parametrizar worker para múltiplos funcionários | Remover hardcode de credenciais. Worker recebe `funcionarioId` como parâmetro. Suportar N instâncias independentes. | P2 | 2h | T28 |
| T45 | Scripts de onboarding de novo funcionário | Script CLI: cria funcionário + perfil vazio + style card padrão Fast no Convex. Adiciona nova entrada em ecosystem.config.cjs e executa `pm2 reload` no servidor. | P2 | 2h | T44, T06 |
| T46 | Documentação de operação | Guia de onboarding de novo funcionário. Runbook de troubleshooting (worker desconectado, IMAP error, API timeout). Guia de atualização de prompts sem redeploy. | P2 | 2h | T44 |

**Subtotal Fase 3:** 6h

**Total Fase 3:** 6h

---

## FASE 6 — Melhorias futuras (não entram no cronograma)

| ID | Nome | Descrição | Prioridade | Horas |
|---|---|---|---|---|
| T47 | Interface de gestão TI | Painel web para TI: listar workers ativos, adicionar/remover funcionários, editar whitelist/blacklist/guard rails, visualizar últimas classificações. | P3 | 4h |
| T48 | Suporte a múltiplos servidores IMAP | Permitir que funcionários com caixas em servidores diferentes usem o mesmo sistema. | P3 | 2h |
| T49 | Análise de sentimento do remetente | Detectar frustração ou urgência emocional no corpo do email para elevar prioridade. | P3 | 2h |
| T50 | Integração com calendário (urgência por prazo) | Cruzar datas mencionadas no email com o calendário do funcionário para detectar conflitos de agenda. | P3 | 3h |
| T51 | Dashboard avançado com histórico | Gráficos de evolução de métricas ao longo do tempo. Comparação entre funcionários. | P3 | 3h |
| T52 | Pasta de resumo diário | Email de resumo diário enviado ao funcionário com lista de emails classificados no dia (remetente, assunto, nível), configurável por funcionário. | P3 | 2h |
| T53 | Suporte a leitura de PDFs em anexo | Extrair texto de PDFs simples para incluir no contexto de classificação. | P3 | 2h |

**Subtotal Fase 6:** 18h

---

## Resumo por fase

| Fase | Tarefas | Horas |
|---|---|---|
| Pré-MVP | 5 | 9h |
| Fase 1 MVP | 23 | 42h |
| Fase 2 Aprendizado | 13 | 21h |
| Fase 3 Rollout | 3 | 6h |
| **Total executável** | **44** | **78h** |
| Fase 6 (futuro) | 7 | 18h |
