import {
  assertEventNameAllowed,
  isReservedEventName,
  isSdkEventName,
  reservedEventName,
  SDK_EVENTS,
  SYSTEM_EVENTS,
} from '@buzzkit/api/api/events/catalog';
import { EVENT_SOURCES } from '@buzzkit/api/api/events/constants';
import type { EventSource } from '@buzzkit/api/api/events/types';
import { BadRequestError } from '@buzzkit/api/libs/error';
import type { TSchema } from 'elysia';
import { TypeCompiler } from 'elysia/type-system';
import { describe, expect, it } from 'vitest';

const sdkNames = Object.keys(SDK_EVENTS);
const systemNames = Object.keys(SYSTEM_EVENTS);
const systemOnlyNames = systemNames.filter((name) => !(name in SDK_EVENTS));
const clientSources: EventSource[] = ['ios', 'android', 'web'];

function expectReserved(name: string, source: EventSource) {
  let thrown: unknown;
  try {
    assertEventNameAllowed(name, source);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `${source} × ${name}`).toBeInstanceOf(BadRequestError);
  const error = thrown as InstanceType<typeof BadRequestError>;
  expect(error.code).toBe('reserved_event');
  expect(error.param).toBe('name');
  expect(error.status).toBe(400);
  expect(error.message).toContain(name);
}

function expectAllowed(name: string, source: EventSource) {
  expect(() => assertEventNameAllowed(name, source), `${source} × ${name}`).not.toThrow();
}

describe('reserved names', () => {
  it('prefixes with the dollar sign and recognises the prefix', () => {
    expect(reservedEventName('subscriber.created')).toBe('$subscriber.created');
    expect(isReservedEventName('$subscriber.created')).toBe(true);
    expect(isReservedEventName('subscriber.created')).toBe(false);
    expect(isReservedEventName('order.paid$')).toBe(false);
    expect(isReservedEventName('')).toBe(false);
  });

  it('recognises SDK names only with the prefix and only from the SDK catalog', () => {
    for (const name of sdkNames) {
      expect(isSdkEventName(`$${name}`), name).toBe(true);
      expect(isSdkEventName(name), name).toBe(false);
    }
    for (const name of systemOnlyNames) {
      expect(isSdkEventName(`$${name}`), name).toBe(false);
    }
    expect(isSdkEventName('$unknown')).toBe(false);
    expect(isSdkEventName('$')).toBe(false);
  });

  it('ignores names inherited from Object.prototype', () => {
    for (const name of ['$toString', '$constructor', '$hasOwnProperty', '$__proto__', '$valueOf']) {
      expect(isSdkEventName(name), name).toBe(false);
    }
  });

  it('shares identify between both catalogs', () => {
    expect(systemOnlyNames).not.toContain('identify');
    expect(sdkNames).toContain('identify');
    expect(systemNames).toContain('identify');
  });
});

describe('assertEventNameAllowed', () => {
  it('accepts custom names from every source', () => {
    for (const source of EVENT_SOURCES) {
      expectAllowed('order.paid', source);
      expectAllowed('signup', source);
      expectAllowed('a', source);
    }
  });

  it('accepts every reserved name from the system source', () => {
    for (const name of [...sdkNames, ...systemNames, 'unknown']) {
      expectAllowed(`$${name}`, 'system');
    }
  });

  it('rejects every reserved name from the server source', () => {
    for (const name of [...sdkNames, ...systemNames, 'unknown']) {
      expectReserved(`$${name}`, 'server');
    }
  });

  it('accepts SDK names and identify from the client sources', () => {
    for (const source of clientSources) {
      for (const name of sdkNames) expectAllowed(`$${name}`, source);
      expectAllowed('$identify', source);
    }
  });

  it('rejects system-only names and unknown reserved names from the client sources', () => {
    for (const source of clientSources) {
      for (const name of systemOnlyNames) expectReserved(`$${name}`, source);
      expectReserved('$unknown', source);
      expectReserved('$', source);
      expectReserved('$toString', source);
      expectReserved('$constructor', source);
      expectReserved('$hasOwnProperty', source);
    }
  });

  it('treats the unprefixed catalog names as ordinary custom names', () => {
    for (const source of EVENT_SOURCES) {
      for (const name of [...sdkNames, ...systemNames]) expectAllowed(name, source);
    }
  });
});

describe('catalog keys', () => {
  it('are lowercase, dotted and never carry the prefix', () => {
    for (const name of [...sdkNames, ...systemNames]) {
      expect(name, name).toMatch(/^[a-z]+(\.[a-z_]+)*$/);
      expect(name, name).not.toContain('$');
      expect(name, name).toBe(name.toLowerCase());
    }
  });

  it('has no duplicate names across the two catalogs except identify', () => {
    const shared = sdkNames.filter((name) => name in SYSTEM_EVENTS);
    expect(shared).toEqual(['identify']);
  });
});

const subscription = {
  externalId: 'user_1',
  channel: 'push',
  platform: 'ios',
  endpoint: 'abc',
  enabled: true,
};

const run = {
  runId: '1-wf_a-2-3',
  workflow: 'trial',
  workflowId: 'wf_a',
  versionId: 'wfv_a',
  startedAt: '2026-08-29T10:00:00.000Z',
};

const systemPayloads: Record<keyof typeof SYSTEM_EVENTS, { valid: unknown; invalid: unknown }> = {
  'subscriber.created': {
    valid: { externalId: 'user_1', attributes: { plan: 'pro', seats: 3 } },
    invalid: { externalId: 'user_1', attributes: 'pro' },
  },
  'subscriber.updated': {
    valid: { externalId: 'user_1', attributes: {} },
    invalid: { externalId: 1, attributes: {} },
  },
  'subscriber.deleted': { valid: { externalId: 'user_1' }, invalid: { externalId: null } },
  'subscription.registered': { valid: subscription, invalid: { ...subscription, endpoint: 42 } },
  'subscription.muted': {
    valid: { ...subscription, platform: null },
    invalid: { ...subscription, channel: 7 },
  },
  'subscription.unmuted': { valid: subscription, invalid: { ...subscription, platform: 1 } },
  'subscription.removed': { valid: subscription, invalid: { externalId: 'user_1' } },
  'subscription.invalidated': {
    valid: { ...subscription, reason: 'unregistered' },
    invalid: { ...subscription, reason: 410 },
  },
  'preferences.updated': { valid: { changes: { marketing: false } }, invalid: { changes: [] } },
  identify: { valid: { attributes: { name: 'Ada' } }, invalid: {} },
  'run.started': {
    valid: { ...run, trigger: { name: 'trial.started', id: 'evt_1' } },
    invalid: { ...run, trigger: { name: 'trial.started' } },
  },
  'run.step': {
    valid: { ...run, step: 'settle', status: 'sleeping', summary: 'Sleeping for 2h' },
    invalid: { ...run, step: 'settle', status: 'sleeping' },
  },
  'run.completed': { valid: run, invalid: { ...run, startedAt: 1 } },
  'run.canceled': { valid: { ...run, reason: 'subscription.started' }, invalid: run },
  'run.failed': { valid: { ...run, error: 'Tenant is gone' }, invalid: { ...run, error: 500 } },
};

const sdkPayloads: Record<keyof typeof SDK_EVENTS, { valid: unknown; invalid: unknown }> = {
  'app.opened': { valid: {}, invalid: 'opened' },
  'app.backgrounded': { valid: {}, invalid: null },
  'session.ended': { valid: { durationSec: 12.5 }, invalid: { durationSec: '12' } },
  'notification.delivered': { valid: { messageId: 'msg_1' }, invalid: { messageId: 1 } },
  'notification.opened': { valid: { messageId: 'msg_1', action: 'view' }, invalid: { action: false } },
  'permission.changed': { valid: { status: 'granted' }, invalid: {} },
  identify: { valid: {}, invalid: { attributes: 'Ada' } },
};

function expectPayloads(
  catalog: Record<string, TSchema>,
  payloads: Record<string, { valid: unknown; invalid: unknown }>
) {
  expect(Object.keys(payloads).sort()).toEqual(Object.keys(catalog).sort());
  for (const [name, schema] of Object.entries(catalog)) {
    const check = TypeCompiler.Compile(schema);
    expect(check.Check(payloads[name]!.valid), `${name} valid`).toBe(true);
    expect(check.Check(payloads[name]!.invalid), `${name} invalid`).toBe(false);
  }
}

describe('catalog schemas', () => {
  it('accept representative system payloads and reject wrong types', () => {
    expectPayloads(SYSTEM_EVENTS, systemPayloads);
  });

  it('accept representative SDK payloads and reject wrong types', () => {
    expectPayloads(SDK_EVENTS, sdkPayloads);
  });

  it('keeps SDK identify attributes optional while the system one requires them', () => {
    expect(TypeCompiler.Compile(SDK_EVENTS.identify).Check({})).toBe(true);
    expect(TypeCompiler.Compile(SYSTEM_EVENTS.identify).Check({})).toBe(false);
  });
});
