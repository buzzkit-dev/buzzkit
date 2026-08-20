import { findInvite, revokeInvite, serializeInvite } from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const invite = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .delete(
    '/workspaces/:slug/invites/:id',
    async ({ db, params, workspace, event }) => {
      const target = await findInvite(db, workspace.id, params.id);

      const revoked = await revokeInvite(db, target.id);

      await event({
        event: 'invite.revoked',
        target: { type: 'invite', id: target.id },
        data: { email: target.email },
      });

      return Response.success(serializeInvite(revoked), { entity: 'invite' }).send();
    },
    { scope: 'invites:write' }
  );
