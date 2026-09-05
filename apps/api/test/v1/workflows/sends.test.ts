import { createServer, type IncomingMessage, type Server } from 'node:http';
import { localTime } from '@buzzkit/api/libs/timezone';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type RunEvent = { name: string; data: Record<string, unknown> };
type Received = { path: string; method: string; headers: Record<string, string>; body: string };
type Delivery = { status: string; nextAttemptAt: string | null; message: { id: string } };
type Message = {
  id: string;
  topic: string | null;
  payload: Record<string, unknown>;
  run: { id: string; step: string } | null;
};
const PORT = 8880;
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
    const reply = replies.get(path) ?? { status: 404, body: '{"error":"missing"}' };
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(reply.body);
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function summaries(events: RunEvent[], step: string) {
  return events.filter((item) => item.data.step === step).map((item) => item.data.summary);
}

async function completed(headers: Headers, user: string) {
  await eventually(
    async () => (await runEvents(headers, user)).some((item) => item.name === '$run.completed'),
    { label: `run completed for ${user}`, timeoutMs: 120_000, intervalMs: 300 }
  );
  return await runEvents(headers, user);
}

function messageIdOf(events: RunEvent[], step: string): string {
  const sent = events.find((item) => item.data.step === step && item.data.status === 'completed');
  return sent?.data.messageId as string;
}

function wallClock(instant: unknown, zone: string): string {
  const local = localTime(new Date(String(instant)), zone);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}

describe('workflow sends', () => {
  it('defers a send inside the tenant quiet hours and lets policy: ignore through', async () => {
    const { keyBearer } = await setupWorkspace();
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };
    const policy = await api('/v1/tenants/default', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        settings: { sendPolicy: { quietHours: { from: '00:00', to: '23:59', timezone: 'UTC' } } },
      }),
    });
    expect(policy.status).toBe(200);
    const user = `quiet_${uniq()}`;
    await subscribe(headers, user);
    await publish(headers, `policy-${uniq()}`, {
      trigger: { event: 'order.shipped' },
      steps: [
        { name: 'nudge', send: { title: 'On its way' } },
        { name: 'alert', send: { title: 'Sign-in from a new device', policy: 'ignore' } },
      ],
    });

    await track(headers, user, 'order.shipped');
    const events = await completed(headers, user);
    const nudge = messageIdOf(events, 'nudge');
    const alert = messageIdOf(events, 'alert');
    const deliveries = await eventually(
      async () => {
        const { body } = await api<{ items: Delivery[] }>(`/v1/subscribers/${user}/deliveries`, { headers });
        const items = body.data?.items ?? [];
        const attempted = items.find(
          (item) => item.message.id === alert && ['sent', 'failed', 'retrying'].includes(item.status)
        );
        return attempted && items.some((item) => item.message.id === nudge) ? items : undefined;
      },
      { label: 'both deliveries visible', timeoutMs: 60_000, intervalMs: 500 }
    );
    const deferred = deliveries.find((item) => item.message.id === nudge);
    expect(deferred?.status).toBe('pending');
    expect(Date.parse(deferred?.nextAttemptAt ?? '')).toBeGreaterThan(Date.now() + 30_000);
  }, 120_000);

  it('passes the whole payload through to the message, sends to a topic, and skips a repeat inside the topic window', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const topic = `deals-${uniq()}`;
    const created = await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: topic, name: 'Deals', channels: ['push'] }),
    });
    expect(created.status).toBe(201);
    const user = `payload_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `payload-${uniq()}`, {
      trigger: { event: 'invite.sent' },
      steps: [
        {
          name: 'invite',
          send: {
            channel: 'push',
            topic,
            title: '{{ trigger.data.host | capitalize }} invited you',
            subtitle: 'Event {{ trigger.data.id }}',
            body: '{{ trigger.data.guests | size }} guests, {{ trigger.data.guests | join: ", " }}',
            data: { id: '{{ trigger.data.id }}', guests: '{{ trigger.data.guests | size }}' },
            imageUrl: 'https://cdn.example.com/{{ trigger.data.id }}.png',
            sound: 'chime.caf',
            badge: 3,
            threadId: 'event-{{ trigger.data.id }}',
            collapseId: 'invite-{{ trigger.data.id }}',
            interruptionLevel: 'timeSensitive',
            relevanceScore: 0.8,
            priority: 'high',
            deepLink: 'app://events/{{ trigger.data.id }}',
            action: { name: 'show_event', data: { id: '{{ trigger.data.id }}' } },
            actions: [
              { id: 'accept', title: 'Accept', foreground: true },
              { id: 'decline', title: 'Decline', destructive: true },
            ],
          },
        },
        { name: 'again', send: { topic, title: 'Still on?', skipIfSentWithin: '1d' } },
        { name: 'other', send: { title: 'Unrelated', skipIfSentWithin: '1d' } },
      ],
    });

    await track(keyBearer, user, 'invite.sent', { host: 'ada', id: 'ev9', guests: ['Bo', 'Cy'] });
    const events = await completed(keyBearer, user);
    expect(summaries(events, 'invite')).toEqual(['Sent “Ada invited you”']);
    expect(summaries(events, 'again')).toEqual([`Skipped: a ${topic} message went out within 1 day`]);
    expect(summaries(events, 'other')).toEqual(['Sent “Unrelated”']);

    const message = await api<Message>(`/v1/messages/${messageIdOf(events, 'invite')}`, {
      headers: keyBearer,
    });
    expect(message.status).toBe(200);
    expect(message.body.data?.topic).toBe(topic);
    expect(message.body.data?.run).toEqual({ id: expect.stringMatching(/^\d+-wf_/), step: 'invite' });
    expect(message.body.data?.payload).toMatchObject({
      title: 'Ada invited you',
      subtitle: 'Event ev9',
      body: '2 guests, Bo, Cy',
      data: { id: 'ev9', guests: 2 },
      imageUrl: 'https://cdn.example.com/ev9.png',
      sound: 'chime.caf',
      badge: 3,
      threadId: 'event-ev9',
      collapseId: 'invite-ev9',
      interruptionLevel: 'timeSensitive',
      relevanceScore: 0.8,
      priority: 'high',
      deepLink: 'app://events/ev9',
      action: { name: 'show_event', data: { id: 'ev9' } },
      actions: [
        { id: 'accept', title: 'Accept', foreground: true },
        { id: 'decline', title: 'Decline', destructive: true },
      ],
    });
  }, 90_000);

  it('snaps waits to wall-clock moments in the default zone when the subscriber has none, and in a fixed zone', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `moments_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `moments-${uniq()}`, {
      trigger: { event: 'trial.started' },
      defaultTimezone: 'Asia/Tokyo',
      steps: [
        { name: 'morning', waitUntil: { delay: '1h', time: '09:00', timezone: 'subscriber' } },
        { name: 'evening', waitUntil: { time: '18:30', timezone: 'Europe/Berlin' } },
        { name: 'bye', send: { title: 'Bye at {{ now | time }}' } },
      ],
    });

    const before = Date.now();
    await track(keyBearer, user, 'trial.started');
    const events = await completed(keyBearer, user);
    const morning = events.find((item) => item.data.step === 'morning' && item.data.status === 'sleeping');
    expect(morning?.data.timezone).toBe('Asia/Tokyo');
    expect(wallClock(morning?.data.until, 'Asia/Tokyo')).toBe('09:00');
    expect(Date.parse(String(morning?.data.until))).toBeGreaterThanOrEqual(before + 3_600_000 - 60_000);
    expect(morning?.data.summary).toMatch(/9:00 AM Asia\/Tokyo$/);
    const evening = events.find((item) => item.data.step === 'evening' && item.data.status === 'sleeping');
    expect(evening?.data.timezone).toBe('Europe/Berlin');
    expect(wallClock(evening?.data.until, 'Europe/Berlin')).toBe('18:30');
    expect(summaries(events, 'morning')).toEqual([
      expect.stringMatching(/^Waiting until/),
      expect.stringMatching(/^Reached/),
    ]);
    expect(summaries(events, 'bye')).toEqual([expect.stringMatching(/^Sent “Bye at \d/)]);
  }, 90_000);

  it('sends every fetch shape: methods, string bodies, expected statuses, and continuing without data', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    replies.set('/things/t1', { status: 200, body: JSON.stringify({ ok: true, count: 2 }) });
    replies.set('/broken', { status: 418, body: '{}' });
    const user = `fetcher_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `fetch-${uniq()}`, {
      trigger: { event: 'thing.changed' },
      steps: [
        {
          name: 'put',
          fetch: {
            method: 'PUT',
            url: `http://localhost:${PORT}/things/{{ trigger.data.id }}`,
            headers: { 'content-type': 'text/plain', 'x-trace': '{{ trigger.data.id }}' },
            body: 'hello {{ trigger.data.id }}',
            as: 'thing',
          },
        },
        {
          name: 'check',
          fetch: { method: 'DELETE', url: `http://localhost:${PORT}/gone`, expect: { status: [404] } },
        },
        {
          name: 'broken',
          fetch: { url: `http://localhost:${PORT}/broken`, onError: 'continue', as: 'broken' },
        },
        {
          name: 'report',
          send: {
            title: 'Status {{ steps.check.status }} / {{ steps.put.data.count | plus: 1 }}',
            body: '{{ vars.broken | default: "none" }} / {{ vars.thing.ok }} / {{ steps.check.data.error }}',
          },
        },
      ],
    });

    await track(keyBearer, user, 'thing.changed', { id: 't1' });
    const events = await completed(keyBearer, user);
    expect(summaries(events, 'put')).toEqual([`Fetched PUT localhost:${PORT} (200)`]);
    expect(summaries(events, 'check')).toEqual([`Fetched DELETE localhost:${PORT} (404)`]);
    expect(summaries(events, 'broken')).toEqual([`Continued without data: localhost:${PORT} answered 418`]);
    expect(events.find((item) => item.data.step === 'broken')?.data.error).toBe(
      `localhost:${PORT} answered 418`
    );
    expect(summaries(events, 'report')).toEqual(['Sent “Status 404 / 3”']);

    const put = received.find((entry) => entry.path === '/things/t1');
    expect(put).toMatchObject({ method: 'PUT', body: 'hello t1' });
    expect(put?.headers['content-type']).toBe('text/plain');
    expect(put?.headers['x-trace']).toBe('t1');
    expect(put?.headers['webhook-id']).toMatch(/:put$/);
    expect(received.find((entry) => entry.path === '/gone')?.method).toBe('DELETE');

    const message = await api<Message>(`/v1/messages/${messageIdOf(events, 'report')}`, {
      headers: keyBearer,
    });
    expect(message.body.data?.payload.body).toBe('none / true / missing');
  }, 90_000);
});
