export const CHANNELS = ['push', 'email'] as const;

export const PLATFORMS = ['ios', 'android'] as const;

export const ENVIRONMENTS = ['production', 'sandbox'] as const;

export const PROVIDERS = ['apns', 'fcm', 'resend'] as const;

export const MEMBER_ROLES = ['member', 'admin', 'owner'] as const;

export const EVENT_SOURCES = ['server', 'ios', 'android', 'web', 'system'] as const;

export const EVENT_FILTER_SOURCES = [...EVENT_SOURCES, 'webhook'] as const;

export const ACTOR_TYPES = ['member', 'user', 'key', 'system'] as const;

export const CREDENTIAL_STATUSES = ['unvalidated', 'active', 'invalid'] as const;

export const SUBSCRIPTION_STATUSES = ['active', 'invalid'] as const;

export const MESSAGE_STATUSES = ['queued', 'processing', 'completed', 'scheduled', 'canceled'] as const;

export const DELIVERY_STATUSES = [
  'pending',
  'retrying',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'invalid',
] as const;

export const DELIVERY_ATTEMPT_OUTCOMES = ['sent', 'retry', 'failed', 'invalid'] as const;

export const WORKFLOW_STATUSES = ['draft', 'active', 'paused'] as const;

export const RUN_STATUSES = ['running', 'sleeping', 'waiting', 'completed', 'canceled', 'failed'] as const;

export const SOURCE_DELIVERY_OUTCOMES = ['event', 'duplicate', 'dropped', 'rejected', 'unverified'] as const;

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'success', 'failed', 'exhausted'] as const;

export const WEBHOOK_EVENT_SOURCES = ['audit', 'stream'] as const;

export const ALIAS_SOURCES = ['system', 'manual'] as const;

export const KEY_KINDS = ['workspace', 'tenant', 'client'] as const;

export const LIVE_ACTIVITY_EVENTS = ['start', 'update', 'end'] as const;

export const STATS_INTERVALS = ['hour', 'day', 'week', 'month'] as const;

export const EVENT_VOLUME_RANGES = ['24h', '7d', '30d'] as const;

export type AliasSource = (typeof ALIAS_SOURCES)[number];

export type KeyKind = (typeof KEY_KINDS)[number];

export type Channel = (typeof CHANNELS)[number];

export type Platform = (typeof PLATFORMS)[number];

export type Environment = (typeof ENVIRONMENTS)[number];

export type Provider = (typeof PROVIDERS)[number];

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type EventSource = (typeof EVENT_FILTER_SOURCES)[number];

export type ActorType = (typeof ACTOR_TYPES)[number];

export type Attributes = Record<string, unknown>;

export type Metadata = Record<string, unknown>;

export type Deleted<T> = T & { deleted: true };
