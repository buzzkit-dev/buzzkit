import { rewrapCredentials } from '@buzzkit/api/api/credentials/index';
import { createDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';

const SWEEP_LIMIT = 200;

export async function rewrapCredentialsSweep(): Promise<void> {
  await trace('scheduler.rewrap', async (t) => {
    const rewrapped = await rewrapCredentials(createDb({ max: 2 }), SWEEP_LIMIT);
    t.set('rewrap.credentials', rewrapped);
    if (rewrapped > 0)
      log.info('[Scheduler] Re-wrapped credentials under the current master key', { rewrapped });
  });
}
