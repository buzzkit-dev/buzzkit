import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RESOURCES = join(import.meta.dirname, '../../src/resources');

const NAMESPACE = join(import.meta.dirname, '../../src/server/buzzkit.ts');

function listResourceTypes(): string[] {
  const names: string[] = [];

  for (const file of readdirSync(RESOURCES)) {
    if (!file.endsWith('.ts') || file === 'index.ts' || file === 'list.ts') continue;

    const source = readFileSync(join(RESOURCES, file), 'utf8');
    for (const match of source.matchAll(/^export type (\w+)/gm)) {
      const name = match[1] as string;
      if (!name.endsWith('Resource')) names.push(name);
    }
  }

  return names.sort();
}

function listNamespacedTypes(): string[] {
  const source = readFileSync(NAMESPACE, 'utf8');
  return [...source.matchAll(/^ {2}export type (\w+)(?:<[^>]*>)? = R\.\w+/gm)]
    .map((match) => match[1] as string)
    .sort();
}

describe('the BuzzKit namespace', () => {
  it('exposes every resource type', () => {
    const missing = listResourceTypes().filter((name) => !listNamespacedTypes().includes(name));

    expect(
      missing,
      `add these to the BuzzKit namespace in src/server/buzzkit.ts: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('does not alias a type that no longer exists', () => {
    const resources = listResourceTypes();
    const orphaned = listNamespacedTypes().filter((name) => !resources.includes(name));

    expect(orphaned, `remove these from the BuzzKit namespace: ${orphaned.join(', ')}`).toEqual([]);
  });
});
