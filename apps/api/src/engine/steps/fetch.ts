import { NonRetryableError } from 'cloudflare:workflows';
import { resolveSecrets } from '@buzzkit/api/api/secrets/index';
import { stepDb } from '@buzzkit/api/libs/database';
import type { Span as StepSpan } from '@buzzkit/observability';
import {
  DEFAULT_FETCH_TIMEOUT_SECONDS,
  FETCH_TIMEOUT_PATTERN,
  type FetchStep,
  MAX_FETCH_RESPONSE_BYTES,
} from '@buzzkit/schema/workflows';
import { FETCH_RETRY_DELAY_MS, FETCH_RETRY_LIMIT, FETCH_USER_AGENT, LOCAL_FETCH_HOSTS } from '../constants';
import type { RunContext } from '../context';
import { describeFailure } from '../errors';
import { renderTemplate, renderValue } from '../template';

type FetchResult = {
  at: string;
  status: number | null;
  headersJson: string;
  dataJson: string;
  failed: boolean;
  error: string | null;
};

function assertFetchable(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NonRetryableError(`fetch_blocked: "${raw}" is not an address`);
  }
  const local = url.protocol === 'http:' && LOCAL_FETCH_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new NonRetryableError(`fetch_blocked: only https addresses can be fetched, got ${url.origin}`);
  }

  return url;
}

function timeoutMs(timeout: string | undefined): number {
  const match = timeout ? FETCH_TIMEOUT_PATTERN.exec(timeout) : null;
  return (match ? Number(match[1]) : DEFAULT_FETCH_TIMEOUT_SECONDS) * 1000;
}

function expected(request: FetchStep['fetch'], status: number): boolean {
  if (request.expect) return request.expect.status.includes(status);
  return status >= 200 && status < 300;
}

async function readBody(response: Response, host: string): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_FETCH_RESPONSE_BYTES) {
    throw new NonRetryableError(`${host} answered with more than ${MAX_FETCH_RESPONSE_BYTES / 1024} KB`);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_FETCH_RESPONSE_BYTES) {
    throw new NonRetryableError(`${host} answered with more than ${MAX_FETCH_RESPONSE_BYTES / 1024} KB`);
  }
  if (text.trim().length === 0) return null;
  const type = response.headers.get('content-type') ?? '';
  if (!/json/i.test(type)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new NonRetryableError(`${host} said it answered JSON but did not`);
  }
}

function methodOf(request: FetchStep['fetch']): string {
  return request.method ?? (request.body === undefined ? 'GET' : 'POST');
}

async function attempt(context: RunContext, current: FetchStep, span?: StepSpan): Promise<FetchResult> {
  const { name, fetch: request } = current;
  const db = stepDb();
  const scope = context.scope();
  const withSecrets = { ...scope, secrets: await resolveSecrets(db, context.params.tenantId) };
  const options = context.rendering();
  const url = assertFetchable(renderTemplate(request.url, withSecrets, options));
  const method = methodOf(request);
  const headers = new Headers({ 'user-agent': FETCH_USER_AGENT });
  for (const [header, value] of Object.entries(request.headers ?? {})) {
    headers.set(header, renderTemplate(value, withSecrets, options));
  }
  let body: string | undefined;
  if (request.body !== undefined) {
    if (typeof request.body === 'string') {
      body = renderTemplate(request.body, scope, options);
    } else {
      body = JSON.stringify(renderValue(request.body, scope, options));
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
  }
  headers.set('webhook-id', `${context.params.runId}:${name}`);
  headers.set('webhook-timestamp', String(Math.floor(context.now() / 1000)));

  if (!context.live) {
    const assumed = context.assumption(name);
    const status = assumed?.status ?? (assumed ? 200 : null);
    await context.report(
      name,
      'completed',
      assumed ? `Assumed ${url.host} answers ${status}` : `Would call ${method} ${url.host}`,
      { method, url: url.toString(), responseStatus: status }
    );
    if (status !== null && !expected(request, status)) {
      throw new NonRetryableError(`${url.host} answered ${status}`);
    }

    return {
      at: new Date(context.now()).toISOString(),
      status,
      headersJson: '{}',
      dataJson: JSON.stringify(assumed?.data ?? null),
      failed: false,
      error: null,
    };
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs(request.timeout)),
  });
  span?.set('fetch.host', url.host);
  span?.set('fetch.status', response.status);
  if (!expected(request, response.status)) {
    if (response.status >= 500) throw new Error(`${url.host} answered ${response.status}`);
    throw new NonRetryableError(`${url.host} answered ${response.status}`);
  }
  const data = await readBody(response, url.host);
  await context.report(name, 'completed', `Fetched ${method} ${url.host} (${response.status})`, {
    method,
    url: url.toString(),
    responseStatus: response.status,
  });

  return {
    at: new Date(context.now()).toISOString(),
    status: response.status,
    headersJson: JSON.stringify(Object.fromEntries(response.headers.entries())),
    dataJson: JSON.stringify(data ?? null),
    failed: false,
    error: null,
  };
}

export async function runFetch(context: RunContext, current: FetchStep): Promise<void> {
  const { name, fetch: request } = current;
  const onError = request.onError ?? 'fail';
  let result: FetchResult;
  try {
    result = await context.do(`${name}:fetch`, (t) => attempt(context, current, t), {
      retries: {
        limit: FETCH_RETRY_LIMIT,
        delay: context.scaled(FETCH_RETRY_DELAY_MS),
        backoff: 'exponential',
      },
    });
  } catch (error) {
    if (onError === 'fail') throw error;
    const reason = describeFailure(error);
    result = await context.do(`${name}:${onError}`, async () => {
      await context.report(
        name,
        onError === 'skip' ? 'skipped' : 'completed',
        onError === 'skip' ? `Skipped: ${reason}` : `Continued without data: ${reason}`,
        { error: reason }
      );

      return {
        at: new Date(context.now()).toISOString(),
        status: null,
        headersJson: '{}',
        dataJson: 'null',
        failed: true,
        error: reason,
      };
    });
  }
  const data = JSON.parse(result.dataJson) as unknown;
  context.state.steps[name] = {
    at: result.at,
    status: result.status,
    headers: JSON.parse(result.headersJson) as Record<string, string>,
    data,
    failed: result.failed,
    ...(result.error ? { error: result.error } : {}),
  };
  if (request.as) context.state.vars[request.as] = data;
}
