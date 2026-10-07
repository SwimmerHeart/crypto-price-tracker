export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface Logger {
  error(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  trace(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}


export interface LoggerOptions {
  level?: LogLevel;
  write?: (line: string) => void;
  base?: Record<string, unknown>;
}


const LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100
}

export function resolveLevel(raw?: string): LogLevel {
  return raw !== undefined && raw in LEVELS ? (raw as LogLevel) : 'info'
}

function serializeError(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? resolveLevel(process.env.LOG_LEVEL)
  const write = options.write ?? ((line: string) => process.stdout.write(line + '\n'))
  const base = options.base ?? {}

  function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    if (LEVELS[level] < LEVELS[minLevel]) return

    const safe = { ...base, ...fields }
    for (const key of Object.keys(safe)) {
      if (safe[key] instanceof Error) safe[key] = serializeError(safe[key] as Error)
    }

    let line: string
    const time = new Date().toISOString()
    try {
      line = JSON.stringify({
        ...safe,
        level,
        time,
        message
      });
    } catch {
      line = JSON.stringify({
        level,
        time,
        message,
        note: 'serialization failed'
      });
    }

    write(line)
  }

  return {
    error: (m, f) => log('error', m, f),
    warn: (m, f) => log('warn', m, f),
    info: (m, f) => log('info', m, f),
    debug: (m, f) => log('debug', m, f),
    trace: (m, f) => log('trace', m, f),
    child: (bindings) => createLogger({ level: minLevel, write, base: { ...base, ...bindings } })
  }
}

export const logger = createLogger()
