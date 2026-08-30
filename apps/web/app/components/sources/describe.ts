import {
  type DropReason,
  SOURCE_PRESETS,
  type SourceMapping,
  type Verification,
} from '@buzzkit/schema/sources';

export const DROP_REASONS: Record<DropReason, string> = {
  no_type: 'No event type in the payload',
  unlisted_type: 'Type not in the mapping',
  no_subscriber: 'No matching subscriber',
  filtered: 'Filtered out by the mapping',
  invalid_data: 'Invalid payload',
  paused: 'Source paused',
};

export function secretHint(verification: Verification, provider: string): string {
  if (verification.scheme === 'stripe') {
    return provider === 'revenuecat'
      ? 'The signing secret shown once when HMAC signing is turned on for the webhook in RevenueCat.'
      : provider === 'stripe'
        ? 'The signing secret shown for the webhook endpoint in Stripe, starting with whsec_.'
        : `The signing secret ${providerLabel(provider)} shows for the webhook.`;
  }
  if (verification.scheme === 'standard-webhooks') {
    return `The whsec_ signing secret shown for the webhook in ${providerLabel(provider)}.`;
  }
  return `A value of your choice that the sender puts in the ${verification.header} header of every request.`;
}

export function providerLabel(provider: string): string {
  return SOURCE_PRESETS[provider as keyof typeof SOURCE_PRESETS]?.label ?? provider;
}

export function verificationClause(verification: Verification): string {
  if (verification.scheme === 'stripe') return `the ${verification.header ?? 'Stripe-Signature'} header`;
  if (verification.scheme === 'standard-webhooks') return `the ${verification.headers.signature} header`;
  return `the ${verification.header} header`;
}

export function describeVerification(verification: Verification): string {
  return `Verified with ${verificationClause(verification)}`;
}

export function describeReason(reason: string | null): string {
  if (!reason) return 'Dropped';
  return DROP_REASONS[reason as DropReason] ?? reason.replace(/_/g, ' ');
}

export function describeSubscriber(subscriber: SourceMapping['subscriber']): string {
  return typeof subscriber === 'string'
    ? `${subscriber} as the external id`
    : `${subscriber.path} matched to the ${subscriber.attribute} attribute`;
}

export function mappedEventCount(mapping: SourceMapping): number | 'all' {
  return '*' in mapping.events ? 'all' : Object.keys(mapping.events).length;
}
