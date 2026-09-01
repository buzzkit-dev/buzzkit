import { listSubscribersByIds, serializeSubscriberListItem } from '@buzzkit/api/api/subscribers/index';
import { createVersioned, payloadChanged, updateVersioned } from '@buzzkit/api/api/versioning/index';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { queryTinybird } from '@buzzkit/api/libs/tinybird';
import { clampLimit, resolveNumericCursor } from '@buzzkit/api/utils/pagination';
import { and, type Db, eq, isNull, tables } from '@buzzkit/database';
import type { Expression } from 'buzzkit/expressions';
import { t } from 'elysia';
import { type CompiledSegment, compileSegment, countQuery, memberQuery } from './compile';
import { SEGMENT_MEMBERS_PAGE, SEGMENT_PREVIEW_LIMIT, SEGMENT_RESERVED_SLUGS } from './constants';
import type {
  MemberPage,
  MemberRow,
  Segment,
  SegmentInput,
  SegmentVersion,
  SegmentWithVersion,
} from './types';

export const SegmentSlugParamsSchema = t.Object({ segmentSlug: SlugSchema });

export * from './compile';
export * from './constants';
export * from './expression-schema';
export * from './schemas';
export { serializeSegment } from './serialize';
export type * from './types';
export * from './validate';

export async function findSegmentBySlug(db: Db, tenantId: number, slug: string): Promise<SegmentWithVersion> {
  const [row] = await trace('segments.find', async () => {
    return await db
      .select({ segment: tables.segment, version: tables.segmentVersion })
      .from(tables.segment)
      .innerJoin(tables.segmentVersion, eq(tables.segmentVersion.id, tables.segment.currentVersionId))
      .where(
        and(
          eq(tables.segment.tenantId, tenantId),
          eq(tables.segment.slug, slug),
          isNull(tables.segment.deletedAt)
        )
      );
  });
  if (!row) throw new NotFoundError('Segment not found');
  return { ...row.segment, version: row.version };
}

export async function listSegments(db: Db, tenantId: number): Promise<SegmentWithVersion[]> {
  const rows = await trace('segments.list', async () => {
    return await db
      .select({ segment: tables.segment, version: tables.segmentVersion })
      .from(tables.segment)
      .innerJoin(tables.segmentVersion, eq(tables.segmentVersion.id, tables.segment.currentVersionId))
      .where(and(eq(tables.segment.tenantId, tenantId), isNull(tables.segment.deletedAt)))
      .orderBy(tables.segment.name);
  });
  return rows.map((row) => ({ ...row.segment, version: row.version }));
}

export async function selectSegmentVersionById(db: Db, versionId: number): Promise<SegmentVersion | null> {
  const [row] = await db.select().from(tables.segmentVersion).where(eq(tables.segmentVersion.id, versionId));
  return row ?? null;
}

export async function createSegment(
  db: Db,
  tenantId: number,
  input: SegmentInput
): Promise<SegmentWithVersion> {
  compileSegment(tenantId, input.expression);
  if (SEGMENT_RESERVED_SLUGS.has(input.slug)) {
    throw new BadRequestError(`'${input.slug}' is reserved`, { code: 'slug_reserved', param: 'slug' });
  }
  const [existing] = await db
    .select({ id: tables.segment.id })
    .from(tables.segment)
    .where(
      and(
        eq(tables.segment.tenantId, tenantId),
        eq(tables.segment.slug, input.slug),
        isNull(tables.segment.deletedAt)
      )
    );
  if (existing)
    throw new ConflictError(`A segment with the slug '${input.slug}' already exists`, {
      code: 'slug_taken',
      param: 'slug',
    });

  return await trace('segments.create', async () => {
    const { entity, version } = await createVersioned(db, {
      insertEntity: async (tx) => {
        const [segment] = await tx
          .insert(tables.segment)
          .values({
            tenantId,
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
          })
          .returning();
        return segment!;
      },
      insertVersion: async (tx, segment) => {
        const [inserted] = await tx
          .insert(tables.segmentVersion)
          .values({ segmentId: segment.id, version: 1, expression: input.expression })
          .returning();
        return inserted!;
      },
      finalize: async (tx, segment, inserted) => {
        const [current] = await tx
          .update(tables.segment)
          .set({ currentVersionId: inserted.id })
          .where(eq(tables.segment.id, segment.id))
          .returning();
        return current!;
      },
    });
    return { ...entity, version };
  });
}

export async function updateSegment(
  db: Db,
  existing: SegmentWithVersion,
  input: Partial<SegmentInput>
): Promise<SegmentWithVersion> {
  if (input.expression !== undefined) compileSegment(existing.tenantId, input.expression);

  return await trace('segments.update', async () => {
    const { entity, version } = await updateVersioned(db, {
      latest: existing.version,
      changed: payloadChanged(input.expression, existing.version.expression),
      insertVersion: async (tx, nextVersion) => {
        const [created] = await tx
          .insert(tables.segmentVersion)
          .values({ segmentId: existing.id, version: nextVersion, expression: input.expression })
          .returning();
        return created!;
      },
      updateEntity: async (tx, latest) => {
        const [segment] = await tx
          .update(tables.segment)
          .set({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            currentVersionId: latest.id,
          })
          .where(eq(tables.segment.id, existing.id))
          .returning();
        return segment!;
      },
    });
    return { ...entity, version };
  });
}

export async function softDeleteSegment(db: Db, segmentId: number): Promise<Segment> {
  const [deleted] = await trace('segments.softDelete', async () => {
    return await db
      .update(tables.segment)
      .set({ deletedAt: new Date() })
      .where(eq(tables.segment.id, segmentId))
      .returning();
  });
  return deleted!;
}

export async function countSegmentMembers(tenantId: number, expression: Expression): Promise<number> {
  const compiled = compileSegment(tenantId, expression);
  const rows = await trace('segments.count', async () =>
    queryTinybird<{ total: number | string }>(countQuery(tenantId, compiled))
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listSegmentMembers(
  tenantId: number,
  expression: Expression,
  options: { afterSubscriberId?: number; limit?: number } = {}
): Promise<MemberPage> {
  const limit = Math.min(options.limit ?? SEGMENT_MEMBERS_PAGE, SEGMENT_MEMBERS_PAGE);
  const compiled: CompiledSegment = compileSegment(tenantId, expression);
  const rows = await trace('segments.members', async () => {
    return await queryTinybird<MemberRow>(
      memberQuery(tenantId, compiled, { afterSubscriberId: options.afterSubscriberId, limit: limit + 1 })
    );
  });
  const items = rows
    .slice(0, limit)
    .map((row) => ({ subscriber_id: Number(row.subscriber_id), external_id: row.external_id }));
  const hasMore = rows.length > limit;

  return { items, hasMore, nextCursor: hasMore ? items.at(-1)!.subscriber_id : null };
}

export async function listSegmentSubscribers(db: Db, tenantId: number, ids: number[]) {
  if (ids.length === 0) return [];
  return await listSubscribersByIds(db, tenantId, ids);
}

export async function listSegmentMemberPage(
  db: Db,
  tenantId: number,
  expression: Expression,
  options: { cursor?: string; limit?: number } = {}
) {
  const limit = clampLimit(options.limit);
  const afterSubscriberId = resolveNumericCursor(options.cursor);

  const [total, members] = await Promise.all([
    afterSubscriberId === undefined ? countSegmentMembers(tenantId, expression) : null,
    listSegmentMembers(tenantId, expression, { afterSubscriberId, limit }),
  ]);

  const subscribers = await listSegmentSubscribers(
    db,
    tenantId,
    members.items.map((member) => member.subscriber_id)
  );
  const byId = new Map(subscribers.map((subscriber) => [subscriber.id, subscriber]));
  const items = members.items.flatMap((member) => {
    const subscriber = byId.get(member.subscriber_id);
    return subscriber ? [serializeSubscriberListItem(subscriber)] : [];
  });

  return {
    items,
    hasMore: members.hasMore,
    nextCursor: members.nextCursor === null ? null : String(members.nextCursor),
    ...(total === null ? {} : { total }),
  };
}

export async function previewSegment(db: Db, tenantId: number, expression: Expression) {
  const page = await listSegmentMemberPage(db, tenantId, expression, { limit: SEGMENT_PREVIEW_LIMIT });

  return {
    count: page.total ?? 0,
    sample: page.items.map((item) => ({ ...item, id: encodeId('subscriber', item.id) })),
  };
}
