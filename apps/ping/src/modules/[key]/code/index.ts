import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { createPairingCode, rotatePairing } from '@buzzkit/ping/api/pair/index';
import { device, unwrap } from '@buzzkit/ping/device/index';
import { resolveOrigin } from '@buzzkit/ping/libs/origin';
import Elysia from 'elysia';

export const code = new Elysia()
  .post('/:key/code', async ({ params }) => {
    await resolveDeviceId(params.key);
    return { ok: true, ...(await createPairingCode(params.key)) };
  })
  .post('/:key/rotate', async ({ params, request }) => {
    const deviceId = await resolveDeviceId(params.key);
    const key = await rotatePairing(params.key, deviceId);
    unwrap(await device(deviceId).reset());
    unwrap(await device(deviceId).clearTimeline());

    return { ok: true, key, endpoint: `${resolveOrigin(request)}/${key}` };
  });
