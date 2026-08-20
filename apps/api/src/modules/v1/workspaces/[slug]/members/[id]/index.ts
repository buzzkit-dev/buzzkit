import {
  assertNotLastOwner,
  findMember,
  removeMember,
  updateMemberRole,
} from '@buzzkit/api/api/members/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const member = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Members'] } })
  .patch(
    '/workspaces/:slug/members/:id',
    async ({ body, db, params, workspace }) => {
      const target = await findMember(db, workspace.id, params.id);

      // Demoting an owner must never leave the workspace ownerless
      if (target.role === 'owner' && body.role !== 'owner') {
        await assertNotLastOwner(db, workspace.id, target.id);
      }

      const updated = await updateMemberRole(db, target.id, body.role);

      return Response.success(updated, { entity: 'member' }).send();
    },
    {
      scope: 'members:write',
      body: t.Object({
        role: t.Union([t.Literal('member'), t.Literal('admin'), t.Literal('owner')]),
      }),
    }
  )
  .delete(
    '/workspaces/:slug/members/:id',
    async ({ db, params, workspace }) => {
      const target = await findMember(db, workspace.id, params.id);

      if (target.role === 'owner') {
        await assertNotLastOwner(db, workspace.id, target.id);
      }

      const removed = await removeMember(db, target.id);

      return Response.success(removed, { entity: 'member' }).send();
    },
    { scope: 'members:write' }
  );
