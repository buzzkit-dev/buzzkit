import { listEvents } from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { ActorTypeSchema } from '@buzzkit/api/libs/schemas';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const events = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/workspaces/:workspaceSlug/events',
    async ({ db, workspace, query }) => {
      const { items, hasMore, nextCursor } = await listEvents(db, workspace.id, {
        cursor: query.cursor,
        limit: query.limit,
        event: query.event,
        actorType: query.actorType,
      });

      return Response.success(items, { ignoreTransform: ['data'], entity: 'event' })
        .paginated({ hasMore, nextCursor })
        .send();
    },
    {
      scope: 'events:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        event: t.Optional(t.String({ maxLength: 100 })),
        actorType: t.Optional(ActorTypeSchema),
      }),
    }
  );
