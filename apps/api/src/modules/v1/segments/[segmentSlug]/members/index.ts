import {
  countSegmentMembers,
  findSegmentBySlug,
  listSegmentMembers,
  listSubscribersByIds,
} from '@buzzkit/api/api/segments/index';
import { serializeSubscriberListItem } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import { clampLimit, PaginationQuerySchema, resolveCursor } from '@buzzkit/api/utils/pagination';
import type { Expression } from 'buzzkit/expressions';
import Elysia, { t } from 'elysia';

export const segmentMembers = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Segments'] } })
  .get(
    '/segments/:segmentSlug/members',
    async ({ db, params, query, tenant }) => {
      const found = await findSegmentBySlug(db, tenant.id, params.segmentSlug);
      const expression = found.version.expression as Expression;
      const afterSubscriberId = resolveCursor(query.cursor, (cursor) =>
        /^\d+$/.test(cursor) ? Number(cursor) : undefined
      );
      const limit = clampLimit(query.limit);

      const [count, members] = await Promise.all([
        afterSubscriberId === undefined ? countSegmentMembers(tenant.id, expression) : null,
        listSegmentMembers(tenant.id, expression, { afterSubscriberId, limit }),
      ]);
      const subscribers = await listSubscribersByIds(
        db,
        tenant.id,
        members.items.map((member) => member.subscriber_id)
      );
      const byId = new Map(subscribers.map((subscriber) => [subscriber.id, subscriber]));
      const items = members.items.flatMap((member) => {
        const subscriber = byId.get(member.subscriber_id);
        return subscriber ? [serializeSubscriberListItem(subscriber)] : [];
      });

      return Response.success(items, { entity: 'subscriber', ignoreTransform: ['attributes'] })
        .paginated({
          hasMore: members.hasMore,
          nextCursor: members.nextCursor === null ? null : String(members.nextCursor),
          ...(count === null ? {} : { total: count }),
        })
        .send();
    },
    {
      tenant: 'segments:read',
      params: t.Object({ segmentSlug: SlugSchema }),
      query: t.Object({ ...PaginationQuerySchema.properties }),
    }
  );
