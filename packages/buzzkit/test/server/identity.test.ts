import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signIdentity } from '../../src/server/identity';

function oracle(externalId: string, secret: string): string {
  return createHmac('sha256', secret).update(externalId).digest('hex');
}

describe('signIdentity', () => {
  it('matches an independent HMAC-SHA256 implementation', async () => {
    await expect(signIdentity('user_123', 'tenant-secret')).resolves.toBe(
      oracle('user_123', 'tenant-secret')
    );
  });

  it('is lowercase hex of the full digest', async () => {
    const hash = await signIdentity('user_123', 'tenant-secret');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const [first, second] = await Promise.all([
      signIdentity('user_123', 'tenant-secret'),
      signIdentity('user_123', 'tenant-secret'),
    ]);

    expect(first).toBe(second);
  });

  it('changes with the subscriber and with the secret', async () => {
    const base = await signIdentity('user_123', 'tenant-secret');

    await expect(signIdentity('user_124', 'tenant-secret')).resolves.not.toBe(base);
    await expect(signIdentity('user_123', 'other-secret')).resolves.not.toBe(base);
  });

  it('handles unicode and empty identifiers the same way as the oracle', async () => {
    for (const externalId of ['', 'ünïcødé', '用户_1', 'a'.repeat(256)]) {
      await expect(signIdentity(externalId, 'tenant-secret'), externalId).resolves.toBe(
        oracle(externalId, 'tenant-secret')
      );
    }
  });
});
