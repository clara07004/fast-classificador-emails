/**
 * Dashboard de Validação — Semana 3
 *
 * Mostra métricas de sucesso em tempo real:
 * - Taxa de acerto geral e por nível
 * - Tempo para discordância
 * - Tendência de melhoria
 */

import { getLogger } from '../logger.js';
import { api } from '../../convex/_generated/api.js';

const log = getLogger('validation-dashboard');

class ValidationDashboard {
  constructor(convexClient) {
    this.convex = convexClient;
  }

  /**
   * Calcular todas as métricas de sucesso
   */
  async calcularMetricas(funcionarioId, ultimosDias = 7) {
    try {
      if (!this.convex) {
        log.warn('Convex não disponível para métricas');
        return this.metricasPlaceholder();
      }

      const agora = Date.now();
      const dataInicio = agora - ultimosDias * 24 * 60 * 60 * 1000;

      // Buscar movimentos (feedback do usuário) e emails processados no período
      const [movimentos, emails] = await Promise.all([
        this.convex.query(api.emails.buscarMovimentosPorPeriodo, {
          funcionarioId,
          dataInicio,
          dataFim: agora,
        }),
        this.convex.query(api.emails.buscarEmailsPorFuncionario, {
          funcionarioId,
          ultimosDias,
          limite: 500,
        }),
      ]);

      log.debug({ funcionarioId, movimentos: movimentos.length, emails: emails.length }, 'Métricas buscadas');

      // Emails com feedback (movimentos registrados)
      const uidsCorrigidos = new Set(movimentos.filter(m => !m.is_correct).map(m => String(m.uid)));
      const totalEmails = emails.length;
      const totalCorrecoes = uidsCorrigidos.size;
      const totalAcertos = totalEmails - totalCorrecoes;
      const taxaAcerto = totalEmails > 0 ? Math.round((totalAcertos / totalEmails) * 100) : 0;

      // Métricas por nível
      const porNivel = { P1: {}, P2: {}, P3: {}, P4: {}, P5: {} };
      for (const nivel of Object.keys(porNivel)) {
        const n = parseInt(nivel.replace('P', ''));
        const emailsNivel = emails.filter(e => e.nivelClassificado === n);
        const corrigidasNivel = movimentos.filter(m => m.classified_as === nivel && !m.is_correct);
        const total = emailsNivel.length;
        const acertos = total - corrigidasNivel.length;
        porNivel[nivel] = {
          total,
          acertos: Math.max(0, acertos),
          taxa: total > 0 ? Math.round((Math.max(0, acertos) / total) * 100) : 0,
        };
      }

      // Tempo médio de feedback
      const temposFeedback = movimentos
        .filter(m => m.feedback_delay_minutes != null)
        .map(m => m.feedback_delay_minutes);
      const tempoMedioFeedback = temposFeedback.length > 0
        ? Math.round(temposFeedback.reduce((a, b) => a + b, 0) / temposFeedback.length)
        : 0;

      const falsoPositivos = movimentos.filter(m => !m.is_correct && parseInt(m.classified_as.replace('P', '')) < parseInt((m.expected_priority || 'P3').replace('P', ''))).length;
      const falsoNegativos = movimentos.filter(m => !m.is_correct && parseInt(m.classified_as.replace('P', '')) > parseInt((m.expected_priority || 'P3').replace('P', ''))).length;

      return {
        periodo: { inicio: new Date(dataInicio), fim: new Date(agora), dias: ultimosDias },
        geral: { totalEmails, totalAcertos, totalErros: totalCorrecoes, taxaAcerto },
        porNivel,
        tempoMedioFeedback,
        tempoMinimo: temposFeedback.length > 0 ? Math.min(...temposFeedback) : 0,
        tempoMaximo: temposFeedback.length > 0 ? Math.max(...temposFeedback) : 0,
        falsoPositivos,
        falsoNegativos,
        tendencia: totalEmails >= 10 ? (taxaAcerto >= 87 ? 'positiva' : 'negativa') : 'sem dados',
      };
    } catch (err) {
      log.error({ erro: err.message }, 'Erro ao calcular métricas');
      return this.metricasPlaceholder();
    }
  }

  /**
   * Placeholder de métricas para demonstração
   */
  metricasPlaceholder() {
    return {
      periodo: {
        inicio: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        fim: new Date(),
        dias: 7,
      },
      geral: {
        totalEmails: 0,
        totalAcertos: 0,
        totalErros: 0,
        taxaAcerto: 0,
      },
      porNivel: {
        P1: { total: 0, acertos: 0, taxa: 0 },
        P2: { total: 0, acertos: 0, taxa: 0 },
        P3: { total: 0, acertos: 0, taxa: 0 },
        P4: { total: 0, acertos: 0, taxa: 0 },
        P5: { total: 0, acertos: 0, taxa: 0 },
      },
      tempoMedioFeedback: 0,
      tempoMinimo: 0,
      tempoMaximo: 0,
      falsoPositivos: 0,
      falsoNegativos: 0,
      tendencia: 'sem dados',
    };
  }

  /**
   * Validar métricas contra critérios de sucesso
   */
  validarSucesso(metricas) {
    const resultados = {
      passou: true,
      criterios: {},
      avisos: [],
      erros: [],
    };

    // Critério 1: Taxa geral >= 87%
    if (metricas.geral.taxaAcerto < 87) {
      resultados.criterios.taxaGeral = {
        esperado: '≥87%',
        atual: `${metricas.geral.taxaAcerto}%`,
        status: '❌',
      };
      resultados.avisos.push(`Taxa geral ${metricas.geral.taxaAcerto}% está abaixo de 87%`);
      resultados.passou = false;
    } else {
      resultados.criterios.taxaGeral = {
        esperado: '≥87%',
        atual: `${metricas.geral.taxaAcerto}%`,
        status: '✅',
      };
    }

    // Critério 2: P1 >= 95%
    if (metricas.porNivel.P1.taxa < 95) {
      resultados.criterios.P1 = {
        esperado: '≥95%',
        atual: `${metricas.porNivel.P1.taxa}%`,
        status: '⚠️',
      };
      resultados.avisos.push(`P1 em ${metricas.porNivel.P1.taxa}% (baixo para urgências)`);
    } else {
      resultados.criterios.P1 = {
        esperado: '≥95%',
        atual: `${metricas.porNivel.P1.taxa}%`,
        status: '✅',
      };
    }

    // Critério 3: P2 >= 88%
    if (metricas.porNivel.P2.taxa < 88) {
      resultados.criterios.P2 = {
        esperado: '≥88%',
        atual: `${metricas.porNivel.P2.taxa}%`,
        status: '⚠️',
      };
      resultados.avisos.push(`P2 em ${metricas.porNivel.P2.taxa}% (espaço para melhoria)`);
    } else {
      resultados.criterios.P2 = {
        esperado: '≥88%',
        atual: `${metricas.porNivel.P2.taxa}%`,
        status: '✅',
      };
    }

    // Critério 4: P3 = 100% (bem calibrado)
    if (metricas.porNivel.P3.taxa < 100) {
      resultados.criterios.P3 = {
        esperado: '100%',
        atual: `${metricas.porNivel.P3.taxa}%`,
        status: '⚠️',
      };
      resultados.avisos.push(`P3 abaixo de 100% — detectou alguma variação`);
    } else {
      resultados.criterios.P3 = {
        esperado: '100%',
        atual: `${metricas.porNivel.P3.taxa}%`,
        status: '✅',
      };
    }

    // Critério 5: P4 >= 80% (melhoria de 50%)
    if (metricas.porNivel.P4.taxa < 80) {
      resultados.criterios.P4 = {
        esperado: '≥80%',
        atual: `${metricas.porNivel.P4.taxa}%`,
        status: '⚠️',
      };
      resultados.avisos.push(`P4 em ${metricas.porNivel.P4.taxa}% (próximo ao threshold)`);
    } else {
      resultados.criterios.P4 = {
        esperado: '≥80%',
        atual: `${metricas.porNivel.P4.taxa}%`,
        status: '✅',
      };
    }

    // Critério 6: P5 = 100% (óbvio)
    if (metricas.porNivel.P5.taxa < 100) {
      resultados.criterios.P5 = {
        esperado: '100%',
        atual: `${metricas.porNivel.P5.taxa}%`,
        status: '⚠️',
      };
      resultados.avisos.push(`P5 abaixo de 100%`);
    } else {
      resultados.criterios.P5 = {
        esperado: '100%',
        atual: `${metricas.porNivel.P5.taxa}%`,
        status: '✅',
      };
    }

    // Validação: precisa ter pelo menos 10 emails para ser significativo
    if (metricas.geral.totalEmails < 10) {
      resultados.erros.push(
        `Dados insuficientes: ${metricas.geral.totalEmails} emails (mínimo: 10)`
      );
      resultados.passou = false;
    }

    return resultados;
  }

  /**
   * Renderizar dashboard em texto ASCII
   */
  renderizar(metricas, validacao) {
    const linha = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    let output = `
📊 DASHBOARD DE VALIDAÇÃO — SEMANA 3

${linha}
📈 PERÍODO
${linha}
Início:  ${metricas.periodo.inicio.toLocaleDateString('pt-BR')}
Fim:     ${metricas.periodo.fim.toLocaleDateString('pt-BR')}
Dias:    ${metricas.periodo.dias}

${linha}
📊 ESTATÍSTICAS GERAIS
${linha}
Emails processados: ${metricas.geral.totalEmails}
Taxa de acerto:     ${metricas.geral.taxaAcerto}% (${metricas.geral.totalAcertos}/${metricas.geral.totalEmails})
Falsos positivos:   ${metricas.falsoPositivos}
Falsos negativos:   ${metricas.falsoNegativos}

${linha}
📊 POR NÍVEL DE PRIORIDADE
${linha}
P1 (Urgente):        ${metricas.porNivel.P1.total} emails → ${metricas.porNivel.P1.taxa}% ✅
P2 (Alta):           ${metricas.porNivel.P2.total} emails → ${metricas.porNivel.P2.taxa}% ${
      validacao.criterios.P2?.status || '⚠️'
    }
P3 (Normal):         ${metricas.porNivel.P3.total} emails → ${metricas.porNivel.P3.taxa}% ${
      validacao.criterios.P3?.status || '✅'
    }
P4 (Baixa):          ${metricas.porNivel.P4.total} emails → ${metricas.porNivel.P4.taxa}% ${
      validacao.criterios.P4?.status || '⚠️'
    }
P5 (Irrelevante):    ${metricas.porNivel.P5.total} emails → ${metricas.porNivel.P5.taxa}% ${
      validacao.criterios.P5?.status || '✅'
    }

${linha}
⏱️ TEMPO DE FEEDBACK
${linha}
Médio:      ${metricas.tempoMedioFeedback} minutos
Mínimo:     ${metricas.tempoMinimo} minutos
Máximo:     ${metricas.tempoMaximo} minutos

${linha}
✅ VALIDAÇÃO DE SUCESSO
${linha}
${Object.entries(validacao.criterios)
  .map(
    ([nivel, dados]) =>
      `${dados.status} ${nivel}: ${dados.atual} (esperado: ${dados.esperado})`
  )
  .join('\n')}

${validacao.avisos.length > 0 ? `\n⚠️ AVISOS:\n${validacao.avisos.map((a) => `  - ${a}`).join('\n')}` : ''}
${validacao.erros.length > 0 ? `\n❌ ERROS:\n${validacao.erros.map((e) => `  - ${e}`).join('\n')}` : ''}

${linha}
🎯 RESULTADO: ${validacao.passou ? '✅ PASSOU' : '❌ FALHOU'}
${linha}
`;

    return output;
  }

  /**
   * Exibir dashboard
   */
  async exibir(funcionarioId) {
    const metricas = await this.calcularMetricas(funcionarioId);
    const validacao = this.validarSucesso(metricas);
    const output = this.renderizar(metricas, validacao);

    console.log(output);

    return {
      metricas,
      validacao,
      output,
    };
  }
}

export { ValidationDashboard };
