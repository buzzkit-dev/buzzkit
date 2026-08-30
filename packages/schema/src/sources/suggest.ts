import { listPaths, readPath } from './paths';
import { detectProvider, SOURCE_PRESETS } from './presets';
import type { MappingSuggestions, Suggestion } from './types';

const TYPE_KEYS = ['type', 'event', 'event_type', 'eventType', 'name', 'action'];

const ID_KEYS = ['id', 'event_id', 'eventId', 'message_id', 'uuid'];

const TIME_KEYS = ['created', 'created_at', 'createdAt', 'timestamp', 'occurred_at', 'time', 'ts'];

const USER_KEYS = /user|customer|subscriber|external|account|member|uid/i;

const TYPE_VALUE = /^[a-z][a-z0-9_]*([._][a-z0-9_]+)+$/;

function tail(path: string): string {
  return path.split('.').pop() ?? path;
}

function looksLikeTime(value: unknown): boolean {
  if (typeof value === 'number') return value > 1_000_000_000 && value < 100_000_000_000_000;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

export function suggestMapping(
  sample: unknown,
  headers: Record<string, string> = {},
  known: { externalIds?: string[] } = {}
): MappingSuggestions {
  const provider = detectProvider(headers, sample);
  const paths = listPaths(sample);
  const type: Suggestion[] = [];
  const id: Suggestion[] = [];
  const timestamp: Suggestion[] = [];
  const subscriber: Suggestion[] = [];
  const data: Suggestion[] = [];
  const ids = new Set(known.externalIds ?? []);
  for (const { path, value } of paths) {
    const key = tail(path);
    if (typeof value === 'string' && ids.has(value))
      subscriber.push({ path, value, why: 'matches a subscriber' });
    if (typeof value === 'string' && TYPE_KEYS.includes(key) && TYPE_VALUE.test(value)) {
      type.push({ path, value, why: `"${key}" holds a dotted name` });
    } else if (typeof value === 'string' && TYPE_VALUE.test(value) && path.split('.').length <= 2) {
      type.push({ path, value, why: 'looks like an event name' });
    }
    if (typeof value === 'string' && ID_KEYS.includes(key) && value.length >= 8)
      id.push({ path, value, why: `"${key}"` });
    if (TIME_KEYS.includes(key) && looksLikeTime(value))
      timestamp.push({ path, value, why: `"${key}" is a time` });
    if (typeof value === 'string' && USER_KEYS.test(key) && !ids.has(value)) {
      subscriber.push({ path, value, why: `"${key}" names a user` });
    }
    if (
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      path.split('.').length <= 3
    ) {
      data.push({ path, value, why: 'a scalar near the top' });
    }
  }
  if (provider) {
    const preset = SOURCE_PRESETS[provider].mapping;
    const first = (list: Suggestion[], path: string | undefined, why: string) => {
      if (!path) return;
      const value = readPath(sample, path);
      list.unshift({ path, value, why });
      for (let index = list.length - 1; index > 0; index -= 1)
        if (list[index]?.path === path) list.splice(index, 1);
    };
    first(type, preset.type, `${SOURCE_PRESETS[provider].label} preset`);
    first(id, preset.id, `${SOURCE_PRESETS[provider].label} preset`);
    first(timestamp, preset.timestamp, `${SOURCE_PRESETS[provider].label} preset`);
    first(
      subscriber,
      typeof preset.subscriber === 'string' ? preset.subscriber : preset.subscriber.path,
      `${SOURCE_PRESETS[provider].label} preset`
    );
  }
  return { provider, type, id, timestamp, subscriber, data: data.slice(0, 20) };
}
