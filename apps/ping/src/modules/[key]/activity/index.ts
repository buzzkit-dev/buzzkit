import { resolveDeviceId } from '@buzzkit/ping/api/keys/index';
import { device, unwrap } from '@buzzkit/ping/device/index';
import Elysia, { t } from 'elysia';

export const activity = new Elysia()
  .post(
    '/:key/activity',
    async ({ body, params }) => {
      const deviceId = await resolveDeviceId(params.key);
      unwrap(await device(deviceId).bindActivity(body.activityId));

      return { ok: true, activityId: body.activityId };
    },
    { body: t.Object({ activityId: t.String({ minLength: 1, maxLength: 128 }) }) }
  )
  .delete('/:key/activity', async ({ params }) => {
    const deviceId = await resolveDeviceId(params.key);
    unwrap(await device(deviceId).bindActivity(null));

    return { ok: true, activityId: null };
  });
