import { describe, expect, it } from 'vitest';
import {
  detectProvider,
  evaluatePayload,
  lintSourceMapping,
  lintVerification,
  listPaths,
  mapPayload,
  readPath,
  SOURCE_PRESETS,
  suggestMapping,
} from '../../src/sources/index';

const stripeEvent = {
  id: 'evt_1',
  object: 'event',
  type: 'customer.subscription.created',
  created: 1_756_800_000,
  livemode: true,
  data: {
    object: {
      id: 'sub_1',
      customer: 'cus_9',
      status: 'active',
      currency: 'usd',
      current_period_end: 1_759_392_000,
      plan: { nickname: 'Pro monthly', amount: 1200 },
      metadata: { userId: 'user_42' },
    },
  },
};

const superwallEvent = {
  object: 'event',
  type: 'renewal',
  projectId: 3827,
  applicationId: 1,
  timestamp: 1_754_067_715_103,
  data: {
    id: '42fc6339:renewal',
    originalAppUserId: 'user_42',
    productId: 'com.example.premium.monthly',
    price: 9.99,
    currencyCode: 'USD',
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    periodType: 'NORMAL',
  },
};

describe('paths', () => {
  it('reads dotted paths with numeric indexes and lists scalar leaves', () => {
    expect(readPath(stripeEvent, 'data.object.plan.amount')).toBe(1200);
    expect(readPath({ items: [{ id: 'a' }, { id: 'b' }] }, 'items.1.id')).toBe('b');
    expect(readPath(stripeEvent, 'data.nothing.here')).toBeUndefined();
    expect(listPaths({ a: { b: 1, c: [2, 3] }, d: 'x' }).map((entry) => entry.path)).toEqual([
      'a.b',
      'a.c.0',
      'a.c.1',
      'd',
    ]);
  });
});

describe('lintSourceMapping', () => {
  it('accepts the presets', () => {
    for (const preset of Object.values(SOURCE_PRESETS)) expect(lintSourceMapping(preset.mapping)).toEqual([]);
  });

  it('names every problem with a path', () => {
    const problems = lintSourceMapping({
      id: 'not a path!',
      subscriber: { path: 'data.customer' },
      events: { 'a.b': '$reserved', '*': 'x' },
      data: { 'bad key': 'x', ok: 3 },
      where: { ref: 'livemode', eq: true, extra: 1 },
      extra: true,
    });
    const paths = problems.map((problem) => problem.path.join('.'));
    expect(paths).toContain('type');
    expect(paths).toContain('id');
    expect(paths).toContain('subscriber.attribute');
    expect(paths).toContain('events.a.b');
    expect(paths).toContain('events.*');
    expect(paths).toContain('data.bad key');
    expect(paths).toContain('data.ok');
    expect(paths).toContain('extra');
    expect(paths.some((path) => path.startsWith('where'))).toBe(true);
    expect(lintSourceMapping({ type: 'type', subscriber: 'userId', events: {} })[0]?.path).toEqual([
      'events',
    ]);
    expect(lintSourceMapping('nope')[0]?.message).toContain('object');
  });
});

describe('evaluatePayload', () => {
  it('answers ref conditions and groups over the payload', () => {
    expect(evaluatePayload({ ref: 'livemode', eq: true }, stripeEvent)).toBe(true);
    expect(evaluatePayload({ ref: 'data.object.plan.amount', gte: 1000 }, stripeEvent)).toBe(true);
    expect(evaluatePayload({ ref: 'data.object.status', in: ['trialing', 'active'] }, stripeEvent)).toBe(
      true
    );
    expect(evaluatePayload({ not: { ref: 'data.object.metadata.userId', exists: true } }, stripeEvent)).toBe(
      false
    );
    expect(
      evaluatePayload(
        {
          all: [
            { ref: 'livemode', eq: true },
            { ref: 'type', eq: 'invoice.paid' },
          ],
        },
        stripeEvent
      )
    ).toBe(false);
    expect(
      evaluatePayload(
        {
          any: [
            { ref: 'livemode', eq: false },
            { ref: 'type', eq: 'customer.subscription.created' },
          ],
        },
        stripeEvent
      )
    ).toBe(true);
  });
});

describe('mapPayload', () => {
  it('turns a Stripe event into a buzzkit event through the preset', () => {
    const outcome = mapPayload(SOURCE_PRESETS.stripe.mapping, stripeEvent);
    expect(outcome).toEqual({
      outcome: 'event',
      event: {
        name: 'subscription.started',
        providerType: 'customer.subscription.created',
        providerEventId: 'evt_1',
        subscriber: { attribute: 'stripeCustomerId', value: 'cus_9' },
        data: {
          status: 'active',
          plan: 'Pro monthly',
          amount: 1200,
          currency: 'usd',
          periodEnd: 1_759_392_000,
        },
        timestamp: '2025-09-02T08:00:00.000Z',
      },
    });
  });

  it('turns a Superwall event into a buzzkit event through the preset', () => {
    const outcome = mapPayload(SOURCE_PRESETS.superwall.mapping, superwallEvent);
    expect(outcome.outcome).toBe('event');
    if (outcome.outcome !== 'event') return;
    expect(outcome.event.name).toBe('subscription.renewed');
    expect(outcome.event.subscriber).toEqual({ externalId: 'user_42' });
    expect(outcome.event.providerEventId).toBe('42fc6339:renewal');
    expect(outcome.event.timestamp).toBe('2025-08-01T17:01:55.103Z');
    expect(outcome.event.data).toMatchObject({
      productId: 'com.example.premium.monthly',
      store: 'APP_STORE',
    });
  });

  it('drops with a reason in the order type, where, events, subscriber', () => {
    const mapping = {
      type: 'type',
      subscriber: 'user',
      events: { 'a.b': 'a.b' },
      where: { ref: 'ok', eq: true },
    };
    expect(mapPayload(mapping, {})).toMatchObject({ outcome: 'dropped', reason: 'no_type' });
    expect(mapPayload(mapping, { type: 'a.b', ok: false })).toMatchObject({
      outcome: 'dropped',
      reason: 'filtered',
    });
    expect(mapPayload(mapping, { type: 'c.d', ok: true })).toMatchObject({
      outcome: 'dropped',
      reason: 'unlisted_type',
    });
    expect(mapPayload(mapping, { type: 'a.b', ok: true })).toMatchObject({
      outcome: 'dropped',
      reason: 'no_subscriber',
    });
    expect(
      mapPayload({ ...mapping, events: { '*': true } }, { type: 'c.d', ok: true, user: 'u1' })
    ).toMatchObject({
      outcome: 'event',
      event: { name: 'c.d', subscriber: { externalId: 'u1' }, providerEventId: null, timestamp: null },
    });
  });
});

describe('detectProvider', () => {
  it('recognizes Stripe and Superwall from headers or payload shape', () => {
    expect(detectProvider({ 'stripe-signature': 't=1,v1=abc' }, {})).toBe('stripe');
    expect(detectProvider({}, stripeEvent)).toBe('stripe');
    expect(detectProvider({ 'svix-id': 'msg_1' }, superwallEvent)).toBe('superwall');
    expect(detectProvider({}, superwallEvent)).toBe('superwall');
    expect(detectProvider({}, { type: 'x', userId: 'u' })).toBeNull();
  });
});

describe('suggestMapping', () => {
  it('proposes the preset paths first for a known provider', () => {
    const suggestions = suggestMapping(stripeEvent, {}, { externalIds: ['user_42'] });
    expect(suggestions.provider).toBe('stripe');
    expect(suggestions.type[0]).toMatchObject({ path: 'type', value: 'customer.subscription.created' });
    expect(suggestions.id[0]).toMatchObject({ path: 'id' });
    expect(suggestions.timestamp[0]).toMatchObject({ path: 'created' });
    expect(suggestions.subscriber.map((entry) => entry.path)).toContain('data.object.metadata.userId');
    expect(suggestions.subscriber.find((entry) => entry.path === 'data.object.metadata.userId')?.why).toBe(
      'matches a subscriber'
    );
  });

  it('finds the shape of an unknown payload', () => {
    const suggestions = suggestMapping(
      {
        event_type: 'order.completed',
        event_id: 'ord_evt_0001',
        created_at: '2026-08-30T10:00:00Z',
        customer_id: 'c_1',
        total: 42,
      },
      {}
    );
    expect(suggestions.provider).toBeNull();
    expect(suggestions.type[0]?.path).toBe('event_type');
    expect(suggestions.id[0]?.path).toBe('event_id');
    expect(suggestions.timestamp[0]?.path).toBe('created_at');
    expect(suggestions.subscriber[0]?.path).toBe('customer_id');
    expect(suggestions.data.map((entry) => entry.path)).toContain('total');
  });
});

describe('events kept under their own name', () => {
  it('maps a type marked true to an event with the provider name, without passing others through', () => {
    const mapping = {
      type: 'type',
      subscriber: 'userId',
      events: { 'invoice.paid': true, 'invoice.payment_failed': 'payment.failed' },
    };
    expect(lintSourceMapping(mapping)).toEqual([]);
    const kept = mapPayload(mapping as never, { type: 'invoice.paid', userId: 'u1' });
    expect(kept).toMatchObject({ outcome: 'event', event: { name: 'invoice.paid' } });
    const renamed = mapPayload(mapping as never, { type: 'invoice.payment_failed', userId: 'u1' });
    expect(renamed).toMatchObject({ outcome: 'event', event: { name: 'payment.failed' } });
    const other = mapPayload(mapping as never, { type: 'charge.refunded', userId: 'u1' });
    expect(other).toMatchObject({ outcome: 'dropped', reason: 'unlisted_type' });
    const upper = mapPayload({ type: 'type', subscriber: 'userId', events: { TEST: true } } as never, {
      type: 'TEST',
      userId: 'u1',
    });
    expect(upper).toMatchObject({ outcome: 'event', event: { name: 'test', providerType: 'TEST' } });
  });
});

describe('lintVerification', () => {
  it('accepts the three schemes and rejects bad shapes with the offending path', () => {
    expect(lintVerification({ scheme: 'stripe' })).toEqual([]);
    expect(lintVerification({ scheme: 'stripe', header: 'x-revenuecat-webhook-signature' })).toEqual([]);
    expect(
      lintVerification({
        scheme: 'standard-webhooks',
        headers: { id: 'svix-id', timestamp: 'svix-timestamp', signature: 'svix-signature' },
      })
    ).toEqual([]);
    expect(lintVerification({ scheme: 'header', header: 'x-buzzkit-secret' })).toEqual([]);

    expect(lintVerification({ scheme: 'magic' })[0]?.path).toEqual(['scheme']);
    expect(lintVerification(null)[0]?.path).toEqual([]);
    expect(lintVerification({ scheme: 'header', header: 'Bad Header!' })[0]?.path).toEqual(['header']);
    expect(lintVerification({ scheme: 'standard-webhooks' })[0]?.path).toEqual(['headers']);
    expect(
      lintVerification({ scheme: 'standard-webhooks', headers: { id: 'ok', timestamp: 'ok' } })[0]?.path
    ).toEqual(['headers', 'signature']);
  });
});
