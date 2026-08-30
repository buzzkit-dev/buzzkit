import { localTime } from '@buzzkit/api/libs/timezone';
import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe } from '../../utils/workflows';

type Headers = Record<string, string>;
type ScheduleBody = {
  schedule: { daily?: string; cron?: string };
  timezone: string;
  defaultTimezone: string;
  segment: string | null;
  next: Array<{ zone: string; at: string }>;
  fires: Array<{
    firedAt: string;
    zones: string[];
    version: number;
    started: number;
    finishedAt: string | null;
  }>;
};
type MessageItem = { payload: { title?: string } };

async function tick() {
  const response = await fetch(`${BASE_URL}/__scheduled?cron=*+*+*+*+*`);
  expect(response.status).toBe(200);
}

function minuteOf(zone: string): string {
  const local = localTime(new Date(), zone);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}

async function started(headers: Headers, user: string) {
  return (await runEvents(headers, user)).filter((item) => item.name === '$run.started');
}

async function setTimezone(headers: Headers, user: string, timezone: string) {
  const { status } = await api(`/v1/subscribers/${user}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ timezone }),
  });
  expect(status).toBe(200);
}

describe('workflow schedules', () => {
  it('starts one run per subscriber when a fixed-zone schedule fires, exactly once across ticks', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const users = [`fixed_${uniq()}`, `fixed_${uniq()}`];
    for (const user of users) await subscribe(keyBearer, user);
    const minute = minuteOf('UTC');
    const slug = `daily-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { schedule: { daily: minute }, timezone: 'UTC' },
      steps: [{ name: 'hello', send: { title: 'Good morning' } }],
    });

    await tick();
    for (const user of users) {
      await eventually(async () => (await started(keyBearer, user)).length === 1, {
        label: `run started for ${user}`,
        timeoutMs: 30_000,
        intervalMs: 300,
      });
    }
    const [first] = await started(keyBearer, users[0] as string);
    expect(first?.data.trigger).toEqual({ name: '$schedule', firedAt: expect.any(String), zone: 'UTC' });

    await tick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    for (const user of users) expect(await started(keyBearer, user)).toHaveLength(1);

    const schedule = await api<ScheduleBody>(`/v1/workflows/${slug}/schedule`, { headers: keyBearer });
    expect(schedule.status).toBe(200);
    expect(schedule.body.data).toMatchObject({
      schedule: { daily: minute },
      timezone: 'UTC',
      segment: null,
    });
    expect(schedule.body.data?.next).toEqual([{ zone: 'UTC', at: expect.any(String) }]);
    expect(Date.parse(schedule.body.data?.next[0]?.at ?? '')).toBeGreaterThan(Date.now());
    expect(schedule.body.data?.fires).toEqual([
      {
        firedAt: expect.any(String),
        zones: ['UTC'],
        version: 1,
        started: 2,
        finishedAt: expect.any(String),
      },
    ]);

    await eventually(
      async () => {
        const { body } = await api<{ items: MessageItem[] }>('/v1/messages?limit=10', { headers: keyBearer });
        return (body.data?.items ?? []).filter((item) => item.payload.title === 'Good morning').length === 2;
      },
      { label: 'both sends', timeoutMs: 30_000, intervalMs: 300 }
    );

    const eventDriven = await api(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({
        spec: { trigger: { event: 'trial.started' }, steps: [{ name: 'hello', send: { title: 'Hi' } }] },
      }),
    });
    expect(eventDriven.status).toBe(200);
  }, 90_000);

  it("fires per subscriber timezone, taking the workflow's default zone for subscribers without one", async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const paris = `paris_${uniq()}`;
    const nobody = `nobody_${uniq()}`;
    const tokyo = `tokyo_${uniq()}`;
    for (const user of [paris, nobody, tokyo]) await subscribe(keyBearer, user);
    await setTimezone(keyBearer, paris, 'Europe/Paris');
    await setTimezone(keyBearer, tokyo, 'Asia/Tokyo');
    const slug = `local-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { schedule: { daily: minuteOf('Europe/Paris') }, timezone: 'subscriber' },
      defaultTimezone: 'Europe/Paris',
      steps: [{ name: 'hello', send: { title: 'Bonjour' } }],
    });

    await tick();
    for (const user of [paris, nobody]) {
      await eventually(async () => (await started(keyBearer, user)).length === 1, {
        label: `run started for ${user}`,
        timeoutMs: 30_000,
        intervalMs: 300,
      });
    }
    const [run] = await started(keyBearer, paris);
    expect(run?.data.trigger).toMatchObject({ name: '$schedule', zone: 'Europe/Paris' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await started(keyBearer, tokyo)).toEqual([]);

    const schedule = await api<ScheduleBody>(`/v1/workflows/${slug}/schedule`, { headers: keyBearer });
    const next = schedule.body.data?.next ?? [];
    const now = Date.now();
    expect(next.length).toBeGreaterThan(1);
    expect(schedule.body.data?.defaultTimezone).toBe('Europe/Paris');
    for (const [index, fire] of next.entries()) {
      expect(Date.parse(fire.at)).toBeGreaterThan(now);
      expect(Date.parse(fire.at)).toBeLessThanOrEqual(now + 24 * 3_600_000);
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: fire.zone })).not.toThrow();
      if (index > 0)
        expect(Date.parse(fire.at)).toBeGreaterThanOrEqual(Date.parse(next[index - 1]?.at ?? ''));
    }
    expect(Date.parse(next[0]?.at ?? '')).toBeLessThan(now + 2 * 3_600_000);
    expect(new Set(next.map((fire) => fire.zone)).size).toBe(next.length);

    const paused = await api(`/v1/workflows/${slug}/pause`, { method: 'POST', headers: keyBearer });
    expect(paused.status).toBe(200);
    const afterPause = await api<ScheduleBody>(`/v1/workflows/${slug}/schedule`, { headers: keyBearer });
    expect(afterPause.body.data?.next).toEqual([]);
  }, 90_000);

  it('scopes a schedule to a segment and refuses one that does not exist', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const pro = `pro_${uniq()}`;
    const free = `free_${uniq()}`;
    for (const user of [pro, free]) await subscribe(keyBearer, user);
    await api(`/v1/subscribers/${pro}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { plan: 'pro' } }),
    });
    const segment = await api('/v1/segments', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: 'pros', name: 'Pros', expression: { ref: 'attributes.plan', eq: 'pro' } }),
    });
    expect(segment.status).toBe(201);
    await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ externalId: string }> }>('/v1/segments/pros/members', {
          headers: keyBearer,
        });
        return (body.data?.items ?? []).some((item) => item.externalId === pro);
      },
      { label: 'segment sees the pro subscriber', timeoutMs: 30_000, intervalMs: 500 }
    );

    const missing = await api('/v1/workflows', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        slug: `nope-${uniq()}`,
        name: 'Nope',
        spec: {
          trigger: { schedule: { daily: '09:00' }, timezone: 'UTC', segment: 'nope' },
          steps: [{ name: 'hello', send: { title: 'Hi' } }],
        },
      }),
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.code).toBe('segment_not_found');

    await publish(keyBearer, `pros-${uniq()}`, {
      trigger: { schedule: { daily: minuteOf('UTC') }, timezone: 'UTC', segment: 'pros' },
      steps: [{ name: 'hello', send: { title: 'Pro tip' } }],
    });
    await tick();
    await eventually(async () => (await started(keyBearer, pro)).length === 1, {
      label: 'run started for the pro subscriber',
      timeoutMs: 30_000,
      intervalMs: 300,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await started(keyBearer, free)).toEqual([]);
  }, 90_000);
});
