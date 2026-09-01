import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import { findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, inArray, isNull, sql, tables } from '@buzzkit/database';
import { CHANNELS } from './constants';
import { withCategory } from './serialize';
import type { Channel, ChannelPreference, PreferenceChanges, SubscriberPreference, Topic } from './types';

export function topicDefault(topic: Topic, channel: Channel): boolean {
  const overrides = topic.channelDefaults as Partial<Record<Channel, boolean>>;
  return overrides[channel] ?? topic.defaultOptedIn;
}

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

    return [...byTopic.values()].map(({ topic, overrides }) => {
      return {
        id: topic.id,
        slug: topic.slug,
        name: topic.name,
        description: topic.description,
        category: topic.category,
        channels: Object.fromEntries(
          (topic.channels as Channel[]).map((channel) => {
            return [
              channel,
              {
                optedIn: overrides.get(channel) ?? topicDefault(topic, channel),
                isDefault: !overrides.has(channel),
              },
            ];
          })
        ) as Partial<Record<Channel, ChannelPreference>>,
      };
    });
  });
}

export async function listSubscriberPreferences(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<SubscriberPreference[]> {
  const subscriber = await findSubscriberByExternalId(db, tenantId, externalId);
  return await listPreferences(db, tenantId, subscriber.id);
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

    const rows = [...perChannel].flatMap(([slug, channelMap]) => {
      return [...channelMap].map(([channel, optedIn]) => {
        return {
          tenantId,
          subscriberId,
          topicId: bySlug.get(slug)!.id,
          channel,
          optedIn,
        };
      });
    });

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

    const changed = rows.some((row) => {
      return (
        current.find((entry) => entry.topicId === row.topicId && entry.channel === row.channel)?.optedIn !==
        row.optedIn
      );
    });

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

export async function updateSubscriberPreferences(
  db: Db,
  tenantId: number,
  externalId: string,
  changes: PreferenceChanges
): Promise<SubscriberPreference[]> {
  const subscriber = await findSubscriberByExternalId(db, tenantId, externalId);
  const { preferences, changed } = await updatePreferences(db, tenantId, subscriber.id, changes);

  if (changed) {
    await recordSystemEvents(tenantId, subscriber, [{ name: 'preferences.updated', data: { changes } }]);
  }
  return preferences;
}
