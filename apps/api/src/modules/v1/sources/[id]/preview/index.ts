import { findSource, PreviewSchema, previewDelivery } from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import Elysia from 'elysia';

export const sourcePreview = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .post(
    '/sources/:id/preview',
    async ({ db, params, body, tenant }) => {
      const sourceId = decodeEntityId('source', params.id);
      if (sourceId === undefined) throw new NotFoundError('Source not found');

      const target = await findSource(db, tenant.id, sourceId);

      return Response.success(await previewDelivery(db, target, body.payload, body.headers, body.mapping), {
        ignoreTransform: ['event', 'suggestions'],
      }).send();
    },
    { tenant: 'sources:read', body: PreviewSchema }
  );
