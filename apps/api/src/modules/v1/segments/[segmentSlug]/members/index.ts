import {
  findSegmentBySlug,
  listSegmentMemberPage,
  SegmentSlugParamsSchema,
} from '@buzzkit/api/api/segments/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import type { Expression } from 'buzzkit/expressions';
import Elysia from 'elysia';

export const segmentMembers = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Segments'] } })
  .get(
    '/segments/:segmentSlug/members',
    async ({ db, params, query, tenant }) => {
      const found = await findSegmentBySlug(db, tenant.id, params.segmentSlug);
      const page = await listSegmentMemberPage(db, tenant.id, found.version.expression as Expression, query);
      return Response.page(page, { entity: 'subscriber', ignoreTransform: ['attributes'] }).send();
    },
    {
      tenant: 'segments:read',
      params: SegmentSlugParamsSchema,
      query: PaginationQuerySchema,
    }
  );
