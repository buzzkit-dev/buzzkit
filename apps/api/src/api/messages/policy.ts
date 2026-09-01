import type { QuietHours, SendPolicy } from '@buzzkit/api/api/tenants/index';
import { localMidnight, localTime, parseWallTime } from '@buzzkit/api/libs/timezone';
import type { MessagePayload } from '@buzzkit/api/providers/index';

function minutesOf(wall: string): number {
  const { hour, minute } = parseWallTime(wall);
  return hour * 60 + minute;
}

export function policyExempt(payload: MessagePayload): boolean {
  return payload.policy === 'ignore' || payload.silent === true || payload.deliver === 'local';
}

export function withinQuietHours(
  now: Date,
  quiet: Pick<QuietHours, 'from' | 'to'>,
  timezone: string
): boolean {
  const local = localTime(now, timezone);
  const minutes = local.hour * 60 + local.minute;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from < to) return minutes >= from && minutes < to;

  return minutes >= from || minutes < to;
}

export function quietDeferSeconds(
  now: Date,
  quiet: Pick<QuietHours, 'from' | 'to'>,
  timezone: string
): number | null {
  if (!withinQuietHours(now, quiet, timezone)) return null;
  const local = localTime(now, timezone);
  const minutes = local.hour * 60 + local.minute;
  const to = minutesOf(quiet.to);
  const untilMinutes = to > minutes ? to - minutes : 24 * 60 - minutes + to;

  return untilMinutes * 60 - now.getSeconds();
}

export function shiftOutOfQuietHours(
  instant: Date,
  quiet: Pick<QuietHours, 'from' | 'to'>,
  timezone: string
): Date {
  const defer = quietDeferSeconds(instant, quiet, timezone);
  return defer === null ? instant : new Date(instant.getTime() + defer * 1000);
}

export function policyTimezone(quiet: QuietHours, subscriberTimezone: string | null): string | null {
  if (quiet.timezone !== 'subscriber') return quiet.timezone;
  return subscriberTimezone;
}

export function capDayStart(now: Date, timezone: string): Date {
  return localMidnight(now, timezone);
}

export function resolveSubscriberTimezone(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object') return null;
  const zone = (attributes as Record<string, unknown>).$timezone;
  return typeof zone === 'string' && zone.length > 0 ? zone : null;
}

export type ResolvedSendPolicy = SendPolicy;
