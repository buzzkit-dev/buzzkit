import { defineProject, type InferRow, Tinybird } from '@tinybirdco/sdk';
import { eventNamesHourly } from './datasources/event-names-hourly';
import { events } from './datasources/events';
import { eventsBySubscriber } from './datasources/events-by-subscriber';
import { subscriberActivity } from './datasources/subscriber-activity';
import { subscriberAttributes } from './datasources/subscriber-attributes';
import { subscriptionState } from './datasources/subscription-state';
import { eventCatalog } from './endpoints/event-catalog';
import { eventRecent } from './endpoints/event-recent';
import { eventVolume } from './endpoints/event-volume';
import { subscriberTimeline } from './endpoints/subscriber-timeline';
import { eventNamesHourlyMv } from './materializations/event-names-hourly';
import { eventsBySubscriberMv } from './materializations/events-by-subscriber';
import { subscriberActivityMv } from './materializations/subscriber-activity';
import { subscriberAttributesMv } from './materializations/subscriber-attributes';
import { subscriptionStateMv } from './materializations/subscription-state';

export const datasources = {
  events,
  eventsBySubscriber,
  eventNamesHourly,
  subscriberAttributes,
  subscriptionState,
  subscriberActivity,
};

export const pipes = {
  eventsBySubscriberMv,
  eventNamesHourlyMv,
  subscriberAttributesMv,
  subscriptionStateMv,
  subscriberActivityMv,
  eventCatalog,
  eventVolume,
  eventRecent,
  subscriberTimeline,
};

export default defineProject({ datasources, pipes });

export type EventRow = InferRow<typeof events>;

export function createTinybird(config: { baseUrl: string; token: string }) {
  return new Tinybird({ datasources, pipes, baseUrl: config.baseUrl, token: config.token, devMode: false });
}

export type TinybirdClient = ReturnType<typeof createTinybird>;

export const DASHBOARD_ENDPOINTS = [
  'event_catalog',
  'event_volume',
  'event_recent',
  'subscriber_timeline',
] as const;
