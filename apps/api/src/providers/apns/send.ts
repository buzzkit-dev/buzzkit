import { describeError } from '@buzzkit/api/libs/error';
import { cachedToken, evictToken } from '../shared/cache';
import { providerFetch, retryAfterSeconds } from '../shared/http';
import type { ProviderSendInput, ProviderSendResult } from '../types';
import { classify } from './classify';
import { buildApnsPayload, isSilentPayload, resolvePushType } from './payload';
import { buildHeaders, HOSTS } from './request';
import { createApnsJwt, JWT_TTL_SECONDS, jwtCacheKey } from './tokens';

export async function send(input: ProviderSendInput): Promise<ProviderSendResult> {
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
      () => {
        return createApnsJwt({
          p8: input.secret,
          teamId: input.details.teamId ?? '',
          keyId: input.details.keyId ?? '',
        });
      },
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
      priority: isSilentPayload(input.payload) || input.payload.priority === 'normal' ? 5 : 10,
      pushType: resolvePushType(input.payload),
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
