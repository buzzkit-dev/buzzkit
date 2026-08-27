import { serializeUser, updateProfile } from '@buzzkit/api/api/profile/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { NameSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const profile = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Profile'] } })
  .get(
    '/profile',
    ({ user }) => {
      return Response.success(serializeUser(user)).send();
    },
    { account: 'read' }
  )
  .patch(
    '/profile',
    async ({ body, db, user, audit }) => {
      const updated = await updateProfile(db, user.id, body);

      await audit({
        event: 'profile.updated',
        data: { changes: ['name'], previousAttributes: { name: user.name } },
      });

      return Response.success(serializeUser(updated)).send();
    },
    { account: 'write', body: t.Object({ name: NameSchema }) }
  );
