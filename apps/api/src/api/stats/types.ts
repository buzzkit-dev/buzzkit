import type { STATS_INTERVALS } from './constants';

export type StatsRange = { from: Date; to: Date };

export type StatsInterval = (typeof STATS_INTERVALS)[number];

export type DeliveryTotals = {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  capped: number;
  invalid: number;
  pending: number;
};

export type StatsDay = {
  date: string;
  subscribers: number;
  messages: number;
  sent: number;
  delivered: number;
  failed: number;
  capped: number;
  invalid: number;
  pending: number;
  events: number;
  runsStarted: number;
  runsCompleted: number;
  runsFailed: number;
};

export type RunTotals = {
  started: number;
  live: number;
  completed: number;
  canceled: number;
  failed: number;
};

export type StatsWindow = {
  subscribers: { added: number };
  messages: { total: number };
  deliveries: DeliveryTotals;
  events: { total: number };
  runs: RunTotals;
};

export type StatsWorkflow = {
  slug: string;
  name: string;
  running: number;
  sleeping: number;
  waiting: number;
  lastRunAt: string | null;
};

export type StatsWorkspace = { slug: string; name: string; messages: number; delivered: number };

export type StatsEventWorkspace = { slug: string; name: string; events: number };

export type StatsGrowthWorkspace = { slug: string; name: string; subscribers: number; added: number };

export type StatsNewWorkspace = {
  slug: string;
  name: string;
  createdAt: string;
  subscribers: number;
  members: number;
};

export type StatsPlatform = {
  topWorkspaces: StatsWorkspace[];
  eventWorkspaces: StatsEventWorkspace[];
  growingWorkspaces: StatsGrowthWorkspace[];
  newestWorkspaces: StatsNewWorkspace[];
};

export type StatsRate = { perMinute: number; series: Array<{ minute: string; count: number }> };

export type StatsRates = {
  window: { from: string; to: string; sampleMinutes: number };
  deliveries: StatsRate;
  messages: StatsRate;
  events: StatsRate;
  runs: StatsRate;
};

export type Stats = {
  range: { from: string; to: string };
  interval: StatsInterval;
  subscribers: { total: number; added: number };
  messages: { total: number };
  deliveries: DeliveryTotals;
  events: { total: number };
  runs: RunTotals;
  topEvents: Array<{ name: string; count: number }>;
  workflows: StatsWorkflow[];
  scheduled: { count: number; nextAt: string | null };
  previous: StatsWindow;
  series: StatsDay[];
  platform?: StatsPlatform;
};
