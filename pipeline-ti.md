# Classificador de Emails Fast — Visão Técnica para T.I.

**Data:** Abril 2026
**Status:** Aprovado para implementação — Fase 1 (MVP)

---

## O que é esse sistema

Automação que lê, classifica e organiza os emails recebidos dos funcionários da Fast.
O funcionário não percebe que existe — a caixa de email continua igual, com uma diferença:
os emails já chegam organizados em pastas por prioridade, e rascunhos de resposta
já estão prontos para revisar.

Não há envio automático de emails em nenhuma fase do projeto.

---

## Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  SERVIDOR DE EMAIL DA EMPRESA (CSC Empresarial)                  │
│                                                                   │
│  Caixa do funcionário                                             │
│  ├── Fast/Urgente           ← emails classificados               │
│  ├── Fast/Alta-Prioridade   ← pelo sistema                       │
│  ├── Fast/Normal                                                  │
│  ├── Fast/Baixa                                                   │
│  ├── Fast/Irrelevante                                             │
│  ├── Fast/Pendente-Classificacao  ← fallback se API falhar        │
│  ├── Drafts                ← rascunhos gerados pelo sistema      │
│  └── Enviados              ← monitorado para aprender o estilo   │
└───────────────────┬──────────────────────────────────────────────┘
                    │ IMAP (porta 993, TLS)
                    │ protocolo IMAP IDLE — conexão persistente
                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  WORKER NODE.JS  (hospedado no Railway)                           │
│                                                                   │
│  Processo que fica rodando 24/7 por funcionário                   │
│  Fase 1: 1–2 instâncias manuais (uma por funcionário piloto)      │
│  Fase 3: orquestrador central gerencia automaticamente            │
│                                                                   │
│  Quando chega email novo:                                         │
│  1. Baixa o email completo (IMAP FETCH)                           │
│  2. Limpa o texto (remove HTML, assinatura, detecta idioma)       │
│  3. Checa regras fixas (blacklist, whitelist, guard rails)        │
│  4. Se necessário: chama IA para classificar                      │
│  5. Gera rascunho de resposta via IA                              │
│  6. Move email para a pasta correta (IMAP MOVE)                   │
│  7. Salva rascunho na caixa do funcionário (IMAP APPEND)          │
│  8. Registra tudo no banco de dados                               │
└───────────────────┬─────────────────────┬─────────────────────────┘
                    │                     │
          ┌─────────▼──────┐    ┌─────────▼─────────────────────────┐
          │  CLAUDE API    │    │  CONVEX  (banco de dados + backend)│
          │  (Anthropic)   │    │                                    │
          │                │    │  Armazena:                         │
          │  2 modelos:    │    │  - Perfis dos funcionários          │
          │  • haiku-4-5   │    │  - Histórico de emails             │
          │    (classifica │    │  - Correções feitas                │
          │     email)     │    │  - Estilo de escrita (style card)  │
          │  • sonnet-4-6  │    │  - Listas de remetentes            │
          │    (rascunho + │    │                                    │
          │     dúvidas)   │    │  Base para aprendizado contínuo    │
          └────────────────┘    └────────────────────────────────────┘
```

---

## Os 5 níveis de prioridade

| Nível | Nome | Pasta | Rascunho? |
|---|---|---|---|
| 1 | Urgente | Fast/Urgente | Sim |
| 2 | Alta Prioridade | Fast/Alta-Prioridade | Sim |
| 3 | Normal | Fast/Normal | Sim |
| 4 | Baixa | Fast/Baixa | Sim |
| 5 | Irrelevante | Fast/Irrelevante | Não |

---

## Como o sistema aprende com o funcionário

O funcionário não precisa preencher formulário nem usar nenhum app.
O sinal de feedback é a própria organização da caixa de email:

```
Funcionário vê email mal classificado
          │
          ▼
Arrasta o email de Fast/Normal → Fast/Urgente
          │
          ▼
Worker detecta o movimento (IMAP MOVE entre pastas Fast/*)
          │
          ▼
Registra correção no banco → alimenta aprendizado futuro
```

Com o tempo, o sistema erra menos para aquele funcionário.

---

## Fluxo completo — de email recebido a ação executada

```
Email novo chega na caixa
         │
         ▼
[1] IMAP IDLE notifica o worker
         │
         ▼
[2] Worker baixa o email completo
         │
         ▼
[3] Normalização
     • Remove HTML e assinatura
     • Detecta idioma
     • Identifica se é thread (Re:/Fwd:)
     • Extrai metadados de anexos
         │
         ▼
[4] Pré-classificador (regras fixas — sem custo de IA)
     • Remetente está na blacklist? → nível 5 imediato
     • Remetente está na whitelist? → garante prioridade mínima
     • Guard rails globais da Fast aplicam? → ex: diretoria ≥ nível 2
         │
         ▼ (se não decidido pelas regras)
[5] Classificação via IA (Claude haiku)
     • Prompt inclui: perfil do funcionário + histórico do remetente + email
     • Retorna: nível, score de confiança, justificativa
     • Confiança < 70%? → repete com modelo mais capaz (Claude sonnet)
         │
         ▼
[6] Geração de rascunho (Claude sonnet)
     • Usa o estilo de escrita do funcionário (saudação, formalidade, vocabulário)
     • Salvo em Drafts — nunca enviado automaticamente
         │
         ▼
[7] Ações
     • IMAP MOVE → pasta de prioridade correta
     • IMAP APPEND → rascunho salvo em Drafts
         │
         ▼
[8] Registro no banco (Convex)
     • Nível, modelo usado, confiança, justificativa, prompt version
     • Auditável: qualquer classificação histórica pode ser reproduzida

Duração total: < 30 segundos do recebimento à ação
```

---

## Automações periódicas

### Atualização de estilo de escrita (toda semana, domingo 02:00)
- Worker lê os últimos 50 emails enviados pelo funcionário
- IA extrai padrões: saudação, formalidade, vocabulário
- Atualiza o "style card" no banco se houve mudança relevante (> 20% de diferença)
- Também monitora quando o funcionário edita e envia um rascunho — sinal prioritário

### Reflexão mensal de perfil (1º dia do mês, 08:00)
- Analisa as correções do mês
- Atualiza automaticamente: whitelist, guard rails, padrões urgentes
- Sugestões de blacklist são registradas, mas **não aplicadas** sem confirmação manual
- Funcionário recebe email informando o que foi ajustado no perfil

---

## Tolerância a falhas

| Cenário | O que acontece |
|---|---|
| Claude API fora do ar | Retry 3x (1s → 3s → 9s). Se falhar: email vai para pasta `Fast/Pendente-Classificacao`. Sem perda silenciosa. |
| Worker desconecta do IMAP | Reconexão automática antes de 29 min (RFC 2177). Railway reinicia o processo se travar. |
| Voyage AI indisponível (fase 2+) | Correção salva sem embedding. RAG usa exemplos mais antigos. Degradação suave, sem parar. |
| Worker cai | Railway política "Always Restart". Emails que chegaram durante a queda ficam na caixa e são processados ao reconectar. |

---

## Infraestrutura necessária

### O que a Fast precisa fornecer

| Recurso | Detalhe |
|---|---|
| Acesso IMAP ao CSC Empresarial | Porta 993, TLS, IMAP IDLE habilitado. Confirmar com CSC se IDLE é estável. |
| Credenciais IMAP por funcionário | Email + senha de app (não a senha pessoal) para cada funcionário piloto |
| Acesso SMTP ao CSC Empresarial | Para envio das notificações mensais. Mesmas credenciais ou conta dedicada. |
| Confirmação jurídica (LGPD) | Conteúdo de emails será enviado à API da Anthropic (EUA) para classificação. Avaliar necessidade de DPA com Anthropic. |
| Política de retenção de dados | Por quanto tempo os logs de emails classificados devem ser mantidos no Convex? |

### Serviços externos (contratados pelo projeto)

| Serviço | Uso | Onde fica |
|---|---|---|
| Railway | Hospeda o worker Node.js | Nuvem (EUA) |
| Convex | Banco de dados + backend | Nuvem (EUA) |
| Claude API (Anthropic) | Classificação + geração de rascunho | Nuvem (EUA) |
| Voyage AI | Embeddings para aprendizado (fase 2+) | Nuvem (EUA) |

---

## Fases do projeto

### Fase 1 — MVP (piloto com 1–2 funcionários)
- Worker sobe manualmente, uma instância por funcionário
- Classificação nos 5 níveis ativa
- Rascunhos com estilo padrão (style card coletado na primeira semana)
- Feedback via MOVE de pastas já ativo
- Sem RAG ainda (exemplos fixos no prompt)
- Monitoramento manual pelo desenvolvedor

### Fase 2 — Aprendizado individual
- RAG de correções ativo: cada funcionário tem exemplos personalizados
- Style card por funcionário com atualização automática
- Reflexão mensal de perfil ativa

### Fase 3 — Rollout
- Orquestrador central gerencia workers automaticamente
- Expansão para demais funcionários
- Cada caixa como instância totalmente independente

---

## O que o funcionário percebe

**Nada muda no acesso ao email.** O funcionário continua usando o webmail ou cliente de email normalmente.

O que ele vai notar:
- Emails já chegam organizados nas pastas `Fast/*`
- Rascunhos de resposta aparecem em Rascunhos automaticamente
- Para corrigir a classificação: arrastar o email para a pasta certa é o suficiente

Não há novo app, nova senha, novo login ou novo processo.

---

## Pendências que precisam de resposta do T.I.

1. **CSC Empresarial suporta IMAP IDLE de forma estável?** (verificar com o provedor)
2. **Como gerar credenciais de app por funcionário** (separado da senha pessoal, se suportado pelo CSC)
3. **Existe restrição de rede para conexões IMAP saindo do Railway** (IP fixo necessário)?
4. **Jurídico: envio de conteúdo de email para API externa (EUA) é permitido pela política de dados da Fast?**
5. **Qual a política de retenção de dados aprovada para logs de classificação?**
