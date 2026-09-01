import { findInvite, resendInvite, sendInviteEmail, serializeInvite } from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const inviteResend = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .post(
    '/workspaces/:workspaceSlug/invites/:id/resend',
    async ({ db, params, workspace, user, audit }) => {
      const existing = await findInvite(db, workspace.id, params.id);
      const refreshed = await resendInvite(db, existing);

      const emailSent = await sendInviteEmail(refreshed, workspace, user?.name ?? null);

      await audit({
        event: 'invite.resent',
        target: { type: 'invite', id: refreshed.id },
        data: { email: refreshed.email, emailSent },
      });

      return Response.success(
        { ...serializeInvite(refreshed), token: refreshed.token, emailSent },
        { entity: 'invite' }
      ).send();
    },
    { scope: 'invites:write' }
  );
