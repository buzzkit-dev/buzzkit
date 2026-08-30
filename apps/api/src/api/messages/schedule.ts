import {
  EARLIEST_ZONE,
  followsSubscriber,
  isKnownTimezone,
  isWallClock,
  LATEST_ZONE,
  listTimezones,
  wallTimeToInstant,
} from '@buzzkit/api/api/scheduling/index';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { DEFAULT_TIMEZONE, isTimezone, SUBSCRIBER_TIMEZONE } from '@buzzkit/schema/workflows';
import type { MessageSchedule } from './types';

export function scheduleFollowsSubscriber(schedule: MessageSchedule): boolean {
  return followsSubscriber(schedule.timezone);
}

export function firstInstant(schedule: MessageSchedule): Date {
  return wallTimeToInstant(
    schedule.at,
    scheduleFollowsSubscriber(schedule) ? EARLIEST_ZONE : schedule.timezone
  );
}

export function lastInstant(schedule: MessageSchedule): Date {
  return wallTimeToInstant(
    schedule.at,
    scheduleFollowsSubscriber(schedule) ? LATEST_ZONE : schedule.timezone
  );
}

export function dueZones(schedule: MessageSchedule, now: Date, done: string[]): string[] {
  return listTimezones().filter(
    (zone) => !done.includes(zone) && wallTimeToInstant(schedule.at, zone).getTime() <= now.getTime()
  );
}

export function resolveSchedule(
  input: { at: string; timezone?: string; defaultTimezone?: string },
  now: Date
): MessageSchedule {
  if (!isWallClock(input.at)) {
    throw new BadRequestError('`schedule.at` must be a wall-clock time like 2026-09-01T10:00', {
      code: 'invalid_schedule',
      param: 'schedule.at',
    });
  }
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  if (!isKnownTimezone(timezone)) {
    throw new BadRequestError(`Unknown timezone '${timezone}'`, {
      code: 'invalid_schedule',
      param: 'schedule.timezone',
    });
  }
  if (input.defaultTimezone !== undefined) {
    if (timezone !== SUBSCRIBER_TIMEZONE) {
      throw new BadRequestError(
        '`schedule.defaultTimezone` only applies when `schedule.timezone` is "subscriber"',
        { code: 'invalid_schedule', param: 'schedule.defaultTimezone' }
      );
    }
    if (!isTimezone(input.defaultTimezone)) {
      throw new BadRequestError(`Unknown timezone '${input.defaultTimezone}'`, {
        code: 'invalid_schedule',
        param: 'schedule.defaultTimezone',
      });
    }
  }
  const schedule: MessageSchedule = {
    at: input.at,
    timezone,
    ...(timezone === SUBSCRIBER_TIMEZONE
      ? { defaultTimezone: input.defaultTimezone ?? DEFAULT_TIMEZONE }
      : {}),
  };
  if (lastInstant(schedule).getTime() <= now.getTime()) {
    throw new BadRequestError('`schedule.at` is already in the past', {
      code: 'schedule_in_past',
      param: 'schedule.at',
    });
  }
  return schedule;
}

export function fallbackTimezone(schedule: MessageSchedule): string {
  return schedule.defaultTimezone ?? DEFAULT_TIMEZONE;
}
