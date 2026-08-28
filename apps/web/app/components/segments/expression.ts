import type { IconName } from '@buzzkit/ui/components/icon';
import type { Expression } from 'buzzkit/expressions';

export type Match = 'all' | 'any';

export type Window = 'any' | '24h' | '7d' | '30d' | '90d';

type AttributeOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'exists'
  | 'missing';

export type CountComparator = 'gte' | 'eq' | 'lte' | 'gt' | 'lt';

export type Row =
  | { id: number; kind: 'attribute'; key: string; operator: AttributeOperator; value: string }
  | { id: number; kind: 'count'; event: string; comparator: CountComparator; count: string; within: Window }
  | { id: number; kind: 'never'; event: string; within: Window }
  | { id: number; kind: 'lastSeen'; direction: 'within' | 'olderThan'; within: Exclude<Window, 'any'> }
  | { id: number; kind: 'channel'; channel: 'push' | 'email' };

export type RowKind = Row['kind'];

export const KINDS: { value: RowKind; label: string; icon: IconName }[] = [
  { value: 'attribute', label: 'Attribute', icon: 'IconUserFilled' },
  { value: 'count', label: 'Did event', icon: 'IconZapFilled' },
  { value: 'never', label: 'Never did event', icon: 'IconCircleBanSignFilled' },
  { value: 'lastSeen', label: 'Activity', icon: 'IconClock' },
  { value: 'channel', label: 'Channel', icon: 'IconPhoneFilled' },
];

export const ATTRIBUTE_OPERATORS: { value: AttributeOperator; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'gt', label: 'is greater than' },
  { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is less than' },
  { value: 'lte', label: 'is at most' },
  { value: 'in', label: 'is one of' },
  { value: 'exists', label: 'is set' },
  { value: 'missing', label: 'is not set' },
];

export const COUNT_COMPARATORS: { value: CountComparator; label: string }[] = [
  { value: 'gte', label: 'at least' },
  { value: 'eq', label: 'exactly' },
  { value: 'lte', label: 'at most' },
  { value: 'gt', label: 'more than' },
  { value: 'lt', label: 'fewer than' },
];

export const WINDOWS: { value: Exclude<Window, 'any'>; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export const CHANNEL_CHOICES: { value: 'push' | 'email'; label: string; icon: IconName }[] = [
  { value: 'push', label: 'Push', icon: 'IconPhoneFilled' },
  { value: 'email', label: 'Email', icon: 'IconEmail2Filled' },
];

const ATTRIBUTE_KEY = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/;

const EVENT_NAME = /^\$?[a-z0-9][a-z0-9_.-]{0,99}$/;

const NUMBER = /^-?\d+(\.\d+)?$/;

export function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : 1));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableKey(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

let nextId = 1;

function rowId(): number {
  nextId += 1;
  return nextId;
}

export function emptyRow(kind: RowKind = 'attribute', channel: 'push' | 'email' = 'push'): Row {
  const id = rowId();
  switch (kind) {
    case 'attribute':
      return { id, kind, key: '', operator: 'eq', value: '' };
    case 'count':
      return { id, kind, event: '', comparator: 'gte', count: '1', within: '30d' };
    case 'never':
      return { id, kind, event: '', within: 'any' };
    case 'lastSeen':
      return { id, kind, direction: 'within', within: '30d' };
    case 'channel':
      return { id, kind, channel };
  }
}

function parseScalar(text: string): string | number | boolean {
  const trimmed = text.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (NUMBER.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function scalarText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return null;
  return String(value);
}

type RowProblem = 'key' | 'value' | 'event' | 'count';

export function rowProblem(row: Row): RowProblem | null {
  switch (row.kind) {
    case 'attribute': {
      if (!ATTRIBUTE_KEY.test(row.key.trim())) return 'key';
      if (row.operator === 'exists' || row.operator === 'missing') return null;
      const value = row.value.trim();
      if (value.length === 0) return 'value';
      if (['gt', 'gte', 'lt', 'lte'].includes(row.operator) && !NUMBER.test(value)) return 'value';
      return null;
    }
    case 'count':
      if (!EVENT_NAME.test(row.event.trim())) return 'event';
      if (!/^\d+$/.test(row.count.trim())) return 'count';
      return null;
    case 'never':
      return EVENT_NAME.test(row.event.trim()) ? null : 'event';
    default:
      return null;
  }
}

function rowToCondition(row: Row): Expression {
  switch (row.kind) {
    case 'attribute': {
      const ref = `attributes.${row.key.trim()}`;
      const value = row.value.trim();
      switch (row.operator) {
        case 'exists':
          return { ref, exists: true };
        case 'missing':
          return { ref, exists: false };
        case 'contains':
          return { ref, contains: value };
        case 'in':
          return {
            ref,
            in: value
              .split(',')
              .map((entry) => parseScalar(entry))
              .filter((entry) => entry !== ''),
          };
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
          return { ref, [row.operator]: Number(value) };
        default:
          return { ref, [row.operator]: parseScalar(value) };
      }
    }
    case 'count':
      return {
        count: row.event.trim(),
        ...(row.within === 'any' ? {} : { within: row.within }),
        [row.comparator]: Number(row.count.trim()),
      };
    case 'never':
      return { never: row.event.trim(), ...(row.within === 'any' ? {} : { within: row.within }) };
    case 'lastSeen':
      return { lastSeen: { [row.direction]: row.within } };
    case 'channel':
      return { channel: row.channel };
  }
}

export function rowsToExpression(match: Match, rows: Row[]): Expression | null {
  if (rows.length === 0 || rows.some((row) => rowProblem(row) !== null)) return null;
  return { [match]: rows.map(rowToCondition) } as Expression;
}

const isWindow = (value: unknown): value is Exclude<Window, 'any'> =>
  WINDOWS.some((window) => window.value === value);

function conditionToRow(node: Record<string, unknown>): Row | null {
  const id = rowId();
  const keys = Object.keys(node);
  if ('ref' in node) {
    const ref = String(node.ref);
    if (!ref.startsWith('attributes.')) return null;
    const key = ref.slice('attributes.'.length);
    const comparators = keys.filter((entry) => entry !== 'ref');
    if (comparators.length !== 1) return null;
    const operator = comparators[0]!;
    const raw = node[operator];
    if (operator === 'exists')
      return { id, kind: 'attribute', key, operator: raw ? 'exists' : 'missing', value: '' };
    if (operator === 'eq' && raw === null)
      return { id, kind: 'attribute', key, operator: 'missing', value: '' };
    if (operator === 'neq' && raw === null)
      return { id, kind: 'attribute', key, operator: 'exists', value: '' };
    if (operator === 'in') {
      if (!Array.isArray(raw)) return null;
      const values = raw.map(scalarText);
      if (values.some((entry) => entry === null)) return null;
      return { id, kind: 'attribute', key, operator: 'in', value: values.join(', ') };
    }
    if (!['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte'].includes(operator)) return null;
    const value = scalarText(raw);
    if (value === null) return null;
    return { id, kind: 'attribute', key, operator: operator as AttributeOperator, value };
  }
  if ('count' in node) {
    const comparators = keys.filter((entry) => entry !== 'count' && entry !== 'within');
    if (comparators.length !== 1) return null;
    const comparator = comparators[0] as CountComparator;
    if (!COUNT_COMPARATORS.some((entry) => entry.value === comparator)) return null;
    if (node.within !== undefined && !isWindow(node.within)) return null;
    return {
      id,
      kind: 'count',
      event: String(node.count),
      comparator,
      count: String(node[comparator]),
      within: (node.within as Window | undefined) ?? 'any',
    };
  }
  if ('never' in node) {
    if (keys.some((entry) => entry !== 'never' && entry !== 'within')) return null;
    if (node.within !== undefined && !isWindow(node.within)) return null;
    return {
      id,
      kind: 'never',
      event: String(node.never),
      within: (node.within as Window | undefined) ?? 'any',
    };
  }
  if ('lastSeen' in node) {
    const window = node.lastSeen as { within?: unknown; olderThan?: unknown };
    const direction = window.within !== undefined ? 'within' : 'olderThan';
    if (window.within !== undefined && window.olderThan !== undefined) return null;
    const value = window[direction];
    if (!isWindow(value)) return null;
    return { id, kind: 'lastSeen', direction, within: value };
  }
  if ('channel' in node) {
    if (node.channel !== 'push' && node.channel !== 'email') return null;
    return { id, kind: 'channel', channel: node.channel };
  }
  return null;
}

export function expressionToRows(expression: Expression): { match: Match; rows: Row[] } | null {
  const node = expression as Record<string, unknown>;
  const match: Match = 'any' in node ? 'any' : 'all';
  const children = 'all' in node || 'any' in node ? node[match] : [node];
  if (!Array.isArray(children) || children.length === 0) return null;
  const rows: Row[] = [];
  for (const child of children) {
    if (!child || typeof child !== 'object') return null;
    const row = conditionToRow(child as Record<string, unknown>);
    if (!row) return null;
    rows.push(row);
  }
  return { match, rows };
}
