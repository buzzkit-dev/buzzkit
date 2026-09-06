import { BuzzKitError, ConnectionError, type ErrorBody, resolveError, TimeoutError } from './errors';
import type { Page, PageParams, PagePromise } from './pagination';
import { paginate } from './pagination';
import { isRetryableStatus, nextRetryDelayMs, parseRetryAfter, RETRY_POLICY, sleep } from './retry';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type QueryValue = string | number | boolean | undefined | null;

type QueryParams = Record<string, QueryValue>;

export type RequestOptions = {
  method: HttpMethod;
  path: string;
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

type Envelope<T> = {
  success: boolean;
  data: T | null;
  error: ErrorBody | null;
  metadata?: { timestamp: string; requestId?: string };
};

const IDEMPOTENT_METHODS = new Set<HttpMethod>(['GET', 'PUT', 'DELETE']);

export function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function randomIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function buildQuery(query: QueryParams | undefined): string {
  if (!query) return '';

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }

  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

function resolveSignal(timeoutMs: number, caller: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!caller) return timeout;
  return AbortSignal.any([timeout, caller]);
}

function isAbortReason(caught: unknown): boolean {
  if (typeof caught !== 'object' || caught === null) return false;

  const { name } = caught as { name?: unknown };
  return name === 'TimeoutError' || name === 'AbortError';
}

export type TransportOptions = {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  headers: Record<string, string>;
  fetch: typeof globalThis.fetch;
};

export class Transport {
  private readonly options: TransportOptions;

  constructor(options: TransportOptions) {
    this.options = options;
  }

  with(headers: Record<string, string | null>): Transport {
    const merged = { ...this.options.headers };
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) delete merged[name];
      else merged[name] = value;
    }

    return new Transport({ ...this.options, headers: merged });
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const policy = { ...RETRY_POLICY, maxRetries: this.options.maxRetries };
    const retryable = IDEMPOTENT_METHODS.has(options.method) || options.idempotencyKey !== undefined;

    let attemptsMade = 0;
    for (;;) {
      const outcome = await this.attempt<T>(options);
      if ('value' in outcome) return outcome.value;

      const exhausted = attemptsMade >= policy.maxRetries;
      if (exhausted || !retryable || !outcome.retryable) throw outcome.error;

      await sleep(nextRetryDelayMs(policy, attemptsMade, outcome.retryAfterSeconds));
      attemptsMade += 1;
    }
  }

  requestPage<T, TParams extends PageParams>(
    load: (params: TParams) => Promise<Page<T>>,
    params: TParams
  ): PagePromise<T> {
    return paginate(load, params);
  }

  private async attempt<T>(
    options: RequestOptions
  ): Promise<{ value: T } | { error: BuzzKitError; retryable: boolean; retryAfterSeconds?: number }> {
    const headers = this.buildHeaders(options);
    const url = `${this.options.baseUrl}${options.path}${buildQuery(options.query)}`;

    let response: Response;
    try {
      response = await this.options.fetch(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: resolveSignal(this.options.timeoutMs, options.signal),
      });
    } catch (caught) {
      if (isAbortReason(caught)) {
        const timeout = new TimeoutError(
          `Request to ${options.method} ${options.path} timed out after ${this.options.timeoutMs}ms`,
          caught
        );
        return { error: timeout, retryable: true };
      }

      const message = caught instanceof Error ? caught.message : String(caught);
      return {
        error: new ConnectionError(`Could not reach the BuzzKit API: ${message}`, { cause: caught }),
        retryable: true,
      };
    }

    try {
      return await this.readEnvelope<T>(response, options);
    } catch (caught) {
      if (isAbortReason(caught)) {
        const timeout = new TimeoutError(
          `Request to ${options.method} ${options.path} timed out after ${this.options.timeoutMs}ms`,
          caught
        );
        return { error: timeout, retryable: true };
      }

      const message = caught instanceof Error ? caught.message : String(caught);
      return {
        error: new ConnectionError(`The BuzzKit API response could not be read: ${message}`, {
          cause: caught,
        }),
        retryable: true,
      };
    }
  }

  private async readEnvelope<T>(
    response: Response,
    options: RequestOptions
  ): Promise<{ value: T } | { error: BuzzKitError; retryable: boolean; retryAfterSeconds?: number }> {
    const requestId = response.headers.get('request-id') ?? undefined;
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    const text = await response.text();

    let envelope: Envelope<T> | undefined;
    if (text.length > 0) {
      try {
        envelope = JSON.parse(text) as Envelope<T>;
      } catch {
        envelope = undefined;
      }
    }

    if (!response.ok || envelope?.success === false) {
      const body: ErrorBody = envelope?.error ?? {
        code: 'internal',
        message: `The BuzzKit API answered ${response.status} for ${options.method} ${options.path}`,
      };

      return {
        error: resolveError(response.status, body, {
          requestId: envelope?.metadata?.requestId ?? requestId,
          retryAfterSeconds,
        }),
        retryable: isRetryableStatus(response.status),
        retryAfterSeconds,
      };
    }

    if (!envelope) {
      return {
        error: new BuzzKitError(
          `The BuzzKit API answered ${options.method} ${options.path} with a body that is not JSON`,
          { status: response.status, code: 'parse', requestId }
        ),
        retryable: false,
      };
    }

    return { value: envelope.data as T };
  }

  private buildHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...this.options.headers,
      ...options.headers,
    };

    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

    return headers;
  }
}
