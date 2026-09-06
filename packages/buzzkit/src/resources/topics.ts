import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Channel, Deleted } from './common';
import { listPage } from './list';

export type ChannelDefaults = Partial<Record<Channel, boolean>>;

export type Topic = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  dailyCap: number | null;
  channels: Channel[];
  defaultOptedIn: boolean;
  channelDefaults: ChannelDefaults;
  createdAt: string;
  updatedAt: string;
};

export type TopicCategory = {
  id: string;
  name: string;
  topicCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type ChannelPreference = {
  optedIn: boolean;
  isDefault: boolean;
};

export type SubscriberPreference = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  channels: Partial<Record<Channel, ChannelPreference>>;
};

export type CreateTopicParams = {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  dailyCap?: number;
  channels?: Channel[];
  defaultOptedIn?: boolean;
  channelDefaults?: ChannelDefaults;
};

export type UpdateTopicParams = {
  slug?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  dailyCap?: number | null;
  channels?: Channel[];
  defaultOptedIn?: boolean;
  channelDefaults?: ChannelDefaults;
};

export function topicsResource(transport: Transport) {
  return {
    list(params: PageParams = {}): PagePromise<Topic> {
      return listPage(transport, '/v1/topics', params);
    },

    create(params: CreateTopicParams): Promise<Topic> {
      return transport.request({ method: 'POST', path: '/v1/topics', body: params });
    },

    retrieve(slug: string): Promise<Topic> {
      return transport.request({ method: 'GET', path: `/v1/topics/${encodeSegment(slug)}` });
    },

    update(slug: string, params: UpdateTopicParams): Promise<Topic> {
      return transport.request({ method: 'PATCH', path: `/v1/topics/${encodeSegment(slug)}`, body: params });
    },

    remove(slug: string): Promise<Deleted<Topic>> {
      return transport.request({ method: 'DELETE', path: `/v1/topics/${encodeSegment(slug)}` });
    },
  };
}

export function topicCategoriesResource(transport: Transport) {
  return {
    list(): PagePromise<TopicCategory> {
      return listPage(transport, '/v1/topic-categories', {});
    },

    update(id: string, params: { name: string }): Promise<TopicCategory> {
      return transport.request({
        method: 'PATCH',
        path: `/v1/topic-categories/${encodeSegment(id)}`,
        body: params,
      });
    },

    remove(id: string): Promise<Deleted<TopicCategory>> {
      return transport.request({ method: 'DELETE', path: `/v1/topic-categories/${encodeSegment(id)}` });
    },
  };
}

export type TopicsResource = ReturnType<typeof topicsResource>;

export type TopicCategoriesResource = ReturnType<typeof topicCategoriesResource>;
