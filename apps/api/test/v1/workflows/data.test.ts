import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type Received = { path: string; method: string; headers: Record<string, string>; body: string };
type MessageItem = { payload: { title?: string; body?: string; data?: Record<string, unknown> } };
const PORT = 8878;
const received: Received[] = [];
const replies = new Map<string, { status: number; body: string }>();
let server: Server;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
  });
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const body = await readBody(request);
    const path = request.url ?? '/';
    received.push({
      path,
      method: request.method ?? 'GET',
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, String(value)])
      ),
      body,
    });
    const reply = replies.get(path) ?? { status: 404, body: 'nope' };
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(reply.body);
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function tenantSlug(headers: Headers): Promise<string> {
  const { body } = await api<{ items: TenantBody[] }>('/v1/tenants', { headers });
  return body.data?.items[0]?.slug ?? 'default';
}

async function putSecret(headers: Headers, name: string, value: string) {
  const { status, body } = await api<{ name: string; version: number }>(`/v1/secrets/${name}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value }),
  });
  expect([200, 201]).toContain(status);
  return body.data;
}

function shape(events: Array<{ name: string; data: Record<string, unknown> }>) {
  return events.map((item) => `${item.name}:${item.data.step ?? ''}:${item.data.status ?? ''}`);
}

async function completedRuns(headers: Headers, user: string) {
  return (await runEvents(headers, user)).filter((item) => item.name === '$run.completed').length;
}

const dataSpec = {
  trigger: { event: 'trial.started' },
  concurrency: 'per-event',
  steps: [
    {
      name: 'status',
      fetch: {
        url: `http://localhost:${PORT}/status`,
        as: 'status',
        body: { plan: '{{ trigger.data.plan }}' },
        timeout: '5s',
      },
    },
    { name: 'missing', fetch: { url: `http://localhost:${PORT}/missing`, onError: 'skip' } },
    {
      name: 'ping',
      fetch: {
        url: `http://localhost:${PORT}/ping`,
        headers: { 'X-Api-Key': '{{ secrets.api }}' },
        as: 'ping',
      },
    },
    { name: 'flag', set: { attribute: 'trialChecks', value: '{{ vars.status.checks }}' } },
    { name: 'note', set: { var: 'note', value: '{{ trigger.data.endsAt | date }}' } },
    {
      name: 'hello',
      send: {
        title: 'Hi {{ subscriber.attributes.name | default: "there" }}',
        body: '{{ vars.status.checks | number }} checks until {{ vars.note }}',
        data: {
          checks: '{{ vars.status.checks }}',
          canceled: '{{ vars.status.canceled ? "yes" : "no" }}',
        },
        skipIfSentWithin: '1d',
      },
    },
  ],
};

describe('workflow data steps', () => {
  it('fetches with secrets, follows onError, sets attributes and variables, renders filters and skips a repeated send', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    expect(await putSecret(keyBearer, 'api', 'sk_test_123')).toMatchObject({ name: 'api', version: 1 });
    replies.set('/status', { status: 200, body: JSON.stringify({ checks: 3, canceled: false }) });
    replies.set('/ping', { status: 200, body: JSON.stringify({ ok: true }) });

    const user = `data_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `data-${uniq()}`, dataSpec);
    await track(keyBearer, user, 'trial.started', { plan: 'monthly', endsAt: '2026-09-04T09:00:00Z' });
    await eventually(async () => (await completedRuns(keyBearer, user)) === 1, {
      label: 'first run completed',
      timeoutMs: 60_000,
      intervalMs: 300,
    });

    const call = received.find(
      (entry) =>
        entry.path === '/status' &&
        entry.headers['webhook-id']?.endsWith(':status') &&
        entry.body.includes('monthly')
    );
    expect(call).toBeDefined();
    expect(call?.method).toBe('POST');
    expect(call?.headers['user-agent']).toBe('buzzkit-workflows/1');
    expect(call?.headers['content-type']).toBe('application/json');
    expect(call?.headers['webhook-id']).toMatch(/:status$/);
    expect(call?.headers['webhook-timestamp']).toMatch(/^\d+$/);
    expect(call?.headers['webhook-signature']).toBeUndefined();
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ plan: 'monthly' });
    const ping = received.find(
      (entry) => entry.path === '/ping' && entry.headers['webhook-id']?.endsWith(':ping')
    );
    expect(ping).toMatchObject({ method: 'GET', body: '' });
    expect(ping?.headers['x-api-key']).toBe('sk_test_123');

    const events = await runEvents(keyBearer, user);
    expect(shape(events)).toEqual([
      '$run.started::',
      '$run.step:status:completed',
      '$run.step:missing:skipped',
      '$run.step:ping:completed',
      '$run.step:flag:completed',
      '$run.step:note:completed',
      '$run.step:hello:completed',
      '$run.completed::',
    ]);
    expect(events.find((item) => item.data.step === 'missing')?.data.summary).toBe(
      `Skipped: localhost:${PORT} answered 404`
    );
    expect(events.find((item) => item.data.step === 'flag')?.data.summary).toBe('Set trialChecks to 3');
    expect(events.find((item) => item.data.step === 'note')?.data.summary).toBe(
      'Set note to “September 4, 2026”'
    );

    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${user}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.attributes.trialChecks).toBe(3);

    const messages = await api<{ items: MessageItem[] }>('/v1/messages?limit=5', { headers: keyBearer });
    const hello = messages.body.data?.items.find((item) => item.payload.title === 'Hi there');
    expect(hello?.payload.body).toBe('3 checks until September 4, 2026');
    expect(hello?.payload.data).toEqual({ checks: 3, canceled: 'no' });

    await track(keyBearer, user, 'trial.started', { plan: 'monthly', endsAt: '2026-09-04T09:00:00Z' });
    await eventually(async () => (await completedRuns(keyBearer, user)) === 2, {
      label: 'second run completed',
      timeoutMs: 60_000,
      intervalMs: 300,
    });
    const second = (await runEvents(keyBearer, user)).slice(events.length);
    expect(shape(second)).toContain('$run.step:hello:skipped');
    expect(second.find((item) => item.data.step === 'hello')?.data.summary).toBe(
      'Skipped: this message went out within 1 day'
    );
    const after = await api<{ items: MessageItem[] }>('/v1/messages?limit=5', { headers: keyBearer });
    expect(after.body.data?.items.filter((item) => item.payload.title === 'Hi there')).toHaveLength(1);
  }, 150_000);

  it("waits until the subscriber's local morning, then until the app has been closed for a while", async () => {
    const { keyBearer, owner, workspace } = await setupWorkspace({ push: 'unusable' });
    const slug = await tenantSlug(keyBearer);
    const clientKey = await createClientKey(owner.token, workspace.slug, slug);
    const user = `local_${uniq()}`;
    await subscribe(keyBearer, user);
    await api(`/v1/subscribers/${user}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ timezone: 'Europe/Paris' }),
    });
    await publish(keyBearer, `local-${uniq()}`, {
      trigger: { event: 'trial.started' },
      steps: [
        { name: 'morning', waitUntil: { time: '09:00', timezone: 'subscriber' } },
        {
          name: 'quiet',
          waitFor: { event: '$app.backgrounded', settleFor: '5m', resetOn: ['$app.opened'], timeout: '1d' },
        },
        { name: 'ping', send: { title: 'Ping' } },
      ],
    });
    await track(keyBearer, user, 'trial.started');

    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.data.step === 'quiet'),
      { label: 'waiting for a quiet moment', timeoutMs: 60_000, intervalMs: 300 }
    );
    const morning = (await runEvents(keyBearer, user)).find(
      (item) => item.data.step === 'morning' && item.data.status === 'sleeping'
    );
    expect(morning?.data.timezone).toBe('Europe/Paris');
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(String(morning?.data.until)));
    expect(local).toBe('09:00');
    expect(morning?.data.summary).toMatch(/9:00 AM Europe\/Paris$/);

    const quiet = (await runEvents(keyBearer, user)).find((item) => item.data.step === 'quiet');
    expect(quiet?.data).toMatchObject({
      status: 'waiting',
      summary: 'Waiting for $app.backgrounded and 5 minutes of quiet',
      settleFor: '5m',
      resetOn: ['$app.opened'],
    });

    const backgrounded = await api('/v1/client/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientKey.secret}` },
      body: JSON.stringify({
        externalId: user,
        source: 'ios',
        events: [{ id: uniq(), name: '$app.backgrounded' }],
      }),
    });
    expect(backgrounded.status).toBe(202);

    await eventually(async () => (await completedRuns(keyBearer, user)) === 1, {
      label: 'run completed after the quiet moment',
      timeoutMs: 60_000,
      intervalMs: 300,
    });
    const events = await runEvents(keyBearer, user);
    expect(shape(events)).toEqual([
      '$run.started::',
      '$run.step:morning:sleeping',
      '$run.step:morning:completed',
      '$run.step:quiet:waiting',
      '$run.step:quiet:completed',
      '$run.step:ping:completed',
      '$run.completed::',
    ]);
    expect(
      events.find((item) => item.data.step === 'quiet' && item.data.status === 'completed')?.data.summary
    ).toBe('Received $app.backgrounded');
  }, 150_000);
});
