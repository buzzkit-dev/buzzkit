type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

function write(level: Level, message: string, fields?: Fields): void {
  // biome-ignore lint/suspicious/noConsole: console is the Workers Logs sink
  console[level](
    JSON.stringify({
      _time: new Date().toISOString(),
      level,
      message,
      'service.name': 'buzzkit-ping',
      ...fields,
    })
  );
}

export const log = {
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
