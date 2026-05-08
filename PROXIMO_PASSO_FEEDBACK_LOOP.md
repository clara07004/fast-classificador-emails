# 📋 Próximo Passo — Feedback Loop & Fase 2

## Estrutura: Como Vai Funcionar

### 1️⃣ Status Atual (Fase 1 — MVP)

```
Email chega → IMAP IDLE detecta → ClassifierV2 classifica → Move para pasta Fast-*
                                                              ↓
                                                    Usuario lê e move para ✅ ou ❌?
```

**Problema:** Sistema não sabe se acertou. Classificação acontece, email some para pasta, nunca mais vê feedback.

---

### 2️⃣ Com Feedback Loop (Fase 2 Preparação)

```
Email chega → IMAP IDLE detecta → Classifica → Move para pasta Fast-*
                                                              ↓
                                        [Monitor de Movimentação]
                                                              ↓
                      Usuario move Email para outra pasta? (manual)
                                                              ↓
                    ✅ "Movimento = Concordou com classificação"
                    ❌ "Movimento para pasta diferente = Discordou"
                                                              ↓
                            [Registra Correção em Convex]
                                                              ↓
        NextTime ClassifierV2 vê essa "correção" no prompt
```

**Mecanismo:** Quando você move um email que o sistema colocou em `INBOX.Fast-Urgente` para `INBOX.Fast-Normal`, o sistema interpreta como "você discordou — era P3, não P1" e aprende.

---

## Fluxo Detalhado de Feedback

### Cenário 1: Você CONCORDA (Email fica na pasta)

```
Sistema classifica: P1 → Move para Fast-Urgente
Usuario: Lê email, concorda que é urgente, responde → Deixa em Fast-Urgente
Sistema detecta: Email nunca saiu da pasta Fast-Urgente
Interpretação: ✅ Acerto — registra como "P1 confirmado"
```

### Cenário 2: Você DISCORDA (Email vai para outra pasta)

```
Sistema classifica: P2 → Move para Fast-Alta-Prioridade
Usuario: Lê email, acha que não era tão urgente → Move manualmente para Fast-Normal
Sistema detecta: Email moveu de Fast-Alta → Fast-Normal
Interpretação: ❌ Erro — registra como "você disse P3, sistema disse P2"
Aprendizado: Adiciona à lista de "correções" para próximas classificações
```

### Cenário 3: Email Chegou em INBOX (Erro de Fallback)

```
Sistema FALHA em mover (queda de conexão) → Email fica em INBOX
Usuario: Manualmente move para pasta correta (ex: Fast-Urgente)
Sistema detecta: "Novo email em Fast-Urgente, não estava em nenhuma pasta Fast antes"
Interpretação: ⚠️ Erro de movimentação (não erro de classificação)
Ação: Log de erro técnico, tenta reconectar
```

---

## O Que Precisa Ser Implementado

### Componente 1: Monitor de Movimentação (Novo)

**Arquivo:** `src/imap/movimento-monitor.js`

**Responsabilidade:**
1. Conectar ao IMAP periodicamente (a cada 5 min)
2. Listar emails em CADA pasta Fast-*
3. Comparar com estado anterior
4. Detectar emails que saíram/entraram em pastas
5. Registrar movimento em Convex

**Entrada:**
```javascript
{
  uid: 12345,
  timestamp: "2026-05-08T14:30:00Z",
  from_folder: "INBOX.Fast-Urgente",    // null se nova
  to_folder: "INBOX.Fast-Normal",       // null se foi pra lixeira
  movement_type: "user_moved"            // ou "auto_moved_error"
}
```

**Saída:** Registra em Convex tabela `email_movements`

---

### Componente 2: Schema Convex (Novo)

**Tabela:** `email_movements`

```javascript
{
  _id: "...",
  
  // Email original
  uid: 12345,
  subject: "Obra parada — ...",
  from: "cliente@example.com",
  received_at: "2026-05-08T10:00:00Z",
  
  // Classificação automática
  classified_as: "P1",           // P1-P5
  confidence: 0.95,
  system_folder: "INBOX.Fast-Urgente",
  classification_timestamp: "2026-05-08T10:00:05Z",
  
  // Feedback do usuário
  user_moved_to: "INBOX.Fast-Normal",  // onde você moveu
  feedback_timestamp: "2026-05-08T14:30:00Z",
  feedback_delay_minutes: 270,         // quanto tempo levou pra discordar
  
  // Interpretação
  is_correct: false,              // system classification == folder level?
  expected_priority: "P3",        // o que você realmente quis dizer
  correction_reason: "não era urgente, cliente foi educado",  // seu feedback
  
  // Para Fase 2
  is_learning_example: true,      // será usado em future classifications?
}
```

---

### Componente 3: Weekly Report (Novo)

**Arquivo:** `src/reports/weekly-feedback-report.js`

Cada segunda-feira gera relatório:

```
RELATÓRIO SEMANAL DE CLASSIFICAÇÃO — Semana de 04/05 a 10/05

📊 ESTATÍSTICAS GERAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Emails processados: 47
Taxa de acerto: 82% (38 confirmados / 9 discordados)

POR NÍVEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P1: 14 emails → 12 confirmados (86%) ✅
P2: 18 emails → 14 confirmados (78%) ⚠️
P3: 10 emails → 9 confirmados (90%) ✅
P4: 3 emails → 2 confirmados (67%) ⚠️
P5: 2 emails → 1 confirmado (50%) ⚠️

FALSOS POSITIVOS (sistema exagerou prioridade)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Email "Aprovação de orçamento R$180k"
   - Sistema: P1 (confiança 92%)
   - Você: P2 (prazo era 2 dias, não horas)
   - Padrão: Menção a "diretoria" não sobe para P1 automaticamente

2. Email "Cliente reclamando de entrega"
   - Sistema: P2
   - Você: P3 (era garantia, não urgência)
   - Padrão: "Reclamação" genérica sem ameaça contratual = P3

FALSOS NEGATIVOS (sistema minimizou)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(nenhum nesta semana — bom sinal!)

PRÓXIMA SEMANA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sistema vai aprender:
- "diretoria" sozinha não sobe para P1
- Reclamação genérica = P3, não P2
- (2 novos padrões detectados)
```

---

## Implementação Prática: Passo a Passo

### SEMANA 1 (Esta semana — 08/05 a 14/05): Setup

#### ✅ Feito
- [x] Validação de 20 emails — 85% acerto
- [x] Identificação de gaps (P2, P4 têm margem)
- [x] Documentação de próximo passo

#### 🔨 Esta semana
- [ ] **Criar `src/imap/movimento-monitor.js`**
  - Conecta ao IMAP a cada 5 minutos
  - Escaneia 6 pastas (Urgente, Alta, Normal, Baixa, Irrelevante, Pendente)
  - Compara com snapshot anterior
  - Detecta novos emails em cada pasta

- [ ] **Schema Convex: `email_movements`**
  - Cria tabela para registrar movimentos
  - Função para INSERT novo movimento

- [ ] **Integração no worker principal**
  - Na função `startMonitoring()`, inicia movimento-monitor em background
  - Roda paralelo com IDLE loop

**Tempo estimado:** 4-6 horas

---

### SEMANA 2 (15/05 a 21/05): Aprendizado

#### 🔨 Fazer
- [ ] **Implementar Fase 2 — Learning Block**
  - Quando movimento detectado, criar "correção"
  - Adicionar a `recentCorrections` do ClassifierV2
  - Próxima classificação vê: "você disse que Email similar era P3, não P2"

- [ ] **Weekly report automático**
  - Script que roda segunda-feira 9am
  - Envia email com relatório semanal

**Tempo estimado:** 3-4 horas

---

### SEMANA 3 (22/05 a 28/05): Validação & Rollout

#### ✅ Validação
- [ ] Rodar por 1 semana com dados reais
- [ ] Coletar feedback de usuário
- [ ] Validar que movimentos estão sendo detectados

#### 🚀 Rollout Fase 2
- [ ] Ativar aprendizado individual
- [ ] Integrar com segunda instância (novo funcionário)

---

## Métricas de Sucesso

### Taxa de Acerto
```
Semana 1: 82%+ (baseline)
Semana 2: 85%+ (sistema aprende)
Semana 3: 87%+ (padrões consolidados)
Semana 4: 89%+ (diminuem falsos positivos P2, P4)
```

### Tempo para Discordância
```
Tempo médio entre classificação e movimento:
- Se > 10 min: você leu, concordou, depois mudou ideia (bom sinal)
- Se < 1 min: erro óbvio (bom — sistema pode aprender rápido)
```

### Por Nível
```
P1: Manter 95%+ (urgências devem ser óbvias)
P2: Melhorar 75% → 88% (mais refinamento aqui)
P3: Manter 100% (bem calibrado)
P4: Melhorar 50% → 80% (borde com P3, vai melhorar)
P5: Manter 100% (informativo é óbvio)
```

---

## Infraestrutura Necessária

### Banco (Convex)
- ✅ Já existe `email_movements` (será criado)
- ✅ Já tem índices por data/folder

### Worker (SaveInCloud)
- ✅ PM2 já rodando
- ✅ Vai rodar movimento-monitor em paralelo com IDLE

### Notificações
- ✅ SMTP já configurado
- 🔨 Precisa de template HTML para weekly report

---

## Riscos & Mitigation

| Risco | Impacto | Mitigation |
|-------|---------|-----------|
| Movimento-monitor lê estado velho (lag IMAP) | Pode perder movimentos | Versão 1: scan a cada 5 min. Versão 2: event listeners |
| Usuário move email pra lixeira (delete) | Interpretado como "discordou" | Excluir movimentos para lixeira da análise |
| Email movido 2x rapidamente | Apenas último movimento registrado | Registrar sequência de movimentos, usar o final |
| Convex quota | Storage cresce 1-2% ao mês | Monitorar, policy de 12 meses retenção |

---

## O Que Você Faz Durante Tudo Isso

### Seu Role
1. **Semana 1-2:** Trabalhe normalmente, sistema monitora você
2. **Semana 2:** Vai receber primeiro "weekly report" na segunda
3. **Semana 3:** Se tiver feedback, diz (ex: "sistema está exagerando em P2")

### O Sistema Faz
1. Monitora cada movimento
2. Aprende padrões
3. Semanas 4+ melhora automaticamente

---

## Roadmap Futuro (Fora do Escopo Agora)

### Fase 2B — Style Card (Semanas 4-6)
```
Sistema detecta:
- Você prefere P1 com "horas" explícitas, não prazos vagos
- "Cliente gritando" você vê como P2, não P1
- Você sempre confirma P5, nunca move

Treina estilo específico seu.
```

### Fase 3 — Rollout (Semana 7+)
```
Cada novo funcionário:
- Semana 1: Generic model (85% acerto)
- Semanas 2-4: Aprende estilo individual
- Semana 5+: 90%+ acerto personalizado

Depois expande pra rede Fast inteira.
```

---

## Checklist de Próxima Semana

- [ ] Criar `src/imap/movimento-monitor.js` (4h)
  - [ ] Função `scanFolders()` — lista emails cada pasta
  - [ ] Função `detectMovements()` — compara snapshots
  - [ ] Event loop a cada 5 min

- [ ] Criar tabela Convex `email_movements` (1h)
  - [ ] Schema conforme acima
  - [ ] Indexes por `classified_at`, `feedback_at`, `is_correct`

- [ ] Integrar no worker `src/worker-classify.js` (1h)
  - [ ] Chamar `movementoMonitor.start()` em `startMonitoring()`
  - [ ] Passar client IMAP

- [ ] Deploy em SaveInCloud (1h)
  - [ ] git push
  - [ ] pm2 restart classificador-email
  - [ ] Verificar logs: "Monitor inicializado"

**Total semana 1:** 7 horas

---

## Próxima Reunião

Próxima segunda (15/05):
- Revisar primeiro "weekly report"
- Validar detecção de movimentos
- Ajustar thresholds se necessário
- Preparar Fase 2 (learning block)

---

*Documento criado em 2026-05-08 | Próximo milestone: 15/05 (Semana 1 completa)*
