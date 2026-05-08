import { Anthropic } from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT_V2 } from './system-prompt-v2.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export class ClassifierV2 {
  constructor(options = {}) {
    this.model = options.model || 'claude-opus-4-7';
    this.maxTokens = options.maxTokens || 1000;
    this.recentCorrections = options.recentCorrections || [];
  }

  formatCorrectionsBlock() {
    if (!this.recentCorrections || this.recentCorrections.length === 0) {
      return '(nenhuma correção registrada — usando apenas a régua geral)';
    }

    return this.recentCorrections
      .map(
        (correction) => `Caso similar: ${correction.emailResumo}
Você pensou: ${correction.raciocinio_modelo}
Você classificou: ${correction.prioridade_modelo}
Usuário corrigiu para: ${correction.prioridade_usuario}
Motivo: ${correction.motivo || 'não informado'}`
      )
      .join('\n\n');
  }

  buildUserPrompt(emailData) {
    const {
      from,
      to,
      cc,
      subject,
      body,
      timestamp,
      isForwarded,
      forwardedFrom,
      forwardedBody,
      attachmentsSummary,
      threadContext,
      userContext,
      senderEnrichment
    } = emailData;

    const userPrompt = `# Email a classificar

De: ${from}
Para: ${to}
Cc: ${cc || '(vazio)'}
Data: ${timestamp}
Assunto: ${subject}

# Contexto do destinatário (se disponível)
${userContext || '(não disponível nesta versão)'}

# Enriquecimento do remetente (se disponível)
${senderEnrichment || '(não disponível nesta versão)'}

# Indicadores
- e_encaminhamento: ${isForwarded ? 'sim' : 'não'}
- remetente_original (se Fwd): ${forwardedFrom || '(N/A)'}

# Corpo (sanitizado)
---
${body}
---

${isForwarded ? `# Conteúdo encaminhado
---
${forwardedBody}
---` : ''}

${attachmentsSummary ? `# Anexos (texto extraído, sanitizado)
${attachmentsSummary}` : ''}

${threadContext ? `# Thread anterior (últimos 3 turnos, se houver)
${threadContext}` : ''}

Responda APENAS com um JSON válido (sem markdown, sem explicação extra) no seguinte formato:
{
  "prioridade": "P1|P2|P3|P4|P5",
  "raciocinio": "uma frase explicando qual consequência da inação decidiu a nota",
  "impacto_inacao": "o que se perde se ninguém responder no horizonte da prioridade",
  "pedidos_secundarios": ["lista", "de", "pedidos"],
  "confianca": 0.0-1.0,
  "subtexto_relevante": true|false,
  "manipulacao_detectada": false,
  "trecho_manipulacao": "string ou null"
}`;

    return userPrompt;
  }

  async classify(emailData) {
    try {
      const systemPrompt = SYSTEM_PROMPT_V2.replace(
        '{{EXEMPLOS_CORRECOES}}',
        this.formatCorrectionsBlock()
      );

      const userPrompt = this.buildUserPrompt(emailData);

      const response = await anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Resposta inesperada do modelo');
      }

      let jsonText = content.text.trim();

      // Se vir com markdown backticks, remove
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const result = JSON.parse(jsonText);

      // Validação básica
      if (!result.prioridade || !['P1', 'P2', 'P3', 'P4', 'P5'].includes(result.prioridade)) {
        throw new Error('Prioridade inválida na resposta');
      }

      return {
        success: true,
        classification: result,
        rawResponse: content.text,
        model: this.model,
        tokensUsed: response.usage?.output_tokens || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        classification: null
      };
    }
  }

  setRecentCorrections(corrections) {
    this.recentCorrections = corrections;
  }
}
