import { env } from 'cloudflare:workers';
import {
  currentKeyVersion,
  masterKeyVersions,
  rewrapSecret,
  sealSecret,
  unsealSecret,
} from '@buzzkit/api/libs/crypto';
import { beforeEach, describe, expect, it } from 'vitest';

const keys = env as Record<string, string | undefined>;

const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

const context = 'credential:v1:1:push:apns:production';

beforeEach(() => {
  for (const name of Object.keys(keys)) if (name.startsWith('CREDENTIAL_MASTER_KEY_V')) delete keys[name];
  keys.CREDENTIAL_MASTER_KEY_V1 = randomKey();
});

describe('master key versions', () => {
  it('reads contiguous versions and treats the highest as current', () => {
    keys.CREDENTIAL_MASTER_KEY_V2 = randomKey();
    keys.CREDENTIAL_MASTER_KEY_V3 = randomKey();
    expect(masterKeyVersions()).toEqual([1, 2, 3]);
    expect(currentKeyVersion()).toBe(3);
  });

  it('stops at a gap so a missing version is never skipped silently', () => {
    keys.CREDENTIAL_MASTER_KEY_V3 = randomKey();
    expect(masterKeyVersions()).toEqual([1]);
  });

  it('refuses a key that is not exactly 32 bytes', () => {
    keys.CREDENTIAL_MASTER_KEY_V1 = Buffer.from('short').toString('base64');
    expect(() => currentKeyVersion()).toThrow(/32 bytes/);
  });

  it('refuses to run without v1', () => {
    delete keys.CREDENTIAL_MASTER_KEY_V1;
    expect(() => currentKeyVersion()).toThrow(/CREDENTIAL_MASTER_KEY_V1/);
  });
});

describe('seal / unseal', () => {
  it('round-trips under the current key and records the version', async () => {
    const sealed = await sealSecret('-----BEGIN PRIVATE KEY-----', context);
    expect(sealed.keyVersion).toBe(1);
    expect(await unsealSecret(sealed, context)).toBe('-----BEGIN PRIVATE KEY-----');
  });

  it('binds the context: the same ciphertext refuses to open elsewhere', async () => {
    const sealed = await sealSecret('secret', context);
    await expect(unsealSecret(sealed, 'credential:v1:2:push:apns:production')).rejects.toThrow();
  });

  it('binds the key version into the wrap: a relabelled row refuses to open', async () => {
    keys.CREDENTIAL_MASTER_KEY_V2 = keys.CREDENTIAL_MASTER_KEY_V1;
    const sealed = await sealSecret('secret', context);
    await expect(unsealSecret({ ...sealed, keyVersion: 1 }, context)).rejects.toThrow();
  });

  it('still opens rows sealed under an older key after rotation', async () => {
    const sealed = await sealSecret('secret', context);
    keys.CREDENTIAL_MASTER_KEY_V2 = randomKey();
    expect(currentKeyVersion()).toBe(2);
    expect(await unsealSecret(sealed, context)).toBe('secret');
  });

  it('fails clearly when the key a row needs is gone', async () => {
    const sealed = await sealSecret('secret', context);
    keys.CREDENTIAL_MASTER_KEY_V1 = randomKey();
    await expect(unsealSecret(sealed, context)).rejects.toThrow();
  });
});

describe('rewrap', () => {
  it('moves a row to the current key without touching the payload ciphertext', async () => {
    const sealed = await sealSecret('secret', context);
    keys.CREDENTIAL_MASTER_KEY_V2 = randomKey();
    const rewrapped = await rewrapSecret(sealed, context);
    expect(rewrapped.keyVersion).toBe(2);
    expect(rewrapped.secretCiphertext).toBe(sealed.secretCiphertext);
    expect(rewrapped.secretIv).toBe(sealed.secretIv);
    expect(rewrapped.dekCiphertext).not.toBe(sealed.dekCiphertext);
    expect(await unsealSecret(rewrapped, context)).toBe('secret');
    delete keys.CREDENTIAL_MASTER_KEY_V1;
    keys.CREDENTIAL_MASTER_KEY_V1 = randomKey();
    expect(await unsealSecret(rewrapped, context)).toBe('secret');
  });
});
