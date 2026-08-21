import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, channel, type Db, eq, inArray, isNull, sql, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Topic = typeof tables.topic.$inferSelect;

export const CHANNELS = channel.enumValues;
export type Channel = (typeof CHANNELS)[number];

export const ChannelDefaultsSchema = t.Record(t.String(), t.Any());

export const TopicSlugSchema = SlugSchema;

export const TopicNameSchema = NameSchema;

export function serializeTopic(topic: Topic) {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    defaultOptedIn: topic.defaultOptedIn,
    channelDefaults: topic.channelDefaults,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

export function assertValidChannelDefaults(channelDefaults: unknown): void {
  if (channelDefaults === undefined) return;
  if (!channelDefaults || typeof channelDefaults !== 'object' || Array.isArray(channelDefaults)) {
    throw new BadRequestError('channelDefaults must be an object');
  }
  for (const [channel, value] of Object.entries(channelDefaults)) {
    if (!CHANNELS.includes(channel as Channel)) {
      throw new BadRequestError(`Unknown channel '${channel}' in channelDefaults`);
    }
    if (typeof value !== 'boolean') {
      throw new BadRequestError(`channelDefaults.${channel} must be a boolean`);
    }
  }
}

export function topicDefault(topic: Topic, channel: Channel): boolean {
  const overrides = topic.channelDefaults as Partial<Record<Channel, boolean>>;
  return overrides[channel] ?? topic.defaultOptedIn;
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
    defaultOptedIn?: boolean;
    channelDefaults?: Partial<Record<Channel, boolean>>;
  }
): Promise<Topic> {
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
          defaultOptedIn: input.defaultOptedIn ?? true,
          channelDefaults: input.channelDefaults ?? {},
        })
        .returning()
  );

  return topic!;
}

export async function listTopics(db: Db, tenantId: number): Promise<Topic[]> {
  return await trace(
    'topics.list',
    async () =>
      await db
        .select()
        .from(tables.topic)
        .where(and(eq(tables.topic.tenantId, tenantId), isNull(tables.topic.deletedAt)))
        .orderBy(asc(tables.topic.id))
  );
}

export async function findTopicBySlug(db: Db, tenantId: number, slug: string): Promise<Topic> {
  const [topic] = await trace(
    'topics.findBySlug',
    async () =>
      await db
        .select()
        .from(tables.topic)
        .where(
          and(
            eq(tables.topic.tenantId, tenantId),
            eq(tables.topic.slug, slug),
            isNull(tables.topic.deletedAt)
          )
        )
  );

  if (!topic) {
    throw new NotFoundError('Topic not found');
  }

  return topic;
}

export async function updateTopic(
  db: Db,
  topicId: number,
  patch: {
    slug?: string;
    name?: string;
    description?: string | null;
    defaultOptedIn?: boolean;
    channelDefaults?: Partial<Record<Channel, boolean>>;
  }
): Promise<Topic> {
  const [updated] = await trace(
    'topics.update',
    async () =>
      await db
        .update(tables.topic)
        .set({
          slug: patch.slug,
          name: patch.name,
          description: patch.description,
          defaultOptedIn: patch.defaultOptedIn,
          channelDefaults: patch.channelDefaults,
        })
        .where(eq(tables.topic.id, topicId))
        .returning()
  );

  return updated!;
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

  return deleted!;
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
  channels: Record<Channel, ChannelPreference>;
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
        preference: tables.subscriberPreference,
      })
      .from(tables.topic)
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
    for (const { topic, preference } of rows) {
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
      channels: Object.fromEntries(
        CHANNELS.map((channel) => [
          channel,
          {
            optedIn: overrides.get(channel) ?? topicDefault(topic, channel),
            isDefault: !overrides.has(channel),
          },
        ])
      ) as Record<Channel, ChannelPreference>,
    }));
  });
}

export async function updatePreferences(
  db: Db,
  tenantId: number,
  subscriberId: number,
  changes: PreferenceChanges
): Promise<SubscriberPreference[]> {
  const slugs = Object.keys(changes);
  if (slugs.length === 0) {
    throw new BadRequestError('Nothing to update');
  }

  const perChannel = new Map<string, Map<Channel, boolean>>();
  for (const [slug, value] of Object.entries(changes)) {
    const channelMap = new Map<Channel, boolean>();
    if (typeof value === 'boolean') {
      for (const channel of CHANNELS) {
        channelMap.set(channel, value);
      }
    } else {
      for (const [channel, optedIn] of Object.entries(value)) {
        if (!CHANNELS.includes(channel as Channel)) {
          throw new BadRequestError(`Unknown channel '${channel}'`);
        }
        if (typeof optedIn === 'boolean') {
          channelMap.set(channel as Channel, optedIn);
        }
      }
    }
    if (channelMap.size === 0) {
      throw new BadRequestError(`No channels to update for topic '${slug}'`);
    }
    perChannel.set(slug, channelMap);
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

    const rows = [...perChannel].flatMap(([slug, channelMap]) =>
      [...channelMap].map(([channel, optedIn]) => ({
        tenantId,
        subscriberId,
        topicId: bySlug.get(slug)!.id,
        channel,
        optedIn,
      }))
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

    return listPreferences(db, tenantId, subscriberId);
  });
}
