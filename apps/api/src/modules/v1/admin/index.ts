import { AdminWorkspaceQuerySchema, listEveryWorkspace, requireAdmin } from '@buzzkit/api/api/admin/index';
import {
  collectRates,
  collectStats,
  resolveStatsInterval,
  resolveStatsRange,
  StatsQuerySchema,
} from '@buzzkit/api/api/stats/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

const adminOnly = { account: 'read', beforeHandle: requireAdmin } as const;

export const admin = new Elysia({ prefix: '/admin' })
  .use(auth)
  .guard({ detail: { hide: true, tags: ['Admin'] } })
  .get(
    '/workspaces',
    async ({ db, user, query }) => {
      return Response.page(await listEveryWorkspace(db, user.id, query), { entity: 'workspace' }).send();
    },
    { ...adminOnly, query: AdminWorkspaceQuerySchema }
  )
  .get(
    '/stats',
    async ({ db, query }) => {
      const range = resolveStatsRange(query);
      const collected = await collectStats(db, null, range, resolveStatsInterval(range, query.interval));
      return Response.success(collected).send();
    },
    { ...adminOnly, query: StatsQuerySchema }
  )
  .get('/rates', async ({ db }) => Response.success(await collectRates(db)).send(), adminOnly);
