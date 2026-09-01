import { findSource, PreviewSchema, previewDelivery } from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const sourcePreview = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .post(
    '/sources/:id/preview',
    async ({ db, params, body, tenant }) => {
      const target = await findSource(db, tenant.id, params.id);
      return Response.success(await previewDelivery(db, target, body.payload, body.headers, body.mapping), {
        ignoreTransform: ['event', 'suggestions'],
      }).send();
    },
    { tenant: 'sources:read', body: PreviewSchema }
  );
