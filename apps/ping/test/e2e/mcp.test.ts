import { describe, expect, it } from 'vitest';
import type { Rpc } from '../utils/api';
import { call, messagesFor, pair, readJson, snapshot } from '../utils/api';

async function rpc(key: string, payload: Record<string, unknown>): Promise<Response> {
  return await call(`/${key}/mcp`, { method: 'POST', body: JSON.stringify(payload) });
}

describe('mcp', () => {
  it('completes the initialize handshake', async () => {
    const { key } = await pair();
    const body = await readJson<Rpc>(
      await rpc(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    );

    expect(body).toMatchObject({ jsonrpc: '2.0', id: 1 });
    expect(body.result?.serverInfo).toMatchObject({ name: 'buzz' });
    expect(body.result?.protocolVersion).toBeTruthy();
    expect(body.result?.capabilities?.tools).toBeTruthy();
  });

  it('lists the tools with usable schemas', async () => {
    const { key } = await pair();
    const body = await readJson<Rpc>(await rpc(key, { jsonrpc: '2.0', id: 2, method: 'tools/list' }));

    const names = body.result?.tools?.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(['buzz_notify', 'buzz_session', 'buzz_presence']);

    for (const tool of body.result?.tools ?? []) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      expect(Object.keys(tool.inputSchema.properties).length).toBeGreaterThan(0);
    }
  });

  it('holds a notification after buzz_presence and releases it after present false', async () => {
    const { key, buzzkit } = await pair();
    await rpc(key, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'buzz_presence', arguments: { present: true, seconds: 60 } },
    });
    const held = await readJson<Rpc>(
      await rpc(key, {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'buzz_notify', arguments: { title: 'While present' } },
      })
    );
    expect(held.result?.content?.[0].text).toContain('Held');
    expect(await messagesFor(buzzkit.externalId)).toHaveLength(0);

    await rpc(key, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'buzz_presence', arguments: { present: false } },
    });
    const sent = await readJson<Rpc>(
      await rpc(key, {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: { name: 'buzz_notify', arguments: { title: 'Away again' } },
      })
    );
    expect(sent.result?.content?.[0].text).toContain('Sent');
  });

  it('sends a notification through buzz_notify', async () => {
    const { key, buzzkit } = await pair();
    const body = await readJson<Rpc>(
      await rpc(key, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'buzz_notify', arguments: { title: 'From MCP', body: 'hello' } },
      })
    );

    expect(body.result?.content?.[0].text).toContain('Sent');
    expect((await messagesFor(buzzkit.externalId))[0]).toMatchObject({ title: 'From MCP' });
  });

  it('drives a session through buzz_session', async () => {
    const { key } = await pair();
    const body = await readJson<Rpc>(
      await rpc(key, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'buzz_session',
          arguments: { session: 'mcp-run', title: 'Working', progress: 0.5 },
        },
      })
    );

    expect(body.result?.content?.[0].text).toContain('mcp-run');

    const state = await snapshot(key);
    expect(state.activity.sessions[0]).toMatchObject({ id: 'mcp-run', title: 'Working' });
  });

  it('answers a notification without an id with no body', async () => {
    const { key } = await pair();
    const response = await rpc(key, { jsonrpc: '2.0', method: 'notifications/initialized' });

    expect(response.status).toBe(202);
  });

  it('refuses an unknown method with a JSON-RPC error', async () => {
    const { key } = await pair();
    const body = await readJson<Rpc>(await rpc(key, { jsonrpc: '2.0', id: 6, method: 'nope' }));

    expect(body.error?.code).toBe(-32601);
  });

  it('refuses an unknown tool', async () => {
    const { key } = await pair();
    const body = await readJson<Rpc>(
      await rpc(key, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'buzz_nope', arguments: {} },
      })
    );

    expect(body.error?.code).toBe(-32602);
  });

  it('surfaces a rate limit as a tool error, not a transport failure', async () => {
    const { key } = await pair();
    let failed: Record<string, unknown> | undefined;

    for (let attempt = 0; attempt < 14 && !failed; attempt += 1) {
      const body = await readJson<Rpc>(
        await rpc(key, {
          jsonrpc: '2.0',
          id: attempt,
          method: 'tools/call',
          params: { name: 'buzz_notify', arguments: { title: `n${attempt}` } },
        })
      );
      if (body.result?.isError) failed = body.result;
    }

    expect(failed?.isError).toBe(true);
  });

  it('answers an unparseable body with a JSON-RPC parse error, not a transport failure', async () => {
    const { key } = await pair();

    for (const payload of ['{not json', '', '[]']) {
      const response = await call(`/${key}/mcp`, {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/json' },
      });

      expect(response.status).toBe(200);
      expect(await readJson<Rpc>(response)).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700 },
      });
    }
  });

  it('answers a malformed request with Invalid Request and echoes its id', async () => {
    const { key } = await pair();
    const body = await readJson<Rpc>(await rpc(key, { jsonrpc: '2.0', id: 11 }));

    expect(body).toMatchObject({ jsonrpc: '2.0', id: 11, error: { code: -32600 } });
  });

  it('refuses an unknown key on the mcp endpoint too', async () => {
    const response = await rpc('bz_zzzzzzzzzzzzzzzzzzzzzzzz', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(response.status).toBe(404);
  });
});
