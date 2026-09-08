import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { device } from '@buzzkit/ping/device/index';
import Elysia from 'elysia';

export const stream = new Elysia().get('/:key/stream', async ({ params, request }) => {
  const deviceId = await resolveDeviceId(params.key);
  return await device(deviceId).fetch(request);
});
