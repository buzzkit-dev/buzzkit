import type { Topic, TopicCategory, TopicRecord } from './types';

export function serializeTopic(topic: Topic) {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    category: topic.category ?? null,
    dailyCap: topic.dailyCap,
    channels: topic.channels,
    defaultOptedIn: topic.defaultOptedIn,
    channelDefaults: topic.channelDefaults,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

export function serializeTopicCategory(category: TopicCategory & { topicCount?: number }) {
  return {
    id: category.id,
    name: category.name,
    ...(category.topicCount !== undefined ? { topicCount: category.topicCount } : {}),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export function withCategory(record: TopicRecord, category: string | null): Topic {
  return { ...record, category };
}
