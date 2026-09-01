import { assertChannelsConnected, listConnectedChannels } from '@buzzkit/api/api/credentials/index';
import {
  assertTopicSlugAvailable,
  assertValidChannelDefaults,
  ChannelDefaultsSchema,
  countTopics,
  createTopic,
  listTopics,
  serializeTopic,
  TopicChannelsSchema,
  TopicNameSchema,
  TopicSlugSchema,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const topics = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Topics'] } })
  .get(
    '/topics',
    async ({ db, query, tenant }) => {
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('topic', id));

      const [rows, total] = await Promise.all([
        listTopics(db, tenant.id, { limit, beforeId }),
        countTopics(db, tenant.id),
      ]);
      const page = toPage(rows, limit, (id) => encodeId('topic', id));

      return Response.success(page.items.map(serializeTopic), { entity: 'topic' })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor, total })
        .send();
    },
    { tenant: 'topics:read', query: t.Object({ ...PaginationQuerySchema.properties }) }
  )
  .post(
    '/topics',
    async ({ body, db, set, tenant, audit }) => {
      const connected = await listConnectedChannels(db, tenant.id);
      const channels = body.channels ?? connected;

      assertChannelsConnected(connected, channels, 'channels');
      assertValidChannelDefaults(body.channelDefaults, channels);

      await assertTopicSlugAvailable(db, tenant.id, body.slug);

      const topic = await createTopic(db, tenant.id, { ...body, channels });

      await audit({
        event: 'topic.created',
        tenantId: tenant.id,
        target: { type: 'topic', id: topic.id },
        data: {
          slug: topic.slug,
          name: topic.name,
          channels: topic.channels,
          defaultOptedIn: topic.defaultOptedIn,
        },
      });

      return Response.success(serializeTopic(topic), { entity: 'topic' }).status(201).send(set);
    },
    {
      tenant: 'topics:write',
      body: t.Object({
        slug: TopicSlugSchema,
        name: TopicNameSchema,
        description: t.Optional(t.String({ maxLength: 500 })),
        category: t.Optional(t.String({ maxLength: 100 })),
        dailyCap: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
        channels: t.Optional(TopicChannelsSchema),
        defaultOptedIn: t.Optional(t.Boolean()),
        channelDefaults: t.Optional(ChannelDefaultsSchema),
      }),
    }
  );
