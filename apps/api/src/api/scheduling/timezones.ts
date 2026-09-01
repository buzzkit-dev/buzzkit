import { localInstant, parseWallTime } from '@buzzkit/api/libs/timezone';
import { DEFAULT_TIMEZONE, isTimezone, SUBSCRIBER_TIMEZONE } from '@buzzkit/schema/workflows';
import type { Expression } from 'buzzkit/expressions';

export const EARLIEST_ZONE = 'Etc/GMT-14';

export const LATEST_ZONE = 'Etc/GMT+12';

export const WALL_CLOCK_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

let zones: string[] | null = null;

function wallParts(wall: string): [number, number, number, number, number] {
  const [datePart, timePart] = wall.split('T');
  const [year, month, day] = (datePart ?? '').split('-').map(Number);
  const { hour, minute } = parseWallTime(timePart ?? '');
  return [year ?? 0, month ?? 1, day ?? 1, hour, minute];
}

export function isWallClock(wall: string): boolean {
  if (!WALL_CLOCK_PATTERN.test(wall)) return false;
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
  return localInstant({ year, month, day, hour, minute }, timezone);
}

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

export function followsSubscriber(timezone: string): boolean {
  return timezone === SUBSCRIBER_TIMEZONE;
}

export function zonesFor(timezone: string): string[] {
  return followsSubscriber(timezone) ? listTimezones() : [timezone];
}

export function isKnownTimezone(timezone: string): boolean {
  return followsSubscriber(timezone) || isTimezone(timezone);
}

export function timezoneScoped(expression: Expression, allowedZones: string[], fallback: string): Expression {
  const inZones: Expression = { ref: 'attributes.$timezone', in: allowedZones };
  const unknownZone: Expression = { ref: 'attributes.$timezone', exists: false };
  return { all: [expression, allowedZones.includes(fallback) ? { any: [inZones, unknownZone] } : inZones] };
}
