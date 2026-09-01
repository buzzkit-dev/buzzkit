import { BadRequestError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, channel as channelEnum, type Db, eq, isNull, tables } from '@buzzkit/database';
import type { ConnectedChannel } from './types';

export function assertChannelsConnected(
  connected: readonly string[],
  channels: readonly string[],
  param: string
): void {
  if (connected.length === 0) {
    throw new BadRequestError('No channel is connected to this tenant. Add a provider credential first', {
      code: 'channel_not_connected',
      param,
    });
  }

  const missing = channels.find((entry) => !connected.includes(entry));
  if (missing !== undefined) {
    throw new BadRequestError(
      `The '${missing}' channel is not connected to this tenant. Add a ${missing} provider credential first`,
      { code: 'channel_not_connected', param }
    );
  }
}

export async function assertChannelConnected(
  db: Db,
  tenantId: number,
  target: string,
  param: string
): Promise<void> {
  assertChannelsConnected(await listConnectedChannels(db, tenantId), [target], param);
}

export async function listConnectedChannels(db: Db, tenantId: number): Promise<ConnectedChannel[]> {
  const rows = await trace('credentials.connectedChannels', async () => {
    return await db
      .selectDistinct({ channel: tables.credential.channel })
      .from(tables.credential)
      .where(and(eq(tables.credential.tenantId, tenantId), isNull(tables.credential.deletedAt)));
  });
  const connected = new Set(rows.map((row) => row.channel));

  return channelEnum.enumValues.filter((entry) => connected.has(entry));
}
