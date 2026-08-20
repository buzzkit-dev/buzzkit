import { acceptInvite, findInviteByToken } from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { trace } from '@buzzkit/api/libs/telemetry';
import { eq, tables } from '@buzzkit/database';
import Elysia from 'elysia';

export const inviteAccept = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .post(
    '/invites/:token/accept',
    async ({ db, params, set, user, event }) => {
      const invite = await findInviteByToken(db, params.token);

      const { member } = await acceptInvite(db, invite, { id: user.id, email: user.email });

      const [workspace] = await trace(
        'invites.acceptedWorkspace',
        async () =>
          await db
            .select({ slug: tables.workspace.slug, name: tables.workspace.name })
            .from(tables.workspace)
            .where(eq(tables.workspace.id, invite.workspaceId))
      );

      await event({
        event: 'invite.accepted',
        workspaceId: invite.workspaceId,
        target: { type: 'invite', id: invite.id },
        data: { role: invite.role },
      });

      return Response.success({ ...member, workspace: workspace ?? null }, { entity: 'member' })
        .status(201)
        .send(set);
    },
    { account: 'write' }
  );
