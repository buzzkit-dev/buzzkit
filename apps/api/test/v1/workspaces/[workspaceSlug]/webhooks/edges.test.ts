import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

type Endpoint = { id: string; url: string; enabled: boolean; tenantId: string | null };
type Delivery = {
  id: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
};
type Attempt = { attempt: number; status: number | null; error: string | null; responseBody: string | null };
type Received = { path: string; body: string };

const PORT = 8879;
const received: Received[] = [];
const handlers = new Map<string, (response: ServerResponse) => void>();
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
    received.push({ path, body });
    const handler = handlers.get(path);
    if (handler) return handler(response);
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const receiverUrl = (path: string) => `http://localhost:${PORT}${path}`;

const hits = (path: string) => received.filter((entry) => entry.path === path);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createEndpoint(bearer: Record<string, string>, slug: string, input: Record<string, unknown>) {
  const { status, body } = await api<Endpoint>(`/v1/workspaces/${slug}/webhooks`, {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify(input),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body.data!;
}

async function createTopic(headers: Record<string, string>) {
  const slug = `topic-${uniq()}`;
  const { status } = await api('/v1/topics', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name: slug, channels: ['email'] }),
  });
  expect(status).toBe(201);
  return slug;
}

async function deliveriesOf(bearer: Record<string, string>, slug: string, endpointId: string) {
  const { body } = await api<{ items: Delivery[] }>(
    `/v1/workspaces/${slug}/webhooks/${endpointId}/deliveries`,
    {
      headers: bearer,
    }
  );
  return body.data?.items ?? [];
}

function settled(
  bearer: Record<string, string>,
  slug: string,
  endpointId: string,
  predicate: (delivery: Delivery) => boolean,
  label: string
) {
  return eventually(async () => (await deliveriesOf(bearer, slug, endpointId)).find(predicate), {
    label,
    timeoutMs: 60_000,
  });
}

describe('webhook delivery edges', () => {
  it('never follows a redirect: a 3xx is a failed attempt and the target is not called', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const path = `/redirect-${uniq()}`;
    const landing = `/landing-${uniq()}`;
    handlers.set(path, (response) => {
      response.writeHead(302, { location: receiverUrl(landing) });
      response.end();
    });
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['topic.created'],
    });
    await createTopic(keyBearer);

    const delivery = await settled(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.attempts >= 1,
      'redirected delivery attempted'
    );
    expect(delivery.status).toBe('failed');
    expect(delivery.lastStatus).toBe(302);
    expect(delivery.lastError).toBe('Endpoint responded 302');
    expect(hits(landing)).toHaveLength(0);
    expect(hits(path).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps only the first 4 KB of a response body', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const path = `/verbose-${uniq()}`;
    handlers.set(path, (response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('y'.repeat(10_000));
    });
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['topic.created'],
    });
    await createTopic(keyBearer);
    const delivery = await settled(
      owner.bearer,
      workspace.slug,
      endpoint.id,
      (entry) => entry.status === 'success',
      'verbose delivery'
    );
    const { body } = await api<{ attempts: Attempt[] }>(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/deliveries/${delivery.id}`,
      { headers: owner.bearer }
    );
    expect(body.data?.attempts[0]?.responseBody).toHaveLength(4096);
  });

  it("delivers to a tenant-filtered endpoint only that tenant's events, and nothing while disabled", async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const acme = await createTenant(keyBearer, 'Acme');
    const acmeBearer = { ...keyBearer, 'buzzkit-tenant': acme.slug };
    const path = `/acme-${uniq()}`;
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(path),
      events: ['*'],
      tenant: acme.slug,
    });
    expect(endpoint.tenantId).toMatch(/^tnt_/);

    await createTopic(keyBearer);
    const renamed = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ name: `Renamed ${uniq()}` }),
    });
    expect(renamed.status).toBe(200);
    const acmeTopic = await createTopic(acmeBearer);

    const hit = await eventually(
      () => hits(path).find((entry) => (JSON.parse(entry.body) as { type: string }).type === 'topic.created'),
      { label: 'acme delivery' }
    );
    const payload = JSON.parse(hit.body) as { tenant: { slug: string }; data: { object: { slug: string } } };
    expect(payload.tenant.slug).toBe(acme.slug);
    expect(payload.data.object.slug).toBe(acmeTopic);
    await sleep(2_000);
    expect(hits(path).map((entry) => (JSON.parse(entry.body) as { type: string }).type)).toEqual([
      'topic.created',
    ]);

    const disabled = await api<Endpoint>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ enabled: false }),
    });
    expect(disabled.body.data?.enabled).toBe(false);
    await createTopic(acmeBearer);
    await sleep(3_000);
    expect(hits(path)).toHaveLength(1);

    await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: owner.bearer,
      body: JSON.stringify({ enabled: true }),
    });
    await createTopic(acmeBearer);
    await eventually(() => hits(path).length === 2, { label: 'delivery after re-enable' });
    await sleep(2_000);
    expect(hits(path)).toHaveLength(2);
    expect(await deliveriesOf(owner.bearer, workspace.slug, endpoint.id)).toHaveLength(2);
  });

  it('scopes deliveries to their endpoint', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const first = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(`/first-${uniq()}`),
      events: ['topic.created'],
    });
    const second = await createEndpoint(owner.bearer, workspace.slug, {
      url: receiverUrl(`/second-${uniq()}`),
      events: ['topic.created'],
    });
    await createTopic(keyBearer);
    const delivery = await settled(
      owner.bearer,
      workspace.slug,
      first.id,
      (entry) => entry.status === 'success',
      'first endpoint delivery'
    );
    await settled(
      owner.bearer,
      workspace.slug,
      second.id,
      (entry) => entry.status === 'success',
      'second endpoint delivery'
    );

    const base = `/v1/workspaces/${workspace.slug}/webhooks/${second.id}/deliveries/${delivery.id}`;
    expect((await api(base, { headers: owner.bearer })).status).toBe(404);
    expect((await api(`${base}/replay`, { method: 'POST', headers: owner.bearer })).status).toBe(404);
    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/webhooks/${first.id}/deliveries/${delivery.id}`, {
          headers: owner.bearer,
        })
      ).status
    ).toBe(200);
  });

  it('replaces the previous secret on a second rotation inside the overlap', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const endpoint = await createEndpoint(owner.bearer, workspace.slug, { url: receiverUrl('/rotate') });
    const rotate = () =>
      api<{ secret: string; previousSecret: string | null }>(
        `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/rotate`,
        { method: 'POST', headers: owner.bearer }
      );
    const first = await rotate();
    const second = await rotate();
    expect(second.body.data?.previousSecret).toBe(first.body.data?.secret);
    expect(second.body.data?.secret).not.toBe(first.body.data?.secret);
  });
});
