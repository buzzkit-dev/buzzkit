import { EventFiltersSchema, listEvents } from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const events = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/workspaces/:workspaceSlug/events',
    async ({ db, workspace, query }) => {
      const { items, hasMore, nextCursor, total } = await listEvents(db, workspace.id, query);

      return Response.success(items, { ignoreTransform: ['data'], entity: 'event' })
        .paginated({ hasMore, nextCursor, total })
        .send();
    },
    {
      scope: 'events:read',
      query: t.Object({ ...PaginationQuerySchema.properties, ...EventFiltersSchema.properties }),
    }
  );
