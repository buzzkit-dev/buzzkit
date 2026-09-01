import { deepEqual } from '@buzzkit/api/utils/equality';

export function diffForEvent<T extends Record<string, unknown>>(
  before: T,
  after: T,
  ignore: readonly string[] = ['updatedAt']
): { changes: string[]; previousAttributes: Record<string, unknown> } {
  const changes: string[] = [];
  const previous: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    if (ignore.includes(key)) continue;

    const a = before[key];
    const b = after[key];
    if (!deepEqual(a instanceof Date ? a.getTime() : a, b instanceof Date ? b.getTime() : b)) {
      changes.push(key);
      previous[key] = a;
    }
  }

  return { changes, previousAttributes: previous };
}
