import { env } from 'cloudflare:workers';
import { authHandler } from '@buzzkit/api/libs/auth/index';
import { error } from '@buzzkit/api/libs/error';
import { latency } from '@buzzkit/api/libs/latency';
import { logger } from '@buzzkit/api/libs/logger';
import { telemetry } from '@buzzkit/api/libs/telemetry';
import { v1 } from '@buzzkit/api/modules/v1/index';
import cors from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import Elysia from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';

export const app = new Elysia({
  adapter: CloudflareAdapter,
})
  .use(latency)
  .use(cors({ origin: [env.DASHBOARD_URL], credentials: true }))
  .use(logger)
  .use(telemetry)
  .use(error)
  .use(
    openapi({
      path: '/swagger',
    })
  )
  .use(authHandler)
  .use(v1);
