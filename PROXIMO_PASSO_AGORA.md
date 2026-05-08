# 🎯 Próximo Passo — Plano de Ação Imediato

**Status Atual:** 22/05/2026 — Semanas 1-3 COMPLETAS  
**Próximo Milestone:** 29/05/2026 — Semana 4 (Integração Convex + Testes)

---

## 📊 O Que Está Pronto

✅ **Sistema Completo Implementado**
- MovimentoMonitor → detecta feedback IMAP
- LearningBlock → injeta aprendizado histórico
- WeeklyFeedbackReport → relatórios automáticos
- ValidationDashboard → métricas em tempo real
- FeedbackSystemSetup → orquestra tudo
- ROLLOUT_NOVO_FUNCIONARIO.md → guia completo

✅ **Documentação Completa**
- RELATORIO_SEMANA1/2/3.md → detalhado
- CONFIGURACAO_WEEKLY_REPORT.md → setup cron
- ROLLOUT_NOVO_FUNCIONARIO.md → onboard novo funcionário

✅ **Validação**
- Toda sintaxe JavaScript OK
- Todas as classes prontas para usar
- Templates documentados

---

## ❌ O Que NÃO Está Feito

⏳ **Integração Convex 100%**
- Código tem placeholders `// TODO:`
- Convex client inicializado mas não conectado às chamadas reais
- 3 pontos precisam descomentados

⏳ **Testes End-to-End**
- Sem dados reais ainda
- Métricas ainda não validadas
- Movimentos não detectados em produção

⏳ **Rollout Novo Funcionário**
- Não há segundo funcionário rodando ainda
- Não há comparação entre dois estilos

---

## 🚀 Próximo Passo: Semana 4 — Integração Convex 100%

### Fase 1: Descomentar 3 Linhas (15 min)

**1. Em `src/imap/movimento-monitor.js` — Linha ~180**

Antes:
```javascript
async registrarMovimento(movimento) {
  try {
    // TODO: Implementar mutation Convex quando schema existir
    log.debug(...);
    // Aqui será chamado:
    // await this.convex.mutation(api.emails.registrarMovimento, movimento);
```

Depois:
```javascript
async registrarMovimento(movimento) {
  try {
    if (!this.convex) {
      log.warn('Convex não disponível para registrar movimento');
      return;
    }

    await this.convex.mutation(api.emails.registrarMovimento, movimento);
    
    log.info(
      { uid: movimento.uid, from: movimento.from_folder, to: movimento.to_folder },
      '📝 Movimento registrado em Convex'
    );
```

**2. Em `src/feedback/learning-block.js` — Linha ~40**

Antes:
```javascript
async buscarCorrecoesRecentes(funcionarioId) {
  try {
    if (!this.convex) {
      log.debug('Convex client não disponível, retornando correções vazias');
      return [];
    }

    // TODO: Implementar query no Convex
    // const movimentos = await this.convex.query(
    //   api.emails.buscarMovimentosPorFuncionario,
    //   { funcionarioId, limite: MAX_RECENT_CORRECTIONS }
    // );
```

Depois:
```javascript
async buscarCorrecoesRecentes(funcionarioId) {
  try {
    if (!this.convex) {
      log.debug('Convex client não disponível');
      return [];
    }

    const movimentos = await this.convex.query(
      api.emails.buscarMovimentosPorFuncionario,
      { funcionarioId, limite: MAX_RECENT_CORRECTIONS }
    );

    log.debug({ funcionarioId, quantidade: movimentos.length }, 'Correções buscadas');
    return movimentos;
```

**3. Em `src/reports/weekly-feedback-report.js` — Linha ~25**

Antes:
```javascript
async buscarMovimentosDaSemana(funcionarioId, dataInicio, dataFim) {
  try {
    if (!this.convex) {
      log.warn('Convex não disponível');
      return [];
    }

    // TODO: Chamar buscarMovimentosPorPeriodo quando Convex estiver integrado
    // const movimentos = await this.convex.query(
    //   api.emails.buscarMovimentosPorPeriodo,
    //   { funcionarioId, dataInicio, dataFim }
    // );
```

Depois:
```javascript
async buscarMovimentosDaSemana(funcionarioId, dataInicio, dataFim) {
  try {
    if (!this.convex) {
      log.warn('Convex não disponível para buscar movimentos');
      return [];
    }

    const movimentos = await this.convex.query(
      api.emails.buscarMovimentosPorPeriodo,
      { funcionarioId, dataInicio, dataFim }
    );

    log.debug({ funcionarioId, quantidade: movimentos.length }, 'Movimentos buscados');
    return movimentos;
```

---

### Fase 2: Testes Básicos (30 min)

**Passo 1: Verificar que Convex está respondendo**
```bash
# Abrir console Convex
# https://dashboard.convex.dev

# Rodar query teste:
SELECT COUNT(*) FROM email_movements

# Resultado esperado: 0 (tabela vazia, mas acessível)
```

**Passo 2: Testar integração local**
```bash
# Executar script de validação
node scripts/check-validation.js

# Output esperado:
# 📊 DASHBOARD DE VALIDAÇÃO — SEMANA 3
# Emails processados: 0 (sem dados ainda)
# Exit code: 0 (sucesso da validação estrutural)
```

**Passo 3: Deploy teste em SaveInCloud (opcional)**
```bash
# SSH em SaveInCloud
ssh user@ip

# Criar instance teste com Convex integrado
pm2 start src/worker-classify-v2-integrated.js \
  --name "test-feedback-integration"

# Monitorar logs
pm2 logs test-feedback-integration

# Procurar por:
# ✅ "Convex client conectado"
# ✅ "MovimentoMonitor inicializado com Convex"
# ✅ "LearningBlock inicializado com Convex"
```

---

### Fase 3: Testes End-to-End (1-2 horas)

**Passo 1: Enviar Email de Teste**
```bash
# Enviar para Clara Barbosa
echo "Email de teste P1 urgente" | mail -s "URGENTE: problema obra" clara.barbosa@fastdrywall.com.br

# Monitor no SaveInCloud:
# 📧 UID 12345:
#   De: seu_email@example.com
#   Assunto: URGENTE: problema obra
#   🤖 Classificação: P1 (confiança: 92%)
#   📝 Raciocínio: Palavra "URGENTE" + obra parada
#   ✅ Movido para INBOX.Fast-Urgente
```

**Passo 2: Usuário Move Email**
```bash
# Clara move email de Fast-Urgente para Fast-Normal
# (simular que ela discordou: era P2, não P1)

# Monitor deve detectar:
# 📊 Movimento detectado:
#    UID: 12345
#    FROM: INBOX.Fast-Urgente
#    TO: INBOX.Fast-Normal
#    📝 Movimento registrado em Convex
```

**Passo 3: Validar Convex**
```bash
# Console Convex:
SELECT * FROM email_movements WHERE uid = 12345

# Resultado esperado:
# {
#   uid: 12345,
#   subject: "URGENTE: problema obra",
#   classified_as: "P1",
#   user_moved_to: "INBOX.Fast-Normal",
#   is_correct: false,
#   expected_priority: "P2"
# }
```

**Passo 4: Testar Learning (próxima classificação)**
```bash
# Enviar email similar
echo "Problema na obra 2" | mail -s "Problema em construção" clara.barbosa@fastdrywall.com.br

# Monitor deve mostrar:
# 🧠 Injetado aprendizado (1 correção):
#    Caso anterior: "URGENTE..." foi P1 → você mudou para P2
#
# 🤖 Classificação: P2 (confiança: 85%)
#    (melhor do que P1 anterior!)
```

**Passo 5: Weekly Report (segunda 9am)**
```bash
# Executar manualmente
node scripts/run-weekly-report.js

# Output esperado:
# 📊 Gerando relatório para período 15/05 a 22/05
# 👤 Clara Barbosa (clara.barbosa@fastdrywall.com.br)
#    📧 Relatório enviado com sucesso

# Email deve chegar com:
# - 2 emails processados
# - Taxa acerto: 50% (acertou P2, errou P1)
# - 1 falso positivo (P1 → P2)
```

---

## 📋 Checklist de Execução

- [ ] **Fase 1: Descomentar Linhas**
  - [ ] movimento-monitor.js linha ~180
  - [ ] learning-block.js linha ~40
  - [ ] weekly-feedback-report.js linha ~25
  - [ ] Validar sintaxe: `node --check src/*.js`

- [ ] **Fase 2: Testes Básicos**
  - [ ] Verificar Convex console
  - [ ] Rodar `node scripts/check-validation.js`
  - [ ] Deploy teste (opcional)

- [ ] **Fase 3: End-to-End**
  - [ ] Enviar email de teste
  - [ ] Usuário move email (simular feedback)
  - [ ] Validar Convex recebeu movimento
  - [ ] Testar learning em próxima classificação
  - [ ] Testar weekly report

- [ ] **Finalização**
  - [ ] Commit de integração Convex
  - [ ] Documentar resultados dos testes
  - [ ] Preparar para rollout novo funcionário

---

## ⏱️ Timeline Estimado

| Fase | Tempo | Bloqueia? |
|------|-------|-----------|
| Descomentar linhas | 15 min | Não |
| Testes básicos | 30 min | Não |
| Testes end-to-end | 1-2h | Não |
| **Total** | **2-2.5h** | **Não** |

---

## 🎯 Sucesso = O Que Validar

✅ Convex recebe `email_movements` quando usuário move  
✅ LearningBlock busca correções do Convex  
✅ ClassifierV2 recebe exemplos históricos  
✅ Weekly report mostra dados reais  
✅ ValidationDashboard calcula métricas corretas  

---

## 📍 Depois Disso: Semana 4 Completa

Após Fase 1-3 passarem:

1. **Rollout Novo Funcionário**
   - Seguir `ROLLOUT_NOVO_FUNCIONARIO.md`
   - Deploy João Silva em paralelo com Clara
   - Monitorar Semana 1-4 de João

2. **Consolidação**
   - Comparar: Clara vs João (estilos diferentes?)
   - Ajustar thresholds se necessário
   - Preparar Fase 2B (Style Card)

3. **Roadmap Futuro**
   - Fase 2B: Detectar padrões individuais
   - Fase 3: Rollout rede Fast (50+)

---

## 💡 Dicas Importantes

**Não faça:**
- ❌ Deletar dados do Convex (são valiosos para aprendizado)
- ❌ Mudar estrutura de `email_movements` sem backup
- ❌ Rodar múltiplas instâncias com mesmo `FUNCIONARIO_ID`

**Faça:**
- ✅ Manter logs salvos para auditar
- ✅ Testar em dev/test antes de prod
- ✅ Backup de dados Convex antes de mudanças

---

## 📞 Se Algo Quebrar

**"Convex connection timeout"**
- Verificar `CONVEX_URL` em .env
- Testar conectividade: `curl $CONVEX_URL`
- Validar credenciais

**"Mutation não encontrada"**
- Verificar que `api.emails.registrarMovimento` existe em `convex/emails.ts`
- Regenerar tipos: `npx convex codegen`

**"Nenhum movimento registrado"**
- Verificar logs do movimento-monitor: `pm2 logs`
- Validar que usuário realmente moveu (não é automático)
- Testar com manual move

---

## ✨ Conclusão

**Próximo Passo:** Descomente 3 linhas + testes = Convex 100% integrado

**Tempo Total:** 2-2.5 horas para validação completa

**Após isso:** Pronto para rollout novo funcionário

---

*Plano criado em 22/05/2026 — Ready for Semana 4*
