import { api } from './api';
import { generateP8 } from './providerKeys';
import { uniq } from './setup';

export const APNS_REACHABLE = process.env.APNS_REACHABLE === 'true';

export const TRANSIENT_STATUS = APNS_REACHABLE ? 'failed' : 'retrying';

export const TRANSIENT_CODES = APNS_REACHABLE
  ? ['invalid_credential']
  : ['transport', 'timeout', 'provider_unavailable'];

export function fakeToken(marker = 'a'): string {
  return `tok-${uniq()}${marker.repeat(48)}`;
}

export async function uploadSandboxApns(headers: Record<string, string>, bundleId = 'dev.buzzkit.test') {
  const { status, body } = await api('/v1/credentials', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: 'apns',
      p8: await generateP8(),
      teamId: 'ABCDE12345',
      keyId: 'XYZ9876543',
      bundleId,
      environment: 'sandbox',
    }),
  });
  if (status !== 201) throw new Error(`apns upload failed: ${status} ${JSON.stringify(body)}`);
  return body.data as { id: string; status: string };
}
