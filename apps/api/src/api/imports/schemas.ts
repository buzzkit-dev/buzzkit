import {
  AttributesSchema,
  DeviceContextSchema,
  ExternalIdSchema,
  SubscribeOptionsSchema,
  SubscriptionInputSchema,
} from '@buzzkit/api/api/subscribers/index';
import { MAX_IMPORT_ROWS } from '@buzzkit/schema/imports';
import { t } from 'elysia';

export const ImportRowSchema = t.Composite([
  t.Object({ externalId: ExternalIdSchema }),
  SubscriptionInputSchema,
  t.Object({
    attributes: t.Optional(AttributesSchema),
    timezone: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
    language: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
    country: t.Optional(t.String({ pattern: '^[A-Z]{2}$' })),
    device: t.Optional(t.Pick(DeviceContextSchema, ['appVersion', 'osVersion', 'model'])),
    lastSeenAt: t.Optional(t.String({ format: 'date-time' })),
    enabled: t.Optional(t.Boolean()),
    subscribe: t.Optional(SubscribeOptionsSchema),
  }),
]);

export const ImportBodySchema = t.Object({
  rows: t.Array(ImportRowSchema, { minItems: 1, maxItems: MAX_IMPORT_ROWS }),
});

export type ImportRowInput = typeof ImportRowSchema.static;
