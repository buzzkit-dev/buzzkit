import { DAY_MS } from '@buzzkit/api/libs/timezone';

import type { EventVolumeRange } from './types';

export const EVENT_SOURCES = ['server', 'ios', 'android', 'web', 'system'] as const;

export const CLIENT_SOURCES = ['ios', 'android', 'web'] as const;

export const RESERVED_EVENT_PREFIX = '$';

export const MAX_EVENTS_PER_REQUEST = 100;

export const INGEST_CONCURRENCY = 5;

export const MAX_EVENT_DATA_BYTES = 8 * 1024;

export const MAX_EVENT_AGE_MS = 7 * DAY_MS;

export const MAX_EVENT_SKEW_MS = 60 * 60 * 1000;

export const EVENTS_TOKEN_TTL_SECONDS = 60 * 60;

export const EVENTS_TOKEN_RPS = 20;

export const VOLUME_BUCKET_SECONDS: Record<EventVolumeRange, number> = {
  '24h': 3600,
  '7d': 21600,
  '30d': 86400,
};

export const VOLUME_RANGE_HOURS: Record<EventVolumeRange, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};
