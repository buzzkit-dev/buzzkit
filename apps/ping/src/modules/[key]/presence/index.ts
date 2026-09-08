import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { DEFAULT_PRESENCE_SECONDS, MAX_PRESENCE_SECONDS } from '@buzzkit/ping/api/ping/index';
import { device } from '@buzzkit/ping/device/index';
import Elysia, { t } from 'elysia';

export const presence = new Elysia()
  .post(
    '/:key/presence',
    async ({ body, params }) => {
      const deviceId = await resolveDeviceId(params.key);
      const seconds = body?.seconds ?? DEFAULT_PRESENCE_SECONDS;
      const until = Date.now() + seconds * 1000;

      await device(deviceId).markPresent(until);

      return { ok: true, present: true, until: new Date(until).toISOString() };
    },
    {
      body: t.Optional(
        t.Object({ seconds: t.Optional(t.Integer({ minimum: 1, maximum: MAX_PRESENCE_SECONDS })) })
      ),
    }
  )
  .delete('/:key/presence', async ({ params }) => {
    const deviceId = await resolveDeviceId(params.key);
    await device(deviceId).markPresent(null);

    return { ok: true, present: false };
  });
