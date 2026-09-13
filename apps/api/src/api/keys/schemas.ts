import { KeyKindSchema, NameSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const KeyCreateSchema = t.Object({
  name: NameSchema,
  kind: t.Optional(KeyKindSchema),
  tenant: t.Optional(t.String({ minLength: 1, description: 'Tenant slug — required for tenant keys' })),
  scopes: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 32 })),
  expiresAt: t.Optional(t.String({ format: 'date-time' })),
});

export const KeyUpdateSchema = t.Object({
  name: t.Optional(NameSchema),
});
