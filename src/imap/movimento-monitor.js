/**
 * Monitor de Movimentação de Emails (Feedback Loop)
 *
 * Responsabilidades:
 * 1. Scaneia pastas Fast-* a cada 5 minutos
 * 2. Detecta movimentos de emails entre pastas
 * 3. Registra em Convex para análise de feedback
 * 4. Identifica erros de movimentação automática
 */

import { getLogger } from '../logger.js';
import { obterTodasAsPastas } from './pastas.js';

const log = getLogger('movimento-monitor');

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const PASTAS_PARA_MONITORAR = obterTodasAsPastas();

// Mapear pastas para níveis de prioridade
const PASTA_PARA_NIVEL = {
  'INBOX.Fast-Urgente': 'P1',
  'INBOX.Fast-Alta-Prioridade': 'P2',
  'INBOX.Fast-Normal': 'P3',
  'INBOX.Fast-Baixa': 'P4',
  'INBOX.Fast-Irrelevante': 'P5',
  'INBOX.Fast-Pendente-Classificacao': 'PENDENTE',
};

class MovimentoMonitor {
  constructor(imapClient, convexClient) {
    this.imap = imapClient;
    this.convex = convexClient;
    this.snapshots = {}; // {pastaName: {uid: {...}}}
    this.isRunning = false;
    this.scanTimeout = null;
  }

  async start() {
    if (this.isRunning) {
      log.warn('Monitor já está rodando');
      return;
    }

    log.info('🔍 Iniciando monitor de movimentação');
    this.isRunning = true;

    // Faz primeiro scan imediatamente
    try {
      await this.executarScan();
    } catch (err) {
      log.error({ erro: err.message }, 'Erro no primeiro scan');
    }

    // Agenda próximo scan
    this.agendarProximoScan();
  }

  async stop() {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.isRunning = false;
    log.info('🛑 Monitor de movimentação parado');
  }

  agendarProximoScan() {
    if (!this.isRunning) return;

    this.scanTimeout = setTimeout(async () => {
      try {
        await this.executarScan();
      } catch (err) {
        log.error({ erro: err.message }, 'Erro durante scan agendado');
      }
      this.agendarProximoScan();
    }, SCAN_INTERVAL_MS);
  }

  /**
   * Executa um scan completo de todas as pastas
   */
  async executarScan() {
    try {
      const novoSnapshot = {};

      // Guarda: se a conexão não está utilizável, nem inicia o scan
      if (!this.imap || this.imap.usable === false) {
        log.warn('Conexão IMAP indisponível — scan adiado para o próximo ciclo');
        return;
      }

      for (const pastaName of PASTAS_PARA_MONITORAR) {
        try {
          novoSnapshot[pastaName] = await this.listarEmailsNaPasta(pastaName);
        } catch (err) {
          // Conexão caiu no meio do scan — aborta o ciclo (evita varrer as demais pastas numa conexão morta)
          if (!this.imap || this.imap.usable === false || /connection not available|connection closed|indispon|caiu/i.test(err.message || '')) {
            log.warn(
              { erro: err.message },
              'Conexão IMAP caiu durante o scan — abortando; retoma no próximo ciclo'
            );
            return;
          }
          log.warn(
            { pasta: pastaName, erro: err.message },
            'Erro ao listar emails na pasta'
          );
          novoSnapshot[pastaName] = {};
        }
      }

      // Compara com snapshot anterior
      await this.detectarMovimentos(novoSnapshot);

      // Atualiza snapshot
      this.snapshots = novoSnapshot;

      log.debug('✅ Scan completo realizado');
    } catch (err) {
      log.error({ erro: err.message }, 'Erro durante scan');
    }
  }

  /**
   * Lista todos os emails em uma pasta com metadados básicos
   * Retorna: {uid: {uid, subject, from, received_at, headers}}
   */
  async listarEmailsNaPasta(pastaName) {
    try {
      const mailbox = await this.imap.mailboxOpen(pastaName, { readOnly: true });

      if (mailbox.exists === 0) {
        return {};
      }

      // Busca todos os UIDs
      const uids = await this.imap.search({ all: true });

      if (uids.length === 0) {
        return {};
      }

      // Busca headers básicos (mais rápido que full parse)
      const emails = {};
      for (const uid of uids) {
        // Aborta imediatamente se a conexão caiu — evita loop de milhares de erros por UID
        if (!this.imap || this.imap.usable === false) {
          throw new Error(`Conexão IMAP indisponível durante leitura da pasta ${pastaName}`);
        }
        try {
          const message = await this.imap.fetchOne(uid, {
            headers: true,
          });

          if (message && message.headers) {
            emails[uid] = {
              uid,
              subject: this.extrairHeader(message.headers, 'subject'),
              from: this.extrairHeader(message.headers, 'from'),
              date: this.extrairHeader(message.headers, 'date'),
              messageId: this.extrairHeader(message.headers, 'message-id'),
            };
          }
        } catch (err) {
          // Se a conexão caiu, não adianta tentar os demais UIDs — aborta a leitura da pasta
          if (!this.imap || this.imap.usable === false || /connection not available|connection closed/i.test(err.message || '')) {
            throw new Error(`Conexão IMAP caiu ao ler pasta ${pastaName}: ${err.message}`);
          }
          log.warn(
            { pasta: pastaName, uid, erro: err.message },
            'Erro ao buscar headers de email'
          );
        }
      }

      return emails;
    } catch (err) {
      // Propaga falha de conexão para abortar o scan inteiro (não varrer as demais pastas)
      if (!this.imap || this.imap.usable === false || /connection not available|connection closed|indispon|caiu/i.test(err.message || '')) {
        throw err;
      }
      log.error(
        { pasta: pastaName, erro: err.message },
        'Erro ao listar emails na pasta'
      );
      return {};
    }
  }

  extrairHeader(headers, headerName) {
    if (!headers) return null;

    const headerArray = headers[headerName];
    if (!headerArray) return null;

    // Headers podem ser string ou array
    if (Array.isArray(headerArray)) {
      return headerArray[0];
    }
    return headerArray;
  }

  /**
   * Detecta movimentos comparando snapshots
   * Identifica:
   * - Email que estava em pasta X, agora está em pasta Y (movimento do usuário)
   * - Email novo em pasta (chegou classificado automaticamente)
   */
  async detectarMovimentos(novoSnapshot) {
    const movimentos = [];

    // Busca emails que SAÍRAM de pastas (já existiam antes)
    for (const [pastaAnterior, emailsAntigos] of Object.entries(this.snapshots)) {
      for (const [uid, emailAntigo] of Object.entries(emailsAntigos)) {
        const encontradoNovo = Object.values(novoSnapshot).some((emails) =>
          emails.hasOwnProperty(uid)
        );

        if (!encontradoNovo) {
          // Email saiu dessa pasta — descobrir para onde
          const pastaAtual = await this.encontrarPastaDoEmail(uid, novoSnapshot);

          if (pastaAtual && pastaAtual !== pastaAnterior) {
            movimentos.push({
              uid: parseInt(uid),
              subject: emailAntigo.subject,
              from: emailAntigo.from,
              from_folder: pastaAnterior,
              to_folder: pastaAtual,
              movement_type: 'user_moved', // Assumir que foi usuário
              timestamp: new Date().toISOString(),
            });
          } else if (!pastaAtual) {
            // Email foi pra lixeira ou deletado
            log.debug(
              { uid, pastaAnterior },
              'Email movido para fora (possível deleção)'
            );
          }
        }
      }
    }

    // Registra movimentos em Convex
    for (const movimento of movimentos) {
      try {
        await this.registrarMovimento(movimento);
      } catch (err) {
        log.error(
          { uid: movimento.uid, erro: err.message },
          'Erro ao registrar movimento'
        );
      }
    }

    if (movimentos.length > 0) {
      log.info(
        { quantidade: movimentos.length },
        `📊 ${movimentos.length} movimento(s) detectado(s)`
      );
    }
  }

  /**
   * Encontra em qual pasta um email está agora
   */
  async encontrarPastaDoEmail(uid, snapshot) {
    for (const [pasta, emails] of Object.entries(snapshot)) {
      if (emails.hasOwnProperty(uid)) {
        return pasta;
      }
    }
    return null;
  }

  /**
   * Registra movimento em Convex
   * Sera usado pra aprendizado em Fase 2
   */
  async registrarMovimento(movimento) {
    try {
      if (!this.convex) {
        log.warn('Convex não disponível para registrar movimento');
        return;
      }

      await this.convex.mutation('emails.registrarMovimento', movimento);

      log.info(
        {
          uid: movimento.uid,
          from: movimento.from_folder,
          to: movimento.to_folder,
        },
        '✅ Movimento registrado em Convex'
      );
    } catch (err) {
      log.error(
        { uid: movimento.uid, erro: err.message },
        'Erro ao registrar movimento em Convex'
      );
      throw err;
    }
  }
}

export { MovimentoMonitor };
