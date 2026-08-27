import { env } from 'cloudflare:workers';
import {
  createInvite,
  inviteEmailContent,
  listPendingInvites,
  serializeInvite,
} from '@buzzkit/api/api/invites/index';
import { auth } from '@buzzkit/api/libs/auth';
import { sendTextEmail } from '@buzzkit/api/libs/email';
import { Response } from '@buzzkit/api/libs/response';
import { EmailSchema, literalUnion } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const invites = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Invites'] } })
  .get(
    '/workspaces/:workspaceSlug/invites',
    async ({ db, workspace }) => {
      const rows = await listPendingInvites(db, workspace.id);

      return Response.list(rows.map(serializeInvite), { entity: 'invite' }).send();
    },
    { scope: 'invites:read' }
  )
  .post(
    '/workspaces/:workspaceSlug/invites',
    async ({ body, db, set, workspace, membership, user, audit }) => {
      const invite = await createInvite(db, workspace.id, {
        email: body.email,
        role: body.role ?? 'member',
        invitedByMemberId: membership?.id ?? null,
      });

      const emailSent = await sendTextEmail({
        to: invite.email,
        ...inviteEmailContent({
          workspaceName: workspace.name,
          inviterName: user?.name ?? null,
          email: invite.email,
          role: invite.role,
          token: invite.token,
          expiresAt: invite.expiresAt,
          dashboardUrl: env.DASHBOARD_URL,
        }),
      });

      await audit({
        event: 'invite.created',
        target: { type: 'invite', id: invite.id },
        data: { email: invite.email, role: invite.role, emailSent },
      });

      return Response.success(
        { ...serializeInvite(invite), token: invite.token, emailSent },
        { entity: 'invite' }
      )
        .status(201)
        .send(set);
    },
    {
      scope: 'invites:write',
      body: t.Object({
        email: EmailSchema,
        role: t.Optional(literalUnion(['member', 'admin'])),
      }),
    }
  );
