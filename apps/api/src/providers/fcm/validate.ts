import type { ProviderValidationInput, ProviderValidationResult } from '../types';
import { requestAccessToken } from './tokens';

export async function validate({
  secret,
  details,
}: ProviderValidationInput): Promise<ProviderValidationResult> {
  const token = await requestAccessToken({
    project_id: details.projectId ?? '',
    client_email: details.clientEmail ?? '',
    private_key: secret,
  });
  return token.ok ? { ok: true } : { ok: false, code: token.code, reason: token.reason };
}
