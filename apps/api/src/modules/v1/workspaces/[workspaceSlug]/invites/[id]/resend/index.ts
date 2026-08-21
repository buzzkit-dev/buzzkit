import { env } from 'cloudflare:workers';
import {
  findInvite,
  inviteEmailContent,
  resendInvite,
  serializeInvite,
} from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth';
import { sendTextEmail } from '@buzzkit/api/libs/email';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const inviteResend = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .post(
    '/workspaces/:workspaceSlug/invites/:id/resend',
    async ({ db, params, workspace, user, event }) => {
      const existing = await findInvite(db, workspace.id, params.id);
      const refreshed = await resendInvite(db, existing);

      const emailSent = await sendTextEmail({
        to: refreshed.email,
        ...inviteEmailContent({
          workspaceName: workspace.name,
          inviterName: user?.name ?? null,
          email: refreshed.email,
          role: refreshed.role,
          token: refreshed.token,
          expiresAt: refreshed.expiresAt,
          dashboardUrl: env.DASHBOARD_URL,
        }),
      });

      await event({
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
