import { acceptInvite, findInviteByToken, findInviteWorkspace } from '@buzzkit/api/api/invites/index';
import { serializeMember } from '@buzzkit/api/api/members/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const inviteAccept = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .post(
    '/invites/:token/accept',
    async ({ db, params, set, user, event }) => {
      const invite = await findInviteByToken(db, params.token);

      const { member } = await acceptInvite(db, invite, { id: user.id, email: user.email });

      const workspace = await findInviteWorkspace(db, invite);

      await event({
        event: 'invite.accepted',
        workspaceId: invite.workspaceId,
        target: { type: 'invite', id: invite.id },
        data: { role: invite.role },
      });

      return Response.success({ ...serializeMember(member), workspace }, { entity: 'member' })
        .status(201)
        .send(set);
    },
    { account: 'write' }
  );
