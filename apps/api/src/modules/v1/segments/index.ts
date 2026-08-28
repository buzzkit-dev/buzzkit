import {
  CreateSegmentSchema,
  createSegment,
  listSegments,
  serializeSegment,
} from '@buzzkit/api/api/segments/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const segments = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Segments'] } })
  .get(
    '/segments',
    async ({ db, tenant }) => {
      const rows = await listSegments(db, tenant.id);
      return Response.list(
        rows.map((row) => serializeSegment(row, row.version)),
        { ignoreTransform: ['expression'] }
      ).send();
    },
    { tenant: 'segments:read' }
  )
  .post(
    '/segments',
    async ({ audit, body, db, set, tenant }) => {
      const segment = await createSegment(db, tenant.id, body);

      await audit({
        event: 'segment.created',
        tenantId: tenant.id,
        target: { type: 'segment', id: segment.id },
        data: { slug: segment.slug, name: segment.name },
      });

      return Response.success(serializeSegment(segment, segment.version), { ignoreTransform: ['expression'] })
        .status(201)
        .send(set);
    },
    { tenant: 'segments:write', body: CreateSegmentSchema }
  );
