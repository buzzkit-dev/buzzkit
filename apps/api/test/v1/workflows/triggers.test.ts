import { localTime } from '@buzzkit/api/libs/timezone';
import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type ScheduleBody = { schedule: { cron?: string }; next: Array<{ zone: string; at: string }> };

async function started(headers: Headers, user: string) {
  return (await runEvents(headers, user)).filter((item) => item.name === '$run.started');
}

async function settle(ms = 1500) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick() {
  const response = await fetch(`${BASE_URL}/__scheduled?cron=*+*+*+*+*`);
  expect(response.status).toBe(200);
}

describe('workflow triggers', () => {
  it('starts only from the listed sources and records the source on the run', async () => {
    const { keyBearer, owner, workspace } = await setupWorkspace({ push: 'unusable' });
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const clientBearer = { Authorization: `Bearer ${clientKey.secret}` };
    const user = `sourced_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `sources-${uniq()}`, {
      trigger: { event: 'app.rated', sources: ['ios', 'android'] },
      steps: [{ name: 'thanks', set: { var: 'thanked', value: true } }],
    });

    await track(keyBearer, user, 'app.rated', { stars: 5 });
    await settle();
    expect(await started(keyBearer, user)).toEqual([]);

    const rated = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: user,
        source: 'ios',
        events: [{ id: uniq(), name: 'app.rated', data: { stars: 5 } }],
      }),
    });
    expect(rated.status).toBe(202);
    const [run] = await eventually(
      async () => {
        const runs = await started(keyBearer, user);
        return runs.length === 1 ? runs : undefined;
      },
      { label: 'run started from the device', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(run?.data.trigger).toMatchObject({ name: 'app.rated', data: { stars: 5 } });
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'run completed', timeoutMs: 30_000, intervalMs: 300 }
    );
  }, 60_000);

  it('reads the subscriber history and attributes in the trigger condition', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `history_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `history-${uniq()}`, {
      trigger: {
        event: 'cart.viewed',
        where: {
          all: [
            {
              any: [
                { count: 'purchase', gte: 1 },
                { occurred: 'gift.received', within: '7d' },
              ],
            },
            { not: { ref: 'subscriber.attributes.vip', eq: true } },
            { never: 'account.closed' },
          ],
        },
      },
      steps: [{ name: 'note', set: { var: 'seen', value: true } }],
    });

    await track(keyBearer, user, 'cart.viewed');
    await settle();
    expect(await started(keyBearer, user)).toEqual([]);

    await track(keyBearer, user, 'gift.received');
    await track(keyBearer, user, 'cart.viewed');
    await eventually(async () => (await started(keyBearer, user)).length === 1, {
      label: 'run started once the history matches',
      timeoutMs: 30_000,
      intervalMs: 300,
    });

    await api(`/v1/subscribers/${user}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { vip: true } }),
    });
    await track(keyBearer, user, 'cart.viewed');
    await settle();
    expect(await started(keyBearer, user)).toHaveLength(1);

    await api(`/v1/subscribers/${user}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { vip: false } }),
    });
    await track(keyBearer, user, 'account.closed');
    await track(keyBearer, user, 'cart.viewed');
    await settle();
    expect(await started(keyBearer, user)).toHaveLength(1);
  }, 60_000);

  it('fires a cron schedule and only starts subscribers whose history condition holds since local midnight', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const idle = `idle_${uniq()}`;
    const active = `active_${uniq()}`;
    for (const user of [idle, active]) await subscribe(keyBearer, user);
    await track(keyBearer, active, 'workout.completed');
    const now = localTime(new Date(), 'UTC');
    const cron = `${now.minute} ${now.hour} * * SUN,MON,TUE,WED,THU,FRI,SAT`;
    const slug = `streak-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: {
        schedule: { cron },
        timezone: 'UTC',
        where: { count: 'workout.completed', since: 'localMidnight', eq: 0 },
      },
      steps: [{ name: 'nudge', send: { title: 'Keep the streak' } }],
    });

    await tick();
    const [run] = await eventually(
      async () => {
        const runs = await started(keyBearer, idle);
        return runs.length === 1 ? runs : undefined;
      },
      { label: 'run started for the idle subscriber', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(run?.data.trigger).toEqual({ name: '$schedule', firedAt: expect.any(String), zone: 'UTC' });
    await settle();
    expect(await started(keyBearer, active)).toEqual([]);

    const schedule = await api<ScheduleBody>(`/v1/workflows/${slug}/schedule`, { headers: keyBearer });
    expect(schedule.body.data?.schedule).toEqual({ cron });
    expect(schedule.body.data?.next).toEqual([{ zone: 'UTC', at: expect.any(String) }]);
    expect(Date.parse(schedule.body.data?.next[0]?.at ?? '')).toBeGreaterThan(Date.now());
  }, 60_000);
});
