import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { normalizePing, PingSchema } from '@buzzkit/ping/api/ping/index';
import { device, unwrap } from '@buzzkit/ping/device/index';
import Elysia from 'elysia';

export const key = new Elysia()
  .get('/:key', async ({ params }) => {
    const deviceId = await resolveDeviceId(params.key);
    return { ok: true, ...unwrap(await device(deviceId).snapshot()) };
  })
  .post(
    '/:key',
    async ({ body, params }) => {
      const deviceId = await resolveDeviceId(params.key);
      return unwrap(await device(deviceId).ping(normalizePing(body)));
    },
    { body: PingSchema }
  )
  .delete('/:key', async ({ params }) => {
    const deviceId = await resolveDeviceId(params.key);
    unwrap(await device(deviceId).reset());

    return { ok: true, reset: true };
  });
