import { diffForEvent } from '@buzzkit/api/api/events/index';
import {
  assertTopicSlugAvailable,
  assertValidChannelDefaults,
  ChannelDefaultsSchema,
  findTopicBySlug,
  serializeTopic,
  softDeleteTopic,
  TopicNameSchema,
  TopicSlugSchema,
  updateTopic,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const topic = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Topics'] } })
  .get(
    '/topics/:topicSlug',
    async ({ db, params, tenant }) => {
      const topic = await findTopicBySlug(db, tenant.id, params.topicSlug);

      return Response.success(serializeTopic(topic), { entity: 'topic' }).send();
    },
    { tenant: 'topics:read' }
  )
  .patch(
    '/topics/:topicSlug',
    async ({ body, db, params, tenant, event }) => {
      assertValidChannelDefaults(body.channelDefaults);

      const topic = await findTopicBySlug(db, tenant.id, params.topicSlug);

      if (
        body.slug === undefined &&
        body.name === undefined &&
        body.description === undefined &&
        body.defaultOptedIn === undefined &&
        body.channelDefaults === undefined
      ) {
        return Response.success(serializeTopic(topic), { entity: 'topic' }).send();
      }

      if (body.slug !== undefined && body.slug !== topic.slug) {
        await assertTopicSlugAvailable(db, tenant.id, body.slug);
      }

      const updated = await updateTopic(db, topic.id, body);

      await event({
        event: 'topic.updated',
        tenantId: tenant.id,
        target: { type: 'topic', id: topic.id },
        data: diffForEvent(topic, updated),
      });

      return Response.success(serializeTopic(updated), { entity: 'topic' }).send();
    },
    {
      tenant: 'topics:write',
      body: t.Object({
        slug: t.Optional(TopicSlugSchema),
        name: t.Optional(TopicNameSchema),
        description: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
        defaultOptedIn: t.Optional(t.Boolean()),
        channelDefaults: t.Optional(ChannelDefaultsSchema),
      }),
    }
  )
  .delete(
    '/topics/:topicSlug',
    async ({ db, params, tenant, event }) => {
      const topic = await findTopicBySlug(db, tenant.id, params.topicSlug);

      const deleted = await softDeleteTopic(db, topic.id);

      await event({
        event: 'topic.deleted',
        tenantId: tenant.id,
        target: { type: 'topic', id: topic.id },
        data: { slug: topic.slug, name: topic.name },
      });

      return Response.success(markDeleted(serializeTopic(deleted)), { entity: 'topic' }).send();
    },
    { tenant: 'topics:write' }
  );
