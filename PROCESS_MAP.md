# Mapa de Processos — classificador-emails-fast

## Processo atual (manual)

```
Email recebido
    ↓
Funcionário abre a caixa de entrada
    ↓
Decide manualmente o que ler primeiro
(sem critério, sem padrão)
    ↓
Lê o email
    ↓
Decide se responde agora ou depois
    ↓
Escreve a resposta do zero
    ↓
Envia
```

**Problemas:**
- Sem critério uniforme entre funcionários
- Emails urgentes podem ficar enterrados
- Tempo alto por email (leitura + decisão + redação)
- Sem registro ou auditoria
- Dependente de disponibilidade e atenção individual

---

## Processo automatizado (target)

```
Email recebido no servidor CSC Empresarial
    ↓
Worker Node.js detecta via IMAP IDLE (conexão persistente por funcionário)
    ↓
Normalizador
├── Extrai: remetente, assunto, corpo limpo, idioma, thread ID, timestamp
├── Detecta presença e tipo de anexos
└── Captura contexto da thread (últimas 2 mensagens)
    ↓
Pré-classificador determinístico
├── Blacklist de domínios → nível 5 direto (sem chamar API)
├── Whitelist de remetentes estratégicos → piso de prioridade
└── Guard rails globais Fast → sobrepõem aprendizado individual
    ↓
[Se não decidido pelas regras]
Classificação via Claude API
├── Perfil do funcionário injetado (mapa de remetentes, áreas, padrões)
├── Histórico do remetente no Convex
└── Few-shot RAG: 3–5 correções mais similares do funcionário
    ↓
Claude retorna: nível 1–5 + justificativa + rascunho de resposta
    ↓
Ações paralelas por nível
├── N1: Mover pasta + Salvar rascunho
├── N2: Mover pasta + Salvar rascunho
├── N3: Mover pasta + Salvar rascunho
├── N4: Mover pasta + Salvar rascunho
└── N5: Mover pasta (sem rascunho)
    ↓
Registro completo no Convex
(classificação, justificativa, versão do prompt, exemplos usados, perfil vigente)
    ↓
Funcionário abre a caixa organizada por pastas
├── Revisa rascunho (se houver)
└── Envia com ou sem edição
    ↓
[Se editar] Sistema captura diff rascunho × enviado como sinal de estilo
[Se mover email para pasta de nível diferente] Correção detectada via IMAP e alimenta as 3 camadas de aprendizado
```

---

## Tratamento de casos especiais

**Threads (Re:/Fwd:)**
Email em thread recebe contexto das últimas 2 mensagens antes da classificação. O que é Normal isolado pode ser Urgente dentro de uma conversa em andamento.

**Anexos**
Boleto, contrato ou nota fiscal combinados com palavras-chave podem elevar prioridade. Conteúdo binário não enviado à API na fase 1.

**Falha da Claude API**
Retry com backoff (3 tentativas) → se persistir: email vai para `Fast/Pendente-Classificacao`. Funcionário vê ao abrir a caixa. Sem perda silenciosa.

---

## Ganhos esperados

| Métrica | Antes | Depois |
|---|---|---|
| Tempo de triagem por email | ~2–5 min | ~30 seg (revisão) |
| Padrão de prioridade | Individual, inconsistente | Uniforme + aprendido |
| Emails urgentes perdidos | Risco real | Mitigado por guard rails |
| Redação de respostas | Do zero | Rascunho pronto para revisão |
| Rastreabilidade | Zero | Registro completo no Convex |
