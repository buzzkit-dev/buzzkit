import { ChannelSchema, NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const ChannelDefaultsSchema = t.Record(t.String(), t.Any());

export const TopicChannelsSchema = t.Array(ChannelSchema, { minItems: 1, uniqueItems: true });

export const TopicSlugSchema = SlugSchema;

export const TopicSlugParamsSchema = t.Object({ topicSlug: TopicSlugSchema });

export const TopicNameSchema = NameSchema;

export const PreferenceChangesSchema = t.Record(
  t.String(),
  t.Union([t.Boolean(), t.Partial(t.Object({ push: t.Boolean(), email: t.Boolean() }))]),
  { minProperties: 1, maxProperties: 100 }
);
