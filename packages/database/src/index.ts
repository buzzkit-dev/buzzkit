import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { authTables } from './schema/auth';
import { credentialTables } from './schema/credential';
import { eventTables } from './schema/event';
import { inviteTables } from './schema/invite';
import { apiKeyTables } from './schema/key';
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
};

export const createDrizzle = (url: string) => {
  const client = postgres(url, {
    max: 5,
    fetch_types: false,
    connection: {
      TimeZone: 'UTC',
    },
  });

  return drizzle(client, { schema: tables });
};

export type Db = ReturnType<typeof createDrizzle>;

export * from 'drizzle-orm';
export { drizzle } from 'drizzle-orm/postgres-js';
export { default as postgres } from 'postgres';
