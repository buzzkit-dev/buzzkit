import type { PingResult } from '@buzzkit/ping/api/ping/index';
import type { ActivityState } from '@buzzkit/ping/api/sessions/index';

export const PING_URL = process.env.PING_URL ?? 'http://127.0.0.1:8793';

export type Snapshot = {
  ok: true;
  externalId: string;
  activityId: string | null;
  activity: ActivityState;
};

export type Failure = { ok: false; error: { code: string; message: string; param?: string } };

export type { PingResult };

export type SessionResult = Extract<PingResult, { kind: 'session' }>;

export type NotificationResult = Extract<PingResult, { kind: 'notification' }>;

export type Minted = { ok: true; code: string; expiresIn: number };

export type Claimed = { ok: true; key: string; endpoint: string; mcp: string };

export type Rotated = { ok: true; key: string; endpoint: string };

export type Health = { ok: true; service: string };

export type Rpc = {
  jsonrpc: string;
  id: number;
  result?: {
    protocolVersion?: string;
    serverInfo?: { name: string; version: string };
    capabilities?: { tools?: unknown };
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    }>;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function snapshot(key: string): Promise<Snapshot> {
  return await readJson<Snapshot>(await call(`/${key}`));
}

export async function pingJson<T extends PingResult = PingResult>(
  key: string,
  payload: unknown,
  query = ''
): Promise<T> {
  return await readJson<T>(await ping(key, payload, query));
}

const STUB_URL = process.env.STUB_URL ?? 'http://127.0.0.1:8811';

type Recorded = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
};

export type Pairing = {
  key: string;
  endpoint: string;
  buzzkit: { apiUrl: string; publishableKey: string; externalId: string; identityHash: string };
};

const worker = crypto.randomUUID().slice(0, 8);

let addresses = 0;

export function nextAddress(): string {
  addresses += 1;
  return `203.0.113.${worker}.${addresses}`;
}

export async function call(path: string, init: RequestInit & { address?: string } = {}): Promise<Response> {
  const { address, headers, ...rest } = init;

  return await fetch(`${PING_URL}${path}`, {
    ...rest,
    headers: {
      'cf-connecting-ip': address ?? nextAddress(),
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
  });
}

export async function pair(): Promise<Pairing> {
  const response = await call('/pair', { method: 'POST' });
  if (response.status !== 201) throw new Error(`pair failed: ${response.status} ${await response.text()}`);

  return (await response.json()) as Pairing;
}

export async function ping(key: string, body: unknown, query = ''): Promise<Response> {
  return await call(`/${key}${query}`, { method: 'POST', body: JSON.stringify(body) });
}

async function recorded(): Promise<Recorded[]> {
  return (await (await fetch(`${STUB_URL}/__recorded`)).json()) as Recorded[];
}

export async function bindActivity(key: string, activityId: string): Promise<void> {
  const response = await call(`/${key}/activity`, {
    method: 'POST',
    body: JSON.stringify({ activityId }),
  });
  if (!response.ok) throw new Error(`bindActivity failed: ${response.status}`);
}

export async function withoutLiveActivities(externalId: string): Promise<void> {
  await fetch(`${STUB_URL}/__without-activities`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ externalId }),
  });
}

export async function messagesFor(externalId: string): Promise<Array<Record<string, unknown>>> {
  return await sentTo('/v1/messages', externalId);
}

export async function activitiesFor(externalId: string): Promise<Array<Record<string, unknown>>> {
  return await sentTo('/v1/live-activities/send', externalId);
}

async function sentTo(path: string, externalId: string): Promise<Array<Record<string, unknown>>> {
  const entries = await recorded();

  return entries
    .filter((entry) => entry.path === path && entry.body?.to === externalId)
    .map((entry) => entry.body ?? {});
}
