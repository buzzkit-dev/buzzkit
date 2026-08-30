import { workflowStatus } from '@buzzkit/database';

export const WORKFLOW_STATUSES = workflowStatus.enumValues;

export const WORKFLOW_RESERVED_SLUGS = new Set(['new']);

export const DEFINITIONS_KEY_PREFIX = 'defs:';

export const DEFINITIONS_VERSION_KEY_PREFIX = 'defs-version:';

export const SCHEDULE_LOOKBACK_MS = 10 * 60_000;

export const SCHEDULE_MAX_FIRES_PER_TICK = 20;

export const SCHEDULE_OPEN_FIRES_PER_ROUND = 50;

export const SCHEDULE_DRAIN_ROUNDS = 40;

export const SCHEDULE_MEMBERS_PER_TICK = 3000;

export const SCHEDULE_MEMBER_PAGE = 500;

export const SCHEDULE_START_CONCURRENCY = 20;

export const SCHEDULE_NEXT_FIRES = 10;
