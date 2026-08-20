import { drizzle, postgres } from '@buzzkit/database';

export { eq, sql, tables } from '@buzzkit/database';

const client = postgres('postgresql://postgres:postgres@localhost:5460/buzzkit', {
  max: 2,
  idle_timeout: 1,
  fetch_types: false,
});

export const db = drizzle(client);
