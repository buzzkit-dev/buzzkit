import { countRows } from '@buzzkit/api/libs/database';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, type Page, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, type Db, desc, eq, isNull, lt, tables } from '@buzzkit/database';
import { resolveCategoryName, resolveTopicCategory } from './categories';
import { CHANNELS } from './constants';
import { serializeTopic, withCategory } from './serialize';
import type { Channel, Topic } from './types';

export * from './categories';
export * from './constants';
export * from './preferences';
export * from './schemas';
export * from './serialize';
export type * from './types';

export function assertValidChannelDefaults(
  channelDefaults: unknown,
  channels: readonly string[] = CHANNELS
): void {
  if (channelDefaults === undefined) return;
  if (!channelDefaults || typeof channelDefaults !== 'object' || Array.isArray(channelDefaults)) {
    throw new BadRequestError('channelDefaults must be an object');
  }

  for (const [channel, value] of Object.entries(channelDefaults)) {
    if (!CHANNELS.includes(channel as Channel)) {
      throw new BadRequestError(`Unknown channel '${channel}' in channelDefaults`);
    }
    if (!channels.includes(channel)) {
      throw new BadRequestError(`This topic is not offered on the '${channel}' channel`, {
        code: 'channel_not_offered',
        param: 'channelDefaults',
      });
    }
    if (typeof value !== 'boolean') {
      throw new BadRequestError(`channelDefaults.${channel} must be a boolean`);
    }
  }
}

export function resolveChannelDefaults(
  channelDefaults: unknown,
  channels: readonly string[]
): Partial<Record<Channel, boolean>> {
  const entries = Object.entries((channelDefaults ?? {}) as Record<string, boolean>);
  return Object.fromEntries(entries.filter(([channel]) => channels.includes(channel)));
}

export async function assertTopicSlugAvailable(db: Db, tenantId: number, slug: string): Promise<void> {
  const [existing] = await trace('topics.findBySlug', async () => {
    return await db
      .select({ id: tables.topic.id })
      .from(tables.topic)
      .where(
        and(eq(tables.topic.tenantId, tenantId), eq(tables.topic.slug, slug), isNull(tables.topic.deletedAt))
      );
  });

  if (existing) {
    throw new ConflictError('A topic with this slug already exists');
  }
}

export async function listTopics(
  db: Db,
  tenantId: number,
  options: { cursor?: string; limit?: number } = {}
): Promise<Page<ReturnType<typeof serializeTopic>> & { total: number }> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('topic', id));

  const [rows, total] = await Promise.all([
    trace('topics.list', async () => {
      return await db
        .select({ record: tables.topic, categoryName: tables.topicCategory.name })
        .from(tables.topic)
        .leftJoin(tables.topicCategory, eq(tables.topic.categoryId, tables.topicCategory.id))
        .where(
          and(
            eq(tables.topic.tenantId, tenantId),
            isNull(tables.topic.deletedAt),
            beforeId !== undefined ? lt(tables.topic.id, beforeId) : undefined
          )
        )
        .orderBy(desc(tables.topic.id))
        .limit(limit + 1);
    }),
    countTopics(db, tenantId),
  ]);

  const topics = rows.map((row) => serializeTopic(withCategory(row.record, row.categoryName)));

  return { ...toPage(topics, limit, (id) => encodeId('topic', id)), total };
}

export async function countTopics(db: Db, tenantId: number): Promise<number> {
  return await trace('topics.count', async () => {
    return await countRows(
      db,
      tables.topic,
      and(eq(tables.topic.tenantId, tenantId), isNull(tables.topic.deletedAt))
    );
  });
}

export async function findTopicBySlug(db: Db, tenantId: number, slug: string): Promise<Topic> {
  const [row] = await trace('topics.findBySlug', async () => {
    return await db
      .select({ record: tables.topic, categoryName: tables.topicCategory.name })
      .from(tables.topic)
      .leftJoin(tables.topicCategory, eq(tables.topic.categoryId, tables.topicCategory.id))
      .where(
        and(eq(tables.topic.tenantId, tenantId), eq(tables.topic.slug, slug), isNull(tables.topic.deletedAt))
      );
  });

  if (!row) {
    throw new NotFoundError('Topic not found');
  }
  return withCategory(row.record, row.categoryName);
}

export async function createTopic(
  db: Db,
  tenantId: number,
  input: {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    dailyCap?: number | null;
    channels?: Channel[];
    defaultOptedIn?: boolean;
    channelDefaults?: Partial<Record<Channel, boolean>>;
  }
): Promise<Topic> {
  const category = await resolveTopicCategory(db, tenantId, input.category);
  const [topic] = await trace('topics.create', async () => {
    return await db
      .insert(tables.topic)
      .values({
        tenantId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        categoryId: category?.id ?? null,
        dailyCap: input.dailyCap ?? null,
        channels: input.channels ?? [...CHANNELS],
        defaultOptedIn: input.defaultOptedIn ?? true,
        channelDefaults: input.channelDefaults ?? {},
      })
      .returning();
  });

  return withCategory(topic!, category?.name ?? null);
}

export async function updateTopic(
  db: Db,
  tenantId: number,
  topicId: number,
  patch: {
    slug?: string;
    name?: string;
    description?: string | null;
    category?: string | null;
    dailyCap?: number | null;
    channels?: Channel[];
    defaultOptedIn?: boolean;
    channelDefaults?: Partial<Record<Channel, boolean>>;
  }
): Promise<Topic> {
  let category: Awaited<ReturnType<typeof resolveTopicCategory>> | undefined;
  if (patch.category !== undefined) category = await resolveTopicCategory(db, tenantId, patch.category);

  const [updated] = await trace('topics.update', async () => {
    return await db
      .update(tables.topic)
      .set({
        slug: patch.slug,
        name: patch.name,
        description: patch.description,
        ...(category === undefined ? {} : { categoryId: category?.id ?? null }),
        ...(patch.dailyCap === undefined ? {} : { dailyCap: patch.dailyCap }),
        channels: patch.channels,
        defaultOptedIn: patch.defaultOptedIn,
        channelDefaults: patch.channelDefaults,
      })
      .where(eq(tables.topic.id, topicId))
      .returning();
  });

  let categoryName: string | null;
  if (category === undefined) {
    categoryName = await resolveCategoryName(db, updated!);
  } else {
    categoryName = category?.name ?? null;
  }

  return withCategory(updated!, categoryName);
}

export async function softDeleteTopic(db: Db, topicId: number): Promise<Topic> {
  const [deleted] = await trace('topics.softDelete', async () => {
    return await db
      .update(tables.topic)
      .set({ deletedAt: new Date() })
      .where(eq(tables.topic.id, topicId))
      .returning();
  });
  return withCategory(deleted!, await resolveCategoryName(db, deleted!));
}
