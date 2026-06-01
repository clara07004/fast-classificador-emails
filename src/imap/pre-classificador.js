/**
 * Pré-classificador Determinístico
 *
 * Classifica emails SEM usar Claude API baseado em:
 * 1. Padrões de urgência em subject/body (URGENTE, EMERGÊNCIA, etc)
 * 2. Sender whitelist/blacklist (VIP, conhecidos, spam)
 * 3. Detecção de auto-resposta/tickets
 * 4. Características de spam
 *
 * Objetivo: Reduzir chamadas a Claude, classificar óbvios rapidamente
 */

import { getLogger } from '../logger.js';

const log = getLogger('pre-classificador');

/**
 * Padrões de urgência que indicam classificação sem IA
 */
const PADROES_URGENCIA = {
  nivel_1: [
    /\bURGENTE\b/,  // Case-sensitive: apenas MAIÚSCULAS
    /EMERGÊNCIA|CRÍTICO|ASAP/,
    /cliente\s+perdid[ao]/i,
    /(site|fachada)\s+(caiu|down|off-line|interdit[ao])/i,
    /interrupção\s+(de|do)\s+(serviço|trabalho)/i,
  ],
  nivel_2: [
    /lembrete.*importante/i,
    /lembrete.*urgente/i,
    /pedido\s+(de|do)\s+cliente/i,
    // REMOVIDO: /importante/i — abrangente demais, qualquer newsletter dispara N2.
    // "lembrete.*importante" acima já cobre o caso legítimo.
    /\burgente\b/i,  // Case-insensitive mas como palavra completa
    /projeto\s+(em\s+atraso|atrasado)/i,
  ],
};

/**
 * Senders conhecidos e sua classificação padrão
 * Facilita aprender que certos senders sempre têm certa prioridade
 */
const SENDER_BLACKLIST = [
  /@linkedin\.com$/i,
  /@twitter\.com$/i,
  /@facebook\.com$/i,
  /@instagram\.com$/i,
  /noreply@/i,
  /no-reply@/i,
  /do-not-reply@/i,
  /notification@/i,
  /alert@/i,
  /automated@/i,
];

const SENDER_WHITELIST = {
  // Senders que sempre devem ter prioridade alta
  // Preenchido com base em aprendizado individual
};

/**
 * Tentar classificar email SEM usar Claude API
 *
 * @param {Object} email - Email normalizado
 * @param {string} email.from - Remetente (ex: "john@empresa.com")
 * @param {string} email.subject - Assunto
 * @param {string} email.text - Corpo do email (plain text)
 * @param {Object} funcionario - Dados do funcionário
 * @param {string} funcionario.id - ID do funcionário
 *
 * @returns {Promise<{classificado: boolean, nivel?: number, motivo?: string}>}
 *         - classificado=true se conseguiu classificar sem IA
 *         - nivel=1-5 se conseguiu (1=urgente, 5=FYI)
 *         - motivo descrevendo por que foi classificado
 */
export async function tentarClassificarSemIA(email, funcionario) {
  if (!email.subject || !email.from) {
    // Email inválido, precisa IA
    return { classificado: false };
  }

  const subject = email.subject;
  const from = email.from;
  const text = email.text || '';

  // 1. Verificar blacklist (spam automático)
  if (ehBlacklist(from)) {
    log.debug(
      { from, funcionarioId: funcionario.id },
      'Email de blacklist — classificado como FYI'
    );
    return {
      classificado: true,
      nivel: 5,
      motivo: 'sender_blacklist',
    };
  }

  // 2. Verificar whitelist (VIP)
  if (SENDER_WHITELIST[from]) {
    const nivelVIP = SENDER_WHITELIST[from];
    log.debug(
      { from, nivelVIP, funcionarioId: funcionario.id },
      'Email de whitelist VIP'
    );
    return {
      classificado: true,
      nivel: nivelVIP,
      motivo: 'sender_whitelist',
    };
  }

  // 3. Detectar urgência em subject/body
  const nivelUrgencia = detectarUrgencia(subject, text);
  if (nivelUrgencia) {
    log.debug(
      { from, nivelUrgencia, funcionarioId: funcionario.id },
      'Urgência detectada em padrões'
    );
    return {
      classificado: true,
      nivel: nivelUrgencia,
      motivo: 'urgencia_detectada',
    };
  }

  // 4. Detectar auto-resposta (vacation, out-of-office)
  if (ehAutoresposta(subject, text)) {
    log.debug(
      { from, funcionarioId: funcionario.id },
      'Auto-resposta detectada — FYI'
    );
    return {
      classificado: true,
      nivel: 5,
      motivo: 'auto_resposta',
    };
  }

  // 5. Detectar ticket/ID de suporte (empresa vai manter isso)
  if (ehTicket(subject)) {
    log.debug(
      { from, funcionarioId: funcionario.id },
      'Ticket/ID detectado — Normal'
    );
    return {
      classificado: true,
      nivel: 3,
      motivo: 'ticket_detectado',
    };
  }

  // Não conseguiu classificar — precisa IA
  return { classificado: false };
}

/**
 * Detectar nível de urgência no subject/body
 * @returns {number|null} - 1 se muito urgente, 2 se urgente, null se normal
 */
function detectarUrgencia(subject, body) {
  const texto = `${subject || ''} ${body || ''}`.substring(0, 1000);

  // Verificar padrões nível 1
  for (const padrao of PADROES_URGENCIA.nivel_1) {
    if (padrao.test(texto)) {
      return 1;
    }
  }

  // Verificar padrões nível 2
  for (const padrao of PADROES_URGENCIA.nivel_2) {
    if (padrao.test(texto)) {
      return 2;
    }
  }

  return null;
}

/**
 * Verificar se sender está em blacklist
 */
function ehBlacklist(from) {
  return SENDER_BLACKLIST.some((pattern) => pattern.test(from));
}

/**
 * Detectar auto-resposta automática (vacation, out-of-office)
 */
function ehAutoresposta(subject, body) {
  const texto = `${subject || ''} ${body || ''}`.toLowerCase();
  const padroes = [
    /out of office/i,
    /out-of-office/i,
    /ausente/i,
    /férias/i,
    /vacation/i,
    /autom[áa]tic[ao]/i,
    /auto.respuesta/i,
    /automatic reply/i,
    /away from office/i,
  ];

  return padroes.some((p) => p.test(texto));
}

/**
 * Detectar ticket/ID de suporte
 * Empresas costumam rastrear tickets assim: [TICKET-123], REQ#456, etc
 */
function ehTicket(subject) {
  const padroes = [
    /\[TICKET-\d+\]/i,
    /\[REQ-?\d+\]/i,
    /\[ISSUE-\d+\]/i,
    /\[TAG-\d+\]/i,
    /\bREQ#\d+\b/i,
    /\bTKT#\d+\b/i,
  ];

  return padroes.some((p) => p.test(subject || ''));
}

/**
 * Atualizar whitelist de sender VIP
 * (Usado quando CEO confirma repetidamente um sender como prioridade)
 *
 * @param {string} from - Email do sender
 * @param {number} nivel - Nível desejado (1-5)
 */
export function adicionarSenderVIP(from, nivel) {
  if (nivel < 1 || nivel > 5) {
    log.warn({ from, nivel }, 'Nível VIP inválido');
    return false;
  }

  SENDER_WHITELIST[from] = nivel;
  log.info({ from, nivel }, 'Sender VIP adicionado');
  return true;
}

/**
 * Remover sender da whitelist VIP
 */
export function removerSenderVIP(from) {
  delete SENDER_WHITELIST[from];
  log.info({ from }, 'Sender VIP removido');
}

/**
 * Obter relatório de padrões detectados
 * (Útil para debug e entender por que certos emails foram classificados)
 */
export function analisarEmail(email) {
  const subject = email.subject || '';
  const from = email.from || '';
  const text = email.text || '';

  const analise = {
    ehBlacklist: ehBlacklist(from),
    ehVIP: !!SENDER_WHITELIST[from],
    nivelUrgencia: detectarUrgencia(subject, text),
    ehAutoresposta: ehAutoresposta(subject, text),
    ehTicket: ehTicket(subject),
  };

  return analise;
}
