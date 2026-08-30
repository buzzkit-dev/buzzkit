import {
  COUNT_COMPARATORS,
  type ConditionChecker,
  type ExpressionPath,
  type LintTools,
} from 'buzzkit/expressions';
import { SINCE_ANCHORS, STEP_NAME_MAX_LENGTH, STEP_NAME_PATTERN } from '../constants';

function checkWindow(path: ExpressionPath, node: Record<string, unknown>, label: string, tools: LintTools) {
  if (node.within !== undefined) tools.checkDuration([...path, 'within'], node.within);
  if (node.since !== undefined && !(SINCE_ANCHORS as readonly unknown[]).includes(node.since)) {
    tools.report(
      [...path, 'since'],
      `"since" must be one of ${tools.list(SINCE_ANCHORS)}, got ${tools.describe(node.since)}.`
    );
  }
  if (node.within !== undefined && node.since !== undefined) {
    tools.report(path, `${label} takes "within" or "since", not both.`);
  }
}

const checkCount: ConditionChecker = (path, node, tools) => {
  tools.checkEventName(path, 'count', node.count);
  tools.checkUnknownKeys(
    path,
    node,
    ['count', 'within', 'since', ...COUNT_COMPARATORS],
    'an event count condition'
  );
  const comparators = COUNT_COMPARATORS.filter((key) => node[key] !== undefined);
  if (comparators.length === 0) {
    tools.report(
      path,
      `An event count needs a comparison: one of ${tools.list(COUNT_COMPARATORS)}, such as "gte": 3.`
    );
  }
  for (const key of comparators) {
    const raw = node[key];
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      tools.report(
        [...path, key],
        `"${key}" takes a whole number of times, 0 or more, got ${tools.describe(raw)}.`
      );
    }
  }
  checkWindow(path, node, 'An event count', tools);
};

const checkOccurred: ConditionChecker = (path, node, tools) => {
  tools.checkEventName(path, 'occurred', node.occurred);
  tools.checkUnknownKeys(path, node, ['occurred', 'within', 'since'], 'an occurred condition');
  checkWindow(path, node, 'An occurred condition', tools);
};

function stepReference(key: 'opened' | 'delivered'): ConditionChecker {
  return (path, node, tools) => {
    tools.checkUnknownKeys(path, node, [key], `${key === 'opened' ? 'an opened' : 'a delivered'} condition`);
    const raw = node[key];
    if (typeof raw !== 'string' || !STEP_NAME_PATTERN.test(raw) || raw.length > STEP_NAME_MAX_LENGTH) {
      tools.report(
        [...path, key],
        `"${key}" names an earlier send step, such as "nudge", got ${tools.describe(raw)}.`
      );
    }
  };
}

export const WORKFLOW_CHECKERS: Record<string, ConditionChecker> = {
  count: checkCount,
  occurred: checkOccurred,
  opened: stepReference('opened'),
  delivered: stepReference('delivered'),
};
