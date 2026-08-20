import { database } from '@buzzkit/api/libs/database';
import { Response } from '@buzzkit/api/libs/response';
import { sql } from '@buzzkit/database';
import Elysia from 'elysia';

export const health = new Elysia().use(database).get('/health', async ({ db, set }) => {
  const startedAt = Date.now();
  await db.execute(sql`select 1`);

  return Response.success({
    status: 'ok',
    database: { status: 'ok', latencyMs: Date.now() - startedAt },
  }).send(set);
});
