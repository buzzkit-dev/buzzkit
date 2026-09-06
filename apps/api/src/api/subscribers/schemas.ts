import {
  ChannelSchema,
  EmailSchema,
  EnvironmentSchema,
  IdentityHashSchema,
  PlatformSchema,
} from '@buzzkit/api/libs/schemas';
import { t } from 'elysia';

export const ExternalIdSchema = t.String({ minLength: 1, maxLength: 256 });

export const ExternalIdParamsSchema = t.Object({ externalId: ExternalIdSchema });

export const PushTokenSchema = t.String({ minLength: 8, maxLength: 1024 });

export const EmailAddressSchema = EmailSchema;

export const AttributesSchema = t.Record(t.String(), t.Any());

export const SubscribeOptionsSchema = t.Object({ email: t.Optional(t.Boolean()) });

export type SubscribeOptions = typeof SubscribeOptionsSchema.static;

export const PushPermissionSchema = t.Union([
  t.Literal('notDetermined'),
  t.Literal('denied'),
  t.Literal('authorized'),
  t.Literal('provisional'),
  t.Literal('ephemeral'),
]);

export const DeviceContextSchema = t.Object({
  appVersion: t.Optional(t.String({ maxLength: 40 })),
  appBuild: t.Optional(t.String({ maxLength: 40 })),
  sdkVersion: t.Optional(t.String({ maxLength: 40 })),
  osVersion: t.Optional(t.String({ maxLength: 40 })),
  model: t.Optional(t.String({ maxLength: 60 })),
  locale: t.Optional(t.String({ maxLength: 20 })),
  installedAt: t.Optional(t.String({ maxLength: 40 })),
});

export const ClientIdentitySchema = t.Object({
  externalId: ExternalIdSchema,
  identityHash: t.Optional(IdentityHashSchema),
  anonymousId: t.Optional(ExternalIdSchema),
});

export const SubscriptionInputSchema = t.Object({
  channel: t.Optional(ChannelSchema),
  platform: t.Optional(PlatformSchema),
  environment: t.Optional(EnvironmentSchema),
  token: t.Optional(PushTokenSchema),
  address: t.Optional(EmailAddressSchema),
});

export type DeviceContext = typeof DeviceContextSchema.static;

export type SubscriptionInput = typeof SubscriptionInputSchema.static;
