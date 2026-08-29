import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { addMember, createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;

type VersionBody = {
  id: string;
  number: number;
  publishedAt: string | null;
  createdAt: string;
  spec?: { trigger: { event: string } };
};

type WorkflowBody = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  trigger: { event: string };
  spec: Record<string, unknown>;
  current: VersionBody | null;
  draft: VersionBody | null;
  versions?: VersionBody[];
  runs?: { running: number; sleeping: number; waiting: number; steps: Record<string, number> };
  deleted?: boolean;
};

const spec = (event = 'trial.started') => ({
  trigger: { event },
  steps: [
    { name: 'settle', wait: '2h' },
    { name: 'hello', send: { title: 'Hello' } },
  ],
});

function create(headers: Headers, input: Record<string, unknown> = {}) {
  return api<WorkflowBody>('/v1/workflows', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug: `wf-${uniq()}`, name: 'Trial', spec: spec(), ...input }),
  });
}

describe('workflows CRUD', () => {
  it('creates a draft with version 1, lists, reads, versions on spec change and deletes', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `wf-${uniq()}`;
    const created = await create(keyBearer, { slug, description: 'The trial sequence' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      slug,
      name: 'Trial',
      description: 'The trial sequence',
      status: 'draft',
      trigger: { event: 'trial.started' },
      current: null,
      draft: { number: 1, publishedAt: null },
    });
    expect(created.body.data?.id).toMatch(/^wf_/);
    expect(created.body.data?.draft?.id).toMatch(/^wfv_/);

    const listed = await api<{ items: WorkflowBody[] }>('/v1/workflows', { headers: keyBearer });
    expect(listed.body.data?.items.map((item) => item.slug)).toEqual([slug]);

    const renamed = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Trial sequence', description: null }),
    });
    expect(renamed.body.data).toMatchObject({
      name: 'Trial sequence',
      description: null,
      draft: { number: 1 },
    });

    const same = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ spec: spec() }),
    });
    expect(same.body.data?.draft?.number).toBe(1);

    const changed = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ spec: spec('trial.renewed') }),
    });
    expect(changed.body.data?.draft?.number).toBe(2);
    expect(changed.body.data?.trigger.event).toBe('trial.renewed');

    const read = await api<WorkflowBody>(`/v1/workflows/${slug}`, { headers: keyBearer });
    expect(read.body.data?.versions?.map((version) => version.number)).toEqual([2, 1]);
    expect(read.body.data?.versions?.map((version) => version.spec?.trigger.event)).toEqual([
      'trial.renewed',
      'trial.started',
    ]);

    const empty = await api(`/v1/workflows/${slug}`, { method: 'PATCH', headers: keyBearer, body: '{}' });
    expect(empty.status).toBe(400);

    const deleted = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.deleted).toBe(true);
    expect((await api(`/v1/workflows/${slug}`, { headers: keyBearer })).status).toBe(404);
    expect((await create(keyBearer, { slug })).status).toBe(201);
  });

  it('refuses a bad spec naming the path, a reserved and a taken slug', async () => {
    const { keyBearer } = await setupWorkspace();
    const badWait = await create(keyBearer, {
      spec: { trigger: { event: 'a' }, steps: [{ name: 'x', wait: '2 hours' }] },
    });
    expect(badWait.status).toBe(400);
    expect(badWait.body.error?.code).toBe('invalid_spec');
    expect(badWait.body.error?.param).toBe('spec.steps[0].wait');

    const reservedEvent = await create(keyBearer, {
      spec: { trigger: { event: '$run.started' }, steps: [{ exit: true }] },
    });
    expect(reservedEvent.body.error?.param).toBe('spec.trigger.event');

    const notObject = await create(keyBearer, { spec: 'nope' });
    expect(notObject.body.error?.param).toBe('spec');

    expect((await create(keyBearer, { slug: 'new' })).body.error?.code).toBe('slug_reserved');
    const slug = `wf-${uniq()}`;
    await create(keyBearer, { slug });
    const taken = await create(keyBearer, { slug });
    expect(taken.status).toBe(409);
    expect(taken.body.error?.code).toBe('slug_taken');
  });

  it('keeps workflows per tenant and lets members read while only admins write', async () => {
    const { keyBearer, owner, workspace } = await setupWorkspace();
    const other = await createTenant(keyBearer, 'Other');
    const slug = `wf-${uniq()}`;
    await create(keyBearer, { slug });
    const foreign = await api(`/v1/workflows/${slug}`, {
      headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
    });
    expect(foreign.status).toBe(404);

    const member = await addMember(owner.token, workspace.slug, 'member');
    const asMember = { Authorization: `Bearer ${member.token}`, 'buzzkit-workspace': workspace.slug };
    expect((await api('/v1/workflows', { headers: asMember })).status).toBe(200);
    expect((await create(asMember)).status).toBe(403);

    const reader = await createKey(owner.token, workspace.slug, { scopes: ['workflows:read'] });
    const readerBearer = { Authorization: `Bearer ${reader.secret}` };
    expect((await api('/v1/workflows', { headers: readerBearer })).status).toBe(200);
    expect((await create(readerBearer)).status).toBe(403);
  });
});

type MessageItem = { id: string; payload: { title?: string }; run: { id: string; step: string } | null };

async function sentTitles(headers: Headers) {
  const { body } = await api<{ items: MessageItem[] }>('/v1/messages?limit=50', { headers });
  return (body.data?.items ?? []).map((item) => item.payload.title ?? '').reverse();
}

const holdSpec = {
  trigger: { event: 'order.placed' },
  steps: [
    { name: 'hold', waitFor: { event: 'order.paid', until: '2d' } },
    { name: 'thanks', send: { title: 'Thanks' } },
  ],
};

const trialSpec = {
  trigger: {
    event: 'trial.started',
    sources: ['server'],
    where: { ref: 'trigger.data.plan', eq: 'monthly' },
  },
  concurrency: 'one-per-subscriber',
  cancelOn: [{ event: 'subscription.started' }],
  steps: [
    { name: 'settle', wait: '2h' },
    { name: 'cancel', waitFor: { event: 'trial.cancelled', until: '1d' } },
    {
      name: 'outcome',
      branch: {
        if: { ref: 'steps.cancel.matched', eq: true },
        then: [
          {
            name: 'sorry',
            send: {
              title: 'Your trial is cancelled',
              body: 'Alerts continue until {{ trigger.data.endsAt }}.',
            },
          },
        ],
        else: [{ name: 'nudge', send: { title: 'Your trial ends tomorrow' } }],
      },
    },
    { name: 'final', waitUntil: { after: 'trigger', plus: '1d' } },
    { name: 'bye', send: { title: 'Thanks {{ subscriber.attributes.name }}' } },
  ],
};

describe('workflow runs', () => {
  it('runs the trial workflow end to end: sleeps, waits for the cancel event, branches, sends, anchors, completes', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `trial_${uniq()}`;
    await subscribe(keyBearer, user);
    await api(`/v1/subscribers/${user}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { name: 'Ada' } }),
    });
    await publish(keyBearer, `trial-${uniq()}`, trialSpec);

    await track(keyBearer, user, 'trial.started', { plan: 'yearly' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(await runEvents(keyBearer, user)).toEqual([]);

    await track(keyBearer, user, 'trial.started', { plan: 'monthly', endsAt: 'Friday' });
    await eventually(
      async () =>
        (await runEvents(keyBearer, user)).some(
          (item) => item.name === '$run.step' && item.data.step === 'cancel' && item.data.status === 'waiting'
        ),
      { label: 'waiting for the cancel event', timeoutMs: 30_000, intervalMs: 300 }
    );
    await track(keyBearer, user, 'trial.cancelled');
    await eventually(async () => (await sentTitles(keyBearer)).includes('Your trial is cancelled'), {
      label: 'cancel branch sent',
      timeoutMs: 30_000,
      intervalMs: 300,
    });
    const { body } = await api<{ items: MessageItem[] }>('/v1/messages?limit=5', { headers: keyBearer });
    const sorry = body.data?.items.find((item) => item.payload.title === 'Your trial is cancelled');
    expect(sorry?.run?.step).toBe('sorry');
    expect(sorry?.run?.id).toMatch(/^\d+-wf_/);
    expect(sorry && (sorry.payload as { body?: string }).body).toBe('Alerts continue until Friday.');

    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'run completed', timeoutMs: 60_000, intervalMs: 500 }
    );
    expect(await sentTitles(keyBearer)).toEqual(['Your trial is cancelled', 'Thanks Ada']);
    const events = await runEvents(keyBearer, user);
    expect(events.map((item) => `${item.name}:${item.data.step ?? ''}:${item.data.status ?? ''}`)).toEqual([
      '$run.started::',
      '$run.step:settle:sleeping',
      '$run.step:settle:completed',
      '$run.step:cancel:waiting',
      '$run.step:cancel:completed',
      '$run.step:outcome:completed',
      '$run.step:sorry:completed',
      '$run.step:final:sleeping',
      '$run.step:final:completed',
      '$run.step:bye:completed',
      '$run.completed::',
    ]);
  }, 120_000);

  it('ignores a duplicate trigger and a second trigger under one-per-subscriber, and cancels on the cancel event', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `cancel_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `trial-${uniq()}`, trialSpec);

    const id = `evt-${uniq()}`;
    await track(keyBearer, user, 'trial.started', { plan: 'monthly' }, id);
    await track(keyBearer, user, 'trial.started', { plan: 'monthly' }, id);
    await track(keyBearer, user, 'trial.started', { plan: 'monthly' });
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.started'),
      { label: 'run started', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect((await runEvents(keyBearer, user)).filter((item) => item.name === '$run.started')).toHaveLength(1);

    await track(keyBearer, user, 'subscription.started');
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.cancelled'),
      { label: 'run cancelled', timeoutMs: 30_000, intervalMs: 300 }
    );
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    expect(await sentTitles(keyBearer)).toEqual([]);
    expect((await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed')).toBe(false);
  }, 90_000);

  it('starts nothing while paused and picks the workflow up again once republished', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `pause_${uniq()}`;
    await subscribe(keyBearer, user);
    const slug = `hello-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { event: 'hello' },
      steps: [{ name: 'hi', send: { title: 'Hi' } }],
    });
    await api(`/v1/workflows/${slug}/pause`, { method: 'POST', headers: keyBearer });
    await track(keyBearer, user, 'hello');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await runEvents(keyBearer, user)).toEqual([]);

    await api(`/v1/workflows/${slug}/publish`, { method: 'POST', headers: keyBearer });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await track(keyBearer, user, 'hello');
    await eventually(async () => (await sentTitles(keyBearer)).includes('Hi'), {
      label: 'sent after republish',
      timeoutMs: 30_000,
      intervalMs: 300,
    });
  }, 60_000);

  it('counts live runs on the list and on the workflow', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `hold-${uniq()}`;
    await publish(keyBearer, slug, holdSpec);
    const users = [`hold_${uniq()}`, `hold_${uniq()}`];
    for (const user of users) {
      await subscribe(keyBearer, user);
      await track(keyBearer, user, 'order.placed');
    }

    const counts = { running: 0, sleeping: 0, waiting: 2, steps: { hold: 2 } };
    await eventually(
      async () => {
        const { body } = await api<{ items: WorkflowBody[] }>('/v1/workflows', { headers: keyBearer });
        const item = body.data?.items.find((workflow) => workflow.slug === slug);
        return item && JSON.stringify(item.runs) === JSON.stringify(counts);
      },
      { label: 'two runs waiting', timeoutMs: 30_000, intervalMs: 500 }
    );
    const read = await api<WorkflowBody>(`/v1/workflows/${slug}`, { headers: keyBearer });
    expect(read.body.data?.runs).toEqual(counts);

    await track(keyBearer, users[0]!, 'order.paid');
    await eventually(
      async () => {
        const { body } = await api<WorkflowBody>(`/v1/workflows/${slug}`, { headers: keyBearer });
        return body.data?.runs?.waiting === 1 && body.data.runs.steps.hold === 1;
      },
      { label: 'one run left waiting', timeoutMs: 30_000, intervalMs: 500 }
    );
  }, 60_000);

  it('records the step a run failed in, with the error', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `broken-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { event: 'parcel.shipped' },
      steps: [
        { name: 'settle', wait: '1h' },
        { name: 'notify', send: { topic: 'missing-topic', title: 'On its way' } },
        { name: 'later', wait: '1d' },
      ],
    });
    const user = `broken_${uniq()}`;
    await subscribe(keyBearer, user);
    await track(keyBearer, user, 'parcel.shipped');

    const failed = await eventually(
      async () => (await runEvents(keyBearer, user)).find((item) => item.name === '$run.failed'),
      { label: 'run failed', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(failed.data.error).toBe('Topic not found');
    const run = await api<{ status: string; step: string | null; summary: string | null }>(
      `/v1/runs/${failed.data.runId}`,
      { headers: keyBearer }
    );
    expect(run.body.data).toMatchObject({ status: 'failed', step: 'notify', summary: 'Topic not found' });
    expect((await runEvents(keyBearer, user)).map((item) => item.name)).toEqual([
      '$run.started',
      '$run.step',
      '$run.step',
      '$run.failed',
    ]);
  }, 60_000);

  it('ends the run from an exit inside a branch and skips the steps after the branch', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `exit-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { event: 'order.placed' },
      steps: [
        {
          name: 'paid',
          branch: {
            if: { ref: 'trigger.data.paid', eq: true },
            then: [{ name: 'thanks', send: { title: 'Thanks' } }, { exit: true }],
            else: [{ name: 'reminder', send: { title: 'Still open' } }],
          },
        },
        { name: 'later', wait: '1h' },
        { name: 'nudge', send: { title: 'Last call' } },
      ],
    });
    const paid = `paid_${uniq()}`;
    const open = `open_${uniq()}`;
    await subscribe(keyBearer, paid);
    await subscribe(keyBearer, open);
    await track(keyBearer, paid, 'order.placed', { paid: true });
    await track(keyBearer, open, 'order.placed', { paid: false });

    await eventually(
      async () =>
        (await runEvents(keyBearer, paid)).some((item) => item.name === '$run.completed') &&
        (await runEvents(keyBearer, open)).some((item) => item.name === '$run.completed'),
      { label: 'both runs completed', timeoutMs: 60_000, intervalMs: 500 }
    );
    const steps = async (user: string) =>
      (await runEvents(keyBearer, user))
        .filter((item) => item.name === '$run.step' && item.data.status === 'completed')
        .map((item) => item.data.step);
    expect(await steps(paid)).toEqual(['paid', 'thanks', 'exit']);
    expect(await steps(open)).toEqual(['paid', 'reminder', 'later', 'nudge']);
    expect(await sentTitles(keyBearer)).toEqual(['Thanks', 'Still open', 'Last call']);
  }, 90_000);

  it('cancels only on a cancel rule whose condition matches, and ignores non-matching awaited events', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `rules-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { event: 'cart.updated' },
      cancelOn: [{ event: 'order.placed', where: { ref: 'event.data.total', gte: 50 } }],
      steps: [
        {
          name: 'returned',
          waitFor: { event: 'app.opened', where: { ref: 'event.data.screen', eq: 'cart' }, until: '2d' },
        },
        { name: 'done', send: { title: 'Welcome back to your cart' } },
      ],
    });
    const user = `rules_${uniq()}`;
    await subscribe(keyBearer, user);
    await track(keyBearer, user, 'cart.updated');
    await eventually(
      async () =>
        (await runEvents(keyBearer, user)).some(
          (item) =>
            item.name === '$run.step' && item.data.step === 'returned' && item.data.status === 'waiting'
        ),
      { label: 'waiting for the cart screen', timeoutMs: 30_000, intervalMs: 300 }
    );

    await track(keyBearer, user, 'app.opened', { screen: 'home' });
    await track(keyBearer, user, 'order.placed', { total: 10 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const events = await runEvents(keyBearer, user);
    expect(events.some((item) => item.name === '$run.cancelled')).toBe(false);
    expect(events.filter((item) => item.name === '$run.step')).toHaveLength(1);

    await track(keyBearer, user, 'order.placed', { total: 80 });
    const cancelled = await eventually(
      async () => (await runEvents(keyBearer, user)).find((item) => item.name === '$run.cancelled'),
      { label: 'run cancelled', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(cancelled.data.reason).toBe('cancelOn:order.placed');
    expect(await sentTitles(keyBearer)).toEqual([]);
  }, 90_000);

  it('cancels live runs when their workflow is deleted', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `gone-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { event: 'signup' },
      steps: [{ name: 'hold', waitFor: { event: 'never', until: '2d' } }],
    });
    const user = `gone_${uniq()}`;
    await subscribe(keyBearer, user);
    await track(keyBearer, user, 'signup');
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.data.status === 'waiting'),
      { label: 'run waiting', timeoutMs: 30_000, intervalMs: 300 }
    );

    expect((await api(`/v1/workflows/${slug}`, { method: 'DELETE', headers: keyBearer })).status).toBe(200);
    await track(keyBearer, user, 'app.opened');
    const cancelled = await eventually(
      async () => (await runEvents(keyBearer, user)).find((item) => item.name === '$run.cancelled'),
      { label: 'run cancelled by deletion', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(cancelled.data.reason).toBe('workflow_deleted');
    const runs = await api<{ items: Array<{ status: string }> }>(`/v1/subscribers/${user}/runs`, {
      headers: keyBearer,
    });
    expect(runs.body.data?.items[0]?.status).toBe('cancelled');
  }, 90_000);
});
