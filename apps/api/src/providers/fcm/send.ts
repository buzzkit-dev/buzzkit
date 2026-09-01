import { cachedToken, evictToken } from '../shared/cache';
import { providerFetch, retryAfterSeconds } from '../shared/http';
import type { ProviderSendInput, ProviderSendResult } from '../types';
import { classify } from './classify';
import { buildFcmMessage } from './payload';
import { requestAccessToken, TOKEN_TTL_MARGIN_SECONDS, TokenError, tokenCacheKey } from './tokens';

export async function send(input: ProviderSendInput): Promise<ProviderSendResult> {
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

  const result = await providerFetch(
    `${'https://fcm.googleapis.com/v1/projects'}/${input.details.projectId}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }
  );

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
