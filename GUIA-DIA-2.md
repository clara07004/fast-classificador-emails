# Guia para o Dia 2 (T10 Continuação)

**Data:** 2026-05-08  
**Objetivo:** Ir de "projeto funcionando em testes" para "MVP robusto pronto para CEO"  
**Restrição:** Focar em integração real, não em features novas

---

## 📊 Status Atual (Fim do Dia 1)

```
✅ Red Team: 6 problemas críticos resolvidos
✅ Testes: 119/119 passando
✅ Módulos: 8 arquivos (~1500 linhas de código)
❌ Integração: 0% (tudo é mock/placeholder)
❌ MVP: Não está rodando em produção ainda
```

### O Que Existe
- `src/imap/worker.js` — Skeleton com FilaProcessamento
- `src/imap/pastas.js` — Gerenciamento de pastas (testado)
- `src/imap/erro.js` — Error handling (testado)
- `src/imap/pre-classificador.js` — Classificação sem IA (testado)
- `src/imap/thread-context.js` — Context detection (testado)
- `src/convex/cliente.js` — Placeholder FAKE
- `ecosystem.config.js` — PM2 config (precisa de credenciais)

### O Que Não Existe
- Claude API integration
- Convex integration (real)
- Worker main loop (processarNovosEmails)
- Rascunho/draft geração
- Dashboard CEO
- Teste end-to-end

---

## 🎯 Dia 2: Roadmap (8-12 horas)

### Fase 1: Preparação (0-1h)

**T10.1 — Setup de Credenciais Reais**

```bash
# Criar arquivo .env com credenciais SEGURAS
IMAP_HOST=mail.cscempresarial.com.br
IMAP_PORT=993
IMAP_EMAIL=clara.barbosa@fastdrywall.com.br
IMAP_APP_PASSWORD=xxxx-xxxx-xxxx  # Senha de app, não senha login

CONVEX_DEPLOYMENT=seu-deployment.convex.cloud
CONVEX_API_KEY=xxxx
CONVEX_API_URL=https://seu-deployment.convex.cloud

CLAUDE_API_KEY=sk-ant-xxxx
CLAUDE_MODEL=claude-opus-4-7
```

**Verificações:**
- [ ] `.env` criado com credenciais
- [ ] `.env` adicionado ao `.gitignore`
- [ ] `.env` nunca commitado (verificar git history)
- [ ] Credenciais reais, não fake

**Risco:** ❌ Credenciais vazadas no Git  
**Mitigação:** Dupla-checagem, audit git antes de commit

---

### Fase 2: Integração Convex (1-2h)

**T10.2 — Implementar Cliente Convex Real**

**Arquivo:** `src/convex/cliente.js`

Implementar de verdade (remover placeholder):

```javascript
import { useQuery, useMutation } from 'convex/react';  // Ou server-side equiv
import { api } from '../generated/api';

export async function obterEstadoProcessamento(funcionarioId) {
  // NÃO FAKE
  const estado = await fetch(CONVEX_URL, {
    method: 'POST',
    body: JSON.stringify({
      path: 'estado:obterEstado',
      args: { funcionarioId },
    }),
    headers: { Authorization: `Bearer ${CONVEX_API_KEY}` },
  }).then(r => r.json());
  
  return estado;
}

export async function salvarClassificacao(email, nivel, contexto) {
  // Salvar email + classificação em Convex
  const resultado = await fetch(CONVEX_URL, {
    method: 'POST',
    body: JSON.stringify({
      path: 'emails:salvar',
      args: { 
        uid: email.uid,
        from: email.from,
        subject: email.subject,
        nivel,
        contexto,
        timestamp: Date.now(),
      },
    }),
    headers: { Authorization: `Bearer ${CONVEX_API_KEY}` },
  }).then(r => r.json());
  
  return resultado;
}
```

**Verificações:**
- [ ] Teste de conexão com Convex (não mock)
- [ ] Consegue ler estadoProcessamento
- [ ] Consegue salvar email classificado
- [ ] Consegue atualizar ultimoUidProcessado
- [ ] Erro handling (timeout, permissão)

**Risco:** 🟠 Convex quota/permissões  
**Mitigação:** Testar com conta de teste, ajustar quotas antes, implementar retry

**Tempo Estimado:** 45-60 min

---

### Fase 3: Claude API Integration (2-3.5h)

**T10.3 — Implementar Classificador com Claude**

**Arquivo:** `src/imap/classificador.js` (novo)

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { tentarClassificarSemIA } from './pre-classificador.js';
import { ajustarClassificacaoPorContexto } from './thread-context.js';

const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export async function classificarEmail(email, funcionario, contexto = null) {
  // 1. Tentar sem IA
  const preClassificacao = await tentarClassificarSemIA(email, funcionario);
  if (preClassificacao.classificado) {
    return {
      nivel: preClassificacao.nivel,
      metodo: 'pre-classificador',
      reasoning: preClassificacao.motivo,
    };
  }

  // 2. Chamar Claude com contexto
  const prompt = construirPrompt(email, contexto, funcionario);
  
  try {
    const response = await claude.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const resposta = response.content[0].text;
    const nivel = extrairNivelDaResposta(resposta);  // Parse "Nível: 2"
    
    // 3. Ajustar por contexto
    let nivelFinal = nivel;
    if (contexto) {
      nivelFinal = ajustarClassificacaoPorContexto(nivel, contexto);
    }

    return {
      nivel: nivelFinal,
      metodo: 'claude-api',
      reasoning: resposta,
    };
  } catch (err) {
    log.error('Claude API falhou', { erro: err.message });
    
    // Fallback: Normal (Nível 3)
    return {
      nivel: 3,
      metodo: 'fallback-normal',
      reasoning: `Falha em Claude: ${err.message}`,
    };
  }
}

function construirPrompt(email, contexto, funcionario) {
  return `
Você é assistente de triagem de emails para Fast Sistemas Construtivos.
Classifique este email em um dos 5 níveis:
  1 = Urgente (cliente em risco, problema crítico, ação imediata)
  2 = Importante (projeto em andamento, decisão necessária)
  3 = Normal (informação padrão, sem urgência)
  4 = Baixa (comunicado, FYI)
  5 = FYI (boletim, informação passiva)

Email:
  De: ${email.from}
  Assunto: ${email.subject}
  Corpo: ${email.text?.substring(0, 500) || '(vazio)'}

${contexto ? `
Contexto da conversa:
${contexto}
` : ''}

Responda APENAS com:
Nível: [1-5]
Reasoning: [explicação breve]
`;
}

function extrairNivelDaResposta(resposta) {
  const match = resposta.match(/Nível:\s*(\d)/);
  const nivel = parseInt(match?.[1] || '3');
  return Math.max(1, Math.min(5, nivel));  // Clamp 1-5
}
```

**Verificações:**
- [ ] Chamar Claude API com email real
- [ ] Timeout de 5s implementado
- [ ] Fallback para pré-classificador se falha
- [ ] Parsing de resposta funciona
- [ ] Contexto de thread passa corretamente
- [ ] Custos sendo tracked

**Risco:** 🔴 Claude timeout/rate limit  
**Mitigação:** Timeout de 5s, retry com exponential backoff, fallback pré-classificador

**Tempo Estimado:** 90 min

---

### Fase 4: Processamento Completo (3.5-6h)

**T10.4 — Implementar processarNovosEmails()**

**Arquivo:** `src/imap/worker.js` (modificar)

```javascript
async function processarNovosEmails(client, funcionario) {
  // Abrir INBOX
  await client.mailboxOpen('INBOX');

  // Buscar emails não-processados (UIDs > último salvo)
  const estadoAnterior = await obterEstadoProcessamento(funcionario.id);
  const ultimoProcessado = estadoAnterior.ultimoUidProcessado || 0;
  
  // Buscar UIDs maiores que o último
  const novoEmails = await client.search({ 
    uid: `${ultimoProcessado + 1}:*` 
  });

  log.info({ funcionarioId: funcionario.id, total: novoEmails.length }, 
    'Processando emails novos');

  // Processar cada email
  for (const uid of novoEmails) {
    // Enfileirar (não await, deixa continuar)
    filaProcessamento.enfileirar(() => 
      processarEmailIndividual(client, uid, funcionario)
    );
  }
}

async function processarEmailIndividual(client, uid, funcionario) {
  try {
    // 1. Buscar email do servidor
    const message = await client.fetchOne(uid, { envelope: true, bodyStructure: true });
    const email = normalizarEmail(message);

    // 2. Registrar UID ANTES de processar (idempotência)
    await registrarUidProcessado(uid, funcionario.id);

    // 3. Analisar contexto de thread
    const contextoThread = analisarContextoConversa(email);
    let resumoThread = '';
    if (contextoThread.isResposta) {
      const emailsAnterior = await buscarThreadAnterior(contextoThread.threadId);
      resumoThread = resumirThreadParaContexto(emailsAnterior);
    }

    // 4. Classificar
    const classificacao = await classificarEmail(email, funcionario, resumoThread);
    const nivel = classificacao.nivel;

    log.info({
      uid,
      from: email.from,
      subject: email.subject,
      nivel,
      metodo: classificacao.metodo,
    }, 'Email classificado');

    // 5. Mover para pasta correta
    const resultado = await moverComFallback(client, uid, nivel);

    // 6. Salvar em Convex
    if (resultado.sucesso) {
      await salvarClassificacao({
        uid,
        from: email.from,
        subject: email.subject,
        nivel,
        metodo: classificacao.metodo,
        pasta: resultado.pastaUsada,
        timestamp: Date.now(),
      });
    }

    // 7. Se falha, erro já foi registrado em Convex pelo moverComFallback
    if (resultado.motivo === 'fallback_pasta_pendente') {
      log.warn({ uid, originalPasta: resultado.pastaUsada }, 
        'Email em fallback — CEO pode revisar em Pendente-Classificacao');
    }

  } catch (err) {
    // Erro não previsto
    await tratarErroProcessamento(client, uid, 1, err);
  }
}

function normalizarEmail(message) {
  // Converter ImapFlow message para formato padrão
  return {
    uid: message.uid,
    messageId: message.envelope.messageId,
    inReplyTo: message.envelope.inReplyTo,
    references: message.envelope.references,
    from: message.envelope.from?.[0]?.address || 'desconhecido',
    to: message.envelope.to?.[0]?.address || '',
    subject: message.envelope.subject || '(sem assunto)',
    text: extrairTextoDoBody(message),
    date: message.envelope.date,
  };
}
```

**Verificações:**
- [ ] Conecta ao IMAP e busca UIDs
- [ ] Registra UID antes de processar
- [ ] Classifica com Claude
- [ ] Move para pasta correta
- [ ] Salva em Convex
- [ ] Trata erros
- [ ] Não falha em email broken/inválido
- [ ] Fila processamento funciona (serial)
- [ ] Timeout implementado (não trava em email lento)

**Risco:** 🔴 Falha em processamento de email quebrado (muito grande, encoding invalido)  
**Mitigação:** Try-catch interno, fallback para Pendente-Classificacao, logging completo

**Tempo Estimado:** 180 min

---

### Fase 5: IMAP IDLE Loop (6-7h)

**T10.5 — Conectar IMAP IDLE e Reconexão**

**Arquivo:** `src/imap/worker.js` (modificar init)

```javascript
async function iniciarWorker() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    secure: true,
    auth: {
      user: process.env.IMAP_EMAIL,
      pass: process.env.IMAP_APP_PASSWORD,
    },
  });

  let tentativaReconexao = 0;
  const MAX_TENTATIVAS = 5;

  async function conectarComRetry() {
    try {
      await client.connect();
      tentativaReconexao = 0;
      log.info('Conectado ao IMAP');

      // 1. Garantir pastas existem
      const resultadoPastas = await garantirPastasFast(client);
      if (!resultadoPastas.sucesso) {
        log.warn('Algumas pastas não criadas — usando fallback');
      }

      // 2. Processar emails que chegaram enquanto desconectado
      await processarNovosEmails(client, funcionario);

      // 3. Entrar em IDLE
      return client;
    } catch (err) {
      tentativaReconexao++;
      if (tentativaReconexao > MAX_TENTATIVAS) {
        log.error('Falha ao conectar IMAP após 5 tentativas');
        throw err;
      }

      const delay = Math.min(30000, 1000 * Math.pow(2, tentativaReconexao));
      log.warn(`Reconectando em ${delay}ms (tentativa ${tentativaReconexao})`);
      await new Promise(r => setTimeout(r, delay));
      
      return conectarComRetry();
    }
  }

  // Loop principal
  while (true) {
    try {
      const c = await conectarComRetry();

      // Event: novo email chegou
      c.on('exists', (data) => {
        log.debug({ count: data.count }, 'Novos emails chegaram');
        filaProcessamento.enfileirar(() => processarNovosEmails(c, funcionario));
      });

      // Event: desconexão inesperada
      c.on('error', (err) => {
        log.error({ erro: err.message }, 'Erro na conexão IMAP');
      });

      // Reconectar a cada 27 min (antes do timeout de 28 min RFC 2177)
      await new Promise(r => setTimeout(r, 27 * 60 * 1000));
      
      log.info('Reconectando (RFC 2177 timeout preventivo)');
      await c.logout();

    } catch (err) {
      log.error({ erro: err.message }, 'Worker falhou, tentando reconectar');
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Iniciar
iniciarWorker().catch(err => {
  log.error('Worker não conseguiu iniciar', err);
  process.exit(1);
});
```

**Verificações:**
- [ ] Conecta ao IMAP com credenciais reais
- [ ] Recebe eventos 'exists' quando email chega
- [ ] Processa emails em background
- [ ] IDLE funciona (não bloqueia)
- [ ] Reconexão a cada 27 min
- [ ] Retry com backoff exponencial
- [ ] Logs mostram cada passo

**Risco:** 🔴 IMAP desconecta inesperadamente ou timeout não funciona  
**Mitigação:** Reconexão preventiva a 27 min, event handlers, logging

**Tempo Estimado:** 60 min

---

### Fase 6: Testes End-to-End (7-8h)

**T10.6 — Teste Manual: Email Real → Classificação → Pasta**

**Procedimento:**
```
1. Iniciar worker
   npm start

2. Enviar email REAL para CEO
   - Assunto: "URGENTE: Teste de classificação"
   - Corpo: "Este é um teste do sistema"

3. Monitorar logs
   - Deve aparecer "Novos emails chegaram"
   - Deve processar e classificar
   - Deve aparecer em "Fast/Urgentes"

4. Verificar Convex
   - Email deve estar salvo
   - estadoProcessamento deve estar atualizado

5. Enviar segundo email
   - Resposta ao primeiro ("Re: URGENTE...")
   - Deve herdar nível 1 por contexto
```

**Verificações:**
- [ ] Worker inicia sem erros
- [ ] IMAP conecta
- [ ] Email real é recebido
- [ ] Classificação funciona
- [ ] Email aparece na pasta correta
- [ ] Convex foi atualizado
- [ ] Logs são claros

**Risco:** 🟠 Email real falha em algum passo  
**Mitigação:** Debugging passo-a-passo, logs detalhados, fallback para Pendente-Classificacao

**Tempo Estimado:** 60 min

---

### Fase 7: Dashboard MVP (8-10h)

**T10.7 — Dashboard CEO (Simplificado)**

**Arquivo:** `src/dashboard/dashboard.html` (novo)

Página HTML simples mostrando:
```html
<html>
<head>
  <title>Classificador Fast — Status</title>
  <style>
    body { font-family: Arial; margin: 20px; }
    .status { padding: 10px; border-radius: 5px; }
    .online { background: #90EE90; }
    .offline { background: #FFB6C6; }
    .pending { background: #FFE4B5; }
  </style>
</head>
<body>
  <h1>Classificador de Emails Fast</h1>
  
  <div class="status" id="status-worker">
    Worker: <span id="worker-status">⏳ Conectando...</span>
  </div>
  
  <div class="status">
    Emails processados hoje: <strong id="total-processados">0</strong>
  </div>
  
  <div class="status">
    Últimos processados:
    <ul id="ultimos-emails">
      <li>Carregando...</li>
    </ul>
  </div>
  
  <div class="status pending">
    ⚠️ Em Pendente-Classificacao: <strong id="pendentes-count">0</strong>
    <a href="#pendentes">Ver detalhes</a>
  </div>

  <script>
    setInterval(async () => {
      const stats = await fetch('/api/stats').then(r => r.json());
      document.getElementById('worker-status').textContent = 
        stats.online ? '✅ Online' : '❌ Offline';
      document.getElementById('total-processados').textContent = stats.processados;
      document.getElementById('pendentes-count').textContent = stats.pendentes;
      
      const emails = await fetch('/api/ultimos-emails').then(r => r.json());
      document.getElementById('ultimos-emails').innerHTML = emails
        .map(e => `<li>${e.subject} → Nível ${e.nivel}</li>`)
        .join('');
    }, 5000);  // Atualizar a cada 5s
  </script>
</body>
</html>
```

**Endpoints necessários:**
```javascript
// Em worker.js ou novo arquivo api.js
app.get('/api/stats', (req, res) => {
  res.json({
    online: worker.isConnected,
    processados: estadoGlobal.totalProcessados,
    pendentes: estadoGlobal.emailsEmPendente,
    ultimoProcessamento: new Date(estadoGlobal.ultimoProcessamento),
  });
});

app.get('/api/ultimos-emails', async (req, res) => {
  const emails = await buscarUltimosEmails(5);  // Últimos 5
  res.json(emails);
});
```

**Verificações:**
- [ ] Dashboard carrega sem erros
- [ ] Stats atualiza em tempo real
- [ ] Mostra emails em Pendente-Classificacao
- [ ] Acesso público ou protegido (não expostar)

**Risco:** 🟡 Expostar informações sensíveis publicamente  
**Mitigação:** Proteger com senha ou IP whitelist

**Tempo Estimado:** 90 min

---

## ⏱️ Cronograma do Dia 2

| Fase | Task | Tempo | Acumulado |
|------|------|-------|-----------|
| 1 | Setup credenciais | 60 min | 1h |
| 2 | Convex real | 60 min | 2h |
| 3 | Claude API | 90 min | 3.5h |
| 4 | Processamento completo | 180 min | 6h |
| 5 | IMAP IDLE | 60 min | 7h |
| 6 | Testes end-to-end | 60 min | 8h |
| 7 | Dashboard MVP | 90 min | 9.5h |
| — | **Buffer** | 30 min | 10h |

**Total:** ~10 horas de work  
**Começar:** 8h da manhã  
**Fim estimado:** 18h (com breaks)

---

## 🎯 Definição de Sucesso (Fim do Dia 2)

### MVP Pronto Para CEO quando:

- ✅ Worker conecta ao IMAP real
- ✅ Recebe evento IDLE quando email chega
- ✅ Classifica email com Claude (com fallback)
- ✅ Move para pasta correta
- ✅ Salva em Convex
- ✅ Reconecta automaticamente sem perder emails
- ✅ Dashboard mostra status em tempo real
- ✅ Erros vão para Pendente-Classificacao (CEO vê)
- ✅ Testes end-to-end passando (email real)
- ✅ Logs claros (CEO entende o que está acontecendo)

### Não é Sucesso se:

- ❌ Worker falha silenciosamente
- ❌ Email desaparece
- ❌ Classificação fica pendente > 30s
- ❌ Reconexão duplica email
- ❌ Dashboard não atualiza
- ❌ Pendente-Classificacao sem motivo do erro

---

## 🚨 Riscos Dia 2 + Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---|---|
| Claude API não responde | 40% | Timeout + fallback pré-classificador |
| IMAP credenciais erradas | 20% | Testar login manual antes |
| Convex quota excedida | 15% | Criar conta dev, não prod |
| Email muito grande falha | 30% | Try-catch + fallback Pendente |
| Worker fica zombie | 25% | Health check + logs |
| Fila cresce infinito | 20% | Monitorar throughput |

---

## ✅ Checklist Dia 2

### Antes de começar
- [ ] Credenciais IMAP obtidas (CSC)
- [ ] Conta Convex criada e testada
- [ ] API key Claude obtida
- [ ] Laptop carregado, café pronto

### Ao longo do dia
- [ ] Commit após cada fase completa
- [ ] Log no Slack/email progresso
- [ ] Se travar > 30 min, call for help
- [ ] Break a cada 2 horas

### Fim do dia
- [ ] MVP funcionando end-to-end
- [ ] Todos os testes passando (119 + novos E2E)
- [ ] Credenciais seguras (.env)
- [ ] Dashboard rodando
- [ ] Logs mostram próximas 5 classificações
- [ ] Pronto para teste com CEO amanhã (Dia 3)

---

## 🔄 O Que Fazer Depois (Dia 3+)

### Dia 3: Teste com CEO
```
- CEO envia 5 emails REAIS
- System classifica todos corretamente
- CEO move alguns emails (feedback)
- Sistema aprende (whitelist)
```

### Dia 4: Ajustes Pré-mortem
```
- Health check funciona
- Cost tracking ativo
- Dashboard CEO entende
- Fallbacks funcionam
```

### Semana 2: Rollout Gradual
```
- Adicionar 2-3 funcionários
- Monitorar padrões
- Ajustar prompts Claude
- Coleta de falsos positivos
```

---

## 📝 Documentação Necessária Dia 2

Atualizar no final do dia:
- [ ] `README.md` — Como rodas o worker
- [ ] `.env.example` — Template de credenciais (sem valores)
- [ ] `ARCHITECTURE.md` — Fluxo completo
- [ ] Logs de teste end-to-end (print screen)

---

**Pronto?** 🚀  
Dia 2 vai converter tudo que foi planejado em produção real.  
Foco é em **integração real** e **testes end-to-end**, não em features.

Sucesso no dia 2 = CEO pode testar no dia 3. ✅
