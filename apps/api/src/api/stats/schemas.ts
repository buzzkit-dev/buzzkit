import { t } from 'elysia';
import { STATS_INTERVALS } from './constants';

export const StatsQuerySchema = t.Object({
  from: t.Optional(t.String({ format: 'date-time' })),
  to: t.Optional(t.String({ format: 'date-time' })),
  interval: t.Optional(t.Union(STATS_INTERVALS.map((interval) => t.Literal(interval)))),
});
