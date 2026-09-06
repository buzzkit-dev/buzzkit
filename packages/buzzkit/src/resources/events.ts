import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { EVENT_VOLUME_RANGES, EventSource } from './common';
import { listPage } from './list';

export type EventVolumeRange = (typeof EVENT_VOLUME_RANGES)[number];

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

export type EventInput = {
  id?: string;
  externalId: string;
  name: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

export type EventName = {
  name: string;
  counts: { last24h: number; last7d: number; last30d: number; total: number };
  subscribers7d: number;
  sources: string[];
  providers: string[];
  lastAt: string;
  firstAt: string;
};

export type EventVolumeBucket = {
  at: string;
  count: number;
  subscribers: number;
};

export type EventVolume = {
  range: EventVolumeRange;
  bucketSeconds: number;
  from: string;
  to: string;
  buckets: EventVolumeBucket[];
};

export type EventNameDetail = EventName & {
  volume: EventVolume;
  samples: EventRecord[];
};

export type ListEventsParams = PageParams & {
  name?: string;
  source?: EventSource;
  provider?: string;
  after?: string;
  afterId?: string;
};

export function eventsResource(transport: Transport) {
  return {
    list(params: ListEventsParams = {}): PagePromise<EventRecord> {
      return listPage(transport, '/v1/events', params);
    },

    track(events: EventInput | EventInput[]): PagePromise<TrackedEvent> {
      const batch = Array.isArray(events) ? events : [events];

      return transport.requestPage(() => {
        return transport.request({ method: 'POST', path: '/v1/events', body: { events: batch } });
      }, {});
    },

    names(): PagePromise<EventName> {
      return listPage(transport, '/v1/events/names', {});
    },

    name(name: string, params: { range?: EventVolumeRange } = {}): Promise<EventNameDetail> {
      return transport.request({
        method: 'GET',
        path: `/v1/events/names/${encodeSegment(name)}`,
        query: params,
      });
    },

    volume(params: { range?: EventVolumeRange; name?: string } = {}): Promise<EventVolume> {
      return transport.request({ method: 'GET', path: '/v1/events/volume', query: params });
    },
  };
}

export type EventsResource = ReturnType<typeof eventsResource>;
