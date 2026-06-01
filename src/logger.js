/**
 * Logger estruturado padrao da Fast.
 *
 * Em producao emite JSON via stdout (pino).
 * Em desenvolvimento usa pino-pretty pra console legivel.
 *
 * PII e LGPD:
 *   Serializers automaticos mascaram conteudo de email antes de gravar em disco.
 *   - from / remetente / remetenteEmail -> ***@dominio.com
 *   - subject / assunto / body / texto / text / html / corpo -> [N chars]
 *   - Objetos com chave `email` sao serializados com todos os sub-campos mascarados
 */

import pino from 'pino';

// ---------------------------------------------------------------------------
// Funcoes auxiliares (definidas antes do logger para uso nos serializers)
// ---------------------------------------------------------------------------

/**
 * Mascara endereco de email para logs - preserva dominio, oculta usuario.
 * Ex: clara.barbosa@fastdrywall.com.br => ***@fastdrywall.com.br
 */
export function mascarEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const at = email.indexOf('@');
  if (at === -1) return '***';
  return '***@' + email.slice(at + 1);
}

/**
 * Substitui conteudo de texto por contagem de caracteres.
 * Ex: "Ola, segue orcamento..." => "[34 chars]"
 */
function truncarConteudo(val) {
  if (!val) return val;
  if (typeof val !== 'string') return val;
  return '[' + val.length + ' chars]';
}

/**
 * Serializa objeto de email completo mascarando todos os campos PII.
 * Usado quando o objeto inteiro e passado para o logger (ex: log.warn({ email })).
 */
function serializarEmailObj(emailObj) {
  if (!emailObj || typeof emailObj !== 'object') return emailObj;
  const r = { ...emailObj };

  // Enderecos de email -> manter dominio
  if (r.from)           r.from           = mascarEmail(r.from);
  if (r.to)             r.to             = mascarEmail(r.to);
  if (r.replyTo)        r.replyTo        = mascarEmail(r.replyTo);
  if (r.remetente)      r.remetente      = mascarEmail(r.remetente);
  if (r.remetenteEmail) r.remetenteEmail = mascarEmail(r.remetenteEmail);

  // Conteudo -> substituir por contagem de caracteres
  if (r.subject)          r.subject          = truncarConteudo(r.subject);
  if (r.assunto)          r.assunto          = truncarConteudo(r.assunto);
  if (r.text)             r.text             = truncarConteudo(r.text);
  if (r.html)             r.html             = truncarConteudo(r.html);
  if (r.body)             r.body             = truncarConteudo(r.body);
  if (r.texto)            r.texto            = truncarConteudo(r.texto);
  if (r.corpo)            r.corpo            = truncarConteudo(r.corpo);
  if (r.rascunho)         r.rascunho         = truncarConteudo(r.rascunho);
  if (r.rascunhoResposta) r.rascunhoResposta = truncarConteudo(r.rascunhoResposta);

  return r;
}

// ---------------------------------------------------------------------------
// Configuracao Pino
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = ['token', 'password', 'apiKey', 'api_key', 'secret', 'authorization'];

function buildRedactPaths() {
  const paths = [];
  for (const key of SENSITIVE_KEYS) {
    paths.push(key, '*.' + key, '*.*.' + key);
  }
  return paths;
}

const logLevel    = process.env.LOG_LEVEL    || 'info';
const logFormat   = process.env.LOG_FORMAT   || 'pretty';
const projectName = process.env.PROJECT_NAME || 'fast-classificador-emails';
const environment = process.env.ENVIRONMENT  || 'development';

const baseLogger = pino({
  level: logLevel,
  base: { project: projectName, environment },

  // Redact de credenciais (tokens, senhas, chaves de API)
  redact: {
    paths: buildRedactPaths(),
    censor: '***',
  },

  // Serializers de PII — aplicados automaticamente em todos os call sites
  serializers: {
    // Objeto de email completo
    email: serializarEmailObj,

    // Campos individuais — enderecos
    from:           mascarEmail,
    to:             mascarEmail,
    remetente:      mascarEmail,
    remetenteEmail: mascarEmail,

    // Campos individuais — conteudo
    subject:          truncarConteudo,
    assunto:          truncarConteudo,
    body:             truncarConteudo,
    texto:            truncarConteudo,
    text:             truncarConteudo,
    html:             truncarConteudo,
    corpo:            truncarConteudo,
    rascunho:         truncarConteudo,
    rascunhoResposta: truncarConteudo,
  },

  ...(logFormat === 'pretty'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname,project,environment',
          },
        },
      }
    : {}),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Retorna um logger com binding de modulo.
 * @param {string} moduleName
 */
export function getLogger(moduleName) {
  return baseLogger.child({ module: moduleName });
}

export default baseLogger;
