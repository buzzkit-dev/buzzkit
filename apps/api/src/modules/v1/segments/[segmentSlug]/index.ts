import { diffForEvent } from '@buzzkit/api/api/audit/index';
import {
  findSegmentBySlug,
  serializeSegment,
  softDeleteSegment,
  UpdateSegmentSchema,
  updateSegment,
} from '@buzzkit/api/api/segments/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const segment = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Segments'] } })
  .get(
    '/segments/:segmentSlug',
    async ({ db, params, tenant }) => {
      const found = await findSegmentBySlug(db, tenant.id, params.segmentSlug);
      return Response.success(serializeSegment(found, found.version), {
        ignoreTransform: ['expression'],
      }).send();
    },
    { tenant: 'segments:read', params: t.Object({ segmentSlug: SlugSchema }) }
  )
  .patch(
    '/segments/:segmentSlug',
    async ({ audit, body, db, params, tenant }) => {
      if (Object.keys(body).length === 0) throw new BadRequestError('Nothing to update');
      const existing = await findSegmentBySlug(db, tenant.id, params.segmentSlug);
      const updated = await updateSegment(db, existing, body);

      const { changes, previousAttributes } = diffForEvent(
        { name: existing.name, description: existing.description, version: existing.version.version },
        { name: updated.name, description: updated.description, version: updated.version.version }
      );
      if (changes.length > 0) {
        await audit({
          event: 'segment.updated',
          tenantId: tenant.id,
          target: { type: 'segment', id: existing.id },
          data: { slug: existing.slug, changes, previousAttributes },
        });
      }

      return Response.success(serializeSegment(updated, updated.version), {
        ignoreTransform: ['expression'],
      }).send();
    },
    { tenant: 'segments:write', params: t.Object({ segmentSlug: SlugSchema }), body: UpdateSegmentSchema }
  )
  .delete(
    '/segments/:segmentSlug',
    async ({ audit, db, params, tenant }) => {
      const existing = await findSegmentBySlug(db, tenant.id, params.segmentSlug);
      const deleted = await softDeleteSegment(db, existing.id);

      await audit({
        event: 'segment.deleted',
        tenantId: tenant.id,
        target: { type: 'segment', id: existing.id },
        data: { slug: existing.slug },
      });

      return Response.success(markDeleted(serializeSegment(deleted, existing.version)), {
        ignoreTransform: ['expression'],
      }).send();
    },
    { tenant: 'segments:write', params: t.Object({ segmentSlug: SlugSchema }) }
  );
