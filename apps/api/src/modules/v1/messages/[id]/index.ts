import { findMessage, serializeMessage } from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const message = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .get(
    '/messages/:id',
    async ({ db, params, tenant }) => {
      const target = await findMessage(db, tenant.id, params.id);
      return Response.success(serializeMessage(target), {
        entity: 'message',
        ignoreTransform: ['payload', 'targets', 'schedule'],
      }).send();
    },
    { tenant: 'messages:read' }
  );
