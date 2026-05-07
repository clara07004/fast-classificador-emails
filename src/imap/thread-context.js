/**
 * Detecção de Thread e Contexto de Conversa
 *
 * Quando um email é resposta a uma conversa anterior:
 * 1. Identifica que é reply (In-Reply-To, References headers)
 * 2. Busca emails anteriores da mesma thread
 * 3. Usa contexto para melhor classificação
 *
 * Exemplo:
 * - Cliente envia urgente original → classificado nível 1
 * - Funcionário responde → sabe que é nível 1 pq é continuation da original
 * - Cliente segue-up normal → pode ser nível 2 pq referencia original urgente
 */

import { getLogger } from '../logger.js';

const log = getLogger('thread-context');

/**
 * Extrair Message-ID de um email para identificar thread
 * Message-ID vem do servidor e identifica a mensagem
 */
export function extrairMessageId(email) {
  // Message-ID vem como header do servidor IMAP
  // Ex: <20260507120000.abc123@empresa.com>
  return email.messageId || email['message-id'] || null;
}

/**
 * Extrair In-Reply-To (ID da mensagem para a qual estamos respondendo)
 * Ajuda a rastrear parent da thread
 */
export function extrairInReplyTo(email) {
  return email.inReplyTo || email['in-reply-to'] || null;
}

/**
 * Extrair References (cadeia de IDs de toda a thread)
 * References contém todos os message-ids da thread
 * Ex: <id1> <id2> <id3>
 */
export function extrairReferences(email) {
  const refs = email.references || email.References || '';
  if (!refs) return [];

  // References é string de IDs separados por espaço
  // <id1> <id2> <id3> → [id1, id2, id3]
  return refs
    .match(/<[^>]+>/g)
    ?.map((id) => id.slice(1, -1)) || [];
}

/**
 * Gerar thread-id único a partir dos headers
 * Thread-id é usado para agrupar emails da mesma conversa
 *
 * Prioridade:
 * 1. Se é reply → usar In-Reply-To (mesma thread que parent)
 * 2. Se tem References → usar o primeiro (raiz da conversa)
 * 3. Senão → usar Message-ID (primeira mensagem da thread)
 */
export function gerarThreadId(email) {
  // Prioridade 1: In-Reply-To identifica parent
  const inReplyTo = extrairInReplyTo(email);
  if (inReplyTo) {
    return inReplyTo;
  }

  // Prioridade 2: References[0] é a raiz (primeira mensagem)
  const references = extrairReferences(email);
  if (references.length > 0) {
    return references[0];  // Raiz da conversa
  }

  // Prioridade 3: Message-ID (é primeira mensagem)
  const messageId = extrairMessageId(email);
  if (messageId) {
    return messageId;
  }

  // Fallback: use from + subject (nunca deveria chegar aqui)
  return `${email.from}:${email.subject}`.substring(0, 100);
}

/**
 * Detectar se email é resposta a um email anterior
 * Verifica se tem In-Reply-To ou References
 */
export function ehResposta(email) {
  return !!(extrairInReplyTo(email) || extrairReferences(email).length > 0);
}

/**
 * Extrair contexto de conversa anterior
 *
 * Retorna:
 * - isResposta: boolean
 * - threadId: id da conversa
 * - parentMessageId: id do email pai (se for resposta)
 * - profundidadeThread: quantos emails nessa thread (estimado por References length)
 * - isFollowUp: se é follow-up posterior (3+ emails na thread)
 */
export function analisarContextoConversa(email) {
  const isResposta = ehResposta(email);
  const threadId = gerarThreadId(email);
  const parentMessageId = extrairInReplyTo(email);
  const references = extrairReferences(email);
  const profundidadeThread = references.length + 1;  // +1 pra mensagem atual
  const isFollowUp = profundidadeThread >= 3;

  return {
    isResposta,
    threadId,
    parentMessageId,
    profundidadeThread,
    isFollowUp,
    references,
  };
}

/**
 * Usar contexto de thread para ajustar classificação
 *
 * Lógica:
 * - Se é reply direta de email urgente → herda urgência do parent
 * - Se é follow-up (3+ emails) → reduce urgência ligeramente
 *   (assumindo que foi discutido, menos urgente agora)
 * - Se é nova thread → classifica normalmente
 *
 * @param {number} nivelAtual - Nível detectado pela IA/pré-classificador
 * @param {Object} contexto - Contexto da conversa (de analisarContextoConversa)
 * @param {Object} emailAnterior - Email anterior da thread (se disponível, pode ser null)
 * @returns {number} - Nível ajustado (1-5)
 */
export function ajustarClassificacaoPorContexto(
  nivelAtual,
  contexto,
  emailAnterior = null
) {
  // Se não é resposta, retorna nível sem ajuste
  if (!contexto.isResposta) {
    return nivelAtual;
  }

  // Se é follow-up (muitos emails na conversa) e nível é alto
  // reduce urgência: alguém já está cuidando disso
  if (contexto.isFollowUp && nivelAtual <= 2) {
    // Eleva para nível 3 (Normal) se foi deeply discussed
    const nivelAjustado = Math.max(3, nivelAtual + 1);
    log.debug(
      { nivelOriginal: nivelAtual, nivelAjustado, profundidade: contexto.profundidadeThread },
      'Classificação reduzida em follow-up (conversa já ativa)'
    );
    return nivelAjustado;
  }

  // Se foi resposta direta e temos o email anterior com nível alto
  // herda a urgência
  if (emailAnterior && contexto.profundidadeThread === 2) {
    const nivelParent = emailAnterior.nivelClassificacao || null;
    if (nivelParent && nivelParent === 1) {
      log.debug(
        { nivelOriginal: nivelAtual, nivelParent },
        'Resposta a email urgente — herdando nível 1'
      );
      return 1;  // Herda urgência do parent
    }
  }

  // Default: mantém nível atual
  return nivelAtual;
}

/**
 * Resumir thread para contexto
 * Prepara um sumário dos emails anteriores para passar à Claude API
 *
 * Útil para: quando implementar contexto RAG completo,
 * passar histórico de conversa à IA para decisões melhores
 *
 * @param {Array<Object>} emailsThread - Emails anteriores da thread
 * @returns {string} - Contexto formatado para enviar à Claude
 */
export function resumirThreadParaContexto(emailsThread) {
  if (!emailsThread || emailsThread.length === 0) {
    return '';
  }

  // Mostrar últimos 3 emails (não sobrecarregar prompt)
  const ultimos = emailsThread.slice(-3);

  const resumo = ultimos
    .map((email) => {
      const data = new Date(email.date || Date.now()).toLocaleDateString('pt-BR');
      const from = email.from?.split('@')[0] || 'desconhecido';
      const subject = email.subject || '(sem assunto)';
      const preview = (email.text || email.html || '')
        .substring(0, 200)
        .replace(/\n/g, ' ')
        .trim();

      return `${data} | ${from}: "${subject}"\n  "${preview}..."`;
    })
    .join('\n\n');

  return `## Contexto da Conversa\n${resumo}`;
}

/**
 * Extrair questões-chave de uma thread para guiar classificação
 * Útil para entender tópico da conversa
 *
 * @param {Object} email - Email atual
 * @param {Array<Object>} emailsThread - Emails anteriores (se disponível)
 * @returns {Array<string>} - Lista de keywords-chave
 */
export function extrairKeywordsThread(email, emailsThread = []) {
  const keywords = new Set();

  // Buscar em subject (onde keywords costumam aparecer)
  const subjectLower = (email.subject || '').toLowerCase();
  const bodyLower = (email.text || '').substring(0, 500).toLowerCase();

  // Exemplo: buscar palavras que repetem (indicam tópico)
  const palavras = subjectLower.split(/[\s\-:,]+/).filter((w) => w.length > 4);
  palavras.forEach((w) => keywords.add(w));

  // Se temos thread anterior, buscar padrões recorrentes
  if (emailsThread.length > 0) {
    emailsThread.forEach((e) => {
      const subj = (e.subject || '').toLowerCase();
      const palavrasAnterior = subj.split(/[\s\-:,]+/).filter((w) => w.length > 4);
      palavrasAnterior.forEach((w) => {
        if (palavras.includes(w)) {
          keywords.add(w);  // Palavra-chave recorrente
        }
      });
    });
  }

  return Array.from(keywords).slice(0, 5);  // Top 5 keywords
}
