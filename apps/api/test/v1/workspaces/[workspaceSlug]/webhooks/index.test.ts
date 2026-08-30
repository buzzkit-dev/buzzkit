import { createServer, type IncomingMessage, type Server } from 'node:http';
import { PUBLIC_EVENTS as PUBLIC_AUDIT_EVENTS } from '@buzzkit/api/api/audit/catalog';
import { SDK_EVENTS, SYSTEM_EVENTS } from '@buzzkit/api/api/events/catalog';
import { verifyWebhook } from 'buzzkit/webhooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { db, eq, tables } from '../../../../utils/db';
import { eventually } from '../../../../utils/eventually';
import {
  addMember,
  createClientKey,
  createKey,
  createTenant,
  setupWorkspace,
  uniq,
} from '../../../../utils/setup';

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  tenantId: string | null;
  secret?: string;
  previousSecret?: string | null;
  disabledReason: string | null;
};
type Delivery = {
  id: string;
  eventId: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
};
type DeliveryDetail = Delivery & {
  attempts: number;
  event: { id: string; type: string; payload: Record<string, unknown> } | null;
};
type CatalogGroup = { label: string; wildcard?: string; options: string[] };
type Received = { path: string; headers: Record<string, string>; body: string; at: number };

const PORT = 8877;
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

async function createEndpoint(bearer: Record<string, string>, slug: string, input: Record<string, unknown>) {
  const { status, body } = await api<Endpoint>(`/v1/workspaces/${slug}/webhooks`, {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify(input),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body.data!;
}

async function listDeliveries(bearer: Record<string, string>, slug: string, endpointId: string, query = '') {
  const { body } = await api<{ items: Delivery[]; total: number }>(
    `/v1/workspaces/${slug}/webhooks/${endpointId}/deliveries${query}`,
    { headers: bearer }
  );
  return body.data!;
}

describe('webhook endpoints', () => {
  it('creates an endpoint with a secret shown on create and get, lists it masked, updates, rotates and deletes it', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/crud-${uniq()}`;

    const created = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      description: 'CRM sync',
      events: ['tenant.*', '$subscription.registered', 'order.completed'],
    });
    expect(created.id).toMatch(/^whk_/);
    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9+/=]+$/);
    expect(created.enabled).toBe(true);
    expect(created.tenantId).toBeNull();

    const listed = await api<{ items: Endpoint[] }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      headers: owner.bearer,
    });
    expect(listed.body.data?.items.map((entry) => entry.id)).toContain(created.id);
    expect(listed.body.data?.items.find((entry) => entry.id === created.id)?.secret).toBeUndefined();

    const fetched = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${created.id}`, {
      headers: owner.bearer,
    });
    expect(fetched.body.data?.secret).toBe(created.secret);

    const updated = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${created.id}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ description: null, events: ['*'], enabled: false }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data?.events).toEqual(['*']);
    expect(updated.body.data?.enabled).toBe(false);
    expect(updated.body.data?.disabledReason).toBe('disabled');

    const rotated = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${created.id}/rotate`, {
      method: 'POST',
      headers: owner.bearer,
    });
    expect(rotated.body.data?.secret).not.toBe(created.secret);
    expect(rotated.body.data?.previousSecret).toBe(created.secret);

    const deleted = await api<Endpoint & { deleted: boolean }>(
      `/v1/workspaces/${workspace.slug}/webhooks/${created.id}`,
      { method: 'DELETE', headers: owner.bearer }
    );
    expect(deleted.status).toBe(200);
    const gone = await api(`/v1/workspaces/${workspace.slug}/webhooks/${created.id}`, {
      headers: owner.bearer,
    });
    expect(gone.status).toBe(404);

    const audit = await api<{ items: { event: string }[] }>(
      `/v1/workspaces/${workspace.slug}/audit?q=webhook`,
      { headers: owner.bearer }
    );
    expect(audit.body.data?.items.map((entry) => entry.event).sort()).toEqual(
      ['webhook.created', 'webhook.deleted', 'webhook.secret_rotated', 'webhook.updated'].sort()
    );
  });

  it('validates urls and subscriptions', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const refuse = async (input: Record<string, unknown>, code: string, param?: string) => {
      const { status, body } = await api(`/v1/workspaces/${workspace.slug}/webhooks`, {
        method: 'POST',
        headers: owner.bearer,
        body: JSON.stringify(input),
      });
      expect(status, JSON.stringify(body)).toBe(400);
      expect(body.error?.code).toBe(code);
      if (param) expect(body.error?.param).toBe(param);
    };
    await refuse({ url: 'ftp://example.com/hook' }, 'invalid_url', 'url');
    await refuse({ url: 'https://user:pass@example.com/hook' }, 'invalid_url', 'url');
    await refuse({ url: receiverUrl('/x'), events: ['$nope.*'] }, 'invalid_event', 'events');
    await refuse({ url: receiverUrl('/x'), events: ['$secret.thing'] }, 'invalid_event', 'events');
    await refuse({ url: receiverUrl('/x'), events: ['Order.Completed'] }, 'invalid_event', 'events');
    await refuse({ url: 'not a url' }, 'validation');
  });

  it('requires webhooks scopes and is workspace-scoped', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const other = await setupWorkspace({ bare: true });
    const created = await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl('/scoped') });

    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['webhooks:read'] });
    const readOnlyBearer = { Authorization: `Bearer ${readOnly.secret}` };
    expect((await api(`/v1/workspaces/${workspace.slug}/webhooks`, { headers: readOnlyBearer })).status).toBe(
      200
    );
    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/webhooks`, {
          method: 'POST',
          headers: readOnlyBearer,
          body: JSON.stringify({ url: receiverUrl('/scoped') }),
        })
      ).status
    ).toBe(403);

    const noWebhooks = await createKey(owner.token, workspace.slug, { scopes: ['events:read'] });
    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/webhooks`, {
          headers: { Authorization: `Bearer ${noWebhooks.secret}` },
        })
      ).status
    ).toBe(403);

    expect(
      (
        await api(`/v1/workspaces/${other.workspace.slug}/webhooks/${created.id}`, {
          headers: other.owner.bearer,
        })
      ).status
    ).toBe(404);
    expect(
      (await api(`/v1/workspaces/${workspace.slug}/webhooks/${created.id}`, { headers: other.owner.bearer }))
        .status
    ).toBe(404);
  });
});

describe('webhook delivery', () => {
  it('delivers a control-plane event with a verifiable signature and a hydrated object', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/audit-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });

    const tenant = await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    const hit = await eventually(() => deliveriesTo(path, 'tenant.created')[0], {
      label: 'tenant.created delivery',
    });
    const verified = await verifyWebhook(hit.body, hit.headers, endpoint.secret!);
    expect(verified.id).toMatch(/^whe_/);
    expect(hit.headers['webhook-id']).toBe(verified.id);
    expect(hit.headers['content-type']).toBe('application/json');

    const payload = JSON.parse(hit.body) as Record<string, any>;
    expect(payload.id).toBe(verified.id);
    expect(payload.type).toBe('tenant.created');
    expect(payload.apiVersion).toBe('v1');
    expect(payload.workspace).toEqual({ id: expect.stringMatching(/^ws_/), slug: workspace.slug });
    expect(payload.tenant).toEqual({ id: expect.stringMatching(/^tnt_/), slug: tenant.slug });
    expect(payload.actor.type).toBe('member');
    expect(payload.data.object).toMatchObject({
      id: expect.stringMatching(/^tnt_/),
      slug: tenant.slug,
      name: tenant.name,
    });

    await expect(
      verifyWebhook(hit.body, hit.headers, 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    ).rejects.toMatchObject({
      code: 'invalid_signature',
    });
    await expect(
      verifyWebhook(hit.body, hit.headers, endpoint.secret!, {
        now: Number(hit.headers['webhook-timestamp']) + 600,
      })
    ).rejects.toMatchObject({ code: 'timestamp_out_of_tolerance' });

    const deliveries = await eventually(
      async () => {
        const page = await listDeliveries(owner.bearer, workspace.slug, endpoint.id);
        return page.items.find((entry) => entry.status === 'success') ? page : undefined;
      },
      { label: 'delivery settled' }
    );
    expect(deliveries.total).toBe(1);
    const delivery = deliveries.items[0]!;
    expect(delivery).toMatchObject({ status: 'success', attempts: 1, lastStatus: 200, lastError: null });

    const detail = await api<DeliveryDetail>(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries/${delivery.id}`,
      { headers: owner.bearer }
    );
    expect(detail.body.data?.event?.id).toBe(verified.id);
    expect(detail.body.data?.event?.payload).toEqual(payload);
    expect(
      (detail.body.data as unknown as { attempts: { status: number; attempt: number }[] }).attempts
    ).toEqual([expect.objectContaining({ attempt: 1, status: 200 })]);

    const event = await api<{ id: string; type: string; payload: Record<string, unknown> }>(
      `/v1/workspaces/${workspace.slug}/webhooks/events/${verified.id}`,
      { headers: owner.bearer }
    );
    expect(event.body.data?.payload).toEqual(payload);
    expect(deliveriesTo(path, 'tenant.created')).toHaveLength(1);
  });

  it('delivers subscriber stream events, custom events included, honoring the subscription filter', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const path = `/stream-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['$subscription.*', 'order.*'],
    });
    const externalId = `user_${uniq()}`;

    await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ email: `${externalId}@example.com`, attributes: { plan: 'pro' } }),
    });
    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId, name: 'order.completed', data: { total: 42 } },
          { externalId, name: 'screen.viewed', data: { screen: 'home' } },
        ],
      }),
    });

    const registered = await eventually(() => deliveriesTo(path, '$subscription.registered')[0], {
      label: '$subscription.registered delivery',
    });
    await verifyWebhook(registered.body, registered.headers, endpoint.secret!);
    const registeredPayload = JSON.parse(registered.body) as Record<string, any>;
    expect(registeredPayload.tenant.slug).toBe('default');
    expect(registeredPayload.data.object).toMatchObject({
      id: expect.stringMatching(/^evt_/),
      name: '$subscription.registered',
      source: 'system',
      subscriber: { id: expect.stringMatching(/^sub_/), externalId },
      data: { externalId, channel: 'email', endpoint: `${externalId}@example.com` },
    });

    const order = await eventually(() => deliveriesTo(path, 'order.completed')[0], {
      label: 'order.completed delivery',
    });
    expect((JSON.parse(order.body) as Record<string, any>).data.object.data).toEqual({ total: 42 });

    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(
      deliveriesTo(path)
        .map((entry) => (JSON.parse(entry.body) as { type: string }).type)
        .sort()
    ).toEqual(['$subscription.registered', 'order.completed']);
  });

  it('retries a failing receiver on the schedule, exhausts, records every attempt, and replays on demand', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/failing-${uniq()}`;
    responses.set(path, 503);
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    const exhausted = await eventually(
      async () => {
        const page = await listDeliveries(owner.bearer, workspace.slug, endpoint.id);
        return page.items.find((entry) => entry.status === 'exhausted');
      },
      { timeoutMs: 90_000, label: 'delivery exhausted' }
    );
    expect(exhausted).toMatchObject({ attempts: 10, lastStatus: 503, lastError: 'Endpoint responded 503' });
    expect(deliveriesTo(path, 'tenant.created').length).toBeGreaterThanOrEqual(10);

    const detail = await api<{
      attempts: { attempt: number; status: number; responseBody: string | null }[];
    }>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries/${exhausted.id}`, {
      headers: owner.bearer,
    });
    expect(detail.body.data?.attempts.map((attempt) => attempt.attempt)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(detail.body.data?.attempts[0]?.responseBody).toBe('nope');

    const filtered = await listDeliveries(owner.bearer, workspace.slug, endpoint.id, '?status=success');
    expect(filtered.total).toBe(0);

    responses.delete(path);
    const replayed = await api<Delivery>(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries/${exhausted.id}/replay`,
      { method: 'POST', headers: owner.bearer }
    );
    expect(replayed.status).toBe(202);
    const recovered = await eventually(
      async () => {
        const page = await listDeliveries(owner.bearer, workspace.slug, endpoint.id);
        return page.items.find((entry) => entry.id === exhausted.id && entry.status === 'success');
      },
      { label: 'replayed delivery succeeded' }
    );
    expect(recovered.attempts).toBe(11);
  }, 120_000);

  it('keeps signing with the previous secret for the overlap after a rotation', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/rotate-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    const rotated = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/rotate`, {
      method: 'POST',
      headers: owner.bearer,
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });

    const hit = await eventually(() => deliveriesTo(path, 'tenant.created')[0], {
      label: 'delivery after rotation',
    });
    expect(hit.headers['webhook-signature'].split(' ')).toHaveLength(2);
    await verifyWebhook(hit.body, hit.headers, rotated.body.data!.secret!);
    await verifyWebhook(hit.body, hit.headers, endpoint.secret!);
  });

  it('respects a tenant filter and a manual disable', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/tenant-${uniq()}`;
    const acme = await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['topic.created'],
      tenant: acme.slug,
    });
    expect(endpoint.tenantId).toMatch(/^tnt_/);
    const acmeKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: acme.slug });
    const defaultKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: 'default' });
    await db.insert(tables.credential).values({
      tenantId: Number(
        (
          await db
            .select({ id: tables.tenant.id })
            .from(tables.tenant)
            .where(eq(tables.tenant.slug, acme.slug))
            .limit(1)
        )[0]!.id
      ),
      channel: 'email',
      provider: 'resend',
      environment: 'production',
      secretCiphertext: 'test',
      secretIv: 'test',
      dekCiphertext: 'test',
      dekIv: 'test',
      details: {},
      status: 'active',
      validatedAt: new Date(),
      keyVersion: 1,
    });

    const topicFor = async (bearer: string, slug: string) =>
      api('/v1/topics', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ slug, name: slug, channels: ['email'] }),
      });
    expect((await topicFor(acmeKey.secret, `acme-${uniq()}`)).status).toBe(201);

    const hit = await eventually(() => deliveriesTo(path, 'topic.created')[0], {
      label: 'tenant-filtered delivery',
    });
    expect((JSON.parse(hit.body) as Record<string, any>).tenant.slug).toBe(acme.slug);

    await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ enabled: false }),
    });
    const defaultTopic = await topicFor(defaultKey.secret, `default-${uniq()}`);
    expect([201, 400]).toContain(defaultTopic.status);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(deliveriesTo(path)).toHaveLength(1);
  });

  it('re-enqueues a public audit event the enqueue missed through the reconciliation sweep', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const path = `/sweep-${uniq()}`;
    await createEndpoint(owner.bearer, workspace.slug, {
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

    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(deliveriesTo(path)).toHaveLength(0);

    const sweep = await fetch(
      `${process.env.API_URL ?? 'http://localhost:8791'}/__scheduled?cron=*/5+*+*+*+*`
    );
    expect(sweep.status).toBe(200);

    const hit = await eventually(() => deliveriesTo(path, 'tenant.updated')[0], {
      label: 'reconciled delivery',
    });
    expect((JSON.parse(hit.body) as Record<string, any>).data).toMatchObject({
      changes: ['name'],
      object: null,
    });
  });
});

describe('webhook endpoint edges', () => {
  it('refuses the 51st endpoint with endpoint_limit', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    for (let index = 0; index < 50; index++) {
      await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl(`/limit-${index}`) });
    }
    const { status, body } = await api(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: owner.bearer,
      body: JSON.stringify({ url: receiverUrl('/limit-51') }),
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('endpoint_limit');
    const listed = await api<{ items: Endpoint[] }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      headers: owner.bearer,
    });
    expect(listed.body.data?.items).toHaveLength(50);
  }, 60_000);

  it('caps subscriptions at 100 entries and validates the patch body', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const tooMany = await api(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: owner.bearer,
      body: JSON.stringify({
        url: receiverUrl('/cap'),
        events: Array.from({ length: 101 }, (_, index) => `custom.event${index}`),
      }),
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error?.code).toBe('validation');
    expect(tooMany.body.error?.param).toBe('events');

    const endpoint = await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl('/patch') });
    const patch = (input: Record<string, unknown>) =>
      api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
        method: 'PATCH',
        headers: owner.bearer,
        body: JSON.stringify(input),
      });

    const empty = await patch({});
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code).toBe('bad_request');

    for (const url of ['ftp://example.com/hook', 'https://user:pass@example.com/hook']) {
      const refused = await patch({ url });
      expect(refused.status, url).toBe(400);
      expect(refused.body.error).toMatchObject({ code: 'invalid_url', param: 'url' });
    }
    const malformed = await patch({ url: 'not a url' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error?.code).toBe('validation');
    const badEvents = await patch({ events: ['$nope.*'] });
    expect(badEvents.status).toBe(400);
    expect(badEvents.body.error).toMatchObject({ code: 'invalid_event', param: 'events' });
    const badTenant = await patch({ tenant: 'no-such-tenant' });
    expect(badTenant.status).toBe(404);

    const moved = await patch({ url: receiverUrl('/patch-moved') });
    expect(moved.status).toBe(200);
    expect(moved.body.data?.url).toBe(receiverUrl('/patch-moved'));
    expect(moved.body.data?.secret).toBe(endpoint.secret);
  });

  it('moves the tenant filter to a tenant and back to the whole workspace', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const acme = await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl('/filter') });
    expect(endpoint.tenantId).toBeNull();

    const scoped = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ tenant: acme.slug }),
    });
    expect(scoped.status).toBe(200);
    expect(scoped.body.data?.tenantId).toBe(acme.id);

    const widened = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ tenant: null }),
    });
    expect(widened.status).toBe(200);
    expect(widened.body.data?.tenantId).toBeNull();

    const audit = await api<{ items: { event: string; data: Record<string, unknown> }[] }>(
      `/v1/workspaces/${workspace.slug}/audit?event=webhook.updated`,
      { headers: owner.bearer }
    );
    expect(audit.body.data?.items).toHaveLength(2);
    expect(
      audit.body.data?.items.every((entry) => (entry.data.changes as string[]).includes('tenantId'))
    ).toBe(true);
  });

  it('answers 404 for unknown and malformed ids on every endpoint-bound route', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl('/ids') });
    const base = `/v1/workspaces/${workspace.slug}/webhooks`;
    const bogusIds = ['whk_000000000000000000', 'whd_000000000000000000', 'nope', 'whk_!!!', '123'];

    for (const id of bogusIds) {
      const attempts: [string, string, string?][] = [
        ['GET', `${base}/${id}`],
        ['PATCH', `${base}/${id}`, JSON.stringify({ description: 'x' })],
        ['DELETE', `${base}/${id}`],
        ['POST', `${base}/${id}/rotate`],
        ['GET', `${base}/${id}/deliveries`],
        ['GET', `${base}/${id}/deliveries/whd_000000000000000000`],
        ['POST', `${base}/${id}/deliveries/whd_000000000000000000/replay`],
        ['GET', `${base}/${endpoint.id}/deliveries/${id}`],
        ['POST', `${base}/${endpoint.id}/deliveries/${id}/replay`],
        ['GET', `${base}/events/${id}`],
      ];
      for (const [method, path, body] of attempts) {
        const { status } = await api(path, { method, headers: owner.bearer, body });
        expect(status, `${method} ${path}`).toBe(404);
      }
    }
  });

  it('publishes a catalog whose groups cover every public audit and stream event', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const { status, body } = await api<{ groups: CatalogGroup[] }>(
      `/v1/workspaces/${workspace.slug}/webhooks/catalog`,
      { headers: owner.bearer }
    );
    expect(status).toBe(200);
    const groups = body.data!.groups;
    const options = groups.flatMap((group) => group.options);

    expect(new Set(options).size).toBe(options.length);
    expect(options.sort()).toEqual(
      [
        ...PUBLIC_AUDIT_EVENTS,
        ...Object.keys(SYSTEM_EVENTS).map((name) => `$${name}`),
        ...Object.keys(SDK_EVENTS).map((name) => `$${name}`),
      ]
        .filter((name, index, all) => all.indexOf(name) === index)
        .sort()
    );
    const dotted = groups.filter((group) => group.wildcard !== undefined);
    expect(groups.filter((group) => group.wildcard === undefined)).toEqual([
      { label: 'identify', options: ['$identify'] },
    ]);
    for (const group of dotted) {
      expect(group.label).not.toContain('$');
      expect(group.label).toMatch(/^[a-z]+$/);
      expect(group.wildcard!.replace(/^\$/, '')).toBe(`${group.label}.*`);
      expect(group.options.every((option) => option.startsWith(group.wildcard!.slice(0, -1)))).toBe(true);
    }
    expect(options).toContain('tenant.created');
    expect(options).toContain('$app.opened');
    for (const hidden of ['key.created', 'webhook.created', 'webhook.disabled', 'profile.updated']) {
      expect(options).not.toContain(hidden);
    }

    const subscribedToAll = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl('/catalog'),
      events: [...options, ...dotted.map((group) => group.wildcard!)],
    });
    expect(subscribedToAll.events).toHaveLength(options.length + dotted.length);
  });

  it('keeps $identify subscribable by name while refusing the $identify.* wildcard', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const subscribe = (events: string[]) =>
      api(`/v1/workspaces/${workspace.slug}/webhooks`, {
        method: 'POST',
        headers: owner.bearer,
        body: JSON.stringify({ url: receiverUrl('/identify'), events }),
      });
    expect((await subscribe(['$identify'])).status).toBe(201);
    const wildcard = await subscribe(['$identify.*']);
    expect(wildcard.status).toBe(400);
    expect(wildcard.body.error).toMatchObject({ code: 'invalid_event', param: 'events' });
  });

  it('refuses wildcards over private audit resources and accepts public and custom ones', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const subscribe = (events: string[]) =>
      api(`/v1/workspaces/${workspace.slug}/webhooks`, {
        method: 'POST',
        headers: owner.bearer,
        body: JSON.stringify({ url: receiverUrl('/private'), events }),
      });
    for (const pattern of ['key.*', 'webhook.*', 'profile.*']) {
      const refused = await subscribe([pattern]);
      expect(refused.status, pattern).toBe(400);
      expect(refused.body.error, pattern).toMatchObject({ code: 'invalid_event', param: 'events' });
    }
    const accepted = await subscribe(['tenant.*', '$subscription.*', 'order.*']);
    expect(accepted.status).toBe(201);
  });
});

describe('webhook authorization', () => {
  it('applies the same matrix to every route', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const other = await setupWorkspace({ bare: true });
    const member = await addMember(owner.token, workspace.slug, 'member');
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const readKey = await createKey(owner.token, workspace.slug, { scopes: ['webhooks:read'] });
    const writeKey = await createKey(owner.token, workspace.slug, { scopes: ['webhooks:write'] });
    const tenantKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: 'default' });
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const path = `/auth-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['tenant.created'],
    });
    await createTenant(workspaceBearer(owner.bearer, workspace.slug), 'Acme', { bare: true });
    const hit = await eventually(() => deliveriesTo(path, 'tenant.created')[0], { label: 'matrix delivery' });
    const eventId = hit.headers['webhook-id']!;
    const delivery = (
      await eventually(
        async () => {
          const page = await listDeliveries(owner.bearer, workspace.slug, endpoint.id);
          return page.items.find((entry) => entry.status === 'success');
        },
        { label: 'matrix delivery settled' }
      )
    ).id;

    const base = `/v1/workspaces/${workspace.slug}/webhooks`;
    const routes: { method: string; path: string; kind: 'read' | 'write'; body?: string }[] = [
      { method: 'GET', path: base, kind: 'read' },
      { method: 'GET', path: `${base}/catalog`, kind: 'read' },
      { method: 'GET', path: `${base}/${endpoint.id}`, kind: 'read' },
      { method: 'GET', path: `${base}/${endpoint.id}/deliveries`, kind: 'read' },
      { method: 'GET', path: `${base}/${endpoint.id}/deliveries/${delivery}`, kind: 'read' },
      { method: 'GET', path: `${base}/events/${eventId}`, kind: 'read' },
      { method: 'POST', path: base, kind: 'write', body: JSON.stringify({ url: receiverUrl('/matrix') }) },
      {
        method: 'PATCH',
        path: `${base}/${endpoint.id}`,
        kind: 'write',
        body: JSON.stringify({ description: 'touched' }),
      },
      { method: 'POST', path: `${base}/${endpoint.id}/rotate`, kind: 'write' },
      { method: 'POST', path: `${base}/${endpoint.id}/deliveries/${delivery}/replay`, kind: 'write' },
      { method: 'DELETE', path: `${base}/${endpoint.id}`, kind: 'write' },
    ];
    const principals: {
      name: string;
      headers: Record<string, string>;
      read: number;
      write: number;
      code?: string;
    }[] = [
      { name: 'member session', headers: member.bearer, read: 200, write: 403, code: 'missing_permission' },
      { name: 'read key', headers: { Authorization: `Bearer ${readKey.secret}` }, read: 200, write: 403 },
      { name: 'write key', headers: { Authorization: `Bearer ${writeKey.secret}` }, read: 403, write: 200 },
      {
        name: 'tenant key',
        headers: { Authorization: `Bearer ${tenantKey.secret}` },
        read: 403,
        write: 403,
        code: 'missing_permission',
      },
      {
        name: 'client key',
        headers: { Authorization: `Bearer ${clientKey.secret}` },
        read: 401,
        write: 401,
        code: 'invalid_session',
      },
      { name: 'other workspace session', headers: other.owner.bearer, read: 404, write: 404 },
      {
        name: 'other workspace key',
        headers: other.keyBearer,
        read: 403,
        write: 403,
        code: 'wrong_workspace',
      },
      { name: 'anonymous', headers: {}, read: 401, write: 401, code: 'missing_authorization' },
    ];

    for (const principal of principals) {
      for (const route of routes) {
        const expected = route.kind === 'read' ? principal.read : principal.write;
        if (expected === 200) continue;
        const { status, body } = await api(route.path, {
          method: route.method,
          headers: principal.headers,
          body: route.body,
        });
        expect(status, `${principal.name} ${route.method} ${route.path}`).toBe(expected);
        if (principal.code)
          expect(body.error?.code, `${principal.name} ${route.method} ${route.path}`).toBe(principal.code);
      }
    }

    for (const route of routes.filter((entry) => entry.kind === 'read')) {
      for (const headers of [member.bearer, { Authorization: `Bearer ${readKey.secret}` }]) {
        const { status } = await api(route.path, { headers });
        expect(status, `${route.method} ${route.path}`).toBe(200);
      }
    }

    const writeBearer = { Authorization: `Bearer ${writeKey.secret}` };
    for (const headers of [admin.bearer, writeBearer]) {
      const scratch = await createEndpoint(headers, workspace.slug, { url: receiverUrl('/matrix-scratch') });
      const patched = await api(`${base}/${scratch.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ description: 'touched' }),
      });
      expect(patched.status).toBe(200);
      expect((await api(`${base}/${scratch.id}/rotate`, { method: 'POST', headers })).status).toBe(200);
      expect((await api(`${base}/${scratch.id}`, { method: 'DELETE', headers })).status).toBe(200);
    }
    const replayed = await api(`${base}/${endpoint.id}/deliveries/${delivery}/replay`, {
      method: 'POST',
      headers: writeBearer,
    });
    expect(replayed.status).toBe(202);
    const replayHit = await eventually(() => deliveriesTo(path, 'tenant.created')[1], {
      label: 'replay from write key',
    });
    expect(replayHit.headers['webhook-id']).toBe(eventId);
  }, 60_000);
});
