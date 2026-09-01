import { AuditFiltersSchema, listAuditEvents } from '@buzzkit/api/api/audit/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const auditLog = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Audit'] } })
  .get(
    '/workspaces/:workspaceSlug/audit',
    async ({ db, workspace, query }) => {
      const { items, hasMore, nextCursor, total } = await listAuditEvents(db, workspace.id, query);
      return Response.success(items, { ignoreTransform: ['data'], entity: 'audit' })
        .paginated({ hasMore, nextCursor, total })
        .send();
    },
    {
      scope: 'audit:read',
      query: t.Object({ ...PaginationQuerySchema.properties, ...AuditFiltersSchema.properties }),
    }
  );
