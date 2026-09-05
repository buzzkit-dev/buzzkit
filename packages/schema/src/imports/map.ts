import { isTimezone } from '../workflows/parse/timezone';
import {
  IMPORT_CHANNELS,
  IMPORT_TARGETS,
  MAX_IMPORT_EXTERNAL_ID,
  MAX_PUSH_TOKEN_LENGTH,
  MIN_PUSH_TOKEN_LENGTH,
  SKIP_REASONS,
  TRUE_WORDS,
} from './constants';
import type {
  AvailableChannel,
  ImportChannel,
  ImportMapping,
  ImportOptions,
  ImportPlan,
  ImportRecord,
  ImportRow,
  ImportTarget,
  ImportTargetEntry,
  MappedRow,
  SkipReason,
} from './types';

type Skipped = Extract<MappedRow, { outcome: 'skipped' }>;

type Subscription = Pick<ImportRow, 'channel' | 'platform' | 'environment' | 'token' | 'address' | 'enabled'>;

function cell(record: ImportRecord, column: string | undefined): string {
  if (!column) return '';
  return record[column]?.trim() ?? '';
}

function isTrue(value: string): boolean {
  return TRUE_WORDS.has(value.trim().toLowerCase());
}

function skipped(reason: SkipReason, detail: string): Skipped {
  return { outcome: 'skipped', reason, detail };
}

function instant(value: string): string | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const millis = numeric > 100_000_000_000 ? numeric : numeric * 1000;
    return new Date(millis).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function findImportTarget(id: string): ImportTargetEntry | null {
  return IMPORT_TARGETS.find((entry) => entry.id === id) ?? null;
}

function resolveTargetId(record: ImportRecord, mapping: ImportMapping): ImportTarget | null {
  if ('value' in mapping.target) return mapping.target.value;
  const raw = cell(record, mapping.target.column);
  return mapping.target.values[raw] ?? mapping.target.values[raw.toLowerCase()] ?? null;
}

function resolveEndpoint(target: ImportTargetEntry, endpoint: string): Subscription | Skipped {
  if (target.channel === 'push') {
    if (
      endpoint.length < MIN_PUSH_TOKEN_LENGTH ||
      endpoint.length > MAX_PUSH_TOKEN_LENGTH ||
      /\s/.test(endpoint)
    ) {
      return skipped('invalid_endpoint', `"${endpoint.slice(0, 24)}" is not a push token`);
    }
    return { channel: 'push', platform: target.platform ?? undefined, token: endpoint };
  }
  if (target.channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endpoint) || endpoint.length > 254) {
      return skipped('invalid_endpoint', `"${endpoint}" is not an email address`);
    }
    return { channel: 'email', address: endpoint };
  }
  return skipped('unsupported_target', `${target.label} cannot be imported yet`);
}

function resolveExternalId(
  record: ImportRecord,
  mapping: ImportMapping,
  options: ImportOptions
): { externalId: string; anonymous: boolean } | Skipped {
  const own = cell(record, mapping.externalId);
  if (own) {
    if (own.length > MAX_IMPORT_EXTERNAL_ID) {
      return skipped('no_external_id', 'The external id is longer than 256 characters');
    }
    return { externalId: own, anonymous: false };
  }

  const providerId = cell(record, mapping.id);
  if (options.anonymous === 'skip' || !providerId) {
    return skipped('no_external_id', 'No external id on the row');
  }
  return { externalId: `${options.idPrefix}:${providerId}`, anonymous: true };
}

function resolveSubscription(
  record: ImportRecord,
  mapping: ImportMapping,
  options: ImportOptions
): Subscription | Skipped {
  const endpoint = cell(record, mapping.endpoint);
  if (!endpoint) {
    if (mapping.endpoint) return skipped('no_endpoint', 'No token or address on the row');
    return {};
  }

  const targetId = resolveTargetId(record, mapping);
  const target = targetId ? findImportTarget(targetId) : null;
  if (!target) {
    const raw = 'column' in mapping.target ? cell(record, mapping.target.column) : '';
    return skipped(
      'unsupported_target',
      raw ? `Device type "${raw}" is not a subscription BuzzKit knows` : 'No device type on the row'
    );
  }
  if (!target.available) return skipped('unsupported_target', `${target.label} cannot be imported yet`);

  const subscription = resolveEndpoint(target, endpoint);
  if ('outcome' in subscription) return subscription;
  if (target.platform === 'ios') subscription.environment = options.environment;
  if (mapping.unsubscribed && isTrue(cell(record, mapping.unsubscribed.column))) {
    if (options.unsubscribed === 'skip') {
      return skipped('unsubscribed', 'The provider marked this subscription as unsubscribed');
    }
    subscription.enabled = false;
  }
  return subscription;
}

function resolveAttributes(
  record: ImportRecord,
  mapping: ImportMapping
): Record<string, unknown> | undefined {
  const attributes: Record<string, unknown> = {};
  const json = cell(record, mapping.attributes?.json);
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!key.startsWith('$')) attributes[key] = value;
        }
      }
    } catch {
      return undefined;
    }
  }
  for (const column of mapping.attributes?.columns ?? []) {
    const value = cell(record, column);
    if (value && !column.startsWith('$')) attributes[column] = value;
  }
  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function resolveDevice(record: ImportRecord, mapping: ImportMapping): ImportRow['device'] {
  const device: NonNullable<ImportRow['device']> = {};
  const appVersion = cell(record, mapping.appVersion);
  const osVersion = cell(record, mapping.osVersion);
  const model = cell(record, mapping.model);
  if (appVersion) device.appVersion = appVersion.slice(0, 40);
  if (osVersion) device.osVersion = osVersion.slice(0, 40);
  if (model) device.model = model.slice(0, 60);
  return Object.keys(device).length > 0 ? device : undefined;
}

function resolveProfile(record: ImportRecord, mapping: ImportMapping): Partial<ImportRow> {
  const profile: Partial<ImportRow> = {};
  const attributes = resolveAttributes(record, mapping);
  if (attributes) profile.attributes = attributes;
  const timezone = cell(record, mapping.timezone);
  if (isTimezone(timezone)) profile.timezone = timezone;
  const language = cell(record, mapping.language);
  if (language) profile.language = language.slice(0, 20);
  const country = cell(record, mapping.country);
  if (/^[A-Za-z]{2}$/.test(country)) profile.country = country.toUpperCase();
  const device = resolveDevice(record, mapping);
  if (device) profile.device = device;
  const lastSeenAt = instant(cell(record, mapping.lastSeenAt));
  if (lastSeenAt) profile.lastSeenAt = lastSeenAt;
  return profile;
}

export function mapImportRecord(
  record: ImportRecord,
  mapping: ImportMapping,
  options: ImportOptions
): MappedRow {
  const identity = resolveExternalId(record, mapping, options);
  if ('outcome' in identity) return identity;

  const subscription = resolveSubscription(record, mapping, options);
  if ('outcome' in subscription) return subscription;

  const row: ImportRow = {
    externalId: identity.externalId,
    ...subscription,
    ...resolveProfile(record, mapping),
  };
  return { outcome: 'row', row, anonymous: identity.anonymous };
}

function emptyCounts(): ImportPlan['counts'] {
  return {
    records: 0,
    rows: 0,
    anonymous: 0,
    muted: 0,
    byTarget: Object.fromEntries(IMPORT_TARGETS.map((target) => [target.id, 0])) as Record<
      ImportTarget,
      number
    >,
    byChannel: Object.fromEntries(IMPORT_CHANNELS.map((channel) => [channel, 0])) as Record<
      ImportChannel,
      number
    >,
    byReason: Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0])) as Record<SkipReason, number>,
  };
}

function targetOf(row: ImportRow): ImportTargetEntry | null {
  if (!row.channel) return null;
  return (
    IMPORT_TARGETS.find(
      (entry) => entry.channel === row.channel && entry.platform === (row.platform ?? null)
    ) ?? null
  );
}

export function planImport(
  records: ImportRecord[],
  mapping: ImportMapping,
  options: ImportOptions
): ImportPlan {
  const plan: ImportPlan = { rows: [], skipped: [], counts: emptyCounts() };
  plan.counts.records = records.length;

  records.forEach((record, index) => {
    const mapped = mapImportRecord(record, mapping, options);
    if (mapped.outcome === 'skipped') {
      plan.skipped.push({ index, reason: mapped.reason, detail: mapped.detail });
      plan.counts.byReason[mapped.reason] += 1;
      return;
    }
    plan.rows.push(mapped.row);
    plan.counts.rows += 1;
    if (mapped.anonymous) plan.counts.anonymous += 1;
    if (mapped.row.enabled === false) plan.counts.muted += 1;
    const target = targetOf(mapped.row);
    if (target) {
      plan.counts.byTarget[target.id] += 1;
      plan.counts.byChannel[target.channel as AvailableChannel] += 1;
    }
  });

  return plan;
}
