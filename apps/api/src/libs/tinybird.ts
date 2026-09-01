import { env } from 'cloudflare:workers';
import { createTinybird, type EventRow, type TinybirdClient } from '@buzzkit/tinybird';
import { readCache, writeCache } from './cache';
import { fromBase64, toBase64Url } from './encoding';
import { UnavailableError } from './error';

export type { EventRow };

const LOCAL_TOKEN_CACHE_SECONDS = 300;

const INGEST_CHUNK_UNITS = 3_000_000;

export async function resolveTinybirdToken(): Promise<string> {
  if (env.TINYBIRD_TOKEN) return env.TINYBIRD_TOKEN;
  if (!env.TINYBIRD_URL.includes('localhost')) {
    throw new UnavailableError('Tinybird is not configured (TINYBIRD_TOKEN)');
  }

  const cached = await readCache<{ token: string }>(env.AUTH_CACHE, 'tinybird:local-token');
  if (cached) return cached.token;

  let response: Response;
  try {
    response = await fetch(`${env.TINYBIRD_URL}/tokens`, { signal: AbortSignal.timeout(5_000) });
  } catch {
    throw new UnavailableError(`Tinybird Local is not reachable at ${env.TINYBIRD_URL}`);
  }
  const tokens = (await response.json()) as { workspace_admin_token: string };
  await writeCache(
    env.AUTH_CACHE,
    'tinybird:local-token',
    { token: tokens.workspace_admin_token },
    LOCAL_TOKEN_CACHE_SECONDS
  );

  return tokens.workspace_admin_token;
}

export async function tinybird(): Promise<TinybirdClient> {
  return createTinybird({ baseUrl: env.TINYBIRD_URL, token: await resolveTinybirdToken() });
}

export async function queryTinybird<T>(sql: string): Promise<T[]> {
  const token = await resolveTinybirdToken();
  const response = await fetch(`${env.TINYBIRD_URL}/v0/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    body: `${sql} FORMAT JSON`,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new UnavailableError(`Tinybird refused the query: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as { data: T[] };

  return result.data;
}

export function formatClickHouseTime(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', '');
}

export function formatClickHouseDateTime(iso: string): string {
  return formatClickHouseTime(iso).slice(0, 19);
}

export function parseClickHouseTime(value: string): string {
  return new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`).toISOString();
}

export async function appendEvents(rows: EventRow[]): Promise<{ successful: number; quarantined: number }> {
  const totals = { successful: 0, quarantined: 0 };
  if (rows.length === 0) return totals;

  const token = await resolveTinybirdToken();

  for (const chunk of chunkLines(
    rows.map((row) => JSON.stringify(row)),
    INGEST_CHUNK_UNITS
  )) {
    const result = await postEvents(token, chunk);
    totals.successful += result.successful;
    totals.quarantined += result.quarantined;
  }

  return totals;
}

export function chunkLines(lines: string[], maxBytes: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let bytes = 0;

  for (const line of lines) {
    const size = line.length + 1;
    if (current.length > 0 && bytes + size > maxBytes) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(line);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

async function postEvents(
  token: string,
  lines: string[]
): Promise<{ successful: number; quarantined: number }> {
  const compressed = await new Response(
    new Blob([lines.join('\n')]).stream().pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer();

  const response = await fetch(`${env.TINYBIRD_URL}/v0/events?name=events&wait=true`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-ndjson',
      'content-encoding': 'gzip',
    },
    body: compressed,
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status !== 200) {
    throw new UnavailableError(
      `Tinybird did not commit the batch: ${response.status} ${await response.text()}`
    );
  }

  const result = (await response.json()) as { successful_rows: number; quarantined_rows: number };

  return { successful: result.successful_rows, quarantined: result.quarantined_rows };
}

export async function resolveTinybirdWorkspaceId(): Promise<string> {
  const token = await resolveTinybirdToken();
  const payload = token.split('.')[1];
  if (!payload) {
    throw new UnavailableError('TINYBIRD_TOKEN is not a workspace token');
  }
  let claims: { u?: string };

  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64(payload))) as { u?: string };
  } catch {
    throw new UnavailableError('TINYBIRD_TOKEN is not a workspace token');
  }

  if (!claims.u) {
    throw new UnavailableError('TINYBIRD_TOKEN does not name a workspace');
  }

  return claims.u;
}

export type TinybirdJwtScope = {
  type: 'PIPES:READ';
  resource: string;
  fixed_params: Record<string, string | number>;
};

export async function signTinybirdJwt(claims: {
  name: string;
  expiresAt: Date;
  scopes: TinybirdJwtScope[];
  limits?: { rps: number };
}): Promise<string> {
  const encoder = new TextEncoder();
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        workspace_id: await resolveTinybirdWorkspaceId(),
        name: claims.name,
        exp: Math.floor(claims.expiresAt.getTime() / 1000),
        scopes: claims.scopes,
        ...(claims.limits ? { limits: claims.limits } : {}),
      })
    )
  );
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(await resolveTinybirdToken()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));

  return `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
}
