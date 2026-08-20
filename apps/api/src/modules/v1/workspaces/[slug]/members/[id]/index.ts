import {
  assertNotLastOwner,
  findMember,
  removeMember,
  updateMemberRole,
} from '@buzzkit/api/api/members/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { requireScope } from '@buzzkit/api/libs/scopes';
import Elysia, { t } from 'elysia';

export const member = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Members'] } })
  .patch(
    '/workspaces/:slug/members/:id',
    async ({ body, db, params, workspace, scopes, event }) => {
      const target = await findMember(db, workspace.id, params.id);

      if (body.role === 'owner' || target.role === 'owner') {
        requireScope(scopes, 'workspace:delete');
      }

      if (target.role === 'owner' && body.role !== 'owner') {
        await assertNotLastOwner(db, workspace.id, target.id);
      }

      const updated = await updateMemberRole(db, target.id, body.role);

      await event({
        event: 'member.role_changed',
        target: { type: 'member', id: target.id },
        data: { from: target.role, to: body.role },
      });

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
    async ({ db, params, workspace, scopes, event }) => {
      const target = await findMember(db, workspace.id, params.id);

      if (target.role === 'owner') {
        requireScope(scopes, 'workspace:delete');
        await assertNotLastOwner(db, workspace.id, target.id);
      }

      const removed = await removeMember(db, target.id);

      await event({
        event: 'member.removed',
        target: { type: 'member', id: target.id },
        data: { role: target.role },
      });

      return Response.success(removed, { entity: 'member' }).send();
    },
    { scope: 'members:write' }
  );
