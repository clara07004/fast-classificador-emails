/**
 * Relatório Semanal de Classificação
 *
 * Gerado toda segunda-feira 9am
 * Analisa:
 * - Taxa de acerto por nível (P1-P5)
 * - Falsos positivos (sistema exagerou)
 * - Falsos negativos (sistema minimizou)
 * - Tempo médio de feedback
 */

import { getLogger } from '../logger.js';
import nodemailer from 'nodemailer';
import { api } from '../../convex/_generated/api.js';

const log = getLogger('weekly-report');

class WeeklyFeedbackReport {
  constructor(convexClient, smtpConfig) {
    this.convex = convexClient;
    this.smtpConfig = smtpConfig;
  }

  /**
   * Buscar movimentos de uma semana específica
   */
  async buscarMovimentosDaSemana(funcionarioId, dataInicio, dataFim) {
    try {
      if (!this.convex) {
        log.warn('Convex não disponível para buscar movimentos');
        return [];
      }

      const movimentos = await this.convex.query(
        api.emails.buscarMovimentosPorPeriodo,
        { funcionarioId, dataInicio, dataFim }
      );

      log.debug({ funcionarioId, quantidade: movimentos.length }, 'Movimentos buscados');
      return movimentos;
    } catch (err) {
      log.error(
        { funcionarioId, erro: err.message },
        'Erro ao buscar movimentos'
      );
      return [];
    }
  }

  /**
   * Gerar estatísticas do relatório
   */
  gerarEstatisticas(movimentos) {
    const stats = {
      totalEmailsProcessados: movimentos.length,
      totalAcertos: 0,
      totalErros: 0,
      porNivel: {
        P1: { total: 0, acertos: 0, erros: 0 },
        P2: { total: 0, acertos: 0, erros: 0 },
        P3: { total: 0, acertos: 0, erros: 0 },
        P4: { total: 0, acertos: 0, erros: 0 },
        P5: { total: 0, acertos: 0, erros: 0 },
      },
      falsosPositivos: [], // Sistema exagerou (P1→P3, etc)
      falsosNegativos: [], // Sistema minimizou
      tempoMedioFeedbackMin: 0,
    };

    let totalDelayMin = 0;

    for (const mov of movimentos) {
      const nivel = mov.classified_as;
      const isCorrect = mov.is_correct;

      stats.porNivel[nivel].total++;

      if (isCorrect) {
        stats.porNivel[nivel].acertos++;
        stats.totalAcertos++;
      } else {
        stats.porNivel[nivel].erros++;
        stats.totalErros++;

        // Classificar como falso positivo ou negativo
        const nivelModeloNum = this.nivelParaNumero(mov.classified_as);
        const nivelUsuarioNum = this.nivelParaNumero(mov.expected_priority);

        if (nivelModeloNum < nivelUsuarioNum) {
          // Sistema foi mais urgente que deveria
          stats.falsosPositivos.push({
            subject: mov.subject,
            from: mov.from,
            sistemaDisse: mov.classified_as,
            usuarioDisse: mov.expected_priority,
            motivo: mov.correction_reason,
            confianca: mov.confidence,
          });
        } else if (nivelModeloNum > nivelUsuarioNum) {
          // Sistema foi menos urgente que deveria
          stats.falsosNegativos.push({
            subject: mov.subject,
            from: mov.from,
            sistemaDisse: mov.classified_as,
            usuarioDisse: mov.expected_priority,
            motivo: mov.correction_reason,
          });
        }
      }

      totalDelayMin += mov.feedback_delay_minutes;
    }

    stats.tempoMedioFeedbackMin = movimentos.length > 0
      ? Math.round(totalDelayMin / movimentos.length)
      : 0;

    return stats;
  }

  nivelParaNumero(nivel) {
    const mapa = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
    return mapa[nivel] || 0;
  }

  /**
   * Gerar conteúdo HTML do email
   */
  gerarHTML(stats, dataInicio, dataFim) {
    const taxaGeral = stats.totalEmailsProcessados > 0
      ? Math.round((stats.totalAcertos / stats.totalEmailsProcessados) * 100)
      : 0;

    const semanaFormatada = `${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}`;

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .header { background: #1a5490; color: white; padding: 20px; border-radius: 5px; }
    .stats { margin: 20px 0; }
    .stat-card {
      background: #f5f5f5;
      padding: 15px;
      margin: 10px 0;
      border-left: 4px solid #1a5490;
      border-radius: 3px;
    }
    .level { display: inline-block; margin-right: 20px; }
    .error-list { background: #fff3cd; padding: 10px; margin: 10px 0; border-radius: 3px; }
    .success-list { background: #d4edda; padding: 10px; margin: 10px 0; border-radius: 3px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #1a5490; color: white; }
    .footer { font-size: 12px; color: #666; margin-top: 30px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Relatório Semanal de Classificação de Emails</h1>
    <p>Semana de ${semanaFormatada}</p>
  </div>

  <div class="stats">
    <h2>📈 Estatísticas Gerais</h2>
    <div class="stat-card">
      <strong>Emails processados:</strong> ${stats.totalEmailsProcessados}<br>
      <strong>Taxa de acerto:</strong> ${taxaGeral}% (${stats.totalAcertos} confirmados / ${stats.totalErros} discordados)
    </div>

    <h2>Por Nível de Prioridade</h2>
    <table>
      <tr>
        <th>Nível</th>
        <th>Total</th>
        <th>Acertos</th>
        <th>Taxa</th>
      </tr>`;

    for (const [nivel, dados] of Object.entries(stats.porNivel)) {
      if (dados.total === 0) continue;

      const taxa = Math.round((dados.acertos / dados.total) * 100);
      const emoji = taxa >= 85 ? '✅' : taxa >= 70 ? '⚠️' : '❌';

      html += `
      <tr>
        <td>${nivel}</td>
        <td>${dados.total}</td>
        <td>${dados.acertos}</td>
        <td>${emoji} ${taxa}%</td>
      </tr>`;
    }

    html += '</table>';

    // Falsos positivos
    if (stats.falsosPositivos.length > 0) {
      html += '<h2>⚠️ Falsos Positivos (Sistema Exagerou)</h2>';
      html += `<p>${stats.falsosPositivos.length} caso(s) onde sistema foi mais urgente que deveria:</p>`;

      for (const fp of stats.falsosPositivos.slice(0, 5)) {
        html += `
        <div class="error-list">
          <strong>"${fp.subject}"</strong> de ${fp.from}<br>
          Sistema disse: <strong>${fp.sistemaDisse}</strong> (${Math.round(fp.confianca * 100)}% confiança)
          → Você: <strong>${fp.usuarioDisse}</strong><br>
          <em>Padrão: ${fp.motivo}</em>
        </div>`;
      }
    }

    // Falsos negativos
    if (stats.falsosNegativos.length > 0) {
      html += '<h2>❌ Falsos Negativos (Sistema Minimizou)</h2>';
      html += `<p>${stats.falsosNegativos.length} caso(s) onde sistema foi menos urgente que deveria:</p>`;

      for (const fn of stats.falsosNegativos.slice(0, 5)) {
        html += `
        <div class="error-list">
          <strong>"${fn.subject}"</strong> de ${fn.from}<br>
          Sistema disse: <strong>${fn.sistemaDisse}</strong> → Você: <strong>${fn.usuarioDisse}</strong><br>
          <em>Motivo: ${fn.motivo}</em>
        </div>`;
      }
    } else if (stats.totalEmailsProcessados > 0) {
      html += `
      <div class="success-list">
        <h2>✅ Ótimo!</h2>
        <p>Nenhum falso negativo nesta semana — seu sistema está calibrado bem.</p>
      </div>`;
    }

    html += `
    <h2>📊 Tempo de Feedback</h2>
    <div class="stat-card">
      <strong>Tempo médio entre classificação e movimento:</strong> ${stats.tempoMedioFeedbackMin} minutos<br>
      <em>Se > 10 min: você leu e pensou. Se < 1 min: erro óbvio (bom sinal).</em>
    </div>
  </div>

  <div class="footer">
    <p>Relatório automático — Próximo: próxima segunda-feira, 9:00 AM</p>
    <p>Sistema de Classificação Automática de Emails • Fast Sistemas Construtivos</p>
  </div>
</body>
</html>`;

    return html;
  }

  /**
   * Enviar relatório via email
   */
  async enviarRelatorio(funcionarioEmail, stats, dataInicio, dataFim) {
    try {
      if (!this.smtpConfig) {
        log.warn('SMTP não configurado, relatório não será enviado');
        return false;
      }

      const html = this.gerarHTML(stats, dataInicio, dataFim);

      const transporter = nodemailer.createTransport(this.smtpConfig);

      const dataInicioFormatada = new Date(dataInicio).toLocaleDateString('pt-BR');
      const dataFimFormatada = new Date(dataFim).toLocaleDateString('pt-BR');

      const mailOptions = {
        from: this.smtpConfig.from || 'noreply@fast.com.br',
        to: funcionarioEmail,
        subject: `📊 Relatório Semanal de Classificação — ${dataInicioFormatada} a ${dataFimFormatada}`,
        html,
      };

      const info = await transporter.sendMail(mailOptions);

      log.info(
        { para: funcionarioEmail, messageId: info.messageId },
        '📧 Relatório enviado com sucesso'
      );

      return true;
    } catch (err) {
      log.error(
        { para: funcionarioEmail, erro: err.message },
        'Erro ao enviar relatório'
      );
      return false;
    }
  }

  /**
   * Executar relatório completo para um funcionário
   */
  async executarRelatorioCompleto(funcionarioId, funcionarioEmail) {
    try {
      // Calcular período (última semana)
      const agora = new Date();
      const dataFim = agora.getTime();
      const dataInicio = dataFim - 7 * 24 * 60 * 60 * 1000; // 7 dias atrás

      log.info(
        { funcionarioId },
        `📊 Gerando relatório para período ${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}`
      );

      const movimentos = await this.buscarMovimentosDaSemana(funcionarioId, dataInicio, dataFim);

      if (movimentos.length === 0) {
        log.info({ funcionarioId }, 'Nenhum movimento nesta semana');
        return;
      }

      const stats = this.gerarEstatisticas(movimentos);

      await this.enviarRelatorio(funcionarioEmail, stats, dataInicio, dataFim);
    } catch (err) {
      log.error(
        { funcionarioId, erro: err.message },
        'Erro ao executar relatório'
      );
    }
  }
}

export { WeeklyFeedbackReport };
