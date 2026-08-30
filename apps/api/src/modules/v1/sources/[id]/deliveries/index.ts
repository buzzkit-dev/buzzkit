import {
  countDeliveries,
  findSource,
  listDeliveries,
  serializeDelivery,
} from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { DELIVERY_OUTCOMES, type DeliveryOutcome } from '@buzzkit/schema/sources';
import Elysia, { t } from 'elysia';

export const sourceDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .get(
    '/sources/:id/deliveries',
    async ({ db, params, query, tenant }) => {
      const sourceId = decodeEntityId('source', params.id);
      if (sourceId === undefined) throw new NotFoundError('Source not found');

      const target = await findSource(db, tenant.id, sourceId);
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('sourceDelivery', id));

      const outcome = (DELIVERY_OUTCOMES as readonly string[]).includes(query.outcome ?? '')
        ? (query.outcome as DeliveryOutcome)
        : undefined;
      const [rows, total] = await Promise.all([
        listDeliveries(db, target.id, { limit, beforeId, outcome }),
        countDeliveries(db, target.id, outcome),
      ]);
      const page = toPage(rows, limit, (id) => encodeId('sourceDelivery', id));

      return Response.success(page.items.map(serializeDelivery), {
        entity: 'sourceDelivery',
        ignoreTransform: ['payload'],
      })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor, total })
        .send();
    },
    {
      tenant: 'sources:read',
      query: t.Object({ ...PaginationQuerySchema.properties, outcome: t.Optional(t.String()) }),
    }
  );
