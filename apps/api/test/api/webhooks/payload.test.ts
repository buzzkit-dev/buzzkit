import type { ActorEventRow } from '@buzzkit/api/actor/types';
import type { AuditRow } from '@buzzkit/api/api/audit/index';
import {
  buildAuditPayload,
  buildStreamPayload,
  resolveWebhookScope,
  WEBHOOK_API_VERSION,
  type WebhookScope,
} from '@buzzkit/api/api/webhooks/payload';
import { encodeId, s } from '@buzzkit/api/libs/sqids';
import { type Db, tables } from '@buzzkit/database';
import { describe, expect, it, vi } from 'vitest';

const scope: WebhookScope = {
  workspace: { id: 7, slug: 'acme', name: 'Acme' },
  tenant: { id: 5, slug: 'production', name: 'Production' },
};

const row: ActorEventRow = {
  sequence: 12,
  id: 'evt_0198eb66-327b-7abc-8def-0123456789ab',
  idempotency_key: null,
  name: '$app.opened',
  source: 'ios',
  timestamp: '2026-08-27T10:00:00.000Z',
  received_at: '2026-08-27T10:00:01.250Z',
  data: '{"screen":"home","nested":{"count":2}}',
  run_id: null,
  message_id: null,
  step: null,
};

const subscriber = { id: 3, externalId: 'user_1' };

function fakeDb(rowsFor: (table: unknown) => unknown[]) {
  const select = vi.fn(() => ({
    from: (table: unknown) => ({ where: async () => rowsFor(table) }),
  }));
  return { db: { select } as unknown as Db, select };
}

function auditRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 99,
    workspaceId: 7,
    tenantId: 5,
    event: 'tenant.updated',
    actorType: 'member',
    actorUserId: 'user_1',
    actorMemberId: 2,
    actorKeyId: null,
    actorDisplay: 'ada@example.com',
    targetType: 'tenant',
    targetId: s.encode([5]),
    data: { changes: { name: ['Old', 'New'] } },
    requestId: 'req_1',
    ip: '203.0.113.9',
    userAgent: 'vitest',
    createdAt: new Date('2026-08-27T10:00:00.000Z'),
    ...overrides,
  };
}

describe('WEBHOOK_API_VERSION', () => {
  it('is v1', () => {
    expect(WEBHOOK_API_VERSION).toBe('v1');
  });
});

describe('buildStreamPayload', () => {
  it('wraps the actor row in the envelope', () => {
    expect(buildStreamPayload(row, subscriber, scope)).toEqual({
      id: null,
      type: '$app.opened',
      apiVersion: 'v1',
      createdAt: '2026-08-27T10:00:01.250Z',
      workspace: { id: encodeId('workspace', 7), slug: 'acme' },
      tenant: { id: encodeId('tenant', 5), slug: 'production' },
      data: {
        object: {
          id: 'evt_0198eb66-327b-7abc-8def-0123456789ab',
          sequence: 12,
          name: '$app.opened',
          source: 'ios',
          timestamp: '2026-08-27T10:00:00.000Z',
          receivedAt: '2026-08-27T10:00:01.250Z',
          data: { screen: 'home', nested: { count: 2 } },
          subscriber: { id: encodeId('subscriber', 3), externalId: 'user_1' },
        },
      },
    });
  });

  it('prefixes every id and leaves the event id for stamping', () => {
    const payload = buildStreamPayload(row, subscriber, scope);
    const object = (payload.data as { object: Record<string, unknown> }).object;
    expect(payload.id).toBeNull();
    expect((payload.workspace as { id: string }).id).toMatch(/^ws_/);
    expect((payload.tenant as { id: string }).id).toMatch(/^tnt_/);
    expect((object.subscriber as { id: string }).id).toMatch(/^sub_[A-Za-z0-9]{32,}$/);
    expect(object.subscriber).toEqual({ id: encodeId('subscriber', 3), externalId: 'user_1' });
  });

  it('never exposes the scope names or the internal columns', () => {
    const payload = buildStreamPayload(row, subscriber, scope);
    expect(payload.workspace).not.toHaveProperty('name');
    expect(payload.tenant).not.toHaveProperty('name');
    const object = (payload.data as { object: Record<string, unknown> }).object;
    for (const key of ['idempotency_key', 'run_id', 'message_id', 'step', 'received_at']) {
      expect(object, key).not.toHaveProperty(key);
    }
  });

  it('uses the event name as the type', () => {
    expect(
      buildStreamPayload({ ...row, name: 'order.completed', source: 'server' }, subscriber, scope)
    ).toMatchObject({
      type: 'order.completed',
      data: { object: { name: 'order.completed', source: 'server' } },
    });
  });

  it('parses empty and scalar-bearing data', () => {
    expect(buildStreamPayload({ ...row, data: '{}' }, subscriber, scope)).toMatchObject({
      data: { object: { data: {} } },
    });
    expect(
      buildStreamPayload({ ...row, data: '{"durationSec":12.5,"flag":false}' }, subscriber, scope)
    ).toMatchObject({
      data: { object: { data: { durationSec: 12.5, flag: false } } },
    });
  });

  it('handles a workspace-only scope', () => {
    expect(buildStreamPayload(row, subscriber, { ...scope, tenant: null }).tenant).toBeNull();
  });
});

describe('resolveWebhookScope', () => {
  it('returns null when the workspace is gone', async () => {
    const { db, select } = fakeDb(() => []);
    expect(await resolveWebhookScope(db, 7, 5)).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('skips the tenant lookup for a workspace-level scope', async () => {
    const { db, select } = fakeDb((table) =>
      table === tables.workspace ? [{ id: 7, slug: 'acme', name: 'Acme' }] : []
    );
    expect(await resolveWebhookScope(db, 7, null)).toEqual({
      workspace: { id: 7, slug: 'acme', name: 'Acme' },
      tenant: null,
    });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('resolves both the workspace and the tenant', async () => {
    const { db, select } = fakeDb((table) => {
      if (table === tables.workspace) return [{ id: 7, slug: 'acme', name: 'Acme' }];
      if (table === tables.tenant) return [{ id: 5, slug: 'production', name: 'Production' }];
      return [];
    });
    expect(await resolveWebhookScope(db, 7, 5)).toEqual(scope);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('keeps the tenant null when it is gone', async () => {
    const { db } = fakeDb((table) =>
      table === tables.workspace ? [{ id: 7, slug: 'acme', name: 'Acme' }] : []
    );
    expect(await resolveWebhookScope(db, 7, 5)).toEqual({
      workspace: { id: 7, slug: 'acme', name: 'Acme' },
      tenant: null,
    });
  });
});

describe('buildAuditPayload', () => {
  it('wraps a targetless entry without touching the database', async () => {
    const { db, select } = fakeDb(() => []);
    expect(
      await buildAuditPayload(
        db,
        auditRow({ event: 'workspace.updated', targetType: null, targetId: null, data: { changes: {} } }),
        { ...scope, tenant: null }
      )
    ).toEqual({
      id: null,
      type: 'workspace.updated',
      apiVersion: 'v1',
      createdAt: '2026-08-27T10:00:00.000Z',
      workspace: { id: encodeId('workspace', 7), slug: 'acme' },
      tenant: null,
      actor: { type: 'member', display: 'ada@example.com' },
      request: { id: 'req_1' },
      target: null,
      data: { object: null, changes: {} },
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('prefixes a bare target id and resolves the target object', async () => {
    const tenantRecord = {
      id: 5,
      workspaceId: 7,
      name: 'Production',
      slug: 'production',
      isDefault: true,
      metadata: {},
      settings: {},
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-27T10:00:00.000Z'),
    };
    const { db } = fakeDb((table) => (table === tables.tenant ? [tenantRecord] : []));
    const payload = await buildAuditPayload(db, auditRow(), scope);
    expect(payload).toMatchObject({
      type: 'tenant.updated',
      actor: { type: 'member', display: 'ada@example.com' },
      request: { id: 'req_1' },
      target: { type: 'tenant', id: encodeId('tenant', 5) },
      data: { changes: { name: ['Old', 'New'] } },
    });
    expect((payload.data as { object: Record<string, unknown> }).object).toMatchObject({
      id: encodeId('tenant', 5),
      slug: 'production',
      name: 'Production',
      isDefault: true,
    });
  });

  it('keeps an already prefixed target id', async () => {
    const { db } = fakeDb(() => []);
    const payload = await buildAuditPayload(db, auditRow({ targetId: encodeId('tenant', 5) }), scope);
    expect(payload.target).toEqual({ type: 'tenant', id: encodeId('tenant', 5) });
    expect((payload.data as { object: unknown }).object).toBeNull();
  });

  it('keeps a target id that does not decode as it is', async () => {
    const { db, select } = fakeDb(() => []);
    const payload = await buildAuditPayload(db, auditRow({ targetId: 'garbage' }), scope);
    expect(payload.target).toEqual({ type: 'tenant', id: 'garbage' });
    expect((payload.data as { object: unknown }).object).toBeNull();
    expect(select).not.toHaveBeenCalled();
    expect(
      (await buildAuditPayload(db, auditRow({ targetId: s.encode([5]).toUpperCase() }), scope)).target
    ).toEqual({ type: 'tenant', id: s.encode([5]).toUpperCase() });
  });

  it('leaves the object null when the target row is gone', async () => {
    const { db, select } = fakeDb(() => []);
    const payload = await buildAuditPayload(db, auditRow(), scope);
    expect(payload.target).toEqual({ type: 'tenant', id: encodeId('tenant', 5) });
    expect((payload.data as { object: unknown }).object).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('never loads an object for a target type without a resolver', async () => {
    const { db, select } = fakeDb(() => []);
    const payload = await buildAuditPayload(
      db,
      auditRow({ event: 'key.created', targetType: 'key', targetId: s.encode([8]) }),
      scope
    );
    expect(payload.target).toEqual({ type: 'key', id: encodeId('key', 8) });
    expect((payload.data as { object: unknown }).object).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('spreads a null data column into an object-only data field', async () => {
    const { db } = fakeDb(() => []);
    const payload = await buildAuditPayload(
      db,
      auditRow({ data: null, targetType: null, targetId: null }),
      scope
    );
    expect(payload.data).toEqual({ object: null });
  });

  it('describes system and key actors', async () => {
    const { db } = fakeDb(() => []);
    expect(
      (
        await buildAuditPayload(
          db,
          auditRow({ actorType: 'system', actorDisplay: 'system', targetType: null, targetId: null }),
          scope
        )
      ).actor
    ).toEqual({ type: 'system', display: 'system' });
    expect(
      (
        await buildAuditPayload(
          db,
          auditRow({ actorType: 'key', actorDisplay: 'CI (bk_ws_…ab12)', targetType: null, targetId: null }),
          scope
        )
      ).actor
    ).toEqual({ type: 'key', display: 'CI (bk_ws_…ab12)' });
  });
});
