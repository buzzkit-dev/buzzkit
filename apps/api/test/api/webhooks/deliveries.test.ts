import { env } from 'cloudflare:workers';
import {
  claimDeliveryAttempt,
  createDeliveries,
  listReconcilableAuditIds,
  listRetryableDeliveryIds,
  listStaleDeliveryIds,
  listUndeliveredAuditRows,
  markEndpointFailure,
  markEndpointSuccess,
  recordWebhookEvent,
  resetDelivery,
  settleDelivery,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from '@buzzkit/api/api/webhooks/index';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { processWebhookMessage } from '@buzzkit/api/queue/webhooks';
import { and, eq, inArray, tables } from '@buzzkit/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../utils/db';
import { uniq } from '../../utils/setup';

const DAY_MS = 24 * 60 * 60 * 1000;

const sends = vi.fn(async () => {});

async function createWorkspaceRow() {
  const [row] = await db
    .insert(tables.workspace)
    .values({ name: 'Audit', slug: `audit-${uniq()}` })
    .returning();
  return row!;
}

async function createTenantRow(workspaceId: number) {
  const [row] = await db
    .insert(tables.tenant)
    .values({ workspaceId, name: 'Tenant', slug: `tenant-${uniq()}` })
    .returning();
  return row!;
}

async function createEndpointRow(
  workspaceId: number,
  overrides: Partial<typeof tables.webhookEndpoint.$inferInsert> = {}
): Promise<WebhookEndpoint> {
  const [row] = await db
    .insert(tables.webhookEndpoint)
    .values({
      workspaceId,
      url: `http://127.0.0.1:9/${uniq()}`,
      events: [],
      secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
      ...overrides,
    })
    .returning();
  return row!;
}

async function createEventRow(workspaceId: number, tenantId: number | null = null): Promise<WebhookEvent> {
  return await recordWebhookEvent(db, {
    workspaceId,
    tenantId,
    subscriberId: null,
    source: 'audit',
    sourceId: `audit-${uniq()}`,
    type: 'topic.created',
    payload: { id: null, type: 'topic.created' },
  });
}

async function createAuditRow(
  workspaceId: number,
  event: string,
  overrides: Partial<typeof tables.event.$inferInsert> = {}
) {
  const [row] = await db
    .insert(tables.event)
    .values({ workspaceId, tenantId: null, event, actorType: 'system', actorDisplay: 'System', ...overrides })
    .returning();
  return row!;
}

async function readDelivery(id: number): Promise<WebhookDelivery> {
  const [row] = await db.select().from(tables.webhookDelivery).where(eq(tables.webhookDelivery.id, id));
  return row!;
}

async function readEndpoint(id: number): Promise<WebhookEndpoint> {
  const [row] = await db.select().from(tables.webhookEndpoint).where(eq(tables.webhookEndpoint.id, id));
  return row!;
}

async function attemptRows(deliveryId: number) {
  return await db
    .select()
    .from(tables.webhookAttempt)
    .where(eq(tables.webhookAttempt.deliveryId, deliveryId))
    .orderBy(tables.webhookAttempt.id);
}

async function backdate(deliveryId: number, column: 'nextAttemptAt' | 'updatedAt', ms: number) {
  await db
    .update(tables.webhookDelivery)
    .set({ [column]: new Date(Date.now() - ms) })
    .where(eq(tables.webhookDelivery.id, deliveryId));
}

beforeEach(() => {
  sends.mockClear();
  Object.assign(env, { ENVIRONMENT: 'test', WEBHOOKS: { send: sends } });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (env as Record<string, unknown>).ENVIRONMENT;
  delete (env as Record<string, unknown>).WEBHOOKS;
});

describe('recordWebhookEvent', () => {
  it('stamps the event id into the payload and is idempotent per source id', async () => {
    const workspace = await createWorkspaceRow();
    const sourceId = `audit-${uniq()}`;
    const input = {
      workspaceId: workspace.id,
      tenantId: null,
      subscriberId: null,
      source: 'audit' as const,
      sourceId,
      type: 'topic.created',
      payload: { id: null, type: 'topic.created', data: { object: null } },
    };

    const first = await recordWebhookEvent(db, input);
    expect(first.payload).toEqual({ ...input.payload, id: encodeId('webhookEvent', first.id) });

    const second = await recordWebhookEvent(db, { ...input, payload: { id: null, type: 'other' } });
    expect(second.id).toBe(first.id);
    expect(second.payload).toEqual(first.payload);

    const rows = await db
      .select()
      .from(tables.webhookEvent)
      .where(and(eq(tables.webhookEvent.source, 'audit'), eq(tables.webhookEvent.sourceId, sourceId)));
    expect(rows).toHaveLength(1);
  });

  it('keeps the same source id apart across sources', async () => {
    const workspace = await createWorkspaceRow();
    const sourceId = `shared-${uniq()}`;
    const base = { workspaceId: workspace.id, tenantId: null, subscriberId: null, sourceId, payload: {} };
    const audit = await recordWebhookEvent(db, { ...base, source: 'audit', type: 'topic.created' });
    const stream = await recordWebhookEvent(db, { ...base, source: 'stream', type: '$app.opened' });
    expect(stream.id).not.toBe(audit.id);
  });
});

describe('createDeliveries', () => {
  it('creates one pending delivery per endpoint and returns only untouched rows on a repeat', async () => {
    const workspace = await createWorkspaceRow();
    const [a, b] = [await createEndpointRow(workspace.id), await createEndpointRow(workspace.id)];
    const event = await createEventRow(workspace.id);

    const created = await createDeliveries(db, event, [a, b]);
    expect(created.map((delivery) => delivery.endpointId).sort()).toEqual([a.id, b.id].sort());
    expect(created.every((delivery) => delivery.status === 'pending' && delivery.attempts === 0)).toBe(true);
    expect(created.every((delivery) => delivery.workspaceId === workspace.id)).toBe(true);

    const attempted = created.find((delivery) => delivery.endpointId === a.id)!;
    expect(await claimDeliveryAttempt(db, attempted)).toBe(1);

    const repeated = await createDeliveries(db, event, [a, b]);
    expect(repeated.map((delivery) => delivery.endpointId)).toEqual([b.id]);

    const rows = await db
      .select()
      .from(tables.webhookDelivery)
      .where(eq(tables.webhookDelivery.eventId, event.id));
    expect(rows).toHaveLength(2);
  });

  it('does nothing without endpoints', async () => {
    const workspace = await createWorkspaceRow();
    const event = await createEventRow(workspace.id);
    expect(await createDeliveries(db, event, [])).toEqual([]);
  });
});

describe('claimDeliveryAttempt', () => {
  it('hands each attempt number out exactly once', async () => {
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const [delivery] = await createDeliveries(db, await createEventRow(workspace.id), [endpoint]);

    expect(await claimDeliveryAttempt(db, delivery!)).toBe(1);
    expect(await claimDeliveryAttempt(db, delivery!)).toBeNull();
    expect((await readDelivery(delivery!.id)).lastAttemptAt).not.toBeNull();

    await settleDelivery(db, delivery!.id, {
      status: 'failed',
      attempts: 1,
      nextAttemptAt: new Date(),
      lastStatus: 500,
      lastError: 'Endpoint responded 500',
    });
    expect(await claimDeliveryAttempt(db, { id: delivery!.id, attempts: 0 })).toBeNull();
    expect(await claimDeliveryAttempt(db, { id: delivery!.id, attempts: 1 })).toBe(2);
  });

  it('refuses settled deliveries', async () => {
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const [delivery] = await createDeliveries(db, await createEventRow(workspace.id), [endpoint]);
    for (const status of ['success', 'exhausted'] as const) {
      await settleDelivery(db, delivery!.id, {
        status,
        attempts: 1,
        nextAttemptAt: null,
        lastStatus: 200,
        lastError: null,
      });
      expect(await claimDeliveryAttempt(db, { id: delivery!.id, attempts: 1 }), status).toBeNull();
    }
    await resetDelivery(db, delivery!.id);
    expect(await claimDeliveryAttempt(db, { id: delivery!.id, attempts: 1 })).toBe(2);
  });
});

describe('resetDelivery', () => {
  it('reopens a delivery for a replay without forgetting its attempts', async () => {
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const [delivery] = await createDeliveries(db, await createEventRow(workspace.id), [endpoint]);
    await settleDelivery(db, delivery!.id, {
      status: 'exhausted',
      attempts: 10,
      nextAttemptAt: null,
      lastStatus: 503,
      lastError: 'Endpoint responded 503',
    });
    await resetDelivery(db, delivery!.id);
    const row = await readDelivery(delivery!.id);
    expect(row).toMatchObject({ status: 'pending', attempts: 10, nextAttemptAt: null, lastError: null });
    expect(row.lastStatus).toBe(503);
  });
});

describe('listRetryableDeliveryIds', () => {
  it('returns pending and failed deliveries newest first, up to the limit', async () => {
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const deliveries: WebhookDelivery[] = [];
    for (let index = 0; index < 4; index += 1) {
      deliveries.push((await createDeliveries(db, await createEventRow(workspace.id), [endpoint]))[0]!);
    }
    const [pending, failed, success, exhausted] = deliveries as [
      WebhookDelivery,
      WebhookDelivery,
      WebhookDelivery,
      WebhookDelivery,
    ];
    const settle = (delivery: WebhookDelivery, status: WebhookDelivery['status']) =>
      settleDelivery(db, delivery.id, {
        status,
        attempts: 1,
        nextAttemptAt: null,
        lastStatus: 500,
        lastError: null,
      });
    await settle(failed, 'failed');
    await settle(success, 'success');
    await settle(exhausted, 'exhausted');

    expect(await listRetryableDeliveryIds(db, endpoint.id, 10)).toEqual([failed.id, pending.id]);
    expect(await listRetryableDeliveryIds(db, endpoint.id, 1)).toEqual([failed.id]);
  });
});

describe('listStaleDeliveryIds', () => {
  it('finds deliveries whose retry never came, on live endpoints only', async () => {
    const workspace = await createWorkspaceRow();
    const live = await createEndpointRow(workspace.id);
    const disabled = await createEndpointRow(workspace.id, { disabledAt: new Date() });
    const deleted = await createEndpointRow(workspace.id, { deletedAt: new Date() });
    const grace = 60_000;

    const make = async (endpoint: WebhookEndpoint) =>
      (await createDeliveries(db, await createEventRow(workspace.id), [endpoint]))[0]!;
    const overdue = await make(live);
    const overdueDisabled = await make(disabled);
    const overdueDeleted = await make(deleted);
    const future = await make(live);
    const fresh = await make(live);
    const forgotten = await make(live);
    const settled = await make(live);

    await backdate(overdue.id, 'nextAttemptAt', grace * 2);
    await backdate(overdueDisabled.id, 'nextAttemptAt', grace * 2);
    await backdate(overdueDeleted.id, 'nextAttemptAt', grace * 2);
    await db
      .update(tables.webhookDelivery)
      .set({ nextAttemptAt: new Date(Date.now() + grace * 2) })
      .where(eq(tables.webhookDelivery.id, future.id));
    await backdate(forgotten.id, 'updatedAt', grace * 2);
    await settleDelivery(db, settled.id, {
      status: 'success',
      attempts: 1,
      nextAttemptAt: null,
      lastStatus: 200,
      lastError: null,
    });
    await backdate(settled.id, 'updatedAt', grace * 2);

    const ids = new Set(await listStaleDeliveryIds(db, 10_000, grace));
    const mine = [overdue, overdueDisabled, overdueDeleted, future, fresh, forgotten, settled];
    expect(mine.filter((delivery) => ids.has(delivery.id)).map((delivery) => delivery.id)).toEqual([
      overdue.id,
      forgotten.id,
    ]);
  });
});

describe('listUndeliveredAuditRows and listReconcilableAuditIds', () => {
  it('re-enqueues only public rows that lack an event object and that an enabled endpoint subscribes to', async () => {
    const workspace = await createWorkspaceRow();
    const tenant = await createTenantRow(workspace.id);
    const other = await createTenantRow(workspace.id);
    await createEndpointRow(workspace.id, { events: ['topic.*'] });
    await createEndpointRow(workspace.id, { events: ['tenant.*'], disabledAt: new Date() });
    await createEndpointRow(workspace.id, { events: ['message.*'], tenantId: tenant.id });

    const matched = await createAuditRow(workspace.id, 'topic.created');
    const unmatched = await createAuditRow(workspace.id, 'segment.created');
    const disabledOnly = await createAuditRow(workspace.id, 'tenant.updated');
    const privateRow = await createAuditRow(workspace.id, 'key.created');
    const old = await createAuditRow(workspace.id, 'topic.created', {
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const recorded = await createAuditRow(workspace.id, 'topic.deleted');
    await recordWebhookEvent(db, {
      workspaceId: workspace.id,
      tenantId: null,
      subscriberId: null,
      source: 'audit',
      sourceId: String(recorded.id),
      type: 'topic.deleted',
      payload: {},
    });
    const tenantMatched = await createAuditRow(workspace.id, 'message.created', { tenantId: tenant.id });
    const tenantUnmatched = await createAuditRow(workspace.id, 'message.created', { tenantId: other.id });
    const workspaceLevelForTenantEndpoint = await createAuditRow(workspace.id, 'message.completed');

    const orphanWorkspace = await createWorkspaceRow();
    const orphan = await createAuditRow(orphanWorkspace.id, 'topic.created');

    const mine = [
      matched,
      unmatched,
      disabledOnly,
      privateRow,
      old,
      recorded,
      tenantMatched,
      tenantUnmatched,
      workspaceLevelForTenantEndpoint,
      orphan,
    ];
    const candidates = new Set((await listUndeliveredAuditRows(db, 100_000)).map((row) => row.id));
    expect(mine.filter((row) => candidates.has(row.id)).map((row) => row.id)).toEqual([
      matched.id,
      unmatched.id,
      disabledOnly.id,
      tenantMatched.id,
      tenantUnmatched.id,
      workspaceLevelForTenantEndpoint.id,
    ]);

    const reconcilable = new Set(await listReconcilableAuditIds(db, 100_000));
    expect(mine.filter((row) => reconcilable.has(row.id)).map((row) => row.id)).toEqual([
      matched.id,
      tenantMatched.id,
    ]);
  });

  it("never heals events older than the endpoint's last change, so re-enabling does not back-deliver", async () => {
    const workspace = await createWorkspaceRow();
    const minuteAgo = new Date(Date.now() - 60_000);
    const before = await createAuditRow(workspace.id, 'topic.created', { createdAt: minuteAgo });
    const endpoint = await createEndpointRow(workspace.id, { events: ['topic.*'] });
    const after = await createAuditRow(workspace.id, 'topic.created');
    let reconcilable = new Set(await listReconcilableAuditIds(db, 100_000));
    expect([before.id, after.id].filter((id) => reconcilable.has(id))).toEqual([after.id]);

    await db
      .update(tables.webhookEndpoint)
      .set({ disabledAt: null, disabledReason: null, updatedAt: new Date(Date.now() - 10_000) })
      .where(eq(tables.webhookEndpoint.id, endpoint.id));
    await db.update(tables.event).set({ createdAt: minuteAgo }).where(eq(tables.event.id, after.id));
    const sinceEdit = await createAuditRow(workspace.id, 'topic.created');
    reconcilable = new Set(await listReconcilableAuditIds(db, 100_000));
    expect([before.id, after.id, sinceEdit.id].filter((id) => reconcilable.has(id))).toEqual([sinceEdit.id]);
  });

  it('honors the limit and the lookback', async () => {
    const workspace = await createWorkspaceRow();
    await createEndpointRow(workspace.id);
    const first = await createAuditRow(workspace.id, 'topic.created');
    const second = await createAuditRow(workspace.id, 'topic.created');
    const rows = await listUndeliveredAuditRows(db, 100_000, 5 * 60 * 1000);
    const mine = rows.filter((row) => row.workspaceId === workspace.id).map((row) => row.id);
    expect(mine).toEqual([first.id, second.id]);
    expect((await listUndeliveredAuditRows(db, 1)).length).toBe(1);
    await db
      .update(tables.event)
      .set({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(inArray(tables.event.id, [first.id, second.id]));
    expect(
      (await listUndeliveredAuditRows(db, 100_000, 5 * 60 * 1000)).some(
        (row) => row.workspaceId === workspace.id
      )
    ).toBe(false);
  });
});

describe('markEndpointFailure and markEndpointSuccess', () => {
  it('starts a streak on the first failure, disables after three days, and clears on success', async () => {
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);

    expect(await markEndpointFailure(db, endpoint)).toEqual({ disabled: false });
    const failing = await readEndpoint(endpoint.id);
    expect(failing.failingSince).not.toBeNull();
    expect(failing.disabledAt).toBeNull();

    expect(await markEndpointFailure(db, failing)).toEqual({ disabled: false });
    expect((await readEndpoint(endpoint.id)).failingSince?.getTime()).toBe(failing.failingSince?.getTime());

    await markEndpointSuccess(db, failing);
    expect((await readEndpoint(endpoint.id)).failingSince).toBeNull();

    await db
      .update(tables.webhookEndpoint)
      .set({ failingSince: new Date(Date.now() - 4 * DAY_MS) })
      .where(eq(tables.webhookEndpoint.id, endpoint.id));
    expect(await markEndpointFailure(db, endpoint)).toEqual({ disabled: true });
    const disabled = await readEndpoint(endpoint.id);
    expect(disabled.disabledAt).not.toBeNull();
    expect(disabled.disabledReason).toBe('failing for three days');

    const audit = await db
      .select()
      .from(tables.event)
      .where(and(eq(tables.event.workspaceId, workspace.id), eq(tables.event.event, 'webhook.disabled')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorType: 'system', targetType: 'webhook' });
    expect(audit[0]?.data).toMatchObject({ url: endpoint.url });

    expect(await markEndpointFailure(db, disabled)).toEqual({ disabled: false });
    expect(
      await db
        .select()
        .from(tables.event)
        .where(and(eq(tables.event.workspaceId, workspace.id), eq(tables.event.event, 'webhook.disabled')))
    ).toHaveLength(1);
  });

  it('leaves an endpoint that is not failing untouched on success', async () => {
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    await markEndpointSuccess(db, endpoint);
    expect((await readEndpoint(endpoint.id)).updatedAt.getTime()).toBe(endpoint.updatedAt.getTime());
  });
});

describe('processWebhookMessage', () => {
  const fetchSpy = () => vi.spyOn(globalThis, 'fetch');

  it('ignores deliver messages for unknown, settled, not yet due and disabled deliveries', async () => {
    const fetched = fetchSpy();
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const disabledEndpoint = await createEndpointRow(workspace.id, { disabledAt: new Date() });
    const make = async (target: WebhookEndpoint) =>
      (await createDeliveries(db, await createEventRow(workspace.id), [target]))[0]!;

    const success = await make(endpoint);
    await settleDelivery(db, success.id, {
      status: 'success',
      attempts: 1,
      nextAttemptAt: null,
      lastStatus: 200,
      lastError: null,
    });
    const exhausted = await make(endpoint);
    await settleDelivery(db, exhausted.id, {
      status: 'exhausted',
      attempts: 10,
      nextAttemptAt: null,
      lastStatus: 500,
      lastError: 'x',
    });
    const notDue = await make(endpoint);
    await settleDelivery(db, notDue.id, {
      status: 'failed',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + DAY_MS),
      lastStatus: 500,
      lastError: 'x',
    });
    const onDisabled = await make(disabledEndpoint);

    for (const deliveryId of [success.id, exhausted.id, notDue.id, onDisabled.id, 0]) {
      await processWebhookMessage(db, { kind: 'deliver', deliveryId });
    }
    expect(fetched).not.toHaveBeenCalled();
    expect(sends).not.toHaveBeenCalled();
    for (const delivery of [success, exhausted, notDue, onDisabled]) {
      expect(await attemptRows(delivery.id)).toEqual([]);
    }
  });

  it('records nothing for audit rows that are missing, private, unsubscribed, or older than the endpoint', async () => {
    const fetched = fetchSpy();
    const workspace = await createWorkspaceRow();
    const earlier = await createAuditRow(workspace.id, 'tenant.created', {
      createdAt: new Date(Date.now() - 60_000),
    });
    await createEndpointRow(workspace.id, { events: ['tenant.*'] });
    const privateRow = await createAuditRow(workspace.id, 'key.created');
    const unsubscribed = await createAuditRow(workspace.id, 'topic.created');

    for (const auditId of [earlier.id, privateRow.id, unsubscribed.id, 0]) {
      await processWebhookMessage(db, { kind: 'audit', auditId });
    }

    expect(fetched).not.toHaveBeenCalled();
    const events = await db
      .select()
      .from(tables.webhookEvent)
      .where(
        inArray(tables.webhookEvent.sourceId, [
          String(earlier.id),
          String(privateRow.id),
          String(unsubscribed.id),
        ])
      );
    expect(events).toEqual([]);
  });

  it('delivers a subscribed audit row once, signed, and skips the delivery on a duplicate message', async () => {
    const fetched = fetchSpy().mockResolvedValue(new Response('ok', { status: 200 }));
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id, { events: ['topic.created'] });
    const row = await createAuditRow(workspace.id, 'topic.created', { data: { name: 'Deals' } });

    await processWebhookMessage(db, { kind: 'audit', auditId: row.id });
    await processWebhookMessage(db, { kind: 'audit', auditId: row.id });

    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, init] = fetched.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint.url);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    const headers = init.headers as Record<string, string>;
    expect(headers['webhook-id']).toMatch(/^whe_/);
    expect(headers['webhook-signature']).toMatch(/^v1,[A-Za-z0-9+/=]+$/);
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      id: headers['webhook-id'],
      type: 'topic.created',
      data: { name: 'Deals' },
    });

    const [delivery] = await db
      .select()
      .from(tables.webhookDelivery)
      .where(eq(tables.webhookDelivery.endpointId, endpoint.id));
    expect(delivery).toMatchObject({ status: 'success', attempts: 1, lastStatus: 200 });
    expect(await attemptRows(delivery!.id)).toHaveLength(1);
  });

  it('delivers stream rows the endpoint subscribes to and skips names that are not deliverable', async () => {
    const fetched = fetchSpy().mockResolvedValue(new Response(null, { status: 204 }));
    const workspace = await createWorkspaceRow();
    const tenant = await createTenantRow(workspace.id);
    const endpoint = await createEndpointRow(workspace.id, { events: ['order.*', '$app.opened', '$run.*'] });
    const row = (name: string) => ({
      sequence: 1,
      id: `evt_${uniq()}`,
      idempotency_key: null,
      name,
      source: 'ios',
      timestamp: '2026-08-27T10:00:00.000Z',
      received_at: new Date(endpoint.createdAt.getTime() + 1_000).toISOString(),
      data: '{}',
      run_id: null,
      message_id: null,
      step: null,
    });

    await processWebhookMessage(db, {
      kind: 'stream',
      tenantId: tenant.id,
      subscriberId: 1,
      externalId: 'user_1',
      rows: [
        row('order.completed'),
        row('$app.opened'),
        row('$run.started'),
        row('screen.viewed'),
        row('key.created'),
        {
          ...row('order.refunded'),
          received_at: new Date(endpoint.createdAt.getTime() - 60_000).toISOString(),
        },
      ],
    });

    expect(fetched).toHaveBeenCalledTimes(3);
    const types = fetched.mock.calls.map(
      ([, init]) => (JSON.parse((init as RequestInit).body as string) as { type: string }).type
    );
    expect(types).toEqual(['order.completed', '$app.opened', '$run.started']);
    const deliveries = await db
      .select()
      .from(tables.webhookDelivery)
      .where(eq(tables.webhookDelivery.endpointId, endpoint.id));
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every((delivery) => delivery.status === 'success')).toBe(true);
  });

  it('ignores stream rows for a tenant that does not exist', async () => {
    const fetched = fetchSpy();
    await processWebhookMessage(db, {
      kind: 'stream',
      tenantId: 0,
      subscriberId: 1,
      externalId: 'x',
      rows: [],
    });
    expect(fetched).not.toHaveBeenCalled();
  });

  it('schedules a retry on a failure, treats a redirect as a failure, and exhausts after the schedule', async () => {
    const fetched = fetchSpy().mockResolvedValue(
      new Response('moved', { status: 302, headers: { location: 'http://127.0.0.1:9/elsewhere' } })
    );
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id, { events: ['topic.created'] });
    const row = await createAuditRow(workspace.id, 'topic.created');

    await processWebhookMessage(db, { kind: 'audit', auditId: row.id });

    const [delivery] = await db
      .select()
      .from(tables.webhookDelivery)
      .where(eq(tables.webhookDelivery.endpointId, endpoint.id));
    expect(delivery).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastStatus: 302,
      lastError: 'Endpoint responded 302',
    });
    expect(delivery!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(sends).toHaveBeenCalledWith({ kind: 'deliver', deliveryId: delivery!.id }, { delaySeconds: 1 });
    expect((await readEndpoint(endpoint.id)).failingSince).not.toBeNull();

    fetched.mockResolvedValue(new Response('nope', { status: 503 }));
    for (let attempt = 2; attempt <= 10; attempt += 1) {
      await backdate(delivery!.id, 'nextAttemptAt', 1000);
      await processWebhookMessage(db, { kind: 'deliver', deliveryId: delivery!.id });
    }
    const exhausted = await readDelivery(delivery!.id);
    expect(exhausted).toMatchObject({
      status: 'exhausted',
      attempts: 10,
      nextAttemptAt: null,
      lastStatus: 503,
    });
    expect(sends).toHaveBeenCalledTimes(9);
    const attempts = await attemptRows(delivery!.id);
    expect(attempts.map((attempt) => attempt.attempt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(attempts[0]).toMatchObject({
      status: 302,
      error: 'Endpoint responded 302',
      responseBody: 'moved',
    });
  });

  it('records a network failure as an attempt without a status', async () => {
    fetchSpy().mockRejectedValue(new TypeError('fetch failed'));
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const [delivery] = await createDeliveries(db, await createEventRow(workspace.id), [endpoint]);

    await processWebhookMessage(db, { kind: 'deliver', deliveryId: delivery!.id });

    expect(await readDelivery(delivery!.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastStatus: null,
      lastError: 'fetch failed',
    });
    expect(await attemptRows(delivery!.id)).toMatchObject([
      { attempt: 1, status: null, error: 'fetch failed', responseBody: null },
    ]);
  });

  it('keeps only the first 4 KB of a response body', async () => {
    fetchSpy().mockResolvedValue(new Response('x'.repeat(10_000), { status: 200 }));
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id);
    const [delivery] = await createDeliveries(db, await createEventRow(workspace.id), [endpoint]);
    await processWebhookMessage(db, { kind: 'deliver', deliveryId: delivery!.id });
    expect((await attemptRows(delivery!.id))[0]?.responseBody).toHaveLength(4096);
  });

  it('signs with both secrets during a rotation overlap', async () => {
    const fetched = fetchSpy().mockResolvedValue(new Response('ok', { status: 200 }));
    const workspace = await createWorkspaceRow();
    const endpoint = await createEndpointRow(workspace.id, {
      previousSecret: 'whsec_C2FkZmFzZGZhc2RmYXNkZmFzZGZhc2Rm',
      previousSecretExpiresAt: new Date(Date.now() + DAY_MS),
    });
    const [delivery] = await createDeliveries(db, await createEventRow(workspace.id), [endpoint]);
    await processWebhookMessage(db, { kind: 'deliver', deliveryId: delivery!.id });
    const headers = (fetched.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['webhook-signature'].split(' ')).toHaveLength(2);
  });
});
