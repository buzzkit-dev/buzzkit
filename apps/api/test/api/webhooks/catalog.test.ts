import { AUDIT_CATALOG, PUBLIC_EVENTS as PUBLIC_AUDIT_EVENTS } from '@buzzkit/api/api/audit/catalog';
import { SDK_EVENTS, SYSTEM_EVENTS } from '@buzzkit/api/api/events/catalog';
import {
  assertValidSubscriptions,
  isDeliverableEvent,
  PUBLIC_STREAM_EVENTS,
  PUBLIC_WEBHOOK_EVENTS,
  subscriptionMatches,
  webhookEventGroups,
} from '@buzzkit/api/api/webhooks/catalog';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { describe, expect, it } from 'vitest';

const streamNames = [...new Set([...Object.keys(SYSTEM_EVENTS), ...Object.keys(SDK_EVENTS)])].map(
  (name) => `$${name}`
);

const privateAuditNames = Object.keys(AUDIT_CATALOG).filter(
  (name) => !AUDIT_CATALOG[name as keyof typeof AUDIT_CATALOG].webhook
);

function expectInvalidSubscriptions(entries: string[], offending = entries[0]!) {
  let thrown: unknown;
  try {
    assertValidSubscriptions(entries);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, entries.join(',')).toBeInstanceOf(BadRequestError);
  const error = thrown as InstanceType<typeof BadRequestError>;
  expect(error.code).toBe('invalid_event');
  expect(error.param).toBe('events');
  expect(error.status).toBe(400);
  expect(error.message).toContain(offending);
}

function expectValidSubscriptions(entries: string[]) {
  expect(() => assertValidSubscriptions(entries), entries.join(',')).not.toThrow();
}

describe('PUBLIC_STREAM_EVENTS', () => {
  it('lists every system and SDK name once with the reserved prefix', () => {
    expect(PUBLIC_STREAM_EVENTS).toEqual(streamNames);
    expect(new Set(PUBLIC_STREAM_EVENTS).size).toBe(PUBLIC_STREAM_EVENTS.length);
    for (const name of PUBLIC_STREAM_EVENTS) expect(name, name).toMatch(/^\$[a-z]+(\.[a-z_]+)*$/);
  });

  it('carries identify exactly once even though both catalogs define it', () => {
    expect(PUBLIC_STREAM_EVENTS.filter((name) => name === '$identify')).toHaveLength(1);
    expect(Object.keys(SYSTEM_EVENTS)).toContain('identify');
    expect(Object.keys(SDK_EVENTS)).toContain('identify');
  });

  it('includes every system and SDK name', () => {
    for (const name of Object.keys(SYSTEM_EVENTS)) expect(PUBLIC_STREAM_EVENTS).toContain(`$${name}`);
    for (const name of Object.keys(SDK_EVENTS)) expect(PUBLIC_STREAM_EVENTS).toContain(`$${name}`);
    expect(PUBLIC_STREAM_EVENTS).toContain('$subscriber.created');
    expect(PUBLIC_STREAM_EVENTS).toContain('$subscription.registered');
    expect(PUBLIC_STREAM_EVENTS).toContain('$app.opened');
    expect(PUBLIC_STREAM_EVENTS).toContain('$notification.opened');
  });
});

describe('PUBLIC_WEBHOOK_EVENTS', () => {
  it('is the public audit names followed by the stream names', () => {
    expect(PUBLIC_WEBHOOK_EVENTS).toEqual([...PUBLIC_AUDIT_EVENTS, ...PUBLIC_STREAM_EVENTS]);
    expect(new Set(PUBLIC_WEBHOOK_EVENTS).size).toBe(PUBLIC_WEBHOOK_EVENTS.length);
  });

  it('holds only audit names flagged for webhooks', () => {
    for (const name of PUBLIC_AUDIT_EVENTS) {
      expect(AUDIT_CATALOG[name].webhook, name).toBe(true);
    }
    for (const name of privateAuditNames) {
      expect(PUBLIC_WEBHOOK_EVENTS, name).not.toContain(name);
    }
    expect(privateAuditNames).toContain('key.created');
    expect(privateAuditNames).toContain('webhook.created');
    expect(privateAuditNames).toContain('profile.updated');
    expect(privateAuditNames).toContain('workspace.created');
    expect(privateAuditNames).toContain('invite.resent');
  });

  it('holds the audit names that are flagged public', () => {
    for (const name of ['tenant.created', 'tenant.updated', 'message.completed', 'credential.revoked']) {
      expect(PUBLIC_WEBHOOK_EVENTS).toContain(name);
    }
  });
});

describe('isDeliverableEvent', () => {
  it('accepts every public webhook name', () => {
    for (const name of PUBLIC_WEBHOOK_EVENTS) expect(isDeliverableEvent(name), name).toBe(true);
  });

  it('accepts reserved names only from the catalog', () => {
    expect(isDeliverableEvent('$app.opened')).toBe(true);
    expect(isDeliverableEvent('$identify')).toBe(true);
    expect(isDeliverableEvent('$subscription.invalidated')).toBe(true);
    expect(isDeliverableEvent('$nope')).toBe(false);
    expect(isDeliverableEvent('$nope.happened')).toBe(false);
    expect(isDeliverableEvent('$')).toBe(false);
    expect(isDeliverableEvent('$App.opened')).toBe(false);
    expect(isDeliverableEvent('$toString')).toBe(false);
  });

  it('rejects private audit names even though they look like custom names', () => {
    for (const name of privateAuditNames) expect(isDeliverableEvent(name), name).toBe(false);
    expect(isDeliverableEvent('key.created')).toBe(false);
    expect(isDeliverableEvent('webhook.disabled')).toBe(false);
    expect(isDeliverableEvent('profile.updated')).toBe(false);
    expect(isDeliverableEvent('workspace.created')).toBe(false);
  });

  it('accepts custom names that match the naming pattern', () => {
    expect(isDeliverableEvent('order.completed')).toBe(true);
    expect(isDeliverableEvent('signup')).toBe(true);
    expect(isDeliverableEvent('a')).toBe(true);
    expect(isDeliverableEvent('0')).toBe(true);
    expect(isDeliverableEvent('order-v2_paid.now')).toBe(true);
    expect(isDeliverableEvent('a'.repeat(100))).toBe(true);
  });

  it('rejects names outside the naming pattern', () => {
    expect(isDeliverableEvent('')).toBe(false);
    expect(isDeliverableEvent('Order.Completed')).toBe(false);
    expect(isDeliverableEvent('ORDER')).toBe(false);
    expect(isDeliverableEvent('order completed')).toBe(false);
    expect(isDeliverableEvent(' order.completed')).toBe(false);
    expect(isDeliverableEvent('order.completed ')).toBe(false);
    expect(isDeliverableEvent('.order')).toBe(false);
    expect(isDeliverableEvent('_order')).toBe(false);
    expect(isDeliverableEvent('-order')).toBe(false);
    expect(isDeliverableEvent('order/completed')).toBe(false);
    expect(isDeliverableEvent('order:completed')).toBe(false);
    expect(isDeliverableEvent('order*')).toBe(false);
    expect(isDeliverableEvent('*')).toBe(false);
    expect(isDeliverableEvent('ordér')).toBe(false);
    expect(isDeliverableEvent('a'.repeat(101))).toBe(false);
  });
});

describe('subscriptionMatches', () => {
  it('matches everything when nothing is subscribed', () => {
    expect(subscriptionMatches([], 'tenant.created')).toBe(true);
    expect(subscriptionMatches([], '$app.opened')).toBe(true);
    expect(subscriptionMatches([], 'order.completed')).toBe(true);
    expect(subscriptionMatches([], '')).toBe(true);
  });

  it('matches everything with the star', () => {
    expect(subscriptionMatches(['*'], 'tenant.created')).toBe(true);
    expect(subscriptionMatches(['*'], '$subscription.registered')).toBe(true);
    expect(subscriptionMatches(['*'], 'anything')).toBe(true);
    expect(subscriptionMatches(['order.completed', '*'], 'tenant.created')).toBe(true);
  });

  it('matches exact names case-sensitively', () => {
    expect(subscriptionMatches(['tenant.created'], 'tenant.created')).toBe(true);
    expect(subscriptionMatches(['tenant.created'], 'tenant.updated')).toBe(false);
    expect(subscriptionMatches(['Tenant.created'], 'tenant.created')).toBe(false);
    expect(subscriptionMatches(['tenant.created'], 'Tenant.created')).toBe(false);
    expect(subscriptionMatches(['$identify'], '$identify')).toBe(true);
    expect(subscriptionMatches(['identify'], '$identify')).toBe(false);
  });

  it('matches resource wildcards on the dot boundary only', () => {
    expect(subscriptionMatches(['tenant.*'], 'tenant.created')).toBe(true);
    expect(subscriptionMatches(['tenant.*'], 'tenant.identity_secret_rotated')).toBe(true);
    expect(subscriptionMatches(['tenant.*'], 'tenants.x')).toBe(false);
    expect(subscriptionMatches(['tenant.*'], 'tenant')).toBe(false);
    expect(subscriptionMatches(['tenant.*'], 'tenant_x.created')).toBe(false);
    expect(subscriptionMatches(['ten.*'], 'tenant.created')).toBe(false);
    expect(subscriptionMatches(['tenant*'], 'tenant.created')).toBe(false);
    expect(subscriptionMatches(['tenant.'], 'tenant.created')).toBe(false);
    expect(subscriptionMatches(['tenant.*'], 'topic.created')).toBe(false);
  });

  it('matches reserved wildcards', () => {
    expect(subscriptionMatches(['$subscription.*'], '$subscription.registered')).toBe(true);
    expect(subscriptionMatches(['$subscription.*'], '$subscription.invalidated')).toBe(true);
    expect(subscriptionMatches(['$subscription.*'], '$subscriber.created')).toBe(false);
    expect(subscriptionMatches(['$subscription.*'], 'subscription.registered')).toBe(false);
    expect(subscriptionMatches(['subscription.*'], '$subscription.registered')).toBe(false);
  });

  it('matches custom wildcards at any depth below the prefix', () => {
    expect(subscriptionMatches(['order.*'], 'order.completed')).toBe(true);
    expect(subscriptionMatches(['order.*'], 'order.items.added')).toBe(true);
    expect(subscriptionMatches(['order.items.*'], 'order.items.added')).toBe(true);
    expect(subscriptionMatches(['order.items.*'], 'order.completed')).toBe(false);
    expect(subscriptionMatches(['order.*'], 'orders.completed')).toBe(false);
    expect(subscriptionMatches(['order.*'], 'order')).toBe(false);
  });

  it('matches when any entry matches', () => {
    const subscribed = ['tenant.created', 'order.*', '$app.opened'];
    expect(subscriptionMatches(subscribed, 'tenant.created')).toBe(true);
    expect(subscriptionMatches(subscribed, 'order.paid')).toBe(true);
    expect(subscriptionMatches(subscribed, '$app.opened')).toBe(true);
    expect(subscriptionMatches(subscribed, 'tenant.updated')).toBe(false);
    expect(subscriptionMatches(subscribed, '$app.backgrounded')).toBe(false);
  });
});

describe('assertValidSubscriptions', () => {
  it('accepts an empty list', () => {
    expectValidSubscriptions([]);
  });

  it('accepts the star', () => {
    expectValidSubscriptions(['*']);
  });

  it('accepts every public name', () => {
    for (const name of PUBLIC_WEBHOOK_EVENTS) expectValidSubscriptions([name]);
    expectValidSubscriptions([...PUBLIC_WEBHOOK_EVENTS]);
  });

  it('accepts wildcards over public resources', () => {
    expectValidSubscriptions(['tenant.*']);
    expectValidSubscriptions(['message.*']);
    expectValidSubscriptions(['$subscription.*']);
    expectValidSubscriptions(['$subscriber.*']);
    expectValidSubscriptions(['$app.*']);
    expectValidSubscriptions(['$notification.*']);
  });

  it('accepts custom names and custom wildcards', () => {
    expectValidSubscriptions(['order.completed']);
    expectValidSubscriptions(['order.*']);
    expectValidSubscriptions(['signup']);
    expectValidSubscriptions(['order.items.*']);
    expectValidSubscriptions(['a'.repeat(100)]);
  });

  it('accepts a mixed list', () => {
    expectValidSubscriptions([
      '*',
      'tenant.created',
      'tenant.*',
      '$subscription.*',
      'order.completed',
      'order.*',
    ]);
  });

  it('rejects unknown reserved names and wildcards', () => {
    expectInvalidSubscriptions(['$nope.*']);
    expectInvalidSubscriptions(['$nope']);
    expectInvalidSubscriptions(['$']);
    expectInvalidSubscriptions(['$.*']);
    expectInvalidSubscriptions(['$app.closed']);
    expectInvalidSubscriptions(['$App.opened']);
  });

  it('rejects private audit names', () => {
    for (const name of privateAuditNames) expectInvalidSubscriptions([name]);
    expectInvalidSubscriptions(['key.created']);
    expectInvalidSubscriptions(['webhook.secret_rotated']);
    expectInvalidSubscriptions(['tenant.created', 'profile.updated'], 'profile.updated');
  });

  it('rejects wildcards that only cover private audit names', () => {
    expectInvalidSubscriptions(['key.*']);
    expectInvalidSubscriptions(['webhook.*']);
    expectInvalidSubscriptions(['profile.*']);
    expectInvalidSubscriptions(['order.*', 'key.*'], 'key.*');
  });

  it('accepts wildcards over resources that have at least one public name', () => {
    expectValidSubscriptions(['workspace.*']);
    expectValidSubscriptions(['invite.*']);
    expect(privateAuditNames).toContain('workspace.created');
    expect(privateAuditNames).toContain('invite.resent');
  });

  it('accepts custom wildcards that merely share a prefix with a private resource', () => {
    expectValidSubscriptions(['keys.*']);
    expectValidSubscriptions(['key-vault.*']);
    expectValidSubscriptions(['webhooks.*']);
    expectValidSubscriptions(['ke.*']);
  });

  it('rejects names outside the naming pattern', () => {
    expectInvalidSubscriptions(['Order.Completed']);
    expectInvalidSubscriptions(['order completed']);
    expectInvalidSubscriptions(['']);
    expectInvalidSubscriptions(['*.*']);
    expectInvalidSubscriptions(['.*']);
    expectInvalidSubscriptions(['**']);
    expectInvalidSubscriptions(['order.**']);
    expectInvalidSubscriptions(['order.*.completed']);
    expectInvalidSubscriptions(['Order.*']);
    expectInvalidSubscriptions(['a'.repeat(101)]);
    expectInvalidSubscriptions([`${'a'.repeat(101)}.*`]);
  });

  it('reports the first offending entry of a mixed list', () => {
    expectInvalidSubscriptions(['tenant.created', '$nope', 'order.*'], '$nope');
    expectInvalidSubscriptions(['*', 'Order.Completed'], 'Order.Completed');
  });
});

describe('webhookEventGroups', () => {
  const groups = webhookEventGroups();

  it('covers every public name exactly once', () => {
    const flat = groups.flatMap((group) => group.options);
    expect([...flat].sort()).toEqual([...PUBLIC_WEBHOOK_EVENTS].sort());
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('creates one group per resource, keyed on the segment before the first dot', () => {
    const resources = [...new Set(PUBLIC_WEBHOOK_EVENTS.map((name) => name.split('.')[0]))];
    expect(groups.map((group) => group.label)).toEqual(
      resources.map((resource) => resource.replace(/^\$/, ''))
    );
    expect(new Set(groups.map((group) => group.label)).size).toBe(groups.length);
  });

  it('offers a wildcard only for dotted groups', () => {
    for (const group of groups) {
      const dotted = group.options.some((option) => option.includes('.'));
      if (dotted) {
        expect(group.wildcard, group.label).toMatch(/^\$?[a-z_]+\.\*$/);
      } else {
        expect(group, group.label).not.toHaveProperty('wildcard');
      }
    }
  });

  it('strips the reserved prefix from labels but keeps it in wildcards and options', () => {
    for (const group of groups) {
      expect(group.label, group.label).not.toContain('$');
      const reserved = group.options[0]!.startsWith('$');
      if (group.wildcard !== undefined) {
        expect(group.wildcard.startsWith('$'), group.label).toBe(reserved);
        expect(group.wildcard.replace(/^\$/, ''), group.label).toBe(`${group.label}.*`);
      }
      for (const option of group.options) {
        expect(option, group.label).toMatch(new RegExp(`^\\$?${group.label}(\\.|$)`));
        expect(option.startsWith('$'), option).toBe(reserved);
      }
    }
  });

  it('groups the audit resources', () => {
    const tenant = groups.find((group) => group.label === 'tenant');
    expect(tenant).toEqual({
      label: 'tenant',
      wildcard: 'tenant.*',
      options: PUBLIC_AUDIT_EVENTS.filter((name) => name.startsWith('tenant.')),
    });
    const workspace = groups.find((group) => group.label === 'workspace');
    expect(workspace?.options).toEqual(['workspace.updated', 'workspace.deleted']);
  });

  it('groups the stream resources', () => {
    expect(groups.find((group) => group.label === 'subscription')).toEqual({
      label: 'subscription',
      wildcard: '$subscription.*',
      options: [
        '$subscription.registered',
        '$subscription.muted',
        '$subscription.unmuted',
        '$subscription.removed',
        '$subscription.invalidated',
      ],
    });
    expect(groups.find((group) => group.label === 'app')).toEqual({
      label: 'app',
      wildcard: '$app.*',
      options: ['$app.installed', '$app.updated', '$app.opened', '$app.backgrounded'],
    });
  });

  it('puts identify, which has no dot, in a group of its own without a wildcard', () => {
    const identify = groups.find((group) => group.label === 'identify');
    expect(identify).toEqual({ label: 'identify', options: ['$identify'] });
    expect(identify).not.toHaveProperty('wildcard');
    expect(Object.keys(identify!)).toEqual(['label', 'options']);
  });

  it('has no group for private audit resources', () => {
    for (const label of ['key', 'profile', 'webhook']) {
      expect(
        groups.find((group) => group.label === label),
        label
      ).toBeUndefined();
    }
  });

  it('offers wildcards the API accepts and that match every option of the group', () => {
    const wildcards = groups.flatMap((group) => (group.wildcard === undefined ? [] : [group.wildcard]));
    expect(wildcards.length).toBe(groups.length - 1);
    expectValidSubscriptions(wildcards);
    for (const group of groups) {
      if (group.wildcard === undefined) continue;
      expectValidSubscriptions([group.wildcard]);
      for (const option of group.options) {
        expect(subscriptionMatches([group.wildcard], option), option).toBe(true);
      }
      for (const other of groups) {
        if (other === group) continue;
        for (const option of other.options) {
          expect(subscriptionMatches([group.wildcard], option), `${group.wildcard} × ${option}`).toBe(false);
        }
      }
    }
  });

  it('lets every option be subscribed to on its own', () => {
    for (const group of groups) expectValidSubscriptions(group.options);
  });

  it('returns a fresh array on every call', () => {
    expect(webhookEventGroups()).toEqual(groups);
    expect(webhookEventGroups()).not.toBe(groups);
  });
});
