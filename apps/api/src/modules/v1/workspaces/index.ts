import {
  assertSlugAvailable,
  createWorkspace,
  listWorkspacesForUser,
  SlugSchema,
  WorkspaceNameSchema,
} from '@buzzkit/api/api/workspaces/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const workspaces = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workspaces'] } })
  .post(
    '/workspaces',
    async ({ body, db, set, user, event }) => {
      await assertSlugAvailable(db, body.slug);

      const workspace = await createWorkspace(db, body, user.id);

      await event({
        event: 'workspace.created',
        workspaceId: workspace.id,
        target: { type: 'workspace', id: workspace.id },
        data: { name: body.name, slug: body.slug },
      });

      return Response.success({ ...workspace, role: 'owner' }, { entity: 'workspace' })
        .status(201)
        .send(set);
    },
    {
      account: 'write',
      body: t.Object({
        name: WorkspaceNameSchema,
        slug: SlugSchema,
        avatarUrl: t.Optional(t.String({ format: 'uri', maxLength: 2048 })),
      }),
    }
  )
  .get(
    '/workspaces',
    async ({ db, user }) => {
      const workspaces = await listWorkspacesForUser(db, user.id);

      return Response.success(workspaces, { entity: 'workspace' }).send();
    },
    { account: 'read' }
  );
