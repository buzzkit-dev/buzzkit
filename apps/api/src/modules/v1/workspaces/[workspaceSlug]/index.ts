import { diffForEvent } from '@buzzkit/api/api/audit/index';
import {
  assertSlugAvailable,
  SlugSchema,
  serializeWorkspace,
  softDeleteWorkspace,
  updateWorkspace,
  WorkspaceNameSchema,
} from '@buzzkit/api/api/workspaces/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { UrlSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const workspace = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workspaces'] } })
  .get(
    '/workspaces/:workspaceSlug',
    ({ workspace: target, membership }) => {
      return Response.success(
        { ...serializeWorkspace(target), role: membership?.role ?? null },
        { entity: 'workspace' }
      ).send();
    },
    { scope: 'workspace:read' }
  )
  .patch(
    '/workspaces/:workspaceSlug',
    async ({ body, db, workspace: target, audit }) => {
      if (body.name === undefined && body.slug === undefined && body.avatarUrl === undefined) {
        return Response.success(serializeWorkspace(target), { entity: 'workspace' }).send();
      }

      if (body.slug !== undefined && body.slug !== target.slug) {
        await assertSlugAvailable(db, body.slug);
      }

      const updated = await updateWorkspace(db, target.id, body);

      await audit({
        event: 'workspace.updated',
        target: { type: 'workspace', id: target.id },
        data: diffForEvent(target, updated),
      });

      return Response.success(serializeWorkspace(updated), { entity: 'workspace' }).send();
    },
    {
      scope: 'workspace:write',
      body: t.Object({
        name: t.Optional(WorkspaceNameSchema),
        slug: t.Optional(SlugSchema),
        avatarUrl: t.Optional(t.Union([UrlSchema, t.Null()])),
      }),
    }
  )
  .delete(
    '/workspaces/:workspaceSlug',
    async ({ db, workspace: target, audit }) => {
      const deleted = await softDeleteWorkspace(db, target.id);
      await audit({
        event: 'workspace.deleted',
        target: { type: 'workspace', id: target.id },
        data: { name: target.name, slug: target.slug },
      });
      return Response.success(markDeleted(serializeWorkspace(deleted)), { entity: 'workspace' }).send();
    },
    { scope: 'workspace:delete' }
  );
