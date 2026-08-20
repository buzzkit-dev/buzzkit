import { drizzle, postgres } from '@buzzkit/database';

export { eq, sql, tables } from '@buzzkit/database';

/**
 * Direct database access for tests that need to seed or time-travel state the
 * API refuses to create (expired keys, expired invites). idle_timeout lets the
 * vitest process exit without an explicit teardown.
 */
const client = postgres('postgresql://postgres:postgres@localhost:5460/buzzkit', {
  max: 2,
  idle_timeout: 1,
  fetch_types: false,
});

export const db = drizzle(client);
