# Status Atual — classificador-emails-fast

**Atualizado em:** 2026-05-19  
**Responsável:** Clara Barbosa  
**Status geral:** MVP completo e validado em produção — servidor pausado por expiração do trial Jelastic

---

## Situação imediata

O servidor Jelastic (SaveInCloud) pausou automaticamente porque o período gratuito encerrou. O worker está parado. Para retomar, é só converter a conta em https://app.paas.saveincloud.net.br/?action=convert e clicar em "Iniciar". Siga o arquivo **PENDENCIAS-POS-JELASTIC.md** na raiz do projeto.

---

## O que está pronto (MVP completo)

| Componente | Status | Observação |
|---|---|---|
| Conexão IMAP IDLE | ✅ | Refatorado em 14/05 — captura em <70s mesmo se IDLE para |
| Normalizador de email | ✅ | |
| Pré-classificador determinístico | ✅ | Blacklist, whitelist, padrões urgência |
| Classificação Claude API | ✅ | Fallback para Nível 3 se API falhar |
| Defesa contra prompt injection | ✅ | Adicionada em 19/05 — conteúdo isolado em `<email_content>` |
| Geração de rascunho | ✅ | Apenas níveis 1–4 |
| IMAP APPEND de rascunho | ✅ | Aparece na pasta Rascunhos do funcionário |
| Movimentação para pastas Fast/* | ✅ | Bug de race condition corrigido em 11/05 |
| Listener de MOVE (feedback loop) | ✅ | |
| Registro em Convex | ✅ | Production: chatty-panda-261 |
| Worker no servidor | ✅ | PM2 com auto-restart, crontab no boot |
| Endpoint `/health` no Convex | ✅ | Criado em 19/05 — aguarda deploy |

---

## Convex Production

| Item | Valor |
|---|---|
| Deployment | `chatty-panda-261` |
| URL | `https://chatty-panda-261.convex.cloud` |
| Funcionário piloto ID | `jn7b1dbqkbnj03kg7wkw9gsgwn86n7k0` |
| Backup | Manual feito em 19/05 (expira em 7 dias) — backup automático requer plano PRO |

---

## O que foi feito na sessão de 19/05

**S5 — Backup Convex:** backup manual executado. Backup automático marcado para avaliar no plano PRO.

**S2 — Monitoramento externo:**
- Criado `convex/health.ts` — endpoint `GET /health` retorna 200 (worker ativo) ou 503 (inativo)
- Criado `convex/http.ts` — registra a rota no Convex
- Criado `scripts/healthcheck-externo.py` — script Python sem dependências para check manual
- **Pendente:** rodar `npx convex deploy` quando servidor voltar + configurar UptimeRobot

**S3 — Prompt injection:** `construirPrompt` em `src/imap/classificador.js` reescrito — email isolado em `<email_content>`, campos sanitizados, instrução explícita de dado não confiável.

**S4 — Convex sem auth:** decidido que a solução correta (internal functions + HTTP gateway com token) deve ser implementada **antes do rollout**, não no MVP. Item adicionado ao backlog como **T55 (pré-rollout obrigatório)**.

---

## Pendências imediatas (quando Jelastic voltar)

Ver **PENDENCIAS-POS-JELASTIC.md** para checklist completo. Em resumo:

1. Iniciar ambiente no painel SaveInCloud
2. Verificar PM2: `pm2 list && pm2 logs classificador-email --lines 30 --nostream`
3. Rodar `npx convex deploy` (publica o endpoint `/health`)
4. Setar `PILOTO_FUNCIONARIO_ID` nas variáveis de ambiente do Convex Production
5. Criar monitor no UptimeRobot apontando para `https://chatty-panda-261.convex.cloud/health`

---

## Pendências de segurança (antes do rollout)

| ID | Item | Urgência |
|---|---|---|
| S4 | Autenticação Convex (internal functions + HTTP gateway) | Obrigatório antes de escalar para 12–15 funcionários |
| S7 | Logs com PII — subject e conteúdo de emails em pm2-out.log indefinidamente | Alta (LGPD) |

---

## O que ainda falta para Fase 2 (aprendizado individual)

| Item | Status |
|---|---|
| RAG de correções (Voyage AI + embeddings) | Não iniciado |
| Style card por funcionário | Não iniciado |
| Rotina de reflexão mensal | Não iniciado |
| Integração Convex em movimento-monitor.js, learning-block.js, weekly-feedback-report.js | 3 TODOs para descomentar (ver PROXIMO_PASSO_AGORA.md) |

---

## O que ainda falta para Fase 3 (rollout 12–15 funcionários)

| Item | Status |
|---|---|
| S4 — Autenticação Convex | Não iniciado |
| Parametrizar worker para múltiplos funcionários | Não iniciado |
| Script de onboarding de novo funcionário | Não iniciado |
| Documentação de operação / runbook | Não iniciado |

---

## Histórico de bugs críticos resolvidos

| Data | Bug | Solução |
|---|---|---|
| 11/05 | Race condition IDLE/MOVE — emails não saíam da INBOX | `getMailboxLock` + await fila. Commit 10eb5ca |
| 14/05 | IDLE silencioso — worker parava de capturar emails sem erro | Refatoração pro padrão ImapFlow oficial. Commit 4a44918 |

---

## Infraestrutura

| Componente | Detalhe |
|---|---|
| Servidor | SaveInCloud Jelastic — `node265627-env-0048116`, usuário `nodejs` |
| Projeto no servidor | `/home/jelastic/fast-classificador-emails/` |
| Processo PM2 | `classificador-email` (singular) |
| Node.js | v25.9.0 via nvm |
| Auto-start | `@reboot` no crontab do usuário nodejs |
| Pasta órfã (pode deletar) | `/home/jelastic/classificador-email/` (singular, sem uso) |

---

## Documentos de referência

| Documento | Para quê |
|---|---|
| `PENDENCIAS-POS-JELASTIC.md` | Checklist ao reativar o servidor |
| `BACKLOG_PROJETO.md` | Todas as tarefas com status e estimativas |
| `PROXIMO_PASSO_AGORA.md` | Detalhe das 3 integrações Convex pendentes (Fase 2) |
| `ROLLOUT_NOVO_FUNCIONARIO.md` | Guia para onboarding de novo funcionário |
| `PRE-MORTEM.md` | Análise de riscos e modos de falha documentados |
| `DEPLOY-SAVEINCLOUD.md` | Guia de deploy no servidor |
