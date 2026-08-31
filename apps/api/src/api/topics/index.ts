import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { ChannelSchema, NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  and,
  asc,
  channel,
  count,
  type Db,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  sql,
  tables,
} from '@buzzkit/database';
import { t } from 'elysia';

export type TopicRecord = typeof tables.topic.$inferSelect;
export type Topic = TopicRecord & { category: string | null };
export type TopicCategory = typeof tables.topicCategory.$inferSelect;

export const CHANNELS = channel.enumValues;
export type Channel = (typeof CHANNELS)[number];

export const ChannelDefaultsSchema = t.Record(t.String(), t.Any());

export const TopicChannelsSchema = t.Array(ChannelSchema, { minItems: 1, uniqueItems: true });

export const TopicSlugSchema = SlugSchema;

export const TopicNameSchema = NameSchema;

export function serializeTopic(topic: Topic) {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    category: topic.category ?? null,
    channels: topic.channels,
    defaultOptedIn: topic.defaultOptedIn,
    channelDefaults: topic.channelDefaults,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

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

export function topicDefault(topic: Topic, channel: Channel): boolean {
  const overrides = topic.channelDefaults as Partial<Record<Channel, boolean>>;
  return overrides[channel] ?? topic.defaultOptedIn;
}

export function serializeTopicCategory(category: TopicCategory & { topicCount?: number }) {
  return {
    id: category.id,
    name: category.name,
    ...(category.topicCount !== undefined ? { topicCount: category.topicCount } : {}),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export async function listTopicCategories(db: Db, tenantId: number): Promise<TopicCategory[]> {
  return await trace(
    'topics.categories.list',
    async () =>
      await db
        .select()
        .from(tables.topicCategory)
        .where(and(eq(tables.topicCategory.tenantId, tenantId), isNull(tables.topicCategory.deletedAt)))
        .orderBy(asc(tables.topicCategory.name))
  );
}

export async function resolveTopicCategory(
  db: Db,
  tenantId: number,
  name: string | null | undefined
): Promise<TopicCategory | null> {
  if (name === undefined || name === null) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const [existing] = await db
    .select()
    .from(tables.topicCategory)
    .where(
      and(
        eq(tables.topicCategory.tenantId, tenantId),
        sql`lower(${tables.topicCategory.name}) = lower(${trimmed})`,
        isNull(tables.topicCategory.deletedAt)
      )
    );
  if (existing) return existing;
  const [created] = await db.insert(tables.topicCategory).values({ tenantId, name: trimmed }).returning();
  return created as TopicCategory;
}

export async function findTopicCategoryById(
  db: Db,
  tenantId: number,
  id: number | undefined
): Promise<TopicCategory> {
  if (id === undefined) {
    throw new NotFoundError('Category not found');
  }
  const [category] = await db
    .select()
    .from(tables.topicCategory)
    .where(
      and(
        eq(tables.topicCategory.id, id),
        eq(tables.topicCategory.tenantId, tenantId),
        isNull(tables.topicCategory.deletedAt)
      )
    );
  if (!category) {
    throw new NotFoundError('Category not found');
  }
  return category;
}

export async function renameTopicCategory(
  db: Db,
  tenantId: number,
  category: TopicCategory,
  name: string
): Promise<TopicCategory> {
  const trimmed = name.trim();
  const [duplicate] = await db
    .select({ id: tables.topicCategory.id })
    .from(tables.topicCategory)
    .where(
      and(
        eq(tables.topicCategory.tenantId, tenantId),
        sql`lower(${tables.topicCategory.name}) = lower(${trimmed})`,
        isNull(tables.topicCategory.deletedAt),
        ne(tables.topicCategory.id, category.id)
      )
    );
  if (duplicate) {
    throw new ConflictError('A category with this name already exists');
  }
  const [updated] = await db
    .update(tables.topicCategory)
    .set({ name: trimmed })
    .where(eq(tables.topicCategory.id, category.id))
    .returning();
  return updated as TopicCategory;
}

export async function softDeleteTopicCategory(db: Db, category: TopicCategory): Promise<TopicCategory> {
  await db.update(tables.topic).set({ categoryId: null }).where(eq(tables.topic.categoryId, category.id));
  const [deleted] = await db
    .update(tables.topicCategory)
    .set({ deletedAt: new Date() })
    .where(eq(tables.topicCategory.id, category.id))
    .returning();
  return deleted as TopicCategory;
}

function withCategory(record: typeof tables.topic.$inferSelect, category: string | null): Topic {
  return { ...record, category };
}

export async function assertTopicSlugAvailable(db: Db, tenantId: number, slug: string): Promise<void> {
  const [existing] = await trace(
    'topics.findBySlug',
    async () =>
      await db
        .select({ id: tables.topic.id })
        .from(tables.topic)
        .where(
          and(
            eq(tables.topic.tenantId, tenantId),
            eq(tables.topic.slug, slug),
            isNull(tables.topic.deletedAt)
          )
        )
  );

  if (existing) {
    throw new ConflictError('A topic with this slug already exists');
  }
}

export async function createTopic(
  db: Db,
  tenantId: number,
  input: {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    channels?: Channel[];
    defaultOptedIn?: boolean;
    channelDefaults?: Partial<Record<Channel, boolean>>;
  }
): Promise<Topic> {
  const category = await resolveTopicCategory(db, tenantId, input.category);
  const [topic] = await trace(
    'topics.create',
    async () =>
      await db
        .insert(tables.topic)
        .values({
          tenantId,
          slug: input.slug,
          name: input.name,
          description: input.description,
          categoryId: category?.id ?? null,
          channels: input.channels ?? [...CHANNELS],
          defaultOptedIn: input.defaultOptedIn ?? true,
          channelDefaults: input.channelDefaults ?? {},
        })
        .returning()
  );

  return withCategory(topic!, category?.name ?? null);
}

export async function listTopics(
  db: Db,
  tenantId: number,
  options: { limit: number; beforeId?: number }
): Promise<Topic[]> {
  const rows = await trace(
    'topics.list',
    async () =>
      await db
        .select({ record: tables.topic, categoryName: tables.topicCategory.name })
        .from(tables.topic)
        .leftJoin(tables.topicCategory, eq(tables.topic.categoryId, tables.topicCategory.id))
        .where(
          and(
            eq(tables.topic.tenantId, tenantId),
            isNull(tables.topic.deletedAt),
            options.beforeId ? lt(tables.topic.id, options.beforeId) : undefined
          )
        )
        .orderBy(desc(tables.topic.id))
        .limit(options.limit + 1)
  );
  return rows.map((row) => withCategory(row.record, row.categoryName));
}

export async function countTopics(db: Db, tenantId: number): Promise<number> {
  const [row] = await trace(
    'topics.count',
    async () =>
      await db
        .select({ total: count() })
        .from(tables.topic)
        .where(and(eq(tables.topic.tenantId, tenantId), isNull(tables.topic.deletedAt)))
  );
  return Number(row?.total ?? 0);
}

export async function findTopicBySlug(db: Db, tenantId: number, slug: string): Promise<Topic> {
  const [row] = await trace(
    'topics.findBySlug',
    async () =>
      await db
        .select({ record: tables.topic, categoryName: tables.topicCategory.name })
        .from(tables.topic)
        .leftJoin(tables.topicCategory, eq(tables.topic.categoryId, tables.topicCategory.id))
        .where(
          and(
            eq(tables.topic.tenantId, tenantId),
            eq(tables.topic.slug, slug),
            isNull(tables.topic.deletedAt)
          )
        )
  );

  if (!row) {
    throw new NotFoundError('Topic not found');
  }

  return withCategory(row.record, row.categoryName);
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
    channels?: Channel[];
    defaultOptedIn?: boolean;
    channelDefaults?: Partial<Record<Channel, boolean>>;
  }
): Promise<Topic> {
  const category =
    patch.category === undefined ? undefined : await resolveTopicCategory(db, tenantId, patch.category);
  const [updated] = await trace(
    'topics.update',
    async () =>
      await db
        .update(tables.topic)
        .set({
          slug: patch.slug,
          name: patch.name,
          description: patch.description,
          ...(category === undefined ? {} : { categoryId: category?.id ?? null }),
          channels: patch.channels,
          defaultOptedIn: patch.defaultOptedIn,
          channelDefaults: patch.channelDefaults,
        })
        .where(eq(tables.topic.id, topicId))
        .returning()
  );

  return withCategory(
    updated!,
    category === undefined ? await categoryNameOf(db, updated!) : (category?.name ?? null)
  );
}

async function categoryNameOf(db: Db, record: TopicRecord): Promise<string | null> {
  if (!record.categoryId) return null;
  const [row] = await db
    .select({ name: tables.topicCategory.name })
    .from(tables.topicCategory)
    .where(eq(tables.topicCategory.id, record.categoryId));
  return row?.name ?? null;
}

export async function softDeleteTopic(db: Db, topicId: number): Promise<Topic> {
  const [deleted] = await trace(
    'topics.softDelete',
    async () =>
      await db
        .update(tables.topic)
        .set({ deletedAt: new Date() })
        .where(eq(tables.topic.id, topicId))
        .returning()
  );

  return withCategory(deleted!, await categoryNameOf(db, deleted!));
}

export type ChannelPreference = {
  optedIn: boolean;
  isDefault: boolean;
};

export type SubscriberPreference = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  channels: Partial<Record<Channel, ChannelPreference>>;
};

export type PreferenceChanges = Record<string, boolean | Partial<Record<string, boolean>>>;

export const PreferenceChangesSchema = t.Record(
  t.String(),
  t.Union([t.Boolean(), t.Partial(t.Object({ push: t.Boolean(), email: t.Boolean() }))]),
  { minProperties: 1, maxProperties: 100 }
);

export async function listPreferences(
  db: Db,
  tenantId: number,
  subscriberId: number
): Promise<SubscriberPreference[]> {
  return await trace('preferences.list', async () => {
    const rows = await db
      .select({
        topic: tables.topic,
        categoryName: tables.topicCategory.name,
        preference: tables.subscriberPreference,
      })
      .from(tables.topic)
      .leftJoin(tables.topicCategory, eq(tables.topic.categoryId, tables.topicCategory.id))
      .leftJoin(
        tables.subscriberPreference,
        and(
          eq(tables.subscriberPreference.topicId, tables.topic.id),
          eq(tables.subscriberPreference.subscriberId, subscriberId)
        )
      )
      .where(and(eq(tables.topic.tenantId, tenantId), isNull(tables.topic.deletedAt)))
      .orderBy(asc(tables.topic.id));

    const byTopic = new Map<number, { topic: Topic; overrides: Map<Channel, boolean> }>();
    for (const { topic: record, categoryName, preference } of rows) {
      const topic = withCategory(record, categoryName);
      const entry = byTopic.get(topic.id) ?? { topic, overrides: new Map<Channel, boolean>() };
      if (preference) {
        entry.overrides.set(preference.channel as Channel, preference.optedIn);
      }
      byTopic.set(topic.id, entry);
    }

    return [...byTopic.values()].map(({ topic, overrides }) => ({
      id: topic.id,
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      category: topic.category,
      channels: Object.fromEntries(
        (topic.channels as Channel[]).map((channel) => [
          channel,
          {
            optedIn: overrides.get(channel) ?? topicDefault(topic, channel),
            isDefault: !overrides.has(channel),
          },
        ])
      ) as Partial<Record<Channel, ChannelPreference>>,
    }));
  });
}

export async function updatePreferences(
  db: Db,
  tenantId: number,
  subscriberId: number,
  changes: PreferenceChanges
): Promise<{ preferences: SubscriberPreference[]; changed: boolean }> {
  const slugs = Object.keys(changes);
  if (slugs.length === 0) {
    throw new BadRequestError('Nothing to update');
  }

  for (const value of Object.values(changes)) {
    if (typeof value === 'boolean') continue;
    for (const channel of Object.keys(value)) {
      if (!CHANNELS.includes(channel as Channel)) {
        throw new BadRequestError(`Unknown channel '${channel}'`);
      }
    }
  }

  return await trace('preferences.update', async () => {
    const topics = await db
      .select()
      .from(tables.topic)
      .where(
        and(
          eq(tables.topic.tenantId, tenantId),
          inArray(tables.topic.slug, slugs),
          isNull(tables.topic.deletedAt)
        )
      );

    const bySlug = new Map(topics.map((topic) => [topic.slug, topic]));
    for (const slug of slugs) {
      if (!bySlug.has(slug)) {
        throw new NotFoundError(`Unknown topic '${slug}'`);
      }
    }

    const perChannel = new Map<string, Map<Channel, boolean>>();
    for (const [slug, value] of Object.entries(changes)) {
      const offered = bySlug.get(slug)!.channels as Channel[];
      const channelMap = new Map<Channel, boolean>();
      if (typeof value === 'boolean') {
        for (const channel of offered) channelMap.set(channel, value);
      } else {
        for (const [channel, optedIn] of Object.entries(value)) {
          if (!offered.includes(channel as Channel)) {
            throw new BadRequestError(`Topic '${slug}' is not offered on the '${channel}' channel`, {
              code: 'channel_not_offered',
              param: 'preferences',
            });
          }
          if (typeof optedIn === 'boolean') channelMap.set(channel as Channel, optedIn);
        }
      }
      if (channelMap.size === 0) {
        throw new BadRequestError(`No channels to update for topic '${slug}'`);
      }
      perChannel.set(slug, channelMap);
    }

    const rows = [...perChannel].flatMap(([slug, channelMap]) =>
      [...channelMap].map(([channel, optedIn]) => ({
        tenantId,
        subscriberId,
        topicId: bySlug.get(slug)!.id,
        channel,
        optedIn,
      }))
    );

    const current = await db
      .select({
        topicId: tables.subscriberPreference.topicId,
        channel: tables.subscriberPreference.channel,
        optedIn: tables.subscriberPreference.optedIn,
      })
      .from(tables.subscriberPreference)
      .where(
        and(
          eq(tables.subscriberPreference.subscriberId, subscriberId),
          inArray(
            tables.subscriberPreference.topicId,
            rows.map((row) => row.topicId)
          )
        )
      );

    const changed = rows.some(
      (row) =>
        current.find((entry) => entry.topicId === row.topicId && entry.channel === row.channel)?.optedIn !==
        row.optedIn
    );

    await db
      .insert(tables.subscriberPreference)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          tables.subscriberPreference.subscriberId,
          tables.subscriberPreference.topicId,
          tables.subscriberPreference.channel,
        ],
        set: { optedIn: sql`excluded.opted_in` },
      });

    return { preferences: await listPreferences(db, tenantId, subscriberId), changed };
  });
}
