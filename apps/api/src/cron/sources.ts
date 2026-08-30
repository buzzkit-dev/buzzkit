import { purgeSourceDeliveries } from '@buzzkit/api/api/sources/index';
import { sweep } from './sweep';

const SWEEP_LIMIT = 1000;

export async function purgeSources(): Promise<void> {
  await sweep('sources', async (db) => ({ purged: await purgeSourceDeliveries(db, SWEEP_LIMIT) }));
}
