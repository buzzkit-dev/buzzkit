import { fcmProvider } from '@buzzkit/api/providers/fcm/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateServiceAccount } from '../../utils/providerKeys';

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('validate', () => {
  it('accepts a service account whose key mints a token', async () => {
    const raw = await generateServiceAccount('my-project-123');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3599 }), { status: 200 })
    );

    const result = await fcmProvider.validate({
      secret: raw.private_key,
      details: { projectId: raw.project_id, clientEmail: raw.client_email },
      environment: 'production',
    });

    expect(result).toEqual({ ok: true });
  });

  it('surfaces the token failure', async () => {
    const raw = await generateServiceAccount('my-project-123');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad key' }), { status: 400 })
    );

    const result = await fcmProvider.validate({
      secret: raw.private_key,
      details: { projectId: raw.project_id, clientEmail: raw.client_email },
      environment: 'production',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_credential');
      expect(result.reason).toBe('bad key');
    }
  });
});
