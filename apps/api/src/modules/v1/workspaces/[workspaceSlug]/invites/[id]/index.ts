import { findInvite, revokeInvite, serializeInvite } from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const invite = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .get(
    '/workspaces/:workspaceSlug/invites/:id',
    async ({ db, params, workspace }) => {
      const target = await findInvite(db, workspace.id, params.id);
      return Response.success(serializeInvite(target), { entity: 'invite' }).send();
    },
    { scope: 'invites:read' }
  )
  .delete(
    '/workspaces/:workspaceSlug/invites/:id',
    async ({ db, params, workspace, audit }) => {
      const target = await findInvite(db, workspace.id, params.id);

      const revoked = await revokeInvite(db, target.id);

      await audit({
        event: 'invite.revoked',
        target: { type: 'invite', id: target.id },
        data: { email: target.email },
      });

      return Response.success(markDeleted(serializeInvite(revoked)), { entity: 'invite' }).send();
    },
    { scope: 'invites:write' }
  );
