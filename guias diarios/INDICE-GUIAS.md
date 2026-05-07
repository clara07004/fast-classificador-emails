# Índice — Guias Diários do Classificador Fast

**Status geral do projeto:** MVP + Fase 2 — Implementação Completa  
**Data de criação dos guias:** 2026-05-07  
**Última atualização:** 2026-05-07

---

## 📋 Guias Disponíveis

### Fase 1 — MVP (4 dias)

| Dia | Arquivo | Objetivo | Status | Horas |
|-----|---------|----------|--------|-------|
| **1** | `GUIA-DIA-1.md` | Infraestrutura IMAP + Convex | ✅ Completo | 9h |
| **2** | `GUIA-DIA-2.md` | Normalizador + Pré-classificador | ✅ Completo | 8h |
| **3** | `GUIA-DIA-3.md` | **[VOCÊ ESTÁ AQUI]** Resolver bloqueadores + Teste E2E | 🔄 Novo | 4h |
| **4** | `GUIA-DIA-4.md` | Go-live piloto + Ajuste de prompts | ⏳ Próximo | 6h |

### Fase 2 — Aprendizado Individual (2 dias)

| Dia | Arquivo | Objetivo | Status | Horas |
|-----|---------|----------|--------|-------|
| **5** | `GUIA-DIA-5.md` | RAG de correções + Style Card | ⏳ Próximo | 8h |
| **6** | `GUIA-DIA-6.md` | Dashboard + Reflexão Mensal + Rollout | ⏳ Próximo | 8h |

### Fase 3 — Rollout (paralelo a Dia 6)

Documentado em `GUIA-DIA-6.md` — Preparação para múltiplos funcionários.

---

## 🎯 O QUE JÁ FOI FEITO (Dias 1–2)

### Infraestrutura ✅
- ✅ Projeto Convex criado com schema completo
- ✅ Worker no servidor SaveInCloud com PM2
- ✅ Conexão IMAP IDLE com reconexão automática
- ✅ 24h de teste de estabilidade IMAP

### Normalizador + Pré-classificador ✅
- ✅ Extração de metadados (remetente, assunto, idioma, thread, anexos)
- ✅ Remoção de HTML e assinatura
- ✅ Pré-classificador com whitelist/blacklist/guard rails
- ✅ 50+ emails testados manualmente

### Claude API + Rascunho ✅
- ✅ Chamada ao Haiku com fallback para Sonnet
- ✅ Mecanismo de confidence (< 0.7 → escalada)
- ✅ Retry com backoff exponencial
- ✅ Geração de rascunho em idioma do email
- ✅ IMAP APPEND de rascunho na pasta Drafts

### Ações + Feedback ✅
- ✅ Movimentação para pastas Fast/1–5
- ✅ Listener de MOVE entre pastas (detecta correção)
- ✅ Registro em Convex (emails_processados + correcoes)
- ✅ Health check com heartbeat

---

## ⏳ O QUE FALTA FAZER

### Dia 3 — HOJE (4–5 horas)
**Objetivo:** Resolver os 2 bloqueadores do MVP

1. **Criar pastas IMAP**
   - Opção A (manual): Criar `Fast/Urgente`, `Fast/Alta-Prioridade`, etc. no Outlook
   - Opção B (automática): Implementar criação automática no worker
   
2. **Configurar credenciais do funcionário piloto**
   - Obter email + senha de app do CSC Empresarial
   - Adicionar em `.env.local`
   - Recarregar worker
   
3. **Teste end-to-end**
   - Enviar email de teste
   - Verificar pipeline completo (classificação → pasta → rascunho)
   - Simular correção (MOVE entre pastas)
   - Validar registro no Convex
   
**Critério de saída:** Email de teste processado corretamente, feedback detectado, taxa de aceitação medida

---

### Dia 4 — Amanhã (4–6 horas)
**Objetivo:** Go-live piloto com emails reais

1. **Rodar piloto por 24–48h**
   - Deixar sistema processar emails reais
   - Você não faz nada, apenas observa
   - Corrigir emails errados (mover para pasta correta)
   
2. **Coletar dados**
   - Total de emails processados
   - Total de correções
   - Taxa de aceitação
   - Padrões de erro
   
3. **Ajustar prompts**
   - Identificar padrões mais frequentes
   - Adicionar whitelist (remetentes VIP)
   - Suavizar tom de rascunho se muito formal
   - Fazer novo commit no Git
   
4. **Segunda rodada (se necessário)**
   - Se taxa < 70%, rodar novamente
   - Validar que taxa subiu após ajustes
   
**Critério de saída:** Taxa de aceitação ≥ 70%, prompts ajustados

---

### Dia 5 — Dia 5 (6–8 horas)
**Objetivo:** Implementar aprendizado individual

1. **Few-shot RAG (parte 1 — 3–4 horas)**
   - Setup Voyage AI (gerar embeddings)
   - Backfill de embeddings para correções anteriores
   - Busca por similaridade coseno
   - Injetar exemplos similares no prompt de classificação
   
2. **Style Card (parte 2 — 2–3 horas)**
   - Extrair estilo do funcionário dos últimos emails enviados
   - Implementar rotina semanal de atualização
   - Injetar style card no prompt de rascunho
   - Validar que rascunhos refletem estilo pessoal
   
**Critério de saída:** Few-shot RAG ativo, style card criado, taxa ≥ 70% mantida

---

### Dia 6 — Último dia (6–8 horas)
**Objetivo:** Dashboard, reflexão mensal automática, preparação para rollout

1. **Dashboard de métricas (2–3 horas)**
   - Implementar queries de métrica no Convex
   - Criar painel web simples (HTML + fetch)
   - Expor via HTTP action
   
2. **Reflexão mensal automática (2–3 horas)**
   - Criar prompt de análise mensal
   - Implementar cron job (1º de cada mês)
   - Gerar sugestões (whitelist, guard rails, padrões urgentes)
   - Enviar email ao funcionário
   - Aplicar sugestões automaticamente
   
3. **Preparação para Rollout (2 horas)**
   - Remover hardcodes de credenciais
   - Criar script de onboarding de novo funcionário
   - Documentar processo de operação
   
**Critério de saída:** Dashboard funcionando, reflexão mensal agendada, pronto para múltiplos funcionários

---

## 📊 Resumo por Fase

| Fase | Dias | Tarefas | Status | Horas |
|------|------|---------|--------|-------|
| **MVP** | 1–4 | 23 | 🔄 70% (19/23) | 42h |
| **Aprendizado** | 5–6 | 13 | ⏳ 0% | 21h |
| **Rollout** | 6 | 3 | ⏳ 0% | 6h |
| **TOTAL** | 6 | 39 | 🔄 49% | 69h |

---

## 🚦 Como usar este índice

### Se você está começando agora (Dia 3)
1. Leia este arquivo (INDICE-GUIAS.md)
2. Abra `GUIA-DIA-3.md`
3. Siga as tarefas em ordem
4. Quando terminar Dia 3, avance para Dia 4

### Se está em qualquer dia intermediário
1. Abra o guia do dia atual
2. Verifique o "Status esperado" no topo
3. Se algo estiver bloqueado, volte para o dia anterior
4. Siga o checklist ao final

### Se quer entender o projeto todo
1. Leia PROJECT_BRIEF.md (problema + objetivo)
2. Leia PROCESS_MAP.md (antes → depois)
3. Leia SOLUTION_DESIGN.md (arquitetura)
4. Leia BACKLOG_PROJETO.md (todas as tarefas)
5. Leia IMPLEMENTATION_PLAN.md (detalhes técnicos)

---

## 🔗 Arquivos relacionados

- `PROJECT_BRIEF.md` — Contexto do projeto
- `PROCESS_MAP.md` — Fluxo atual vs. fluxo alvo
- `SOLUTION_DESIGN.md` — Arquitetura técnica
- `BACKLOG_PROJETO.md` — Todas as 46 tarefas
- `IMPLEMENTATION_PLAN.md` — Guia de implementação original
- `TASKS.md` — Lista simples de tarefas
- `dashboard-visual.html` — Mockup do dashboard
- `PRE-MORTEM.md` — Análise de riscos
- `SOLUCOES-RED-TEAM.md` — Respostas a preocupações técnicas
- `RED-TEAM-SUMMARY.md` — Resumo de riscos

---

## ⚡ Quick Reference — Comando principais

### Rodar o worker
```bash
npm start
# ou
pm2 start ecosystem.config.cjs
pm2 logs
```

### Acessar Convex
```bash
npx convex dev
# depois: https://dashboard.convex.dev
```

### Acessar caixa de email (teste IMAP)
```bash
npm install imap-simple
node scripts/test-imap.js
```

### Gerar embeddings (Voyage AI)
```bash
VOYAGE_API_KEY=... npm run backfill-embeddings
```

### Onboarding novo funcionário
```bash
node scripts/onboarding-funcionario.js
```

### Acessar dashboard
```
http://seu-servidor/dashboard
```

---

## 💬 Notas importantes

### Sobre prazos
- **Dia 3–4:** 1 semana (você testa, coleta dados, ajusta)
- **Dia 5–6:** 1 semana (implementa aprendizado + dashboard)
- **Total:** 2 semanas desde hoje até MVP completo + Fase 2

### Sobre credenciais
- **Bloqueador atual:** Credenciais do funcionário piloto não obtidas
- **Solução:** Solicitar ao TI credenciais de teste (email + senha de app CSC)
- **Alternativa:** Usar sua própria caixa para testar

### Sobre LGPD/Jurídico
- Não bloqueia MVP técnico, mas bloqueia go-live em produção
- Paralelo: pedir parecer jurídico sobre LGPD enquanto você testa

### Sobre taxa de aceitação
- **Meta:** ≥ 70%
- **Esperado:** Atingida em Dia 4 após ajustes de prompt
- **Validação:** Continue monitorando até Dia 6, não deve cair com RAG + Style Card

---

## ✅ Checklist final (após Dia 6)

- [ ] Dias 3–6 completados
- [ ] Taxa de aceitação ≥ 70% validada
- [ ] Dashboard mostrando métricas
- [ ] Reflexão mensal agendada e funcionando
- [ ] Script de onboarding testado
- [ ] Documentação de operação pronta
- [ ] Todos os commits feitos no Git
- [ ] Pronto para rollout gradual (2–3 funcionários)

**Quando tudo estiver pronto: [entrar em contato com TI + Jurídico para próximos passos]**

---

## 🎓 Aprendizados documentados

Cada guia inclui:
- ✅ Tarefas claras e verificáveis
- ✅ Código de exemplo (copiar-colar)
- ✅ Logs esperados (para validar sucesso)
- ✅ Troubleshooting (o que pode dar errado)
- ✅ Checklist de saída (quando passar para o dia seguinte)

**Recomendação:** Leia o guia do dia atual até o fim antes de começar.
