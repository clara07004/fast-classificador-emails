# Guia Dia 4 — Go-Live Piloto + Ajuste de Prompts

**Data:** 2026-05-08 (estimado)  
**Objetivo:** Rodar o sistema com emails reais durante 24–48h, coletar correções e ajustar prompts conforme padrões de erro.  
**Tempo estimado:** 4–6 horas (distribuído ao longo de 2 dias)  
**Critério de saída:** Taxa de aceitação ≥ 70% sem ajustes adicionais, OU ajuste de prompt concluído e nova rodada iniciada

---

## Status esperado

Você chegou aqui porque:
- ✅ Dia 1–3 passaram com sucesso
- ✅ Pipeline completo foi validado (email → classificação → pasta → rascunho → feedback)
- ✅ Pastas Fast/* existem e o worker conecta
- ⏳ Agora vamos testar com emails **reais** da caixa de um funcionário

---

## O que é o teste piloto?

Durante as próximas 24–48h:
1. O worker processa todos os emails recebidos (sem parar)
2. Você **não faz nada**: deixa os emails chegar, serem classificados, rascunhos gerados, pastas populadas
3. Você observa e **corrige manualmente** as classificações erradas (movendo para a pasta correta)
4. O sistema registra cada correção
5. No final do período, você analisa quais tipos de email foram mal classificados
6. Você ajusta o prompt com base nos padrões de erro
7. Novo ciclo começa

---

## Tarefa 1: Preparar o ambiente para piloto — 30 minutos

### 1.1 Limpar Convex de teste

Se você rodou testes no Dia 3, limpe os registros de teste para que o relatório final seja limpo:

```javascript
// Script: scripts/limpar-convex-teste.js
import { ConvexClient } from 'convex/browser';

const client = new ConvexClient(process.env.CONVEX_URL);

// Opção 1: Deletar todos os registros (completo reset)
// await client.mutation(api.admin.deletarTodosDados, {});

// Opção 2: Deletar apenas emails_processados e correcoes da data anterior a hoje
// (deixa seed data intacta)
const ontemMeiaNoite = new Date();
ontemMeiaNoite.setDate(ontemMeiaNoite.getDate() - 1);
ontemMeiaNoite.setHours(0, 0, 0, 0);

await client.mutation(api.admin.deletarRegistrosPorData, {
  dataCutoff: ontemMeiaNoite.toISOString(),
});

console.log('✓ Convex limpo. Pronto para piloto.');
```

**Se não tiver script pronto:** Use o painel do Convex (https://dashboard.convex.dev) para deletar manualmente os registros de teste.

### 1.2 Verificar que tudo está rodando

```bash
# Verifique que o worker está ativo
pm2 status
# Deve mostrar: online (green) para o processo ecosystem

# Verifique logs recentes
pm2 logs | head -20
# Deve mostrar: [IMAP] IDLE ativado. Aguardando novos emails...
```

### 1.3 Criar documento de observação

Crie um arquivo `OBSERVACOES-PILOTO-DIA-4.md` na raiz do projeto:

```markdown
# Observações do Piloto — Dia 4

**Período:** [data início] a [data fim]  
**Funcionário:** [email do piloto]  
**Total de emails recebidos:** [preenchido ao final]  
**Total de correções:** [preenchido ao final]  
**Taxa de aceitação:** [preenchido ao final]

## Emails mal classificados

| Assunto | Nível Previsto | Nível Correto | Categoria de Erro |
|---|---|---|---|
| | | | |

## Padrões identificados

- [Padrão 1]: [descrição e exemplos]
- [Padrão 2]: [descrição e exemplos]

## Ajustes de prompt propostos

- [Ajuste 1]: Modificar critério de "Urgente" para incluir [contexto]
- [Ajuste 2]: Adicionar whitelist para [tipo de remetente]

## Nota geral

[Observações qualitativas sobre acurácia, tempo de resposta, qualidade de rascunho, etc.]
```

---

## Tarefa 2: Rodar o piloto — 24–48h de observação

### 2.1 Deixar o worker rodar

**Não faça nada com o worker.** Deixe:
- ✅ Worker conectado ao IMAP
- ✅ Logs sendo gravados em `logs/worker.log` ou via `pm2 logs`
- ✅ Emails chegando e sendo processados automaticamente
- ✅ Rascunhos aparecendo em Drafts

### 2.2 Seu papel durante o piloto

Você vai:
1. **Receber emails normalmente** na sua caixa
2. **Observar a classificação** automática:
   - Email chegou em qual pasta Fast/*?
   - Faz sentido? Se não, é erro do sistema.
3. **Se estiver errado:** Move o email para a pasta correta
   - Exemplo: email chegou em `Fast/Baixa` mas deveria ser `Fast/Urgente`?
   - Você move manualmente de `Fast/Baixa` para `Fast/Urgente`
   - Sistema registra: `correcao(nivelOriginal=4, nivelCorrigido=1)`
4. **Se estiver certo:** deixa como está
5. **Se não tiver rascunho e deveria ter (níveis 1–4):** anote como erro
6. **Usar os rascunhos gerados:** se tiver tempo, revise e edite alguns dos rascunhos para validar qualidade

### 2.3 Coletando dados

Ao longo do piloto, preencha este formulário sempre que corrigir um email:

**Planilha: `CORRECOES-PILOTO-DIA-4.csv`**

```csv
timestamp,assunto_resumido,remetente,nivel_previsto,nivel_correto,categoria_erro,qualidade_rascunho
2026-05-08T09:15:00Z,Orçamento cliente X,vendas@cliente.com,3,1,falta contexto de urgência,bom
2026-05-08T10:22:00Z,Newsletter Construção,newsletter@site.com,5,5,correto,-
2026-05-08T11:45:00Z,Reunião com diretor,diretor@fast.com,3,2,underestimou importância,bom
```

**Categorias de erro:**
- `falta-contexto-urgencia`: Assunto urgente mas sem contexo de prazo
- `whitelist-necessaria`: Remetente importante (diretor, cliente VIP) foi classificado baixo
- `spam-nao-bloqueado`: Email claramente spam/newsletter foi classificado > 5
- `idioma-confundido`: Idioma detectado errado, prompt saiu ruim
- `anexo-nao-considerado`: Anexo importante (nota fiscal, boleto) não elevou prioridade
- `thread-ignorada`: Resposta a email urgente foi classificada baixo
- `correto`: Não era erro, foi classificado certo
- `qualidade-rascunho`: Rascunho errado, desconexo, tom inadequado

---

## Tarefa 3: Análise de dados — 1–2 horas

### 3.1 Coletar números

Ao final das 24–48h:

```bash
# Contar emails processados (query no Convex)
SELECT COUNT(*) FROM emails_processados 
WHERE processadoEm >= '2026-05-08T00:00:00Z' AND processadoEm < '2026-05-09T00:00:00Z'

# Contar correções (MOVE entre pastas)
SELECT COUNT(*) FROM correcoes 
WHERE registradoEm >= '2026-05-08T00:00:00Z' AND registradoEm < '2026-05-09T00:00:00Z'

# Taxa de aceitação (emails SEM correção)
(total_emails - total_correcoes) / total_emails * 100%
```

**Exemplo:**
- Total de emails: 47
- Total de correções: 12
- Taxa de aceitação: (47 - 12) / 47 = **74%** ✅

### 3.2 Categorizar os erros

Agrupe os erros por tipo:

```markdown
## Análise de Erros

**Total:** 12 correções de 47 emails (74% de aceitação)

### Por categoria
- Falta de contexto de urgência: 4 emails
- Whitelist necessária (remetentes importantes): 3 emails
- Qualidade de rascunho: 2 emails
- Thread ignorada: 2 emails
- Idioma confundido: 1 email

### Top 3 remetentes com mais erros
1. diretor@fast.com (2 erros) — sempre urgente, foi classificado Normal
2. vendas@cliente-vip.com (2 erros) — importante, foi classificado Baixa
3. suporte@fast.com (1 erro) — interna, contexto não bem capturado
```

### 3.3 Agrupar por padrão

Identifique **padrões**, não apenas casos individuais:

```markdown
## Padrões Identificados

### Padrão 1: Emails de diretor sempre vão para Normal
- Assunto menciona "alinhamento", "posicionamento", "reunião"
- Devem ser Urgente ou Alta-Prioridade (são executivos)
- **Solução:** Whitelist: diretor@fast.com → piso de prioridade 2

### Padrão 2: Emails de clientes VIP são subestimados
- Remetente: vendas@cliente-vip.com, compras@cliente-vip.com
- Mesmo assunto genérico ("Olá") é classificado Normal/Baixa
- Devem ser Urgente/Alta-Prioridade (clientes estratégicos)
- **Solução:** Whitelist por domínio: cliente-vip.com → piso de prioridade 2

### Padrão 3: Rascunhos com tom muito formal
- Alguns rascunhos acabam ultra-formais, afastados do estilo do funcionário
- Usuário acaba reescrevendo 80% do texto
- **Solução:** Suavizar tom em `prompts/rascunho.md`, adicionar exemplos de tom menos corporativo
```

---

## Tarefa 4: Ajustar prompts — 1–2 horas

### 4.1 Aplicar ajustes de whitelist/blacklist

**Arquivo:** `convex/seed.ts` (ou mutation para adicionar)

```javascript
// Adicionar whitelist (remetentes VIP que sempre devem subir prioridade)
await convex.mutation(api.whitelist.adicionar, {
  tipo: 'email',
  valor: 'diretor@fast.com',
  nivelMinimo: 2, // Sempre Alta-Prioridade no mínimo
  descricao: 'Diretor da empresa',
});

await convex.mutation(api.whitelist.adicionar, {
  tipo: 'dominio',
  valor: '@cliente-vip.com',
  nivelMinimo: 2,
  descricao: 'Cliente estratégico',
});

// Exemplo de blacklist (se necessário)
// await convex.mutation(api.blacklist.adicionar, {
//   tipo: 'dominio',
//   valor: '@newsletter-junk.com',
//   nivel: 5,
//   descricao: 'Newsletter não pedida',
// });
```

Depois: redeploy do worker ou recarregue o config.

### 4.2 Ajustar `prompts/classificacao.md`

Com base nos padrões encontrados, atualize a versão do prompt:

**Antes:**
```
Nível 1 (Urgente): 
- Impacto imediato (cliente aguardando resposta)
- Prazo hoje
- Palavras-chave: URGENTE, HOJE, EMERGÊNCIA
```

**Depois:**
```
Nível 1 (Urgente):
- Impacto imediato (cliente aguardando resposta, execução bloqueada)
- Prazo hoje ou em poucas horas
- Emails de executivos internos (diretor, C-level) sobre decisões em aberto
- Clientes estratégicos solicitando informação imediata
- Palavras-chave: URGENTE, HOJE, EMERGÊNCIA, DECISÃO PENDENTE, CLIENTE AGUARDANDO
- Exemplos: "Preciso de retorno até 17h para apresentar ao cliente", "Diretor precisa de posicionamento antes da reunião"
```

### 4.3 Ajustar `prompts/rascunho.md`

Se o feedback indicar rascunhos muito formais:

**Antes:**
```
Gere um rascunho de resposta ao email recebido. Mantenha tom corporativo, profissional e conciso.
Tom inicial: padrão corporativo Fast (formal, direto, sem excesso de emojis ou gírias).
```

**Depois:**
```
Gere um rascunho de resposta. Mantenha tom profissional mas acessível (não ultra-formal).
Evite: "Prezado senhor/a", clichês corporativos ("em atenção à sua solicitação"), parágrafos longos.
Prefira: saudação simples (Olá [nome]), resposta direta, uma ou duas frases curtas, fechamento simples (Obrigado/Abraço).
```

### 4.4 Fazer commit das mudanças

```bash
git add prompts/ convex/
git commit -m "fix: Ajustar prompts e whitelist baseado em piloto Dia 4

- Whitelist: diretor@fast.com e domínio cliente-vip.com para piso de prioridade
- Classificacao.md: adicionar contexto de urgência e exemplos de emails de executivos
- Rascunho.md: suavizar tom corporativo para evitar reescrita desnecessária

Taxa de aceitação piloto: 74%
Erros mais frequentes: falta de contexto urgência (4), whitelist (3)
"

git push origin main
```

---

## Tarefa 5: Segunda rodada do piloto — 24h

Se a taxa de aceitação ficou < 70% após ajustes, rode novamente:

1. Limpe novamente (ou deixe rodar em paralelo)
2. Deixe rodar 24h mais
3. Coletar números novamente
4. Verifique se taxa subiu

**Critério de parada:**
- ✅ Taxa aceitação ≥ 70% — Dia 4 concluído, avança para Dia 5
- ❌ Taxa ainda < 70% — Mais um ajuste necessário

---

## Checklist do Dia 4

- [ ] Ambiente limpo (dados de teste removidos)
- [ ] Worker rodando e conectado ao IMAP
- [ ] Piloto rodou por 24–48h com emails reais
- [ ] Correções foram coletadas (manual ou via CSV)
- [ ] Números calculados (total emails, total correções, taxa aceitação)
- [ ] Padrões de erro identificados (pelo menos 2–3)
- [ ] Ajustes de whitelist/prompt realizados
- [ ] Novo commit feito no Git
- [ ] Segunda rodada concluída (se necessário) ou meta de 70% atingida

---

## Critério de saída do Dia 4

✅ **Pipeline MVP completo e testado em condições reais**  
✅ **Taxa de aceitação ≥ 70% (classificação correta em 70%+ dos emails)**  
✅ **Prompts ajustados com base em padrões observados**  
✅ **Documentação de correções e ajustes finalizada**

Se tudo passou: **Dia 4 concluído** ✅  
Próximo: **Dia 5 — Fase 2 - RAG de correções e Style Card**

---

## Exemplo de relatório final do Dia 4

```
PILOTO DIA 4 — RELATÓRIO FINAL
=================================

Período: 2026-05-08 08:00 a 2026-05-09 17:00 (33h)
Funcionário piloto: clara.barbosa@fastdrywall.com.br

NÚMEROS
-------
Total de emails recebidos: 47
Total de correções: 12
Taxa de aceitação: 74.5% ✅

DISTRIBUIÇÃO POR NÍVEL
------
Nível 1 (Urgente): 8 emails, 1 correção (87.5% aceitação)
Nível 2 (Alta-Prioridade): 15 emails, 3 correções (80% aceitação)
Nível 3 (Normal): 18 emails, 6 correções (66.7% aceitação) ⚠
Nível 4 (Baixa): 4 emails, 1 correção (75% aceitação)
Nível 5 (Irrelevante): 2 emails, 0 correções (100% aceitação)

ERROS MAIS FREQUENTES
------
1. Falta de contexto de urgência (4 emails)
   - Exemplo: "Reunião com diretor" classificado como Normal em vez de Alta-Prioridade
   - Solução: Adicionar execução na whitelist e contexto no prompt

2. Whitelist necessária (3 emails)
   - Exemplo: diretor@fast.com com assunto genérico foi Normal
   - Solução: Criar whitelist por remetente com piso de prioridade

3. Qualidade de rascunho (2 emails)
   - Rascunhos muito formais, usuário reescreveu tudo
   - Solução: Suavizar tom em prompts/rascunho.md

AJUSTES REALIZADOS
------
✅ Whitelist: diretor@fast.com → piso 2 (Alta-Prioridade)
✅ Whitelist: @cliente-vip.com → piso 2
✅ Prompt classificacao.md: adicionar contexto de urgência + exemplos
✅ Prompt rascunho.md: suavizar tom corporativo
✅ Commit: fix: Ajustar prompts e whitelist baseado em piloto Dia 4

PRÓXIMOS PASSOS
------
→ Dia 5: Implementar RAG de correções (fase 2)
→ Fase 2: Extrair style card do funcionário para personalizar rascunhos
→ Fase 2: Monitorar se taxa de aceitação continua > 70% com novas mudanças
```
