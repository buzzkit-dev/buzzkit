import type { Expression } from 'buzzkit/expressions';

export const WINDOWS: { value: '24h' | '7d' | '30d' | '90d'; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function windowLabel(value: unknown): string {
  const known = WINDOWS.find((window) => window.value === value);
  if (known) return known.label;
  const match = /^(\d+)([mhd])$/.exec(String(value));
  if (!match) return String(value);
  const amount = Number(match[1]);
  const unit = { m: 'minute', h: 'hour', d: 'day' }[match[2] as 'm' | 'h' | 'd'];
  return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const SINCE_LABELS: Record<string, string> = {
  trigger: 'since the run started',
  localMidnight: 'since midnight',
};

function sinceLabel(value: unknown): string {
  return SINCE_LABELS[String(value)] ?? `since ${String(value)}`;
}

function windowOf(record: Record<string, unknown>, prefix: string): string {
  if (record.within !== undefined) return ` ${prefix} ${windowLabel(record.within)}`;
  if (record.since !== undefined) return ` ${sinceLabel(record.since)}`;
  return '';
}

export function describeCondition(node: Expression): string {
  const record = node as Record<string, unknown>;
  if ('all' in record) return `(${(record.all as Expression[]).map(describeCondition).join(' and ')})`;
  if ('any' in record) return `(${(record.any as Expression[]).map(describeCondition).join(' or ')})`;
  if ('not' in record) return `not ${describeCondition(record.not as Expression)}`;
  if ('ref' in record) {
    const ref = String(record.ref);
    const name = ref === 'externalId' ? 'external id' : ref.slice('attributes.'.length);
    const parts: string[] = [];
    if (record.exists !== undefined) parts.push(record.exists ? `${name} is set` : `${name} is not set`);
    if (record.eq !== undefined)
      parts.push(record.eq === null ? `${name} is not set` : `${name} is ${scalar(record.eq)}`);
    if (record.neq !== undefined)
      parts.push(record.neq === null ? `${name} is set` : `${name} is not ${scalar(record.neq)}`);
    if (record.gt !== undefined) parts.push(`${name} > ${scalar(record.gt)}`);
    if (record.gte !== undefined) parts.push(`${name} ≥ ${scalar(record.gte)}`);
    if (record.lt !== undefined) parts.push(`${name} < ${scalar(record.lt)}`);
    if (record.lte !== undefined) parts.push(`${name} ≤ ${scalar(record.lte)}`);
    if (record.in !== undefined)
      parts.push(`${name} is one of ${(record.in as unknown[]).map(scalar).join(', ')}`);
    if (record.contains !== undefined) parts.push(`${name} contains ${scalar(record.contains)}`);
    return parts.join(' and ');
  }
  if ('count' in record) {
    const window = windowOf(record, 'in the last');
    const amount = (comparator: string, value: unknown) => {
      const times = `${scalar(value)}×`;
      return (
        {
          gte: `at least ${times}`,
          eq: `exactly ${times}`,
          lte: `at most ${times}`,
          gt: `more than ${times}`,
          lt: `fewer than ${times}`,
        }[comparator] ?? times
      );
    };
    const comparators = ['gte', 'eq', 'lte', 'gt', 'lt'].filter((key) => record[key] !== undefined);
    return `${record.count} ${comparators.map((key) => amount(key, record[key])).join(', ')}${window}`;
  }
  if ('never' in record) {
    const window = record.within === undefined ? ' ever' : ` in the last ${windowLabel(record.within)}`;
    return `never ${record.never}${window}`;
  }
  if ('occurred' in record) return `${record.occurred} at least once${windowOf(record, 'in the last')}`;
  if ('opened' in record) return `opened the message from ${record.opened}`;
  if ('delivered' in record) return `received the message from ${record.delivered}`;
  if ('lastSeen' in record) {
    const window = record.lastSeen as { within?: unknown; olderThan?: unknown };
    const parts: string[] = [];
    if (window.within !== undefined) parts.push(`active in the last ${windowLabel(window.within)}`);
    if (window.olderThan !== undefined) parts.push(`not active in the last ${windowLabel(window.olderThan)}`);
    return parts.join(' and ');
  }
  return `can receive ${String(record.channel)}`;
}

export type ConditionKind = 'attribute' | 'event' | 'activity' | 'channel' | 'trigger' | 'source' | 'step';

export type ConditionPart = { kind: ConditionKind; subject: string; operator: string; value: string };

const NEGATED_OPERATORS: Record<string, string> = {
  is: 'is not',
  'is not': 'is',
  'is one of': 'is not one of',
  contains: 'does not contain',
  'is greater than': 'is at most',
  'is at least': 'is less than',
  'is less than': 'is at least',
  'is at most': 'is greater than',
  'at least': 'fewer than',
  'fewer than': 'at least',
  'more than': 'at most',
  'at most': 'more than',
  exactly: 'not exactly',
  'in the last': 'not in the last',
  'not in the last': 'in the last',
  'not in': 'in',
  'can receive': 'cannot receive',
  was: 'was not',
  'was not': 'was',
};

export function negate(part: ConditionPart): ConditionPart {
  if (part.operator === '' && part.value === 'never') return { ...part, operator: 'at least', value: '1×' };
  if (part.kind === 'channel') return { ...part, subject: 'cannot receive' };
  const negated = NEGATED_OPERATORS[part.operator];
  return negated ? { ...part, operator: negated } : { ...part, operator: `not ${part.operator}`.trim() };
}

export type ConditionTree =
  | { kind: 'leaf'; part: ConditionPart }
  | { kind: 'group'; match: 'all' | 'any'; children: ConditionTree[] };

const COUNT_WORDS: Record<string, string> = {
  gte: 'at least',
  eq: 'exactly',
  lte: 'at most',
  gt: 'more than',
  lt: 'fewer than',
};

export const REF_WORDS: Record<string, string> = {
  eq: 'is',
  neq: 'is not',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is one of',
  contains: 'contains',
};

export function refPart(
  kind: ConditionKind,
  subject: string,
  record: Record<string, unknown>
): ConditionPart {
  if (record.exists !== undefined) {
    return { kind, subject, operator: 'is', value: record.exists ? 'set' : 'not set' };
  }
  if (record.eq === null) return { kind, subject, operator: 'is', value: 'not set' };
  if (record.neq === null) return { kind, subject, operator: 'is', value: 'set' };
  const comparators = Object.keys(REF_WORDS).filter((key) => record[key] !== undefined);
  return {
    kind,
    subject,
    operator: comparators.map((key) => REF_WORDS[key]).join(' and '),
    value: comparators
      .map((key) => (key === 'in' ? (record.in as unknown[]).map(scalar).join(', ') : scalar(record[key])))
      .join(' and '),
  };
}

export function conditionPart(node: Expression): ConditionPart {
  const record = node as Record<string, unknown>;
  if ('not' in record) return negate(conditionPart(record.not as Expression));
  if ('ref' in record) {
    const ref = String(record.ref);
    return refPart(
      'attribute',
      ref === 'externalId' ? 'external id' : ref.slice('attributes.'.length),
      record
    );
  }
  if ('count' in record) {
    const comparators = Object.keys(COUNT_WORDS).filter((key) => record[key] !== undefined);
    const window = windowOf(record, 'in');
    return {
      kind: 'event',
      subject: String(record.count),
      operator: comparators.map((key) => COUNT_WORDS[key]).join(', '),
      value: `${comparators.map((key) => `${scalar(record[key])}×`).join(', ')}${window}`,
    };
  }
  if ('never' in record) {
    return {
      kind: 'event',
      subject: String(record.never),
      operator: record.within === undefined ? '' : 'not in',
      value: record.within === undefined ? 'never' : windowLabel(record.within),
    };
  }
  if ('occurred' in record) {
    return {
      kind: 'event',
      subject: String(record.occurred),
      operator: 'at least',
      value: `1×${windowOf(record, 'in')}`,
    };
  }
  if ('opened' in record) {
    return { kind: 'step', subject: String(record.opened), operator: 'was', value: 'opened' };
  }
  if ('delivered' in record) {
    return { kind: 'step', subject: String(record.delivered), operator: 'was', value: 'delivered' };
  }
  if ('lastSeen' in record) {
    const window = record.lastSeen as { within?: unknown; olderThan?: unknown };
    const operators: string[] = [];
    const values: string[] = [];
    if (window.within !== undefined) {
      operators.push('in the last');
      values.push(windowLabel(window.within));
    }
    if (window.olderThan !== undefined) {
      operators.push('not in the last');
      values.push(windowLabel(window.olderThan));
    }
    return {
      kind: 'activity',
      subject: 'active',
      operator: operators.join(' and '),
      value: values.join(' and '),
    };
  }
  return { kind: 'channel', subject: 'can receive', operator: '', value: String(record.channel) };
}

export function conditionTree(node: Expression): ConditionTree {
  const record = node as Record<string, unknown>;
  if ('all' in record)
    return { kind: 'group', match: 'all', children: (record.all as Expression[]).map(conditionTree) };
  if ('any' in record)
    return { kind: 'group', match: 'any', children: (record.any as Expression[]).map(conditionTree) };
  return { kind: 'leaf', part: conditionPart(node) };
}

export type ConditionLeaf = { part: ConditionPart; joiner: 'and' | 'or' | null };

export function conditionLeaves(tree: ConditionTree, joiner: 'and' | 'or' | null = null): ConditionLeaf[] {
  if (tree.kind === 'leaf') return [{ part: tree.part, joiner }];
  const word = tree.match === 'all' ? 'and' : 'or';
  return tree.children.flatMap((child, index) => conditionLeaves(child, index === 0 ? joiner : word));
}

export function describeExpression(expression: Expression): string[] {
  const record = expression as Record<string, unknown>;
  if ('all' in record) return (record.all as Expression[]).map(describeCondition);
  if ('any' in record) return (record.any as Expression[]).map(describeCondition);
  return [describeCondition(expression)];
}
