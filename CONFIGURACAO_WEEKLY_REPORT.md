# 📧 Configuração — Weekly Report Automático

## Objetivo
Executar `scripts/run-weekly-report.js` toda **segunda-feira às 9:00 AM** para gerar e enviar relatório semanal para cada funcionário.

---

## Pré-requisitos

- ✅ SMTP configurado (CSC Empresarial)
- ✅ Node.js instalado no VPS (SaveInCloud)
- ✅ Variáveis de ambiente:
  ```bash
  CONVEX_URL=https://your-project.convex.cloud
  SMTP_HOST=mail.cscempresarial.com.br
  SMTP_PORT=587
  SMTP_USER=seu_email@fastdrywall.com.br
  SMTP_PASS=sua_senha_app
  SMTP_FROM=noreply@fastdrywall.com.br
  TEST_EMAIL=clara.barbosa@fastdrywall.com.br (opcional, para testes)
  ```

---

## Opção A: PM2 + Cron (Recomendado)

Se o worker já roda com PM2, adicionar job scheduler:

```bash
# 1. Instalar pm2-auto-pull (agora suporta cron)
pm2 install pm2-auto-pull

# 2. Criar tarefa cron (segunda 9am)
pm2 start "node scripts/run-weekly-report.js" \
  --cron "0 9 * * 1" \
  --name "weekly-report"

# 3. Salvar configuração
pm2 save
```

**Validar:**
```bash
pm2 list  # Deve mostrar "weekly-report" com próxima execução
pm2 logs weekly-report  # Ver logs da última execução
```

---

## Opção B: Crontab (Linux/Mac)

Se rodar em servidor Linux:

```bash
# 1. Editar crontab
crontab -e

# 2. Adicionar linha (segunda 9am):
0 9 * * 1 cd /path/to/fast-classificador-emails && node scripts/run-weekly-report.js >> logs/weekly-report.log 2>&1

# 3. Validar
crontab -l  # Deve listar a linha acima
```

---

## Opção C: Tarefa Agendada Windows (se VPS for Windows)

```powershell
# PowerShell (como Admin)

$trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -DaysOfWeek Monday `
  -At "09:00:00"

$action = New-ScheduledTaskAction `
  -Execute "node.exe" `
  -Argument "C:\path\to\scripts\run-weekly-report.js"

Register-ScheduledTask `
  -TaskName "weekly-report-email" `
  -Trigger $trigger `
  -Action $action `
  -RunLevel Highest
```

---

## Opção D: Cloud Scheduler (SaveInCloud/Remote Agent)

Se usar agent remoto agendado (Convex/Anthropic):

```typescript
// convex/schedule.ts (quando existir)
export const agendaRelatorioSemanal = cronJob({
  schedule: "0 9 * * 1", // Segunda 9am
  handler: async (ctx) => {
    // Chamar mutation que executa o relatório
    await ctx.runMutation(api.relatorios.gerarSemanal);
  }
});
```

---

## Testes Locais

### Executar manualmente (qualquer dia/hora)
```bash
node scripts/run-weekly-report.js
```

**Saída esperada:**
```
📊 Iniciando geração de relatórios semanais...

👤 Clara Barbosa (Test) (clara.barbosa@fastdrywall.com.br)
   ✅ Relatório enviado

✅ Relatórios semanais completos!
```

### Validar email de teste
1. Verificar inbox do `TEST_EMAIL` configurado
2. Procurar por assunto: "📊 Relatório Semanal de Classificação"
3. Validar tabelas, estatísticas e padrões

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| "CONVEX_URL não configurada" | Verificar `.env` — CONVEX_URL deve estar preenchida |
| "Erro ao enviar email" | Validar SMTP_* em `.env` (credenciais, porta 587) |
| Cron não executa | Verificar logs: `pm2 logs weekly-report` ou `tail /var/log/cron` |
| Email recebido vazio | Provisório — Convex queries ainda estão em placeholder |

---

## Fluxo de Dados

```
cron (seg 9am)
  ↓
run-weekly-report.js
  ↓
WeeklyFeedbackReport.executarRelatorioCompleto()
  ↓
buscarMovimentosDaSemana() → Convex
  ↓
gerarEstatisticas()
  ↓
gerarHTML() → email template
  ↓
nodemailer.sendMail() → SMTP → funcionário
```

---

## Próximas Melhorias (Fase 2B)

- [ ] Integrar com Convex para buscar funcionários reais
- [ ] Adicionar gráficos (canvas/chart.js)
- [ ] Detectar padrões automáticos ("você diz P1 90% do tempo")
- [ ] Recomendações ("considere ajustar threshold em P2")
- [ ] Histórico — comparar com semanas anteriores

---

## Referência: Variáveis de Ambiente

```bash
# .env (adicionar estas linhas)
CONVEX_URL=https://...convex.cloud
SMTP_HOST=mail.cscempresarial.com.br
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@fastdrywall.com.br
SMTP_PASS=senha_app_csc
SMTP_FROM=noreply@fastdrywall.com.br
TEST_EMAIL=clara.barbosa@fastdrywall.com.br
```

---

*Documentação criada em 15/05/2026 — Semana 2, Learning Block + Weekly Report*
