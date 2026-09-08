import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemas = readFileSync(
  resolve(import.meta.dirname, '../../../../api/src/api/messages/schemas.ts'),
  'utf8'
);

const ping = readFileSync(resolve(import.meta.dirname, '../../../src/api/ping/schemas.ts'), 'utf8');

function limit(source: string, field: string): number {
  const match = source.match(new RegExp(`${field}:[^\\n]*maxLength: (\\d+)`));
  if (!match) throw new Error(`no maxLength for ${field}`);
  return Number(match[1]);
}

function bound(
  source: string,
  field: string,
  kind: 'minimum' | 'maximum' | 'maxLength' | 'maxItems'
): number {
  const match = source.match(new RegExp(`${field}:[^\\n]*${kind}: ([\\d_]+)`));
  if (!match) throw new Error(`no ${kind} for ${field}`);
  return Number(match[1].replaceAll('_', ''));
}

describe('what ping sends must be accepted by the buzzkit API', () => {
  it('keeps a session id short enough to be a collapse id', () => {
    expect(bound(ping, 'session', 'maxLength')).toBeLessThanOrEqual(limit(schemas, 'collapseId'));
  });

  it('keeps a session id short enough to be a thread id', () => {
    expect(bound(ping, 'session', 'maxLength')).toBeLessThanOrEqual(limit(schemas, 'threadId'));
  });

  it('never asks for a ttl below the floor the API accepts', () => {
    expect(bound(ping, 'ttl', 'minimum')).toBeGreaterThanOrEqual(bound(schemas, 'ttlSeconds', 'minimum'));
  });

  it('never asks for a ttl above the ceiling the API accepts', () => {
    const constants = readFileSync(
      resolve(import.meta.dirname, '../../../../api/src/api/messages/constants.ts'),
      'utf8'
    );
    const parts = constants.match(/MAX_TTL_SECONDS = ([\d\s*]+);/)?.[1] ?? '';
    const ceiling = parts.split('*').reduce((total, part) => total * Number(part.trim()), 1);

    expect(ceiling).toBeGreaterThan(0);
    expect(bound(ping, 'ttl', 'maximum')).toBeLessThanOrEqual(ceiling);
  });

  it('keeps a title inside what a message accepts', () => {
    expect(bound(ping, 'title', 'maxLength')).toBeLessThanOrEqual(limit(schemas, 'title'));
  });
});
