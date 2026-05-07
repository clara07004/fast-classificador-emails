# Guia Dia 3 — Resolução de Bloqueadores + Teste End-to-End

**Data:** 2026-05-07  
**Objetivo:** Resolver os 2 bloqueadores do MVP (pastas IMAP e credenciais) e rodar o pipeline completo com sucesso.  
**Tempo estimado:** 4–5 horas  
**Critério de saída:** Email recebido → classificado → pasta correta → rascunho gerado → MOVE detectado como feedback

---

## Status atual

✅ **Feito:** Código inteiro do MVP está pronto (T06–T26)  
❌ **Bloqueador 1:** Pastas IMAP (`Fast/Urgente`, `Fast/Alta-Prioridade`, etc.) não existem no Outlook  
❌ **Bloqueador 2:** Credenciais do funcionário piloto ainda não configuradas  

---

## Tarefa 1: Criar as pastas IMAP — 30 minutos

### Opção A: Criar manualmente no Outlook (recomendado para teste rápido)

1. Abra o Outlook (web ou desktop)
2. Crie as 5 pastas na caixa de entrada:
   - `Fast/Urgente`
   - `Fast/Alta-Prioridade`
   - `Fast/Normal`
   - `Fast/Baixa`
   - `Fast/Irrelevante`
   - `Fast/Pendente-Classificacao` (para fallback de API)

3. Aguarde ~1 min para sincronizar no servidor IMAP

**Verificação:** Conecte via IMAP (ex.: com ImapFlow em um script de teste) e liste as pastas:
```javascript
const imap = new ImapFlow({
  host: 'mail.cscempresarial.com.br',
  port: 993,
  secure: true,
  auth: { user: 'seu-email@fast.com.br', pass: 'sua-senha-app' }
});

await imap.connect();
let list = await imap.list();
list.forEach(m => console.log(m.path)); // Verifique se as pastas Fast/* aparecem
await imap.close();
```

---

### Opção B: Criar automaticamente no worker (solução permanente)

Se preferir que o worker crie as pastas automaticamente, adicione isto no `src/imap/worker.js` antes de começar o listener de emails:

```javascript
// Após conectar ao IMAP
const PASTAS_OBRIGATORIAS = [
  'Fast/Urgente',
  'Fast/Alta-Prioridade',
  'Fast/Normal',
  'Fast/Baixa',
  'Fast/Irrelevante',
  'Fast/Pendente-Classificacao'
];

async function criarPastasObrigatorias(imap) {
  console.log('Criando pastas obrigatórias...');
  for (const pasta of PASTAS_OBRIGATORIAS) {
    try {
      // Tenta criar; se já existir, ImapFlow ignora silenciosamente
      await imap.mailboxCreate(pasta);
      console.log(`✓ Pasta criada: ${pasta}`);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn(`⚠ Erro ao criar ${pasta}:`, err.message);
      }
    }
  }
}

// Chamar após imap.connect() e antes de imap.idle()
await criarPastasObrigatorias(imap);
```

**Recomendação:** Use **Opção A** para testar agora, e implemente **Opção B** depois para garantir que funcione sem intervenção manual no go-live.

---

## Tarefa 2: Configurar credenciais do funcionário piloto — 15 minutos

### 2.1 Obter credenciais

Você precisa:
- **Email da empresa:** `seu-email@fastdrywall.com.br` (ou domínio Fast correto)
- **Senha de app:** Gere uma senha de aplicativo no CSC Empresarial

**Como gerar senha de app no CSC Empresarial:**
1. Acesse o portal do CSC Empresarial (webmail)
2. Vá para **Configurações** → **Segurança** → **Senhas de app**
3. Crie uma nova senha para "ImapFlow / Classificador Fast"
4. Copie a senha gerada

### 2.2 Configurar no `.env.local`

Abra `.env.local` e atualize:

```bash
# IMAP — Dados do funcionário piloto
IMAP_HOST=mail.cscempresarial.com.br
IMAP_PORT=993
IMAP_USER=seu-email@fastdrywall.com.br
IMAP_PASS=sua-senha-de-app-gerada

# SMTP — Para envio de rascunhos/notificações (mesmos dados)
SMTP_HOST=mail.cscempresarial.com.br
SMTP_PORT=587
SMTP_USER=seu-email@fastdrywall.com.br
SMTP_PASS=sua-senha-de-app-gerada

# Claude API
ANTHROPIC_API_KEY=sk-ant-... (já configurado?)

# Voyage AI (para Fase 2, opcional agora)
VOYAGE_API_KEY=... (deixe vazio por enquanto)

# Convex
CONVEX_URL=https://seu-projeto.convex.cloud
CONVEX_DEPLOY_KEY=... (já configurado?)
```

**⚠️ IMPORTANTE:** Se estiver em VSCode com GitGuardian ou similar, certifique-se de que `.env.local` está em `.gitignore` (ele já está por padrão, mas verifique).

### 2.3 Recarregar o worker

```bash
# Se rodar localmente
npm start

# Se rodar no servidor SaveInCloud
pm2 restart ecosystem.config.cjs
pm2 logs
```

Aguarde a mensagem de conectado:
```
[IMAP] Conectado a mail.cscempresarial.com.br:993
[IMAP] IDLE ativado. Aguardando novos emails...
```

---

## Tarefa 3: Teste end-to-end (T27) — 2–3 horas

### 3.1 Preparação

1. Verifique que o worker está rodando e conectado ao IMAP
2. Verifique que as 6 pastas Fast/* existem no Outlook
3. Abra `logs/worker.log` (ou `pm2 logs`) para ver eventos em tempo real

### 3.2 Enviar um email de teste

Envie um email **para si mesmo** com este conteúdo:

**Assunto:** `TESTE — Classificador Fast — Urgente`  
**Corpo:**
```
Olá,

Este é um email de teste para validar o classificador automático da Fast.

A gente precisa dessa documentação até hoje. Cliente está aguardando retorno.

Obrigado
```

**Do que fazer:**
- Envie de um email externo (Gmail, Outlook pessoal) para sua caixa Fast
- Ou envie de uma caixa interna de teste para a caixa piloto

### 3.3 Monitorar a execução

Abra 2 terminais lado-a-lado:

**Terminal 1:** Acompanhe os logs do worker
```bash
pm2 logs
```

**Terminal 2:** Monitore o Convex em tempo real (opcional, se tiver CLI)
```bash
npx convex dev
```

### 3.4 Checklist de validação

Quando o email chegar, verifique cada etapa:

- [ ] **Detecção:** Log mostra `[IMAP] Novo email recebido de ...`
- [ ] **Normalização:** Log mostra `[NORMALIZADOR] Email processado: assunto="...", idioma="pt-BR"`
- [ ] **Pré-classificação:** Log mostra se aplicou regra determinística (blacklist/whitelist/guard rail) ou passará para API
- [ ] **Classificação Claude:** Log mostra `[CLAUDE] Resposta recebida: nivel=1, confidence=0.95`
- [ ] **Rascunho:** Log mostra `[RASCUNHO] Rascunho gerado e salvo em Drafts`
- [ ] **Movimento:** Log mostra `[IMAP] Email movido para Fast/Urgente`
- [ ] **Convex:** Registro criado em `emails_processados` com todos os campos
- [ ] **Feedback:** Você move o email de `Fast/Urgente` para `Fast/Alta-Prioridade` no Outlook
  - Log deve mostrar: `[FEEDBACK] MOVE detectado: Fast/Urgente → Fast/Alta-Prioridade`
  - Convex deve registrar em `correcoes`

### 3.5 O que procurar em caso de erro

| Erro | Possível causa | Solução |
|---|---|---|
| `IMAP connection refused` | Credenciais erradas ou host incorreto | Verifique `.env.local` |
| `Error: mailbox does not exist` | Pastas Fast/* não foram criadas | Crie manualmente ou use Opção B |
| `[CLAUDE] Error: 401 Unauthorized` | `ANTHROPIC_API_KEY` inválida ou vencida | Gere nova chave em console.anthropic.com |
| `[RASCUNHO] Error: Append failed` | Permissão insuficiente na pasta Drafts | Verifique permissões da caixa IMAP |
| `[CONVEX] Error: Invalid document` | Campo faltando ou tipo incorreto em `emails_processados` | Verifique schema em `convex/schema.ts` |

---

## Tarefa 4: Analisar padrões de erro — 1 hora

Se o email foi classificado, responda:

1. **A classificação foi correta?**
   - Assunto "TESTE — Classificador Fast — **Urgente**" deveria ir para **Nível 1 (Urgente)**
   - Se foi corretamente para `Fast/Urgente`, ✅ aguarde feedback

2. **O rascunho faz sentido?**
   - Abra o rascunho em Drafts
   - Verifica se o tom é corporativo Fast
   - Se tiver erros óbvios, anote para ajustar prompt

3. **O feedback foi detectado?**
   - Mova o email de `Fast/Urgente` para `Fast/Normale` (simulando "vou responder depois")
   - Verifique se o log mostra `[FEEDBACK] MOVE detectado` e se Convex registrou em `correcoes`

---

## Critério de saída do Dia 3

- ✅ Pastas Fast/* existem e estão visíveis no IMAP
- ✅ Worker conecta com credenciais do funcionário piloto
- ✅ Email de teste é classificado corretamente (nível esperado baseado em conteúdo)
- ✅ Rascunho é gerado e aparece em Drafts
- ✅ Email é movido para a pasta correta
- ✅ MOVE entre pastas é detectado como feedback
- ✅ Tudo registrado no Convex (`emails_processados` + `correcoes`)

Se tudo passar: **Dia 3 concluído** ✅  
Próximo: **Dia 4 — Go-live piloto e ajustes de prompt**

---

## Logs esperados (exemplo de sucesso)

```
[IMAP] Conectado a mail.cscempresarial.com.br:993
[IMAP] IDLE ativado. Aguardando novos emails...
---
[IMAP] Novo email recebido: UID 1234, From: teste@gmail.com, Subject: TESTE — Classificador Fast — Urgente
[NORMALIZADOR] Email processado: remetente=teste@gmail.com, assunto=TESTE — Classificador Fast — Urgente, idioma=pt-BR, temAnexos=false
[PRE-CLASSIFICADOR] Nenhuma regra aplicada. Passando para Claude API...
[CLAUDE] Chamada ao haiku: nivel=1, confidence=0.96, justificativa=Assunto menciona "Urgente" + prazo hoje + cliente aguardando
[RASCUNHO] Gerando rascunho no idioma pt-BR com estilo corporativo Fast...
[RASCUNHO] Rascunho salvo em Drafts: "Olá, Obrigado por entrar em contato. Encaminharemos a documentação ainda hoje. Cordialmente, [assinatura]"
[IMAP] Email movido para Fast/Urgente
[CONVEX] Registro inserido em emails_processados: id=xxxxx, nivel=1, justificativa=..., promptVersion=fc27b30...
---
[IMAP] MOVE detectado: Fast/Urgente → Fast/Normal
[FEEDBACK] Correção registrada: nivelOriginal=1, nivelCorrigido=3, emailId=xxxxx
[CONVEX] Registro inserido em correcoes: id=yyyyy, emailId=xxxxx, ...
```
