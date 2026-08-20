import { listMembers } from '@buzzkit/api/api/members/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const members = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Members'] } })
  .get(
    '/workspaces/:slug/members',
    async ({ db, workspace }) => {
      const rows = await listMembers(db, workspace.id);

      return Response.success(rows, { entity: 'member' }).send();
    },
    { scope: 'members:read' }
  );
