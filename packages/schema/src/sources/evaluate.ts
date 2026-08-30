import type { Expression } from 'buzzkit/expressions';
import { readPath } from './paths';

function ordered<T extends number | string>(
  value: T,
  bound: T,
  operator: 'gt' | 'gte' | 'lt' | 'lte'
): boolean {
  if (operator === 'gt') return value > bound;
  if (operator === 'gte') return value >= bound;
  if (operator === 'lt') return value < bound;
  return value <= bound;
}

function compare(value: unknown, record: Record<string, unknown>): boolean {
  if ('exists' in record) return record.exists === (value !== undefined && value !== null);
  if ('eq' in record) return value === record.eq;
  if ('neq' in record) return value !== record.neq;
  if ('in' in record) return Array.isArray(record.in) && record.in.includes(value as never);
  if ('contains' in record) return typeof value === 'string' && value.includes(String(record.contains));
  for (const operator of ['gt', 'gte', 'lt', 'lte'] as const) {
    if (!(operator in record)) continue;
    const bound = record[operator];
    if (typeof value === 'number' && typeof bound === 'number') return ordered(value, bound, operator);
    if (typeof value === 'string' && typeof bound === 'string') return ordered(value, bound, operator);
    return false;
  }
  return false;
}

export function evaluatePayload(expression: Expression, payload: unknown): boolean {
  const record = expression as Record<string, unknown>;
  if (Array.isArray(record.all))
    return (record.all as Expression[]).every((node) => evaluatePayload(node, payload));
  if (Array.isArray(record.any))
    return (record.any as Expression[]).some((node) => evaluatePayload(node, payload));
  if (record.not !== undefined) return !evaluatePayload(record.not as Expression, payload);
  if (typeof record.ref === 'string') return compare(readPath(payload, record.ref), record);
  return false;
}
