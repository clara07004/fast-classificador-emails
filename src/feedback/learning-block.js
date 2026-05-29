/**
 * Learning Block — Fase 2
 *
 * Responsabilidades:
 * 1. Buscar correções recentes do Convex
 * 2. Formatar para ClassifierV2 usar como examples
 * 3. Atualizar classificador com feedback antes de cada classificação
 */

import { getLogger } from '../logger.js';

const log = getLogger('learning-block');

const MAX_RECENT_CORRECTIONS = 10; // Últimas 10 correções

class LearningBlock {
  constructor(convexClient) {
    this.convex = convexClient;
  }

  /**
   * Buscar correções recentes de um funcionário
   * Retorna array formatado para ClassifierV2
   */
  async buscarCorrecoesRecentes(funcionarioId) {
    try {
      if (!this.convex) {
        log.debug('Convex client não disponível, retornando correções vazias');
        return [];
      }

      const movimentos = await this.convex.query(
        'emails.buscarMovimentosPorFuncionario',
        { funcionarioId, limite: MAX_RECENT_CORRECTIONS }
      );

      log.debug({ funcionarioId, quantidade: movimentos.length }, 'Correções buscadas');
      return movimentos;
    } catch (err) {
      log.warn(
        { funcionarioId, erro: err.message },
        'Erro ao buscar correções, continuando sem elas'
      );
      return [];
    }
  }

  /**
   * Formatar movimentos do Convex para formato de correção do ClassifierV2
   *
   * Convex formato:
   * {
   *   uid, subject, from, classified_as, user_moved_to,
   *   correction_reason, feedback_delay_minutes, ...
   * }
   *
   * ClassifierV2 espera:
   * {
   *   emailResumo: "string",
   *   raciocinio_modelo: "string",
   *   prioridade_modelo: "P1-P5",
   *   prioridade_usuario: "P1-P5",
   *   motivo: "string"
   * }
   */
  formatarMovimentoParaCorrecao(movimento) {
    try {
      // Mapear pasta para nível
      const PASTA_PARA_NIVEL = {
        'INBOX.Fast-Urgente': 'P1',
        'INBOX.Fast-Alta-Prioridade': 'P2',
        'INBOX.Fast-Normal': 'P3',
        'INBOX.Fast-Baixa': 'P4',
        'INBOX.Fast-Irrelevante': 'P5',
      };

      const prioridadeUsuario = PASTA_PARA_NIVEL[movimento.user_moved_to] || 'DESCONHECIDO';

      return {
        emailResumo: `"${movimento.subject}" de ${movimento.from}`,
        raciocinio_modelo: movimento.correction_reason || `Delay: ${movimento.feedback_delay_minutes}min`,
        prioridade_modelo: movimento.classified_as,
        prioridade_usuario: prioridadeUsuario,
        motivo: movimento.correction_reason || 'Feedback do usuário',
      };
    } catch (err) {
      log.error(
        { uid: movimento.uid, erro: err.message },
        'Erro ao formatar movimento'
      );
      return null;
    }
  }

  /**
   * Preparar lista de correções para ClassifierV2
   * Filtra apenas movimentos onde o usuário discordou (is_correct = false)
   */
  async prepararCorrecoesParaClassificador(funcionarioId, movimentos) {
    const correcoes = [];

    for (const movimento of movimentos) {
      // Só aprende com movimentos onde o sistema errou
      if (!movimento.is_correct) {
        const correcao = this.formatarMovimentoParaCorrecao(movimento);
        if (correcao) {
          correcoes.push(correcao);
        }
      }
    }

    // Ordenar por feedback_timestamp (mais recente primeiro)
    correcoes.sort((a, b) => b.feedback_timestamp - a.feedback_timestamp);

    // Limitar a últimas N correções
    return correcoes.slice(0, MAX_RECENT_CORRECTIONS);
  }

  /**
   * Injetar aprendizado no classificador
   * Chamado antes de cada classificação
   */
  async injetarAprendizado(classifier, funcionarioId) {
    try {
      const movimentos = await this.buscarCorrecoesRecentes(funcionarioId);

      if (movimentos.length === 0) {
        log.debug({ funcionarioId }, 'Nenhuma correção disponível');
        classifier.setRecentCorrections([]);
        return;
      }

      const correcoes = await this.prepararCorrecoesParaClassificador(
        funcionarioId,
        movimentos
      );

      if (correcoes.length > 0) {
        classifier.setRecentCorrections(correcoes);
        log.debug(
          { funcionarioId, quantidade: correcoes.length },
          `✅ ${correcoes.length} correção(ões) injetada(s) no classificador`
        );
      }
    } catch (err) {
      log.error(
        { funcionarioId, erro: err.message },
        'Erro ao injetar aprendizado, continuando sem'
      );
      classifier.setRecentCorrections([]);
    }
  }

  /**
   * Registrar uma correção quando movimento é detectado
   * Será chamado pelo movimento-monitor
   */
  async registrarCorrecaoDeMovimento(movimento) {
    try {
      if (!this.convex) {
        log.debug('Convex não disponível, correção não persistida');
        return;
      }

      // Será implementado quando Convex estiver integrado
      log.debug({ uid: movimento.uid }, 'Registrando correção (placeholder)');
    } catch (err) {
      log.error(
        { uid: movimento.uid, erro: err.message },
        'Erro ao registrar correção'
      );
    }
  }
}

export { LearningBlock };
