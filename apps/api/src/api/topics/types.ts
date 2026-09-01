import type { tables } from '@buzzkit/database';
import type { CHANNELS } from './constants';

export type TopicRecord = typeof tables.topic.$inferSelect;

export type Topic = TopicRecord & { category: string | null };

export type TopicCategory = typeof tables.topicCategory.$inferSelect;

export type Channel = (typeof CHANNELS)[number];

export type ChannelPreference = {
  optedIn: boolean;
  isDefault: boolean;
};

export type SubscriberPreference = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  channels: Partial<Record<Channel, ChannelPreference>>;
};

export type PreferenceChanges = Record<string, boolean | Partial<Record<string, boolean>>>;
