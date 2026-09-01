import { listMembers } from '@buzzkit/api/api/members/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const members = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Members'] } })
  .get(
    '/workspaces/:workspaceSlug/members',
    async ({ db, workspace }) => {
      const rows = await listMembers(db, workspace.id);
      return Response.list(rows, { entity: 'member' }).send();
    },
    { scope: 'members:read' }
  );
