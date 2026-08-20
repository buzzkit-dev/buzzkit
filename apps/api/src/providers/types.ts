import type { channel, credentialEnvironment, credentialProvider } from '@buzzkit/database';

export type ProviderChannel = (typeof channel.enumValues)[number];
export type ProviderEnvironment = (typeof credentialEnvironment.enumValues)[number];
export type ProviderName = (typeof credentialProvider.enumValues)[number];

export type DeliveryErrorCode =
  | 'invalid_endpoint'
  | 'invalid_credential'
  | 'payload_invalid'
  | 'payload_too_large'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'transport'
  | 'timeout'
  | 'expired'
  | 'no_credential'
  | 'unsupported'
  | 'unknown';

export type ProviderValidationResult = { ok: true } | { ok: false; code: DeliveryErrorCode; reason: string };

export type ProviderValidationInput = {
  secret: string;
  details: Record<string, string>;
  environment: ProviderEnvironment;
};

export type MessagePayload = {
  title?: string;
  body?: string;
  subtitle?: string;
  badge?: number;
  sound?: string;
  imageUrl?: string;
  data?: Record<string, unknown>;
  collapseId?: string;
  priority?: 'high' | 'normal';
  apns?: { environment?: ProviderEnvironment; payload?: Record<string, unknown> };
  fcm?: { android?: Record<string, unknown>; payload?: Record<string, unknown> };
};

export type ProviderSendInput = {
  credentialId: number;
  keyVersion: number;
  secret: string;
  details: Record<string, string>;
  environment: ProviderEnvironment;
  endpoint: string;
  payload: MessagePayload;
  expiresAt: Date | null;
};

export type ProviderResponse = {
  status: number | null;
  body: unknown;
};

export type ProviderSendResult = {
  request: unknown;
  response: ProviderResponse | null;
  latencyMs: number;
} & (
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: DeliveryErrorCode; reason: string; retryAfterSeconds?: number }
);

export type ProviderDefinition = {
  name: ProviderName;
  channel: ProviderChannel;
  displayName: string;
  validate(input: ProviderValidationInput): Promise<ProviderValidationResult>;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
};
