import type { ProviderId } from '@/app/components/onboarding/catalog';
import type { CredentialUpload } from '@/app/lib/api.server';

export type UploadResult =
  | { ok: true; upload: CredentialUpload }
  | { ok: false; error: string; param?: string };

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

export function buildCredentialUpload(provider: ProviderId, form: FormData): UploadResult {
  switch (provider) {
    case 'apns': {
      const p8 = text(form, 'p8');
      const keyId = text(form, 'keyId').toUpperCase();
      const teamId = text(form, 'teamId').toUpperCase();
      const bundleId = text(form, 'bundleId');
      if (!p8.includes('-----BEGIN PRIVATE KEY-----')) {
        return { ok: false, error: 'Drop the .p8 key file Apple gave you.', param: 'p8' };
      }
      if (!/^[A-Z0-9]{10}$/.test(keyId)) {
        return { ok: false, error: 'A Key ID is exactly 10 letters and numbers.', param: 'keyId' };
      }
      if (!/^[A-Z0-9]{10}$/.test(teamId)) {
        return { ok: false, error: 'A Team ID is exactly 10 letters and numbers.', param: 'teamId' };
      }
      if (!bundleId) {
        return { ok: false, error: 'Enter the bundle ID of your app.', param: 'bundleId' };
      }
      return { ok: true, upload: { provider: 'apns', p8, keyId, teamId, bundleId } };
    }
    case 'fcm': {
      const serviceAccount = text(form, 'serviceAccount');
      if (!serviceAccount) {
        return {
          ok: false,
          error: 'Upload the service account JSON from Firebase.',
          param: 'serviceAccount',
        };
      }
      return { ok: true, upload: { provider: 'fcm', serviceAccount } };
    }
    case 'resend': {
      const apiKey = text(form, 'apiKey');
      if (!apiKey.startsWith('re_')) {
        return { ok: false, error: 'Resend keys start with re_.', param: 'apiKey' };
      }
      return { ok: true, upload: { provider: 'resend', apiKey } };
    }
  }
}
