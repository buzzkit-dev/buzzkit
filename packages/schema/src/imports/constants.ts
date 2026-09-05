export const IMPORT_PROVIDERS = ['onesignal', 'custom'] as const;

export const IMPORT_CHANNELS = ['push', 'email', 'sms', 'web'] as const;

export const AVAILABLE_CHANNELS = ['push', 'email'] as const;

export const IMPORT_TARGETS = [
  {
    id: 'ios',
    channel: 'push',
    platform: 'ios',
    label: 'Apple device tokens',
    summary: 'Apple devices',
    available: true,
  },
  {
    id: 'android',
    channel: 'push',
    platform: 'android',
    label: 'Android device tokens',
    summary: 'Android devices',
    available: true,
  },
  {
    id: 'email',
    channel: 'email',
    platform: null,
    label: 'Email addresses',
    summary: 'Email addresses',
    available: true,
  },
  {
    id: 'sms',
    channel: 'sms',
    platform: null,
    label: 'Phone numbers',
    summary: 'Phone numbers',
    available: false,
  },
  {
    id: 'web',
    channel: 'web',
    platform: null,
    label: 'Web push subscriptions',
    summary: 'Web push subscriptions',
    available: false,
  },
] as const;

export const IMPORT_ENVIRONMENTS = ['production', 'sandbox'] as const;

export const SKIP_REASONS = [
  'no_external_id',
  'no_endpoint',
  'invalid_endpoint',
  'unsupported_target',
  'channel_not_connected',
  'unsubscribed',
] as const;

export const ANONYMOUS_POLICIES = ['skip', 'provider_id'] as const;

export const UNSUBSCRIBED_POLICIES = ['skip', 'muted'] as const;

export const MAX_IMPORT_ROWS = 1000;

export const MAX_IMPORT_EXTERNAL_ID = 256;

export const MIN_PUSH_TOKEN_LENGTH = 8;

export const MAX_PUSH_TOKEN_LENGTH = 1024;

export const TRUE_WORDS = new Set(['1', 't', 'true', 'y', 'yes']);
