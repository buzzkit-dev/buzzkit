export const STEP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const STEP_NAME_MAX_LENGTH = 48;

export const MAX_STEPS = 50;

export const MAX_BRANCH_DEPTH = 4;

export const MAX_WAIT_SECONDS = 365 * 86_400;

export const MAX_RESET_EVENTS = 10;

export const MAX_BRANCH_CASES = 10;

export const FALLBACK_CASE = 'else';

export const MAX_FETCH_HEADERS = 20;

export const MAX_EXPECTED_STATUSES = 20;

export const WALL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CONCURRENCY_MODES = ['per-event', 'one-per-subscriber'] as const;

export const TRIGGER_SOURCES = ['server', 'ios', 'android', 'web', 'system', 'webhook'] as const;

export const SEND_CHANNELS = ['push'] as const;

export const DELIVERY_MODES = ['push', 'local'] as const;

export const STEP_KINDS = ['wait', 'waitUntil', 'waitFor', 'branch', 'fetch', 'set', 'send', 'exit'] as const;

export const SINCE_ANCHORS = ['trigger', 'localMidnight'] as const;

export const WORKFLOW_CONDITIONS = ['ref', 'count', 'never', 'occurred', 'opened', 'delivered'] as const;

export const FETCH_ERROR_MODES = ['fail', 'skip', 'continue'] as const;

export const FETCH_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const SECRET_NAME_PATTERN = /^[a-z][A-Za-z0-9_]{0,47}$/;

export const FETCH_TIMEOUT_PATTERN = /^(\d{1,2})s$/;

export const DEFAULT_FETCH_TIMEOUT_SECONDS = 10;

export const MAX_FETCH_TIMEOUT_SECONDS = 60;

export const MAX_FETCH_RESPONSE_BYTES = 64 * 1024;

export const VAR_NAME_PATTERN = /^[a-z][A-Za-z0-9_]{0,47}$/;

export const SYSTEM_ATTRIBUTE_PREFIX = '$';

export const SEGMENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const TEMPLATE_FILTERS = [
  'default',
  'upcase',
  'downcase',
  'capitalize',
  'strip',
  'truncate',
  'append',
  'prepend',
  'replace',
  'pluralize',
  'size',
  'first',
  'last',
  'join',
  'url_encode',
  'json',
  'number',
  'round',
  'ceil',
  'floor',
  'abs',
  'plus',
  'minus',
  'times',
  'divided_by',
  'modulo',
  'at_least',
  'at_most',
  'date',
  'time',
  'until',
  'ago',
] as const;

export const DATE_STYLES = ['full', 'long', 'medium', 'short', 'weekday'] as const;

export const DURATION_STYLES = ['long', 'short'] as const;

export const NOW_PATH = 'now';

export const RESERVED_EVENT_PREFIX = '$run.';

export const SCHEDULE_TRIGGER_NAME = '$schedule';

export const SUBSCRIBER_TIMEZONE = 'subscriber';

export const DEFAULT_TIMEZONE = 'UTC';
