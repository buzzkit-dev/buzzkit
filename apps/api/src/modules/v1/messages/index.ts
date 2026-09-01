import {
  CreateMessageSchema,
  createMessage,
  enqueueFanout,
  listMessages,
  MessageFiltersSchema,
  serializeMessage,
} from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const messages = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .get(
    '/messages',
    async ({ db, query, tenant }) => {
      const page = await listMessages(db, tenant.id, query);
      return Response.page(page, {
        entity: 'message',
        ignoreTransform: ['payload', 'targets', 'schedule'],
      }).send();
    },
    {
      tenant: 'messages:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        ...MessageFiltersSchema.properties,
      }),
    }
  )
  .post(
    '/messages',
    async ({ body, db, headers, set, tenant, audit }) => {
      const { message, created } = await createMessage(db, tenant, {
        ...body,
        idempotencyKey: headers['idempotency-key'] ?? body.idempotencyKey,
      });
      if (created) {
        await audit({
          event: 'message.created',
          tenantId: tenant.id,
          target: { type: 'message', id: message.id },
          data: {
            channel: message.channel,
            topic: message.topic,
            segment: (message.targets as { segment?: string }).segment ?? null,
            recipients: (message.targets as { to?: string[] }).to?.length ?? null,
            scheduledFor: message.scheduledFor,
          },
        });
        if (!message.schedule) await enqueueFanout(message.id);
      }
      return Response.success(serializeMessage(message), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets', 'schedule'],
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
