import { describeError } from '@buzzkit/api/libs/error';
import { cachedToken, evictToken } from '../shared/cache';
import { classifyHttpStatus, providerFetch, retryAfterSeconds } from '../shared/http';
import { signJwt } from '../shared/jwt';
import type {
  DeliveryErrorCode,
  ProviderDefinition,
  ProviderEnvironment,
  ProviderSendInput,
  ProviderSendResult,
  ProviderValidationInput,
  ProviderValidationResult,
} from '../types';

const HOSTS: Record<ProviderEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

const JWT_TTL_SECONDS = 50 * 60;
const PROBE_DEVICE_TOKEN = '0'.repeat(64);

const REASON_CODES: Record<string, DeliveryErrorCode> = {
  BadDeviceToken: 'invalid_endpoint',
  Unregistered: 'invalid_endpoint',
  ExpiredToken: 'invalid_endpoint',
  DeviceTokenNotForTopic: 'invalid_endpoint',
  InvalidProviderToken: 'invalid_credential',
  MissingProviderToken: 'invalid_credential',
  ExpiredProviderToken: 'invalid_credential',
  BadCertificate: 'invalid_credential',
  BadCertificateEnvironment: 'invalid_credential',
  TopicDisallowed: 'invalid_credential',
  PayloadTooLarge: 'payload_too_large',
  PayloadEmpty: 'payload_invalid',
  BadCollapseId: 'payload_invalid',
  BadExpirationDate: 'payload_invalid',
  BadMessageId: 'payload_invalid',
  BadPriority: 'payload_invalid',
  BadTopic: 'payload_invalid',
  MissingTopic: 'payload_invalid',
  InvalidPushType: 'payload_invalid',
  TooManyRequests: 'rate_limited',
  TooManyProviderTokenUpdates: 'rate_limited',
  InternalServerError: 'provider_unavailable',
  ServiceUnavailable: 'provider_unavailable',
  Shutdown: 'provider_unavailable',
};

export function classify(status: number, reason: string | null): DeliveryErrorCode {
  if (status === 410) return 'invalid_endpoint';
  if (reason && REASON_CODES[reason]) return REASON_CODES[reason]!;
  return classifyHttpStatus(status);
}

function jwtCacheKey(input: { credentialId: number; keyVersion: number }): string {
  return `apns:jwt:${input.credentialId}:${input.keyVersion}`;
}

export function createApnsJwt(params: { p8: string; teamId: string; keyId: string }): Promise<string> {
  return signJwt({
    algorithm: 'ES256',
    privateKeyPem: params.p8,
    header: { kid: params.keyId },
    claims: { iss: params.teamId, iat: Math.floor(Date.now() / 1000) },
  });
}

export function buildApnsPayload(payload: ProviderSendInput['payload']): Record<string, unknown> {
  const alert: Record<string, unknown> = {};
  if (payload.title !== undefined) alert.title = payload.title;
  if (payload.subtitle !== undefined) alert.subtitle = payload.subtitle;
  if (payload.body !== undefined) alert.body = payload.body;

  const aps: Record<string, unknown> = {};
  if (Object.keys(alert).length > 0) aps.alert = alert;
  if (payload.badge !== undefined) aps.badge = payload.badge;
  if (payload.sound !== undefined) aps.sound = payload.sound;
  if (payload.imageUrl !== undefined) aps['mutable-content'] = 1;

  return {
    aps,
    ...(payload.data ?? {}),
    ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
    ...(payload.apns?.payload ?? {}),
  };
}

function buildHeaders(params: {
  jwt: string;
  bundleId: string;
  priority: number;
  collapseId?: string;
  expiresAt: Date | null;
}): Record<string, string> {
  return {
    authorization: `bearer ${params.jwt}`,
    'apns-topic': params.bundleId,
    'apns-push-type': 'alert',
    'apns-priority': String(params.priority),
    'apns-expiration': String(params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : 0),
    'content-type': 'application/json',
    ...(params.collapseId ? { 'apns-collapse-id': params.collapseId } : {}),
  };
}

async function validate({
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

  const result = await providerFetch(`${HOSTS[environment]}/3/device/${PROBE_DEVICE_TOKEN}`, {
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

async function send(input: ProviderSendInput): Promise<ProviderSendResult> {
  const first = await attempt(input);
  if (first.ok || first.code !== 'invalid_credential' || first.reason !== 'ExpiredProviderToken')
    return first;
  return attempt(input);
}

async function attempt(input: ProviderSendInput): Promise<ProviderSendResult> {
  const startedAt = Date.now();
  const request = buildApnsPayload(input.payload);

  let jwt: string;
  try {
    jwt = await cachedToken(
      jwtCacheKey(input),
      JWT_TTL_SECONDS,
      () =>
        createApnsJwt({
          p8: input.secret,
          teamId: input.details.teamId ?? '',
          keyId: input.details.keyId ?? '',
        }),
      input.tokens
    );
  } catch (error) {
    return {
      ok: false,
      code: 'invalid_credential',
      reason: describeError(error),
      request,
      response: null,
      latencyMs: Date.now() - startedAt,
    };
  }

  const result = await providerFetch(`${HOSTS[input.environment]}/3/device/${input.endpoint}`, {
    method: 'POST',
    headers: buildHeaders({
      jwt,
      bundleId: input.details.bundleId ?? '',
      priority: input.payload.priority === 'normal' ? 5 : 10,
      collapseId: input.payload.collapseId,
      expiresAt: input.expiresAt,
    }),
    body: JSON.stringify(request),
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      reason: result.reason,
      request,
      response: null,
      latencyMs: result.latencyMs,
    };
  }

  if (result.response.ok) {
    return {
      ok: true,
      providerMessageId: result.response.headers.get('apns-id'),
      request,
      response: result.captured,
      latencyMs: result.latencyMs,
    };
  }

  const reason = (result.captured.body as { reason?: string } | null)?.reason ?? null;
  if (reason === 'ExpiredProviderToken') {
    await evictToken(jwtCacheKey(input), input.tokens);
  }

  return {
    ok: false,
    code: classify(result.response.status, reason),
    reason: reason ?? `apns_status_${result.response.status}`,
    retryAfterSeconds: retryAfterSeconds(result.response),
    request,
    response: result.captured,
    latencyMs: result.latencyMs,
  };
}

export const apnsProvider: ProviderDefinition = {
  name: 'apns',
  channel: 'push',
  displayName: 'APNs',
  validate,
  send,
};
