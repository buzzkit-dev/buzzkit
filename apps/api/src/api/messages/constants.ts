import { messageStatus } from '@buzzkit/database';

export const MAX_DIRECT_TARGETS = 1000;
export const MAX_PAYLOAD_BYTES = 8 * 1024;
export const FANOUT_PAGE_SIZE = 500;
export const QUEUE_BATCH_SIZE = 100;
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
export const MAX_TTL_SECONDS = 28 * 24 * 60 * 60;

export const MESSAGE_STATUSES = messageStatus.enumValues;
export const DUE_MESSAGES_LIMIT = 200;
