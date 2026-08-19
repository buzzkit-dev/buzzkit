import { v1 } from '@buzzkit/api/modules/v1/index';
import cors from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import Elysia from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';

export const app = new Elysia({
  adapter: CloudflareAdapter,
})
  .use(cors())
  .use(
    openapi({
      path: '/swagger',
    })
  )
  .use(v1);
