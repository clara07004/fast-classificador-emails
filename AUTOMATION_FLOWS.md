# Automation Flows — classificador-emails-fast

**Versão:** 2.0
**Data:** 2026-04-27

---

## Índice de fluxos

| # | Nome | Gatilho | Frequência |
|---|---|---|---|
| F1 | Pipeline principal de classificação | Novo email recebido | Por email recebido |
| F2 | Loop de feedback via monitoramento de pastas | Funcionário move email entre pastas Fast/* | Por MOVE detectado |
| F3 | Atualização semanal de style card | Cron semanal | 1x por semana por funcionário |
| F4 | Reflexão mensal de perfil | Cron mensal | 1x por mês por funcionário |
| F5 | Fallback de falha da Claude API | Timeout ou erro na API | Por falha |

---

## F1 — Pipeline principal de classificação

**Gatilho:** Novo email detectado via IMAP IDLE
**Ator:** Worker Node.js (instância por funcionário)
**Duração target:** < 30 segundos do recebimento à ação executada

```
INÍCIO
  │
  ▼
[1] IMAP IDLE notifica chegada de email
  │
  ▼
[2] Worker baixa email completo via IMAP FETCH
  │  → Campos: envelope, body, headers, attachments
  │
  ▼
[3] NORMALIZADOR
  │  → Strip HTML → texto limpo
  │  → Remoção de assinatura
  │  → Detecção de idioma (franc)
  │  → Detecção de thread (Re:/Fwd:/Res:/Enc:)
  │  → Se thread: busca últimas 2 mensagens do threadId via IMAP
  │  → Extração de metadados de anexos (nome + tipo MIME)
  │  → Saída: objeto EmailNormalizado
  │
  ▼
[4] PRÉ-CLASSIFICADOR DETERMINÍSTICO
  │  → Consulta Convex: remetente na blacklist?
  │     SIM → nível 5, regra = "blacklist", pula para [8]
  │  → Consulta Convex: remetente na whitelist?
  │     SIM → define piso de prioridade; segue para [5]
  │  → Consulta Convex: guard rail global se aplica?
  │     SIM → define piso/teto de prioridade; segue para [5]
  │  → NÃO DECIDIDO → segue para [5]
  │
  ▼
[5] CONSULTA AO CONVEX
  │  → Carrega perfil do funcionário (remetentes, áreas, padrões urgentes)
  │  → Carrega histórico do remetente (nível médio, silêncio prolongado)
  │  → Carrega top-5 correções similares via RAG (fase 2+)
  │     Fase 1: usa exemplos fixos do prompt
  │
  ▼
[6] CLASSIFICAÇÃO VIA CLAUDE API
  │  → Monta prompt: definição dos níveis + perfil + histórico + few-shot + email
  │  → Chama claude-haiku-4-5-20251001
  │  → Parse do JSON retornado: { nivel, confidence, justificativa }
  │  → confidence < 0.7?
  │     SIM → repete chamada com claude-sonnet-4-6; usa resultado do sonnet
  │     NÃO → usa resultado do haiku
  │  → Aplica whitelist/guard rail definido em [4] se necessário
  │     (sobe nível se classificação ficou abaixo do piso)
  │
  ▼
[7] GERAÇÃO DE RASCUNHO
  │  → Apenas para níveis 1–4
  │  → Monta prompt: instrução + style card do funcionário + email normalizado
  │  → Chama claude-sonnet-4-6
  │  → Salva rascunho via IMAP APPEND na pasta Drafts do funcionário
  │  → Rascunho aparece na caixa do funcionário para revisão
  │
  ▼
[8] EXECUTOR DE AÇÕES POR NÍVEL
  │
  │  Nível 1 (Urgente):
  │    → IMAP MOVE para pasta Fast/Urgente
  │    → Rascunho já salvo em [7]
  │
  │  Nível 2 (Alta Prioridade):
  │    → IMAP MOVE para pasta Fast/Alta-Prioridade
  │    → Rascunho já salvo em [7]
  │
  │  Nível 3 (Normal):
  │    → IMAP MOVE para pasta Fast/Normal
  │    → Rascunho já salvo em [7]
  │
  │  Nível 4 (Baixa):
  │    → IMAP MOVE para pasta Fast/Baixa
  │    → Rascunho já salvo em [7]
  │
  │  Nível 5 (Irrelevante):
  │    → IMAP MOVE para pasta Fast/Irrelevante
  │    → Sem rascunho
  │
  ▼
[9] REGISTRO NO CONVEX
  │  → Insere em emails_processados:
  │     messageId, threadId, remetente, assunto, idioma,
  │     nivelClassificado, justificativa, confidenceScore,
  │     modeloUsado, promptVersion, fewShotIds,
  │     regrasDeterministicas, temRascunho, processadoEm
  │
  ▼
FIM — Email processado
```

**Casos especiais no F1:**

*Thread com contexto elevado:*
Email isolado seria nível 3, mas thread em andamento com cliente indica urgência → context das últimas 2 mensagens injetado no prompt eleva para nível 1 ou 2.

*Anexo de alto impacto:*
Boleto, contrato ou NF combinados com palavras-chave no assunto/corpo → elevação de prioridade (lógica no prompt de classificação).

---

## F2 — Loop de feedback via monitoramento de pastas

**Gatilho:** Funcionário move um email de uma pasta `Fast/*` para outra pasta `Fast/*`
**Ator:** Funcionário + Worker (detecção via IMAP)

O funcionário não precisa fazer nada além de reorganizar a caixa normalmente. O worker detecta o movimento como sinal de correção.

```
INÍCIO
  │
  ▼
[1] Worker detecta evento MOVE via IMAP
  │  → Email saiu de Fast/[PastaOrigem] e entrou em Fast/[PastaDestino]
  │  → Worker mantém listener de eventos de mailbox aberto
  │
  ▼
[2] Worker mapeia pastas para níveis
  │  → Fast/Urgente → 1
  │  → Fast/Alta-Prioridade → 2
  │  → Fast/Normal → 3
  │  → Fast/Baixa → 4
  │  → Fast/Irrelevante → 5
  │  → Pastas iguais (origem = destino de nível)? → ignora, não é correção
  │
  ▼
[3] Worker identifica o email movido
  │  → Busca messageId no Convex em emails_processados
  │     NÃO ENCONTRADO → email não foi processado pelo sistema, ignora
  │     ENCONTRADO → segue para [4]
  │
  ▼
[4] Atualiza emails_processados no Convex
  │  → nivelCorrigido = nível da pasta de destino
  │  → aceitoSemCorrecao = false
  │
  ▼
[5] Insere registro em correcoes no Convex
  │  → funcionarioId, emailId, nivelOriginal, nivelCorrigido, timestamp
  │
  ▼
[6] Job assíncrono: geração de embedding (fase 2+)
  │  → Gera embedding do assunto + corpo do email original
  │  → Salva em correcoes.embedding via Voyage AI voyage-3-lite
  │  → Fase 1: pula este passo (embedding gerado em backfill no início da fase 2)
  │
  ▼
[7] Atualiza remetentes no Convex
  │  → Se nivelCorrigido > nivelOriginal (downgrade): possível candidato para blacklist
  │  → Se nivelCorrigido < nivelOriginal (upgrade): possível candidato para whitelist
  │  → Recalcula nivelMedio do remetente
  │
  ▼
FIM — Correção registrada; impacto nos próximos emails via RAG
```

---

## F3 — Atualização semanal de style card

**Gatilho:** Cron semanal (domingo às 02:00 por funcionário ativo)
**Ator:** Worker + Claude API + Convex

```
INÍCIO
  │
  ▼
[1] Cron dispara para cada funcionário ativo
  │
  ▼
[2] Lê últimos 50 emails da pasta Enviados via IMAP
  │  → Filtra: exclui emails com "Fwd:", "Enc:", assuntos com "Automático"
  │  → Filtra: exclui emails sem corpo relevante (< 20 palavras)
  │
  ▼
[3] Se menos de 5 emails relevantes → encerra sem atualizar
  │
  ▼
[4] Monta prompt de extração de estilo
  │  → Envia amostra dos emails para claude-sonnet-4-6
  │  → Extrai: saudação, despedida, formalidade, comprimento médio,
  │     vocabulário recorrente, padrões de fechamento
  │
  ▼
[5] Compara com style card atual no Convex
  │  → Calcula score de diferença (campos alterados / total de campos)
  │  → Diferença < 20%? → encerra sem atualizar (ruído, não sinal)
  │
  ▼
[6] Salva novo style card no Convex
  │  → Incrementa versao
  │  → Registra updatedAt
  │
  ▼
FIM — Style card atualizado

```

**Sinal forte paralelo (captura de diff):**

Este processo corre de forma assíncrona após qualquer rascunho salvo:

```
[A] Worker salva rascunho em Drafts
  │
  ▼
[B] Worker registra { threadId, rascunho, timestamp } em memória local
  │
  ▼
[C] Worker monitora pasta Enviados por 72h
  │  → Novo email com mesmo threadId detectado?
  │     SIM → captura email enviado
  │     NÃO após 72h → descarta, funcionário não usou o rascunho
  │
  ▼
[D] Calcula diff entre rascunho original e email enviado
  │
  ▼
[E] Salva diff no Convex como sinal para próxima atualização do style card
  │  → Peso maior que a leitura semanal dos Enviados
  │
  ▼
FIM
```

---

## F4 — Reflexão mensal de perfil

**Gatilho:** Cron mensal (1º dia do mês às 08:00 por funcionário ativo)
**Ator:** Worker + Claude API + Funcionário (notificado via SMTP)

```
INÍCIO
  │
  ▼
[1] Cron dispara para cada funcionário ativo
  │
  ▼
[2] Consulta Convex: correções do mês anterior
  │  → Agrupa por: remetente, nível original → nível corrigido
  │  → Calcula: taxa de aceitação do mês, padrões de erro mais frequentes
  │
  ▼
[3] Se menos de 5 correções no mês → encerra (dados insuficientes para reflexão)
  │
  ▼
[4] Chama claude-sonnet-4-6 com análise das correções
  │  → Identifica padrões: remetentes sistematicamente reclassificados,
  │     tipos de email com erro recorrente, possíveis regras a adicionar
  │  → Gera lista de sugestões de mudança no perfil:
  │     ex: "Adicionar domínio X à whitelist com piso nível 2"
  │         "Adicionar padrão de assunto Y à lista de urgentes"
  │
  ▼
[5] Aplica mudanças no perfil no Convex
  │  → Whitelist, guard rails, padrões de assunto urgente: aplica automaticamente
  │  → Sugestões de blacklist: registra como "pendente de confirmação" (não aplica)
  │     — risco de ocultar emails importantes exige confirmação manual
  │  → Incrementa versao do perfil
  │  → Registra updatedAt
  │
  ▼
[6] Envia email de notificação ao funcionário via SMTP (CSC Empresarial)
  │  → Lista de mudanças já aplicadas no perfil
  │  → Lista de sugestões de blacklist aguardando confirmação (se houver)
  │  → Instrução: "Para reverter ou confirmar blacklist, entre em contato com o desenvolvedor"
  │
  ▼
FIM
```

---

## F5 — Fallback de falha da Claude API

**Gatilho:** Erro ou timeout na chamada à Claude API (após 3 tentativas)
**Ator:** Worker + Convex

```
INÍCIO
  │
  ▼
[1] Chamada à Claude API falha
  │
  ▼
[2] Retry com backoff exponencial
  │  → Tentativa 1: aguarda 1s, tenta novamente
  │  → Tentativa 2: aguarda 3s, tenta novamente
  │  → Tentativa 3: aguarda 9s, tenta novamente
  │  → Todas falharam? → segue para [3]
  │
  ▼
[3] Move email para pasta Fast/Pendente-Classificacao via IMAP
  │
  ▼
[4] Registra no Convex
  │  → emails_processados com nivelClassificado = null, status = "fallback"
  │
  ▼
[5] Worker continua processando próximos emails
  │  → Falha em 1 email não paralisa o worker
  │
  ▼
FIM — Sem perda silenciosa de email
```

**Monitoramento de saúde do worker:**

```
HEALTH CHECK (a cada 5 min)
  │
  ▼
[A] Worker registra heartbeat no Convex
  │
  ▼
[B] PM2 detecta crash ou ausência de heartbeat
  │  → Restart automático (PM2 autorestart: true configurado em ecosystem.config.cjs)
  │  → Desenvolvedor monitora via pm2 logs ou pm2 monit no servidor
  │
  ▼
[C] Worker reinicia e reconecta IMAP IDLE
  │  → Emails recebidos durante a janela ficam na caixa normalmente
  │     (IMAP IDLE: worker processa pendências ao reconectar)
```

---

## Resumo de integrações por fluxo

| Fluxo | Claude API | Convex | IMAP | Voyage AI | SMTP |
|---|---|---|---|---|---|
| F1 Pipeline | ✓ haiku + sonnet | ✓ leitura + escrita | ✓ IDLE + FETCH + MOVE + APPEND | ✓ fase 2+ | — |
| F2 Feedback | — | ✓ escrita | ✓ detecção de MOVE entre Fast/* | ✓ embedding fase 2+ | — |
| F3 Style Card | ✓ sonnet | ✓ leitura + escrita | ✓ FETCH Enviados | — | — |
| F4 Reflexão | ✓ sonnet | ✓ leitura + escrita | — | — | ✓ notificação ao funcionário |
| F5 Fallback | — | ✓ escrita | ✓ MOVE | — | — |
