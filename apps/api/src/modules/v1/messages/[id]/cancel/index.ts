import { cancelMessage, serializeMessage } from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const messageCancel = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .post(
    '/messages/:id/cancel',
    async ({ audit, db, params, tenant }) => {
      const message = await cancelMessage(db, tenant.id, params.id);

      await audit({
        event: 'message.canceled',
        tenantId: tenant.id,
        target: { type: 'message', id: message.id },
        data: { status: message.status, scheduledFor: message.scheduledFor },
      });

      return Response.success(serializeMessage(message), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets', 'schedule'],
      }).send();
    },
    { tenant: 'messages:send' }
  );
