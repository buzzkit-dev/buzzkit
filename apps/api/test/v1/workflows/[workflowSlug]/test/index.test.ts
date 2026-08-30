import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';
import { subscribe } from '../../../../utils/workflows';

type Headers = Record<string, string>;
type Trace = {
  step: string;
  status: string;
  summary: string;
  detail: Record<string, unknown> | null;
  at: string;
};
type DryRun = {
  version: number;
  trigger: { name: string; data: Record<string, unknown>; source: string };
  subscriber: string | null;
  outcome: 'completed' | 'failed';
  exited: boolean;
  error: string | null;
  path: string[];
  steps: Trace[];
  vars: Record<string, unknown>;
  lint: unknown[];
};

const trial = {
  trigger: { event: 'trial.started' },
  steps: [
    { name: 'settle', wait: '2h' },
    { name: 'status', fetch: { url: 'http://localhost:1/status', as: 'status' } },
    { name: 'cancel', waitFor: { event: 'trial.canceled', timeout: '1d' } },
    {
      name: 'outcome',
      branch: [
        {
          name: 'canceled',
          when: {
            any: [
              { ref: 'steps.cancel.matched', eq: true },
              { ref: 'vars.status.canceled', eq: true },
            ],
          },
          steps: [{ name: 'sorry', send: { title: 'Your trial is canceled' } }],
        },
        {
          name: 'otherwise',
          steps: [{ name: 'nudge', send: { title: 'Your trial ends {{ trigger.data.endsAt | date }}' } }],
        },
      ],
    },
    { name: 'final', waitUntil: { delay: '2d', time: '09:00', timezone: 'subscriber' } },
    { name: 'bye', send: { title: 'Thanks {{ subscriber.attributes.name | default: "there" }}' } },
    { name: 'remember', set: { attribute: 'trialEnded', value: true } },
  ],
};

async function draft(headers: Headers, spec: Record<string, unknown>) {
  const slug = `dry-${uniq()}`;
  const { status, body } = await api('/v1/workflows', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name: 'Dry', spec }),
  });
  if (status !== 201) throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  return slug;
}

function test(headers: Headers, slug: string, input: Record<string, unknown>) {
  return api<DryRun>(`/v1/workflows/${slug}/test`, { method: 'POST', headers, body: JSON.stringify(input) });
}

describe('POST /v1/workflows/:slug/test', () => {
  it('replays a draft for a subscriber without sending, taking assumptions for waits and fetches', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `dry_${uniq()}`;
    await subscribe(keyBearer, user);
    await api(`/v1/subscribers/${user}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ timezone: 'Europe/Paris' }),
    });
    const slug = await draft(keyBearer, trial);

    const { status, body } = await test(keyBearer, slug, {
      externalId: user,
      event: { name: 'trial.started', data: { plan: 'monthly', endsAt: '2026-09-04T09:00:00Z' } },
      at: '2026-09-01T10:00:00Z',
      assume: {
        status: { status: 200, data: { canceled: false } },
        cancel: { matched: true, data: { reason: 'price' } },
      },
    });
    expect(status).toBe(200);
    const run = body.data as DryRun;
    expect(run).toMatchObject({
      version: 1,
      trigger: { name: 'trial.started', data: { plan: 'monthly' }, source: 'server' },
      subscriber: user,
      outcome: 'completed',
      exited: false,
      error: null,
      path: ['settle', 'status', 'cancel', 'outcome', 'sorry', 'final', 'bye', 'remember'],
      vars: { status: { canceled: false } },
      lint: [],
    });
    const summaries = run.steps.map((entry) => `${entry.step}:${entry.status}:${entry.summary}`);
    expect(summaries).toEqual([
      'settle:sleeping:Waiting 2 hours',
      'settle:completed:Waited 2 hours',
      'status:completed:Assumed localhost:1 answers 200',
      'cancel:waiting:Waiting for trial.canceled',
      'cancel:completed:Received trial.canceled',
      'outcome:completed:Took canceled',
      'sorry:completed:Would send “Your trial is canceled”',
      'final:sleeping:Waiting until Sep 4, 2026, 9:00 AM Europe/Paris',
      'final:completed:Reached Sep 4, 2026, 9:00 AM Europe/Paris',
      'bye:completed:Would send “Thanks there”',
      'remember:completed:Would set trialEnded to true',
    ]);
    expect(run.steps.find((entry) => entry.step === 'final')?.detail).toEqual({
      until: '2026-09-04T07:00:00.000Z',
      timezone: 'Europe/Paris',
    });
    expect(run.steps.find((entry) => entry.step === 'sorry')?.detail).toEqual({
      payload: { title: 'Your trial is canceled' },
    });

    const messages = await api<{ items: unknown[] }>('/v1/messages', { headers: keyBearer });
    expect(messages.body.data?.items).toEqual([]);
    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${user}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.attributes.trialEnded).toBeUndefined();
  });

  it('runs a chosen version with attributes instead of a subscriber, and reports a failing step', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, trial);
    const changed = await api(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({
        spec: {
          trigger: { event: 'trial.started' },
          steps: [{ name: 'hello', send: { topic: 'nope', title: 'Hi' } }],
        },
      }),
    });
    expect(changed.status).toBe(200);

    const older = await test(keyBearer, slug, {
      version: 1,
      attributes: { name: 'Ada', $timezone: 'Asia/Tokyo' },
      event: { name: 'trial.started', data: { endsAt: '2026-09-04T09:00:00Z' } },
      at: '2026-09-01T10:00:00Z',
      assume: { cancel: { matched: false } },
    });
    expect(older.status).toBe(200);
    expect(older.body.data).toMatchObject({
      version: 1,
      subscriber: null,
      outcome: 'completed',
      path: ['settle', 'status', 'cancel', 'outcome', 'nudge', 'final', 'bye', 'remember'],
    });
    const steps = older.body.data?.steps ?? [];
    expect(steps.find((entry) => entry.step === 'status')?.summary).toBe('Would call GET localhost:1');
    expect(steps.find((entry) => entry.step === 'cancel' && entry.status === 'completed')?.summary).toBe(
      'No trial.canceled in time'
    );
    expect(steps.find((entry) => entry.step === 'nudge')?.summary).toBe(
      'Would send “Your trial ends September 4, 2026”'
    );
    expect(steps.find((entry) => entry.step === 'final')?.detail?.timezone).toBe('Asia/Tokyo');
    expect(steps.find((entry) => entry.step === 'bye')?.summary).toBe('Would send “Thanks Ada”');

    const failing = await test(keyBearer, slug, { event: { name: 'trial.started' } });
    expect(failing.status).toBe(200);
    expect(failing.body.data).toMatchObject({
      version: 2,
      outcome: 'failed',
      error: 'Topic not found',
      path: [],
      steps: [],
    });

    const mismatch = await test(keyBearer, slug, { event: { name: 'order.placed' } });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error?.code).toBe('event_mismatch');
    const missing = await test(keyBearer, slug, { version: 9 });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.code).toBe('version_not_found');
  });

  it('dry-runs a schedule workflow at a given instant in the subscriber zone', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { schedule: { daily: '19:00' }, timezone: 'subscriber' },
      steps: [{ name: 'nudge', send: { title: 'Log a workout' } }],
    });
    const { status, body } = await test(keyBearer, slug, {
      attributes: { $timezone: 'Europe/Berlin' },
      at: '2026-09-01T17:00:00Z',
    });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      trigger: { name: '$schedule', data: { firedAt: '2026-09-01T17:00:00.000Z', zone: 'Europe/Berlin' } },
      outcome: 'completed',
      path: ['nudge'],
    });
  });
});

describe('the dry run clock', () => {
  it('moves forward through waits so every step says when it would happen', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { event: 'offer.created' },
      steps: [
        { name: 'breathe', wait: '2h' },
        { name: 'morning', waitUntil: { time: '09:00', timezone: 'Europe/Berlin' } },
        { name: 'reply', waitFor: { event: 'offer.viewed', timeout: '3d' } },
        { name: 'tell', send: { title: 'It is {{ now | date: "weekday" }}, {{ now | time }}' } },
      ],
    });
    const { status, body } = await test(keyBearer, slug, {
      attributes: { name: 'Ada', $timezone: 'Europe/Berlin' },
      at: '2026-09-01T10:00:00Z',
    });
    expect(status).toBe(200);
    const at = (step: string, state: string) =>
      body.data?.steps.find((entry) => entry.step === step && entry.status === state)?.at;
    expect(at('breathe', 'sleeping')).toBe('2026-09-01T10:00:00.000Z');
    expect(at('breathe', 'completed')).toBe('2026-09-01T12:00:00.000Z');
    expect(at('morning', 'completed')).toBe('2026-09-02T07:00:00.000Z');
    expect(at('reply', 'completed')).toBe('2026-09-05T07:00:00.000Z');
    expect(body.data?.steps.find((entry) => entry.step === 'tell')?.summary).toBe(
      'Would send “It is Saturday, 9:00 AM”'
    );
  });
});
