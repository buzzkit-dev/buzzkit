import type { Static } from 'elysia';
import type { SDK_EVENTS, SYSTEM_EVENTS } from './catalog';
import type { CLIENT_SOURCES, EVENT_SOURCES } from './constants';

export type EventSource = (typeof EVENT_SOURCES)[number];

export type ClientSource = (typeof CLIENT_SOURCES)[number];

export type EventVolumeRange = '24h' | '7d' | '30d';

export type SystemEventName = keyof typeof SYSTEM_EVENTS;

export type SdkEventName = keyof typeof SDK_EVENTS;

export type SystemEvent = {
  [Name in SystemEventName]: { name: Name; data: Static<(typeof SYSTEM_EVENTS)[Name]>; timestamp?: string };
}[SystemEventName];

export type EventInput = {
  id?: string;
  externalId: string;
  name: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

export type TrackedEvent = {
  id: string;
  sequence: number;
  externalId: string;
  name: string;
  source: EventSource;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
  status: 'accepted' | 'duplicate';
};

export type EventRecord = {
  id: string;
  sequence: number;
  name: string;
  source: string;
  externalId: string | null;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
  runId: string | null;
  messageId: string | null;
  step: string | null;
};

export type EventPage = { items: EventRecord[]; hasMore: boolean; nextCursor: string | null };

export type EventCursor = { receivedAt: string; id?: string };

export type EventRow = {
  id: string;
  sequence: number;
  name: string;
  source: string;
  external_id?: string;
  timestamp: string;
  received_at: string;
  data: string;
  run_id: string | null;
  message_id: string | null;
  step: string | null;
};

export type EventNameRow = {
  name: string;
  count_24h: number;
  count_7d: number;
  count_30d: number;
  count_total: number;
  subscribers_7d: number;
  sources: string[];
  last_at: string;
  first_at: string;
};
