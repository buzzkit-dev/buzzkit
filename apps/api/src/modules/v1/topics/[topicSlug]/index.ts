import { diffForEvent } from '@buzzkit/api/api/audit/index';
import { assertChannelsConnected, listConnectedChannels } from '@buzzkit/api/api/credentials/index';
import {
  assertTopicSlugAvailable,
  assertValidChannelDefaults,
  ChannelDefaultsSchema,
  findTopicBySlug,
  resolveChannelDefaults,
  serializeTopic,
  softDeleteTopic,
  TopicChannelsSchema,
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
    async ({ body, db, params, tenant, audit }) => {
      const topic = await findTopicBySlug(db, tenant.id, params.topicSlug);
      const channels = body.channels ?? topic.channels;

      if (body.channels) {
        assertChannelsConnected(await listConnectedChannels(db, tenant.id), body.channels, 'channels');
      }

      assertValidChannelDefaults(body.channelDefaults, channels);

      if (
        body.slug === undefined &&
        body.name === undefined &&
        body.description === undefined &&
        body.category === undefined &&
        body.channels === undefined &&
        body.defaultOptedIn === undefined &&
        body.channelDefaults === undefined
      ) {
        return Response.success(serializeTopic(topic), { entity: 'topic' }).send();
      }

      if (body.slug !== undefined && body.slug !== topic.slug) {
        await assertTopicSlugAvailable(db, tenant.id, body.slug);
      }

      const updated = await updateTopic(db, tenant.id, topic.id, {
        ...body,
        channelDefaults: resolveChannelDefaults(body.channelDefaults ?? topic.channelDefaults, channels),
      });

      await audit({
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
        category: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
        channels: t.Optional(TopicChannelsSchema),
        defaultOptedIn: t.Optional(t.Boolean()),
        channelDefaults: t.Optional(ChannelDefaultsSchema),
      }),
    }
  )
  .delete(
    '/topics/:topicSlug',
    async ({ db, params, tenant, audit }) => {
      const topic = await findTopicBySlug(db, tenant.id, params.topicSlug);

      const deleted = await softDeleteTopic(db, topic.id);

      await audit({
        event: 'topic.deleted',
        tenantId: tenant.id,
        target: { type: 'topic', id: topic.id },
        data: { slug: topic.slug, name: topic.name },
      });

      return Response.success(markDeleted(serializeTopic(deleted)), { entity: 'topic' }).send();
    },
    { tenant: 'topics:write' }
  );
