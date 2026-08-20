import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, gt, isNull, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Subscriber = typeof tables.subscriber.$inferSelect;
export type Device = typeof tables.device.$inferSelect;

export const ExternalIdSchema = t.String({ minLength: 1, maxLength: 256 });

export const DeviceTokenSchema = t.String({ minLength: 8, maxLength: 4096 });

export const AttributesSchema = t.Record(t.String(), t.Any());

export function serializeSubscriber(subscriber: Subscriber) {
  return {
    id: subscriber.id,
    externalId: subscriber.externalId,
    email: subscriber.email,
    attributes: subscriber.attributes,
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
  };
}

export function serializeDevice(device: Device) {
  return {
    id: device.id,
    subscriberId: device.subscriberId,
    platform: device.platform,
    token: device.token,
    status: device.status,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
  };
}

export async function upsertSubscriber(
  db: Db,
  tenantId: number,
  externalId: string,
  input: { attributes?: Record<string, unknown>; email?: string | null } = {}
): Promise<{ subscriber: Subscriber; created: boolean }> {
  return await trace('subscribers.upsert', async () => {
    const [existing] = await db
      .select()
      .from(tables.subscriber)
      .where(
        and(
          eq(tables.subscriber.tenantId, tenantId),
          eq(tables.subscriber.externalId, externalId),
          isNull(tables.subscriber.deletedAt)
        )
      );

    if (existing) {
      if (input.attributes === undefined && input.email === undefined) {
        return { subscriber: existing, created: false };
      }

      const [updated] = await db
        .update(tables.subscriber)
        .set({
          ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        })
        .where(eq(tables.subscriber.id, existing.id))
        .returning();

      return { subscriber: updated!, created: false };
    }

    const [created] = await db
      .insert(tables.subscriber)
      .values({ tenantId, externalId, attributes: input.attributes ?? {}, email: input.email ?? null })
      .returning();

    return { subscriber: created!, created: true };
  });
}

export async function findSubscriberByExternalId(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<Subscriber> {
  const [subscriber] = await trace(
    'subscribers.findByExternalId',
    async () =>
      await db
        .select()
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            eq(tables.subscriber.externalId, externalId),
            isNull(tables.subscriber.deletedAt)
          )
        )
  );

  if (!subscriber) {
    throw new NotFoundError('Subscriber not found');
  }

  return subscriber;
}

export async function listSubscribers(
  db: Db,
  tenantId: number,
  options: { limit: number; afterId?: number }
): Promise<Subscriber[]> {
  return await trace(
    'subscribers.list',
    async () =>
      await db
        .select()
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            isNull(tables.subscriber.deletedAt),
            options.afterId ? gt(tables.subscriber.id, options.afterId) : undefined
          )
        )
        .orderBy(asc(tables.subscriber.id))
        .limit(options.limit + 1)
  );
}

export async function softDeleteSubscriber(db: Db, subscriber: Subscriber): Promise<Subscriber> {
  return await trace('subscribers.softDelete', async () =>
    db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(tables.subscriber)
        .set({ deletedAt: new Date() })
        .where(eq(tables.subscriber.id, subscriber.id))
        .returning();

      await tx
        .update(tables.device)
        .set({ deletedAt: new Date() })
        .where(and(eq(tables.device.subscriberId, subscriber.id), isNull(tables.device.deletedAt)));

      return deleted!;
    })
  );
}

export async function registerDevice(
  db: Db,
  tenantId: number,
  input: { externalId: string; platform: 'ios' | 'android'; token: string }
): Promise<{ device: Device; deviceCreated: boolean; subscriberCreated: boolean; subscriber: Subscriber }> {
  return await trace('devices.register', async () => {
    const { subscriber, created: subscriberCreated } = await upsertSubscriber(db, tenantId, input.externalId);

    const [existing] = await db
      .select()
      .from(tables.device)
      .where(
        and(
          eq(tables.device.tenantId, tenantId),
          eq(tables.device.token, input.token),
          isNull(tables.device.deletedAt)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(tables.device)
        .set({
          subscriberId: subscriber.id,
          platform: input.platform,
          status: 'active',
          lastSeenAt: new Date(),
          invalidatedAt: null,
          invalidationReason: null,
        })
        .where(eq(tables.device.id, existing.id))
        .returning();

      return { device: updated!, deviceCreated: false, subscriberCreated, subscriber };
    }

    const [created] = await db
      .insert(tables.device)
      .values({
        tenantId,
        subscriberId: subscriber.id,
        platform: input.platform,
        token: input.token,
      })
      .returning();

    return { device: created!, deviceCreated: true, subscriberCreated, subscriber };
  });
}

export async function listDevices(db: Db, subscriberId: number): Promise<Device[]> {
  return await trace(
    'devices.list',
    async () =>
      await db
        .select()
        .from(tables.device)
        .where(and(eq(tables.device.subscriberId, subscriberId), isNull(tables.device.deletedAt)))
        .orderBy(asc(tables.device.id))
  );
}

export async function findDevice(db: Db, tenantId: number, deviceSqid: string): Promise<Device> {
  const deviceId = decodeEntityId('device', deviceSqid);

  if (!deviceId) {
    throw new BadRequestError('Invalid device identifier');
  }

  const [device] = await trace(
    'devices.find',
    async () =>
      await db
        .select()
        .from(tables.device)
        .where(
          and(
            eq(tables.device.id, deviceId),
            eq(tables.device.tenantId, tenantId),
            isNull(tables.device.deletedAt)
          )
        )
  );

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  return device;
}

export async function findDeviceByToken(db: Db, tenantId: number, token: string): Promise<Device> {
  const [device] = await trace(
    'devices.findByToken',
    async () =>
      await db
        .select()
        .from(tables.device)
        .where(
          and(
            eq(tables.device.tenantId, tenantId),
            eq(tables.device.token, token),
            isNull(tables.device.deletedAt)
          )
        )
  );

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  return device;
}

export async function softDeleteDevice(db: Db, deviceId: number): Promise<Device> {
  const [deleted] = await trace(
    'devices.softDelete',
    async () =>
      await db
        .update(tables.device)
        .set({ deletedAt: new Date() })
        .where(eq(tables.device.id, deviceId))
        .returning()
  );

  return deleted!;
}
