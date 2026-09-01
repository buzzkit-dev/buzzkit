import { rewrapCredentials } from '@buzzkit/api/api/credentials/index';
import { rewrapTenantSecrets } from '@buzzkit/api/api/secrets/index';
import { rewrapSources } from '@buzzkit/api/api/sources/index';
import { sweep } from './sweep';

const SWEEP_LIMIT = 200;

export async function rewrapSecrets(): Promise<void> {
  await sweep('rewrap', async (db) => {
    return {
      credentials: await rewrapCredentials(db, SWEEP_LIMIT),
      secrets: await rewrapTenantSecrets(db, SWEEP_LIMIT),
      sources: await rewrapSources(db, SWEEP_LIMIT),
    };
  });
}
