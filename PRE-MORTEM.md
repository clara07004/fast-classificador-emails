# Pré-Mortem — Classificador de Emails Fast

**Técnica:** Imaginamos que o MVP FALHOU. Trabalhamos para trás identificando por quê.

---

## 🔴 Cenário: MVP Falha Semana 1 com CEO

### Causa Raiz Potencial #1: Claude API Não Responde / Latência Alta

**Probabilidade:** 🟠 MÉDIA (40%)  
**Impacto:** 🔴 CRÍTICO (bloqueia tudo)

#### O Problema
- Projeto assume que Claude API responde em < 5s
- CEO recebe email, abre caixa, nada está classificado ainda
- Se Claude demora 30s, email fica "invisível" por 30s
- Se Claude falha (timeout, rate limit, quota), email cai em erro

#### Por Quê Pode Acontecer
1. Nenhum teste de latência real com Claude (testes usam mock)
2. Rate limiting da API não foi testado (quota inicial baixa)
3. Prompt de Claude não foi otimizado para latência
4. Nenhuma cache ou batch processing de emails
5. Toda IA é bloqueante (não tem async na verdade)

#### Sinais de Alerta
- Emails demorando > 10s para aparecer em pasta
- API retornando HTTP 429 (rate limit)
- Fila de processamento crescendo exponencialmente
- CEO vê apenas "último email classificado 2 min atrás"

#### Mitigação
```javascript
// ❌ Atual (provável bloqueante)
const classificacao = await claudeApi.classify(email);

// ✅ Deveria ser
const classificacao = await Promise.race([
  claudeApi.classify(email),
  timeout(5000)  // Max 5s, senão fallback
]);

// E ter fila com priorização:
filaProcessamento.enfileirar(email, prioridade);
```

**Ação:** Teste de carga com Claude API ANTES do MVP. Implementar timeout + fallback.

---

### Causa Raiz Potencial #2: Convex Não Persiste Corretamente

**Probabilidade:** 🟠 MÉDIA (35%)  
**Impacto:** 🔴 CRÍTICO

#### O Problema
- Projeto assume que Convex salva estado + emails corretamente
- Nenhum teste de integração REAL com Convex (testes usam mock)
- Se Convex não persiste `estadoProcessamento`, UID tracking falha
- Reconexão IMAP → sem saber qual UID processar → reprocessamento OU pula emails

#### Por Quê Pode Acontecer
1. `src/convex/cliente.js` é placeholder (retorna valores fake)
2. Schema em `convex/schema.ts` pode ter problemas de permissões
3. Convex pode ter quotas/limites de escrita
4. Race condition entre writes paralelas em Convex
5. Migrations ou atualizações de schema quebram em prod

#### Sinais de Alerta
- UID tracking não funciona (mesmo email processado 2x)
- Dashboard Convex mostra dados inconsistentes
- Logs mostram "Failed to write to Convex"
- Worker não consegue ler estado na reconexão

#### Mitigação
```javascript
// ❌ Atual (mock)
export async function obterEstadoProcessamento(funcionarioId) {
  return { ultimoUidProcessado: 0 };  // Fake!
}

// ✅ Deveria ser
export async function obterEstadoProcessamento(funcionarioId) {
  try {
    const estado = await convex.query(api.estado.obterEstado, { funcionarioId });
    if (!estado) {
      // Primeira vez? Inicializa
      await convex.mutation(api.estado.inicializar, { funcionarioId });
      return { ultimoUidProcessado: 0 };
    }
    return estado;
  } catch (err) {
    log.error('Falha ao obter estado de Convex');
    // Fallback: processa todos os emails (não ideal mas seguro)
    return { ultimoUidProcessado: 0 };
  }
}
```

**Ação:** Integrar de verdade com Convex. Testes de integração (não mock). Implementar retry + fallback.

---

### Causa Raiz Potencial #3: IMAP Real ≠ MockImapClient

**Probabilidade:** 🔴 ALTA (60%)  
**Impacto:** 🟠 ALTO

#### O Problema
- Todos os testes usam `MockImapClient` que é simplificado
- IMAP real tem comportamentos diferentes:
  - IDLE timeout pode ser < 28 min em alguns servidores
  - `mailboxMove` pode funcionar diferente com UID vs Sequence number
  - Conectar 2x simultâneas pode ser bloqueado
  - Algumas pastas podem ser read-only

#### Por Quê Pode Acontecer
1. Nenhum teste com ImapFlow REAL (biblioteca usada)
2. CSC Empresarial pode ter limitações não documentadas
3. Servidor pode rejeitar múltiplas conexões IDLE
4. Pastas podem ter espaços/caracteres especiais reais diferentes
5. Timeout de IDLE pode ser reiniciado a cada 28 min (não 28 flat)

#### Sinais de Alerta
- Worker conecta mas não recebe eventos IDLE
- `mailboxMove` falha aleatoriamente
- Conexão desconecta sem aviso
- "Permissão negada" ao tentar criar pasta

#### Mitigação
```javascript
// ✅ Teste com IMAP real antes de MVP
async function testarImapReal(credenciais) {
  const client = new ImapFlow({
    host: 'mail.cscempresarial.com.br',
    port: 993,
    secure: true,
    auth: credenciais,
  });

  try {
    await client.connect();
    
    // Teste 1: IDLE funciona?
    await client.mailboxOpen('INBOX');
    const idlePromise = client.idle();
    await new Promise(r => setTimeout(r, 5000));
    await client.close();
    
    // Teste 2: Move funciona?
    await client.mailboxOpen('INBOX');
    const mensagens = await client.search({ unseen: true });
    if (mensagens.length > 0) {
      await client.mailboxMove([mensagens[0]], 'Fast/Teste');
      log.info('MOVE funcionou');
    }
    
    // Teste 3: Pastas existem?
    const mailboxes = await client.list();
    log.info({ pastas: mailboxes.map(m => m.path) });
    
    await client.logout();
  } catch (err) {
    log.error('Falha em teste IMAP real', err);
    throw err;
  }
}
```

**Ação:** Teste de integração com credenciais REAIS antes do MVP. Ajustar código baseado em comportamento real.

---

### Causa Raiz Potencial #4: Worker Crasheia Silenciosamente

**Probabilidade:** 🟠 MÉDIA (45%)  
**Impacto:** 🔴 CRÍTICO

#### O Problema
- Worker roda em SaveInCloud VPS com PM2
- Se worker crasheia, ninguém sabe até CEO reclamar
- Logging pode não estar configurado corretamente
- Reconexão automática pode falhar

#### Por Quê Pode Acontecer
1. Nenhum teste de "worker morreu e ressuscitou"
2. PM2 pode não estar configurado corretamente (arquivo `.cjs`)
3. Nenhum alerta/notificação quando worker falha
4. Memória pode vazar (listeners de IDLE não limpas)
5. Conexão IMAP pode ficar "zombi" sem morrer

#### Sinais de Alerta
- CEO diz: "Emails não estão sendo classificados desde 1 hora"
- PM2 logs mostram "worker restarted 10 times"
- Memory usage cresce indefinidamente
- Nenhuma mensagem de erro nos logs

#### Mitigação
```javascript
// ✅ Health check + alerta
setInterval(async () => {
  const agora = Date.now();
  const ultimoProcessamento = estadoGlobal.ultimoTimestampProcessamento;
  const minuosSemAtividade = (agora - ultimoProcessamento) / 1000 / 60;
  
  if (minuosSemAtividade > 5 && emailsNaFila > 0) {
    log.error('⚠️ ALERTA: Worker inativo com emails na fila!');
    await notificarDevops('Worker pode estar travado');
  }
}, 60000);  // Check a cada 1 min

// ✅ Limpeza de listeners
process.on('SIGTERM', async () => {
  log.warn('Recebido SIGTERM — encerrando gracefully');
  await client.logout().catch(() => {});
  await filaProcessamento.aguardarVazio();
  process.exit(0);
});
```

**Ação:** Implementar health check. Alertas quando inativo. Graceful shutdown. Monitoramento de PM2.

---

### Causa Raiz Potencial #5: Pré-classificador Tem Falsos Positivos

**Probabilidade:** 🟡 BAIXA-MÉDIA (30%)  
**Impacto:** 🟠 ALTO

#### O Problema
- Pré-classificador usa padrões simples (regex)
- Pode classificar errado emails legítimos
- Exemplo: "Não é urgente, mas..." → deteta "urgente" → Nível 1 errado

#### Por Quê Pode Acontecer
1. Padrões regex muito amplos/genéricos
2. Não testa com emails REAIS da CEO
3. Whitelist VIP pode ser alimentado manualmente (erro humano)
4. Padrões não consideram contexto (negação, ironia)

#### Sinais de Alerta
- CEO vê emails classificados incorretamente
- "Este não era urgente!" → reduz confiança no sistema
- Usuário começa a corrigir manualmente (derrota o propósito)

#### Mitigação
```javascript
// ✅ Coleta de falsos positivos
if (email.fakeClassificacao !== email.realClassificacao) {
  log.warn('Falso positivo detectado', {
    subject: email.subject,
    classif: email.fakeClassificacao,
    real: email.realClassificacao,
    padraoQueErrou: identificarPadrao(email),
  });
  
  // Enviar para análise
  await salvarFalsoPositivoEmConvex(email);
}

// ✅ Ajustar padrões baseado em falsos positivos
// (Fase 2: machine learning dos padrões)
```

**Ação:** Teste A/B com pré-classificador. Coleta de feedback da CEO. Ajuste de padrões iterativo.

---

### Causa Raiz Potencial #6: Performance — Processamento Muito Lento

**Probabilidade:** 🟡 MÉDIA (35%)  
**Impacto:** 🟠 ALTO

#### O Problema
- CEO recebe 100 emails em 5 minutos
- Se cada email demora 3s (IDLE + classificação + move + Convex)
- Fila cresce: 100 * 3s = 300s = 5 min atrás
- CEO abre caixa e vê emails não classificados

#### Por Quê Pode Acontecer
1. Classificação sequencial em FilaProcessamento (sem paralelismo)
2. Claude API chamada para CADA email (não batch)
3. Convex writes são síncronos/bloqueantes
4. IMAP move é lento (1-2s por email em alguns servidores)
5. Nenhuma otimização/cache

#### Sinais de Alerta
- Fila de processamento crescendo (não vazia)
- Tempo entre chegada e classificação > 30s
- CPU 100% mas throughput baixo
- Memory cresce junto com fila

#### Mitigação
```javascript
// ❌ Atual (sequencial)
filaProcessamento.enfileirar(() => processarEmail(email));

// ✅ Deveria ter paralelismo cuidadoso
const CONCORRENCIA_MAX = 3;
const filasParalelas = [...Array(CONCORRENCIA_MAX)].map(() => new FilaProcessamento());

function enfileirarComBalanceamento(email) {
  const fila = filasParalelas[hashEmail(email) % CONCORRENCIA_MAX];
  fila.enfileirar(() => processarEmail(email));
}

// ✅ Batch de Convex writes
const BATCH_CONVEX = [];
async function salvarClassificacao(email, nivel) {
  BATCH_CONVEX.push({ email, nivel });
  if (BATCH_CONVEX.length >= 10) {
    await convex.mutation(api.emails.salvarEmBatch, { emails: BATCH_CONVEX });
    BATCH_CONVEX.length = 0;
  }
}
```

**Ação:** Teste de carga com 100 emails simultâneos. Implementar paralelismo seguro. Batch Convex.

---

### Causa Raiz Potencial #7: Custos de Claude API Explodem

**Probabilidade:** 🟡 MÉDIA (25%)  
**Impacto:** 🟠 ALTO (orçamento)

#### O Problema
- CEO recebe 200 emails/dia
- Se pré-classificador só pega 40%, ainda são ~120 chamadas API/dia
- Claude API: ~$0.003 por 1K tokens, ~100 tokens por email
- 120 * 0.0003 = ~$0.04/dia = $1.2/mês (ok)
- MAS: Se pré-classificador falha e volta para 200 emails/dia
- 200 * 0.0003 = $0.06/dia = $1.8/mês (ainda ok)
- MAS: Se contexto RAG adiciona histórico de thread
- Cada email pode virar 500+ tokens (contexto) → custo 5x
- 200 * 5 * 0.0003 = $0.30/dia = $9/mês (acumulável)

#### Por Quê Pode Acontecer
1. Nenhum custo budgeting/alerta
2. Contexto RAG não foi implementado com limite de tokens
3. Pré-classificador falha mais que estimado
4. Usuário adiciona múltiplos senders ao whitelist (mais IA)
5. Sem cache/deduplicação de emails

#### Sinais de Alerta
- Fatura mensal de Claude API > $20
- Análise: "Custo por email > $0.10"
- CEO pedindo para "parar de usar IA"

#### Mitigação
```javascript
// ✅ Alertar sobre custos
const ALERTA_CUSTO = 5.0;  // $5/mês

setInterval(async () => {
  const custoEstimado = await estimarCustoMesAtual();
  if (custoEstimado > ALERTA_CUSTO) {
    log.warn('⚠️ Custo Claude API alto', { custoEstimado });
    await notificarDevops(`Custo de IA: $${custoEstimado.toFixed(2)}`);
  }
}, 3600000);  // Checar a cada 1 hora

// ✅ Limpar tokens de contexto
function limitarContextoParaClaude(contexto, maxTokens = 500) {
  // Truncar se muito grande
  return contexto.substring(0, maxTokens);
}
```

**Ação:** Implementar cost tracking. Alertas sobre orçamento. Limitar contexto RAG.

---

### Causa Raiz Potencial #8: CEO Não Usa o Sistema / Baixa Adoção

**Probabilidade:** 🟡 MÉDIA (40%)  
**Impacto:** 🔴 CRÍTICO (negócio)

#### O Problema
- Sistema funcionando perfeitamente MAS CEO não confia
- CEO continua triando manualmente ou simplesmente ignora
- "Preciso ter certeza de que não vai perder email"
- Email crítico fica em Pendente-Classificacao e CEO não vê

#### Por Quê Pode Acontecer
1. Nenhuma comunicação/treinamento com CEO
2. CEO não entende como funciona (IMAP, FilaProcessamento, etc)
3. Primeira semana: 1 email classificado errado → "não funciona"
4. Não há feedback visual (CEO não vê o que está acontecendo)
5. Interface confusa (onde estão os emails processados?)

#### Sinais de Alerta
- CEO não abre as pastas Fast/* (continua olhando INBOX)
- CEO pergunta: "Porque este email ficou em Pendente?"
- CEO cria próprias pastas em vez de usar Fast/*
- Uso do sistema estagna após semana 1

#### Mitigação
```javascript
// ✅ Dashboard visual
// Mostrar em tempo real:
//  - Emails processados hoje: 47
//  - Classificação atual: Normal (Nível 3)
//  - Última atualização: 2 min atrás
//  - Pendentes (com erro): 2

// ✅ Notificações de triage
// Se classificação diferente da esperada:
//  "CEO abriu email que foi marcado como Nível 2.
//   Se deveria ser Nível 1, clique aqui para corrigir"

// ✅ Onboarding
// Email inicial:
//  "Novo sistema de triagem implementado. 
//   Emails importantes em Fast/Urgentes.
//   Erros em Fast/Pendente-Classificacao.
//   Dúvidas? Clique aqui."
```

**Ação:** Dashboard CEO. Notificações inteligentes. Treinamento inicial. Feedback loop.

---

### Causa Raiz Potencial #9: Dependência Externa Falha (CSC, Convex, Claude)

**Probabilidade:** 🟡 BAIXA (20%)  
**Impacto:** 🔴 CRÍTICO

#### O Problema
- Projeto depende de 3 serviços externos:
  1. CSC Empresarial (IMAP) — Single point of failure
  2. Convex (BD) — Se falha, sem persistência
  3. Claude API — Se falha, sem classificação IA

- Se algum cai, qual o fallback?

#### Por Quê Pode Acontecer
1. CSC: Servidor IMAP fica offline (manutenção, problema)
2. Convex: Quota excedida, problema de permissão
3. Claude: Rate limit, outage da API, quota excedida

#### Sinais de Alerta
- "Connection refused" ao IMAP
- "Permission denied" ao Convex
- "Rate limit exceeded" de Claude
- Nenhuma maneira de processar emails

#### Mitigação
```javascript
// ✅ Fallbacks claros
async function processarEmail(email) {
  // 1. Tenta classificar com IA
  try {
    nivel = await claudeApi.classify(email);
  } catch (err) {
    log.warn('Claude falhou, usando pré-classificador');
    // 2. Fallback: pré-classificador
    const result = await tentarClassificarSemIA(email);
    if (result.classificado) {
      nivel = result.nivel;
    } else {
      // 3. Fallback: Normal (Nível 3)
      nivel = 3;
      log.warn('Sem IA, classificando como Normal');
    }
  }
  
  // 4. Tenta salvar em Convex
  try {
    await salvarEmConvex(email, nivel);
  } catch (err) {
    log.warn('Convex falhou, continuando sem persistência');
    // Pelo menos email foi movido para pasta correta
  }
  
  // 5. Se Convex falha mas email foi movido, é OK
  // Reconexão vai reprocessar (idempotente)
}
```

**Ação:** Documentar fallbacks. Testes de "e se CSC cair?". Alertas sobre dependências.

---

### Causa Raiz Potencial #10: Segurança — Credenciais Vazadas

**Probabilidade:** 🟡 BAIXA (15%)  
**Impacto:** 🔴 CRÍTICO

#### O Problema
- Credenciais IMAP (email + senha de app) precisam estar em algum lugar
- Se vazarem, invasor tem acesso total aos emails da CEO
- Convex API key está no código?
- Claude API key está em variável de ambiente insegura?

#### Por Quê Pode Acontecer
1. Credenciais commitadas no Git (acidentalmente)
2. Arquivo `.env` público no SaveInCloud
3. Variáveis de ambiente em logs
4. Nenhuma rotação de credenciais
5. Key sharing com devops insegura

#### Sinais de Alerta
- Email vaza (invasor acessa caixa)
- Servidor de emails reporta "acesso não autorizado"
- Convex API abusada (muitas requisições estranhas)
- Claude API gasta $1000 em 1 hora (chamadas não autorizadas)

#### Mitigação
```bash
# ✅ .gitignore
.env
.env.local
ecosystem.config.js  # Se tiver credenciais hardcoded

# ✅ Credenciais em variáveis de ambiente APENAS
# NÃO em código, NÃO em git

# ✅ Logs nunca mostram credenciais
log.info({ uid, processo }, 'Status');  // ✅ Seguro
log.info({ senha }, 'Debug');           // ❌ INSEGURO

# ✅ Rotação periódica
# CEO muda senha de app IMAP a cada 30 dias
```

**Ação:** Audit de credenciais. Remover qualquer uma encontrada. .gitignore. Política de rotação.

---

## 📋 Resumo de Riscos

| # | Risco | Prob | Impacto | Prioridade | Mitigação |
|---|-------|------|---------|------------|-----------|
| 1 | Claude latência/falha | 40% | 🔴 | 🔴 P0 | Timeout + fallback |
| 2 | Convex mock/não real | 35% | 🔴 | 🔴 P0 | Integração real + testes |
| 3 | IMAP real ≠ mock | 60% | 🟠 | 🔴 P0 | Teste com credenciais reais |
| 4 | Worker crash silencioso | 45% | 🔴 | 🔴 P0 | Health check + alertas |
| 5 | Falsos positivos pré-class | 30% | 🟠 | 🟠 P1 | A/B test + feedback loop |
| 6 | Performance lenta | 35% | 🟠 | 🟠 P1 | Load test + paralelismo |
| 7 | Custos altos | 25% | 🟠 | 🟡 P2 | Cost tracking |
| 8 | Baixa adoção CEO | 40% | 🔴 | 🔴 P0 | Dashboard + onboarding |
| 9 | Falha dependência externa | 20% | 🔴 | 🟠 P1 | Fallbacks documentados |
| 10 | Credenciais vazadas | 15% | 🔴 | 🔴 P0 | Audit + .gitignore |

---

## 🎯 Ações Imediatas (Antes do MVP)

### P0 — CRÍTICO (faça agora)
- [ ] Integração REAL com Claude API (teste de latência)
- [ ] Integração REAL com Convex (não mock)
- [ ] Teste IMAP com credenciais reais da CEO
- [ ] Health check + alertas no worker
- [ ] Dashboard CEO com status em tempo real
- [ ] Audit de credenciais no código/Git

### P1 — IMPORTANTE (faça antes de dia 5 com CEO)
- [ ] Teste A/B de pré-classificador
- [ ] Teste de carga (100+ emails simultâneos)
- [ ] Fallbacks documentados
- [ ] Cost tracking/alertas

### P2 — DESEJÁVEL (faça enquanto CEO usa)
- [ ] Coleta de falsos positivos
- [ ] Ajuste automático de padrões
- [ ] Whitelist VIP automation
- [ ] Machine learning dos padrões

---

## 🔍 O Que Pode Dar Errado (Ao Vivo com CEO)

**Semana 1:**
- "Emails não estão sendo classificados" → Claude timeout
- "Este email deveria estar em Urgentes" → Falso negativo do pré-classificador
- "Não confio no sistema" → Falta de transparência/dashboard

**Semana 2:**
- "Por que este estava em Pendente?" → Entender erros
- "Está muito lento" → Performance
- "Cortou meu email!" → Email perdido em erro (improvável mas possível)

**Mês 1:**
- "Aumentou meu custo em $50" → Custos altos não monitorados
- "Parei de usar" → Baixa adoção/confiança
- "Seria bom se..." → Feature requests

---

## ⚠️ Conclusão

**6 problemas críticos foram resolvidos pelo red team.**  
**10 novos riscos foram identificados neste pré-mortem.**

Os 4 maiores riscos antes do MVP são:
1. **Integração real com dependências** (Claude, Convex, IMAP)
2. **Performance e latência** (CEO vê emails lentamente)
3. **Adoção e confiança** (CEO não usa porque não entende)
4. **Segurança de credenciais** (vazar = total loss)

**MVP pode falhar não porque o código está ruim,**  
**mas porque as integrações/operações não foram testadas com dados reais.**

---

**Próximo passo:** Validar as 10 mitigações com a CEO ANTES de ir ao ar.
