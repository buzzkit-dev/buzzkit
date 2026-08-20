import { providerFetch } from '../shared/http';
import type {
  DeliveryErrorCode,
  ProviderDefinition,
  ProviderSendInput,
  ProviderSendResult,
  ProviderValidationInput,
  ProviderValidationResult,
} from '../types';

const API_URL = 'https://api.resend.com';

function classify(status: number): DeliveryErrorCode {
  if (status === 401 || status === 403) return 'invalid_credential';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'unknown';
}

async function validate({ secret }: ProviderValidationInput): Promise<ProviderValidationResult> {
  const result = await providerFetch(`${API_URL}/domains`, {
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!result.ok) {
    return { ok: false, code: result.code, reason: result.reason };
  }

  if (result.response.ok) {
    return { ok: true };
  }

  const body = (result.captured.body ?? {}) as { message?: string };
  return {
    ok: false,
    code: classify(result.response.status),
    reason: body.message ?? `resend_status_${result.response.status}`,
  };
}

async function send(_input: ProviderSendInput): Promise<ProviderSendResult> {
  return {
    ok: false,
    code: 'unsupported',
    reason: 'Email sending is not supported yet',
    request: null,
    response: null,
    latencyMs: 0,
  };
}

export const resendProvider: ProviderDefinition = {
  name: 'resend',
  channel: 'email',
  displayName: 'Resend',
  validate,
  send,
};
