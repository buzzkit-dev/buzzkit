import { env } from 'cloudflare:workers';
import { UnknownKeyError } from '@buzzkit/ping/libs/error';

export const KEY_PREFIX = 'bz_';

const KEY_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const KEY_BODY_LENGTH = 24;
const DEVICE_ID_LENGTH = 20;

export function mintKey(): string {
  return KEY_PREFIX + randomString(KEY_BODY_LENGTH);
}

export function mintDeviceId(): string {
  return randomString(DEVICE_ID_LENGTH);
}

export function isKey(candidate: string): boolean {
  if (!candidate.startsWith(KEY_PREFIX)) return false;

  const body = candidate.slice(KEY_PREFIX.length);
  if (body.length !== KEY_BODY_LENGTH) return false;

  return [...body].every((character) => KEY_ALPHABET.includes(character));
}

export async function registerKey(key: string, deviceId: string): Promise<void> {
  await env.KEYS.put(key, deviceId);
}

export async function resolveDeviceId(key: string): Promise<string> {
  if (!isKey(key)) throw new UnknownKeyError();

  const deviceId = await env.KEYS.get(key);
  if (!deviceId) throw new UnknownKeyError();

  return deviceId;
}

export async function revokeKey(key: string): Promise<void> {
  await env.KEYS.delete(key);
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join('');
}
