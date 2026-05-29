/**
 * Setup do Sistema de Feedback Completo
 *
 * Responsabilidades:
 * 1. Inicializar Convex client
 * 2. Conectar MovimentoMonitor ao Convex
 * 3. Conectar LearningBlock ao Convex
 * 4. Preparar tudo para começar
 */

import { getConvexClient } from '../convex/cliente.js';
import { getLogger } from '../logger.js';
import { MovimentoMonitor } from '../imap/movimento-monitor.js';
import { LearningBlock } from '../feedback/learning-block.js';

const log = getLogger('feedback-setup');

class FeedbackSystemSetup {
  constructor() {
    this.convexClient = null;
    this.movimentoMonitor = null;
    this.learningBlock = null;
    this.funcionarioId = null;
  }

  /**
   * Inicializar Convex e componentes de feedback
   */
  async inicializar(imapClient, funcionarioId) {
    try {
      log.info('🚀 Inicializando sistema de feedback...');

      // 1. Obter GatewayClient já inicializado pelo worker principal
      this.convexClient = getConvexClient();
      if (!this.convexClient) {
        throw new Error('GatewayClient Convex não inicializado — chame inicializarConvex() antes');
      }
      this.funcionarioId = funcionarioId;

      log.info('✅ Convex GatewayClient obtido');

      // 2. Inicializar MovimentoMonitor com Convex
      this.movimentoMonitor = new MovimentoMonitor(imapClient, this.convexClient);
      log.info('✅ MovimentoMonitor inicializado com Convex');

      // 3. Inicializar LearningBlock com Convex
      this.learningBlock = new LearningBlock(this.convexClient);
      log.info('✅ LearningBlock inicializado com Convex');

      // 4. Validar que Convex está respondendo
      await this.validarConexao();

      log.info('🎉 Sistema de feedback completo e pronto!');

      return {
        sucesso: true,
        convexClient: this.convexClient,
        movimentoMonitor: this.movimentoMonitor,
        learningBlock: this.learningBlock,
      };
    } catch (err) {
      log.error({ erro: err.message }, '❌ Erro ao inicializar feedback system');
      throw err;
    }
  }

  /**
   * Validar conexão com Convex
   */
  async validarConexao() {
    try {
      // Teste simples: tentar buscar email do funcionário
      // Vai falhar com ID fake, mas prova que API está acessível
      await this.convexClient.query('emails.buscarEmailPorId', {
        emailId: 'test-id-123',
      });
    } catch (err) {
      if (err.message?.includes('Could not find')) {
        // Esperado falhar com ID fake
        log.debug('Validação Convex: API respondeu conforme esperado');
      } else if (err.message?.includes('404')) {
        // API não encontrou — esperado
        log.debug('Validação Convex: API respondeu (404 esperado)');
      } else {
        // Erro real
        log.warn({ erro: err.message }, 'Aviso durante validação Convex');
      }
    }
  }

  /**
   * Obter instância do MovimentoMonitor pronto
   */
  getMovimentoMonitor() {
    if (!this.movimentoMonitor) {
      throw new Error('MovimentoMonitor não inicializado');
    }
    return this.movimentoMonitor;
  }

  /**
   * Obter instância do LearningBlock pronto
   */
  getLearningBlock() {
    if (!this.learningBlock) {
      throw new Error('LearningBlock não inicializado');
    }
    return this.learningBlock;
  }

  /**
   * Obter Convex client
   */
  getConvexClient() {
    if (!this.convexClient) {
      throw new Error('Convex client não inicializado');
    }
    return this.convexClient;
  }

  /**
   * Parar todos os componentes
   */
  async parar() {
    try {
      log.info('⏹️ Parando sistema de feedback...');

      if (this.movimentoMonitor) {
        await this.movimentoMonitor.stop();
      }

      log.info('✅ Sistema de feedback parado');
    } catch (err) {
      log.error({ erro: err.message }, 'Erro ao parar feedback system');
    }
  }
}

export { FeedbackSystemSetup };
