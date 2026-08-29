import { EVENT_NAME_PATTERN } from '../expressions/constants';
import {
  type ExpressionPath,
  formatExpressionPath,
  lintExpression,
  type RefScope,
} from '../expressions/lint';
import {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  MAX_BRANCH_DEPTH,
  MAX_STEPS,
  MAX_WAIT_SECONDS,
  RESERVED_EVENT_PREFIX,
  SEND_CHANNELS,
  STEP_ANCHOR_PREFIX,
  STEP_KINDS,
  STEP_NAME_MAX_LENGTH,
  STEP_NAME_PATTERN,
  SUBSCRIBER_TIMEZONE,
  TRIGGER_ANCHOR,
  TRIGGER_SOURCES,
  WALL_TIME_PATTERN,
} from './constants';
import { durationSeconds, isDuration } from './duration';
import type { WorkflowIssue } from './types';

const TRIGGER_REFS: RefScope = {
  roots: ['trigger', 'subscriber', 'steps'],
  bare: [],
  label: 'a workflow',
};

const WAIT_FOR_REFS: RefScope = {
  roots: ['event', 'trigger', 'subscriber', 'steps'],
  bare: [],
  label: 'a wait',
};

const SEND_KEYS = ['channel', 'topic', 'title', 'body', 'subtitle', 'data', 'deliver'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function list(items: readonly string[]): string {
  return items.map((item) => `"${item}"`).join(', ');
}

export function formatWorkflowPath(path: ExpressionPath): string {
  if (path.length === 0) return 'the workflow';
  return formatExpressionPath(path);
}

export function lintWorkflow(value: unknown): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const report = (path: ExpressionPath, message: string) => issues.push({ path, message });
  const names = new Map<string, ExpressionPath>();

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

  const checkEventName = (path: ExpressionPath, raw: unknown) => {
    if (typeof raw !== 'string' || !EVENT_NAME_PATTERN.test(raw)) {
      report(
        path,
        `An event name looks like "order.completed" (lowercase letters, digits, dots, underscores and dashes), got ${describe(raw)}.`
      );
      return;
    }
    if (raw.startsWith(RESERVED_EVENT_PREFIX)) {
      report(path, `"${raw}" is written by workflows themselves and cannot start or steer one.`);
    }
  };

  const checkExpression = (path: ExpressionPath, raw: unknown, refs: RefScope) => {
    for (const issue of lintExpression(raw, { refs, kinds: ['ref'] })) {
      report([...path, ...issue.path], issue.message);
    }
  };

  const checkDuration = (path: ExpressionPath, raw: unknown) => {
    if (!isDuration(raw)) {
      report(
        path,
        `${describe(raw)} is not a duration. Use a number followed by m, h or d, such as "15m", "2h" or "3d".`
      );
      return false;
    }
    if (durationSeconds(raw) > MAX_WAIT_SECONDS) {
      report(path, `A wait is at most a year, got ${raw}.`);
      return false;
    }
    if (durationSeconds(raw) === 0) {
      report(path, 'A wait must be longer than zero.');
      return false;
    }
    return true;
  };

  const checkAnchor = (path: ExpressionPath, raw: unknown, seen: Set<string>) => {
    if (!isRecord(raw)) {
      report(
        path,
        `An anchor is an object such as { "after": "trigger", "plus": "2d" }, got ${describe(raw)}.`
      );
      return;
    }
    checkUnknownKeys(path, raw, ['after', 'plus', 'at', 'timezone'], 'an anchor');
    const after = raw.after;
    if (typeof after !== 'string') {
      report([...path, 'after'], `"after" must be "trigger" or "steps.<name>", got ${describe(after)}.`);
    } else if (after !== TRIGGER_ANCHOR) {
      if (!after.startsWith(STEP_ANCHOR_PREFIX)) {
        report([...path, 'after'], `"after" must be "trigger" or "steps.<name>", got "${after}".`);
      } else if (!seen.has(after.slice(STEP_ANCHOR_PREFIX.length))) {
        report(
          [...path, 'after'],
          `"${after}" refers to a step that does not come before this one. Anchors point at earlier steps.`
        );
      }
    }
    if (raw.plus !== undefined) checkDuration([...path, 'plus'], raw.plus);
    if (raw.at !== undefined && (typeof raw.at !== 'string' || !WALL_TIME_PATTERN.test(raw.at))) {
      report([...path, 'at'], `"at" is a wall-clock time such as "09:00", got ${describe(raw.at)}.`);
    }
    if (raw.timezone !== undefined) {
      if (typeof raw.timezone !== 'string' || raw.timezone.length === 0) {
        report(
          [...path, 'timezone'],
          `"timezone" is an IANA name such as "Europe/Berlin", got ${describe(raw.timezone)}.`
        );
      } else if (raw.timezone === SUBSCRIBER_TIMEZONE) {
        report(
          [...path, 'timezone'],
          "Waiting for each subscriber's local time arrives with the next workflow phase."
        );
      }
    }
    if (raw.at !== undefined && raw.timezone === undefined) {
      report([...path, 'timezone'], '"at" needs a "timezone" to say whose clock it reads.');
    }
  };

  const checkSend = (path: ExpressionPath, raw: unknown) => {
    if (!isRecord(raw)) {
      report(path, `"send" takes the message to send, got ${describe(raw)}.`);
      return;
    }
    checkUnknownKeys(path, raw, SEND_KEYS, 'a send step');
    if (raw.title === undefined && raw.body === undefined && raw.data === undefined) {
      report(path, 'A send needs at least a title, a body or data.');
    }
    if (raw.channel !== undefined && !(SEND_CHANNELS as readonly unknown[]).includes(raw.channel)) {
      report(
        [...path, 'channel'],
        `"channel" must be one of ${list(SEND_CHANNELS)}, got ${describe(raw.channel)}.`
      );
    }
    if (raw.deliver !== undefined && !(DELIVERY_MODES as readonly unknown[]).includes(raw.deliver)) {
      report(
        [...path, 'deliver'],
        `"deliver" must be one of ${list(DELIVERY_MODES)}, got ${describe(raw.deliver)}.`
      );
    }
    for (const key of ['title', 'body', 'subtitle', 'topic'] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== 'string') {
        report([...path, key], `"${key}" takes a string, got ${describe(raw[key])}.`);
      }
    }
    if (raw.data !== undefined && !isRecord(raw.data)) {
      report([...path, 'data'], `"data" takes an object, got ${describe(raw.data)}.`);
    }
  };

  const checkSteps = (path: ExpressionPath, raw: unknown, depth: number, seen: Set<string>) => {
    if (!Array.isArray(raw)) {
      report(path, `Steps are a list, got ${describe(raw)}.`);
      return;
    }
    if (raw.length > MAX_STEPS) {
      report(path, `A workflow holds at most ${MAX_STEPS} steps in one list, got ${raw.length}.`);
    }
    raw.forEach((step, index) => {
      const stepPath = [...path, index];
      if (!isRecord(step)) {
        report(stepPath, `A step is an object, got ${describe(step)}.`);
        return;
      }
      const kinds = STEP_KINDS.filter((kind) => kind in step);
      if (kinds.length === 0) {
        report(stepPath, `A step needs one of ${list(STEP_KINDS)}.`);
        return;
      }
      if (kinds.length > 1) {
        report(stepPath, `A step does one thing. Pick one of ${list(kinds)}.`);
        return;
      }
      const kind = kinds[0] as (typeof STEP_KINDS)[number];
      if (kind === 'exit') {
        checkUnknownKeys(stepPath, step, ['exit'], 'an exit step');
        if (step.exit !== true) report([...stepPath, 'exit'], '"exit" is written as { "exit": true }.');
        if (index !== raw.length - 1) {
          report(stepPath, 'Nothing after "exit" runs. Put it last, or drop the steps after it.');
        }
        return;
      }
      checkUnknownKeys(stepPath, step, ['name', kind], `a ${kind} step`);
      const name = step.name;
      if (typeof name !== 'string' || !STEP_NAME_PATTERN.test(name) || name.length > STEP_NAME_MAX_LENGTH) {
        report(
          [...stepPath, 'name'],
          `Every step needs a "name" of lowercase letters, digits and dashes (at most ${STEP_NAME_MAX_LENGTH} characters), got ${describe(name)}.`
        );
      } else if (names.has(name)) {
        report(
          [...stepPath, 'name'],
          `"${name}" is already the name of the step at ${formatWorkflowPath(names.get(name) ?? [])}.`
        );
      } else {
        names.set(name, stepPath);
      }
      const known = typeof name === 'string' ? name : null;
      switch (kind) {
        case 'wait':
          checkDuration([...stepPath, 'wait'], step.wait);
          break;
        case 'waitUntil':
          checkAnchor([...stepPath, 'waitUntil'], step.waitUntil, seen);
          break;
        case 'waitFor': {
          const wait = step.waitFor;
          if (!isRecord(wait)) {
            report([...stepPath, 'waitFor'], `"waitFor" takes { "event", "until" }, got ${describe(wait)}.`);
            break;
          }
          checkUnknownKeys([...stepPath, 'waitFor'], wait, ['event', 'where', 'until'], 'a waitFor step');
          checkEventName([...stepPath, 'waitFor', 'event'], wait.event);
          if (wait.where !== undefined)
            checkExpression([...stepPath, 'waitFor', 'where'], wait.where, WAIT_FOR_REFS);
          if (wait.until === undefined) {
            report(
              [...stepPath, 'waitFor', 'until'],
              'A wait for an event needs an "until": a duration or an anchor.'
            );
          } else if (typeof wait.until === 'string') {
            checkDuration([...stepPath, 'waitFor', 'until'], wait.until);
          } else {
            checkAnchor([...stepPath, 'waitFor', 'until'], wait.until, seen);
          }
          break;
        }
        case 'branch': {
          const branch = step.branch;
          if (!isRecord(branch)) {
            report(
              [...stepPath, 'branch'],
              `"branch" takes { "if", "then", "else" }, got ${describe(branch)}.`
            );
            break;
          }
          checkUnknownKeys([...stepPath, 'branch'], branch, ['if', 'then', 'else'], 'a branch step');
          if (depth >= MAX_BRANCH_DEPTH) {
            report([...stepPath, 'branch'], `Branches nest at most ${MAX_BRANCH_DEPTH} levels deep.`);
            break;
          }
          checkExpression([...stepPath, 'branch', 'if'], branch.if, TRIGGER_REFS);
          const before = new Set(seen);
          if (known) before.add(known);
          checkSteps([...stepPath, 'branch', 'then'], branch.then, depth + 1, new Set(before));
          if (branch.else !== undefined)
            checkSteps([...stepPath, 'branch', 'else'], branch.else, depth + 1, new Set(before));
          break;
        }
        case 'send':
          checkSend([...stepPath, 'send'], step.send);
          break;
      }
      if (known) seen.add(known);
    });
  };

  if (!isRecord(value)) {
    report([], `A workflow is an object with "trigger" and "steps", got ${describe(value)}.`);
    return issues;
  }
  checkUnknownKeys([], value, ['trigger', 'concurrency', 'cancelOn', 'steps'], 'a workflow');

  const trigger = value.trigger;
  if (!isRecord(trigger)) {
    report(['trigger'], `"trigger" takes { "event", "sources", "where" }, got ${describe(trigger)}.`);
  } else {
    checkUnknownKeys(['trigger'], trigger, ['event', 'sources', 'where'], 'a trigger');
    checkEventName(['trigger', 'event'], trigger.event);
    if (trigger.sources !== undefined) {
      if (!Array.isArray(trigger.sources) || trigger.sources.length === 0) {
        report(
          ['trigger', 'sources'],
          `"sources" takes a list of ${list(TRIGGER_SOURCES)}, got ${describe(trigger.sources)}.`
        );
      } else {
        trigger.sources.forEach((source, index) => {
          if (!(TRIGGER_SOURCES as readonly unknown[]).includes(source)) {
            report(
              ['trigger', 'sources', index],
              `"${String(source)}" is not a source. Use one of ${list(TRIGGER_SOURCES)}.`
            );
          }
        });
      }
    }
    if (trigger.where !== undefined) checkExpression(['trigger', 'where'], trigger.where, TRIGGER_REFS);
  }

  if (
    value.concurrency !== undefined &&
    !(CONCURRENCY_MODES as readonly unknown[]).includes(value.concurrency)
  ) {
    report(
      ['concurrency'],
      `"concurrency" must be one of ${list(CONCURRENCY_MODES)}, got ${describe(value.concurrency)}.`
    );
  }

  if (value.cancelOn !== undefined) {
    if (!Array.isArray(value.cancelOn)) {
      report(
        ['cancelOn'],
        `"cancelOn" takes a list of { "event", "where" }, got ${describe(value.cancelOn)}.`
      );
    } else {
      value.cancelOn.forEach((rule, index) => {
        if (!isRecord(rule)) {
          report(['cancelOn', index], `A cancel rule is { "event", "where" }, got ${describe(rule)}.`);
          return;
        }
        checkUnknownKeys(['cancelOn', index], rule, ['event', 'where'], 'a cancel rule');
        checkEventName(['cancelOn', index, 'event'], rule.event);
        if (rule.where !== undefined)
          checkExpression(['cancelOn', index, 'where'], rule.where, WAIT_FOR_REFS);
      });
    }
  }

  if (value.steps === undefined) {
    report(['steps'], 'A workflow needs at least one step.');
  } else if (Array.isArray(value.steps) && value.steps.length === 0) {
    report(['steps'], 'A workflow needs at least one step.');
  } else {
    checkSteps(['steps'], value.steps, 0, new Set());
  }

  return issues;
}
