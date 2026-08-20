import {
  CreateMessageSchema,
  createMessage,
  enqueueFanout,
  listMessages,
  serializeMessage,
} from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const messages = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .post(
    '/messages',
    async ({ body, db, set, tenant, event }) => {
      const { message, created } = await createMessage(db, tenant, body);

      if (created) {
        await event({
          event: 'message.created',
          tenantId: tenant.id,
          target: { type: 'message', id: message.id },
          data: { channel: message.channel, topic: message.topic, targets: message.targets },
        });
        await enqueueFanout(message.id);
      }

      return Response.success(serializeMessage(message), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets'],
      })
        .status(created ? 202 : 200)
        .send(set);
    },
    {
      tenant: 'messages:send',
      body: CreateMessageSchema,
    }
  )
  .get(
    '/messages',
    async ({ db, query, tenant }) => {
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('message', id));

      const rows = await listMessages(db, tenant.id, { limit, beforeId });
      const page = toPage(rows, limit, (id) => encodeId('message', id));

      return Response.success(page.items.map(serializeMessage), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets'],
      })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor })
        .send();
    },
    {
      tenant: 'messages:read',
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        cursor: t.Optional(t.String()),
      }),
    }
  );
