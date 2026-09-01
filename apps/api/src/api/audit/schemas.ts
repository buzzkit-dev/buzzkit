import { ActorTypeSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const AuditFiltersSchema = t.Object({
  q: t.Optional(t.String({ maxLength: 200 })),
  event: t.Optional(t.String({ maxLength: 100 })),
  actorType: t.Optional(ActorTypeSchema),
  from: t.Optional(t.String({ format: 'date-time' })),
  to: t.Optional(t.String({ format: 'date-time' })),
});
