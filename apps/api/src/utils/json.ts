import { BadRequestError, type ErrorOptions } from '@buzzkit/api/libs/error';

export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function assertJsonSize(
  value: unknown,
  maxBytes: number,
  message: string,
  options?: ErrorOptions
): void {
  if (value === undefined) return;
  if (jsonByteLength(value) > maxBytes) throw new BadRequestError(message, options);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(',')}}`;
}
