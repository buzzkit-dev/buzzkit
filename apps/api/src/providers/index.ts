import { validateApnsCredential } from './apns/index';
import { requestFcmAccessToken } from './fcm/index';
import { validateResendKey } from './resend/index';

export type ProviderValidationResult =
  | { ok: true }
  | { ok: false; reason: string; structural: boolean; transportError: boolean };

export type ProviderValidationInput = {
  secret: string;
  details: Record<string, string>;
  environment: 'production' | 'sandbox';
};

export type ProviderDefinition = {
  channel: 'push' | 'email';
  displayName: string;
  validate(input: ProviderValidationInput): Promise<ProviderValidationResult>;
};

export const PROVIDERS = {
  apns: {
    channel: 'push',
    displayName: 'APNs',
    validate: async ({ secret, details, environment }) => {
      const result = await validateApnsCredential({
        p8: secret,
        teamId: details.teamId ?? '',
        keyId: details.keyId ?? '',
        bundleId: details.bundleId ?? '',
        environment,
      });
      return result.ok
        ? { ok: true }
        : {
            ok: false,
            reason: result.reason,
            structural: result.structural,
            transportError: result.transportError,
          };
    },
  },
  fcm: {
    channel: 'push',
    displayName: 'Firebase',
    validate: async ({ secret, details }) => {
      const result = await requestFcmAccessToken({
        project_id: details.projectId ?? '',
        client_email: details.clientEmail ?? '',
        private_key: secret,
      });
      return result.ok
        ? { ok: true }
        : { ok: false, reason: result.reason, structural: false, transportError: result.transportError };
    },
  },
  resend: {
    channel: 'email',
    displayName: 'Resend',
    validate: async ({ secret }) => {
      const result = await validateResendKey(secret);
      return result.ok
        ? { ok: true }
        : { ok: false, reason: result.reason, structural: false, transportError: result.transportError };
    },
  },
} as const satisfies Record<string, ProviderDefinition>;

export type ProviderName = keyof typeof PROVIDERS;
