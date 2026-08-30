import {
  ATTRIBUTE_KEY_PATTERN,
  CHANNELS,
  DURATION_PATTERN,
  EVENT_NAME_PATTERN,
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_LEAVES,
  MAX_IN_VALUES,
  REF_PATTERN,
} from './constants';

export type ExpressionPath = Array<string | number>;

export type ExpressionIssue = { path: ExpressionPath; message: string };

export type RefScope = { roots: readonly string[]; bare: readonly string[]; label: string };

export type LintTools = {
  report: (path: ExpressionPath, message: string) => void;
  checkUnknownKeys: (
    path: ExpressionPath,
    node: Record<string, unknown>,
    allowed: readonly string[],
    label: string
  ) => void;
  checkEventName: (path: ExpressionPath, key: string, raw: unknown) => void;
  checkDuration: (path: ExpressionPath, raw: unknown) => void;
  describe: (value: unknown) => string;
  list: (items: readonly string[]) => string;
};

export type ConditionChecker = (
  path: ExpressionPath,
  node: Record<string, unknown>,
  tools: LintTools
) => void;

export type LintOptions = {
  refs?: RefScope;
  kinds?: readonly string[];
  checkers?: Record<string, ConditionChecker>;
};

export const SEGMENT_REFS: RefScope = { roots: ['attributes'], bare: ['externalId'], label: 'a segment' };

export const SEGMENT_CONDITIONS = ['ref', 'count', 'never', 'lastSeen', 'channel'] as const;

const GROUP_KEYS = ['all', 'any', 'not'] as const;

const REF_COMPARATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists'] as const;

export const COUNT_COMPARATORS = ['eq', 'gt', 'gte', 'lt', 'lte'] as const;

const ORDERED = ['gt', 'gte', 'lt', 'lte'] as const;

export function formatExpressionPath(path: ExpressionPath): string {
  if (path.length === 0) return 'the expression';
  return path.reduce<string>(
    (text, part) => (typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : part),
    ''
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

export function list(items: readonly string[]): string {
  return items.map((item) => `"${item}"`).join(', ');
}

export function lintExpression(value: unknown, options: LintOptions = {}): ExpressionIssue[] {
  const issues: ExpressionIssue[] = [];
  const refs = options.refs ?? SEGMENT_REFS;
  const checkers = options.checkers ?? {};
  const kinds = options.kinds ?? [...SEGMENT_CONDITIONS, ...Object.keys(checkers)];
  const known = [...new Set<string>([...SEGMENT_CONDITIONS, ...Object.keys(checkers)])];
  let leaves = 0;
  const report = (path: ExpressionPath, message: string) => issues.push({ path, message });

  const checkDuration = (path: ExpressionPath, raw: unknown) => {
    if (typeof raw !== 'string' || !DURATION_PATTERN.test(raw)) {
      report(
        path,
        `${describe(raw)} is not a duration. Use a number followed by m, h or d, such as "15m", "12h" or "30d".`
      );
    }
  };

  const checkUnknownKeys = (
    path: ExpressionPath,
    node: Record<string, unknown>,
    allowed: readonly string[],
    label: string
  ) => {
    for (const key of Object.keys(node)) {
      if (!allowed.includes(key)) {
        report([...path, key], `"${key}" is not a key of ${label}. Allowed keys: ${list(allowed)}.`);
      }
    }
  };

  const refShapes = [
    ...refs.roots.map((root) => `"${root}.<key>"`),
    ...refs.bare.map((bare) => `"${bare}"`),
  ].join(' or ');

  const checkRef = (path: ExpressionPath, node: Record<string, unknown>) => {
    const ref = node.ref;
    if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) {
      report([...path, 'ref'], `"ref" must be ${refShapes}, got ${describe(ref)}.`);
    } else if (!refs.bare.includes(ref)) {
      const [root, ...keys] = ref.split('.');
      if (!root || !refs.roots.includes(root)) {
        report([...path, 'ref'], `"${ref}" is not something ${refs.label} can read. Use ${refShapes}.`);
      } else if (keys.length === 0) {
        report([...path, 'ref'], `"${ref}" needs a key after it, such as "${root}.<key>".`);
      } else if (!keys.every((key) => ATTRIBUTE_KEY_PATTERN.test(key))) {
        report(
          [...path, 'ref'],
          `"${ref}" is not a valid path. Keys may contain letters, digits, _, $ and -.`
        );
      }
    }
    checkUnknownKeys(path, node, ['ref', ...REF_COMPARATORS], 'an attribute condition');
    const comparators = REF_COMPARATORS.filter((key) => node[key] !== undefined);
    if (comparators.length === 0) {
      report(path, `An attribute condition needs a comparison: one of ${list(REF_COMPARATORS)}.`);
    }
    for (const key of ['eq', 'neq'] as const) {
      if (node[key] !== undefined && !isScalar(node[key])) {
        report(
          [...path, key],
          `"${key}" takes a string, number, boolean or null, got ${describe(node[key])}.`
        );
      }
    }
    for (const key of ORDERED) {
      const raw = node[key];
      if (raw !== undefined && typeof raw !== 'number' && typeof raw !== 'string') {
        report(
          [...path, key],
          `"${key}" takes a number (or a string to compare alphabetically), got ${describe(raw)}.`
        );
      }
    }
    if (node.in !== undefined) {
      if (!Array.isArray(node.in)) {
        report([...path, 'in'], `"in" takes a list of values, got ${describe(node.in)}.`);
      } else if (node.in.length === 0) {
        report([...path, 'in'], '"in" needs at least one value.');
      } else if (node.in.length > MAX_IN_VALUES) {
        report([...path, 'in'], `"in" takes at most ${MAX_IN_VALUES} values, got ${node.in.length}.`);
      } else {
        node.in.forEach((entry, index) => {
          if (!isScalar(entry)) {
            report(
              [...path, 'in', index],
              `Values in "in" must be strings, numbers, booleans or null, got ${describe(entry)}.`
            );
          }
        });
      }
    }
    if (node.contains !== undefined) {
      if (typeof node.contains !== 'string' || node.contains.length === 0) {
        report([...path, 'contains'], `"contains" takes a non-empty string, got ${describe(node.contains)}.`);
      } else if (node.contains.length > 200) {
        report([...path, 'contains'], '"contains" takes at most 200 characters.');
      }
    }
    if (node.exists !== undefined && typeof node.exists !== 'boolean') {
      report([...path, 'exists'], `"exists" takes true or false, got ${describe(node.exists)}.`);
    }
  };

  const checkEventName = (path: ExpressionPath, key: string, raw: unknown) => {
    if (typeof raw !== 'string' || !EVENT_NAME_PATTERN.test(raw)) {
      report(
        [...path, key],
        `"${key}" must be an event name such as "order.completed" (lowercase letters, digits, dots, underscores and dashes), got ${describe(raw)}.`
      );
    }
  };

  const checkCount = (path: ExpressionPath, node: Record<string, unknown>) => {
    checkEventName(path, 'count', node.count);
    checkUnknownKeys(path, node, ['count', 'within', ...COUNT_COMPARATORS], 'an event count condition');
    const comparators = COUNT_COMPARATORS.filter((key) => node[key] !== undefined);
    if (comparators.length === 0) {
      report(path, `An event count needs a comparison: one of ${list(COUNT_COMPARATORS)}, such as "gte": 3.`);
    }
    for (const key of comparators) {
      const raw = node[key];
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
        report([...path, key], `"${key}" takes a whole number of times, 0 or more, got ${describe(raw)}.`);
      }
    }
    if (node.within !== undefined) checkDuration([...path, 'within'], node.within);
  };

  const checkNever = (path: ExpressionPath, node: Record<string, unknown>) => {
    checkEventName(path, 'never', node.never);
    checkUnknownKeys(path, node, ['never', 'within'], 'a never condition');
    if (node.within !== undefined) checkDuration([...path, 'within'], node.within);
  };

  const checkLastSeen = (path: ExpressionPath, node: Record<string, unknown>) => {
    checkUnknownKeys(path, node, ['lastSeen'], 'an activity condition');
    const window = node.lastSeen;
    if (!isRecord(window)) {
      report(
        [...path, 'lastSeen'],
        `"lastSeen" takes an object with "within" and/or "olderThan", got ${describe(window)}.`
      );
      return;
    }
    checkUnknownKeys([...path, 'lastSeen'], window, ['within', 'olderThan'], '"lastSeen"');
    if (window.within === undefined && window.olderThan === undefined) {
      report([...path, 'lastSeen'], '"lastSeen" needs "within" or "olderThan", such as { "within": "30d" }.');
    }
    if (window.within !== undefined) checkDuration([...path, 'lastSeen', 'within'], window.within);
    if (window.olderThan !== undefined) checkDuration([...path, 'lastSeen', 'olderThan'], window.olderThan);
  };

  const checkChannel = (path: ExpressionPath, node: Record<string, unknown>) => {
    checkUnknownKeys(path, node, ['channel'], 'a channel condition');
    if (typeof node.channel !== 'string' || !(CHANNELS as readonly string[]).includes(node.channel)) {
      report(
        [...path, 'channel'],
        `"channel" must be one of ${list(CHANNELS)}, got ${describe(node.channel)}.`
      );
    }
  };

  const tools: LintTools = { report, checkUnknownKeys, checkEventName, checkDuration, describe, list };

  const walk = (node: unknown, path: ExpressionPath, depth: number) => {
    if (!isRecord(node)) {
      report(
        path,
        `${formatExpressionPath(path) === 'the expression' ? 'The expression' : 'This'} must be an object: a group ({ "all": [...] }, { "any": [...] }, { "not": {...} }) or a condition, got ${describe(node)}.`
      );
      return;
    }
    if (depth > MAX_EXPRESSION_DEPTH) {
      report(path, `Groups nest at most ${MAX_EXPRESSION_DEPTH} levels deep.`);
      return;
    }
    const present = [...GROUP_KEYS, ...known].filter((key) => key in node);
    if (present.length === 0) {
      report(
        path,
        `This object is neither a group nor a condition. Start it with one of ${list(GROUP_KEYS)} or ${list(kinds)}.`
      );
      return;
    }
    if (present.length > 1) {
      report(
        path,
        `Pick one of ${list(present)} per object; put several conditions in an "all" or "any" group instead.`
      );
      return;
    }
    const kind = present[0]!;
    if (!GROUP_KEYS.includes(kind as (typeof GROUP_KEYS)[number]) && !kinds.includes(kind)) {
      report(path, `"${kind}" conditions are not available here. Use one of ${list(kinds)}.`);
      return;
    }
    if (kind === 'all' || kind === 'any') {
      checkUnknownKeys(path, node, [kind], `an "${kind}" group`);
      const children = node[kind];
      if (!Array.isArray(children)) {
        report([...path, kind], `"${kind}" takes a list of conditions, got ${describe(children)}.`);
        return;
      }
      if (children.length === 0) {
        report([...path, kind], `"${kind}" needs at least one condition.`);
        return;
      }
      for (const [index, child] of children.entries()) walk(child, [...path, kind, index], depth + 1);
      return;
    }
    if (kind === 'not') {
      checkUnknownKeys(path, node, ['not'], 'a "not" group');
      walk(node.not, [...path, 'not'], depth + 1);
      return;
    }
    leaves += 1;
    if (leaves > MAX_EXPRESSION_LEAVES) {
      report(path, `An expression holds at most ${MAX_EXPRESSION_LEAVES} conditions.`);
      return;
    }
    const checker = checkers[kind];
    if (checker) {
      checker(path, node, tools);
      return;
    }
    switch (kind) {
      case 'ref':
        checkRef(path, node);
        return;
      case 'count':
        checkCount(path, node);
        return;
      case 'never':
        checkNever(path, node);
        return;
      case 'lastSeen':
        checkLastSeen(path, node);
        return;
      case 'channel':
        checkChannel(path, node);
        return;
    }
  };

  walk(value, [], 1);
  return issues;
}
