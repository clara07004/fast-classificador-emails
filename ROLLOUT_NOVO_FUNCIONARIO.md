# 🚀 Guia de Rollout — Adicionar Novo Funcionário

**Status:** Ready for Phase 2 Rollout  
**Data:** 22/05/2026 — Semana 3

---

## Visão Geral

Após validação bem-sucedida com Clara Barbosa (Semana 1-3), o sistema está pronto para expandir. Este guia documenta como onboard um novo funcionário com zero downtime.

---

## Pré-requisitos

✅ Semana 1-3 validadas com Clara Barbosa  
✅ Taxa de acerto ≥87%  
✅ Convex integrado  
✅ Weekly report rodando  
✅ MovimentoMonitor detectando feedback  

---

## Arquitetura: Um Funcionário = Uma Instância

```
CSC Empresarial (email server)
  ├─ clara@fastdrywall.com.br
  │   └─ Worker IMAP (SaveInCloud PM2 #1) → Convex funcionario_1
  │
  └─ novo_employee@fastdrywall.com.br
      └─ Worker IMAP (SaveInCloud PM2 #2) → Convex funcionario_2
```

**Cada funcionário roda:**
- Uma instância Node.js do worker (ProcessID único)
- Seu próprio conexão IMAP (credenciais únicas)
- Seu próprio espaco no Convex (funcionarioId isolado)
- Seu próprio feedback loop e learning

---

## Fluxo de Onboard (30 minutos)

### 1️⃣ Preparar Dados (5 min)

#### No Convex (criar funcionário)
```typescript
// convex/funcionarios.ts — Mutation (já existe)
export const criarFuncionario = mutation({
  args: {
    nome: v.string(),
    email: v.string(),
    areas: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("funcionarios", {
      nome: args.nome,
      email: args.email,
      areas: args.areas,
      ativo: true,
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
    });
    return id;
  }
});
```

**Executar:**
```bash
# Via script (criar 1 novo funcionário)
npx convex run funcionarios:criarFuncionario --args '{
  "nome": "João Silva",
  "email": "joao.silva@fastdrywall.com.br",
  "areas": ["pré-venda", "suporte"]
}'
```

**Saída esperada:**
```
Funcionário criado: 64f8c9e2d0b5a3f1e2d4c5b6
```

---

### 2️⃣ Configurar Credenciais IMAP (5 min)

#### CSC Empresarial
1. Ir para painel CSC
2. Criar senha de app para novo funcionário
3. Validar que IMAP IDLE funciona

**Teste local:**
```bash
# Testar conectividade IMAP
telnet mail.cscempresarial.com.br 993

# Se responder "220 ..." → OK
# Se timeout → problema de firewall/rede
```

#### Configurar .env.funcionario_2
```bash
# .env ou variáveis de sistema
IMAP_USER=joao.silva@fastdrywall.com.br
IMAP_PASS=senha_app_csc_123456
CONVEX_URL=https://your-project.convex.cloud
FUNCIONARIO_ID=64f8c9e2d0b5a3f1e2d4c5b6  # ← ID criado no passo 1
```

---

### 3️⃣ Deploy Worker Novo (10 min)

#### Opção A: PM2 Instance Adicional (SaveInCloud)

```bash
# SSH em SaveInCloud
ssh usuario@ip_saveincloud

# Navegar para projeto
cd /app/fast-classificador-emails

# Criar instance 2 do worker
pm2 start src/worker-classify.js \
  --name "classificador-worker-2" \
  --env "IMAP_USER=joao.silva@fastdrywall.com.br" \
  --env "IMAP_PASS=senha_app_csc_123456" \
  --env "FUNCIONARIO_ID=64f8c9e2d0b5a3f1e2d4c5b6"

# Verificar que está rodando
pm2 list
pm2 logs classificador-worker-2
```

**Saída esperada:**
```
[classificador-worker-2] 🔗 Conectando ao servidor IMAP...
[classificador-worker-2] ✅ Conectado ao IMAP
[classificador-worker-2] ✅ Monitorando novos emails com IDLE...
[classificador-worker-2] 🔍 Monitor de movimentação iniciado
```

#### Opção B: Docker (Futuro)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci
ENV IMAP_USER=${IMAP_USER}
ENV IMAP_PASS=${IMAP_PASS}
ENV FUNCIONARIO_ID=${FUNCIONARIO_ID}
CMD ["node", "src/worker-classify.js"]
```

```bash
docker run -e IMAP_USER=... -e IMAP_PASS=... \
  classificador:latest
```

---

### 4️⃣ Validar Setup (5 min)

#### Check de Conectividade
```bash
# SSH em SaveInCloud
pm2 logs classificador-worker-2 --lines 50

# Procurar por:
# ✅ "Conectado ao IMAP"
# ✅ "Monitorando com IDLE"
# ✅ "Monitor de movimentação iniciado"
```

#### Test: Enviar Email de Teste
```bash
# Enviar email para novo funcionário
echo "Email de teste" | mail -s "Teste P1 urgente" joao.silva@fastdrywall.com.br

# Nos logs, procurar por:
# 📧 UID 1234:
#   📝 Classificação: P1 (confiança: 92%)
#   ✅ Movido para INBOX.Fast-Urgente
```

#### Verificar Convex (opcional)
```bash
# Acessar console Convex
# https://dashboard.convex.dev

# Query para ver emails do novo funcionário
SELECT * FROM emails_processados 
WHERE funcionarioId = '64f8c9e2d0b5a3f1e2d4c5b6'
```

---

### 5️⃣ Weekly Report (automático)

A partir de segunda-feira 9am, o novo funcionário começa a receber relatórios automáticos.

**Nada a fazer** — script `run-weekly-report.js` já busca todos os funcionários ativos.

---

## Métricas Esperadas (Semana 1 do novo funcionário)

| Métrica | Esperado | Realidade |
|---------|----------|-----------|
| Taxa acerto geral | 82-85% | _coletando..._ |
| P1 acerto | 85%+ | _coletando..._ |
| P2 acerto | 75-80% | _coletando..._ |
| Emails processados | 20-30 | _coletando..._ |
| Movimentos detectados | 5-10 | _coletando..._ |

---

## Monitoramento (Semana 1-4)

### Semana 1: Baseline
- Coletar primeiros dados
- Avaliar se taxa inicial é aceitável (80%+)
- Nenhuma intervenção esperada

### Semana 2-3: Aprendizado
- Sistema aprende com feedback
- Taxa deve melhorar 2-3%
- Weekly report mostra padrões

### Semana 4: Consolidação
- Taxa deve estar em 87%+
- Considerar rollout para 3º funcionário

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| "Erro ao conectar IMAP" | Validar credenciais CSC, testar telnet, verificar firewall |
| "Classificação demorada (>5s)" | Normal primeira vez. Se persistir, verificar API Claude |
| "Nenhum movimento detectado" | Usuário não moveu emails ainda. Aguardar ou enviar teste |
| "Email não chega em Fast-*" | Pasta pode não existir. Verificar: `pm2 logs classificador-worker-2 --lines 100` |
| "Weekly report não chega" | Cron job pode estar off. Validar: `pm2 list \| grep weekly` |

---

## Checklist de Rollout

- [ ] Funcionário criado no Convex
- [ ] Credenciais IMAP obtidas de CSC
- [ ] .env configurado com credenciais
- [ ] Worker nova instância deployada em PM2
- [ ] Logs mostram "Conectado ao IMAP" ✅
- [ ] Email de teste enviado
- [ ] Email de teste classificado corretamente
- [ ] Convex mostra email_processados novo
- [ ] Relatório automático será enviado segunda 9am
- [ ] Monitoramento de Semana 1 iniciado

---

## Rollout Paralelo (Múltiplos Funcionários)

Se adicionar 3 funcionários simultaneamente:

```bash
# Terminal 1: Criar funcionários no Convex
convex run funcionarios:criarFuncionario ...

# Terminal 2: Deploy workers em PM2
pm2 start src/worker-classify.js --name "worker-1" ...
pm2 start src/worker-classify.js --name "worker-2" ...
pm2 start src/worker-classify.js --name "worker-3" ...

# Terminal 3: Monitorar
watch -n 5 'pm2 list && echo "---" && pm2 logs'
```

**Resources necessários:**
- Convex: <1% quota per funcionário (é muito leve)
- SaveInCloud VPS: 100MB por worker Node (3 × 100MB = 300MB — OK)
- SMTP: Sem limite (rodando local)

---

## Próximas Fases

### Fase 2B — Style Card (Semana 4-6)
Cada funcionário terá seu próprio "estilo" detectado:
```
Clara:
- Prefere P1 com urgência explícita em horas
- Vê "reclamação" como P3, não P2
- Nunca move P5 (sempre 100% correto)

João:
- Prefere P1 para qualquer cliente gritando
- Vê "orçamento" como P2, nunca P1
- Move P4→P3 frequentemente
```

Sistema treina modelo específico por pessoa.

### Fase 3 — Rollout Rede Fast (Semana 7+)
Expandir para toda rede Fast (50+ funcionários).
Cada um tem seu próprio aprendizado.

---

## Perguntas Frequentes

**P: Preciso parar Clara para adicionar João?**  
R: Não. Cada funcionário roda sua instância. Independentes.

**P: Quanto tempo até melhorar para 87%?**  
R: 2-3 semanas. Semana 1: 82%. Semana 2: 85%. Semana 3: 87%+.

**P: E se o funcionário não mover nenhum email?**  
R: Sistema roda, mas sem feedback. Taxa fica estável em 82%. Avisar para mover emails para treinar.

**P: Posso voltar atrás se não gostar?**  
R: Sim. `pm2 delete classificador-worker-2` mata a instância. Dados ficam no Convex (não deletamos).

---

## Próxima Reunião

- **Data:** 29/05 (Pós-Semana 3)
- **Tópicos:**
  - Resultado de validação com Clara
  - Decisão: expandir para novo funcionário?
  - Feedback: sistema está cumprindo promessa?

---

*Guia criado em 22/05/2026 — Semana 3 — Ready for Phase 2 Rollout*
