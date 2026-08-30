import { nextLocalTime } from '@buzzkit/api/libs/timezone';
import { durationSeconds, type Moment, SUBSCRIBER_TIMEZONE } from '@buzzkit/schema/workflows';

export type ResolvedMoment = { at: number; timezone: string | null };

export function resolveMoment(
  moment: Moment,
  trigger: { timestamp: string },
  subscriberTimezone: string
): ResolvedMoment {
  const target = Date.parse(trigger.timestamp) + (moment.delay ? durationSeconds(moment.delay) * 1000 : 0);
  const timezone = moment.timezone === SUBSCRIBER_TIMEZONE ? subscriberTimezone : (moment.timezone ?? null);
  if (!moment.time || !timezone) return { at: target, timezone };
  const [hour, minute] = moment.time.split(':').map(Number) as [number, number];
  return { at: nextLocalTime(new Date(target), hour, minute, timezone).getTime(), timezone };
}

export function describeInstant(instant: number, timezone: string | null = null): string {
  const zone = timezone ?? 'UTC';
  const text = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone,
  }).format(new Date(instant));
  return `${text} ${zone.replace(/_/g, ' ')}`;
}
