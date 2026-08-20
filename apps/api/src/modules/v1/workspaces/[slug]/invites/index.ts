import { createInvite, listPendingInvites, serializeInvite } from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const invites = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .get(
    '/workspaces/:slug/invites',
    async ({ db, workspace }) => {
      const rows = await listPendingInvites(db, workspace.id);

      return Response.success(rows.map(serializeInvite), { entity: 'invite' }).send();
    },
    { scope: 'invites:read' }
  )
  .post(
    '/workspaces/:slug/invites',
    async ({ body, db, set, workspace, membership }) => {
      const invite = await createInvite(db, workspace.id, {
        email: body.email,
        role: body.role ?? 'member',
        invitedByMemberId: membership?.id ?? null,
      });

      return Response.success(serializeInvite(invite), { entity: 'invite' }).status(201).send(set);
    },
    {
      scope: 'invites:write',
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 254 }),
        role: t.Optional(t.Union([t.Literal('member'), t.Literal('admin')])),
      }),
    }
  );
