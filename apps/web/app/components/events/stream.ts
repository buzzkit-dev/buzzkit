import type { IconName } from '@buzzkit/ui/components/icon';

type Data = Record<string, unknown>;

export type StreamDescription = { label: string; icon: IconName; detail: string | null };

type Definition = { label: string; icon: IconName; describe?: (data: Data) => Partial<StreamDescription> };

export type StreamSource = 'server' | 'ios' | 'android' | 'web' | 'system';

export const SOURCE_LABELS: Record<StreamSource, string> = {
  server: 'Server',
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
  system: 'System',
};

function text(data: Data, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function subjectOf(data: Data): string {
  if (data.channel === 'email') return text(data, 'endpoint') ?? 'Email address';
  if (data.platform === 'ios') return 'iOS device';
  if (data.platform === 'android') return 'Android device';
  return 'Device';
}

function preferenceChanges(data: Data): string | null {
  const changes = data.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const parts: string[] = [];
  for (const [topic, value] of Object.entries(changes as Record<string, unknown>)) {
    if (typeof value === 'boolean') {
      parts.push(`${topic} ${value ? 'on' : 'off'}`);
      continue;
    }
    for (const [channel, enabled] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      parts.push(`${topic} ${channel} ${enabled ? 'on' : 'off'}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function duration(data: Data): string | null {
  const seconds = data.durationSec;
  if (typeof seconds !== 'number') return null;
  return seconds < 60 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)} min`;
}

const RESERVED: Record<string, Definition> = {
  '$app.opened': { label: 'App opened', icon: 'IconPhoneFilled' },
  '$app.backgrounded': { label: 'App backgrounded', icon: 'IconSleepFilled' },
  '$session.ended': {
    label: 'Session ended',
    icon: 'IconStopwatchFilled',
    describe: (data) => ({ detail: duration(data) }),
  },
  '$notification.delivered': { label: 'Notification delivered', icon: 'IconBellCheckFilled' },
  '$notification.opened': { label: 'Notification opened', icon: 'IconBellActiveFilled' },
  '$permission.changed': {
    label: 'Push permission changed',
    icon: 'IconShieldCheckFilled',
    describe: (data) => ({ detail: text(data, 'status') }),
  },
  $identify: { label: 'Identified', icon: 'IconFingerPrint1Filled' },
  '$subscriber.created': { label: 'Subscriber created', icon: 'IconUserAddFilled' },
  '$subscriber.updated': { label: 'Attributes updated', icon: 'IconUserEditFilled' },
  '$subscriber.deleted': { label: 'Subscriber deleted', icon: 'IconUserRemoveFilled' },
  '$subscription.registered': {
    label: 'Device registered',
    icon: 'IconPhoneFilled',
    describe: (data) =>
      data.channel === 'email'
        ? { label: 'Email address added', icon: 'IconEmail2Filled', detail: text(data, 'endpoint') }
        : { label: `${subjectOf(data)} registered` },
  },
  '$subscription.muted': {
    label: 'Device muted',
    icon: 'IconBellOffFilled',
    describe: (data) => ({ label: `${subjectOf(data)} muted` }),
  },
  '$subscription.unmuted': {
    label: 'Device unmuted',
    icon: 'IconBellFilled',
    describe: (data) => ({ label: `${subjectOf(data)} unmuted` }),
  },
  '$subscription.removed': {
    label: 'Device removed',
    icon: 'IconCircleXFilled',
    describe: (data) => ({ label: `${subjectOf(data)} removed` }),
  },
  '$subscription.invalidated': {
    label: 'Device stopped accepting pushes',
    icon: 'IconCircleBanSignFilled',
    describe: (data) => ({
      label: `${subjectOf(data)} stopped accepting pushes`,
      detail: text(data, 'reason'),
    }),
  },
  '$preferences.updated': {
    label: 'Preferences changed',
    icon: 'IconSettingsSliderHorFilled',
    describe: (data) => ({ detail: preferenceChanges(data) }),
  },
};

export function describeStreamEvent(event: { name: string; data: unknown }): StreamDescription {
  const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Data;
  const definition = RESERVED[event.name];
  if (!definition) return { label: event.name, icon: 'IconZapFilled', detail: null };
  return { label: definition.label, icon: definition.icon, detail: null, ...definition.describe?.(data) };
}

export function isReservedEvent(name: string): boolean {
  return name.startsWith('$');
}

export function summarizeData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data as Data);
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}
