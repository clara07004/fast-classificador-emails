# 🏗️ Arquitetura — Feedback Loop

## Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         FASE 1 — MVP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Novo Email chega                                                │
│       ↓                                                           │
│  [IMAP IDLE] detecta → [ClassifierV2] classifica → [Move]       │
│       (RFC 2177)         (Claude API)          (messageMove)     │
│       ↓                         ↓                    ↓            │
│    Servidor            P1-P5 + raciocínio     Fast-Urgente      │
│    CSC Empresarial                            Fast-Alta...       │
│                                                    ↓              │
│                                             Email em pasta        │
│                                           (Usuario lê offline)    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
   PROBLEMA: Sistema não sabe se acertou
             Feedback é invisível


┌─────────────────────────────────────────────────────────────────┐
│                    FASE 2 — FEEDBACK LOOP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Novo Email chega                                                │
│       ↓                                                           │
│  [IMAP IDLE] detecta                                             │
│       ↓                                                           │
│  [ClassifierV2] classifica (inclui aprendizado anterior)         │
│       ↓                                                           │
│  [Move] para pasta Fast-* (ou Pendente)                          │
│       ↓                                                           │
│  [MOVIMENTO-MONITOR] em background                              │
│  - Scan a cada 5 min                                             │
│  - Compara snapshots de pastas                                   │
│  - Detecta: Email saiu da pasta?                                │
│       │                                                           │
│       ├→ ✅ Não saiu = Você concordou                            │
│       │   (Registra em Convex: is_correct=true)                 │
│       │                                                           │
│       └→ ❌ Saiu para outra pasta = Você discordou              │
│           (Registra: is_correct=false, expected_priority=X)     │
│           ↓                                                       │
│       [Weekly Report] — Segunda de manhã                        │
│       "82% acerto, detectei 3 padrões novos"                    │
│           ↓                                                       │
│       [Próxima classificação] usa esses padrões                 │
│                                                                   │
│  RESULTADO: Aprendizado contínuo, taxa cresce 82%→89%           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fluxo Detalhado: Detecção de Movimento

```
SNAPSHOT A (14:00)                SNAPSHOT B (14:05)
┌──────────────────┐              ┌──────────────────┐
│ Fast-Urgente     │              │ Fast-Urgente     │
│ [UID 100]        │              │ [UID 101]        │
│ [UID 200]        │              │                  │
└──────────────────┘              └──────────────────┘

│ Fast-Normal      │              │ Fast-Normal      │
│ (vazio)          │              │ [UID 200]        │  ← NOVO!
└──────────────────┘              └──────────────────┘

                    COMPARAÇÃO
                         ↓
         UID 200 saiu de Fast-Urgente
                  para Fast-Normal
                         ↓
                  [Detectar]
                         ↓
     Email que sistema colocou como P1
     usuario moveu para P3
                         ↓
              [Registrar em Convex]
         { 
           "uid": 200,
           "from_folder": "INBOX.Fast-Urgente",
           "to_folder": "INBOX.Fast-Normal",
           "classified_as": "P1",
           "expected_priority": "P3",
           "is_correct": false
         }
```

---

## Dataflow: Movimento → Aprendizado

```
DESCOBERTA                ARMAZENAMENTO          APLICAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Email movido]
UID 200
P1→P3
    ↓
[movimento-monitor]    [Convex DB]            [ClassifierV2]
    │                  email_movements        próx. call
    ├→ detectMovement()     ↓                      ↓
    ├→ interpretação   INSERT {                Lê recentCorrections:
    ├→ is_correct?        uid: 200,            [
    │  (P1 vs P3)         is_correct: false,     {
    │                     from: P1,               emailResumo: "...",
    │                     to: P3,                prioridade_modelo: P1,
    │                     ...                    prioridade_usuario: P3,
    └→ SEND to Convex   }                        motivo: "não era P1"
                            ↓                   }
                        Índice por data      ]
                        Searchable              ↓
                        Ready para learning   "Ah, no next classifier 
                                             call, vou ser mais
                                             cuidadoso com P1"
```

---

## Tabela: email_movements

```sql
CREATE TABLE email_movements (
  _id: Id,
  
  -- Email metadata
  uid: number,
  subject: string,
  from: string,
  received_at: Timestamp,
  
  -- Classificação automática (T=0)
  classified_as: "P1" | "P2" | "P3" | "P4" | "P5",
  confidence: float,              -- 0.0-1.0
  system_folder: string,          -- "INBOX.Fast-Urgente", etc.
  classification_timestamp: Timestamp,
  classification_raciocinio: string,
  
  -- Feedback do usuário (T=T_movimento)
  user_moved_to: string | null,   -- Pasta que você moveu, ou null se deletou
  feedback_timestamp: Timestamp,
  feedback_delay_minutes: number,
  
  -- Análise
  is_correct: boolean,            -- classified_as folder level == user folder level?
  expected_priority: "P1" | "P2" | "P3" | "P4" | "P5",
  correction_reason: string,      -- Sua observação (Fase 2B)
  
  -- Aprendizado
  is_learning_example: boolean,   -- Será incluído em future prompts?
);

-- Índices
CREATE INDEX ON email_movements(feedback_timestamp);
CREATE INDEX ON email_movements(is_correct);
CREATE INDEX ON email_movements(user_id);  -- prep para multi-user Fase 3
```

---

## Componente: movimento-monitor.js

```javascript
// src/imap/movimento-monitor.js

export class MovementoMonitor {
  constructor(imapClient, convexClient) {
    this.imap = imapClient;
    this.convex = convexClient;
    this.snapshots = {};  // { "INBOX.Fast-Urgente": [uid1, uid2, ...] }
  }

  async start(interval = 5 * 60 * 1000) {  // 5 min default
    console.log('📊 MovementoMonitor iniciado');
    
    // Scan inicial
    await this.scan();
    
    // Loop contínuo
    setInterval(() => this.scan(), interval);
  }

  async scan() {
    const folders = [
      'INBOX.Fast-Urgente',
      'INBOX.Fast-Alta-Prioridade',
      'INBOX.Fast-Normal',
      'INBOX.Fast-Baixa',
      'INBOX.Fast-Irrelevante',
      'INBOX.Fast-Pendente-Classificacao'
    ];

    for (const folder of folders) {
      try {
        const mailbox = await this.imap.mailboxOpen(folder);
        const messages = await this.imap.search({
          all: true
        });

        const newSnapshot = messages.map(m => m.uid);
        const oldSnapshot = this.snapshots[folder] || [];

        // Compara
        const moved = this.detectMovements(
          oldSnapshot,
          newSnapshot,
          folder
        );

        // Registra movimentos
        for (const move of moved) {
          await this.recordMovement(move);
        }

        // Atualiza snapshot
        this.snapshots[folder] = newSnapshot;

      } catch (error) {
        console.error(`Erro ao scanear ${folder}:`, error.message);
      }
    }
  }

  detectMovements(oldUids, newUids, folder) {
    const movements = [];

    // Qual UID saiu dessa pasta? (estava em old, não está em new)
    for (const uid of oldUids) {
      if (!newUids.includes(uid)) {
        // Esse email saiu — foi pra outra pasta
        movements.push({
          uid,
          from_folder: folder,
          to_folder: null,  // Será descoberto no próximo scan
          movement_type: 'user_moved'
        });
      }
    }

    return movements;
  }

  async recordMovement(move) {
    // Busca classificação original em Convex
    const originalClassification = await this.convex.query(
      'SELECT * FROM email_classifications WHERE uid = ?',
      [move.uid]
    );

    // Determina pasta destino (será descoberta no próx scan)
    // Por enquanto, marca como "Unknown"

    // Registra em Convex
    await this.convex.mutation(
      'INSERT INTO email_movements',
      {
        uid: move.uid,
        from_folder: move.from_folder,
        to_folder: move.to_folder,
        classified_as: originalClassification.prioridade,
        feedback_timestamp: new Date(),
        // ... campos adicionais
      }
    );
  }
}
```

---

## Integração no Worker

```javascript
// src/worker-classify.js

import { MovementoMonitor } from './imap/movimento-monitor.js';

class EmailClassifier {
  constructor() {
    this.imap = null;
    this.movementoMonitor = null;  // NEW
    // ... resto
  }

  async connect() {
    // ... connect IMAP ...

    // NEW: Inicia movimento monitor
    this.movementoMonitor = new MovementoMonitor(this.imap, this.convex);
    this.movementoMonitor.start();  // Roda em background

    // ... resto do connect ...
  }
}
```

---

## Weekly Report

```javascript
// src/reports/weekly-feedback-report.js

export async function generateWeeklyReport(convexClient) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Estatísticas
  const movements = await convexClient.query(
    `SELECT * FROM email_movements 
     WHERE feedback_timestamp > ?`,
    [weekAgo]
  );

  const correctCount = movements.filter(m => m.is_correct).length;
  const totalCount = movements.length;
  const accuracy = (correctCount / totalCount * 100).toFixed(1);

  // Gera HTML
  const html = `
    <h2>Relatório Semanal de Classificação</h2>
    <p><strong>Taxa de Acerto:</strong> ${accuracy}%</p>
    
    <h3>Por Nível</h3>
    <ul>
      <li>P1: ${countByLevel(movements, 'P1')} emails</li>
      ...
    </ul>

    <h3>Falsos Positivos</h3>
    <ul>
      ${movements
        .filter(m => !m.is_correct && m.classified_as > m.expected_priority)
        .map(m => `<li>${m.subject} (P${m.classified_as}→P${m.expected_priority})</li>`)
        .join('')}
    </ul>
  `;

  // Envia por email
  await sendEmail({
    to: 'clara.barbosa@fastdrywall.com.br',
    subject: `Relatório Semanal — ${accuracy}% de acerto`,
    html
  });
}
```

---

## Métricas em Tempo Real

```javascript
// Mostrar no dashboard (future)

const metrics = {
  overall_accuracy: 0.82,
  by_priority: {
    P1: 0.95,
    P2: 0.78,
    P3: 0.90,
    P4: 0.67,
    P5: 0.50
  },
  false_positives: 4,  // Sistema exagerou
  false_negatives: 1,  // Sistema minimizou
  avg_confidence: 0.87,
  learning_examples: 12  // Padrões aprendidos esta semana
};
```

---

*Arquitetura Feedback Loop | 2026-05-08*
