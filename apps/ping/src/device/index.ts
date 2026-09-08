import { env } from 'cloudflare:workers';
import type { DeviceState } from './state';

export * from './activity';
export * from './constants';
export type { DeviceSnapshot } from './state';
export * from './types';

export function device(deviceId: string): DurableObjectStub<DeviceState> {
  return env.DEVICE.get(env.DEVICE.idFromName(deviceId));
}
