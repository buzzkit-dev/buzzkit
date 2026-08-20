import {
  assertSlugAvailable,
  SlugSchema,
  softDeleteWorkspace,
  updateWorkspace,
  WorkspaceNameSchema,
} from '@buzzkit/api/api/workspaces/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const workspace = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workspaces'] } })
  .get(
    '/workspaces/:slug',
    ({ workspace, membership }) => {
      // API-key callers have no membership — role is null for them
      return Response.success(
        { ...workspace, role: membership?.role ?? null },
        { entity: 'workspace' }
      ).send();
    },
    { scope: 'workspace:read' }
  )
  .patch(
    '/workspaces/:slug',
    async ({ body, db, workspace }) => {
      if (body.name === undefined && body.slug === undefined && body.avatarUrl === undefined) {
        throw new BadRequestError('Nothing to update');
      }

      if (body.slug !== undefined && body.slug !== workspace.slug) {
        await assertSlugAvailable(db, body.slug);
      }

      const updated = await updateWorkspace(db, workspace.id, body);

      return Response.success(updated, { entity: 'workspace' }).send();
    },
    {
      scope: 'workspace:write',
      body: t.Object({
        name: t.Optional(WorkspaceNameSchema),
        slug: t.Optional(SlugSchema),
        avatarUrl: t.Optional(t.Union([t.String({ format: 'uri', maxLength: 2048 }), t.Null()])),
      }),
    }
  )
  .delete(
    '/workspaces/:slug',
    async ({ db, workspace }) => {
      const deleted = await softDeleteWorkspace(db, workspace.id);

      return Response.success(deleted, { entity: 'workspace' }).send();
    },
    { scope: 'workspace:delete' }
  );
