import { PASSTHROUGH } from './constants';
import { evaluatePayload } from './evaluate';
import { readPath } from './paths';
import type { MappingOutcome, SourceMapping } from './types';

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function instant(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

function normalizeEventName(providerType: string): string {
  return providerType.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
}

export function mapPayload(mapping: SourceMapping, payload: unknown): MappingOutcome {
  const providerType = text(readPath(payload, mapping.type));
  if (!providerType) return { outcome: 'dropped', reason: 'no_type', detail: `Nothing at "${mapping.type}"` };
  if (mapping.where && !evaluatePayload(mapping.where, payload)) {
    return { outcome: 'dropped', reason: 'filtered', detail: 'The "where" condition did not hold' };
  }
  const mapped = mapping.events[providerType];
  const name =
    typeof mapped === 'string'
      ? mapped
      : mapped === true || mapping.events[PASSTHROUGH] === true
        ? normalizeEventName(providerType)
        : null;
  if (!name)
    return { outcome: 'dropped', reason: 'unlisted_type', detail: `"${providerType}" is not mapped` };
  const rule = mapping.subscriber;
  const raw = text(readPath(payload, typeof rule === 'string' ? rule : rule.path));
  if (!raw) {
    return {
      outcome: 'dropped',
      reason: 'no_subscriber',
      detail: `Nothing at "${typeof rule === 'string' ? rule : rule.path}"`,
    };
  }
  const data: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(mapping.data ?? {})) {
    const value = readPath(payload, path);
    if (value !== undefined) data[key] = value;
  }
  return {
    outcome: 'event',
    event: {
      name,
      providerType,
      providerEventId: mapping.id ? text(readPath(payload, mapping.id)) : null,
      subscriber: typeof rule === 'string' ? { externalId: raw } : { attribute: rule.attribute, value: raw },
      data,
      timestamp: mapping.timestamp ? instant(readPath(payload, mapping.timestamp)) : null,
    },
  };
}
