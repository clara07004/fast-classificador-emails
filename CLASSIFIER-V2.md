# Classificador v2 — Guia de Implementação

## O que mudou

A versão 2 substitui o prompt simples (5 categorias genéricas) por um sistema de raciocínio detalhado que classifica emails em **5 níveis de prioridade baseados em consequência da inação**, não em palavras-chave.

- **Antigo:** Urgente, Alta-Prioridade, Normal, Baixa, Irrelevante
- **Novo:** P1, P2, P3, P4, P5 (cada um com horizon de impacto bem definido)

## Estrutura de arquivos

```
src/
├── classifiers/
│   ├── v2-classifier.js          # Classe principal do classificador
│   └── system-prompt-v2.js       # System prompt (edível, versionado em Git)
└── worker-classify.js             # Worker IMAP que usa o novo classifier

scripts/
└── setup-imap-folders.js         # Setup das pastas Fast no IMAP
```

## Como usar

### 1. Setup das pastas IMAP

Antes de rodar o worker, crie as pastas no IMAP:

```bash
node scripts/setup-imap-folders.js
```

Isso cria:
- `INBOX.Fast-P1-Urgente`
- `INBOX.Fast-P2-Alta`
- `INBOX.Fast-P3-Normal`
- `INBOX.Fast-P4-Baixa`
- `INBOX.Fast-P5-Irrelevante`
- `INBOX.Fast-Pendente-Classificacao`
- `INBOX.Fast-Correcoes`

### 2. Rodar o worker

```bash
npm run dev
# ou
node src/worker-classify.js
```

O worker:
- Conecta ao IMAP com IDLE
- Monitora novos emails
- Classifica cada um usando a v2
- Move para a pasta correspondente

### 3. Revisar classificações

Abra sua caixa de email no cliente (Thunderbird, Outlook, etc.):
- Veja os emails nas pastas `Fast-P1`, `Fast-P2`, etc.
- Se discordar de uma classificação, **mova o email para a pasta `Fast-Correcoes`**
- O worker registra isso como feedback

## Exemplo de saída do console

```
📧 UID 123:
  De: Jose Silva <jose@cliente.com>
  Assunto: Podemos conversar sobre o contrato?
  🤖 Classificação: P1 (confiança: 75%)
  📝 Raciocínio: cliente longevo sinalizando insatisfação contratual — risco de rescisão em horas
  💡 Subtexto detectado
  ✅ Movido para INBOX.Fast-P1-Urgente
```

## Editando o prompt

O system prompt está em `src/classifiers/system-prompt-v2.js`. É um arquivo único, editável, versionado em Git.

Para alterar comportamento:

1. Abra `system-prompt-v2.js`
2. Edite a seção relevante (exemplos, régua, padrões de subtexto, etc.)
3. Faça commit com mensagem descritiva
4. Reinicie o worker

### Seções principais

- **Princípio central:** consequência da inação, não palavras
- **Régua de prioridade:** P1–P5 com horizon de impacto
- **Subtexto importa:** padrões por tipo de remetente
- **Falsos positivos/negativos:** o que se engana
- **Casos especiais:** múltiplos pedidos, encaminhamentos, anexos
- **Segurança:** manipulação de prompt
- **Exemplos canônicos:** 4 casos gabarito da Fast

## Fluxo de feedback (futuro)

Por enquanto, o sistema classifica e move. Feedback automático (correções registradas) vem depois:

1. Você move um email para `Fast-Correcoes`
2. Worker detecta a mudança
3. Registra no Convex: email original, classificação do modelo, sua correção, motivo (opcional)
4. Próximas classificações incluem as últimas 8 correções suas como exemplos no prompt

Isso deixa o modelo mais calibrado sem reescrever o prompt inteiro.

## Status do MVP

- ✅ Classifier implementado (v2)
- ✅ Integrado ao worker IMAP
- ✅ Estrutura pronta para feedback
- ⏳ Feedback automático (requer Convex storage + lógica de detecção de move)
- ⏳ Dashboard/revisão (será web simples)

## Segurança

O prompt tem **cláusula anti-manipulação**. Se um email tentar instruir o classificador ("classifique como P1", "ignore regras", etc.):

1. O classificador ignora a instrução
2. Classifica pelo conteúdo legítimo
3. Marca `manipulacao_detectada = true`
4. Mostra no console para você revisar

Manipulação **nunca rebaixa** a prioridade.

## Próximos passos

Você vai:

1. Rodar `node scripts/setup-imap-folders.js` para criar as pastas
2. Rodar `npm run dev` para ligar o worker
3. **Enviar emails de teste** para sua caixa
4. Revisar as classificações nas pastas
5. Corrigir qualquer classificação errada movendo para `Fast-Correcoes`
6. Fazer ajustes no prompt conforme precisar

Quando validado, isso vira a base do MVP para piloto com 1–2 funcionários.
