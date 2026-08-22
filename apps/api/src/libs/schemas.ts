import {
  apiKeyKind,
  channel,
  environment,
  eventActorType,
  subscriptionPlatform,
  workspaceMemberRole,
} from '@buzzkit/database';
import { t } from 'elysia';

type Literals<T extends readonly string[]> = { -readonly [K in keyof T]: ReturnType<typeof t.Literal<T[K]>> };

export const literalUnion = <const T extends readonly [string, ...string[]]>(
  values: T
): ReturnType<typeof t.Union<Literals<T>>> =>
  t.Union(values.map((value) => t.Literal(value))) as ReturnType<typeof t.Union<Literals<T>>>;

export const ChannelSchema = literalUnion(channel.enumValues);

export const PlatformSchema = literalUnion(subscriptionPlatform.enumValues);

export const EnvironmentSchema = literalUnion(environment.enumValues);

export const MemberRoleSchema = literalUnion(workspaceMemberRole.enumValues);

export const ActorTypeSchema = literalUnion(eventActorType.enumValues);

export const KeyKindSchema = literalUnion(apiKeyKind.enumValues);

export const SlugSchema = t.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', minLength: 3, maxLength: 48 });

export const NameSchema = t.String({ minLength: 1, maxLength: 100 });

export const EmailSchema = t.String({ format: 'email', maxLength: 254 });

export const UrlSchema = t.String({ format: 'uri', maxLength: 2048 });

export const IdentityHashSchema = t.String({ maxLength: 128 });
