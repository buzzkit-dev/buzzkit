import {
  findInviteByToken,
  findInviteWorkspace,
  isInviteExpired,
  maskEmail,
} from '@buzzkit/api/api/invites/index';
import { database } from '@buzzkit/api/libs/database';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const invitePreview = new Elysia()
  .use(database)
  .guard({ detail: { tags: ['Invites'] } })
  .get('/invites/:token', async ({ db, params }) => {
    const invite = await findInviteByToken(db, params.token);
    const workspace = await findInviteWorkspace(db, invite);

    return Response.success({
      workspace: { name: workspace?.name ?? 'Unknown', slug: workspace?.slug ?? null },
      email: maskEmail(invite.email),
      role: invite.role,
      expired: isInviteExpired(invite),
      accepted: invite.acceptedAt !== null,
    }).send();
  });
