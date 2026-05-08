/**
 * Worker Classificador V2 — Com Sistema de Feedback Integrado
 *
 * NOTA: Este é o arquivo de exemplo para integração completa.
 * Combina:
 * - IMAP IDLE (novos emails)
 * - Classificação (Claude)
 * - Feedback Loop (movimento monitor + learning block)
 *
 * Para usar: Copiar lógica para worker-classify.js quando pronto
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ClassifierV2 } from './classifiers/v2-classifier.js';
import { FeedbackSystemSetup } from './initialization/setup-feedback-system.js';

class EmailClassifierIntegrated {
  constructor(funcionarioId) {
    this.imap = null;
    this.retryCount = 0;
    this.maxRetries = 10;
    this.baseRetryDelay = 2000;
    this.lastSeenUid = 0;
    this.processing = false;
    this.classifier = new ClassifierV2();
    this.funcionarioId = funcionarioId;

    // Nova: Sistema de feedback
    this.feedbackSetup = null;
    this.movimentoMonitor = null;
    this.learningBlock = null;
  }

  async connect() {
    try {
      console.log('🔗 Conectando ao servidor IMAP...');
      this.imap = new ImapFlow({
        host: 'mail.cscempresarial.com.br',
        port: 993,
        secure: true,
        auth: {
          user: process.env.IMAP_USER,
          pass: process.env.IMAP_PASS
        }
      });

      await this.imap.connect();
      this.retryCount = 0;
      console.log('✅ Conectado ao IMAP');

      // Setup listeners
      this.setupListeners();

      // ✨ NOVO: Inicializar sistema de feedback
      await this.inicializarFeedback();

      // Inicia monitoramento
      await this.startMonitoring();
    } catch (error) {
      console.error('❌ Erro ao conectar:', error.message);
      this.reconnect();
    }
  }

  async inicializarFeedback() {
    try {
      this.feedbackSetup = new FeedbackSystemSetup();

      const resultado = await this.feedbackSetup.inicializar(
        this.imap,
        this.funcionarioId
      );

      this.movimentoMonitor = resultado.movimentoMonitor;
      this.learningBlock = resultado.learningBlock;

      console.log('✨ Sistema de feedback integrado com sucesso');
    } catch (err) {
      console.warn('⚠️ Feedback system não disponível:', err.message);
      // Continua rodando sem feedback
    }
  }

  setupListeners() {
    this.imap.on('mailbox', async (info) => {
      if (info.path === 'INBOX') {
        console.log(`\n📬 Mudança detectada: exists=${info.exists}, recent=${info.recent}`);
        if (!this.processing) {
          this.processing = true;
          await this.processNewEmails();
          this.processing = false;
        }
      }
    });

    this.imap.on('error', (err) => {
      console.error('❌ Erro IMAP:', err.message);
    });

    this.imap.on('close', () => {
      console.log('⚠️ Conexão IMAP fechada');
      this.reconnect();
    });
  }

  reconnect() {
    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount),
      60000
    );
    this.retryCount++;

    console.log(
      `⏳ Reconectando em ${(delay / 1000).toFixed(1)}s (tentativa ${this.retryCount}/${this.maxRetries})`
    );

    if (this.retryCount > this.maxRetries) {
      console.error('❌ Máximo de tentativas atingido');
      process.exit(1);
    }

    setTimeout(() => this.connect(), delay);
  }

  async startMonitoring() {
    try {
      const mailbox = await this.imap.mailboxOpen('INBOX');
      console.log(`📬 INBOX: ${mailbox.exists} emails, UIDNEXT: ${mailbox.uidNext}`);

      this.lastSeenUid = mailbox.uidNext - 1;

      console.log('✅ Monitorando novos emails com IDLE...\n');

      // ✨ NOVO: Inicia movimento-monitor em background
      if (this.movimentoMonitor) {
        this.movimentoMonitor.start();
        console.log('🔍 Monitor de movimentação iniciado\n');
      }

      // Inicia IDLE
      this.imap.idle();
    } catch (error) {
      console.error('❌ Erro ao iniciar monitoramento:', error.message);
      await this.close();
      this.reconnect();
    }
  }

  async processNewEmails() {
    try {
      const mailbox = await this.imap.mailboxOpen('INBOX');

      if (mailbox.uidNext > this.lastSeenUid + 1) {
        for (let uid = this.lastSeenUid + 1; uid < mailbox.uidNext; uid++) {
          try {
            await this.classifyAndMove(uid);
            this.lastSeenUid = uid;
          } catch (error) {
            console.error(`❌ Erro ao processar UID ${uid}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar novos emails:', error.message);
    }
  }

  async classifyAndMove(uid) {
    try {
      console.log(`\n📧 UID ${uid}:`);

      const message = await this.imap.fetchOne(uid, { source: true });

      if (!message) {
        console.log('   ❌ Email não encontrado');
        return;
      }

      const parsed = await simpleParser(message.source);

      const from = parsed.from?.text || 'Desconhecido';
      const to = parsed.to?.text || 'Desconhecido';
      const cc = parsed.cc?.text || '';
      const subject = parsed.subject || '(sem assunto)';
      const textContent = parsed.text || parsed.html || '(sem conteúdo)';
      const timestamp = parsed.date ? parsed.date.toISOString() : new Date().toISOString();

      console.log(`  De: ${from}`);
      console.log(`  Assunto: ${subject}`);

      const isForwarded = subject.toLowerCase().includes('fwd:') || subject.toLowerCase().includes('fw:');

      const emailData = {
        from,
        to,
        cc,
        subject,
        body: textContent,
        timestamp,
        isForwarded,
        forwardedFrom: null,
        forwardedBody: null,
        attachmentsSummary: parsed.attachments?.length ? `${parsed.attachments.length} anexo(s)` : null,
        threadContext: null,
        userContext: null,
        senderEnrichment: null
      };

      // ✨ NOVO: Injetar aprendizado antes de classificar
      if (this.learningBlock) {
        await this.learningBlock.injetarAprendizado(this.classifier, this.funcionarioId);
      }

      // Classifica
      const result = await this.classifier.classify(emailData);

      if (!result.success) {
        console.log(`  ❌ Erro na classificação: ${result.error}`);
        await this.imap.messageMove(uid, 'INBOX.Fast-Pendente-Classificacao');
        console.log(`  ⚠️  Movido para pendente de classificação`);
        return;
      }

      const priority = result.classification.prioridade;
      const confianca = result.classification.confianca;

      console.log(`  🤖 Classificação: ${priority} (confiança: ${(confianca * 100).toFixed(0)}%)`);
      console.log(`  📝 Raciocínio: ${result.classification.raciocinio}`);

      const folderMap = {
        'P1': 'INBOX.Fast-Urgente',
        'P2': 'INBOX.Fast-Alta-Prioridade',
        'P3': 'INBOX.Fast-Normal',
        'P4': 'INBOX.Fast-Baixa',
        'P5': 'INBOX.Fast-Irrelevante'
      };

      const targetFolder = folderMap[priority] || 'INBOX.Fast-Pendente-Classificacao';

      await this.imap.messageMove(uid, targetFolder);
      console.log(`  ✅ Movido para ${targetFolder}`);
    } catch (error) {
      throw error;
    }
  }

  async close() {
    try {
      // ✨ NOVO: Parar feedback system
      if (this.feedbackSetup) {
        await this.feedbackSetup.parar();
      }

      if (this.imap) {
        await this.imap.close();
      }
    } catch (error) {
      // Ignore
    }
  }
}

// Iniciar com funcionarioId do environment
const funcionarioId = process.env.FUNCIONARIO_ID || 'placeholder-funcionario';
const classifier = new EmailClassifierIntegrated(funcionarioId);

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando...');
  await classifier.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Encerrando...');
  await classifier.close();
  process.exit(0);
});

classifier.connect();
