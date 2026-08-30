import { findSourceForIngest, ingestDelivery, MAX_PAYLOAD_BYTES } from '@buzzkit/api/api/sources/index';
import { database } from '@buzzkit/api/libs/database';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import Elysia from 'elysia';

export const sourceIngest = new Elysia()
  .use(database)
  .guard({ detail: { tags: ['Sources'] } })
  .post('/sources/:id/ingest', async ({ db, params, request, set }) => {
    const sourceId = decodeEntityId('source', params.id);
    const source = sourceId === undefined ? null : await findSourceForIngest(db, sourceId);

    if (!source) throw new NotFoundError('Source not found');

    const body = await request.text();
    if (body.length > MAX_PAYLOAD_BYTES) {
      throw new BadRequestError(`The body is larger than ${MAX_PAYLOAD_BYTES} bytes`, {
        code: 'payload_too_large',
      });
    }

    const result = await ingestDelivery(db, source, body, request.headers);
    set.status = result.status;

    const { outcome, reason } = result.delivery;

    return Response.success({ outcome, reason }).send();
  });
