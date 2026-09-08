import type { RateLimit } from '@buzzkit/ping/utils/budget';

export const DEFAULT_PRESENCE_SECONDS = 30;

export const MAX_PRESENCE_SECONDS = 3_600;

export const PING_RATE_LIMIT: RateLimit = { tokens: 60, perSeconds: 60, burst: 10 };
