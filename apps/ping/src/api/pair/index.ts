import { env } from 'cloudflare:workers';
import { mintDeviceId, mintKey, registerKey, revokeKey } from '@buzzkit/ping/api/keys/index';
import { device } from '@buzzkit/ping/device/index';
import { buzzkit } from '@buzzkit/ping/libs/buzzkit';
import { NotFoundError, RateLimitedError } from '@buzzkit/ping/libs/error';
import { spendBudget } from '@buzzkit/ping/utils/budget';
import { signIdentity } from 'buzzkit';
import { CODE_TTL_SECONDS, EXTERNAL_ID_PREFIX, PAIR_RATE_LIMIT } from './constants';

export * from './constants';

export type PairingIdentity = {
  apiUrl: string;
  publishableKey: string;
  externalId: string;
  identityHash: string | null;
};

export type Pairing = {
  key: string;
  deviceId: string;
  identity: PairingIdentity;
};

async function resolveIdentityHash(externalId: string): Promise<string | null> {
  if (!env.BUZZKIT_IDENTITY_SECRET) return null;
  return await signIdentity(externalId, env.BUZZKIT_IDENTITY_SECRET);
}

export async function createPairing(clientAddress: string): Promise<Pairing> {
  await assertPairAllowed(clientAddress);

  const deviceId = mintDeviceId();
  const key = mintKey();
  const externalId = EXTERNAL_ID_PREFIX + deviceId;

  await buzzkit().identify(externalId, { attributes: { source: 'ping' } });
  await device(deviceId).pair(externalId);
  await registerKey(key, deviceId);

  const identityHash = await resolveIdentityHash(externalId);

  return {
    key,
    deviceId,
    identity: {
      apiUrl: env.BUZZKIT_API_URL,
      publishableKey: env.BUZZKIT_PUBLISHABLE_KEY,
      externalId,
      identityHash,
    },
  };
}

export async function rotatePairing(previous: string, deviceId: string): Promise<string> {
  const key = mintKey();
  await registerKey(key, deviceId);
  await revokeKey(previous);

  return key;
}

export async function createPairingCode(key: string): Promise<{ code: string; expiresIn: number }> {
  const code = mintCode();
  await env.KEYS.put(codeEntry(code), key, { expirationTtl: CODE_TTL_SECONDS });

  return { code, expiresIn: CODE_TTL_SECONDS };
}

export async function claimPairingCode(code: string): Promise<string> {
  const entry = codeEntry(code);
  const key = await env.KEYS.get(entry);
  if (!key) throw new NotFoundError('That code has expired or was already used', { code: 'code_invalid' });

  await env.KEYS.delete(entry);
  return key;
}

async function assertPairAllowed(clientAddress: string): Promise<void> {
  const entry = `pair:${clientAddress}`;
  const stored = await env.KEYS.get(entry);
  const now = Date.now();
  const previous = stored ? (JSON.parse(stored) as { tokens: number; refilledAt: number }) : null;
  const spend = spendBudget(previous, now, PAIR_RATE_LIMIT);

  await env.KEYS.put(entry, JSON.stringify(spend.budget), { expirationTtl: 86_400 });
  if (!spend.allowed) throw new RateLimitedError(spend.retryAfterSeconds);
}

function codeEntry(code: string): string {
  return `code:${code}`;
}

function mintCode(): string {
  const digits = crypto.getRandomValues(new Uint8Array(6));
  return [...digits].map((digit) => String(digit % 10)).join('');
}
