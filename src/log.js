// Logger simples com timestamp. `logDebug` so imprime quando DEBUG=true no .env;
// `logInfo`/`logError` sempre imprimem. Mantem segredos fora do log.

const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true';

function ts() {
  return new Date().toISOString();
}

function fmt(extra) {
  if (extra === undefined) return '';
  try {
    return ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
  } catch {
    return ' ' + String(extra);
  }
}

export function logInfo(msg, extra) {
  console.log(`[${ts()}] INFO  ${msg}${fmt(extra)}`);
}

export function logError(msg, extra) {
  console.error(`[${ts()}] ERRO  ${msg}${fmt(extra)}`);
}

export function logDebug(msg, extra) {
  if (!DEBUG) return;
  console.log(`[${ts()}] DEBUG ${msg}${fmt(extra)}`);
}

export const debugAtivo = DEBUG;
