/**
 * Salvar Rascunho na Caixa IMAP via APPEND
 *
 * Insere o rascunho diretamente na pasta Drafts do funcionário usando
 * ImapFlow client.append(). O email aparece na caixa pronto para revisão
 * e envio — sem interação extra do sistema.
 *
 * Detecção da pasta Drafts:
 * - Tenta primeiramente via atributo especial \Drafts (RFC 6154)
 * - Fallback: nomes comuns (Drafts, INBOX.Drafts, Rascunhos, etc.)
 *
 * Formato da mensagem:
 * - RFC 2822 com headers mínimos necessários
 * - To: remetente original (resposta para quem enviou)
 * - Subject: Re: [assunto original]
 * - In-Reply-To: messageId original (para agrupar na thread)
 */

import { getLogger } from '../logger.js';

const log = getLogger('draft-saver');

// Nomes candidatos para a pasta Drafts (ordem de preferência)
const NOMES_PASTA_DRAFTS = [
  'Drafts',
  'INBOX.Drafts',
  'Draft',
  'Rascunhos',
  'INBOX.Rascunhos',
  '[Gmail]/Rascunhos',
  '[Gmail]/Drafts',
];

/**
 * Detectar pasta Drafts via listagem de mailboxes.
 * Prefere pastas com atributo especial \Drafts.
 *
 * @param {ImapFlow} client - Cliente IMAP conectado
 * @returns {Promise<string|null>} - Nome da pasta ou null se não encontrada
 */
async function detectarPastaDrafts(client) {
  try {
    const mailboxes = await client.list();

    // 1. Buscar por atributo especial \Drafts (mais confiável)
    for (const mailbox of mailboxes) {
      if (mailbox.specialUse === '\\Drafts' || mailbox.flags?.has('\\Drafts')) {
        log.debug({ pasta: mailbox.path }, 'Pasta Drafts detectada via atributo especial');
        return mailbox.path;
      }
    }

    // 2. Fallback: nomes comuns
    const caminhos = new Set(mailboxes.map((m) => m.path));
    for (const nome of NOMES_PASTA_DRAFTS) {
      if (caminhos.has(nome)) {
        log.debug({ pasta: nome }, 'Pasta Drafts detectada via nome');
        return nome;
      }
    }

    log.warn({ mailboxes: [...caminhos] }, 'Pasta Drafts não encontrada');
    return null;
  } catch (err) {
    log.error({ erro: err.message }, 'Erro ao listar mailboxes para detectar Drafts');
    return null;
  }
}

/**
 * Construir mensagem RFC 2822 para o rascunho.
 *
 * @param {Object} emailOriginal - {from, subject, messageId, date}
 * @param {string} corpoRascunho - Texto do rascunho gerado
 * @param {string} emailFuncionario - Email do funcionário (remetente do rascunho)
 * @returns {string} - Mensagem completa em formato RFC 2822
 */
function construirMensagemRFC2822(emailOriginal, corpoRascunho, emailFuncionario) {
  const agora = new Date().toUTCString();
  const subject = emailOriginal.subject || '';
  const subjectResposta = subject.toLowerCase().startsWith('re:')
    ? subject
    : `Re: ${subject}`;

  // Limpar headers para evitar injeção
  const toSeguro = (emailOriginal.from || '').replace(/[\r\n]/g, '');
  const subjectSeguro = subjectResposta.replace(/[\r\n]/g, '');
  const fromSeguro = (emailFuncionario || '').replace(/[\r\n]/g, '');
  const messageIdOriginal = (emailOriginal.messageId || '').replace(/[\r\n]/g, '');

  // Gerar um Message-ID único para o rascunho
  const draftMessageId = `<draft-${Date.now()}-${Math.random().toString(36).slice(2)}@fast-auto>`;

  // Corpo do rascunho — garantir quebras de linha RFC 2822
  const corpoFormatado = corpoRascunho
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((linha) => (linha.startsWith('From ') ? `>${linha}` : linha)) // Escapar "From " no início
    .join('\r\n');

  const headers = [
    `Date: ${agora}`,
    `From: ${fromSeguro}`,
    `To: ${toSeguro}`,
    `Subject: ${subjectSeguro}`,
    `Message-ID: ${draftMessageId}`,
    messageIdOriginal ? `In-Reply-To: ${messageIdOriginal}` : '',
    messageIdOriginal ? `References: ${messageIdOriginal}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Fast-Auto-Draft: true', // Marca que foi gerado automaticamente
  ]
    .filter(Boolean)
    .join('\r\n');

  return `${headers}\r\n\r\n${corpoFormatado}`;
}

/**
 * Salvar rascunho na caixa IMAP do funcionário.
 *
 * @param {ImapFlow} client - Cliente IMAP conectado (pode ser o monitorClient ou worker client)
 * @param {Object} emailOriginal - Email que originou o rascunho {from, subject, messageId}
 * @param {string} corpoRascunho - Texto do rascunho
 * @param {string} emailFuncionario - Email do funcionário (para preencher o From:)
 *
 * @returns {Promise<{
 *   sucesso: boolean,
 *   pasta?: string,
 *   uid?: number,
 *   erro?: string
 * }>}
 */
export async function salvarRascunhoIMAP(client, emailOriginal, corpoRascunho, emailFuncionario) {
  try {
    // 1. Detectar pasta Drafts
    const pastaDrafts = await detectarPastaDrafts(client);
    if (!pastaDrafts) {
      return {
        sucesso: false,
        erro: 'Pasta Drafts não encontrada no servidor IMAP',
      };
    }

    // 2. Construir mensagem RFC 2822
    const mensagem = construirMensagemRFC2822(emailOriginal, corpoRascunho, emailFuncionario);

    // 3. Fazer APPEND na pasta Drafts
    // ImapFlow append: client.append(path, content, flags?, date?)
    // Flag \Draft indica que é um rascunho (não enviado)
    const resultado = await client.append(
      pastaDrafts,
      Buffer.from(mensagem, 'utf-8'),
      ['\\Draft', '\\Seen']
    );

    log.info(
      {
        pasta: pastaDrafts,
        uid: resultado?.uid,
        assunto: `Re: ${emailOriginal.subject || ''}`,
        chars: corpoRascunho.length,
      },
      'Rascunho salvo na caixa IMAP'
    );

    return {
      sucesso: true,
      pasta: pastaDrafts,
      uid: resultado?.uid,
    };
  } catch (err) {
    log.error(
      {
        erro: err.message,
        assunto: emailOriginal?.subject,
      },
      'Erro ao salvar rascunho no IMAP'
    );

    return {
      sucesso: false,
      erro: err.message,
    };
  }
}
