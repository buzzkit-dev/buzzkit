import { batchDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import type { Db } from '@buzzkit/database';

export async function sweep(name: string, run: (db: Db) => Promise<Record<string, number>>): Promise<void> {
  await trace(`scheduler.${name}`, async (t) => {
    const counts = await run(batchDb());
    for (const [key, value] of Object.entries(counts)) t.set(`${name}.${key}`, value);
    if (Object.values(counts).some((value) => value > 0)) log.info(`[Scheduler] ${name}`, counts);
  });
}
