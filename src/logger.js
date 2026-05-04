/**
 * Logger estruturado padrão da Fast.
 *
 * Em produção emite JSON via stdout (pino).
 * Em desenvolvimento usa pino-pretty pra console legível.
 *
 * Uso:
 *   import { getLogger } from './logger.js';
 *   const log = getLogger('meu-modulo');
 *   log.info({ items: 42 }, 'Processo iniciado');
 */

import pino from 'pino';

const SENSITIVE_KEYS = ['token', 'password', 'apiKey', 'api_key', 'secret', 'authorization'];

/**
 * Redator que mascara campos sensíveis em logs estruturados.
 */
function buildRedactPaths() {
  const paths = [];
  for (const key of SENSITIVE_KEYS) {
    paths.push(key, `*.${key}`, `*.*.${key}`);
  }
  return paths;
}

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'pretty';
const projectName = process.env.PROJECT_NAME || 'fast-classificador-emails';
const environment = process.env.ENVIRONMENT || 'development';

const baseLogger = pino({
  level: logLevel,
  base: { project: projectName, environment },
  redact: {
    paths: buildRedactPaths(),
    censor: '***',
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

/**
 * Retorna um logger com binding de módulo.
 * @param {string} moduleName
 */
export function getLogger(moduleName) {
  return baseLogger.child({ module: moduleName });
}

export default baseLogger;
