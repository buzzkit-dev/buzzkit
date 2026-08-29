import { wallTimeToInstant } from '@buzzkit/api/api/messages/schedule';
import { type Anchor, durationSeconds } from 'buzzkit/workflows';
import type { RunState } from './types';

const DAY_MS = 86_400_000;

export function resolveAnchor(
  anchor: Anchor,
  trigger: { timestamp: string },
  steps: RunState['steps']
): number {
  const base =
    anchor.after === 'trigger'
      ? Date.parse(trigger.timestamp)
      : Date.parse(steps[anchor.after.slice('steps.'.length)]?.at ?? trigger.timestamp);
  const target = base + (anchor.plus ? durationSeconds(anchor.plus) * 1000 : 0);
  if (!anchor.at || !anchor.timezone) return target;

  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: anchor.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(target));
  const moment = wallTimeToInstant(`${day}T${anchor.at}`, anchor.timezone).getTime();
  return moment < target ? moment + DAY_MS : moment;
}

export function describeInstant(instant: number, timezone?: string): string {
  const zone = timezone ?? 'UTC';
  const text = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone,
  }).format(new Date(instant));
  return `${text} ${zone.replace(/_/g, ' ')}`;
}
