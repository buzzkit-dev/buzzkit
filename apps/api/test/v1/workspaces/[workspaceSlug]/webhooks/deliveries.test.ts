import { createServer, type IncomingMessage, type Server } from 'node:http';
import { verifyWebhook } from 'buzzkit/webhooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../../../utils/api';
import { db, eq, tables } from '../../../../utils/db';
import { eventually } from '../../../../utils/eventually';
import { createClientKey, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  tenantId: string | null;
  secret?: string;
  previousSecret?: string | null;
  previousSecretExpiresAt?: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  failingSince: string | null;
};
type Delivery = {
  id: string;
  endpointId: string;
  eventId: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
};
type Attempt = { attempt: number; status: number | null; error: string | null; responseBody: string | null };
type DeliveryDetail = Omit<Delivery, 'attempts'> & {
  attempts: Attempt[];
  event: { id: string; type: string; source: string; payload: Record<string, any> } | null;
};
type Page = { items: Delivery[]; hasMore: boolean; nextCursor: string | null; total: number };
type AuditEntry = {
  event: string;
  actorType: string;
  targetId: string | null;
  data: Record<string, unknown>;
};
type Received = { path: string; headers: Record<string, string>; body: string; at: number };

const PORT = 8878;
const received: Received[] = [];
const responses = new Map<string, number>();
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
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, String(value)])
      ),
      body,
      at: Date.now(),
    });
    const status = responses.get(path) ?? 200;
    response.writeHead(status, { 'content-type': 'text/plain' });
    response.end(status >= 200 && status < 300 ? 'ok' : 'nope');
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function workspaceBearer(bearer: Record<string, string>, slug: string): Record<string, string> {
  return { ...bearer, 'buzzkit-workspace': slug };
}

function receiverUrl(path: string): string {
  return `http://localhost:${PORT}${path}`;
}

function deliveriesTo(path: string, type?: string): Received[] {
  return received.filter(
    (entry) =>
      entry.path === path &&
      (type === undefined || (JSON.parse(entry.body) as { type: string }).type === type)
  );
}

function payloadOf(hit: Received): Record<string, any> {
  return JSON.parse(hit.body) as Record<string, any>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createEndpoint(bearer: Record<string, string>, slug: string, input: Record<string, unknown>) {
  const { status, body } = await api<Endpoint>(`/v1/workspaces/${slug}/webhooks`, {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify(input),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body.data!;
}

async function readEndpoint(bearer: Record<string, string>, slug: string, endpointId: string) {
  const { status, body } = await api<Endpoint>(`/v1/workspaces/${slug}/webhooks/${endpointId}`, {
    headers: bearer,
  });
  expect(status).toBe(200);
  return body.data!;
}

async function patchEndpoint(
  bearer: Record<string, string>,
  slug: string,
  endpointId: string,
  input: Record<string, unknown>
) {
  const { status, body } = await api<Endpoint>(`/v1/workspaces/${slug}/webhooks/${endpointId}`, {
    method: 'PATCH',
    headers: bearer,
    body: JSON.stringify(input),
  });
  expect(status, JSON.stringify(body)).toBe(200);
  return body.data!;
}

async function listDeliveries(bearer: Record<string, string>, slug: string, endpointId: string, query = '') {
  const { status, body } = await api<Page>(
    `/v1/workspaces/${slug}/webhooks/${endpointId}/deliveries${query}`,
    {
      headers: bearer,
    }
  );
  expect(status, JSON.stringify(body)).toBe(200);
  return body.data!;
}

async function readDelivery(
  bearer: Record<string, string>,
  slug: string,
  endpointId: string,
  deliveryId: string
) {
  const { status, body } = await api<DeliveryDetail>(
    `/v1/workspaces/${slug}/webhooks/${endpointId}/deliveries/${deliveryId}`,
    { headers: bearer }
  );
  expect(status, JSON.stringify(body)).toBe(200);
  return body.data!;
}

async function replayDelivery(
  bearer: Record<string, string>,
  slug: string,
  endpointId: string,
  deliveryId: string
) {
  const { status, body } = await api<Delivery>(
    `/v1/workspaces/${slug}/webhooks/${endpointId}/deliveries/${deliveryId}/replay`,
    { method: 'POST', headers: bearer }
  );
  expect(status, JSON.stringify(body)).toBe(202);
  return body.data!;
}

function settledDelivery(
  bearer: Record<string, string>,
  slug: string,
  endpointId: string,
  predicate: (delivery: Delivery) => boolean,
  label: string,
  timeoutMs = 60_000
) {
  return eventually(async () => (await listDeliveries(bearer, slug, endpointId)).items.find(predicate), {
    label,
    timeoutMs,
  });
}

async function endpointRow(url: string) {
  const [row] = await db.select().from(tables.webhookEndpoint).where(eq(tables.webhookEndpoint.url, url));
  if (!row) throw new Error(`endpoint ${url} not found`);
  return row;
}

async function deliveryRows(url: string) {
  const endpoint = await endpointRow(url);
  return await db
    .select()
    .from(tables.webhookDelivery)
    .where(eq(tables.webhookDelivery.endpointId, endpoint.id))
    .orderBy(tables.webhookDelivery.id);
}

async function runSweep() {
  const response = await fetch(`${BASE_URL}/__scheduled?cron=*/5+*+*+*+*`);
  expect(response.status).toBe(200);
}

async function auditEntries(bearer: Record<string, string>, slug: string, event: string) {
  const { body } = await api<{ items: AuditEntry[] }>(`/v1/workspaces/${slug}/audit?event=${event}`, {
    headers: bearer,
  });
  return body.data!.items;
}

describe('delivery ledger', () => {
  it('pages through deliveries newest first with a total and status filters', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const path = `/ledger-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['topic.created'],
    });
    for (let index = 0; index < 60; index++) {
      const slug = `ledger-${index}-${uniq()}`;
      const { status } = await api('/v1/topics', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ slug, name: slug, channels: ['email'] }),
      });
      expect(status).toBe(201);
    }

    await eventually(
      async () => {
        const page = await listDeliveries(owner.bearer, workspace.slug, endpoint.id, '?status=success');
        return page.total === 60 ? page : undefined;
      },
      { label: '60 successful deliveries', timeoutMs: 60_000 }
    );
    expect(deliveriesTo(path, 'topic.created')).toHaveLength(60);

    const seen: string[] = [];
    let cursor: string | null = null;
    const pages: Page[] = [];
    do {
      const page: Page = await listDeliveries(
        owner.bearer,
        workspace.slug,
        endpoint.id,
        `?limit=25${cursor ? `&cursor=${cursor}` : ''}`
      );
      pages.push(page);
      seen.push(...page.items.map((entry) => entry.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages.map((page) => page.items.length)).toEqual([25, 25, 10]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    expect(pages.every((page) => page.total === 60)).toBe(true);
    expect(pages[2]!.nextCursor).toBeNull();
    expect(new Set(seen).size).toBe(60);
    expect(pages[0]!.items[0]!.id).toBe(
      (await listDeliveries(owner.bearer, workspace.slug, endpoint.id)).items[0]!.id
    );

    for (const status of ['pending', 'failed', 'exhausted']) {
      const filtered = await listDeliveries(owner.bearer, workspace.slug, endpoint.id, `?status=${status}`);
      expect(filtered, status).toEqual({ items: [], hasMore: false, nextCursor: null, total: 0 });
    }
    const unknownStatus = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries?status=bogus`,
      { headers: owner.bearer }
    );
    expect(unknownStatus.status).toBe(400);
    expect(unknownStatus.body.error?.code).toBe('validation');
    const badCursor = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries?cursor=nope`,
      { headers: owner.bearer }
    );
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error).toMatchObject({ code: 'invalid_cursor', param: 'cursor' });
    for (const limit of [0, 101]) {
      const { status } = await api(
        `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries?limit=${limit}`,
        { headers: owner.bearer }
      );
      expect(status, `limit=${limit}`).toBe(400);
    }

    const newest = pages[0]!.items[0]!;
    const detail = await readDelivery(owner.bearer, workspace.slug, endpoint.id, newest.id);
    expect(detail).toMatchObject({
      id: newest.id,
      endpointId: endpoint.id,
      eventId: newest.eventId,
      status: 'success',
      lastStatus: 200,
      lastError: null,
    });
    expect(detail.attempts).toEqual([
      expect.objectContaining({ attempt: 1, status: 200, error: null, responseBody: 'ok' }),
    ]);
    expect(detail.event).toMatchObject({ id: newest.eventId, type: 'topic.created', source: 'audit' });
    expect(detail.event?.payload.actor.type).toBe('key');
    expect(detail.event?.payload.target).toEqual({ type: 'topic', id: expect.stringMatching(/^tpc_/) });
    expect(detail.event?.payload.data.object).toMatchObject({
      id: detail.event?.payload.target.id,
      slug: expect.stringMatching(/^ledger-59-/),
      channels: ['email'],
    });
    expect(detail.event?.payload.tenant.slug).toBe('default');
  }, 90_000);

  it('carries previousAttributes and changes on updated events with the hydrated object', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const stranger = await setupWorkspace({ bare: true });
    const path = `/updated-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.updated'],
    });
    const acme = await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const renamed = await api(`/v1/tenants/${acme.slug}`, {
      method: 'PATCH',
      headers: workspaceBearer(owner.bearer, workspace.slug),
      body: JSON.stringify({ name: 'Acme Corp' }),
    });
    expect(renamed.status).toBe(200);

    const hit = await eventually(() => deliveriesTo(path, 'tenant.updated')[0], {
      label: 'tenant.updated delivery',
    });
    const payload = payloadOf(hit);
    expect(payload.tenant).toEqual({ id: acme.id, slug: acme.slug });
    expect(payload.actor).toEqual({ type: 'member', display: owner.email });
    expect(payload.target).toEqual({ type: 'tenant', id: acme.id });
    expect(payload.data.changes).toEqual(['name']);
    expect(payload.data.previousAttributes).toEqual({ name: 'Acme' });
    expect(payload.data.object).toMatchObject({ id: acme.id, slug: acme.slug, name: 'Acme Corp' });

    const own = await api(`/v1/workspaces/${workspace.slug}/webhooks/events/${payload.id}`, {
      headers: owner.bearer,
    });
    expect(own.status).toBe(200);
    const foreign = await api(`/v1/workspaces/${stranger.workspace.slug}/webhooks/events/${payload.id}`, {
      headers: stranger.owner.bearer,
    });
    expect(foreign.status).toBe(404);

    const delivery = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'tenant.updated settled'
    );
    expect(delivery.eventId).toBe(payload.id);
  });
});

describe('stream and fan-out', () => {
  it('delivers an SDK event tracked from the app to a $app.* subscription with its source', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const path = `/app-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['$app.*'],
    });
    const externalId = `user_${uniq()}`;

    const tracked = await api('/v1/client/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientKey.secret}` },
      body: JSON.stringify({
        externalId,
        source: 'ios',
        events: [
          { id: uniq(), name: '$app.opened' },
          { id: uniq(), name: 'screen.viewed', data: { screen: 'home' } },
        ],
      }),
    });
    expect(tracked.status).toBe(202);

    const hit = await eventually(() => deliveriesTo(path, '$app.opened')[0], {
      label: '$app.opened delivery',
    });
    await verifyWebhook(hit.body, hit.headers, endpoint.secret!);
    const payload = payloadOf(hit);
    expect(payload.tenant.slug).toBe('default');
    expect(payload.actor).toBeUndefined();
    expect(payload.data.object).toMatchObject({
      id: expect.stringMatching(/^evt_/),
      name: '$app.opened',
      source: 'ios',
      data: {},
      subscriber: { id: expect.stringMatching(/^sub_/), externalId },
    });

    await sleep(3_000);
    expect(deliveriesTo(path).map((entry) => payloadOf(entry).type)).toEqual(['$app.opened']);
    const detail = await readDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (await listDeliveries(owner.bearer, workspace.slug, endpoint.id)).items[0]!.id
    );
    expect(detail.event).toMatchObject({ type: '$app.opened', source: 'stream' });
  });

  it('routes audit and stream events through a catch-all while a prefix filter stays narrow', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace({ bare: true });
    const everything = `/all-${uniq()}`;
    const screens = `/screens-${uniq()}`;
    await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl(everything), events: ['*'] });
    await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl(screens), events: ['screen.*'] });
    const externalId = `user_${uniq()}`;

    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const tracked = await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId, name: 'order.completed', data: { total: 7 } },
          { externalId, name: 'screen.viewed', data: { screen: 'cart' } },
        ],
      }),
    });
    expect(tracked.status).toBe(202);

    await eventually(() => deliveriesTo(everything, 'tenant.created')[0], {
      label: 'catch-all audit delivery',
    });
    await eventually(() => deliveriesTo(everything, 'order.completed')[0], {
      label: 'catch-all order delivery',
    });
    await eventually(() => deliveriesTo(everything, 'screen.viewed')[0], {
      label: 'catch-all screen delivery',
    });
    const screen = await eventually(() => deliveriesTo(screens, 'screen.viewed')[0], {
      label: 'prefix-filtered screen delivery',
    });
    expect(payloadOf(screen).data.object.data).toEqual({ screen: 'cart' });

    await sleep(3_000);
    expect(deliveriesTo(screens).map((entry) => payloadOf(entry).type)).toEqual(['screen.viewed']);
    const seen = deliveriesTo(everything).map((entry) => payloadOf(entry).type);
    expect(seen.filter((type) => type.startsWith('webhook.'))).toEqual([]);
    expect(new Set(seen).size).toBe(seen.length);
  }, 120_000);

  it('records one delivery per endpoint when the same audit event is enqueued twice', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/twice-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.updated'],
    });
    const [row] = await db
      .select({ id: tables.workspace.id })
      .from(tables.workspace)
      .where(eq(tables.workspace.slug, workspace.slug));
    await db.insert(tables.event).values({
      workspaceId: row!.id,
      event: 'tenant.updated',
      actorType: 'system',
      actorDisplay: 'system',
      data: { changes: ['name'] },
    });

    await runSweep();
    await runSweep();
    await eventually(() => deliveriesTo(path, 'tenant.updated')[0], { label: 'swept delivery' });
    await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'swept delivery settled'
    );
    await runSweep();
    await sleep(3_000);

    expect(deliveriesTo(path, 'tenant.updated')).toHaveLength(1);
    const page = await listDeliveries(owner.bearer, workspace.slug, endpoint.id);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ status: 'success', attempts: 1 });
  });

  it('gives two endpoints their own deliveries for one shared event id', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const first = `/pair-a-${uniq()}`;
    const second = `/pair-b-${uniq()}`;
    const endpointA = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(first),
      events: ['tenant.created'],
    });
    const endpointB = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(second),
      events: ['tenant.*'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    const hitA = await eventually(() => deliveriesTo(first, 'tenant.created')[0], {
      label: 'first endpoint hit',
    });
    const hitB = await eventually(() => deliveriesTo(second, 'tenant.created')[0], {
      label: 'second endpoint hit',
    });
    expect(hitA.headers['webhook-id']).toBe(hitB.headers['webhook-id']);
    expect(payloadOf(hitA)).toEqual(payloadOf(hitB));
    await verifyWebhook(hitA.body, hitA.headers, endpointA.secret!);
    await verifyWebhook(hitB.body, hitB.headers, endpointB.secret!);
    await expect(verifyWebhook(hitA.body, hitA.headers, endpointB.secret!)).rejects.toMatchObject({
      code: 'invalid_signature',
    });

    const deliveryA = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpointA.id,
      (entry) => entry.status === 'success',
      'first delivery settled'
    );
    const deliveryB = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpointB.id,
      (entry) => entry.status === 'success',
      'second delivery settled'
    );
    expect(deliveryA.eventId).toBe(hitA.headers['webhook-id']);
    expect(deliveryB.eventId).toBe(deliveryA.eventId);
    expect(deliveryA.id).not.toBe(deliveryB.id);
    expect(deliveryA.endpointId).toBe(endpointA.id);
    expect(deliveryB.endpointId).toBe(endpointB.id);
    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpointA.id}/deliveries/${deliveryB.id}`, {
          headers: owner.bearer,
        })
      ).status
    ).toBe(404);
  });
});

describe('failure handling', () => {
  it('retries a 500 once the receiver recovers and records both attempts', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/flaky-${uniq()}`;
    responses.set(path, 500);
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    await eventually(() => deliveriesTo(path, 'tenant.created')[0], { label: 'first failing hit' });
    responses.delete(path);
    const failed = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.attempts >= 1 && entry.status !== 'pending',
      'first attempt settled'
    );
    if (failed.status === 'failed') {
      expect(failed).toMatchObject({ attempts: 1, lastStatus: 500, lastError: 'Endpoint responded 500' });
      expect(failed.nextAttemptAt).not.toBeNull();
      expect((await readEndpoint(owner.bearer, workspace.slug, endpoint.id)).failingSince).not.toBeNull();
    }

    const recovered = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'recovered delivery'
    );
    expect(recovered).toMatchObject({ attempts: 2, lastStatus: 200, lastError: null, nextAttemptAt: null });
    const detail = await readDelivery(owner.bearer, workspace.slug, endpoint.id, recovered.id);
    expect(detail.attempts.map((attempt) => [attempt.attempt, attempt.status, attempt.error])).toEqual([
      [1, 500, 'Endpoint responded 500'],
      [2, 200, null],
    ]);
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(2);
    expect((await readEndpoint(owner.bearer, workspace.slug, endpoint.id)).failingSince).toBeNull();
  }, 45_000);

  it('retries a 404 like any other non-2xx response', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/missing-${uniq()}`;
    responses.set(path, 404);
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    const retried = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.attempts >= 3,
      'third attempt against a 404',
      45_000
    );
    expect(retried).toMatchObject({ status: 'failed', lastStatus: 404, lastError: 'Endpoint responded 404' });
    expect(deliveriesTo(path, 'tenant.created').length).toBeGreaterThanOrEqual(3);
    responses.delete(path);
  }, 60_000);

  it('replays a successful delivery and counts the extra attempt', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/replay-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const delivered = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'initial delivery'
    );

    const replayed = await replayDelivery(owner.bearer, workspace.slug, endpoint.id, delivered.id);
    expect(replayed).toMatchObject({ id: delivered.id, status: 'pending' });
    const again = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.id === delivered.id && entry.attempts === 2,
      'replayed delivery'
    );
    expect(again).toMatchObject({ status: 'success', lastStatus: 200 });
    const hits = deliveriesTo(path, 'tenant.created');
    expect(hits).toHaveLength(2);
    expect(hits[0]!.headers['webhook-id']).toBe(hits[1]!.headers['webhook-id']);
    expect(hits[0]!.headers['webhook-signature']).not.toBe(hits[1]!.headers['webhook-signature']);
    const detail = await readDelivery(owner.bearer, workspace.slug, endpoint.id, delivered.id);
    expect(detail.attempts.map((attempt) => attempt.attempt)).toEqual([1, 2]);

    const audit = await auditEntries(owner.bearer, workspace.slug, 'webhook.replayed');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'member',
      targetId: endpoint.id,
      data: { deliveryId: delivered.id, url: receiverUrl(path) },
    });
  });

  it('refuses a replay while the endpoint is disabled and leaves the delivery untouched', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/replay-disabled-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const delivered = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'initial delivery'
    );

    await patchEndpoint(owner.bearer, workspace.slug, endpoint.id, { enabled: false });
    const refused = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries/${delivered.id}/replay`,
      { method: 'POST', headers: owner.bearer }
    );
    expect(refused.status).toBe(400);
    expect(refused.body.error?.code).toBe('endpoint_disabled');
    await sleep(3_000);
    const untouched = (await listDeliveries(owner.bearer, workspace.slug, endpoint.id)).items[0]!;
    expect(untouched).toMatchObject({
      id: delivered.id,
      status: 'success',
      attempts: 1,
      nextAttemptAt: null,
    });
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(1);
    expect(await auditEntries(owner.bearer, workspace.slug, 'webhook.replayed')).toEqual([]);

    await patchEndpoint(owner.bearer, workspace.slug, endpoint.id, { enabled: true });
    await sleep(3_000);
    expect((await listDeliveries(owner.bearer, workspace.slug, endpoint.id)).items[0]).toMatchObject({
      status: 'success',
      attempts: 1,
    });
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(1);

    await replayDelivery(owner.bearer, workspace.slug, endpoint.id, delivered.id);
    const replayed = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.attempts === 2,
      'replay after re-enable'
    );
    expect(replayed.status).toBe('success');
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(2);
  }, 45_000);
});

describe('endpoint health', () => {
  it('disables an endpoint failing for three days, stops creating deliveries, and retries its backlog once re-enabled', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/unhealthy-${uniq()}`;
    responses.set(path, 503);
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await db
      .update(tables.webhookEndpoint)
      .set({ failingSince: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) })
      .where(eq(tables.webhookEndpoint.url, receiverUrl(path)));
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    const disabled = await eventually(
      async () => {
        const current = await readEndpoint(owner.bearer, workspace.slug, endpoint.id);
        return current.enabled ? undefined : current;
      },
      { label: 'endpoint auto-disabled' }
    );
    expect(disabled).toMatchObject({ enabled: false, disabledReason: 'failing for three days' });
    expect(disabled.disabledAt).not.toBeNull();
    expect(disabled.failingSince).not.toBeNull();

    const audit = await eventually(
      async () => {
        const entries = await auditEntries(owner.bearer, workspace.slug, 'webhook.disabled');
        return entries.length > 0 ? entries : undefined;
      },
      { label: 'webhook.disabled audit entry' }
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'system',
      targetId: endpoint.id,
      data: { url: receiverUrl(path), failingSince: expect.any(String) },
    });

    await sleep(4_000);
    const stuck = await listDeliveries(owner.bearer, workspace.slug, endpoint.id);
    expect(stuck.total).toBe(1);
    expect(stuck.items[0]).toMatchObject({ status: 'failed', attempts: 1, lastStatus: 503 });
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(1);

    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Globex', { bare: true });
    await sleep(3_000);
    expect((await listDeliveries(owner.bearer, workspace.slug, endpoint.id)).total).toBe(1);
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(1);

    responses.delete(path);
    const enabled = await patchEndpoint(owner.bearer, workspace.slug, endpoint.id, { enabled: true });
    expect(enabled).toMatchObject({
      enabled: true,
      disabledAt: null,
      disabledReason: null,
      failingSince: null,
    });
    const retried = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.id === stuck.items[0]!.id && entry.status === 'success',
      'backlog retried after re-enable',
      10_000
    );
    expect(retried).toMatchObject({ attempts: 2, lastStatus: 200, lastError: null });
    expect(payloadOf(deliveriesTo(path, 'tenant.created')[1]!).data.object.name).toBe('Acme');

    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Initech', { bare: true });
    const resumed = await eventually(() => deliveriesTo(path, 'tenant.created')[2], {
      label: 'delivery after re-enable',
    });
    expect(payloadOf(resumed).data.object.name).toBe('Initech');
    const page = await eventually(
      async () => {
        const current = await listDeliveries(owner.bearer, workspace.slug, endpoint.id, '?status=success');
        return current.total === 2 ? current : undefined;
      },
      { label: 'both deliveries settled' }
    );
    expect(page.items.map((entry) => entry.attempts)).toEqual([1, 2]);
  }, 60_000);

  it('signs with the new secret only once the rotation overlap has expired', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/expired-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    const rotated = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/rotate`, {
      method: 'POST',
      headers: owner.bearer,
    });
    expect(rotated.body.data?.previousSecret).toBe(endpoint.secret);
    expect(rotated.body.data?.previousSecretExpiresAt).not.toBeNull();
    await db
      .update(tables.webhookEndpoint)
      .set({ previousSecretExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(tables.webhookEndpoint.url, receiverUrl(path)));

    const current = await readEndpoint(owner.bearer, workspace.slug, endpoint.id);
    expect(current.secret).toBe(rotated.body.data!.secret);
    expect(current.previousSecret).toBeNull();
    expect(current.previousSecretExpiresAt).toBeNull();

    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const hit = await eventually(() => deliveriesTo(path, 'tenant.created')[0], {
      label: 'post-overlap delivery',
    });
    expect(hit.headers['webhook-signature']!.split(' ')).toHaveLength(1);
    await verifyWebhook(hit.body, hit.headers, rotated.body.data!.secret!);
    await expect(verifyWebhook(hit.body, hit.headers, endpoint.secret!)).rejects.toMatchObject({
      code: 'invalid_signature',
    });
  });

  it('re-enqueues stale failed deliveries of enabled endpoints, leaves disabled ones alone, and retries them on re-enable', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const healthy = `/stale-healthy-${uniq()}`;
    const parked = `/stale-parked-${uniq()}`;
    const healthyEndpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(healthy),
      events: ['tenant.created'],
    });
    const parkedEndpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(parked),
      events: ['tenant.created'],
    });
    await patchEndpoint(owner.bearer, workspace.slug, parkedEndpoint.id, { enabled: false });

    const [workspaceRow] = await db
      .select({ id: tables.workspace.id })
      .from(tables.workspace)
      .where(eq(tables.workspace.slug, workspace.slug));
    const [event] = await db
      .insert(tables.webhookEvent)
      .values({
        workspaceId: workspaceRow!.id,
        tenantId: null,
        subscriberId: null,
        source: 'audit',
        sourceId: `stale-${uniq()}`,
        type: 'tenant.created',
        payload: { type: 'tenant.created', apiVersion: 'v1', data: { object: null } },
      })
      .returning({ id: tables.webhookEvent.id });
    const stale = new Date(Date.now() - 20 * 60 * 1000);
    for (const url of [receiverUrl(healthy), receiverUrl(parked)]) {
      await db.insert(tables.webhookDelivery).values({
        workspaceId: workspaceRow!.id,
        endpointId: (await endpointRow(url)).id,
        eventId: event!.id,
        status: 'failed',
        attempts: 1,
        nextAttemptAt: stale,
        lastStatus: 503,
        lastError: 'Endpoint responded 503',
        lastAttemptAt: stale,
      });
    }
    expect((await listDeliveries(owner.bearer, workspace.slug, healthyEndpoint.id)).items[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
    });

    await runSweep();
    const recovered = await settledDelivery(
      owner.bearer,
      workspace.slug,
      healthyEndpoint.id,
      (entry) => entry.status === 'success',
      'stale delivery reconciled'
    );
    expect(recovered).toMatchObject({ attempts: 2, lastStatus: 200, lastError: null });
    const hit = deliveriesTo(healthy, 'tenant.created')[0]!;
    expect(hit.headers['webhook-id']).toBe(recovered.eventId);
    await verifyWebhook(hit.body, hit.headers, healthyEndpoint.secret!);
    await sleep(3_000);
    expect((await listDeliveries(owner.bearer, workspace.slug, parkedEndpoint.id)).items[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastStatus: 503,
    });
    expect(deliveriesTo(healthy, 'tenant.created')).toHaveLength(1);
    expect(deliveriesTo(parked, 'tenant.created')).toHaveLength(0);

    await patchEndpoint(owner.bearer, workspace.slug, parkedEndpoint.id, { enabled: true });
    const resumed = await settledDelivery(
      owner.bearer,
      workspace.slug,
      parkedEndpoint.id,
      (entry) => entry.status === 'success',
      'parked delivery retried on re-enable',
      10_000
    );
    expect(resumed).toMatchObject({ attempts: 2, lastStatus: 200 });
    expect(deliveriesTo(parked, 'tenant.created')).toHaveLength(1);
  }, 60_000);

  it('stops delivering once an endpoint is deleted and hides its ledger', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/deleted-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const delivered = await settledDelivery(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'delivery before deletion'
    );

    const deleted = await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'DELETE',
      headers: owner.bearer,
    });
    expect(deleted.status).toBe(200);
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Globex', { bare: true });
    await sleep(3_000);
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(1);

    for (const suffix of ['/deliveries', `/deliveries/${delivered.id}`]) {
      const { status } = await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}${suffix}`, {
        headers: owner.bearer,
      });
      expect(status, suffix).toBe(404);
    }
    const replay = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries/${delivered.id}/replay`,
      { method: 'POST', headers: owner.bearer }
    );
    expect(replay.status).toBe(404);
    const event = await api(`/v1/workspaces/${workspace.slug}/webhooks/events/${delivered.eventId}`, {
      headers: owner.bearer,
    });
    expect(event.status).toBe(200);
    expect(await deliveryRows(receiverUrl(path))).toHaveLength(1);
  });
});
