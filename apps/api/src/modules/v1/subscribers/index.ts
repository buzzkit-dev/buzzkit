import {
  countSubscribers,
  listSubscribers,
  serializeSubscriberListItem,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscribers = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .get(
    '/subscribers',
    async ({ db, query, tenant }) => {
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('subscriber', id));

      const [rows, total] = await Promise.all([
        listSubscribers(db, tenant.id, { limit, beforeId }),
        countSubscribers(db, tenant.id),
      ]);

      const page = toPage(rows, limit, (id) => encodeId('subscriber', id));

      return Response.success(
        page.items.map(serializeSubscriberListItem).map((item) => ({
          ...item,
          id: encodeId('subscriber', item.id),
        })),
        { ignoreTransform: ['attributes'] }
      )
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor, total })
        .send();
    },
    {
      tenant: 'subscribers:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
      }),
    }
  );
