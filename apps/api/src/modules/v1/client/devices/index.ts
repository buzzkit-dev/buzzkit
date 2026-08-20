import {
  DeviceTokenSchema,
  ExternalIdSchema,
  findDeviceByToken,
  registerDevice,
  serializeDevice,
  softDeleteDevice,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyIdentity } from '@buzzkit/api/libs/identity';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const clientDevices = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/devices',
    async ({ body, db, set, tenant, clientEvent }) => {
      await verifyIdentity(tenant, body.externalId, body.identityHash);

      const { device, deviceCreated, subscriberCreated, subscriber } = await registerDevice(db, tenant.id, {
        externalId: body.externalId,
        platform: body.platform,
        token: body.token,
      });

      if (deviceCreated) {
        await clientEvent(subscriber.externalId)({
          event: 'device.registered',
          tenantId: tenant.id,
          target: { type: 'device', id: device.id },
          data: { externalId: subscriber.externalId, platform: device.platform, subscriberCreated },
        });
      }

      return Response.success(
        {
          ...serializeDevice(device),
          subscriberId: encodeId('subscriber', device.subscriberId),
          externalId: subscriber.externalId,
        },
        { entity: 'device' }
      )
        .status(deviceCreated ? 201 : 200)
        .send(set);
    },
    {
      client: true,
      body: t.Object({
        externalId: ExternalIdSchema,
        platform: t.Union([t.Literal('ios'), t.Literal('android')]),
        token: DeviceTokenSchema,
        identityHash: t.Optional(t.String({ maxLength: 128 })),
      }),
    }
  )
  .delete(
    '/client/devices',
    async ({ body, db, tenant, clientEvent }) => {
      const device = await findDeviceByToken(db, tenant.id, body.token);

      const deleted = await softDeleteDevice(db, device.id);

      await clientEvent(body.token.slice(0, 8))({
        event: 'device.removed',
        tenantId: tenant.id,
        target: { type: 'device', id: device.id },
        data: { platform: device.platform },
      });

      return Response.success(
        { ...serializeDevice(deleted), subscriberId: encodeId('subscriber', deleted.subscriberId) },
        { entity: 'device' }
      ).send();
    },
    {
      client: true,
      body: t.Object({
        token: DeviceTokenSchema,
      }),
    }
  );
