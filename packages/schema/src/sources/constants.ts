export const SOURCE_PROVIDERS = ['stripe', 'superwall', 'revenuecat', 'custom'] as const;

export const SOURCE_STATUSES = ['unverified', 'active', 'paused'] as const;

export const DELIVERY_OUTCOMES = ['event', 'duplicate', 'dropped', 'rejected', 'unverified'] as const;

export const DROP_REASONS = [
  'no_type',
  'unlisted_type',
  'no_subscriber',
  'filtered',
  'invalid_data',
  'paused',
] as const;

export const PASSTHROUGH = '*';

export const VERIFICATION_SCHEMES = ['stripe', 'standard-webhooks', 'header'] as const;

export const STANDARD_WEBHOOK_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature',
} as const;

export const SVIX_HEADERS = {
  id: 'svix-id',
  timestamp: 'svix-timestamp',
  signature: 'svix-signature',
} as const;

export const HEADER_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

export const MAX_MAPPED_EVENTS = 50;

export const MAX_PICKED_PATHS = 20;

export const MAX_SOURCE_NAME = 100;

export const PAYLOAD_PATH_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$-]*(?:\.[A-Za-z0-9_$-]+)*$/;

export const GENERIC_SECRET_HEADER = 'x-buzzkit-secret';

export const SIGNATURE_TOLERANCE_SECONDS = 300;
