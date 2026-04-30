# Project Brief — classificador-emails-fast

**Empresa:** Fast Sistemas Construtivos
**Data:** 2026-04-24
**Versão:** 3.0

---

## Problema

Funcionários perdem tempo com triagem manual de emails. Cada pessoa aplica critérios próprios, sem padrão, com risco real de emails urgentes de clientes serem ignorados ou respondidos com atraso.

## Objetivo

Classificar automaticamente cada email recebido em 5 níveis de prioridade, executar ações automáticas por nível e aprender com o comportamento individual do funcionário ao longo do tempo.

## Tipo de automação
Pipeline de dados + integração de sistemas + IA para classificação e geração de texto.

## Por que agora
Urgências de clientes passam despercebidas. Impacto direto na qualidade de atendimento. Sem automação, o problema escala à medida que o volume de emails cresce.

## Maior ganho esperado
1. Emails urgentes de clientes nunca ignorados
2. Redução de tempo em triagem manual

## Processo atual
Cada funcionário abre a caixa e decide manualmente o que ler e responder primeiro. Sem critério uniforme, sem registro, sem padrão de prioridade.

## Usuários finais
Funcionários não técnicos. A automação deve ser invisível — caixa de email continua igual, com mais organização e rascunhos prontos para revisão humana.

## Níveis de prioridade

| Nível | Label | Critério | Ações automáticas |
|---|---|---|---|
| 1 | Urgente | Impacto imediato, prazo hoje | Mover pasta + Rascunho |
| 2 | Alta Prioridade | Resposta em menos de 24h | Mover pasta + Rascunho |
| 3 | Normal | Rotina operacional | Mover pasta + Rascunho |
| 4 | Baixa | Informativo, sem ação obrigatória | Mover pasta + Rascunho |
| 5 | Irrelevante | Spam, newsletters, automáticos | Mover pasta (sem rascunho) |

## Rascunhos
Gerados para todos os níveis 1–4. No idioma do email recebido. Tom inicial: padrão corporativo Fast. Com o tempo, o sistema aprende o tom individual de cada funcionário via style card.

## Mecanismo de feedback e aprendizado
Três camadas — sem fine-tuning, tudo auditável:
1. **Perfil estruturado por funcionário** — mapa de remetentes, áreas de responsabilidade, padrões de assunto urgentes
2. **Regras determinísticas (pré-classificador)** — whitelist/blacklist, guard rails globais Fast
3. **Few-shot dinâmico via RAG** — correções do funcionário geram embeddings; os mais similares são injetados como exemplos no prompt

**Como o funcionário corrige a classificação:** movendo o email de uma pasta `Fast/*` para outra (ex.: de `Fast/Normal` para `Fast/Urgente`). O worker detecta o movimento via IMAP e registra a correção automaticamente. Sem canal externo, sem ação além de reorganizar a própria caixa.

## Restrições confirmadas
- Sem Microsoft / Office 365
- Sem envio automático de email
- Worker IMAP com reconexão automática
- Sem alertas push — funcionário verifica a caixa organizada por pastas
- Sem bots ou botões interativos em ferramentas de comunicação interna

## Riscos principais
- Email urgente mal classificado → mitigado por guard rails + auditoria mensal
- Falha da Claude API → retry + pasta `Fast/Pendente-Classificacao`; funcionário vê ao abrir a caixa
- LGPD — conteúdo de email enviado à API externa → avaliação jurídica antes do MVP

## Pendências externas
1. CSC Empresarial — IMAP IDLE estável?
2. CSC Empresarial — credenciais SMTP para notificação da reflexão mensal
3. Jurídico — LGPD + eventual DPA com Anthropic
4. Política de retenção de dados no Convex
