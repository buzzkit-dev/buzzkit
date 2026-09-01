import { resolvePath } from '@buzzkit/api/actor/evaluate';
import {
  durationMs,
  isDuration,
  NOW_PATH,
  parseTemplate,
  type TemplateFilterCall,
  type TemplateOperand,
  type TemplatePlaceholder,
} from '@buzzkit/schema/workflows';

export type TemplateOptions = { timezone?: string; locale?: string; now?: Date };

const DISTANCE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

function truthy(value: unknown): boolean {
  return !(
    value === undefined ||
    value === null ||
    value === false ||
    value === 0 ||
    value === '' ||
    Number.isNaN(value)
  );
}

function empty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 1e11 ? value * 1000 : value);
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (empty(value) || typeof value === 'boolean') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(number) ? null : number;
}

function text(value: unknown): string {
  return empty(value) ? '' : String(value);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function distance(seconds: number, style: unknown, locale: string): string {
  const unitDisplay = style === 'short' ? 'narrow' : 'long';
  for (const [unit, size] of DISTANCE_UNITS) {
    const amount = Math.round(seconds / size);
    if (amount >= 1 || unit === 'minute') {
      return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay }).format(amount);
    }
  }
  return '';
}

function formatDate(date: Date, style: unknown, part: 'date' | 'time', options: TemplateOptions): string {
  const locale = options.locale ?? 'en-US';
  const timeZone = options.timezone ?? 'UTC';
  if (style === 'weekday') return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone }).format(date);
  const chosen = (typeof style === 'string' ? style : part === 'date' ? 'long' : 'short') as
    | 'full'
    | 'long'
    | 'medium'
    | 'short';

  return new Intl.DateTimeFormat(locale, {
    ...(part === 'date' ? { dateStyle: chosen } : { timeStyle: chosen }),
    timeZone,
  }).format(date);
}

function shiftDate(date: Date, duration: string, direction: 1 | -1): string {
  return new Date(date.getTime() + direction * durationMs(duration as never)).toISOString();
}

function arithmetic(value: unknown, operand: unknown, direction: 1 | -1): unknown {
  if (isDuration(operand)) {
    const date = toDate(value);
    return date ? shiftDate(date, operand, direction) : '';
  }
  const left = toNumber(value);
  const right = toNumber(operand);
  return left === null || right === null ? '' : left + direction * right;
}

function applyFilter(
  value: unknown,
  filter: TemplateFilterCall,
  args: unknown[],
  options: TemplateOptions
): unknown {
  const locale = options.locale ?? 'en-US';
  const [first, second] = args;
  switch (filter.name) {
    case 'default':
      return empty(value) ? first : value;
    case 'upcase':
      return empty(value) ? value : String(value).toUpperCase();
    case 'downcase':
      return empty(value) ? value : String(value).toLowerCase();
    case 'capitalize': {
      const raw = text(value);
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    case 'strip':
      return text(value).trim();
    case 'truncate': {
      if (empty(value)) return value;
      const raw = String(value);
      const length = toNumber(first) ?? 0;
      if (!Number.isInteger(length) || length < 1 || raw.length <= length) return raw;

      return `${raw.slice(0, Math.max(length - 1, 1)).trimEnd()}…`;
    }
    case 'append':
      return `${text(value)}${text(first)}`;
    case 'prepend':
      return `${text(first)}${text(value)}`;
    case 'replace':
      return text(value).replaceAll(text(first), text(second));
    case 'pluralize': {
      const amount = toNumber(value);
      if (amount === null) return '';
      const singular = text(first);
      const noun = amount === 1 ? singular : second === undefined ? `${singular}s` : text(second);

      return `${new Intl.NumberFormat(locale).format(amount)} ${noun}`;
    }
    case 'size':
      if (Array.isArray(value) || typeof value === 'string') return value.length;
      if (value !== null && typeof value === 'object') return Object.keys(value).length;
      return empty(value) ? 0 : String(value).length;
    case 'first':
      return Array.isArray(value) ? value[0] : value;
    case 'last':
      return Array.isArray(value) ? value.at(-1) : value;
    case 'join':
      return Array.isArray(value)
        ? value.map(text).join(first === undefined ? ' ' : text(first))
        : text(value);
    case 'url_encode':
      return encodeURIComponent(text(value));
    case 'json':
      return JSON.stringify(value === undefined ? null : value);
    case 'number': {
      const number = toNumber(value);
      if (number === null) return '';
      const digits = toNumber(first);

      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits ?? 2,
        minimumFractionDigits: digits ?? 0,
      }).format(number);
    }
    case 'round': {
      const number = toNumber(value);
      return number === null ? '' : roundTo(number, toNumber(first) ?? 0);
    }
    case 'ceil': {
      const number = toNumber(value);
      return number === null ? '' : Math.ceil(number);
    }
    case 'floor': {
      const number = toNumber(value);
      return number === null ? '' : Math.floor(number);
    }
    case 'abs': {
      const number = toNumber(value);
      return number === null ? '' : Math.abs(number);
    }
    case 'plus':
      return arithmetic(value, first, 1);
    case 'minus':
      return arithmetic(value, first, -1);
    case 'times':
    case 'divided_by':
    case 'modulo':
    case 'at_least':
    case 'at_most': {
      const left = toNumber(value);
      const right = toNumber(first);
      if (left === null || right === null) return '';
      if (filter.name === 'times') return left * right;
      if (filter.name === 'divided_by') return right === 0 ? '' : left / right;
      if (filter.name === 'modulo') return right === 0 ? '' : left % right;
      if (filter.name === 'at_least') return Math.max(left, right);

      return Math.min(left, right);
    }
    case 'date':
    case 'time': {
      const date = toDate(value);
      return date ? formatDate(date, first, filter.name, options) : '';
    }
    case 'until':
    case 'ago': {
      const date = toDate(value);
      if (!date) return '';
      const now = options.now ?? new Date();
      const seconds =
        (filter.name === 'until' ? date.getTime() - now.getTime() : now.getTime() - date.getTime()) / 1000;

      return distance(Math.max(seconds, 0), first, locale);
    }
  }
}

function evaluate(placeholder: TemplatePlaceholder, context: unknown, options: TemplateOptions): unknown {
  const read = (operand: TemplateOperand) => {
    if (operand.kind === 'literal') return operand.value;
    if (operand.path === NOW_PATH) return (options.now ?? new Date()).toISOString();
    return resolvePath(context, operand.path);
  };
  let value: unknown;
  if (placeholder.test && placeholder.otherwise) {
    value = truthy(read(placeholder.test)) ? read(placeholder.value) : read(placeholder.otherwise);
  } else {
    value = read(placeholder.value);
  }
  for (const filter of placeholder.filters) {
    value = applyFilter(value, filter, filter.arguments.map(read), options);
  }

  return value;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function renderTemplate(template: string, context: unknown, options: TemplateOptions = {}): string {
  return parseTemplate(template)
    .map((part) =>
      part.kind === 'text' ? part.text : stringify(evaluate(part.placeholder, context, options))
    )
    .join('');
}

export function renderTemplateValue(
  template: string,
  context: unknown,
  options: TemplateOptions = {}
): unknown {
  const parts = parseTemplate(template);
  const [only] = parts;
  if (parts.length === 1 && only?.kind === 'placeholder') return evaluate(only.placeholder, context, options);
  return renderTemplate(template, context, options);
}

export function renderValue(value: unknown, scope: unknown, options: TemplateOptions): unknown {
  if (typeof value === 'string') return renderTemplateValue(value, scope, options);
  if (Array.isArray(value)) return value.map((entry) => renderValue(entry, scope, options));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, renderValue(entry, scope, options)])
    );
  }
  return value;
}

export function describeValue(value: unknown): string {
  if (typeof value === 'string') return `“${value}”`;
  return JSON.stringify(value) ?? 'nothing';
}
