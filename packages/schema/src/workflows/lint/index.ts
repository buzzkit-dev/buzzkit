import {
  ATTRIBUTE_KEY_PATTERN,
  describe,
  EVENT_NAME_PATTERN,
  type ExpressionPath,
  formatExpressionPath,
  lintExpression,
  list,
  type RefScope,
} from 'buzzkit/expressions';
import {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  FALLBACK_CASE,
  FETCH_ERROR_MODES,
  FETCH_METHODS,
  FETCH_TIMEOUT_PATTERN,
  FOREACH_ITEM_ROOTS,
  INTERRUPTION_LEVELS,
  MAX_BRANCH_CASES,
  MAX_BRANCH_DEPTH,
  MAX_EXPECTED_STATUSES,
  MAX_FETCH_HEADERS,
  MAX_FETCH_TIMEOUT_SECONDS,
  MAX_FOREACH_ITEMS,
  MAX_REPEAT_PASSES,
  MAX_RESET_EVENTS,
  MAX_SEND_ACTIONS,
  MAX_STEPS,
  MAX_WAIT_EVENTS,
  MAX_WAIT_SECONDS,
  MIN_REPEAT_PASSES,
  NOW_PATH,
  RESERVED_EVENT_PREFIX,
  SECRET_NAME_PATTERN,
  SEGMENT_SLUG_PATTERN,
  SEND_CHANNELS,
  SEND_POLICY_MODES,
  SEND_PRIORITIES,
  STEP_KINDS,
  STEP_NAME_MAX_LENGTH,
  STEP_NAME_PATTERN,
  SUBSCRIBER_TIMEZONE,
  SYSTEM_ATTRIBUTE_PREFIX,
  TRIGGER_SOURCES,
  VAR_NAME_PATTERN,
  WALL_TIME_PATTERN,
  WORKFLOW_CONDITIONS,
} from '../constants';
import { cronProblem } from '../parse/cron';
import { durationSeconds, isDuration } from '../parse/duration';
import { lintTemplate, templatePaths } from '../parse/template';
import { isTimezone } from '../parse/timezone';
import type { WorkflowIssue, WorkflowSpec } from '../types';
import { WORKFLOW_CHECKERS } from './conditions';

const TRIGGER_REFS: RefScope = { roots: ['trigger', 'subscriber'], bare: [], label: 'a trigger' };

const SCHEDULE_REFS: RefScope = { roots: ['subscriber'], bare: [], label: 'a schedule' };

const CANCEL_REFS: RefScope = {
  roots: ['event', 'trigger', 'subscriber', 'steps'],
  bare: [],
  label: 'a cancel rule',
};

const WAIT_FOR_REFS: RefScope = {
  roots: ['event', 'trigger', 'subscriber', 'steps', 'vars'],
  bare: [],
  label: 'a wait',
};

const BRANCH_REFS: RefScope = {
  roots: ['trigger', 'subscriber', 'steps', 'vars'],
  bare: [],
  label: 'a branch',
};

const TEMPLATE_ROOTS = ['trigger', 'subscriber', 'steps', 'vars'] as const;

const HISTORY_CONDITIONS = ['ref', 'count', 'never', 'occurred'] as const;

const STEP_CONDITIONS = ['opened', 'delivered'] as const;

const SEND_KEYS = [
  'channel',
  'topic',
  'title',
  'body',
  'subtitle',
  'data',
  'deliver',
  'skipIfSentWithin',
  'imageUrl',
  'sound',
  'badge',
  'threadId',
  'collapseId',
  'interruptionLevel',
  'relevanceScore',
  'priority',
  'deepLink',
  'action',
  'actions',
  'policy',
] as const;

const FETCH_KEYS = ['method', 'url', 'headers', 'body', 'timeout', 'expect', 'as', 'onError'] as const;

const WAIT_FOR_KEYS = ['event', 'events', 'where', 'settleFor', 'resetOn', 'endOn', 'timeout'] as const;

const ACTION_KEYS = ['id', 'title', 'destructive', 'foreground', 'input', 'placeholder'] as const;

const REPEAT_KEYS = ['steps', 'every', 'max', 'until'] as const;

const FOREACH_KEYS = ['items', 'as', 'max', 'steps'] as const;

const ITEMS_PATH_PATTERN = /^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_$-]+)+$|^[a-z][A-Za-z0-9_]*$/;

const MOMENT_KEYS = ['delay', 'time', 'timezone'] as const;

const SECRET_ROOTS = ['secrets'] as const;

const FETCH_URL_PATTERN = /^https:\/\/[^\s/]+/;

const LOCAL_FETCH_URL_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/|$)/;

type Node = Record<string, unknown>;

type StepConditions = Array<{ key: string; name: string; path: ExpressionPath }>;

function isRecord(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFetchUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return FETCH_URL_PATTERN.test(value) || LOCAL_FETCH_URL_PATTERN.test(value);
}

function isStepName(value: unknown): value is string {
  return typeof value === 'string' && STEP_NAME_PATTERN.test(value) && value.length <= STEP_NAME_MAX_LENGTH;
}

function stepConditions(node: unknown, path: ExpressionPath): StepConditions {
  if (!isRecord(node)) return [];
  if (Array.isArray(node.all)) {
    return node.all.flatMap((child, index) => stepConditions(child, [...path, 'all', index]));
  }
  if (Array.isArray(node.any)) {
    return node.any.flatMap((child, index) => stepConditions(child, [...path, 'any', index]));
  }
  if (node.not !== undefined) return stepConditions(node.not, [...path, 'not']);
  const key = STEP_CONDITIONS.find((candidate) => typeof node[candidate] === 'string');

  return key ? [{ key, name: node[key] as string, path: [...path, key] }] : [];
}

function declaredVars(steps: unknown, names = new Set<string>()): Set<string> {
  if (!Array.isArray(steps)) return names;
  for (const step of steps) {
    if (!isRecord(step)) continue;
    if (isRecord(step.set) && typeof step.set.var === 'string') names.add(step.set.var);
    if (isRecord(step.fetch) && typeof step.fetch.as === 'string') names.add(step.fetch.as);
    if (isRecord(step.forEach)) {
      if (typeof step.forEach.as === 'string') names.add(step.forEach.as);
      declaredVars(step.forEach.steps, names);
    }
    if (isRecord(step.repeat)) declaredVars(step.repeat.steps, names);
    if (Array.isArray(step.branch)) {
      for (const entry of step.branch) if (isRecord(entry)) declaredVars(entry.steps, names);
    }
  }
  return names;
}

export function formatWorkflowPath(path: ExpressionPath): string {
  if (path.length === 0) return 'the workflow';
  return formatExpressionPath(path);
}

export function lintWorkflow(value: unknown): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const report = (path: ExpressionPath, message: string) => issues.push({ path, message });
  const names = new Map<string, ExpressionPath>();
  const sends = new Set<string>();
  const vars = declaredVars(isRecord(value) ? value.steps : undefined);

  const checkUnknownKeys = (path: ExpressionPath, node: Node, allowed: readonly string[], label: string) => {
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
      return false;
    }
    if (raw.startsWith(RESERVED_EVENT_PREFIX)) {
      report(path, `"${raw}" is written by workflows themselves and cannot start or steer one.`);
      return false;
    }
    return true;
  };

  const checkExpression = (
    path: ExpressionPath,
    raw: unknown,
    refs: RefScope,
    kinds: readonly string[],
    seen: Set<string>
  ) => {
    for (const issue of lintExpression(raw, { refs, kinds, checkers: WORKFLOW_CHECKERS })) {
      report([...path, ...issue.path], issue.message);
    }
    if (!kinds.includes('opened')) return;
    for (const condition of stepConditions(raw, path)) {
      if (!seen.has(condition.name)) {
        report(
          condition.path,
          `"${condition.name}" is not a step that comes before this one. "${condition.key}" reads an earlier send step.`
        );
      } else if (!sends.has(condition.name)) {
        report(
          condition.path,
          `"${condition.name}" is not a send step. "${condition.key}" reads what a send step sent.`
        );
      }
    }
  };

  const checkTemplate = (path: ExpressionPath, raw: string, extraRoots: readonly string[] = []) => {
    const before = issues.length;
    for (const issue of lintTemplate(raw)) {
      report(path, `{{ ${issue.placeholder} }}: ${issue.message}`);
    }
    if (issues.length > before) return;
    const roots = [...TEMPLATE_ROOTS, ...extraRoots];
    for (const reference of templatePaths(raw)) {
      const [root, ...keys] = reference.split('.');
      if (root === NOW_PATH) {
        if (keys.length > 0) report(path, `{{ ${reference} }}: "now" is the current time and has no keys.`);
      } else if (!root || !roots.includes(root)) {
        report(
          path,
          `{{ ${reference} }} is not something a template can read here. Use ${roots.map((name) => `"${name}.<key>"`).join(', ')} or "now".`
        );
      } else if (root === 'secrets' && (keys.length !== 1 || !SECRET_NAME_PATTERN.test(keys[0] as string))) {
        report(
          path,
          `{{ ${reference} }} names a secret: "secrets.<name>", a lowercase letter followed by letters, digits and underscores.`
        );
      } else if (keys.length === 0) {
        report(path, `{{ ${reference} }} needs a key after it, such as "${root}.<key>".`);
      } else if (root === 'vars' && !vars.has(keys[0] as string)) {
        report(path, `{{ ${reference} }} reads a variable no "set" step writes.`);
      }
    }
  };

  const checkTemplates = (path: ExpressionPath, raw: unknown, extraRoots: readonly string[] = []) => {
    if (typeof raw === 'string') checkTemplate(path, raw, extraRoots);
    else if (Array.isArray(raw)) {
      for (const [index, entry] of raw.entries()) checkTemplates([...path, index], entry, extraRoots);
    } else if (isRecord(raw)) {
      for (const [key, entry] of Object.entries(raw)) checkTemplates([...path, key], entry, extraRoots);
    }
  };

  const checkDuration = (path: ExpressionPath, raw: unknown, noun = 'A wait') => {
    if (!isDuration(raw)) {
      report(
        path,
        `${describe(raw)} is not a duration. Use a number followed by m, h or d, such as "15m", "2h" or "3d".`
      );
      return false;
    }
    if (durationSeconds(raw) > MAX_WAIT_SECONDS) {
      report(path, `${noun} is at most a year, got ${raw}.`);
      return false;
    }
    if (durationSeconds(raw) === 0) {
      report(path, `${noun} must be longer than zero.`);
      return false;
    }
    return true;
  };

  const checkTimezone = (path: ExpressionPath, raw: unknown, subscriberAllowed: boolean) => {
    if (raw === SUBSCRIBER_TIMEZONE && subscriberAllowed) return;
    if (!isTimezone(raw)) {
      const key = path.at(-1);
      const options = subscriberAllowed ? ` or "${SUBSCRIBER_TIMEZONE}" for each subscriber's own` : '';
      report(
        path,
        `"${String(key)}" is an IANA name such as "Europe/Berlin"${options}, got ${describe(raw)}.`
      );
    }
  };

  const checkMoment = (path: ExpressionPath, raw: unknown) => {
    if (!isRecord(raw)) {
      report(
        path,
        `A moment is an object such as { "delay": "2d", "time": "09:00", "timezone": "subscriber" }, got ${describe(raw)}.`
      );
      return;
    }
    checkUnknownKeys(path, raw, MOMENT_KEYS, 'a moment');
    if (raw.delay === undefined && raw.time === undefined) {
      report(path, 'A moment needs a "delay" from the start of the run, a "time" of day, or both.');
    }
    if (raw.delay !== undefined) checkDuration([...path, 'delay'], raw.delay, '"delay"');
    if (raw.time !== undefined && (typeof raw.time !== 'string' || !WALL_TIME_PATTERN.test(raw.time))) {
      report([...path, 'time'], `"time" is a wall-clock time such as "09:00", got ${describe(raw.time)}.`);
    }
    if (raw.timezone !== undefined) checkTimezone([...path, 'timezone'], raw.timezone, true);
    if (raw.time !== undefined && raw.timezone === undefined) {
      report([...path, 'timezone'], '"time" needs a "timezone" to say whose clock it reads.');
    }
    if (raw.time === undefined && raw.timezone !== undefined) {
      report([...path, 'timezone'], '"timezone" only means something next to a "time".');
    }
  };

  const checkTimeout = (path: ExpressionPath, raw: unknown) => {
    if (typeof raw === 'string') checkDuration(path, raw, '"timeout"');
    else checkMoment(path, raw);
  };

  const collectWaitedEvents = (raw: Node): unknown[] => {
    if (raw.event !== undefined) return [raw.event];
    if (Array.isArray(raw.events)) {
      return raw.events.map((entry) => (isRecord(entry) ? entry.event : undefined));
    }
    return [];
  };

  const checkMatcher = (path: ExpressionPath, raw: unknown, label: string): boolean => {
    if (!isRecord(raw)) {
      report(path, `${label} is { "event", "where" }, got ${describe(raw)}.`);
      return false;
    }
    checkUnknownKeys(path, raw, ['event', 'where'], label);
    return checkEventName([...path, 'event'], raw.event);
  };

  const checkWaitFor = (path: ExpressionPath, raw: unknown) => {
    if (!isRecord(raw)) {
      report(path, `"waitFor" takes { "event", "timeout" }, got ${describe(raw)}.`);
      return;
    }
    checkUnknownKeys(path, raw, WAIT_FOR_KEYS, 'a waitFor step');
    if (raw.event !== undefined && raw.events !== undefined) {
      report(path, 'A wait takes "event" or "events", not both.');
    } else if (raw.events !== undefined) {
      if (!Array.isArray(raw.events)) {
        report(
          [...path, 'events'],
          `"events" takes a list of { "event", "where" }; the first to match ends the wait. Got ${describe(raw.events)}.`
        );
      } else if (raw.events.length === 0) {
        report([...path, 'events'], '"events" cannot be empty: name at least one event to wait for.');
      } else if (raw.events.length > MAX_WAIT_EVENTS) {
        report(
          [...path, 'events'],
          `"events" takes at most ${MAX_WAIT_EVENTS} entries, got ${raw.events.length}.`
        );
      } else {
        raw.events.forEach((entry, index) => {
          checkMatcher([...path, 'events', index], entry, 'a waited event');
        });
      }
      if (raw.where !== undefined) {
        report([...path, 'where'], 'With "events", each entry carries its own "where".');
      }
    } else {
      checkEventName([...path, 'event'], raw.event);
    }
    if (raw.endOn !== undefined) {
      if (!Array.isArray(raw.endOn)) {
        report(
          [...path, 'endOn'],
          `"endOn" takes a list of { "event", "where" } that end the wait unmatched, got ${describe(raw.endOn)}.`
        );
      } else if (raw.endOn.length === 0) {
        report([...path, 'endOn'], '"endOn" cannot be empty: name the events that end the wait.');
      } else if (raw.endOn.length > MAX_RESET_EVENTS) {
        report(
          [...path, 'endOn'],
          `"endOn" takes at most ${MAX_RESET_EVENTS} entries, got ${raw.endOn.length}.`
        );
      } else {
        const waited = collectWaitedEvents(raw);
        raw.endOn.forEach((entry, index) => {
          if (
            checkMatcher([...path, 'endOn', index], entry, 'an ending event') &&
            isRecord(entry) &&
            waited.includes(entry.event)
          ) {
            report(
              [...path, 'endOn', index],
              `"${String(entry.event)}" is an event this step waits for; a match already ends the wait.`
            );
          }
        });
      }
    }
    if (raw.timeout === undefined) {
      report(
        [...path, 'timeout'],
        'A wait for an event needs a "timeout": a duration or a moment to give up at.'
      );
    } else {
      checkTimeout([...path, 'timeout'], raw.timeout);
    }
    if (raw.settleFor !== undefined) checkDuration([...path, 'settleFor'], raw.settleFor, '"settleFor"');
    if (raw.resetOn !== undefined) {
      if (!Array.isArray(raw.resetOn) || raw.resetOn.length === 0) {
        report(
          [...path, 'resetOn'],
          `"resetOn" takes a list of events that restart the settle clock, got ${describe(raw.resetOn)}.`
        );
      } else if (raw.resetOn.length > MAX_RESET_EVENTS) {
        report(
          [...path, 'resetOn'],
          `"resetOn" takes at most ${MAX_RESET_EVENTS} events, got ${raw.resetOn.length}.`
        );
      } else {
        const waited = collectWaitedEvents(raw);
        raw.resetOn.forEach((entry, index) => {
          const entryPath = [...path, 'resetOn', index];
          const name = isRecord(entry) ? entry.event : entry;
          const valid = isRecord(entry)
            ? checkMatcher(entryPath, entry, 'a reset event')
            : checkEventName(entryPath, entry);
          if (valid && waited.includes(name)) {
            report(
              entryPath,
              `"${String(name)}" is an event this step waits for; it cannot also restart it.`
            );
          }
        });
      }
    }
    if (raw.settleFor !== undefined && raw.events !== undefined) {
      report(
        [...path, 'settleFor'],
        '"settleFor" works with a single "event"; with "events" the first match ends the wait.'
      );
    }
    if (raw.settleFor !== undefined && raw.resetOn === undefined) {
      report([...path, 'resetOn'], '"settleFor" needs "resetOn": the events that restart the settle clock.');
    }
    if (raw.resetOn !== undefined && raw.settleFor === undefined) {
      report(
        [...path, 'settleFor'],
        '"resetOn" needs "settleFor": how long things must stay quiet after the event.'
      );
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
      if (raw[key] === undefined) continue;
      if (typeof raw[key] !== 'string') {
        report([...path, key], `"${key}" takes a string, got ${describe(raw[key])}.`);
      } else if (key !== 'topic') {
        checkTemplate([...path, key], raw[key]);
      }
    }
    if (raw.data !== undefined) {
      if (!isRecord(raw.data))
        report([...path, 'data'], `"data" takes an object, got ${describe(raw.data)}.`);
      else checkTemplates([...path, 'data'], raw.data);
    }
    if (raw.skipIfSentWithin !== undefined) {
      checkDuration([...path, 'skipIfSentWithin'], raw.skipIfSentWithin, '"skipIfSentWithin"');
    }
    for (const key of ['imageUrl', 'sound', 'threadId', 'collapseId', 'deepLink'] as const) {
      if (raw[key] === undefined) continue;
      if (typeof raw[key] !== 'string') {
        report([...path, key], `"${key}" takes a string, got ${describe(raw[key])}.`);
      } else {
        checkTemplate([...path, key], raw[key]);
      }
    }
    if (
      raw.badge !== undefined &&
      (typeof raw.badge !== 'number' || !Number.isInteger(raw.badge) || raw.badge < 0)
    ) {
      report([...path, 'badge'], `"badge" takes a whole number, 0 or more, got ${describe(raw.badge)}.`);
    }
    if (
      raw.relevanceScore !== undefined &&
      (typeof raw.relevanceScore !== 'number' || raw.relevanceScore < 0 || raw.relevanceScore > 1)
    ) {
      report(
        [...path, 'relevanceScore'],
        `"relevanceScore" takes a number between 0 and 1, got ${describe(raw.relevanceScore)}.`
      );
    }
    if (
      raw.interruptionLevel !== undefined &&
      !(INTERRUPTION_LEVELS as readonly unknown[]).includes(raw.interruptionLevel)
    ) {
      report(
        [...path, 'interruptionLevel'],
        `"interruptionLevel" must be one of ${list(INTERRUPTION_LEVELS)}, got ${describe(raw.interruptionLevel)}.`
      );
    }
    if (raw.priority !== undefined && !(SEND_PRIORITIES as readonly unknown[]).includes(raw.priority)) {
      report(
        [...path, 'priority'],
        `"priority" must be one of ${list(SEND_PRIORITIES)}, got ${describe(raw.priority)}.`
      );
    }
    if (raw.policy !== undefined && !(SEND_POLICY_MODES as readonly unknown[]).includes(raw.policy)) {
      report(
        [...path, 'policy'],
        `"policy" must be one of ${list(SEND_POLICY_MODES)}, got ${describe(raw.policy)}.`
      );
    }
    if (raw.action !== undefined) {
      if (!isRecord(raw.action) || typeof raw.action.name !== 'string' || raw.action.name.length === 0) {
        report(
          [...path, 'action'],
          `"action" is { "name", "data" }: a handler the app registered, got ${describe(raw.action)}.`
        );
      } else {
        checkUnknownKeys([...path, 'action'], raw.action, ['name', 'data'], 'an action');
        if (raw.action.data !== undefined) {
          if (!isRecord(raw.action.data)) {
            report([...path, 'action', 'data'], `"data" takes an object, got ${describe(raw.action.data)}.`);
          } else {
            checkTemplates([...path, 'action', 'data'], raw.action.data);
          }
        }
      }
    }
    if (raw.actions !== undefined) {
      if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
        report(
          [...path, 'actions'],
          `"actions" takes a list of notification buttons { "id", "title" }, got ${describe(raw.actions)}.`
        );
      } else if (raw.actions.length > MAX_SEND_ACTIONS) {
        report(
          [...path, 'actions'],
          `A notification shows at most ${MAX_SEND_ACTIONS} buttons, got ${raw.actions.length}.`
        );
      } else {
        const ids = new Set<unknown>();
        raw.actions.forEach((entry, index) => {
          const entryPath = [...path, 'actions', index];
          if (!isRecord(entry)) {
            report(entryPath, `A button is { "id", "title" }, got ${describe(entry)}.`);
            return;
          }
          checkUnknownKeys(entryPath, entry, ACTION_KEYS, 'a button');
          for (const key of ['id', 'title'] as const) {
            if (typeof entry[key] !== 'string' || entry[key].length === 0) {
              report([...entryPath, key], `"${key}" takes a non-empty string, got ${describe(entry[key])}.`);
            }
          }
          if (typeof entry.id === 'string') {
            if (ids.has(entry.id))
              report([...entryPath, 'id'], `"${entry.id}" is already a button of this send.`);
            ids.add(entry.id);
          }
          for (const key of ['destructive', 'foreground', 'input'] as const) {
            if (entry[key] !== undefined && typeof entry[key] !== 'boolean') {
              report([...entryPath, key], `"${key}" takes true or false, got ${describe(entry[key])}.`);
            }
          }
          if (entry.placeholder !== undefined && typeof entry.placeholder !== 'string') {
            report(
              [...entryPath, 'placeholder'],
              `"placeholder" takes a string, got ${describe(entry.placeholder)}.`
            );
          }
          if (entry.placeholder !== undefined && entry.input !== true) {
            report(
              [...entryPath, 'placeholder'],
              '"placeholder" only means something on a button with "input": true.'
            );
          }
        });
      }
    }
  };

  const checkFetch = (path: ExpressionPath, raw: unknown) => {
    if (!isRecord(raw)) {
      report(path, `"fetch" takes { "url", "method", "headers", "body", … }, got ${describe(raw)}.`);
      return;
    }
    checkUnknownKeys(path, raw, FETCH_KEYS, 'a fetch step');
    if (raw.method !== undefined && !(FETCH_METHODS as readonly unknown[]).includes(raw.method)) {
      report(
        [...path, 'method'],
        `"method" must be one of ${list(FETCH_METHODS)}, got ${describe(raw.method)}.`
      );
    }
    if (!isFetchUrl(raw.url)) {
      report(
        [...path, 'url'],
        `"url" is an https address, such as "https://api.example.com/status", got ${describe(raw.url)}.`
      );
    } else {
      checkTemplate([...path, 'url'], raw.url, SECRET_ROOTS);
    }
    if (raw.headers !== undefined) {
      if (!isRecord(raw.headers)) {
        report(
          [...path, 'headers'],
          `"headers" takes an object of header names to values, got ${describe(raw.headers)}.`
        );
      } else if (Object.keys(raw.headers).length > MAX_FETCH_HEADERS) {
        report([...path, 'headers'], `"headers" takes at most ${MAX_FETCH_HEADERS} headers.`);
      } else {
        for (const [header, headerValue] of Object.entries(raw.headers)) {
          if (!/^[A-Za-z0-9-]+$/.test(header)) {
            report([...path, 'headers', header], `"${header}" is not a header name.`);
          } else if (typeof headerValue !== 'string') {
            report(
              [...path, 'headers', header],
              `The "${header}" header takes a string, got ${describe(headerValue)}.`
            );
          } else {
            checkTemplate([...path, 'headers', header], headerValue, SECRET_ROOTS);
          }
        }
      }
    }
    if (raw.body !== undefined) {
      if (typeof raw.body === 'string') checkTemplate([...path, 'body'], raw.body);
      else if (!isRecord(raw.body))
        report([...path, 'body'], `"body" takes an object or a string, got ${describe(raw.body)}.`);
      else checkTemplates([...path, 'body'], raw.body);
    }
    if (raw.body !== undefined && raw.method === 'GET') {
      report([...path, 'body'], 'A GET request carries no body. Drop "body" or use POST.');
    }
    if (raw.timeout !== undefined) {
      const match = typeof raw.timeout === 'string' ? FETCH_TIMEOUT_PATTERN.exec(raw.timeout) : null;
      const seconds = match ? Number(match[1]) : 0;
      if (!match || seconds < 1 || seconds > MAX_FETCH_TIMEOUT_SECONDS) {
        report(
          [...path, 'timeout'],
          `"timeout" is a number of seconds from 1s to ${MAX_FETCH_TIMEOUT_SECONDS}s, such as "30s", got ${describe(raw.timeout)}.`
        );
      }
    }
    if (raw.expect !== undefined) {
      if (!isRecord(raw.expect)) {
        report([...path, 'expect'], `"expect" takes { "status": [200] }, got ${describe(raw.expect)}.`);
      } else {
        checkUnknownKeys([...path, 'expect'], raw.expect, ['status'], '"expect"');
        const statuses = raw.expect.status;
        if (!Array.isArray(statuses) || statuses.length === 0 || statuses.length > MAX_EXPECTED_STATUSES) {
          report(
            [...path, 'expect', 'status'],
            `"status" takes a list of 1 to ${MAX_EXPECTED_STATUSES} status codes, got ${describe(statuses)}.`
          );
        } else {
          statuses.forEach((status, index) => {
            if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) {
              report(
                [...path, 'expect', 'status', index],
                `A status code is a whole number from 100 to 599, got ${describe(status)}.`
              );
            }
          });
        }
      }
    }
    if (raw.as !== undefined && (typeof raw.as !== 'string' || !VAR_NAME_PATTERN.test(raw.as))) {
      report(
        [...path, 'as'],
        `"as" names a variable: a lowercase letter followed by letters, digits and underscores, got ${describe(raw.as)}.`
      );
    }
    if (raw.onError !== undefined && !(FETCH_ERROR_MODES as readonly unknown[]).includes(raw.onError)) {
      report(
        [...path, 'onError'],
        `"onError" must be one of ${list(FETCH_ERROR_MODES)}, got ${describe(raw.onError)}.`
      );
    }
  };

  const checkSet = (path: ExpressionPath, raw: unknown) => {
    if (!isRecord(raw)) {
      report(path, `"set" takes { "attribute", "value" } or { "var", "value" }, got ${describe(raw)}.`);
      return;
    }
    const targets = ['attribute', 'var'].filter((key) => raw[key] !== undefined);
    if (targets.length !== 1) {
      report(path, 'A set writes one thing: an "attribute" of the subscriber or a "var" of the run.');
      return;
    }
    const target = targets[0] as 'attribute' | 'var';
    checkUnknownKeys(path, raw, [target, 'value'], 'a set step');
    if (target === 'attribute') {
      if (typeof raw.attribute !== 'string' || !ATTRIBUTE_KEY_PATTERN.test(raw.attribute)) {
        report(
          [...path, 'attribute'],
          `"attribute" is a key of letters, digits, _, $ and -, got ${describe(raw.attribute)}.`
        );
      } else if (raw.attribute.startsWith(SYSTEM_ATTRIBUTE_PREFIX)) {
        report(
          [...path, 'attribute'],
          `"${raw.attribute}" is written by the SDK and cannot be set by a workflow.`
        );
      }
    } else if (typeof raw.var !== 'string' || !VAR_NAME_PATTERN.test(raw.var)) {
      report(
        [...path, 'var'],
        `"var" names a variable: a lowercase letter followed by letters, digits and underscores, got ${describe(raw.var)}.`
      );
    }
    if (raw.value === undefined) {
      report([...path, 'value'], 'A set needs a "value": a string, number, boolean or null.');
    } else if (typeof raw.value === 'object' && raw.value !== null) {
      report(
        [...path, 'value'],
        `"value" takes a string, number, boolean or null, got ${describe(raw.value)}.`
      );
    } else if (typeof raw.value === 'string') {
      checkTemplate([...path, 'value'], raw.value);
    }
  };

  const checkSteps = (
    path: ExpressionPath,
    raw: unknown,
    depth: number,
    seen: Set<string>,
    loops: { inRepeat?: boolean; inForEach?: boolean } = {}
  ) => {
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
      const kinds = STEP_KINDS.filter((candidate) => candidate in step);
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
      if (!isStepName(name)) {
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
        if (kind === 'send') sends.add(name);
      }
      const known = isStepName(name) ? name : null;
      switch (kind) {
        case 'wait':
          checkDuration([...stepPath, 'wait'], step.wait);
          break;
        case 'waitUntil':
          checkMoment([...stepPath, 'waitUntil'], step.waitUntil);
          break;
        case 'waitFor': {
          checkWaitFor([...stepPath, 'waitFor'], step.waitFor);
          const wait = step.waitFor;
          if (isRecord(wait)) {
            if (wait.where !== undefined) {
              checkExpression(
                [...stepPath, 'waitFor', 'where'],
                wait.where,
                WAIT_FOR_REFS,
                WORKFLOW_CONDITIONS,
                seen
              );
            }
            for (const key of ['events', 'resetOn', 'endOn'] as const) {
              const entries = wait[key];
              if (!Array.isArray(entries)) continue;
              entries.forEach((entry, entryIndex) => {
                if (isRecord(entry) && entry.where !== undefined) {
                  checkExpression(
                    [...stepPath, 'waitFor', key, entryIndex, 'where'],
                    entry.where,
                    WAIT_FOR_REFS,
                    WORKFLOW_CONDITIONS,
                    seen
                  );
                }
              });
            }
          }
          break;
        }
        case 'repeat': {
          const repeat = step.repeat;
          if (!isRecord(repeat)) {
            report(
              [...stepPath, 'repeat'],
              `"repeat" takes { "steps", "every", "max", "until" }, got ${describe(repeat)}.`
            );
            break;
          }
          checkUnknownKeys([...stepPath, 'repeat'], repeat, REPEAT_KEYS, 'a repeat step');
          if (loops.inRepeat) {
            report([...stepPath, 'repeat'], 'Repeats do not nest. Restructure with one loop.');
            break;
          }
          if (repeat.max === undefined) {
            report(
              [...stepPath, 'repeat', 'max'],
              `A repeat needs a "max": how many passes at most, ${MIN_REPEAT_PASSES} to ${MAX_REPEAT_PASSES}.`
            );
          } else if (
            typeof repeat.max !== 'number' ||
            !Number.isInteger(repeat.max) ||
            repeat.max < MIN_REPEAT_PASSES ||
            repeat.max > MAX_REPEAT_PASSES
          ) {
            report(
              [...stepPath, 'repeat', 'max'],
              `"max" takes a whole number of passes, ${MIN_REPEAT_PASSES} to ${MAX_REPEAT_PASSES}, got ${describe(repeat.max)}.`
            );
          }
          if (repeat.every === undefined) {
            report([...stepPath, 'repeat', 'every'], 'A repeat needs an "every": the pause between passes.');
          } else {
            checkDuration([...stepPath, 'repeat', 'every'], repeat.every, '"every"');
          }
          if (repeat.until !== undefined) {
            checkExpression(
              [...stepPath, 'repeat', 'until'],
              repeat.until,
              BRANCH_REFS,
              WORKFLOW_CONDITIONS,
              seen
            );
          }
          checkSteps([...stepPath, 'repeat', 'steps'], repeat.steps, depth + 1, seen, {
            ...loops,
            inRepeat: true,
          });
          break;
        }
        case 'forEach': {
          const forEach = step.forEach;
          if (!isRecord(forEach)) {
            report(
              [...stepPath, 'forEach'],
              `"forEach" takes { "items", "as", "max", "steps" }, got ${describe(forEach)}.`
            );
            break;
          }
          checkUnknownKeys([...stepPath, 'forEach'], forEach, FOREACH_KEYS, 'a forEach step');
          if (loops.inForEach) {
            report([...stepPath, 'forEach'], 'Data loops do not nest. Flatten the collection first.');
            break;
          }
          if (typeof forEach.items !== 'string' || !ITEMS_PATH_PATTERN.test(forEach.items)) {
            report(
              [...stepPath, 'forEach', 'items'],
              `"items" is a scope path to a list, such as "vars.workouts.items", got ${describe(forEach.items)}.`
            );
          } else {
            const root = forEach.items.split('.')[0] as string;
            if (!(FOREACH_ITEM_ROOTS as readonly string[]).includes(root)) {
              report(
                [...stepPath, 'forEach', 'items'],
                `"items" starts from one of ${list(FOREACH_ITEM_ROOTS)}, got "${root}".`
              );
            }
          }
          if (typeof forEach.as !== 'string' || !VAR_NAME_PATTERN.test(forEach.as)) {
            report(
              [...stepPath, 'forEach', 'as'],
              `"as" names the current item, readable as vars.<name> inside the loop, got ${describe(forEach.as)}.`
            );
          }
          if (forEach.max === undefined) {
            report(
              [...stepPath, 'forEach', 'max'],
              `A forEach needs a "max": how many items at most, 1 to ${MAX_FOREACH_ITEMS}.`
            );
          } else if (
            typeof forEach.max !== 'number' ||
            !Number.isInteger(forEach.max) ||
            forEach.max < 1 ||
            forEach.max > MAX_FOREACH_ITEMS
          ) {
            report(
              [...stepPath, 'forEach', 'max'],
              `"max" takes a whole number of items, 1 to ${MAX_FOREACH_ITEMS}, got ${describe(forEach.max)}.`
            );
          }
          checkSteps([...stepPath, 'forEach', 'steps'], forEach.steps, depth + 1, seen, {
            ...loops,
            inForEach: true,
          });
          break;
        }
        case 'branch': {
          const branch = step.branch;
          if (!Array.isArray(branch) || branch.length === 0) {
            report(
              [...stepPath, 'branch'],
              `"branch" takes a list of cases { "name", "when", "steps" }, got ${describe(branch)}.`
            );
            break;
          }
          if (branch.length > MAX_BRANCH_CASES) {
            report(
              [...stepPath, 'branch'],
              `A branch has at most ${MAX_BRANCH_CASES} cases, got ${branch.length}.`
            );
            break;
          }
          if (depth >= MAX_BRANCH_DEPTH) {
            report([...stepPath, 'branch'], `Branches nest at most ${MAX_BRANCH_DEPTH} levels deep.`);
            break;
          }
          const before = new Set(seen);
          if (known) before.add(known);
          const caseNames = new Set<string>();
          branch.forEach((entry, caseIndex) => {
            const casePath = [...stepPath, 'branch', caseIndex];
            if (!isRecord(entry)) {
              report(casePath, `A case is { "name", "when", "steps" }, got ${describe(entry)}.`);
              return;
            }
            checkUnknownKeys(casePath, entry, ['name', 'when', 'steps'], 'a case');
            if (!isStepName(entry.name)) {
              report(
                [...casePath, 'name'],
                `Every case needs a "name" of lowercase letters, digits and dashes (at most ${STEP_NAME_MAX_LENGTH} characters), got ${describe(entry.name)}.`
              );
            } else if (caseNames.has(entry.name)) {
              report([...casePath, 'name'], `"${entry.name}" is already a case of this branch.`);
            } else {
              caseNames.add(entry.name);
            }
            if (entry.when === undefined) {
              if (caseIndex !== branch.length - 1) {
                report(
                  casePath,
                  `A case without "when" always matches, so nothing after it runs. Put it last, and keep only one.`
                );
              }
            } else {
              if (entry.name === FALLBACK_CASE) {
                report(
                  [...casePath, 'name'],
                  `"${FALLBACK_CASE}" is the name of the case that runs when no other matches. Give this case a "when"-less last place, or another name.`
                );
              }
              checkExpression([...casePath, 'when'], entry.when, BRANCH_REFS, WORKFLOW_CONDITIONS, seen);
            }
            checkSteps([...casePath, 'steps'], entry.steps, depth + 1, new Set(before), loops);
          });
          break;
        }
        case 'fetch':
          checkFetch([...stepPath, 'fetch'], step.fetch);
          break;
        case 'set':
          checkSet([...stepPath, 'set'], step.set);
          break;
        case 'send':
          checkSend([...stepPath, 'send'], step.send);
          break;
      }
      if (known) seen.add(known);
    });
  };

  const checkSchedule = (path: ExpressionPath, raw: unknown) => {
    if (!isRecord(raw)) {
      report(
        path,
        `"schedule" takes { "cron": "0 10 * * MON" } or { "daily": "19:00" }, got ${describe(raw)}.`
      );
      return;
    }
    const kinds = ['cron', 'daily'].filter((key) => raw[key] !== undefined);
    if (kinds.length !== 1) {
      report(path, 'A schedule is one of "cron" or "daily".');
      return;
    }
    checkUnknownKeys(path, raw, kinds, 'a schedule');
    if (kinds[0] === 'cron') {
      const problem = cronProblem(raw.cron);
      if (problem) report([...path, 'cron'], problem);
    } else if (typeof raw.daily !== 'string' || !WALL_TIME_PATTERN.test(raw.daily)) {
      report([...path, 'daily'], `"daily" is a wall-clock time such as "19:00", got ${describe(raw.daily)}.`);
    }
  };

  const checkTrigger = (raw: unknown) => {
    if (!isRecord(raw)) {
      report(
        ['trigger'],
        `"trigger" takes { "event", "sources", "where" } or { "schedule", "timezone", "segment", "where" }, got ${describe(raw)}.`
      );
      return;
    }
    const kinds = ['event', 'schedule'].filter((key) => raw[key] !== undefined);
    if (kinds.length !== 1) {
      report(['trigger'], 'A trigger is an "event" or a "schedule", not both and not neither.');
      return;
    }
    if (kinds[0] === 'schedule') {
      checkUnknownKeys(['trigger'], raw, ['schedule', 'timezone', 'segment', 'where'], 'a schedule trigger');
      checkSchedule(['trigger', 'schedule'], raw.schedule);
      if (raw.timezone === undefined) {
        report(
          ['trigger', 'timezone'],
          `A schedule needs a "timezone": an IANA name such as "Europe/Berlin", or "${SUBSCRIBER_TIMEZONE}" for each subscriber's own.`
        );
      } else {
        checkTimezone(['trigger', 'timezone'], raw.timezone, true);
      }
      if (
        raw.segment !== undefined &&
        (typeof raw.segment !== 'string' || !SEGMENT_SLUG_PATTERN.test(raw.segment))
      ) {
        report(
          ['trigger', 'segment'],
          `"segment" is the slug of a segment, such as "active-runners", got ${describe(raw.segment)}.`
        );
      }
      if (raw.where !== undefined) {
        checkExpression(['trigger', 'where'], raw.where, SCHEDULE_REFS, HISTORY_CONDITIONS, new Set());
      }

      return;
    }
    checkUnknownKeys(['trigger'], raw, ['event', 'sources', 'where'], 'a trigger');
    checkEventName(['trigger', 'event'], raw.event);
    if (raw.sources !== undefined) {
      if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
        report(
          ['trigger', 'sources'],
          `"sources" takes a list of ${list(TRIGGER_SOURCES)}, got ${describe(raw.sources)}.`
        );
      } else {
        raw.sources.forEach((source, index) => {
          if (!(TRIGGER_SOURCES as readonly unknown[]).includes(source)) {
            report(
              ['trigger', 'sources', index],
              `"${String(source)}" is not a source. Use one of ${list(TRIGGER_SOURCES)}.`
            );
          }
        });
      }
    }
    if (raw.where !== undefined) {
      checkExpression(['trigger', 'where'], raw.where, TRIGGER_REFS, HISTORY_CONDITIONS, new Set());
    }
  };

  if (!isRecord(value)) {
    report([], `A workflow is an object with "trigger" and "steps", got ${describe(value)}.`);
    return issues;
  }
  checkUnknownKeys(
    [],
    value,
    ['trigger', 'concurrency', 'cancelOn', 'defaultTimezone', 'steps'],
    'a workflow'
  );

  checkTrigger(value.trigger);

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
        if (rule.where !== undefined) {
          checkExpression(
            ['cancelOn', index, 'where'],
            rule.where,
            CANCEL_REFS,
            HISTORY_CONDITIONS,
            new Set()
          );
        }
      });
    }
  }

  if (value.defaultTimezone !== undefined) checkTimezone(['defaultTimezone'], value.defaultTimezone, false);

  if (value.steps === undefined) {
    report(['steps'], 'A workflow needs at least one step.');
  } else if (Array.isArray(value.steps) && value.steps.length === 0) {
    report(['steps'], 'A workflow needs at least one step.');
  } else {
    checkSteps(['steps'], value.steps, 0, new Set());
  }

  return issues;
}

export function isWorkflowSpec(value: unknown): value is WorkflowSpec {
  return lintWorkflow(value).length === 0;
}

export function workflowProblem(value: unknown): string | null {
  const [issue] = lintWorkflow(value);
  return issue ? `${issue.message} (${formatWorkflowPath(issue.path)})` : null;
}
