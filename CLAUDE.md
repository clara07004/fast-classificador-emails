# classificador-emails-fast — Contexto Permanente

## O que é esse projeto
Classificador automático de emails para funcionários da Fast Sistemas Construtivos. Detecta emails recebidos via IMAP IDLE, classifica em 5 níveis de prioridade usando Claude API, executa ações automáticas por nível e aprende com o comportamento de cada funcionário ao longo do tempo.

## Objetivo
Eliminar triagem manual de emails. Garantir que urgências de clientes nunca sejam ignoradas. Reduzir tempo gasto em triagem sem mudar a experiência do funcionário na caixa de email.

## Usuário final
Funcionários não técnicos da Fast. A automação é invisível — caixa de email continua igual, com pastas organizadas e rascunhos prontos para revisão.

## Fases
- **Fase 1 — MVP:** piloto com 1–2 funcionários, classificação nos 5 níveis, rascunhos com tom padrão Fast, feedback via monitoramento de MOVE entre pastas Fast/*
- **Fase 2 — Aprendizado individual:** RAG de correções ativo, style card por funcionário, regras determinísticas
- **Fase 3 — Rollout:** expansão para demais funcionários, cada caixa como instância independente

## Stack
| Camada | Ferramenta |
|---|---|
| Leitura de email | ImapFlow (Node.js) via CSC Empresarial |
| Feedback de classificação | IMAP MOVE entre pastas Fast/* (detectado pelo worker) |
| Notificação (reflexão mensal) | SMTP via CSC Empresarial |
| Backend / banco | Convex |
| IA | Claude API (Anthropic) |
| Embeddings / RAG | Voyage AI voyage-3-lite |
| Worker persistente | SaveInCloud VPS (PM2) |
| DNS/CDN | Cloudflare |

## Restrições críticas
- Sem conectores Microsoft (sem Graph API, Azure AD, Outlook, Teams)
- Sem migração de servidor de email — funcionário não percebe mudança
- Nenhum rascunho enviado automaticamente — sempre revisão humana
- Worker IMAP deve reconectar automaticamente (RFC 2177: antes de 29 min)

## Pendências externas (bloqueia MVP)
1. CSC Empresarial — IMAP IDLE estável?
2. CSC Empresarial — credenciais SMTP para notificação de reflexão mensal
3. Jurídico — LGPD: envio de conteúdo de email à Claude API é viável? Necessidade de DPA com Anthropic?
4. Política de retenção de dados no Convex

## Critérios de sucesso
- Taxa de aceitação da classificação (% sem correção)
- Tempo entre chegada de email Urgente e primeira leitura
- Distância de edição média entre rascunho e email enviado
- Correções por funcionário por semana — esperado decaimento ao longo do tempo

## Manutenção
Responsabilidade do desenvolvedor que inicia o projeto. Prompts em arquivos de configuração separados, versionados em Git, editáveis sem redeploy.
