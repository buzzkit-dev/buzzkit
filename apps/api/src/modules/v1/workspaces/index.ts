import { assertAdmin, listEveryWorkspace, WorkspaceListQuerySchema } from '@buzzkit/api/api/admins/index';
import {
  assertSlugAvailable,
  createWorkspace,
  listWorkspacesForUser,
  SlugSchema,
  serializeWorkspace,
  WorkspaceNameSchema,
} from '@buzzkit/api/api/workspaces/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { UrlSchema } from '@buzzkit/api/libs/schemas';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const workspaces = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workspaces'] } })
  .get(
    '/workspaces',
    async ({ db, user, query }) => {
      if (query.all) {
        await assertAdmin(db, user.id);
        return Response.page(await listEveryWorkspace(db, user.id, query), { entity: 'workspace' }).send();
      }
      const rows = await listWorkspacesForUser(db, user.id);
      return Response.list(rows, { entity: 'workspace' }).send();
    },
    {
      account: 'read',
      query: t.Object({ ...PaginationQuerySchema.properties, ...WorkspaceListQuerySchema.properties }),
    }
  )
  .post(
    '/workspaces',
    async ({ body, db, set, user, audit }) => {
      await assertSlugAvailable(db, body.slug);

      const workspace = await createWorkspace(db, body, user.id);

      await audit({
        event: 'workspace.created',
        workspaceId: workspace.id,
        target: { type: 'workspace', id: workspace.id },
        data: { name: body.name, slug: body.slug },
      });

      return Response.success(
        { ...serializeWorkspace(workspace), role: 'owner' },
        {
          entity: 'workspace',
        }
      )
        .status(201)
        .send(set);
    },
    {
      account: 'write',
      body: t.Object({
        name: WorkspaceNameSchema,
        slug: SlugSchema,
        avatarUrl: t.Optional(UrlSchema),
      }),
    }
  );
