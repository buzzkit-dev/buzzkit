import type { Expression } from 'buzzkit/expressions';
import type { DELIVERY_OUTCOMES, DROP_REASONS, SOURCE_PROVIDERS, SOURCE_STATUSES } from './constants';

export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

export type DropReason = (typeof DROP_REASONS)[number];

export type SubscriberRule = string | { path: string; attribute: string };

export type SourceMapping = {
  type: string;
  id?: string;
  timestamp?: string;
  subscriber: SubscriberRule;
  events: Record<string, string | true>;
  data?: Record<string, string>;
  where?: Expression;
};

export type MappedEvent = {
  name: string;
  providerType: string;
  providerEventId: string | null;
  subscriber: { externalId: string } | { attribute: string; value: string };
  data: Record<string, unknown>;
  timestamp: string | null;
};

export type MappingOutcome =
  | { outcome: 'event'; event: MappedEvent }
  | { outcome: 'dropped'; reason: DropReason; detail: string };

export type Verification =
  | { scheme: 'stripe'; header?: string }
  | { scheme: 'standard-webhooks'; headers: { id: string; timestamp: string; signature: string } }
  | { scheme: 'header'; header: string };

export type VerificationScheme = Verification['scheme'];

export type SourcePreset = {
  provider: SourceProvider;
  label: string;
  domain?: string;
  verification: Verification;
  mapping: SourceMapping;
  events: Record<string, string>;
};

export type Suggestion = { path: string; value: unknown; why: string };

export type MappingSuggestions = {
  provider: SourceProvider | null;
  type: Suggestion[];
  id: Suggestion[];
  timestamp: Suggestion[];
  subscriber: Suggestion[];
  data: Suggestion[];
};
