import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { AliasSource, Attributes, Channel, Deleted, EventSource } from './common';
import type { Delivery } from './deliveries';
import type { EventRecord } from './events';
import { listPage } from './list';
import type { Run } from './runs';
import type { Subscription } from './subscriptions';
import type { SubscriberPreference } from './topics';

export type Subscriber = {
  id: string;
  externalId: string;
  attributes: Attributes;
  verified: boolean;
  identityVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriberWithSubscriptions = Subscriber & {
  subscriptions: Subscription[];
};

export type SubscriberListItem = Subscriber & {
  lastSeenAt: string | null;
  channels: string[];
  platforms: string[];
};

export type UpsertSubscriberParams = {
  attributes?: Attributes;
  email?: string;
  subscribe?: { email?: boolean };
  timezone?: string;
};

export type ListSubscribersParams = PageParams & {
  search?: string;
};

export type SubscriberTimelineParams = PageParams & {
  name?: string;
  source?: EventSource;
  provider?: string;
};

export type SubscriberDelivery = Delivery & {
  message: {
    id: string;
    channel: Channel;
    topic: string | null;
    title: string | null;
    body: string | null;
    createdAt: string;
  };
};

export type SubscriberAlias = {
  externalId: string;
  source: AliasSource;
  createdAt: string;
};

export type PreferenceChanges = Record<string, boolean | Partial<Record<Channel, boolean>>>;

export function subscribersResource(transport: Transport) {
  const base = (externalId: string) => `/v1/subscribers/${encodeSegment(externalId)}`;

  return {
    list(params: ListSubscribersParams = {}): PagePromise<SubscriberListItem> {
      return listPage(transport, '/v1/subscribers', params);
    },

    retrieve(externalId: string): Promise<SubscriberWithSubscriptions> {
      return transport.request({ method: 'GET', path: base(externalId) });
    },

    upsert(externalId: string, params: UpsertSubscriberParams = {}): Promise<Subscriber> {
      return transport.request({ method: 'PUT', path: base(externalId), body: params });
    },

    remove(externalId: string): Promise<Deleted<Subscriber>> {
      return transport.request({ method: 'DELETE', path: base(externalId) });
    },

    aliases(externalId: string): PagePromise<SubscriberAlias> {
      return listPage(transport, `${base(externalId)}/aliases`, {});
    },

    addAlias(externalId: string, alias: string): PagePromise<SubscriberAlias> {
      return transport.requestPage(() => {
        return transport.request({
          method: 'POST',
          path: `${base(externalId)}/aliases`,
          body: { externalId: alias },
        });
      }, {});
    },

    subscriptions(externalId: string): PagePromise<Subscription> {
      return listPage(transport, `${base(externalId)}/subscriptions`, {});
    },

    preferences(externalId: string): PagePromise<SubscriberPreference> {
      return listPage(transport, `${base(externalId)}/preferences`, {});
    },

    updatePreferences(externalId: string, preferences: PreferenceChanges): PagePromise<SubscriberPreference> {
      return transport.requestPage(() => {
        return transport.request({
          method: 'PATCH',
          path: `${base(externalId)}/preferences`,
          body: { preferences },
        });
      }, {});
    },

    deliveries(externalId: string, params: PageParams = {}): PagePromise<SubscriberDelivery> {
      return listPage(transport, `${base(externalId)}/deliveries`, params);
    },

    timeline(externalId: string, params: SubscriberTimelineParams = {}): PagePromise<EventRecord> {
      return listPage(transport, `${base(externalId)}/timeline`, params);
    },

    runs(externalId: string): PagePromise<Run> {
      return listPage(transport, `${base(externalId)}/runs`, {});
    },
  };
}

export type SubscribersResource = ReturnType<typeof subscribersResource>;
