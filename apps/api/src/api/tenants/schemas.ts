import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const TenantSlugSchema = SlugSchema;

export const TenantSlugParamsSchema = t.Object({ tenantSlug: TenantSlugSchema });

export const TenantNameSchema = NameSchema;

export const TenantMetadataSchema = t.Record(t.String(), t.Any(), {
  description: 'Free-form data, e.g. your own customer id',
});

export const TenantSettingsSchema = t.Object(
  {},
  {
    additionalProperties: true,
    description: 'Structured tenant settings — validated against the settings catalog',
  }
);
