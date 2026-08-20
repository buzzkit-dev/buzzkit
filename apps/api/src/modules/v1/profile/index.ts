import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { trace } from '@buzzkit/api/libs/telemetry';
import { eq, tables } from '@buzzkit/database';
import Elysia, { t } from 'elysia';

const serializeUser = (user: { id: string; name: string; email: string; image: string | null }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
});

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
    async ({ body, db, user }) => {
      const [updated] = await trace(
        'profile.update',
        async () =>
          await db
            .update(tables.auth.user)
            .set({ name: body.name })
            .where(eq(tables.auth.user.id, user.id))
            .returning()
      );

      return Response.success(serializeUser(updated!)).send();
    },
    {
      account: 'write',
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 100 }) }),
    }
  );
