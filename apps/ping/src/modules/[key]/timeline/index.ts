import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { device, unwrap } from '@buzzkit/ping/device/index';
import Elysia from 'elysia';

export const timeline = new Elysia()
  .get('/:key/timeline', async ({ params }) => {
    const deviceId = await resolveDeviceId(params.key);
    return { ok: true, events: unwrap(await device(deviceId).timeline()) };
  })
  .delete('/:key/timeline', async ({ params }) => {
    const deviceId = await resolveDeviceId(params.key);
    unwrap(await device(deviceId).clearTimeline());

    return { ok: true, cleared: true };
  });
