import type { PingBodySchema, PingResult } from '@buzzkit/ping/api/ping/index';
import { DEFAULT_PRESENCE_SECONDS, MAX_PRESENCE_SECONDS, normalizePing } from '@buzzkit/ping/api/ping/index';
import { device, unwrap } from '@buzzkit/ping/device/index';
import { PingError } from '@buzzkit/ping/libs/error';
import { PROTOCOL_VERSION, SERVER_INFO, TOOLS } from './tools';

export * from './tools';

type ToolInput = typeof PingBodySchema.static;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export async function handleRpc(deviceId: string, body: unknown): Promise<JsonRpcResponse | null> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
  }

  const request = body as Partial<JsonRpcRequest>;

  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return { jsonrpc: '2.0', id: request.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
  }

  if (request.id === undefined || request.id === null) return null;

  const id = request.id;

  if (request.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      },
    };
  }

  if (request.method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (request.method === 'tools/call') {
    return await runTool(deviceId, id, request.params ?? {});
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${request.method}` } };
}

async function runTool(
  deviceId: string,
  id: string | number,
  params: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const name = params.name as string;
  const args = (params.arguments ?? {}) as Record<string, unknown>;

  if (name === 'buzz_presence') return await runPresence(deviceId, id, args);

  const input = resolveToolInput(name, args);
  if (!input) {
    return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } };
  }

  try {
    const result = unwrap(await device(deviceId).ping(normalizePing(input)));
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: describeResult(result) }] } };
  } catch (thrown) {
    if (!(thrown instanceof PingError)) throw thrown;

    return toolError(id, thrown.message);
  }
}

async function runPresence(
  deviceId: string,
  id: string | number,
  args: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const present = args.present !== false;
  const requested = typeof args.seconds === 'number' ? Math.floor(args.seconds) : DEFAULT_PRESENCE_SECONDS;
  if (requested < 1 || requested > MAX_PRESENCE_SECONDS) {
    return toolError(id, `seconds must be between 1 and ${MAX_PRESENCE_SECONDS}.`);
  }

  await device(deviceId).markPresent(present ? Date.now() + requested * 1000 : null);

  const text = present
    ? `The user is marked present for ${requested}s; ordinary pings stay in the app until then.`
    : 'The user is marked away; pings reach the phone again.';
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
}

function toolError(id: string | number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: message }] } };
}

function resolveToolInput(name: string, args: Record<string, unknown>): ToolInput | null {
  if (name === 'buzz_notify') {
    return { title: args.title, body: args.body, url: args.url, important: args.important } as ToolInput;
  }

  if (name === 'buzz_session') {
    return {
      session: args.session,
      title: args.title,
      body: args.body,
      status: args.status,
      progress: args.progress,
      agent: args.agent,
      project: args.project,
      important: args.important,
    } as ToolInput;
  }

  return null;
}

function describeResult(result: PingResult): string {
  if (result.kind === 'notification') {
    return result.delivered
      ? 'Sent to the phone.'
      : 'Held — the user is active. Pass important: true if this must reach them anyway.';
  }

  const base = `Session ${result.session} is ${result.status}.`;
  return result.notice ? `${base} ${result.notice}` : base;
}
