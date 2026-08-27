import { env } from 'cloudflare:workers';
import { gunzipSync } from 'node:zlib';
import { readCache, writeCache } from '@buzzkit/api/libs/cache';
import { UnavailableError } from '@buzzkit/api/libs/error';
import {
  appendEvents,
  chunkLines,
  type EventRow,
  formatClickHouseDateTime,
  formatClickHouseTime,
  parseClickHouseTime,
  resolveTinybirdToken,
  resolveTinybirdWorkspaceId,
  signTinybirdJwt,
} from '@buzzkit/api/libs/tinybird';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/cache', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));

const bindings = env as Record<string, unknown>;
const fetchMock = vi.fn<typeof fetch>();
const authCache = { get: vi.fn(), put: vi.fn() };

const workspaceToken = (claims: Record<string, unknown>) =>
  ['header', Buffer.from(JSON.stringify(claims)).toString('base64'), 'signature'].join('.');

const decodeSegment = (segment: string) => JSON.parse(Buffer.from(segment, 'base64url').toString());

const jsonResponse =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    );

const eventRow = (index: number): EventRow => ({
  workspace_id: 1,
  tenant_id: 3,
  subscriber_id: 7,
  external_id: 'user_a',
  id: `evt_${index}`,
  sequence: index,
  name: 'order.paid',
  source: 'server',
  timestamp: '2026-08-27 12:00:00.000',
  received_at: '2026-08-27 12:00:00.001',
  data: { index, nested: [1, { deep: 'yes' }] },
  data_raw: JSON.stringify({ index, nested: [1, { deep: 'yes' }] }),
  run_id: null,
  message_id: null,
  step: null,
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(bindings, {
    TINYBIRD_URL: 'https://api.tinybird.co',
    TINYBIRD_TOKEN: 'p.token',
    AUTH_CACHE: authCache,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.mocked(readCache).mockReset();
  vi.mocked(writeCache).mockReset();
  for (const key of ['TINYBIRD_URL', 'TINYBIRD_TOKEN', 'AUTH_CACHE']) delete bindings[key];
});

describe('ClickHouse time formatting', () => {
  it('formats ISO input as UTC with millisecond precision', () => {
    expect(formatClickHouseTime('2026-08-27T12:00:00.123Z')).toBe('2026-08-27 12:00:00.123');
    expect(formatClickHouseTime('2026-08-27T14:00:00.123+02:00')).toBe('2026-08-27 12:00:00.123');
    expect(formatClickHouseTime('2026-08-27T12:00:00Z')).toBe('2026-08-27 12:00:00.000');
  });

  it('truncates to seconds for DateTime columns', () => {
    expect(formatClickHouseDateTime('2026-08-27T12:00:00.999Z')).toBe('2026-08-27 12:00:00');
    expect(formatClickHouseDateTime('2026-08-27T14:00:00+02:00')).toBe('2026-08-27 12:00:00');
  });

  it('parses ClickHouse output as UTC and accepts ISO input', () => {
    expect(parseClickHouseTime('2026-08-27 12:00:00.123')).toBe('2026-08-27T12:00:00.123Z');
    expect(parseClickHouseTime('2026-08-27 12:00:00')).toBe('2026-08-27T12:00:00.000Z');
    expect(parseClickHouseTime('2026-08-27T12:00:00.123Z')).toBe('2026-08-27T12:00:00.123Z');
    expect(parseClickHouseTime('2026-08-27T12:00:00Z')).toBe('2026-08-27T12:00:00.000Z');
  });

  it('round-trips in both directions', () => {
    for (const iso of ['2026-08-27T12:00:00.123Z', '2026-01-01T00:00:00.000Z', '1999-12-31T23:59:59.999Z']) {
      expect(parseClickHouseTime(formatClickHouseTime(iso))).toBe(iso);
    }
    for (const clickhouse of ['2026-08-27 12:00:00.123', '2026-01-01 00:00:00.000']) {
      expect(formatClickHouseTime(parseClickHouseTime(clickhouse))).toBe(clickhouse);
    }
  });
});

describe('resolveTinybirdToken', () => {
  it('returns the configured token without touching the cache or the network', async () => {
    await expect(resolveTinybirdToken()).resolves.toBe('p.token');
    expect(readCache).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to run without a token outside Tinybird Local', async () => {
    delete bindings.TINYBIRD_TOKEN;
    await expect(resolveTinybirdToken()).rejects.toBeInstanceOf(UnavailableError);
    await expect(resolveTinybirdToken()).rejects.toThrow(/TINYBIRD_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an empty token like a missing one', async () => {
    bindings.TINYBIRD_TOKEN = '';
    await expect(resolveTinybirdToken()).rejects.toBeInstanceOf(UnavailableError);
  });

  it('serves the cached local admin token', async () => {
    delete bindings.TINYBIRD_TOKEN;
    bindings.TINYBIRD_URL = 'http://localhost:7181';
    vi.mocked(readCache).mockResolvedValue({ token: 'cached' });
    await expect(resolveTinybirdToken()).resolves.toBe('cached');
    expect(readCache).toHaveBeenCalledWith(authCache, 'tinybird:local-token');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCache).not.toHaveBeenCalled();
  });

  it('fetches the local admin token and caches it for five minutes', async () => {
    delete bindings.TINYBIRD_TOKEN;
    bindings.TINYBIRD_URL = 'http://localhost:7181';
    vi.mocked(readCache).mockResolvedValue(null);
    fetchMock.mockImplementation(jsonResponse({ workspace_admin_token: 'admin' }));

    await expect(resolveTinybirdToken()).resolves.toBe('admin');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:7181/tokens');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(writeCache).toHaveBeenCalledWith(authCache, 'tinybird:local-token', { token: 'admin' }, 300);
  });

  it('reports an unreachable Tinybird Local as unavailable', async () => {
    delete bindings.TINYBIRD_TOKEN;
    bindings.TINYBIRD_URL = 'http://localhost:7181';
    vi.mocked(readCache).mockResolvedValue(null);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(resolveTinybirdToken()).rejects.toBeInstanceOf(UnavailableError);
    await expect(resolveTinybirdToken()).rejects.toThrow(/localhost:7181/);
    expect(writeCache).not.toHaveBeenCalled();
  });
});

describe('appendEvents', () => {
  it('posts a gzipped NDJSON batch to the Events API and waits for the commit', async () => {
    const rows = [eventRow(1), eventRow(2), eventRow(3)];
    fetchMock.mockImplementation(jsonResponse({ successful_rows: 3, quarantined_rows: 0 }));

    await expect(appendEvents(rows)).resolves.toEqual({ successful: 3, quarantined: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.tinybird.co/v0/events?name=events&wait=true');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      authorization: 'Bearer p.token',
      'content-type': 'application/x-ndjson',
      'content-encoding': 'gzip',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeInstanceOf(ArrayBuffer);

    const lines = gunzipSync(Buffer.from(init!.body as ArrayBuffer))
      .toString('utf8')
      .split('\n');
    expect(lines).toHaveLength(3);
    expect(lines).toEqual(rows.map((row) => JSON.stringify(row)));
    expect(lines.map((line) => JSON.parse(line))).toEqual(rows);
  });

  it('makes no request for an empty batch and does not need a token', async () => {
    delete bindings.TINYBIRD_TOKEN;
    await expect(appendEvents([])).resolves.toEqual({ successful: 0, quarantined: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readCache).not.toHaveBeenCalled();
  });

  it('splits rows over the chunk cap into several requests and sums the counts', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ...eventRow(index),
      data: { blob: 'x'.repeat(1_000_000) },
    }));
    fetchMock.mockImplementation(async (_url, init) => {
      const lines = gunzipSync(Buffer.from(init!.body as ArrayBuffer))
        .toString('utf8')
        .split('\n');
      return new Response(JSON.stringify({ successful_rows: lines.length, quarantined_rows: 0 }), {
        status: 200,
      });
    });

    await expect(appendEvents(rows)).resolves.toEqual({ successful: 5, quarantined: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const posted = fetchMock.mock.calls.map((call) =>
      gunzipSync(Buffer.from(call[1]!.body as ArrayBuffer))
        .toString('utf8')
        .split('\n')
    );
    expect(posted.map((lines) => lines.length)).toEqual([2, 2, 1]);
    expect(posted.flat().map((line) => (JSON.parse(line) as EventRow).id)).toEqual(rows.map((row) => row.id));
    for (const lines of posted) {
      expect(lines.join('\n').length).toBeLessThanOrEqual(3_000_000);
    }
  });

  it('throws unavailable with the status and body when Tinybird does not answer 200', async () => {
    fetchMock.mockImplementation(async () => new Response('rate limited', { status: 429 }));
    let thrown: unknown;
    try {
      await appendEvents([eventRow(1)]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnavailableError);
    expect((thrown as Error).message).toContain('429');
    expect((thrown as Error).message).toContain('rate limited');
    expect((thrown as InstanceType<typeof UnavailableError>).status).toBe(503);
  });

  it('treats a 202 as not committed', async () => {
    fetchMock.mockImplementation(jsonResponse({ successful_rows: 1, quarantined_rows: 0 }, 202));
    await expect(appendEvents([eventRow(1)])).rejects.toBeInstanceOf(UnavailableError);
  });

  it('resolves with the counts when rows are quarantined', async () => {
    fetchMock.mockImplementation(jsonResponse({ successful_rows: 1, quarantined_rows: 1 }));
    await expect(appendEvents([eventRow(1), eventRow(2)])).resolves.toEqual({
      successful: 1,
      quarantined: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops at the first chunk Tinybird refuses', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ...eventRow(index),
      data: { blob: 'x'.repeat(1_000_000) },
    }));
    fetchMock
      .mockImplementationOnce(jsonResponse({ successful_rows: 3, quarantined_rows: 0 }))
      .mockImplementationOnce(async () => new Response('gateway timeout', { status: 504 }));
    await expect(appendEvents(rows)).rejects.toThrow(/504 gateway timeout/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the resolved local token when none is configured', async () => {
    delete bindings.TINYBIRD_TOKEN;
    bindings.TINYBIRD_URL = 'http://localhost:7181';
    vi.mocked(readCache).mockResolvedValue({ token: 'admin' });
    fetchMock.mockImplementation(jsonResponse({ successful_rows: 1, quarantined_rows: 0 }));
    await appendEvents([eventRow(1)]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:7181/v0/events?name=events&wait=true');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer admin');
  });
});

describe('chunkLines', () => {
  it('returns nothing for no lines', () => {
    expect(chunkLines([], 10)).toEqual([]);
  });

  it('keeps lines together while they fit, counting one newline per line', () => {
    expect(chunkLines(['aaa', 'bbb'], 8)).toEqual([['aaa', 'bbb']]);
    expect(chunkLines(['aaa', 'bbb'], 7)).toEqual([['aaa'], ['bbb']]);
    expect(chunkLines(['aaa', 'bbb', 'ccc'], 8)).toEqual([['aaa', 'bbb'], ['ccc']]);
  });

  it('lets an oversized line form its own chunk without dropping it', () => {
    expect(chunkLines(['x'.repeat(10)], 5)).toEqual([['x'.repeat(10)]]);
    expect(chunkLines(['a', 'x'.repeat(10), 'b'], 5)).toEqual([['a'], ['x'.repeat(10)], ['b']]);
    expect(chunkLines(['x'.repeat(10), 'y'.repeat(10)], 5)).toEqual([['x'.repeat(10)], ['y'.repeat(10)]]);
  });

  it('preserves order and loses nothing', () => {
    const lines = Array.from({ length: 100 }, (_, index) => `line-${index}`);
    const chunks = chunkLines(lines, 40);
    expect(chunks.flat()).toEqual(lines);
    expect(chunks.length).toBeGreaterThan(10);
    for (const chunk of chunks) {
      expect(chunk.reduce((bytes, line) => bytes + line.length + 1, 0)).toBeLessThanOrEqual(40);
    }
  });
});

describe('resolveTinybirdWorkspaceId', () => {
  it('reads the workspace claim from the token', async () => {
    bindings.TINYBIRD_TOKEN = workspaceToken({ u: 'ws_123', id: 'tok' });
    await expect(resolveTinybirdWorkspaceId()).resolves.toBe('ws_123');
  });

  it('rejects a token without a payload segment', async () => {
    bindings.TINYBIRD_TOKEN = 'opaque';
    await expect(resolveTinybirdWorkspaceId()).rejects.toBeInstanceOf(UnavailableError);
    await expect(resolveTinybirdWorkspaceId()).rejects.toThrow(/not a workspace token/);
  });

  it('rejects a dotted token whose payload is not JSON', async () => {
    for (const token of [
      'p.opaque',
      'p.not-base64!.x',
      `p.${Buffer.from('plain text').toString('base64')}`,
    ]) {
      bindings.TINYBIRD_TOKEN = token;
      await expect(resolveTinybirdWorkspaceId(), token).rejects.toBeInstanceOf(UnavailableError);
      await expect(resolveTinybirdWorkspaceId(), token).rejects.toThrow(/not a workspace token/);
    }
  });

  it('rejects a token whose claims do not name a workspace', async () => {
    bindings.TINYBIRD_TOKEN = workspaceToken({ id: 'tok' });
    await expect(resolveTinybirdWorkspaceId()).rejects.toThrow(/does not name a workspace/);
    bindings.TINYBIRD_TOKEN = workspaceToken({ u: '' });
    await expect(resolveTinybirdWorkspaceId()).rejects.toBeInstanceOf(UnavailableError);
  });
});

describe('signTinybirdJwt', () => {
  const scopes = [{ type: 'PIPES:READ' as const, resource: 'event_catalog', fixed_params: { tenant_id: 3 } }];

  async function verify(jwt: string) {
    const [header, payload, signature] = jwt.split('.') as [string, string, string];
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(bindings.TINYBIRD_TOKEN as string),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      'HMAC',
      key,
      Buffer.from(signature, 'base64url'),
      encoder.encode(`${header}.${payload}`)
    );
  }

  it('produces an HS256 token with the given claims signed by the workspace token', async () => {
    bindings.TINYBIRD_TOKEN = workspaceToken({ u: 'ws_123' });
    const expiresAt = new Date('2026-08-27T13:00:00.500Z');
    const jwt = await signTinybirdJwt({ name: 'events:3', expiresAt, scopes, limits: { rps: 20 } });

    const [header, payload, signature] = jwt.split('.');
    expect(jwt.split('.')).toHaveLength(3);
    expect(jwt).not.toMatch(/[+/=]/);
    expect(decodeSegment(header!)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decodeSegment(payload!)).toEqual({
      workspace_id: 'ws_123',
      name: 'events:3',
      exp: 1787835600,
      scopes,
      limits: { rps: 20 },
    });
    expect(signature!.length).toBe(43);
    await expect(verify(jwt)).resolves.toBe(true);
  });

  it('omits limits when none are given and rejects a signature from another key', async () => {
    bindings.TINYBIRD_TOKEN = workspaceToken({ u: 'ws_123' });
    const jwt = await signTinybirdJwt({
      name: 'events:3',
      expiresAt: new Date('2026-08-27T13:00:00Z'),
      scopes,
    });
    expect('limits' in decodeSegment(jwt.split('.')[1]!)).toBe(false);
    await expect(verify(jwt)).resolves.toBe(true);
    bindings.TINYBIRD_TOKEN = workspaceToken({ u: 'ws_other' });
    await expect(verify(jwt)).resolves.toBe(false);
  });

  it('is deterministic for the same claims and key', async () => {
    bindings.TINYBIRD_TOKEN = workspaceToken({ u: 'ws_123' });
    const claims = { name: 'events:3', expiresAt: new Date('2026-08-27T13:00:00Z'), scopes };
    expect(await signTinybirdJwt(claims)).toBe(await signTinybirdJwt(claims));
  });
});
