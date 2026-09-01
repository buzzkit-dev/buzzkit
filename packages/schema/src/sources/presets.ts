import { GENERIC_SECRET_HEADER, SVIX_HEADERS } from './constants';
import { readPath } from './paths';
import type { SourcePreset, SourceProvider } from './types';

export const SOURCE_PRESETS: Record<SourceProvider, SourcePreset> = {
  stripe: {
    provider: 'stripe',
    label: 'Stripe',
    domain: 'stripe.com',
    verification: { scheme: 'stripe' },
    mapping: {
      type: 'type',
      id: 'id',
      timestamp: 'created',
      subscriber: { path: 'data.object.customer', attribute: 'stripeCustomerId' },
      events: {
        'customer.subscription.created': 'subscription.started',
        'customer.subscription.updated': 'subscription.updated',
        'customer.subscription.deleted': 'subscription.ended',
        'customer.subscription.trial_will_end': 'trial.ending',
        'invoice.paid': 'payment.succeeded',
        'invoice.payment_failed': 'payment.failed',
      },
      data: {
        status: 'data.object.status',
        plan: 'data.object.plan.nickname',
        amount: 'data.object.plan.amount',
        currency: 'data.object.currency',
        periodEnd: 'data.object.current_period_end',
      },
      where: { ref: 'livemode', eq: true },
    },
    events: {
      'customer.subscription.created': 'A subscription was created',
      'customer.subscription.updated': 'A subscription changed',
      'customer.subscription.deleted': 'A subscription ended',
      'customer.subscription.trial_will_end': 'A trial ends in three days',
      'invoice.paid': 'An invoice was paid',
      'invoice.payment_failed': 'A payment failed',
    },
  },
  superwall: {
    provider: 'superwall',
    label: 'Superwall',
    domain: 'superwall.com',
    verification: { scheme: 'standard-webhooks', headers: SVIX_HEADERS },
    mapping: {
      type: 'type',
      id: 'data.id',
      timestamp: 'timestamp',
      subscriber: 'data.originalAppUserId',
      events: {
        initial_purchase: 'subscription.started',
        renewal: 'subscription.renewed',
        cancellation: 'subscription.canceled',
        uncancellation: 'subscription.resumed',
        expiration: 'subscription.ended',
        billing_issue: 'payment.failed',
        product_change: 'subscription.changed',
        subscription_paused: 'subscription.paused',
        non_renewing_purchase: 'purchase.completed',
      },
      data: {
        productId: 'data.productId',
        price: 'data.price',
        currency: 'data.currencyCode',
        store: 'data.store',
        periodType: 'data.periodType',
        expiresAt: 'data.expirationAt',
      },
      where: { ref: 'data.environment', eq: 'PRODUCTION' },
    },
    events: {
      initial_purchase: 'A first purchase',
      renewal: 'A renewal',
      cancellation: 'Auto-renew turned off',
      uncancellation: 'Auto-renew turned back on',
      expiration: 'A subscription expired',
      billing_issue: 'A billing problem',
      product_change: 'A plan change',
      subscription_paused: 'A subscription paused',
      non_renewing_purchase: 'A one-time purchase',
    },
  },
  revenuecat: {
    provider: 'revenuecat',
    label: 'RevenueCat',
    domain: 'revenuecat.com',
    verification: { scheme: 'stripe', header: 'x-revenuecat-webhook-signature' },
    mapping: {
      type: 'event.type',
      id: 'event.id',
      timestamp: 'event.event_timestamp_ms',
      subscriber: 'event.app_user_id',
      events: {
        INITIAL_PURCHASE: 'subscription.started',
        RENEWAL: 'subscription.renewed',
        CANCELLATION: 'subscription.canceled',
        UNCANCELLATION: 'subscription.resumed',
        EXPIRATION: 'subscription.ended',
        BILLING_ISSUE: 'payment.failed',
        PRODUCT_CHANGE: 'subscription.changed',
        SUBSCRIPTION_PAUSED: 'subscription.paused',
        NON_RENEWING_PURCHASE: 'purchase.completed',
      },
      data: {
        productId: 'event.product_id',
        price: 'event.price',
        currency: 'event.currency',
        store: 'event.store',
        periodType: 'event.period_type',
        expiresAt: 'event.expiration_at_ms',
        cancelReason: 'event.cancel_reason',
      },
      where: { ref: 'event.environment', eq: 'PRODUCTION' },
    },
    events: {
      INITIAL_PURCHASE: 'A first purchase (period_type TRIAL is a trial start)',
      RENEWAL: 'A renewal, or a lapsed subscriber returning',
      CANCELLATION: 'Auto-renew turned off, or a refund',
      UNCANCELLATION: 'Auto-renew turned back on',
      EXPIRATION: 'A subscription expired',
      BILLING_ISSUE: 'A charge attempt failed',
      PRODUCT_CHANGE: 'A plan change',
      SUBSCRIPTION_PAUSED: 'A subscription paused',
      NON_RENEWING_PURCHASE: 'A one-time purchase',
    },
  },
  custom: {
    provider: 'custom',
    label: 'Custom',
    verification: { scheme: 'header', header: GENERIC_SECRET_HEADER },
    mapping: { type: 'type', id: 'id', subscriber: 'userId', events: { '*': true } },
    events: {},
  },
};

function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
}

export function detectProvider(headers: Record<string, string>, payload: unknown): SourceProvider | null {
  if (header(headers, 'stripe-signature')) return 'stripe';
  if (header(headers, 'x-revenuecat-webhook-signature')) return 'revenuecat';
  if (
    readPath(payload, 'api_version') !== undefined &&
    readPath(payload, 'event.app_user_id') !== undefined
  ) {
    return 'revenuecat';
  }
  if (readPath(payload, 'object') === 'event' && typeof readPath(payload, 'livemode') === 'boolean')
    return 'stripe';
  if (header(headers, 'svix-id') && typeof readPath(payload, 'projectId') === 'number') return 'superwall';
  if (readPath(payload, 'object') === 'event' && readPath(payload, 'data.originalAppUserId') !== undefined) {
    return 'superwall';
  }

  return null;
}
