import {
  collectStats,
  resolveStatsInterval,
  resolveStatsRange,
  StatsQuerySchema,
} from '@buzzkit/api/api/stats/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const stats = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Stats'] } })
  .get(
    '/stats',
    async ({ db, query, tenant }) => {
      const range = resolveStatsRange(query);
      const collected = await collectStats(db, tenant.id, range, resolveStatsInterval(range, query.interval));
      return Response.success(collected).send();
    },
    { tenant: 'messages:read', query: StatsQuerySchema }
  );
