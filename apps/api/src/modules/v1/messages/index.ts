import {
  CreateMessageSchema,
  countMessages,
  createMessage,
  enqueueFanout,
  listMessages,
  serializeMessage,
} from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const messages = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .get(
    '/messages',
    async ({ db, query, tenant }) => {
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('message', id));

      const [rows, total] = await Promise.all([
        listMessages(db, tenant.id, { limit, beforeId }),
        countMessages(db, tenant.id),
      ]);
      const page = toPage(rows, limit, (id) => encodeId('message', id));

      return Response.success(page.items.map(serializeMessage), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets'],
      })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor, total })
        .send();
    },
    {
      tenant: 'messages:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
      }),
    }
  )
  .post(
    '/messages',
    async ({ body, db, headers, set, tenant, event }) => {
      const { message, created } = await createMessage(db, tenant, {
        ...body,
        idempotencyKey: headers['idempotency-key'] ?? body.idempotencyKey,
      });

      if (created) {
        await event({
          event: 'message.created',
          tenantId: tenant.id,
          target: { type: 'message', id: message.id },
          data: {
            channel: message.channel,
            topic: message.topic,
            recipients: (message.targets as { to?: string[] }).to?.length ?? null,
          },
        });
        await enqueueFanout(message.id);
      }

      return Response.success(serializeMessage(message), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets'],
      })
        .status(202)
        .headers(created ? {} : { 'idempotent-replayed': 'true' })
        .send(set);
    },
    {
      tenant: 'messages:send',
      body: CreateMessageSchema,
    }
  );
