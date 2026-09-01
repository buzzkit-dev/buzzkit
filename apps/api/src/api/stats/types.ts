import type { STATS_INTERVALS } from './constants';

export type StatsRange = { from: Date; to: Date };

export type StatsInterval = (typeof STATS_INTERVALS)[number];

export type DeliveryTotals = {
  total: number;
  sent: number;
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
};
