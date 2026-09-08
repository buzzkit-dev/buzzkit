import { log } from '@buzzkit/ping/libs/logger';
import { Elysia } from 'elysia';

export class PingError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param?: string;

  constructor(status: number, message: string, options: { code: string; param?: string }) {
    super(message);
    this.name = 'PingError';
    this.status = status;
    this.code = options.code;
    this.param = options.param;
  }
}

export class BadRequestError extends PingError {
  constructor(message: string, options: { code: string; param?: string }) {
    super(400, message, options);
  }
}

export class UnknownKeyError extends PingError {
  constructor() {
    super(404, 'Unknown key — pair this device in Buzz, or rotate the key if you revoked it', {
      code: 'unknown_key',
    });
  }
}

export class NotFoundError extends PingError {
  constructor(message: string, options: { code: string }) {
    super(404, message, options);
  }
}

export class RateLimitedError extends PingError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(429, 'Too many pings — slow down', { code: 'rate_limited' });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function describeError(thrown: unknown): string {
  if (thrown instanceof Error) return `${thrown.name}: ${thrown.message}`;
  return String(thrown);
}

export const error = new Elysia({ name: 'error' })
  .error({ PingError })
  .onError({ as: 'global' }, ({ code, error: thrown, set, path }) => {
    if (thrown instanceof PingError) {
      set.status = thrown.status;
      if (thrown instanceof RateLimitedError) {
        set.headers['retry-after'] = String(thrown.retryAfterSeconds);
      }
      return { ok: false, error: { code: thrown.code, message: thrown.message, param: thrown.param } };
    }

    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        ok: false,
        error: {
          code: 'invalid_payload',
          message: 'The ping payload is not valid — see ping.buzzkit.dev/skill.md',
        },
      };
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { ok: false, error: { code: 'not_found', message: 'No such endpoint' } };
    }

    set.status = 500;
    log.error('[Ping] Unhandled error', { error: describeError(thrown), path });
    return { ok: false, error: { code: 'internal_error', message: 'Something went wrong on our side' } };
  });
