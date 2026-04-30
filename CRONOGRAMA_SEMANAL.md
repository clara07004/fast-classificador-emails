# Cronograma do Projeto — classificador-emails-fast

**Versão:** 3.0
**Data:** 2026-04-27
**Duração:** 6 dias
**Carga total estimada:** 78h

> Tarefas da Fase 6 não entram neste cronograma.

---

## Dia 1 — Setup, pendências externas e infraestrutura IMAP

**Objetivo:** resolver bloqueadores externos, infraestrutura rodando no Railway e conexão IMAP estável com o funcionário piloto.

| Tarefa | ID | Horas |
|---|---|---|
| Confirmar IMAP IDLE no CSC Empresarial | T01 | 1h |
| Confirmar credenciais SMTP no CSC Empresarial | T02 | 1h |
| Avaliação jurídica LGPD | T03 | 3h |
| Definir política de retenção de dados no Convex | T04 | 1h |
| Assinar DPA com Anthropic (se exigido) | T05 | 3h |
| Criar projeto no Convex + schema completo | T06 | 2h |
| Criar seed data do funcionário piloto | T07 | 1h |
| Setup do worker no Railway + variáveis de ambiente | T08 | 1h |
| Implementar conexão IMAP IDLE com ImapFlow | T09 | 3h |
| Teste de estabilidade IMAP 24h | T10 | 2h |

**Total dia 1:** 18h
**Critério de saída:** worker conecta, detecta emails novos, reconecta automaticamente.

---

## Dia 2 — Normalizador, pré-classificador e prompts

**Objetivo:** pipeline capaz de receber um email, normalizar e decidir se precisa de IA.

| Tarefa | ID | Horas |
|---|---|---|
| Implementar normalizador de email | T11 | 3h |
| Testes do normalizador com 50 emails reais | T12 | 2h |
| Implementar pré-classificador determinístico | T13 | 2h |
| Criar prompts de classificação v1 | T14 | 1h |

**Total dia 2:** 8h
**Critério de saída:** normalizador produz objeto correto para 95%+ dos emails; pré-classificador resolve blacklist/whitelist sem chamar API.

---

## Dia 3 — Integração Claude API e geração de rascunho

**Objetivo:** email recebido → classificado → rascunho salvo na caixa do funcionário.

| Tarefa | ID | Horas |
|---|---|---|
| Implementar builder de prompt de classificação | T15 | 2h |
| Implementar chamada à Claude API (haiku) | T16 | 2h |
| Implementar mecanismo de confidence e escalada (sonnet) | T17 | 1h |
| Implementar retry com backoff exponencial | T18 | 1h |
| Criar prompt de rascunho v1 | T19 | 1h |
| Implementar geração de rascunho (sonnet) | T20 | 2h |
| Implementar IMAP APPEND de rascunho na pasta Drafts | T21 | 2h |
| Implementar registro completo no Convex | T22 | 1h |

**Total dia 3:** 12h
**Critério de saída:** email recebido → classificado → rascunho aparece na caixa em < 30 segundos.

---

## Dia 4 — Ações, feedback e go-live piloto

**Objetivo:** pipeline completo com organização de pastas e feedback via IMAP MOVE funcionando. Piloto ativo.

| Tarefa | ID | Horas |
|---|---|---|
| Implementar executor de ações por nível (IMAP MOVE) | T23 | 2h |
| Implementar monitoramento de MOVE entre pastas Fast/* | T24 | 2h |
| Processar MOVE como sinal de correção e salvar no Convex | T25 | 1h |
| Implementar health check do worker (heartbeat + Railway) | T26 | 1h |
| Teste end-to-end do pipeline completo | T27 | 3h |
| Go-live piloto + ajuste de prompt | T28 | 4h |

**Total dia 4:** 13h
**Critério de saída:** taxa de aceitação ≥ 70% após ajuste inicial de prompts.

---

## Dia 5 — RAG de correções e style card

**Objetivo:** sistema aprende com correções do funcionário; rascunhos gerados no tom individual.
**Pré-requisito:** taxa de aceitação ≥ 70% por 2 ciclos consecutivos.

| Tarefa | ID | Horas |
|---|---|---|
| Setup Voyage AI + geração de embeddings | T31 | 1h |
| Pipeline assíncrono de embeddings por correção | T32 | 2h |
| Backfill de embeddings das correções do Dia 4 | T33 | 1h |
| Implementar busca por similaridade coseno | T34 | 2h |
| Injetar few-shot RAG no prompt de classificação | T35 | 1h |
| Criar prompt de extração de estilo | T36 | 1h |
| Implementar extração inicial de style card | T37 | 2h |
| Implementar rotina de atualização de style card | T38 | 2h |
| Implementar captura de diff rascunho × enviado | T39 | 2h |
| Injetar style card no prompt de rascunho | T40 | 1h |

**Total dia 5:** 15h
**Critério de saída:** few-shot RAG ativo; style card criado por funcionário; rascunhos com tom individual.

---

## Dia 6 — Dashboard de métricas, reflexão mensal e rollout

**Objetivo:** visibilidade completa das métricas, aprendizado autônomo e sistema pronto para expansão.
**Pré-requisito:** aprovação deliberada com base nos resultados do Dia 5.

| Tarefa | ID | Horas |
|---|---|---|
| Implementar queries de métricas no Convex | T41 | 2h |
| Criar dashboard de métricas | T42 | 2h |
| Implementar rotina de reflexão mensal (aplicação automática + email SMTP) | T43 | 2h |
| Parametrizar worker para múltiplos funcionários | T44 | 2h |
| Scripts de onboarding de novo funcionário | T45 | 2h |
| Documentação de operação (runbook + guias) | T46 | 2h |

**Total dia 6:** 12h
**Critério de saída:** dashboard acessível; reflexão mensal rodando; novo funcionário onboardado em < 15 min.

---

## Resumo do cronograma

| Dia | Foco | Horas |
|---|---|---|
| 1 | Setup + pendências externas + IMAP | 18h |
| 2 | Normalizador + pré-classificador | 8h |
| 3 | Claude API + rascunho | 12h |
| 4 | Ações + feedback + go-live | 13h |
| 5 | RAG + style card | 15h |
| 6 | Dashboard + reflexão + rollout | 12h |
| **Total** | | **78h** |

---

## Marcos principais

| Marco | Dia | Critério |
|---|---|---|
| Pendências externas resolvidas | 1 | TI + Jurídico confirmados |
| IMAP conectado e estável | 1 | 24h sem drops |
| Pipeline MVP funcional | 3 | Email → classificado → rascunho < 30s |
| Piloto go-live | 4 | Funcionário piloto ativo, feedback via IMAP MOVE funcionando |
| Taxa de aceitação ≥ 70% | 4–5 | 2 ciclos consecutivos |
| RAG ativo | 5 | Few-shot injetado por funcionário |
| Style card ativo | 5 | Rascunhos com tom individual |
| Dashboard + reflexão mensal | 6 | Rodando em produção |
| Rollout pronto | 6 | Onboarding em < 15 min |
