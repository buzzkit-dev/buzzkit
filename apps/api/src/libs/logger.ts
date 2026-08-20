import { env } from 'cloudflare:workers';
import { createLogger } from '@buzzkit/observability';
import { Elysia } from 'elysia';

export const log = createLogger({ fallbackService: 'buzzkit-api' });

export const logger = new Elysia({ name: 'logger' }).onAfterResponse({ as: 'global' }, async () => {
  await log.flush(env);
});
