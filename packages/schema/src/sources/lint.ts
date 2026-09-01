import { EVENT_NAME_PATTERN, lintExpression } from 'buzzkit/expressions';
import {
  HEADER_NAME_PATTERN,
  MAX_MAPPED_EVENTS,
  MAX_PICKED_PATHS,
  PASSTHROUGH,
  VERIFICATION_SCHEMES,
} from './constants';
import { isPayloadPath } from './paths';
import type { SourceMapping, Verification } from './types';

export type MappingProblem = { path: (string | number)[]; message: string };

const PAYLOAD_REFS = { roots: [], bare: [], label: 'a payload', any: true } as const;

const MAPPING_KEYS = ['type', 'id', 'timestamp', 'subscriber', 'events', 'data', 'where'] as const;

const DATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function lintSourceMapping(raw: unknown): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const report = (path: (string | number)[], message: string) => problems.push({ path, message });
  if (!isRecord(raw))
    return [{ path: [], message: 'A mapping is an object with "type", "subscriber" and "events".' }];
  for (const key of Object.keys(raw)) {
    if (!(MAPPING_KEYS as readonly string[]).includes(key)) {
      report(
        [key],
        `"${key}" is not a mapping key. Use ${MAPPING_KEYS.map((name) => `"${name}"`).join(', ')}.`
      );
    }
  }
  for (const key of ['type', 'id', 'timestamp'] as const) {
    const value = raw[key];
    if (value === undefined) {
      if (key === 'type') report([key], '"type" is the path to the provider\'s event type, such as "type".');
      continue;
    }
    if (!isPayloadPath(value))
      report([key], `"${key}" is a path into the payload, such as "data.object.id".`);
  }
  const subscriber = raw.subscriber;
  if (subscriber === undefined) {
    report(
      ['subscriber'],
      '"subscriber" says where the external id is: a path, or { path, attribute } to look it up.'
    );
  } else if (typeof subscriber === 'string') {
    if (!isPayloadPath(subscriber)) report(['subscriber'], '"subscriber" is a path into the payload.');
  } else if (isRecord(subscriber)) {
    if (!isPayloadPath(subscriber.path))
      report(['subscriber', 'path'], '"subscriber.path" is a path into the payload.');
    if (typeof subscriber.attribute !== 'string' || !DATA_KEY_PATTERN.test(subscriber.attribute)) {
      report(
        ['subscriber', 'attribute'],
        '"subscriber.attribute" names the subscriber attribute the value is matched against.'
      );
    }
  } else {
    report(['subscriber'], '"subscriber" is a path, or { path, attribute }.');
  }
  const events = raw.events;
  if (!isRecord(events) || Object.keys(events).length === 0) {
    report(
      ['events'],
      '"events" maps the provider\'s types to your event names, or { "*": true } to pass every type through.'
    );
  } else {
    if (Object.keys(events).length > MAX_MAPPED_EVENTS) {
      report(['events'], `"events" maps at most ${MAX_MAPPED_EVENTS} types.`);
    }
    for (const [providerType, name] of Object.entries(events)) {
      if (providerType === PASSTHROUGH) {
        if (name !== true)
          report(
            ['events', providerType],
            '"*" takes true: every unlisted type passes through under its own name.'
          );
        continue;
      }
      if (name === true) continue;
      if (typeof name !== 'string' || !EVENT_NAME_PATTERN.test(name) || name.startsWith('$')) {
        report(
          ['events', providerType],
          `"${providerType}" needs an event name (lowercase letters, digits, dots, underscores and hyphens, never starting with "$"), or true to keep the provider's name.`
        );
      }
    }
  }
  const data = raw.data;
  if (data !== undefined) {
    if (!isRecord(data)) report(['data'], '"data" is an object of keys to payload paths.');
    else {
      if (Object.keys(data).length > MAX_PICKED_PATHS)
        report(['data'], `"data" picks at most ${MAX_PICKED_PATHS} paths.`);
      for (const [key, path] of Object.entries(data)) {
        if (!DATA_KEY_PATTERN.test(key))
          report(
            ['data', key],
            `"${key}" is not a data key: a letter followed by letters, digits and underscores.`
          );
        if (!isPayloadPath(path)) report(['data', key], `"data.${key}" is a path into the payload.`);
      }
    }
  }
  if (raw.where !== undefined) {
    for (const issue of lintExpression(raw.where, { refs: PAYLOAD_REFS, kinds: ['ref'] })) {
      report(['where', ...issue.path], issue.message);
    }
  }

  return problems;
}

export function isSourceMapping(raw: unknown): raw is SourceMapping {
  return lintSourceMapping(raw).length === 0;
}

export function lintVerification(raw: unknown): MappingProblem[] {
  if (!isRecord(raw)) {
    return [{ path: [], message: 'A verification is an object with a "scheme".' }];
  }
  const scheme = raw.scheme;
  if (typeof scheme !== 'string' || !(VERIFICATION_SCHEMES as readonly string[]).includes(scheme)) {
    return [
      {
        path: ['scheme'],
        message: `"scheme" is one of ${VERIFICATION_SCHEMES.map((name) => `"${name}"`).join(', ')}.`,
      },
    ];
  }
  const problems: MappingProblem[] = [];
  const header = (path: (string | number)[], value: unknown) => {
    if (typeof value !== 'string' || !HEADER_NAME_PATTERN.test(value)) {
      problems.push({ path, message: 'A header name is lowercase letters, digits and hyphens.' });
    }
  };
  if (scheme === 'header') header(['header'], raw.header);
  if (scheme === 'stripe' && raw.header !== undefined) header(['header'], raw.header);
  if (scheme === 'standard-webhooks') {
    if (!isRecord(raw.headers)) {
      problems.push({
        path: ['headers'],
        message: '"headers" names the id, timestamp and signature headers the sender uses.',
      });
    } else {
      for (const key of ['id', 'timestamp', 'signature'] as const) header(['headers', key], raw.headers[key]);
    }
  }

  return problems;
}

export function isVerification(raw: unknown): raw is Verification {
  return lintVerification(raw).length === 0;
}
