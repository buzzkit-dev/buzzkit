import { WALL_CLOCK_PATTERN } from '@buzzkit/api/api/scheduling/index';
import { SegmentExpressionSchema } from '@buzzkit/api/api/segments/index';
import { ExternalIdSchema } from '@buzzkit/api/api/subscribers/index';
import { TopicSlugSchema } from '@buzzkit/api/api/topics/index';
import { ChannelSchema, SlugSchema, UrlSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';
import { MAX_DIRECT_TARGETS, MAX_TTL_SECONDS, MESSAGE_STATUSES } from './constants';

export const MessagePayloadSchema = t.Object({
  title: t.Optional(t.String({ maxLength: 500 })),
  body: t.Optional(t.String({ maxLength: 4000 })),
  subtitle: t.Optional(t.String({ maxLength: 500 })),
  badge: t.Optional(t.Integer({ minimum: 0 })),
  sound: t.Optional(t.String({ maxLength: 100 })),
  imageUrl: t.Optional(UrlSchema),
  data: t.Optional(t.Record(t.String(), t.Any())),
  collapseId: t.Optional(t.String({ maxLength: 64 })),
  priority: t.Optional(t.Union([t.Literal('high'), t.Literal('normal')])),
  apns: t.Optional(
    t.Object({
      payload: t.Optional(t.Record(t.String(), t.Any())),
    })
  ),
  fcm: t.Optional(
    t.Object({
      android: t.Optional(t.Record(t.String(), t.Any())),
      payload: t.Optional(t.Record(t.String(), t.Any())),
    })
  ),
});

export const MessageScheduleSchema = t.Object({
  at: t.String({ pattern: WALL_CLOCK_PATTERN.source }),
  timezone: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
  defaultTimezone: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
});

export const CreateMessageSchema = t.Composite([
  t.Object({
    to: t.Optional(
      t.Union([ExternalIdSchema, t.Array(ExternalIdSchema, { minItems: 1, maxItems: MAX_DIRECT_TARGETS })])
    ),
    topic: t.Optional(TopicSlugSchema),
    segment: t.Optional(SlugSchema),
    where: t.Optional(SegmentExpressionSchema),
    channel: t.Optional(ChannelSchema),
    ttlSeconds: t.Optional(t.Integer({ minimum: 60, maximum: MAX_TTL_SECONDS })),
    schedule: t.Optional(MessageScheduleSchema),
    idempotencyKey: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  }),
  MessagePayloadSchema,
]);

export const MessageFiltersSchema = t.Object({
  q: t.Optional(t.String({ maxLength: 200 })),
  status: t.Optional(t.Union(MESSAGE_STATUSES.map((status) => t.Literal(status)))),
  channel: t.Optional(ChannelSchema),
  topic: t.Optional(TopicSlugSchema),
  from: t.Optional(t.String({ format: 'date-time' })),
  to: t.Optional(t.String({ format: 'date-time' })),
});
