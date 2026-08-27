import { IdentityHashSchema, literalUnion } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';
import { CLIENT_SOURCES, EVENT_SOURCES, MAX_EVENTS_PER_REQUEST } from './constants';
import type { EventInput } from './types';

export const EventNameSchema = t.String({ pattern: '^\\$?[a-z0-9][a-z0-9_.-]{0,99}$', maxLength: 100 });

export const EventDataSchema = t.Record(t.String(), t.Any());

export const EventTimestampSchema = t.String({ format: 'date-time' });

export const EventIdSchema = t.String({ minLength: 1, maxLength: 64 });

export const EventSourceSchema = literalUnion(EVENT_SOURCES);

export const ClientSourceSchema = literalUnion(CLIENT_SOURCES);

export const EventVolumeRangeSchema = t.Union([t.Literal('24h'), t.Literal('7d'), t.Literal('30d')]);

export const TrackEventSchema = t.Object({
  id: t.Optional(EventIdSchema),
  externalId: t.String({ minLength: 1, maxLength: 256 }),
  name: EventNameSchema,
  timestamp: t.Optional(EventTimestampSchema),
  data: t.Optional(EventDataSchema),
});

export const TrackEventsSchema = t.Union([
  TrackEventSchema,
  t.Object({ events: t.Array(TrackEventSchema, { minItems: 1, maxItems: MAX_EVENTS_PER_REQUEST }) }),
]);

export const ClientTrackEventsSchema = t.Object({
  externalId: t.String({ minLength: 1, maxLength: 256 }),
  identityHash: t.Optional(IdentityHashSchema),
  source: ClientSourceSchema,
  events: t.Array(
    t.Object({
      id: t.Optional(EventIdSchema),
      name: EventNameSchema,
      timestamp: t.Optional(EventTimestampSchema),
      data: t.Optional(EventDataSchema),
    }),
    { minItems: 1, maxItems: MAX_EVENTS_PER_REQUEST }
  ),
});

export function resolveEventInputs(body: typeof TrackEventsSchema.static): EventInput[] {
  return 'events' in body ? body.events : [body];
}
