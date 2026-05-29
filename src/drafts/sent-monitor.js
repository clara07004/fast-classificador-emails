/**
 * Monitor de Emails Enviados — Diff Rascunho × Enviado (T39)
 *
 * Monitora a pasta Enviados via IMAP. Quando o funcionário envia um email
 * que tinha rascunho gerado, calcula a diferença entre o rascunho e o texto
 * final enviado e salva no Convex.
 *
 * Esse dado alimenta a geração de style card na Fase 2.
 *
 * Cruzamento:
 *   sent_email.inReplyTo  ===  emails_processados.messageId
 *
 * O rascunho salvo no IMAP tem In-Reply-To: <original-messageId>.
 * Quando o funcionário envia, o email enviado também terá esse In-Reply-To.
 * Buscamos o registro em emails_processados pelo messageId original.
 */

import { getLogger } from '../logger.js';
import { api } from '../../convex/_generated/api.js';

const log = getLogger('sent-monitor');

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos (mesmo intervalo do MovimentoMonitor)

// Nomes candidatos para a pasta Enviados (ordem de preferência)
const NOMES_PASTA_ENVIADOS = [
  'Sent',
  'Sent Messages',
  'INBOX.Sent',
  'Enviados',
  'INBOX.Enviados',
  '[Gmail]/Sent Mail',
  '[Gmail]/E-mails enviados',
];

/**
 * Detecta a pasta Enviados via listagem de mailboxes.
 * Prefere pastas com atributo especial \Sent.
 *
 * @param {ImapFlow} client
 * @returns {Promise<string|null>}
 */
async function detectarPastaEnviados(client) {
  try {
    const mailboxes = await client.list();

    // 1. Atributo especial \Sent (RFC 6154)
    for (const mailbox of mailboxes) {
      if (mailbox.specialUse === '\\Sent' || mailbox.flags?.has('\\Sent')) {
        log.debug({ pasta: mailbox.path }, 'Pasta Enviados detectada via atributo especial');
        return mailbox.path;
      }
    }

    // 2. Fallback por nome
    const caminhos = new Set(mailboxes.map((m) => m.path));
    for (const nome of NOMES_PASTA_ENVIADOS) {
      if (caminhos.has(nome)) {
        log.debug({ pasta: nome }, 'Pasta Enviados detectada via nome');
        return nome;
      }
    }

    log.warn({ mailboxes: [...caminhos] }, 'Pasta Enviados não encontrada');
    return null;
  } catch (err) {
    log.error({ erro: err.message }, 'Erro ao listar mailboxes para detectar Enviados');
    return null;
  }
}

/**
 * Calcula similaridade entre dois textos usando Jaccard sobre tokens.
 * Retorna 0–100 (% de palavras em comum vs. total de palavras distintas).
 *
 * Descarta palavras curtas (≤ 2 chars) para evitar falsos positivos com
 * preposições, artigos e pontuação.
 *
 * @param {string} texto1
 * @param {string} texto2
 * @returns {number} 0–100
 */
function calcularSimilaridade(texto1, texto2) {
  const tokenizar = (t) =>
    new Set(
      (t || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

  const set1 = tokenizar(texto1);
  const set2 = tokenizar(texto2);

  if (set1.size === 0 && set2.size === 0) return 100;
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersecao = 0;
  for (const token of set1) {
    if (set2.has(token)) intersecao++;
  }

  const uniao = set1.size + set2.size - intersecao;
  return Math.round((intersecao / uniao) * 100);
}

/**
 * Extrai o corpo de texto de uma mensagem RFC 2822/MIME.
 * Retorna o primeiro bloco de texto/plain encontrado,
 * ou remove tags HTML se só houver text/html.
 *
 * @param {string} rawBody - Corpo bruto da mensagem
 * @returns {string}
 */
function extrairTextoDoBody(rawBody) {
  if (!rawBody) return '';

  // Mensagem multipart: tenta extrair a parte text/plain
  const partMatch = rawBody.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)(?=--|\z)/i
  );
  if (partMatch) {
    return partMatch[1].trim();
  }

  // Sem multipart — divide headers do corpo pelo primeiro \r\n\r\n
  const sepIdx = rawBody.indexOf('\r\n\r\n');
  const corpo = sepIdx !== -1 ? rawBody.slice(sepIdx + 4) : rawBody;

  // Remove tags HTML se existirem
  if (/<html/i.test(corpo)) {
    return corpo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return corpo.trim();
}

/**
 * Monitor de Emails Enviados
 */
class SentMonitor {
  /**
   * @param {ImapFlow} imapClient - Cliente IMAP dedicado (do MonitorClient)
   * @param {ConvexClient} convexClient
   * @param {string} funcionarioId - ID do funcionário no Convex
   */
  constructor(imapClient, convexClient, funcionarioId) {
    this.imap = imapClient;
    this.convex = convexClient;
    this.funcionarioId = funcionarioId;
    this.pastaSent = null;
    this.ultimoUidProcessado = 0;
    this.isRunning = false;
    this.scanTimeout = null;
  }

  async start() {
    if (this.isRunning) {
      log.warn('SentMonitor já está rodando');
      return;
    }

    // Detectar pasta Enviados uma única vez no início
    this.pastaSent = await detectarPastaEnviados(this.imap);
    if (!this.pastaSent) {
      log.warn('SentMonitor não iniciado — pasta Enviados não encontrada');
      return;
    }

    log.info({ pasta: this.pastaSent }, '📤 SentMonitor iniciado');
    this.isRunning = true;

    // Primeiro scan: apenas indexar UIDs existentes, sem processar
    // (não queremos capturar diffs de emails enviados antes de hoje)
    try {
      await this.indexarUidsExistentes();
    } catch (err) {
      log.error({ erro: err.message }, 'Erro ao indexar UIDs existentes da pasta Enviados');
    }

    this.agendarProximoScan();
  }

  async stop() {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.isRunning = false;
    log.info('🛑 SentMonitor parado');
  }

  agendarProximoScan() {
    if (!this.isRunning) return;
    this.scanTimeout = setTimeout(async () => {
      try {
        await this.executarScan();
      } catch (err) {
        log.error({ erro: err.message }, 'Erro durante scan de Enviados');
      }
      this.agendarProximoScan();
    }, SCAN_INTERVAL_MS);
  }

  /**
   * Indexa todos os UIDs atuais da pasta Enviados sem processar.
   * Define `ultimoUidProcessado` para que o próximo scan processe
   * apenas emails enviados daqui para frente.
   */
  async indexarUidsExistentes() {
    const mailbox = await this.imap.mailboxOpen(this.pastaSent, { readOnly: true });
    if (mailbox.exists === 0) {
      this.ultimoUidProcessado = 0;
      return;
    }

    const uids = await this.imap.search({ all: true });
    if (uids.length > 0) {
      this.ultimoUidProcessado = Math.max(...uids);
      log.debug(
        { totalExistentes: uids.length, ultimoUid: this.ultimoUidProcessado },
        'UIDs de Enviados indexados — apenas novos serão processados'
      );
    }
  }

  /**
   * Scan incremental: busca emails enviados com UID > ultimoUidProcessado.
   */
  async executarScan() {
    if (!this.pastaSent) return;

    const mailbox = await this.imap.mailboxOpen(this.pastaSent, { readOnly: true });
    if (mailbox.exists === 0) return;

    // Buscar todos os UIDs da pasta
    const todosUids = await this.imap.search({ all: true });
    const novosUids = todosUids.filter((uid) => uid > this.ultimoUidProcessado);

    if (novosUids.length === 0) {
      log.debug('Sem novos emails enviados desde o último scan');
      return;
    }

    log.info({ quantidade: novosUids.length }, `📨 ${novosUids.length} email(s) enviado(s) para processar`);

    for (const uid of novosUids) {
      try {
        await this.processarEmailEnviado(uid);
      } catch (err) {
        log.warn({ uid, erro: err.message }, 'Erro ao processar email enviado — ignorando');
      }
    }

    // Atualizar cursor
    if (novosUids.length > 0) {
      this.ultimoUidProcessado = Math.max(...novosUids);
    }
  }

  /**
   * Processa um email enviado: extrai headers, cruza com rascunho no Convex
   * e salva diff se houver correspondência.
   *
   * @param {number} uid
   */
  async processarEmailEnviado(uid) {
    // 1. Buscar headers + corpo do email enviado
    const message = await this.imap.fetchOne(uid, {
      headers: true,
      bodyParts: ['TEXT'],  // Corpo bruto (sem attachment)
    });

    if (!message) return;

    const headers = message.headers || {};
    const inReplyTo = this.extrairHeader(headers, 'in-reply-to');
    const messageId  = this.extrairHeader(headers, 'message-id');

    // Só interessa se é uma resposta (tem In-Reply-To)
    if (!inReplyTo) return;

    // Ignorar rascunhos do próprio sistema (evitar loop)
    const xFastDraft = this.extrairHeader(headers, 'x-fast-auto-draft');
    if (xFastDraft) return;

    // 2. Buscar email original no Convex pelo messageId original
    const emailOriginal = await this.convex.query(api.emails.buscarEmailPorMessageId, {
      messageId: inReplyTo,
    });

    // Se não temos rascunho gerado, não há diff para calcular
    if (!emailOriginal || !emailOriginal.rascunhoResposta) return;

    // Verificar se já registramos esse email enviado (idempotência extra no cliente)
    if (!messageId) return; // sem Message-ID não conseguimos garantir idempotência

    // 3. Extrair corpo do email enviado
    let textoEnviado = '';
    if (message.bodyParts) {
      const textPart = message.bodyParts.get('TEXT') || message.bodyParts.get('text');
      if (textPart) {
        textoEnviado = extrairTextoDoBody(
          Buffer.isBuffer(textPart) ? textPart.toString('utf-8') : String(textPart)
        );
      }
    }

    if (!textoEnviado) {
      log.debug({ uid, inReplyTo }, 'Email enviado sem corpo — ignorando');
      return;
    }

    // 4. Calcular similaridade
    const similaridade = calcularSimilaridade(emailOriginal.rascunhoResposta, textoEnviado);

    // 5. Salvar diff no Convex
    const resultado = await this.convex.mutation(api.emails.registrarDiffRascunho, {
      funcionarioId: this.funcionarioId,
      emailOriginalId: emailOriginal._id,
      rascunhoGerado: emailOriginal.rascunhoResposta,
      textoEnviado,
      similaridadePercent: similaridade,
      inReplyTo,
      messageIdEnviado: messageId,
    });

    if (resultado.duplicata) {
      log.debug({ uid, messageId }, 'Diff já registrado anteriormente — ignorado');
      return;
    }

    log.info(
      {
        uid,
        similaridade: `${similaridade}%`,
        inReplyTo,
        diffId: resultado.diffId,
      },
      `✅ Diff rascunho×enviado salvo — similaridade: ${similaridade}%`
    );
  }

  extrairHeader(headers, headerName) {
    if (!headers) return null;
    const val = headers[headerName];
    if (!val) return null;
    return Array.isArray(val) ? val[0] : val;
  }
}

export { SentMonitor };
