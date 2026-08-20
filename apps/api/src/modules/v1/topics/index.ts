import {
  assertTopicSlugAvailable,
  assertValidChannelDefaults,
  ChannelDefaultsSchema,
  createTopic,
  listTopics,
  serializeTopic,
  TopicNameSchema,
  TopicSlugSchema,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const topics = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Topics'] } })
  .post(
    '/topics',
    async ({ body, db, set, tenant, event }) => {
      assertValidChannelDefaults(body.channelDefaults);
      await assertTopicSlugAvailable(db, tenant.id, body.slug);

      const topic = await createTopic(db, tenant.id, body);

      await event({
        event: 'topic.created',
        tenantId: tenant.id,
        target: { type: 'topic', id: topic.id },
        data: { slug: topic.slug, name: topic.name, defaultOptedIn: topic.defaultOptedIn },
      });

      return Response.success(serializeTopic(topic), { entity: 'topic' }).status(201).send(set);
    },
    {
      tenant: 'topics:write',
      body: t.Object({
        slug: TopicSlugSchema,
        name: TopicNameSchema,
        description: t.Optional(t.String({ maxLength: 500 })),
        defaultOptedIn: t.Optional(t.Boolean()),
        channelDefaults: t.Optional(ChannelDefaultsSchema),
      }),
    }
  )
  .get(
    '/topics',
    async ({ db, tenant }) => {
      const rows = await listTopics(db, tenant.id);

      return Response.success(rows.map(serializeTopic), { entity: 'topic' }).send();
    },
    { tenant: 'topics:read' }
  );
