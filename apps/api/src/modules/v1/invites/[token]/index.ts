import { findInviteByToken, isInviteExpired, maskEmail } from '@buzzkit/api/api/invites/index';
import { database } from '@buzzkit/api/libs/database';
import { Response } from '@buzzkit/api/libs/response';
import { trace } from '@buzzkit/api/libs/telemetry';
import { eq, tables } from '@buzzkit/database';
import Elysia from 'elysia';

/**
 * Public invite preview — what an invitee sees before signing in. The token IS
 * the credential here, so the response exposes only what the invite email
 * would: workspace name, role, masked email, expiry.
 */
export const invitePreview = new Elysia()
  .use(database)
  .guard({ detail: { tags: ['Invites'] } })
  .get('/invites/:token', async ({ db, params }) => {
    const invite = await findInviteByToken(db, params.token);

    const [workspace] = await trace(
      'invites.previewWorkspace',
      async () =>
        await db
          .select({ name: tables.workspace.name, slug: tables.workspace.slug })
          .from(tables.workspace)
          .where(eq(tables.workspace.id, invite.workspaceId))
    );

    return Response.success({
      workspace: { name: workspace?.name ?? 'Unknown', slug: workspace?.slug ?? null },
      email: maskEmail(invite.email),
      role: invite.role,
      expired: isInviteExpired(invite),
      accepted: invite.acceptedAt !== null,
    }).send();
  });
