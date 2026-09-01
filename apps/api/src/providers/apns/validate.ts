import { providerFetch } from '../shared/http';
import type { ProviderValidationInput, ProviderValidationResult } from '../types';
import { classify } from './classify';
import { buildHeaders, HOSTS } from './request';
import { createApnsJwt } from './tokens';

export async function validate({
  secret,
  details,
  environment,
}: ProviderValidationInput): Promise<ProviderValidationResult> {
  let jwt: string;
  try {
    jwt = await createApnsJwt({ p8: secret, teamId: details.teamId ?? '', keyId: details.keyId ?? '' });
  } catch {
    return {
      ok: false,
      code: 'invalid_credential',
      reason: 'The key is not a valid APNs .p8 (PKCS#8 / P-256) private key',
    };
  }

  const result = await providerFetch(`${HOSTS[environment]}/3/device/${'0'.repeat(64)}`, {
    method: 'POST',
    headers: buildHeaders({ jwt, bundleId: details.bundleId ?? '', priority: 10, expiresAt: null }),
    body: JSON.stringify({ aps: {} }),
  });

  if (!result.ok) {
    return { ok: false, code: result.code, reason: result.reason };
  }

  const reason = (result.captured.body as { reason?: string } | null)?.reason ?? null;
  if (result.response.status === 400 && reason === 'BadDeviceToken') {
    return { ok: true };
  }

  return {
    ok: false,
    code: classify(result.response.status, reason),
    reason: reason ?? `apns_status_${result.response.status}`,
  };
}
