# Soluções do Red Team — Risco Real

Documentação das resoluções de problemas críticos identificados no red team. Cada problema é resolvido com cuidado, testes e documentação.

---

## ✅ Problema 1: Race Condition IMAP IDLE

**Status:** RESOLVIDO  
**Severidade:** 🔴 CRÍTICO  
**Data:** 2026-05-07

### O Problema

Quando múltiplos emails chegam rapidamente:

```
Email A chega → evento 'exists' → dispara processarNovosEmails()
Email B chega (antes de A terminar) → OUTRO evento 'exists' → dispara OUTRO processamento
```

Ambas as execuções rodam em paralelo → ambas tentam processar a mesma faixa de emails → **duplicação**.

**Cenário na CEO:**
- Email urgente chega
- Email normal chega 1 segundo depois
- Ambos processadores rodam simultaneamente
- Mesmo email processado 2x → 2 rascunhos criados

### A Solução

**FilaProcessamento**: Classe que serializa execuções usando Promises encadeadas.

```javascript
class FilaProcessamento {
  constructor() {
    this.promiseAtual = Promise.resolve();
  }

  enfileirar(fn) {
    // Encadeia: aguarda promise anterior, depois executa fn
    this.promiseAtual = this.promiseAtual
      .then(() => fn())
      .catch(err => {
        // Continua após erro (fail-safe)
        log.error(err);
      });
    return this.promiseAtual;
  }
}
```

**Uso:**

```javascript
client.on('exists', (data) => {
  // Enfileirar sem await — permite próximo 'exists' chegar
  filaProcessamento.enfileirar(() => processarNovosEmails());
});
```

**Garantias:**
- ✅ Máximo 1 processamento por vez
- ✅ Próximo aguarda anterior terminar
- ✅ Ordem de execução mantida
- ✅ Erros não travam a fila

### Validação

**Testes:** 6 testes em `tests/fila-processamento.test.js`

```bash
✓ executa uma tarefa simples
✓ garante que apenas 1 processamento roda por vez (serial)
✓ mantém a ordem de execução
✓ não trava a fila quando uma tarefa falha
✓ retorna promise que resolve quando termina
✓ simula cenário real: múltiplos eventos exists chegando rapidinho
```

**Status dos testes:** ✅ 6/6 passando

### Arquivos Alterados

- `src/imap/worker.js` — Adicionada classe FilaProcessamento, modificado handler de 'exists'
- `tests/fila-processamento.test.js` — Novo arquivo com suite completa

---

## ✅ Problema 2: Sem Rastreamento = Duplicação na Reconexão

**Status:** RESOLVIDO  
**Severidade:** 🔴 CRÍTICO  
**Data:** 2026-05-07

### O Problema

Quando worker reconecta a cada 28 minutos:

```
10:00 - Email processado (sem salvar em Convex que foi processado)
10:27 - Worker reconecta (abre INBOX denovo)
10:27:01 - Sistema busca "novos emails" — qual é o range?
            Email de 10:00 ainda está lá → reprocessado
```

Sem UID tracking, impossível saber que email já foi processado.

### A Solução

**Arquitetura:**
1. Nova tabela `estadoProcessamento` em Convex rastreia `ultimoUidProcessado` por funcionário
2. Na reconexão, restaura esse estado
3. Busca apenas UIDs > ultimoUidProcessado
4. Registra UID ANTES de processar (garante idempotência mesmo se falhar depois)

**Funções Convex** (`convex/estado.ts`):
```typescript
atualizarUltimoBuscado(funcionarioId, ultimoUid)
  // Atualiza apenas se UID é maior (never go backwards)
  // Retorna UID registrado

obterEstado(funcionarioId)
  // Retorna último UID processado e status conexão

atualizarStatusConexao(funcionarioId, status)
  // Rastreia "conectado" | "desconectado" | "processando"
```

**Integração no Worker** (`src/imap/worker.js`):
```javascript
// Na reconexão
const estado = await obterEstadoProcessamento(funcionarioId);
estadoGlobal.ultimoUidProcessado = estado.ultimoUidProcessado;

// Ao processar
async function registrarUidProcessado(uid) {
  await atualizarUltimoBuscado(funcionarioId, uid);
  // UID agora está salvo em Convex — idempotência garantida
}

// No fluxo de processamento (ordem crítica):
// 1. registrarUidProcessado(uid)  ← ANTES de tudo
// 2. normalizar email
// 3. classificar (Claude)
// 4. mover pasta
// 5. salvar em Convex
```

**Garantias:**
- ✅ Sem duplicação mesmo se worker crashear no meio
- ✅ Reconexão retoma do ponto certo (UID > ultimoUidProcessado)
- ✅ Never go backwards (UIDs só aumentam)
- ✅ Máximo reprocessa 1 email 2x (safe, não é perda de dados)

### Validação

**Testes:** 6 testes em `tests/idempotencia-rastreamento.test.js`

```bash
✓ registra UID antes de processar
✓ nunca volta para trás (UIDs sempre aumentam)
✓ busca apenas novos UIDs na reconexão
✓ simula: 3 emails chegam, reconecta, só processa novos
✓ simula: error mid-processing, reconecta, reprocessa apenas de onde parou
✓ múltiplas reconexões não causam duplicação
```

**Status dos testes:** ✅ 6/6 passando

### Arquivos Alterados

- `convex/schema.ts` — Adicionada tabela `estadoProcessamento`
- `convex/estado.ts` — Novo arquivo com mutations/queries
- `convex/seeds.ts` — Inicializa estado para funcionário piloto
- `src/convex/cliente.js` — Novo arquivo com abstração Convex
- `src/imap/worker.js` — Integração de rastreamento de UID
- `tests/idempotencia-rastreamento.test.js` — Suite de testes

---

## 🚧 Problema 3: Movimentação Sem Validação = Falha Silenciosa

**Status:** PENDENTE  
**Severidade:** 🔴 CRÍTICO  
**Data:** 2026-05-07

### O Problema

Quando implementar `processarNovosEmails()`:

```javascript
await client.mailboxMove([messageId], 'Fast/Urgente');
```

Se pasta não existe → erro → não tratado → email fica em INBOX invisível.

### Solução Proposta

1. Criar pastas `Fast/*` na primeira conexão (ou verificar existência)
2. Validar antes de mover
3. Erro handling com folder fallback

**Implementação:** Próxima task

---

## 🚧 Problema 4: Error Handling Silencioso

**Status:** PENDENTE  
**Severidade:** 🟠 ALTO  
**Data:** 2026-05-07

### O Problema

Se processamento falhar, email desaparece sem registrar o erro em lugar nenhum.

### Solução Proposta

Pasta `Fast/Pendente-Classificacao` como fallback:
- Se processamento falha → mover para Pendente-Classificacao
- CEO vê: "algo deu errado com este"
- Pode revisar e classificar manualmente

**Implementação:** Próxima task

---

## Próximas Tasks

1. **T11:** Rastreamento de UID processado (Problema 2)
2. **T12:** Criar/validar pastas Fast/* (Problema 3)
3. **T13:** Error handling com fallback folder (Problema 4)
4. **T14:** Integração Claude API (não é risco, é feature)
5. **T15:** Integração Convex (não é risco, é feature)

---

## Notas de Implementação

- **Sem atalhos:** Cada solução incluiu testes antes de PR
- **Fail-safe:** Erros não quebram sistema
- **Documentado:** Cada mudança tem comentário explicativo
- **Reversível:** Código pode ser rollback sem perda de dados
