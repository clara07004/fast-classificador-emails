/**
 * Gerenciamento de Pastas IMAP
 *
 * Responsável por:
 * 1. Garantir que pastas Fast/* existem
 * 2. Mover emails com validação
 * 3. Fallback para Pendente-Classificacao se falhar
 */

import { getLogger } from '../logger.js';

const log = getLogger('imap-pastas');

/**
 * Mapa de pastas Fast por nível de prioridade
 * Prioridade (1-5) → Nome da pasta no IMAP
 */
const PASTAS_POR_NIVEL = {
  1: 'INBOX.Fast-Urgente',
  2: 'INBOX.Fast-Alta-Prioridade',
  3: 'INBOX.Fast-Normal',
  4: 'INBOX.Fast-Baixa',
  5: 'INBOX.Fast-Irrelevante',
};

const PASTA_PENDENTE = 'INBOX.Fast-Pendente-Classificacao';
const PASTA_FALLBACK = 'INBOX'; // Se tudo falhar, deixa em INBOX

/**
 * Validar que uma pasta existe no IMAP
 * @param {ImapFlow} client - Cliente IMAP
 * @param {string} pastaName - Nome da pasta
 * @returns {Promise<boolean>} - true se existe, false senão
 */
export async function pastaExiste(client, pastaName) {
  try {
    const mailboxes = await client.list();
    return mailboxes.some((mbox) => mbox.path === pastaName);
  } catch (err) {
    log.error({ err: err.message, pasta: pastaName }, 'Erro ao verificar existência de pasta');
    return false;
  }
}

/**
 * Criar pasta se não existir
 * @param {ImapFlow} client - Cliente IMAP
 * @param {string} pastaName - Nome da pasta
 * @returns {Promise<{sucesso: boolean, criada: boolean, msg: string}>}
 */
export async function garantirPasta(client, pastaName) {
  try {
    // Verificar se existe
    const existe = await pastaExiste(client, pastaName);
    if (existe) {
      log.debug({ pasta: pastaName }, 'Pasta já existe');
      return { sucesso: true, criada: false, msg: 'Pasta já existe' };
    }

    // Tentar criar
    log.info({ pasta: pastaName }, 'Criando pasta...');
    await client.mailboxCreate(pastaName);
    log.info({ pasta: pastaName }, 'Pasta criada com sucesso');

    return { sucesso: true, criada: true, msg: 'Pasta criada' };
  } catch (err) {
    log.error({ err: err.message, pasta: pastaName }, 'Erro ao criar pasta');
    return { sucesso: false, criada: false, msg: err.message };
  }
}

/**
 * Garantir que todas as pastas Fast/* existem
 * Chamado na primeira conexão
 * @param {ImapFlow} client - Cliente IMAP
 * @returns {Promise<{sucesso: boolean, pastas: Object}>}
 */
export async function garantirPastasFast(client) {
  log.info('Garantindo que pastas Fast/* existem...');

  const pastasNecessarias = [
    ...Object.values(PASTAS_POR_NIVEL),
    PASTA_PENDENTE,
  ];

  const resultados = {};

  for (const pasta of pastasNecessarias) {
    const resultado = await garantirPasta(client, pasta);
    resultados[pasta] = resultado;

    if (!resultado.sucesso) {
      log.warn(
        { pasta, erro: resultado.msg },
        'Falha ao garantir pasta — pode causar problemas ao mover emails'
      );
    }
  }

  // Sucesso geral se pelo menos as 5 pastas principais existem
  const sucessoPrincipal = Object.values(PASTAS_POR_NIVEL).every(
    (pasta) => resultados[pasta]?.sucesso
  );

  log.info(
    { sucessoPrincipal, detalhes: resultados },
    'Verificação de pastas concluída'
  );

  return { sucesso: sucessoPrincipal, pastas: resultados };
}

/**
 * Mover email para pasta com fallback
 *
 * Ordem de tentativa:
 * 1. Mover para pasta de prioridade (Fast-Urgente, etc)
 * 2. Se falhar, tentar Pendente-Classificacao
 * 3. Se falhar, deixar em INBOX (fallback final)
 *
 * @param {ImapFlow} client - Cliente IMAP
 * @param {number} uid - UID do email
 * @param {number} nivel - Nível de prioridade (1-5)
 * @returns {Promise<{sucesso: boolean, pastaUsada: string, erro?: string}>}
 */
export async function moverComFallback(client, uid, nivel) {
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 5) {
    return {
      sucesso: false,
      pastaUsada: null,
      erro: `Nível inválido: ${nivel}. Deve ser 1-5`,
    };
  }

  const pastaDesejada = PASTAS_POR_NIVEL[nivel];

  // Tentar mover para pasta de prioridade
  try {
    log.debug(
      { uid, nivel, pasta: pastaDesejada },
      'Movendo email para pasta de prioridade'
    );

    await client.messageMove(uid, pastaDesejada);

    log.info(
      { uid, nivel, pasta: pastaDesejada },
      'Email movido com sucesso'
    );

    return {
      sucesso: true,
      pastaUsada: pastaDesejada,
    };
  } catch (err) {
    log.warn(
      { uid, err: err.message, pastaDesejada },
      'Falha ao mover para pasta de prioridade, tentando Pendente-Classificacao'
    );
  }

  // Fallback 1: Tentar Pendente-Classificacao
  try {
    await client.messageMove(uid, PASTA_PENDENTE);

    log.info(
      { uid, pasta: PASTA_PENDENTE },
      'Email movido para Pendente-Classificacao'
    );

    return {
      sucesso: true,
      pastaUsada: PASTA_PENDENTE,
      aviso: 'Movido para Pendente-Classificacao (fallback)',
    };
  } catch (err) {
    log.warn(
      { uid, err: err.message },
      'Falha ao mover para Pendente-Classificacao, deixando em INBOX'
    );
  }

  // Fallback 2: Deixar em INBOX (não tenta mover)
  log.warn(
    { uid, pastaDesejada },
    'Email deixado em INBOX (fallback final)'
  );

  return {
    sucesso: true,
    pastaUsada: PASTA_FALLBACK,
    aviso: 'Email deixado em INBOX (fallback final)',
  };
}

/**
 * Obter nome da pasta para um nível de prioridade
 * @param {number} nivel - Nível de prioridade (1-5)
 * @returns {string|undefined} - Nome da pasta ou undefined se nível inválido
 */
export function obterPastaParaNivel(nivel) {
  return PASTAS_POR_NIVEL[nivel];
}

/**
 * Validar se nível é válido
 * @param {number} nivel
 * @returns {boolean}
 */
export function nivelValido(nivel) {
  return Number.isInteger(nivel) && nivel >= 1 && nivel <= 5;
}

/**
 * Obter todos os nomes de pastas Fast
 * @returns {string[]} - Array com nomes das pastas
 */
export function obterTodasAsPastas() {
  return [
    ...Object.values(PASTAS_POR_NIVEL),
    PASTA_PENDENTE,
  ];
}
