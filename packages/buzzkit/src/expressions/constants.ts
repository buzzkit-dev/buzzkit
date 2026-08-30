export const DURATION_PATTERN = /^(\d{1,5})(m|h|d)$/;

export const REF_PATTERN = /^[a-z$][a-zA-Z0-9_$.-]{0,199}$/;

export const EVENT_NAME_PATTERN = /^\$?[a-z0-9][a-z0-9_.-]{0,99}$/;

export const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z0-9_$-]+$/;

export const MAX_EXPRESSION_DEPTH = 8;

export const MAX_EXPRESSION_LEAVES = 50;

export const MAX_IN_VALUES = 100;

export const CHANNELS = ['push', 'email', 'sms'] as const;

export const DURATION_UNIT_SECONDS = { m: 60, h: 3600, d: 86400 } as const;
