import { authHandler } from '@buzzkit/api/libs/auth';
import { error } from '@buzzkit/api/libs/error';
import { logger } from '@buzzkit/api/libs/logger';
import { v1 } from '@buzzkit/api/modules/v1/index';
import cors from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import Elysia from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';

export const app = new Elysia({
  adapter: CloudflareAdapter,
})
  .use(cors())
  .use(logger)
  .use(error)
  .use(
    openapi({
      path: '/swagger',
    })
  )
  .use(authHandler)
  .use(v1);
