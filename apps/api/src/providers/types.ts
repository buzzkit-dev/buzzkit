import type { channel, environment, provider } from '@buzzkit/database';
import type { TokenMemo } from './shared/cache';

export type ProviderChannel = (typeof channel.enumValues)[number];
export type ProviderEnvironment = (typeof environment.enumValues)[number];
export type ProviderName = (typeof provider.enumValues)[number];

export type DeliveryErrorCode =
  | 'capped'
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
  | 'unsubscribed'
  | 'unsupported'
  | 'unknown';

export type ProviderValidationResult = { ok: true } | { ok: false; code: DeliveryErrorCode; reason: string };

export type ProviderValidationInput = {
  secret: string;
  details: Record<string, string>;
  environment: ProviderEnvironment;
};

export type MessageAction = {
  id: string;
  title: string;
  destructive?: boolean;
  foreground?: boolean;
  input?: boolean;
  placeholder?: string;
};

export type LiveActivityPayload = {
  event: 'start' | 'update' | 'end';
  contentState: Record<string, unknown>;
  attributesType?: string;
  attributes?: Record<string, unknown>;
  alert?: { title?: string; body?: string; sound?: string };
  staleDate?: string;
  dismissalDate?: string;
  timestamp?: number;
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
  deliver?: 'push' | 'local';
  local?: { id: string; at: string; cancelOn?: string[] };
  silent?: boolean;
  deepLink?: string;
  action?: { name: string; data?: Record<string, unknown> };
  policy?: 'ignore';
  threadId?: string;
  category?: string;
  interruptionLevel?: 'passive' | 'active' | 'timeSensitive' | 'critical';
  relevanceScore?: number;
  targetContentId?: string;
  actions?: MessageAction[];
  liveActivity?: LiveActivityPayload;
  bk?: Record<string, unknown>;
  apns?: { payload?: Record<string, unknown> };
  fcm?: { android?: Record<string, unknown>; payload?: Record<string, unknown> };
};

export type ProviderSendInput = {
  credentialId: number;
  credentialUpdatedAt: number;
  secret: string;
  details: Record<string, string>;
  environment: ProviderEnvironment;
  endpoint: string;
  payload: MessagePayload;
  expiresAt: Date | null;
  tokens?: TokenMemo;
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
