import { listEvents } from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { MAX_PAGE_SIZE } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const events = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/workspaces/:slug/events',
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
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_PAGE_SIZE })),
        event: t.Optional(t.String({ maxLength: 100 })),
        actorType: t.Optional(
          t.Union([t.Literal('member'), t.Literal('user'), t.Literal('key'), t.Literal('system')])
        ),
      }),
    }
  );
