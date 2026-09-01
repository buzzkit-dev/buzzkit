import { EnvironmentSchema } from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const CredentialUploadSchema = t.Union([
  t.Object({
    provider: t.Literal('apns'),
    p8: t.String({ minLength: 1, maxLength: 10_000 }),
    teamId: t.String({ minLength: 10, maxLength: 10 }),
    keyId: t.String({ minLength: 10, maxLength: 10 }),
    bundleId: t.String({ minLength: 1, maxLength: 255 }),
    environment: t.Optional(EnvironmentSchema),
  }),
  t.Object({
    provider: t.Literal('fcm'),
    serviceAccount: t.Union([t.String({ minLength: 1, maxLength: 20_000 }), t.Record(t.String(), t.Any())]),
  }),
  t.Object({
    provider: t.Literal('resend'),
    apiKey: t.String({ minLength: 1, maxLength: 256 }),
  }),
]);

export type CredentialUploadInput = typeof CredentialUploadSchema.static;
