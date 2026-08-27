import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { createKey, createTenant, setupWorkspace, uniq } from '../../../utils/setup';

type Token = { token: string; expiresAt: string; url: string };

type Claims = {
  workspace_id: string;
  name: string;
  exp: number;
  scopes: Array<{ type: string; resource: string; fixed_params: Record<string, unknown> }>;
  limits?: { rps: number };
};

type Headers = Record<string, string>;

function decode(token: string): Claims {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as Claims;
}

async function mint(headers: Headers) {
  const { status, body } = await api<Token>('/v1/events/token', { headers });
  expect(status).toBe(200);
  return body.data!;
}

async function pipe<T>(minted: Token, name: string, query: string) {
  const response = await fetch(`${minted.url}/v0/pipes/${name}.json?${query}`, {
    headers: { authorization: `Bearer ${minted.token}` },
  });
  const body = (await response.json()) as { data?: T[]; error?: string };
  return { status: response.status, rows: body.data ?? [], error: body.error };
}

async function landed(headers: Headers, name: string) {
  await eventually(
    async () => {
      const { body } = await api<{ items: unknown[] }>(`/v1/events?name=${name}`, { headers });
      return body.data?.items.length ? true : undefined;
    },
    { label: `${name} landed`, timeoutMs: 60_000 }
  );
}

describe('GET /v1/events/token', () => {
  it('mints a one-hour read token scoped to the four dashboard endpoints of this tenant', async () => {
    const { keyBearer, tenantId } = await setupWorkspace({ bare: true });
    const before = Date.now();

    const minted = await mint(keyBearer);

    expect(minted.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(minted.url).toMatch(/^https?:\/\//);
    const expiresAt = new Date(minted.expiresAt).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(3_600_000 - 5_000);
    expect(expiresAt - before).toBeLessThanOrEqual(3_600_000 + 5_000);

    const claims = decode(minted.token);
    expect(claims.exp).toBe(Math.floor(expiresAt / 1000));
    expect(claims.workspace_id).toBeTruthy();
    expect(claims.limits).toEqual({ rps: 20 });
    expect(claims.scopes).toHaveLength(4);
    expect(claims.scopes.map((scope) => scope.resource).sort()).toEqual([
      'event_catalog',
      'event_recent',
      'event_volume',
      'subscriber_timeline',
    ]);
    for (const scope of claims.scopes) {
      expect(scope.type).toBe('PIPES:READ');
      expect(scope.fixed_params).toEqual({ tenant_id: tenantId });
    }
  });

  it('caches the token for the tenant and mints a different one per tenant', async () => {
    const { keyBearer, owner, workspace, tenantId } = await setupWorkspace({ bare: true });

    const first = await mint(keyBearer);
    const second = await mint(keyBearer);
    expect(second.token).toBe(first.token);
    expect(second.expiresAt).toBe(first.expiresAt);

    const other = await createTenant(keyBearer, 'Other', { bare: true });
    const otherKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: other.slug });
    const viaHeader = await mint({ ...keyBearer, 'buzzkit-tenant': other.slug });
    const viaTenantKey = await mint({ Authorization: `Bearer ${otherKey.secret}` });

    expect(viaHeader.token).not.toBe(first.token);
    expect(viaTenantKey.token).toBe(viaHeader.token);
    const otherTenantId = decode(viaHeader.token).scopes[0]?.fixed_params.tenant_id;
    expect(otherTenantId).not.toBe(tenantId);
    expect(
      decode(viaHeader.token).scopes.every((scope) => scope.fixed_params.tenant_id === otherTenantId)
    ).toBe(true);
  });

  it('pins every direct Tinybird query to the tenant regardless of the tenant_id sent', async () => {
    const mine = await setupWorkspace({ bare: true });
    const theirs = await setupWorkspace({ bare: true });
    const myName = `mine.${uniq()}`;
    const theirName = `theirs.${uniq()}`;
    const myUser = `user_${uniq()}`;
    const theirUser = `user_${uniq()}`;

    await api('/v1/events', {
      method: 'POST',
      headers: mine.keyBearer,
      body: JSON.stringify({ externalId: myUser, name: myName }),
    });
    await api('/v1/events', {
      method: 'POST',
      headers: theirs.keyBearer,
      body: JSON.stringify({ externalId: theirUser, name: theirName }),
    });
    await landed(mine.keyBearer, myName);
    await landed(theirs.keyBearer, theirName);

    const minted = await mint(mine.keyBearer);

    const recent = await pipe<{ external_id: string; name: string }>(
      minted,
      'event_recent',
      `tenant_id=${theirs.tenantId}&limit=50`
    );
    expect(recent.status).toBe(200);
    expect(recent.rows.length).toBeGreaterThanOrEqual(2);
    expect(recent.rows.every((row) => row.external_id === myUser)).toBe(true);
    expect(recent.rows.map((row) => row.name).sort()).toEqual(['$subscriber.created', myName]);
    expect(recent.rows.some((row) => row.external_id === theirUser || row.name === theirName)).toBe(false);

    const filtered = await pipe<{ name: string }>(
      minted,
      'event_recent',
      `tenant_id=${theirs.tenantId}&name=${theirName}&limit=50`
    );
    expect(filtered.status).toBe(200);
    expect(filtered.rows).toEqual([]);

    const catalog = await pipe<{ name: string }>(minted, 'event_catalog', `tenant_id=${theirs.tenantId}`);
    expect(catalog.status).toBe(200);
    expect(catalog.rows.map((row) => row.name).sort()).toEqual(['$subscriber.created', myName]);

    const theirToken = await mint(theirs.keyBearer);
    const theirCatalog = await pipe<{ name: string }>(
      theirToken,
      'event_catalog',
      `tenant_id=${mine.tenantId}`
    );
    expect(theirCatalog.rows.map((row) => row.name).sort()).toEqual(['$subscriber.created', theirName]);

    const ingest = await fetch(`${minted.url}/v0/events?name=events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${minted.token}` },
      body: '{}',
    });
    expect(ingest.status).toBeGreaterThanOrEqual(400);

    const sql = await fetch(`${minted.url}/v0/sql?q=${encodeURIComponent('SELECT count() FROM events')}`, {
      headers: { authorization: `Bearer ${minted.token}` },
    });
    expect(sql.status).toBeGreaterThanOrEqual(400);
  }, 90_000);

  it('requires events:read', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const writer = await createKey(owner.token, workspace.slug, { scopes: ['events:write'] });

    const { status, body } = await api('/v1/events/token', {
      headers: { Authorization: `Bearer ${writer.secret}` },
    });

    expect(status).toBe(403);
    expect(body.error?.code).toBe('missing_permission');
  });
});
