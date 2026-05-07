# Status Atual — Resumido e Prático

**Data:** 2026-05-07  
**Responsável:** Clara Barbosa  
**Status geral:** MVP ~80% implementado, testando

---

## 📊 Em um parágrafo

Você já implementou 22 das 23 tarefas do MVP (Dia 1–2). O código está pronto, faltam apenas 2 bloqueadores simples para você testar: **criar as 6 pastas no Outlook** e **obter credenciais do funcionário piloto**. Depois disso, roda um teste E2E rápido (Dia 3), faz um piloto com emails reais para calibrar o prompt (Dia 4), e por fim implementa aprendizado individual com RAG + style card (Dia 5–6). Total: 6 dias de trabalho, esperado atingir MVP completo com ≥ 70% de acurácia.

---

## ✅ O QUE JÁ ESTÁ PRONTO

| Item | Feito? | Arquivo |
|------|--------|---------|
| Conexão IMAP IDLE | ✅ | `src/imap/worker.js` |
| Normalizador de email | ✅ | `src/imap/envelope.js` |
| Pré-classificador (whitelist/blacklist) | ✅ | `src/imap/pre-classificador.js` |
| Chamada Claude API | ✅ | `src/imap/classificador.js` |
| Geração de rascunho | ✅ | (função em classificador.js) |
| IMAP APPEND de rascunho | ✅ | (função em worker.js) |
| Movimentação para pastas Fast/* | ✅ | `src/imap/pastas.js` |
| Listener de MOVE (feedback) | ✅ | (função em worker.js) |
| Registro em Convex | ✅ | `src/convex/cliente.js` |
| Health check | ✅ | (função em worker.js) |

---

## ❌ BLOQUEADORES ATUAIS

| Bloqueador | O que fazer | Tempo |
|---|---|---|
| **Pastas não existem** | Criar 6 pastas no Outlook (ou implementar auto-criação) | 30 min |
| **Sem credenciais** | Pedir ao TI: email + senha de app CSC Empresarial | 1 dia |

**Sem resolver estes 2, não consegue testar nada.**

---

## 🗓️ PRÓXIMOS 6 DIAS

| Dia | Foco | O que fazer | Horas | Guia |
|-----|------|-----------|-------|------|
| **3** | Teste E2E | Criar pastas + configurar credenciais + teste de pipeline | 4h | [GUIA-DIA-3.md](guias%20diarios/GUIA-DIA-3.md) |
| **4** | Piloto real | Rodar 24–48h com emails reais, ajustar prompt | 6h | [GUIA-DIA-4.md](guias%20diarios/GUIA-DIA-4.md) |
| **5** | Aprendizado | RAG + style card | 8h | [GUIA-DIA-5.md](guias%20diarios/GUIA-DIA-5.md) |
| **6** | Dashboard + Rollout | Dashboard, reflexão mensal, prep para múltiplos funcionários | 8h | [GUIA-DIA-6.md](guias%20diarios/GUIA-DIA-6.md) |

**Total esperado:** 26 horas de trabalho (≈ 4–5 dias de tempo cronológico, considerando que Dia 4 roda em paralelo)

---

## 🎯 TAREFAS IMEDIATAS (Dia 3)

### Tarefa 1: Criar pastas IMAP — 30 min
```
Outlook → Criar 6 pastas:
  ✓ Fast/Urgente
  ✓ Fast/Alta-Prioridade
  ✓ Fast/Normal
  ✓ Fast/Baixa
  ✓ Fast/Irrelevante
  ✓ Fast/Pendente-Classificacao
```

### Tarefa 2: Configurar credenciais — 15 min
```
.env.local:
  IMAP_USER=seu-email@fastdrywall.com.br
  IMAP_PASS=sua-senha-app-csc
  (Demais campos já estão configurados)
```

### Tarefa 3: Teste E2E — 2–3h
```
1. Rodar worker: npm start
2. Enviar email de teste para si mesmo
3. Verificar:
   ✓ Email foi detectado
   ✓ Foi classificado corretamente
   ✓ Rascunho foi gerado
   ✓ Foi movido para pasta correta
   ✓ MOVE para outra pasta foi detectado
   ✓ Tudo foi registrado no Convex
```

---

## 📈 MÉTRICAS-CHAVE PARA ACOMPANHAR

| Métrica | Esperado | Validação |
|---------|----------|-----------|
| Taxa de aceitação | ≥ 70% | Ao final do Dia 4 |
| Tempo até leitura (Urgentes) | < 5 min | Monitorar Dia 4+ |
| Qualidade de rascunho | > 50% aceitos sem edição | Feedback Dia 4 |
| Taxa de fallback | < 5% | Ao final do Dia 4 |
| Estabilidade IMAP | 100% uptime | Monitorar Dia 3–6 |

---

## 🛠️ FERRAMENTAS / ACESSO NECESSÁRIO

| Ferramenta | O que é | Onde |
|---|---|---|
| **Convex** | Banco de dados | https://dashboard.convex.dev |
| **Claude API** | IA para classificação | Já configurado |
| **Voyage AI** | Embeddings (Dia 5) | Criar conta em voyageai.com |
| **CSC Empresarial** | IMAP/SMTP | mail.cscempresarial.com.br:993 |
| **PM2** | Gestor de processos | Rodando no servidor |
| **SaveInCloud** | Servidor (VPS) | Acessar via SSH |

---

## 📋 CHECKLIST ANTES DE COMEÇAR DIA 3

- [ ] Leu GUIA-DIA-3.md por completo
- [ ] Tem acesso ao Outlook (web ou desktop)
- [ ] Tem acesso ao .env.local para atualizar credenciais
- [ ] Tem acesso ao servidor SaveInCloud (SSH) para ver logs
- [ ] Tem acesso ao dashboard Convex
- [ ] PM2 está rodando no servidor (pm2 status mostra worker online)

---

## ⚠️ RISCOS PRINCIPAIS

| Risco | Probabilidade | Impacto | Mitigação |
|------|---|---|---|
| Pasta não foi criada corretamente | Média | Bloqueador | Instruções no Dia 3 para criar manualmente + auto-criação |
| Credenciais expiram | Baixa | Bloqueador | Usar password manager, rotar regularmente |
| LGPD bloqueia produção | Média | Não bloqueia MVP, bloqueia produção | Solicitar parecer jurídico em paralelo |
| Taxa de aceitação < 70% | Média | Requer mais ajustes | Planejar 1–2 ciclos extras de calibração |
| Voyage AI rate limit | Baixa | Atrasa embeddings | Usar tier pago ou fazer backfill em fora de pico |

---

## 🎓 DOCUMENTAÇÃO PRINCIPAL

1. **PROJECT_BRIEF.md** — Contexto e objetivo geral
2. **PROCESS_MAP.md** — Fluxo antes vs depois
3. **SOLUTION_DESIGN.md** — Arquitetura técnica completa
4. **BACKLOG_PROJETO.md** — Todas as 46 tarefas (você está em ~50%)
5. **GUIAS DIÁRIOS** — Instruções passo-a-passo (Dia 3–6)

---

## 💬 CONTATOS / BLOQUEADORES EXTERNOS

| Bloqueador | Contatar | Urgência |
|---|---|---|
| Credenciais CSC Empresarial | TI | 🔴 HOJE |
| Parecer LGPD | Jurídico | 🟡 Próxima semana |
| Política retenção dados Convex | TI + Jurídico | 🟡 Próxima semana |
| DPA com Anthropic | Jurídico | 🟡 Se exigido |

---

## 🚀 COMO COMEÇAR

```
1. Abra guias diarios/GUIA-DIA-3.md
2. Siga as 4 tarefas em ordem
3. Quando terminar, abra GUIA-DIA-4.md
4. Repita até Dia 6
5. Pronto para rollout!
```

**Tempo total esperado:** 26 horas de trabalho prático  
**Tempo cronológico:** 2 semanas (considerando dias 4–5 rodam em paralelo)  
**Data esperada de conclusão:** ~2026-05-20

---

## ✨ Sucesso = quando...

- ✅ Email recebido → classificado corretamente → pasta correta → rascunho gerado
- ✅ Feedback (MOVE) → registrado em Convex
- ✅ Taxa de aceitação ≥ 70% validada em condições reais
- ✅ Dashboard mostrando métricas
- ✅ Sistema rodando 24h sem falhas
- ✅ Pronto para expandir para 2–3 mais funcionários

**Quando tudo estiver ✅ acima, você pode comemorar e começar a pensar em rollout gradual.**

---

## 📞 Próximo passo

👉 **Leia GUIA-DIA-3.md** e comece pelas tarefas imediatas (pastas + credenciais).

Se tiver dúvida em qualquer passo, os guias têm seção de **Troubleshooting** com soluções.

Boa sorte! 🚀
