import { PAYLOAD_PATH_PATTERN } from './constants';

export function isPayloadPath(path: unknown): path is string {
  return typeof path === 'string' && PAYLOAD_PATH_PATTERN.test(path);
}

export function readPath(payload: unknown, path: string): unknown {
  let current: unknown = payload;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = Array.isArray(current) ? current[Number(key)] : (current as Record<string, unknown>)[key];
  }
  return current;
}

export function listPaths(
  payload: unknown,
  prefix = '',
  depth = 0,
  into: Array<{ path: string; value: unknown }> = []
) {
  if (depth > 6 || payload === null || typeof payload !== 'object') return into;
  const entries = Array.isArray(payload)
    ? payload.slice(0, 3).map((value, index) => [String(index), value] as const)
    : Object.entries(payload as Record<string, unknown>);
  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') listPaths(value, path, depth + 1, into);
    else into.push({ path, value });
  }
  return into;
}
