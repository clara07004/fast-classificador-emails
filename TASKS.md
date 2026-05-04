# Tasks — classificador-emails-fast

> Lista inicial de implementação por fase. Detalhamento técnico em IMPLEMENTATION_PLAN.md (gerado pelo /planejar-automacao).

---

## Pré-MVP — Pendências externas

- [x] Confirmar com TI: CSC Empresarial suporta IMAP IDLE de forma estável? — ✅ Confirmado (protocolo 20246): `mail.cscempresarial.com.br`, porta 993 SSL, IDLE suportado, sem restrição de IP
- [x] Confirmar com TI: host e porta SMTP do CSC Empresarial — ✅ Confirmado: mesmo host, porta 587 ou 465
- [ ] Obter credenciais por funcionário (email + senha) para o piloto
- [ ] Confirmar com Jurídico: envio de conteúdo de email à Claude API é viável sob LGPD?
- [ ] Definir política de retenção de dados no Convex
- [ ] Assinar DPA com Anthropic (se jurídico exigir)

---

## Fase 1 — MVP

### Setup de infraestrutura
- [ ] Criar projeto no Convex com schema inicial
- [ ] Configurar worker no servidor SaveInCloud — ambiente Node.js (PM2 via ecosystem.config.js)
- [ ] Configurar variáveis de ambiente (IMAP credentials, SMTP credentials, Claude API key, Voyage API key, Convex URL)
- [ ] Configurar política de restart automático no PM2 (ecosystem.config.js)
- [ ] Criar conexão IMAP IDLE com ImapFlow para 1 funcionário piloto

### Normalizador
- [ ] Implementar extração de remetente, assunto, corpo limpo, idioma, thread ID, timestamp
- [ ] Implementar detecção e listagem de anexos (nome + tipo MIME)
- [ ] Implementar busca de contexto de thread (últimas 2 mensagens)

### Pré-classificador determinístico
- [ ] Implementar blacklist de domínios (direto para nível 5)
- [ ] Implementar whitelist de remetentes estratégicos com piso de prioridade
- [ ] Implementar guard rails globais Fast (regras da empresa)

### Classificação via Claude API
- [ ] Criar prompt de classificação v1 com definição dos 5 níveis e exemplos
- [ ] Implementar chamada à Claude API com retry e backoff (3 tentativas)
- [ ] Implementar fallback: mover email para pasta `Fast/Pendente-Classificacao`
- [ ] Registrar no Convex: classificação, justificativa, versão do prompt, metadados

### Geração de rascunho
- [ ] Criar prompt de rascunho v1 (tom padrão corporativo Fast)
- [ ] Implementar geração de rascunho no idioma do email recebido
- [ ] Implementar salvamento como rascunho na caixa IMAP do funcionário

### Ações por nível
- [ ] Implementar movimentação de email para pasta correta (1–5) e para Pendente-Classificacao (fallback)

### Feedback loop
- [ ] Implementar listener de eventos MOVE entre pastas `Fast/*` via IMAP
- [ ] Mapear pastas Fast/* para níveis e filtrar eventos irrelevantes
- [ ] Salvar correções no Convex quando MOVE detectado (nivelOriginal, nivelCorrigido, timestamp)

### Monitoramento
- [ ] Implementar heartbeat a cada 5 min registrado no Convex
- [ ] Configurar restart automático no PM2 (autorestart: true + startup no boot)

---

## Fase 2 — Aprendizado individual

### Perfil estruturado
- [ ] Criar schema de perfil no Convex (mapa de remetentes, áreas, padrões de assunto urgentes)
- [ ] Implementar atualização automática do perfil a partir de correções
- [ ] Injetar perfil no prompt de classificação

### RAG de correções
- [ ] Escolher API de embeddings (Voyage AI ou OpenAI text-embedding-3-small)
- [ ] Implementar geração de embedding por correção
- [ ] Implementar busca dos 3–5 exemplos mais similares por email novo
- [ ] Injetar few-shot no prompt de classificação

### Style card
- [ ] Criar schema de style card no Convex
- [ ] Implementar rotina semanal de leitura da pasta Enviados via IMAP
- [ ] Criar prompt de extração de estilo v1
- [ ] Implementar captura de diff rascunho × email enviado
- [ ] Injetar style card no prompt de geração de rascunho

### Reflexão mensal
- [ ] Implementar rotina automática de análise de correções do mês
- [ ] Gerar sugestões de atualização do perfil via Claude
- [ ] Aplicar automaticamente: whitelist, guard rails, padrões urgentes
- [ ] Registrar sugestões de blacklist como pendentes (não aplicar automaticamente)
- [ ] Enviar email de notificação ao funcionário via SMTP listando mudanças e pendências

### Dashboard de métricas
- [ ] Taxa de aceitação da classificação
- [ ] Tempo entre chegada de email Urgente e primeira leitura
- [ ] Distância de edição média rascunho × enviado
- [ ] Correções por funcionário por semana
- [ ] Taxa de fallback (pendente-classificacao)

---

## Fase 3 — Rollout

- [ ] Documentar processo de onboarding de novo funcionário
- [ ] Parametrizar worker para N funcionários independentes
- [ ] Criar interface simples para TI gerenciar instâncias
- [ ] Definir critérios de expansão com base nos resultados das fases 1–2
