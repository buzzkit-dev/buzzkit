import { BadRequestError } from '@buzzkit/api/libs/error';
import type { Expression } from 'buzzkit/expressions';
import { DEFAULT_TIMEZONE, SUBSCRIBER_TIMEZONE, WALL_TIME_PATTERN } from './constants';
import type { MessageSchedule } from './types';

export type LocalTime = { year: number; month: number; day: number; hour: number; minute: number };

const FIRST_ZONE = 'Etc/GMT-14';

const LAST_ZONE = 'Etc/GMT+12';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timezone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timezone, cached);
  }
  return cached;
}

export function isTimezone(value: string): boolean {
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

export function localTime(date: Date, timezone: string): LocalTime {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function wallParts(wall: string): [number, number, number, number, number] {
  const [datePart, timePart] = wall.split('T');
  const [year, month, day] = (datePart ?? '').split('-').map(Number);
  const [hour, minute] = (timePart ?? '').split(':').map(Number);
  return [year ?? 0, month ?? 1, day ?? 1, hour ?? 0, minute ?? 0];
}

function isCalendarTime(wall: string): boolean {
  const [year, month, day, hour, minute] = wallParts(wall);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

export function wallTimeToInstant(wall: string, timezone: string): Date {
  const [year, month, day, hour, minute] = wallParts(wall);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let round = 0; round < 3; round += 1) {
    const local = localTime(new Date(guess), timezone);
    const drift = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - target;
    if (drift === 0) break;
    guess -= drift;
  }
  return new Date(guess);
}

let zones: string[] | null = null;

export function listTimezones(): string[] {
  if (!zones) {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    zones = supported && supported.length > 0 ? [...supported] : [DEFAULT_TIMEZONE];
    if (!zones.includes(DEFAULT_TIMEZONE)) zones.push(DEFAULT_TIMEZONE);
  }
  return zones;
}

export function followsSubscriber(schedule: MessageSchedule): boolean {
  return schedule.timezone === SUBSCRIBER_TIMEZONE;
}

export function firstInstant(schedule: MessageSchedule): Date {
  return wallTimeToInstant(schedule.at, followsSubscriber(schedule) ? FIRST_ZONE : schedule.timezone);
}

export function lastInstant(schedule: MessageSchedule): Date {
  return wallTimeToInstant(schedule.at, followsSubscriber(schedule) ? LAST_ZONE : schedule.timezone);
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
  if (!WALL_TIME_PATTERN.test(input.at) || !isCalendarTime(input.at)) {
    throw new BadRequestError('`schedule.at` must be a wall-clock time like 2026-09-01T10:00', {
      code: 'invalid_schedule',
      param: 'schedule.at',
    });
  }
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  if (timezone !== SUBSCRIBER_TIMEZONE && !isTimezone(timezone)) {
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

export function timezoneScoped(expression: Expression, zones: string[], fallback: string): Expression {
  const inZones: Expression = { ref: 'attributes.$timezone', in: zones };
  const unknownZone: Expression = { ref: 'attributes.$timezone', exists: false };
  return { all: [expression, zones.includes(fallback) ? { any: [inZones, unknownZone] } : inZones] };
}
