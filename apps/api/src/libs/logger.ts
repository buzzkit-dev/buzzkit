import { env } from 'cloudflare:workers';
import { Elysia } from 'elysia';

type Level = 'debug' | 'info' | 'warn' | 'error';

type Entry = { level: Level; message: string; fields?: Record<string, unknown>; timestamp: number };

/**
 * Buffered request logger: entries accumulate during a request and flush once
 * after the response. Console-backed for now (visible in `wrangler dev` and
 * Workers observability); the Phase 10 observability pass swaps the sink for
 * Axiom/OTel without changing call sites.
 */
class BufferedLogger {
  private buffer: Entry[] = [];

  private push(level: Level, message: string, fields?: Record<string, unknown>) {
    this.buffer.push({ level, message, fields, timestamp: Date.now() });
  }

  debug(message: string, fields?: Record<string, unknown>) {
    this.push('debug', message, fields);
  }

  info(message: string, fields?: Record<string, unknown>) {
    this.push('info', message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>) {
    this.push('warn', message, fields);
  }

  error(message: string, fields?: Record<string, unknown>) {
    this.push('error', message, fields);
  }

  flush() {
    const entries = this.buffer;
    this.buffer = [];
    for (const entry of entries) {
      if (entry.level === 'debug' && env.ENVIRONMENT !== 'development') continue;
      // biome-ignore lint/suspicious/noConsole: the single console sink until the observability phase
      console[entry.level](entry.message, entry.fields ?? '');
    }
  }
}

export const log = new BufferedLogger();

export const logger = new Elysia({ name: 'logger' }).onAfterResponse({ as: 'global' }, () => {
  log.flush();
});
