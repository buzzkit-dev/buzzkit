import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { authTables } from './schema/auth';
import { credentialTables } from './schema/credential';
import { eventTables } from './schema/event';
import { inviteTables } from './schema/invite';
import { apiKeyTables } from './schema/key';
import { messageTables } from './schema/message';
import { subscriberTables } from './schema/subscriber';
import { tenantTables } from './schema/tenant';
import { topicTables } from './schema/topic';
import { workspaceTables } from './schema/workspace';

export const tables = {
  auth: authTables,
  ...workspaceTables,
  ...tenantTables,
  ...apiKeyTables,
  ...inviteTables,
  ...eventTables,
  ...credentialTables,
  ...subscriberTables,
  ...topicTables,
  ...messageTables,
};

export type DrizzleOptions = { max?: number };

export const createDrizzle = (url: string, options: DrizzleOptions = {}) => {
  const client = postgres(url, {
    max: options.max ?? 5,
    connect_timeout: 10,
    fetch_types: false,
    connection: {
      TimeZone: 'UTC',
    },
  });

  return drizzle(client, { schema: tables });
};

export type Db = ReturnType<typeof createDrizzle>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export * from 'drizzle-orm';
export { drizzle } from 'drizzle-orm/postgres-js';
export { default as postgres } from 'postgres';
export { credentialStatus } from './schema/credential';
export { eventActorType } from './schema/event';
export { apiKeyKind } from './schema/key';
export { deliveryAttemptOutcome, deliveryStatus, messageStatus } from './schema/message';
export { channel, environment, provider } from './schema/shared';
export { subscriptionPlatform, subscriptionStatus } from './schema/subscriber';
export { workspaceMemberRole } from './schema/workspace';
