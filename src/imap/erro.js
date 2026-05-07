/**
 * Tratamento de Erros em Processamento
 *
 * Quando email falha em ser processado:
 * 1. Registra erro estruturado em log
 * 2. Move para Pendente-Classificacao
 * 3. CEO vê email lá e pode revisar manualmente
 */

import { getLogger } from '../logger.js';
import { moverComFallback, PASTA_PENDENTE } from './pastas.js';

const log = getLogger('erro-processamento');

/**
 * Tipo de erro que pode ocorrer
 */
export const TIPOS_ERRO = {
  IMAP_FALHA: 'imap_falha',
  CLAUDE_TIMEOUT: 'claude_timeout',
  CLAUDE_ERRO: 'claude_erro',
  CONVEX_FALHA: 'convex_falha',
  VALIDACAO: 'validacao',
  DESCONHECIDO: 'desconhecido',
};

/**
 * Registrar erro de processamento
 *
 * Cria registro estruturado que:
 * - CEO consegue ver em Pendente-Classificacao
 * - Sistema usa pra não reprocessar
 * - Ajuda debug de problemas
 *
 * @param {Object} erro - Informações do erro
 * @returns {Promise<{sucesso: boolean, registrado: boolean}>}
 */
export async function registrarErroProcessamento(erro) {
  const {
    uid,
    funcionarioId,
    tipo = TIPOS_ERRO.DESCONHECIDO,
    mensagem,
    stack,
    timestamp = Date.now(),
    tentativas = 1,
  } = erro;

  const registroErro = {
    uid,
    funcionarioId,
    tipo,
    mensagem,
    stack: stack ? stack.substring(0, 500) : null, // Limitar tamanho
    timestamp,
    tentativas,
    descricao: descricaoErro(tipo),
  };

  log.error(
    {
      uid,
      funcionarioId,
      tipo,
      mensagem,
      tentativas,
    },
    'Email falhou ao processar — movido para Pendente-Classificacao'
  );

  // TODO: Quando Convex integrado
  // await salvarErroEmConvex(registroErro);

  return { sucesso: true, registrado: true };
}

/**
 * Obter descrição legível do tipo de erro
 * (para CEO ver em Pendente-Classificacao)
 */
function descricaoErro(tipo) {
  const descricoes = {
    [TIPOS_ERRO.IMAP_FALHA]: 'Erro ao acessar email no servidor IMAP',
    [TIPOS_ERRO.CLAUDE_TIMEOUT]: 'IA demorou demais para classificar',
    [TIPOS_ERRO.CLAUDE_ERRO]: 'IA retornou erro na classificação',
    [TIPOS_ERRO.CONVEX_FALHA]: 'Falha ao salvar dados',
    [TIPOS_ERRO.VALIDACAO]: 'Email não passou em validação',
    [TIPOS_ERRO.DESCONHECIDO]: 'Erro desconhecido no processamento',
  };
  return descricoes[tipo] || 'Erro desconhecido';
}

/**
 * Tratar erro de processamento
 *
 * Ordem:
 * 1. Registrar erro estruturado
 * 2. Mover para Pendente-Classificacao
 * 3. Log do que aconteceu
 *
 * @param {ImapFlow} client - Cliente IMAP
 * @param {number} uid - UID do email
 * @param {number} nivel - Nível que tentava processar
 * @param {Error} err - Error object
 * @param {string} tipo - Tipo de erro (TIPOS_ERRO)
 * @returns {Promise<boolean>} - true se tratado com sucesso
 */
export async function tratarErroProcessamento(client, uid, nivel, err, tipo) {
  try {
    // 1. Registrar erro
    await registrarErroProcessamento({
      uid,
      tipo: tipo || inferirTipoErro(err),
      mensagem: err.message,
      stack: err.stack,
    });

    // 2. Tentar mover para Pendente-Classificacao
    const resultado = await moverComFallback(client, uid, nivel);

    if (resultado.pastaUsada === PASTA_PENDENTE || resultado.pastaUsada === 'INBOX') {
      log.warn(
        { uid, pasta: resultado.pastaUsada, erroOriginal: err.message },
        'Email movido para fallback — CEO pode revisar'
      );
      return true;
    }

    return false;
  } catch (errTratamento) {
    log.error(
      { uid, err: errTratamento.message },
      'Falha crítica ao tratar erro — email pode estar perdido'
    );
    return false;
  }
}

/**
 * Inferir tipo de erro a partir do Error object
 */
function inferirTipoErro(err) {
  if (!err) return TIPOS_ERRO.DESCONHECIDO;

  const msg = err.message?.toLowerCase() || '';

  if (msg.includes('imap') || msg.includes('mailbox')) {
    return TIPOS_ERRO.IMAP_FALHA;
  }
  if (msg.includes('timeout') || msg.includes('deadline')) {
    return TIPOS_ERRO.CLAUDE_TIMEOUT;
  }
  if (msg.includes('claude') || msg.includes('api')) {
    return TIPOS_ERRO.CLAUDE_ERRO;
  }
  if (msg.includes('convex') || msg.includes('database')) {
    return TIPOS_ERRO.CONVEX_FALHA;
  }
  if (msg.includes('invalid') || msg.includes('validation')) {
    return TIPOS_ERRO.VALIDACAO;
  }

  return TIPOS_ERRO.DESCONHECIDO;
}

/**
 * Obter estatísticas de erros
 * (quando Convex integrado)
 *
 * @returns {Promise<{totalErros, errosPorTipo, emailsEmPendente}>}
 */
export async function obterEstatisticasErros() {
  // TODO: Quando Convex integrado
  // return await buscarEstatisticasEmConvex();

  return {
    totalErros: 0,
    errosPorTipo: {},
    emailsEmPendente: 0,
  };
}
