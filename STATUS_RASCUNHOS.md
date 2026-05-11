# 📝 Status de Geração de Rascunhos

**Data:** 11/05/2026 — Semana 4  
**Status:** ❌ NÃO INICIADO (Fora do escopo Semanas 1-3)  

---

## 📋 O Que Planejado (Backlog Original)

### Tasks Identificadas no BACKLOG_PROJETO.md

| Task | Descrição | Tempo | Status |
|------|-----------|-------|--------|
| **T19** | Criar prompt de rascunho v1 | 1h | ❌ Pendente |
| **T20** | Implementar geração de rascunho (sonnet) | 2h | ❌ Pendente |
| **T21** | Implementar IMAP APPEND na pasta Drafts | 2h | ❌ Pendente |
| **T39** | Captura de diff rascunho × enviado | 2h | ❌ Pendente |
| **T40** | Injetar style card no prompt | 1h | ❌ Pendente |

**Total:** 8 horas de trabalho planejadas

---

## 📊 O Que Era para Ser Feito

### Fase 1 — MVP (Escopo Original)

```
Email chega
  ↓
Classifica (P1-P5)
  ↓
Move para pasta Fast-*
  ↓
🟢 Gera rascunho (FALTA FAZER)
    └─→ Apenas P1-P4 (P5 = irrelevante, sem rascunho)
    └─→ Salva em Drafts via IMAP APPEND
    └─→ Funcionário revisa e envia (sem automação)
  ↓
Funcionário move ou envia
```

### Fase 2 — Aprendizado (Escopo Original)

```
Usuário recebe rascunho
  ↓
Edita (ou aceita)
  ↓
Envia email
  ↓
🟢 Sistema detecta envio (FALTA FAZER)
    └─→ Calcula diff: rascunho original vs email enviado
    └─→ Aprende estilo do usuário
    └─→ Próximos rascunhos personalizados
```

---

## 🔧 Arquitetura Esperada (Não Implementada)

### 1. Prompt de Rascunho (`prompts/rascunho.md`)

```markdown
# Gerar Resposta Padrão para Email

Contexto:
- Email recebido: {subject}
- De: {from}
- Nível de prioridade: {nivel}
- Nível de urgência: {horizonte_tempo}

Instruções:
1. Responda em português brasileiro
2. Tom: profissional + acessível (Fast)
3. Máximo 150 palavras
4. Inclua ação esperada
5. Assinature padrão Fast

Gere apenas o corpo do email (sem "De:", "Para:", "Assunto:")
```

### 2. Código de Geração (Não Existe Ainda)

```javascript
// src/drafts/draft-generator.js (FALTA CRIAR)

class DraftGenerator {
  async gerarRascunho(emailData, nivelClassificacao) {
    // 1. Buscar style card do funcionário
    // 2. Montar prompt (rascunho.md + style card)
    // 3. Chamar Claude Sonnet 4.6
    // 4. Parse resposta
    // 5. Retornar rascunho
  }

  async salvarEmDrafts(funcionarioId, emailData, rascunho) {
    // 1. Montar headers de email
    // 2. IMAP APPEND para pasta Drafts
    // 3. Retornar messageId
  }
}
```

### 3. Monitoramento de Envio (Não Existe Ainda)

```javascript
// src/drafts/draft-monitor.js (FALTA CRIAR)

class DraftMonitor {
  async monitorarEnvio(funcionarioId, threadId, rascunhoOriginal) {
    // 1. Monitorar Sent folder por 72h
    // 2. Detectar email com mesmo threadId
    // 3. Comparar: rascunho vs email enviado
    // 4. Calcular diff
    // 5. Salvar em Convex para aprendizado
  }
}
```

---

## 🟡 Por Que Não Foi Implementado (Semanas 1-3)

### Decisão Arquitetônica

**Prioridade:** Feedback Loop (o que o usuário fez) > Rascunho (o que o sistema sugere)

**Justificativa:**
1. Feedback loop é **blocker crítico** — sem ele, sistema não aprende
2. Rascunhos são **sugestões opcionais** — usuário pode ignorar
3. MVP pode rodar sem rascunhos (apenas classificação + pastas)
4. Rascunhos requerem **mais testes** (Claude Sonnet, IMAP, estilo)

### Timeline Real

```
Semana 1: MovimentoMonitor (feedback detectado)
  ↓
Semana 2: LearningBlock (feedback aproveitado)
  ↓
Semana 3: Validação (feedback funciona?)
  ↓
Semana 4: Testes + Rollout novo funcionário
  ↓
Semana 5+: Rascunhos + Style Card (futuro)
```

---

## 📍 Quando Implementar Rascunhos

### Opção A: Depois de Validar Feedback Loop (Recomendado)
```
Agora (Semana 4):
  ✅ Validar que feedback loop funciona 100%
  ✅ Rollout novo funcionário
  ✅ Monitorar primeira semana

Semana 5:
  ✅ Implementar rascunhos (T19-T21)
  ✅ Testar com Clara e João

Semana 6:
  ✅ Implementar aprendizado de style (T39-T40)
  ✅ Personalizar rascunhos por usuário
```

**Pros:**
- Sistema de feedback está 100% validado
- Menos risco (já temos dados reais)
- Rascunhos aprendem com histórico real

**Contras:**
- Usuários ficam 2 semanas sem sugestões

### Opção B: Em Paralelo (Mais Rápido)
```
Semana 4:
  - Testes feedback loop (em progresso)
  - Começar rascunhos em paralelo

Semana 5:
  - Rascunhos prontos junto com rollout novo funcionário
```

**Pros:**
- Usuários recebem sugestões mais cedo
- Valida TODO o MVP junto

**Contras:**
- 2 coisas rodando em paralelo (mais risco)
- Rascunhos sem histórico inicial

---

## 📊 Impacto no MVP

### Sem Rascunhos (Atual)
```
✅ Email classifica em 5 segundos
✅ Move para pasta certa
✅ Usuário abre e responde manualmente

Tempo total: 2-5 minutos por email
```

### Com Rascunhos (Futuro)
```
✅ Email classifica
✅ Move para pasta
✅ Gera rascunho automático (Sonnet)
✅ Usuário lê + clica "Enviar" ou edita

Tempo total: 20 segundos + edição do usuário
```

**Ganho:** 10x mais rápido (sem automação, sem risco)

---

## 🔄 Fluxo Proposto: Implementar Rascunhos Agora

Se você decidir implementar **agora** (Semana 4), aqui está o plano:

### Fase 1: Draft Generator (2h)

```javascript
// src/drafts/draft-generator.js

export class DraftGenerator {
  constructor(claudeClient, styleCardProvider) {
    this.claude = claudeClient;
    this.styleCard = styleCardProvider;
  }

  async gerarRascunho(emailData, nivelClassificacao) {
    if (nivelClassificacao === 'P5') {
      return null; // P5 = irrelevante, sem rascunho
    }

    // Buscar style card do funcionário
    const styleCard = await this.styleCard.obter(emailData.funcionarioId);

    // Montar prompt
    const prompt = this.montarPrompt(emailData, styleCard);

    // Chamar Claude Sonnet
    const resposta = await this.claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    return resposta.content[0].text;
  }

  private montarPrompt(emailData, styleCard) {
    return `# Gerar Resposta Padrão

De: ${emailData.from}
Assunto: ${emailData.subject}
Nível: ${emailData.prioridade}

Estilo do usuário:
${styleCard ? JSON.stringify(styleCard, null, 2) : 'Padrão Fast'}

Gere resposta profissional em português, máximo 150 palavras.`;
  }
}
```

### Fase 2: IMAP APPEND (2h)

```javascript
// src/drafts/draft-saver.js

export class DraftSaver {
  constructor(imapClient) {
    this.imap = imapClient;
  }

  async salvarEmDrafts(emailData, rascunho) {
    const draftEmail = this.montarDraft(emailData, rascunho);

    await this.imap.mailboxOpen('Drafts');

    const uid = await this.imap.append('Drafts', draftEmail.source);

    return uid;
  }

  private montarDraft(emailData, rascunho) {
    return {
      from: process.env.IMAP_USER,
      to: emailData.from,
      subject: `Re: ${emailData.subject}`,
      text: rascunho,
      inReplyTo: emailData.messageId,
      references: emailData.messageId,
      headers: {
        'X-Draft-Generated': 'true',
        'X-Original-Level': emailData.prioridade
      }
    };
  }
}
```

### Fase 3: Integração no Worker (1h)

```javascript
// src/worker-classify.js (modificar classifyAndMove)

async classifyAndMove(uid) {
  // ... classificação existente ...

  // NOVO: Gerar rascunho
  if (['P1', 'P2', 'P3', 'P4'].includes(priority)) {
    try {
      const rascunho = await this.draftGenerator.gerarRascunho(
        emailData,
        priority
      );

      if (rascunho) {
        await this.draftSaver.salvarEmDrafts(emailData, rascunho);
        console.log(`✉️  Rascunho salvo em Drafts`);
      }
    } catch (err) {
      log.error({ uid, erro: err.message }, 'Erro ao gerar rascunho');
      // Continua sem rascunho — não bloqueia
    }
  }
}
```

### Fase 4: Testes (2h)

- [ ] Enviar email de teste
- [ ] Validar que rascunho aparece em Drafts
- [ ] Verificar que está em português
- [ ] Testar diferentes níveis (P1, P2, P3, P4)
- [ ] Testar P5 (não deve gerar rascunho)

**Total: 7 horas**

---

## 🎯 Recomendação

### Opção Recomendada: Implementar Após Validar Feedback Loop

**Por quê:**
1. Feedback loop é crítico — precisa estar 100% funcional primeiro
2. Rascunhos dependem de histórico — melhor com dados reais
3. Menos risco — não sobrecarrega validação
4. Semana 5 ainda é rápido para MVP

**Timeline:**
- **Semana 4 (agora):** Testes feedback loop ✅
- **Semana 5:** Implementar rascunhos ✅
- **Semana 6:** Personalização com style card ✅

---

## 📝 Conclusão

| Aspecto | Status |
|---------|--------|
| **Planejado** | ✅ Sim (T19-T40 no backlog) |
| **Implementado** | ❌ Não |
| **Prioridade** | 🔴 Alta (Fase 1 MVP) |
| **Tempo** | 7-8 horas |
| **Quando Fazer** | Semana 5 (após validar feedback) |
| **Blocker?** | ❌ Não (MVP roda sem) |

---

*Status criado em 11/05/2026 — Rascunhos identificados como próxima prioridade*
