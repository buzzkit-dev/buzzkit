import { defineProject, type InferRow, Tinybird } from '@tinybirdco/sdk';
import { eventNamesHourly } from './datasources/event-names-hourly';
import { events } from './datasources/events';
import { eventsBySubscriber } from './datasources/events-by-subscriber';
import { runsCurrent } from './datasources/runs-current';
import { subscriberActivity } from './datasources/subscriber-activity';
import { subscriberAttributes } from './datasources/subscriber-attributes';
import { subscriptionState } from './datasources/subscription-state';
import { eventCatalog } from './endpoints/event-catalog';
import { eventRate } from './endpoints/event-rate';
import { eventRecent } from './endpoints/event-recent';
import { eventTop } from './endpoints/event-top';
import { eventTopAll } from './endpoints/event-top-all';
import { eventTopTenants } from './endpoints/event-top-tenants';
import { eventVolume } from './endpoints/event-volume';
import { eventVolumeAll } from './endpoints/event-volume-all';
import { runCounts } from './endpoints/run-counts';
import { runLatest } from './endpoints/run-latest';
import { runRate } from './endpoints/run-rate';
import { runSteps } from './endpoints/run-steps';
import { runVolume } from './endpoints/run-volume';
import { runVolumeAll } from './endpoints/run-volume-all';
import { runs } from './endpoints/runs';
import { subscriberTimeline } from './endpoints/subscriber-timeline';
import { eventNamesHourlyMv } from './materializations/event-names-hourly';
import { eventsBySubscriberMv } from './materializations/events-by-subscriber';
import { runsCurrentMv } from './materializations/runs-current';
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
  runsCurrent,
};

export const pipes = {
  eventsBySubscriberMv,
  eventNamesHourlyMv,
  subscriberAttributesMv,
  subscriptionStateMv,
  subscriberActivityMv,
  runsCurrentMv,
  eventCatalog,
  eventVolume,
  eventVolumeAll,
  eventRate,
  eventRecent,
  eventTop,
  eventTopAll,
  eventTopTenants,
  subscriberTimeline,
  runs,
  runCounts,
  runLatest,
  runSteps,
  runVolume,
  runVolumeAll,
  runRate,
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
