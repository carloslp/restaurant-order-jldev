// Logging estructurado mínimo para el servidor.
// - Niveles debug/info/warn/error.
// - Un contexto (requestId, acción) se propaga como prefijo.
// - JSON en producción (parseable por logs de Vercel/Supabase); texto legible en dev.
// Regla: los mensajes al usuario nunca salen de aquí; esto es solo para ops.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  child: (scope: string) => Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): LogLevel {
  if (process.env.NODE_ENV === 'production') return 'info';
  return 'debug';
}

function emit(level: LogLevel, scope: string, msg: string, data?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(data !== undefined && data !== null
      ? { data: data instanceof Error ? { message: data.message, code: (data as any).code } : data }
      : {}),
  };
  if (process.env.NODE_ENV === 'production') {
    // JSON en una línea para ingesta de logs.
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  const dataStr = payload.data !== undefined ? ` ${JSON.stringify(payload.data)}` : '';
  const line = `[${payload.ts}] ${level.toUpperCase()} (${scope}) ${msg}${dataStr}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, data) => emit('debug', scope, msg, data),
    info: (msg, data) => emit('info', scope, msg, data),
    warn: (msg, data) => emit('warn', scope, msg, data),
    error: (msg, data) => emit('error', scope, msg, data),
    child: (childScope: string) => createLogger(`${scope}:${childScope}`),
  };
}
