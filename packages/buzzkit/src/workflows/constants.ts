export const STEP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const STEP_NAME_MAX_LENGTH = 48;

export const MAX_STEPS = 50;

export const MAX_BRANCH_DEPTH = 4;

export const MAX_WAIT_SECONDS = 365 * 86_400;

export const WALL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TRIGGER_ANCHOR = 'trigger';

export const STEP_ANCHOR_PREFIX = 'steps.';

export const CONCURRENCY_MODES = ['per-event', 'one-per-subscriber'] as const;

export const TRIGGER_SOURCES = ['server', 'ios', 'android', 'web', 'system'] as const;

export const SEND_CHANNELS = ['push'] as const;

export const DELIVERY_MODES = ['push', 'local'] as const;

export const STEP_KINDS = ['wait', 'waitUntil', 'waitFor', 'branch', 'send', 'exit'] as const;

export const RESERVED_EVENT_PREFIX = '$run.';

export const SUBSCRIBER_TIMEZONE = 'subscriber';
