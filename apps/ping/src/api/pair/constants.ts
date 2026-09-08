import type { RateLimit } from '@buzzkit/ping/utils/budget';

export const EXTERNAL_ID_PREFIX = 'buzz_';

export const CODE_TTL_SECONDS = 300;

export const PAIR_RATE_LIMIT: RateLimit = { tokens: 5, perSeconds: 3_600, burst: 3 };
