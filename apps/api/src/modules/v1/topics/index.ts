import { assertChannelsConnected, listConnectedChannels } from '@buzzkit/api/api/credentials/index';
import {
  assertTopicSlugAvailable,
  assertValidChannelDefaults,
  ChannelDefaultsSchema,
  createTopic,
  listTopics,
  serializeTopic,
  TopicChannelsSchema,
  TopicNameSchema,
  TopicSlugSchema,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const topics = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Topics'] } })
  .get(
    '/topics',
    async ({ db, query, tenant }) => {
      const page = await listTopics(db, tenant.id, query);
      return Response.page(page, { entity: 'topic' }).send();
    },
    { tenant: 'topics:read', query: PaginationQuerySchema }
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
