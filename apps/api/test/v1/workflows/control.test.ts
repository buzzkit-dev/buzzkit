import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type RunEvent = { name: string; data: Record<string, unknown> };
const PORT = 8879;
let server: Server;

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }));
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function shape(events: RunEvent[]) {
  return events.map((item) => `${item.name}:${item.data.step ?? ''}:${item.data.status ?? ''}`);
}

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

async function waiting(headers: Headers, user: string, step: string, times = 1) {
  await eventually(
    async () =>
      (await runEvents(headers, user)).filter(
        (item) => item.data.step === step && item.data.status === 'waiting'
      ).length >= times,
    { label: `${step} waiting (${times})`, timeoutMs: 60_000, intervalMs: 200 }
  );
}

async function deviceEvent(
  clientBearer: Headers,
  user: string,
  name: string,
  data: Record<string, unknown> = {}
) {
  const { status, body } = await api('/v1/client/events', {
    method: 'POST',
    headers: clientBearer,
    body: JSON.stringify({ externalId: user, source: 'ios', events: [{ id: uniq(), name, data }] }),
  });
  if (status !== 202) throw new Error(`device event failed: ${status} ${JSON.stringify(body)}`);
}

async function clientBearerFor(base: Awaited<ReturnType<typeof setupWorkspace>>): Promise<Headers> {
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { Authorization: `Bearer ${clientKey.secret}` };
}

describe('workflow control flow', () => {
  it('takes else when no case matches, keeps going after the branch, and exits at the top level', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `else_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `else-${uniq()}`, {
      trigger: { event: 'go' },
      steps: [
        {
          name: 'tier',
          branch: [
            {
              name: 'vip',
              when: { ref: 'subscriber.attributes.vip', eq: true },
              steps: [{ name: 'perk', set: { var: 'perk', value: true } }],
            },
          ],
        },
        { name: 'after', set: { var: 'after', value: true } },
        { exit: true },
      ],
    });

    await track(keyBearer, user, 'go');
    const events = await completed(keyBearer, user);
    expect(shape(events)).toEqual([
      '$run.started::',
      '$run.step:tier:completed',
      '$run.step:after:completed',
      '$run.step:exit:completed',
      '$run.completed::',
    ]);
    expect(events.find((item) => item.data.step === 'tier')?.data).toMatchObject({
      summary: 'Took else',
      taken: 'else',
    });
    expect(events.find((item) => item.data.step === 'exit')?.data.summary).toBe('Exited');
  }, 60_000);

  it('fans a forEach out over a fetched list, caps it, and skips empty and non-list paths', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `each_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `each-${uniq()}`, {
      trigger: { event: 'catalog.changed' },
      steps: [
        { name: 'load', fetch: { url: `http://localhost:${PORT}/catalog`, as: 'catalog' } },
        {
          name: 'each',
          forEach: {
            items: 'vars.catalog.items',
            as: 'item',
            max: 2,
            steps: [{ name: 'last', set: { var: 'last', value: '{{ vars.item.name }}' } }],
          },
        },
        {
          name: 'tags',
          forEach: {
            items: 'trigger.data.tags',
            as: 'tag',
            max: 5,
            steps: [{ name: 'tagged', set: { var: 'tagged', value: true } }],
          },
        },
        {
          name: 'count',
          forEach: {
            items: 'trigger.data.count',
            as: 'entry',
            max: 5,
            steps: [{ name: 'counted', set: { var: 'counted', value: true } }],
          },
        },
        { name: 'report', send: { title: 'Last {{ vars.last }}' } },
      ],
    });

    await track(keyBearer, user, 'catalog.changed', { tags: [], count: 3 });
    const events = await completed(keyBearer, user);
    expect(summaries(events, 'last')).toEqual(['Set last to “a”', 'Set last to “b”']);
    expect(summaries(events, 'each')).toEqual(['Ran for 2 of 3 items (capped at 2)']);
    expect(summaries(events, 'tags')).toEqual(['Skipped: trigger.data.tags is empty']);
    expect(summaries(events, 'count')).toEqual(['Skipped: trigger.data.count is not a list']);
    expect(shape(events).filter((entry) => entry.startsWith('$run.step:tagged'))).toEqual([]);
    expect(summaries(events, 'report')).toEqual(['Sent “Last b”']);
  }, 90_000);

  it('repeats until the condition holds within the current pass, anchored on the iteration', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `streak_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `repeat-${uniq()}`, {
      trigger: { event: 'workout.missed' },
      steps: [
        {
          name: 'loop',
          repeat: {
            every: '1h',
            max: 4,
            until: { occurred: 'workout.completed', since: 'iteration' },
            steps: [{ name: 'checkin', waitFor: { event: 'checkin', timeout: '2d' } }],
          },
        },
        { name: 'done', set: { var: 'done', value: true } },
      ],
    });

    await track(keyBearer, user, 'workout.completed');
    await track(keyBearer, user, 'workout.missed');
    await waiting(keyBearer, user, 'checkin');
    await track(keyBearer, user, 'checkin');
    await waiting(keyBearer, user, 'checkin', 2);
    await track(keyBearer, user, 'workout.completed');
    await track(keyBearer, user, 'checkin');

    const events = await completed(keyBearer, user);
    expect(summaries(events, 'loop')).toEqual(['Pass 1 of 4, next in 1 hour', 'Done after 2 passes']);
    expect(summaries(events, 'checkin')).toEqual([
      'Waiting for checkin',
      'Received checkin',
      'Waiting for checkin',
      'Received checkin',
    ]);
    expect(summaries(events, 'done')).toEqual(['Set done to true']);
  }, 120_000);

  it('lets a wait time out unmatched on a moment timeout and branches on the negation', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `silent_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `timeout-${uniq()}`, {
      trigger: { event: 'question.asked' },
      steps: [
        { name: 'reply', waitFor: { event: 'reply', timeout: { delay: '1h' } } },
        {
          name: 'route',
          branch: [
            {
              name: 'answered',
              when: { ref: 'steps.reply.matched', eq: true },
              steps: [{ name: 'thanks', set: { var: 'outcome', value: 'answered' } }],
            },
            {
              name: 'silent',
              when: { not: { ref: 'steps.reply.matched', eq: true } },
              steps: [{ name: 'nudge', set: { var: 'outcome', value: 'silent' } }],
            },
          ],
        },
      ],
    });

    await track(keyBearer, user, 'question.asked');
    const events = await completed(keyBearer, user);
    expect(
      events.find((item) => item.data.step === 'reply' && item.data.status === 'completed')?.data
    ).toMatchObject({ summary: 'No reply in time', matched: false });
    expect(events.find((item) => item.data.step === 'route')?.data.taken).toBe('silent');
    expect(summaries(events, 'nudge')).toEqual(['Set outcome to “silent”']);
  }, 60_000);

  it('restarts the quiet clock on a reset event that matches its condition and ignores one that does not', async () => {
    const base = await setupWorkspace({ push: 'unusable' });
    const { keyBearer } = base;
    const clientBearer = await clientBearerFor(base);
    const reset = `reset_${uniq()}`;
    const ignored = `ignored_${uniq()}`;
    for (const user of [reset, ignored]) await subscribe(keyBearer, user);
    await publish(keyBearer, `quiet-${uniq()}`, {
      trigger: { event: 'trial.started' },
      steps: [
        {
          name: 'quiet',
          waitFor: {
            event: '$app.backgrounded',
            settleFor: '1d',
            resetOn: [{ event: '$app.opened', where: { ref: 'event.data.screen', neq: 'widget' } }],
            timeout: '5d',
          },
        },
        { name: 'ping', set: { var: 'pinged', value: true } },
      ],
    });
    for (const user of [reset, ignored]) await track(keyBearer, user, 'trial.started');
    for (const user of [reset, ignored]) await waiting(keyBearer, user, 'quiet');

    const startedAt = Date.now();
    for (const user of [reset, ignored]) await deviceEvent(clientBearer, user, '$app.backgrounded');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await deviceEvent(clientBearer, ignored, '$app.opened', { screen: 'widget' });
    await deviceEvent(clientBearer, reset, '$app.opened', { screen: 'home' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await deviceEvent(clientBearer, reset, '$app.backgrounded');

    await eventually(
      async () => (await runEvents(keyBearer, ignored)).some((item) => item.name === '$run.completed'),
      { label: 'ignored reset settles from the first background', timeoutMs: 11_000, intervalMs: 200 }
    );
    expect(Date.now() - startedAt).toBeLessThan(11_000);
    expect((await runEvents(keyBearer, reset)).some((item) => item.name === '$run.completed')).toBe(false);

    const events = await completed(keyBearer, reset);
    expect(Date.now() - startedAt).toBeGreaterThan(11_000);
    expect(summaries(events, 'quiet')).toEqual([
      'Waiting for $app.backgrounded and 1 day of quiet',
      'Received $app.backgrounded',
    ]);
    expect(summaries(events, 'ping')).toEqual(['Set pinged to true']);
  }, 120_000);

  it('branches on the opened and delivered receipts of an earlier send', async () => {
    const base = await setupWorkspace({ push: 'unusable' });
    const { keyBearer } = base;
    const clientBearer = await clientBearerFor(base);
    const opener = `opener_${uniq()}`;
    const receiver = `receiver_${uniq()}`;
    const ghost = `ghost_${uniq()}`;
    const users = [opener, receiver, ghost];
    for (const user of users) await subscribe(keyBearer, user);
    await publish(keyBearer, `receipts-${uniq()}`, {
      trigger: { event: 'digest.ready' },
      steps: [
        { name: 'nudge', send: { title: 'Your digest' } },
        { name: 'ack', waitFor: { event: 'ack', timeout: '2d' } },
        {
          name: 'engagement',
          branch: [
            {
              name: 'opened',
              when: { opened: 'nudge' },
              steps: [{ name: 'engaged', set: { var: 'outcome', value: 'opened' } }],
            },
            {
              name: 'delivered',
              when: { all: [{ delivered: 'nudge' }, { not: { opened: 'nudge' } }] },
              steps: [{ name: 'seen', set: { var: 'outcome', value: 'delivered' } }],
            },
            { name: 'else', steps: [{ name: 'missed', set: { var: 'outcome', value: 'nothing' } }] },
          ],
        },
      ],
    });

    for (const user of users) await track(keyBearer, user, 'digest.ready');
    for (const user of users) await waiting(keyBearer, user, 'ack');
    const messageIdOf = async (user: string) => {
      const sent = (await runEvents(keyBearer, user)).find((item) => item.data.step === 'nudge');
      return sent?.data.messageId as string;
    };
    expect(await messageIdOf(opener)).toMatch(/^msg_/);
    await deviceEvent(clientBearer, opener, '$notification.delivered', {
      messageId: await messageIdOf(opener),
    });
    await deviceEvent(clientBearer, opener, '$notification.opened', { messageId: await messageIdOf(opener) });
    await deviceEvent(clientBearer, receiver, '$notification.delivered', {
      messageId: await messageIdOf(receiver),
    });
    for (const user of users) await track(keyBearer, user, 'ack');

    const taken = async (user: string) =>
      (await completed(keyBearer, user)).find((item) => item.data.step === 'engagement')?.data.taken;
    expect(await taken(opener)).toBe('opened');
    expect(await taken(receiver)).toBe('delivered');
    expect(await taken(ghost)).toBe('else');
  }, 120_000);

  it('branches on the subscriber channels and topic opt-ins', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const deals = `deals-${uniq()}`;
    const promo = `promo-${uniq()}`;
    for (const [slug, defaultOptedIn] of [
      [deals, true],
      [promo, false],
    ] as const) {
      const created = await api('/v1/topics', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ slug, name: slug, channels: ['push'], defaultOptedIn }),
      });
      expect(created.status).toBe(201);
    }
    const user = `facets_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `facets-${uniq()}`, {
      trigger: { event: 'go' },
      steps: [
        {
          name: 'route',
          branch: [
            {
              name: 'targeted',
              when: {
                all: [
                  { ref: 'subscriber.channels.push', eq: true },
                  { ref: `subscriber.topics.${deals}`, eq: true },
                  { ref: `subscriber.topics.${promo}`, eq: false },
                ],
              },
              steps: [{ name: 'deal', set: { var: 'deal', value: 'push' } }],
            },
            { name: 'else', steps: [{ name: 'none', set: { var: 'deal', value: 'none' } }] },
          ],
        },
        {
          name: 'summary',
          send: { title: `Push {{ subscriber.channels.push }} deals {{ subscriber.topics.${deals} }}` },
        },
      ],
    });

    await track(keyBearer, user, 'go');
    const events = await completed(keyBearer, user);
    expect(events.find((item) => item.data.step === 'route')?.data.taken).toBe('targeted');
    expect(summaries(events, 'summary')).toEqual(['Sent “Push true deals true”']);
  }, 60_000);

  it('writes typed attributes, removes them with null, and keeps placeholder types in variables', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `typed_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `typed-${uniq()}`, {
      trigger: { event: 'scored' },
      steps: [
        { name: 'score', set: { attribute: 'score', value: '{{ trigger.data.score }}' } },
        { name: 'flag', set: { var: 'ok', value: '{{ trigger.data.ok }}' } },
        {
          name: 'label',
          set: { attribute: 'label', value: 'Level {{ trigger.data.score | divided_by: 10 | floor }}' },
        },
        { name: 'forget', set: { attribute: 'score', value: null } },
        { name: 'report', send: { title: 'Ok {{ vars.ok }} at {{ subscriber.attributes.label }}' } },
      ],
    });

    await track(keyBearer, user, 'scored', { score: 42, ok: true });
    const events = await completed(keyBearer, user);
    expect(summaries(events, 'score')).toEqual(['Set score to 42']);
    expect(events.find((item) => item.data.step === 'score')?.data).toMatchObject({
      attribute: 'score',
      value: 42,
    });
    expect(summaries(events, 'flag')).toEqual(['Set ok to true']);
    expect(summaries(events, 'label')).toEqual(['Set label to “Level 4”']);
    expect(summaries(events, 'forget')).toEqual(['Set score to null']);
    expect(summaries(events, 'report')).toEqual(['Sent “Ok true at Level 4”']);

    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${user}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.attributes).toMatchObject({ label: 'Level 4' });
    expect(subscriber.body.data?.attributes).not.toHaveProperty('score');
    const { body } = await api<{ items: RunEvent[] }>(`/v1/subscribers/${user}/timeline?limit=100`, {
      headers: keyBearer,
    });
    expect(
      (body.data?.items ?? []).filter((item) => item.name === '$subscriber.updated').length
    ).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
