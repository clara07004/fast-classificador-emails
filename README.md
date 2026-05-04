# classificador-emails-fast

Classificador automático de emails para funcionários da Fast Sistemas Construtivos.

Detecta emails via IMAP IDLE, classifica em 5 níveis de prioridade usando Claude API, executa ações automáticas e aprende com o comportamento individual de cada funcionário.

---

## Stack
Node.js · ImapFlow · Convex · Claude API · Voyage AI · SaveInCloud VPS (PM2)

## Fases
- **Fase 1 — MVP:** piloto com 1–2 funcionários
- **Fase 2 — Aprendizado individual:** RAG + style card por funcionário
- **Fase 3 — Rollout:** expansão para todos os funcionários

## Arquivos deste workspace

| Arquivo | Conteúdo |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexto permanente do projeto para o Claude Code |
| [PROJECT_BRIEF.md](PROJECT_BRIEF.md) | Resumo estruturado da descoberta |
| [PROCESS_MAP.md](PROCESS_MAP.md) | Processo atual × processo automatizado |
| [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md) | Arquitetura técnica e decisões de design |
| [TASKS.md](TASKS.md) | Lista de implementação por fase |
| [ecosystem.config.cjs](ecosystem.config.cjs) | Configuração do PM2 (process manager do worker) |
| [docs/setup-servidor.md](docs/setup-servidor.md) | Instruções de setup do servidor SaveInCloud |
| [scripts/deploy.sh](scripts/deploy.sh) | Script de deploy no servidor |

## Próximo passo

Resolver as pendências externas (TI + Jurídico) e então rodar `/planejar-automacao` para gerar o IMPLEMENTATION_PLAN.md com detalhamento técnico completo.

## Dashboard

📊 [**Visualizar Dashboard**](./dashboard.html)

Interface de acompanhamento em tempo real do classificador de emails com métricas de desempenho, logs de classificação e estatísticas por prioridade.

> **Para abrir a prévia:** Clique no link acima enquanto visualiza este repositório no GitHub, ou baixe o arquivo `dashboard.html` e abra no seu navegador.
