import {
  countSegmentMembers,
  listSegmentMembers,
  listSubscribersByIds,
  PreviewSegmentSchema,
  SEGMENT_PREVIEW_LIMIT,
} from '@buzzkit/api/api/segments/index';
import { serializeSubscriberListItem } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia from 'elysia';

export const segmentsPreview = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Segments'] } })
  .post(
    '/segments/preview',
    async ({ body, db, tenant }) => {
      const [count, members] = await Promise.all([
        countSegmentMembers(tenant.id, body.expression),
        listSegmentMembers(tenant.id, body.expression, { limit: SEGMENT_PREVIEW_LIMIT }),
      ]);
      const subscribers = await listSubscribersByIds(
        db,
        tenant.id,
        members.items.map((member) => member.subscriber_id)
      );
      const byId = new Map(subscribers.map((subscriber) => [subscriber.id, subscriber]));
      const sample = members.items.flatMap((member) => {
        const subscriber = byId.get(member.subscriber_id);
        return subscriber
          ? [{ ...serializeSubscriberListItem(subscriber), id: encodeId('subscriber', subscriber.id) }]
          : [];
      });
      return Response.success({ count, sample }, { ignoreTransform: ['attributes'] }).send();
    },
    { tenant: 'segments:read', body: PreviewSegmentSchema }
  );
