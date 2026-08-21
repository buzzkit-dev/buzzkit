import { cachedToken, evictToken } from '../shared/cache';
import { classifyHttpStatus, providerFetch, retryAfterSeconds } from '../shared/http';
import { signJwt } from '../shared/jwt';
import type {
  DeliveryErrorCode,
  ProviderDefinition,
  ProviderSendInput,
  ProviderSendResult,
  ProviderValidationInput,
  ProviderValidationResult,
} from '../types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_API = 'https://fcm.googleapis.com/v1/projects';
const TOKEN_TTL_MARGIN_SECONDS = 300;

const ERROR_CODES: Record<string, DeliveryErrorCode> = {
  UNREGISTERED: 'invalid_endpoint',
  INVALID_ARGUMENT: 'payload_invalid',
  SENDER_ID_MISMATCH: 'invalid_credential',
  THIRD_PARTY_AUTH_ERROR: 'invalid_credential',
  PERMISSION_DENIED: 'invalid_credential',
  UNAUTHENTICATED: 'invalid_credential',
  QUOTA_EXCEEDED: 'rate_limited',
  RESOURCE_EXHAUSTED: 'rate_limited',
  UNAVAILABLE: 'provider_unavailable',
  INTERNAL: 'provider_unavailable',
};

export type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export function parseServiceAccount(input: unknown): FcmServiceAccount | null {
  const value = typeof input === 'string' ? safeJsonParse(input) : input;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.project_id !== 'string' ||
    typeof record.client_email !== 'string' ||
    typeof record.private_key !== 'string'
  ) {
    return null;
  }

  if (!PROJECT_ID_PATTERN.test(record.project_id)) return null;

  return {
    project_id: record.project_id,
    client_email: record.client_email,
    private_key: record.private_key,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function classify(status: number, errorCode: string | null): DeliveryErrorCode {
  if (errorCode && ERROR_CODES[errorCode]) return ERROR_CODES[errorCode]!;
  if (status === 404) return 'invalid_endpoint';
  if (status === 401 || status === 403) return 'invalid_credential';
  return classifyHttpStatus(status);
}

function tokenCacheKey(input: { credentialId: number; keyVersion: number }): string {
  return `fcm:token:${input.credentialId}:${input.keyVersion}`;
}

type AccessToken =
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; code: DeliveryErrorCode; reason: string };

async function requestAccessToken(account: FcmServiceAccount): Promise<AccessToken> {
  let assertion: string;
  try {
    const now = Math.floor(Date.now() / 1000);
    assertion = await signJwt({
      algorithm: 'RS256',
      privateKeyPem: account.private_key,
      claims: { iss: account.client_email, scope: FCM_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    });
  } catch {
    return {
      ok: false,
      code: 'invalid_credential',
      reason: 'The service account private key is not a valid RSA PKCS#8 key',
    };
  }

  const result = await providerFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });

  if (!result.ok) {
    return { ok: false, code: result.code, reason: result.reason };
  }

  const body = (result.captured.body ?? {}) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (result.response.ok && body.access_token) {
    return { ok: true, accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
  }

  return {
    ok: false,
    code:
      result.response.status === 429
        ? 'rate_limited'
        : result.response.status >= 500
          ? 'provider_unavailable'
          : 'invalid_credential',
    reason: body.error_description ?? body.error ?? `token_endpoint_${result.response.status}`,
  };
}

export function buildFcmMessage(
  token: string,
  payload: ProviderSendInput['payload'],
  expiresAt: Date | null
) {
  const notification: Record<string, unknown> = {};
  if (payload.title !== undefined) notification.title = payload.title;
  if (payload.body !== undefined) notification.body = payload.body;
  if (payload.imageUrl !== undefined) notification.image = payload.imageUrl;

  const data = Object.fromEntries(
    Object.entries(payload.data ?? {}).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ])
  );

  const ttlSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : null;

  const android: Record<string, unknown> = {
    priority: payload.priority === 'normal' ? 'NORMAL' : 'HIGH',
    ...(payload.collapseId ? { collapse_key: payload.collapseId } : {}),
    ...(ttlSeconds !== null ? { ttl: `${ttlSeconds}s` } : {}),
    ...(payload.sound ? { notification: { sound: payload.sound } } : {}),
    ...(payload.fcm?.android ?? {}),
  };

  return {
    message: {
      token,
      ...(Object.keys(notification).length > 0 ? { notification } : {}),
      ...(Object.keys(data).length > 0 ? { data } : {}),
      android,
      ...(payload.fcm?.payload ?? {}),
    },
  };
}

async function validate({ secret, details }: ProviderValidationInput): Promise<ProviderValidationResult> {
  const token = await requestAccessToken({
    project_id: details.projectId ?? '',
    client_email: details.clientEmail ?? '',
    private_key: secret,
  });
  return token.ok ? { ok: true } : { ok: false, code: token.code, reason: token.reason };
}

async function send(input: ProviderSendInput): Promise<ProviderSendResult> {
  const startedAt = Date.now();
  const request = buildFcmMessage(input.endpoint, input.payload, input.expiresAt);

  let accessToken: string;
  try {
    accessToken = await cachedToken(
      tokenCacheKey(input),
      3600 - TOKEN_TTL_MARGIN_SECONDS,
      async () => {
        const token = await requestAccessToken({
          project_id: input.details.projectId ?? '',
          client_email: input.details.clientEmail ?? '',
          private_key: input.secret,
        });
        if (!token.ok) throw new TokenError(token.code, token.reason);
        return token.accessToken;
      },
      input.tokens
    );
  } catch (error) {
    const tokenError = error instanceof TokenError ? error : new TokenError('unknown', String(error));
    return {
      ok: false,
      code: tokenError.code,
      reason: `oauth: ${tokenError.message}`,
      request,
      response: null,
      latencyMs: Date.now() - startedAt,
    };
  }

  const result = await providerFetch(`${FCM_API}/${input.details.projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
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

  const body = (result.captured.body ?? {}) as {
    name?: string;
    error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
  };

  if (result.response.ok) {
    return {
      ok: true,
      providerMessageId: body.name ?? null,
      request,
      response: result.captured,
      latencyMs: result.latencyMs,
    };
  }

  if (result.response.status === 401) {
    await evictToken(tokenCacheKey(input), input.tokens);
  }

  const errorCode =
    body.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? body.error?.status ?? null;

  return {
    ok: false,
    code: classify(result.response.status, errorCode),
    reason: errorCode ?? body.error?.message ?? `fcm_status_${result.response.status}`,
    retryAfterSeconds: retryAfterSeconds(result.response),
    request,
    response: result.captured,
    latencyMs: result.latencyMs,
  };
}

class TokenError extends Error {
  constructor(
    public code: DeliveryErrorCode,
    message: string
  ) {
    super(message);
  }
}

export const fcmProvider: ProviderDefinition = {
  name: 'fcm',
  channel: 'push',
  displayName: 'Firebase',
  validate,
  send,
};
