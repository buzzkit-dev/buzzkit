const API_URL = 'https://api.resend.com';

export type ResendValidationResult = { ok: true } | { ok: false; reason: string; transportError: boolean };

export async function validateResendKey(apiKey: string): Promise<ResendValidationResult> {
  try {
    const response = await fetch(`${API_URL}/domains`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) {
      return { ok: true };
    }

    const body = (await response.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      reason: body.message ?? `resend_status_${response.status}`,
      transportError: false,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      transportError: true,
    };
  }
}
