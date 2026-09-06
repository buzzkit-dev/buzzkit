export const CONCURRENCY_MODES = ['per-event', 'one-per-subscriber'] as const;

export const TRIGGER_SOURCES = ['server', 'ios', 'android', 'web', 'system', 'webhook'] as const;

export const SEND_CHANNELS = ['push'] as const;

export const DELIVERY_MODES = ['push', 'local'] as const;

export const STEP_KINDS = [
  'wait',
  'waitUntil',
  'waitFor',
  'repeat',
  'forEach',
  'branch',
  'fetch',
  'set',
  'send',
  'exit',
] as const;

export const SINCE_ANCHORS = ['trigger', 'localMidnight', 'iteration'] as const;

export const INTERRUPTION_LEVELS = ['passive', 'active', 'timeSensitive', 'critical'] as const;

export const SEND_PRIORITIES = ['high', 'normal'] as const;

export const SEND_POLICY_MODES = ['ignore'] as const;

export const FETCH_ERROR_MODES = ['fail', 'skip', 'continue'] as const;

export const FETCH_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

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
