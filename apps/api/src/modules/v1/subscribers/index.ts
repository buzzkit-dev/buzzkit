import { listSubscribers, serializeSubscriber } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscribers = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .get(
    '/subscribers',
    async ({ db, query, tenant }) => {
      const limit = clampLimit(query.limit);
      const afterId = resolveCursor(query.cursor, (id) => decodeEntityId('subscriber', id));

      const rows = await listSubscribers(db, tenant.id, { limit, afterId });
      const page = toPage(rows, limit, (id) => encodeId('subscriber', id));

      return Response.success(
        page.items.map(serializeSubscriber).map((item) => ({
          ...item,
          id: encodeId('subscriber', item.id),
        })),
        { ignoreTransform: ['attributes'] }
      )
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor })
        .send();
    },
    {
      tenant: 'subscribers:read',
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        cursor: t.Optional(t.String()),
      }),
    }
  );
