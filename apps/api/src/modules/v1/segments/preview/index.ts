import { PreviewSegmentSchema, previewSegment } from '@buzzkit/api/api/segments/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const segmentsPreview = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Segments'] } })
  .post(
    '/segments/preview',
    async ({ body, db, tenant }) => {
      const preview = await previewSegment(db, tenant.id, body.expression);
      return Response.success(preview, { ignoreTransform: ['attributes'] }).send();
    },
    { tenant: 'segments:read', body: PreviewSegmentSchema }
  );
