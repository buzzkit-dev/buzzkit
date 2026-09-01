import type { IconName } from '@buzzkit/ui/components/icon';

type Data = Record<string, unknown>;

type StreamDescription = { label: string; icon: IconName; detail: string | null };

type Definition = { label: string; icon: IconName; describe?: (data: Data) => Partial<StreamDescription> };

export type StreamSource = 'server' | 'ios' | 'android' | 'web' | 'system' | 'webhook';

export const SOURCE_LABELS: Record<StreamSource, string> = {
  server: 'Server',
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
  system: 'System',
  webhook: 'Webhook',
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

function attributeSummary(data: Data): string | null {
  return summarizeData(data.attributes);
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

const PERMISSION_DENIED = { icon: 'IconShieldCrossedFilled' } as const;
const PERMISSION_GRANTED = { icon: 'IconShieldCheckFilled' } as const;

const RESERVED: Record<string, Definition> = {
  '$app.installed': {
    label: 'App installed',
    icon: 'IconSquareArrowDownFilled',
    describe: (data) => ({ detail: text(data, 'version') }),
  },
  '$app.updated': {
    label: 'App updated',
    icon: 'IconArrowRotateClockwiseFilled',
    describe: (data) => ({
      detail:
        typeof data.fromVersion === 'string' && typeof data.toVersion === 'string'
          ? `${data.fromVersion} to ${data.toVersion}`
          : text(data, 'toVersion'),
    }),
  },
  '$app.opened': { label: 'App opened', icon: 'IconPhoneFilled' },
  '$app.backgrounded': { label: 'App backgrounded', icon: 'IconSleepFilled' },
  '$session.ended': {
    label: 'Session ended',
    icon: 'IconStopwatchFilled',
    describe: (data) => ({ detail: duration(data) }),
  },
  '$notification.delivered': { label: 'Notification delivered', icon: 'IconBellCheckFilled' },
  '$notification.opened': {
    label: 'Notification opened',
    icon: 'IconBellActiveFilled',
    describe: (data) => ({ detail: text(data, 'action') }),
  },
  '$notification.dismissed': {
    label: 'Notification dismissed',
    icon: 'IconBellOffFilled',
  },
  '$activity.started': {
    label: 'Live Activity started',
    icon: 'IconLiveFullFilled',
    describe: (data) => ({ detail: text(data, 'attributesType') }),
  },
  '$activity.ended': {
    label: 'Live Activity ended',
    icon: 'IconBell2SnoozeFilled',
    describe: (data) => ({ detail: text(data, 'attributesType') }),
  },
  '$activity.dismissed': {
    label: 'Live Activity dismissed',
    icon: 'IconBellOffFilled',
    describe: (data) => ({ detail: text(data, 'attributesType') }),
  },
  '$activity.stale': {
    label: 'Live Activity went stale',
    icon: 'IconBell2SnoozeFilled',
    describe: (data) => ({ detail: text(data, 'attributesType') }),
  },
  '$local.scheduled': {
    label: 'Local notification scheduled',
    icon: 'IconCalendarClockFilled',
    describe: (data) => ({ detail: text(data, 'localId') }),
  },
  '$deeplink.opened': {
    label: 'Deep link opened',
    icon: 'IconChainLink3Filled',
    describe: (data) => ({ detail: text(data, 'url') }),
  },
  '$action.triggered': {
    label: 'Action triggered',
    icon: 'IconCodeLargeFilled',
    describe: (data) => ({
      detail: data.handled === false ? `${data.name} (no handler)` : text(data, 'name'),
    }),
  },
  '$permission.changed': {
    label: 'Push permission changed',
    icon: 'IconShieldCheckFilled',
    describe: (data) => ({
      icon: data.status === 'denied' ? PERMISSION_DENIED.icon : PERMISSION_GRANTED.icon,
      detail: text(data, 'status'),
    }),
  },
  $identify: {
    label: 'Identified',
    icon: 'IconFingerPrint1Filled',
    describe: (data) => ({ detail: attributeSummary(data) }),
  },
  '$subscriber.created': {
    label: 'Subscriber created',
    icon: 'IconUserAddFilled',
    describe: (data) => ({ detail: attributeSummary(data) }),
  },
  '$subscriber.updated': {
    label: 'Attributes updated',
    icon: 'IconUserEditFilled',
    describe: (data) => ({ detail: attributeSummary(data) }),
  },
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
  '$run.started': {
    label: 'Workflow started',
    icon: 'IconPlayFilled',
    describe: (data) => ({ detail: text(data, 'workflow') }),
  },
  '$run.step': {
    label: 'Workflow step',
    icon: 'IconCircleDashedFilled',
    describe: (data) => ({
      label: `${text(data, 'workflow') ?? 'Workflow'} · ${text(data, 'step') ?? 'step'}`,
      detail: text(data, 'summary'),
    }),
  },
  '$run.completed': {
    label: 'Workflow completed',
    icon: 'IconCircleCheckFilled',
    describe: (data) => ({ detail: text(data, 'workflow') }),
  },
  '$run.canceled': {
    label: 'Workflow canceled',
    icon: 'IconCircleBanSignFilled',
    describe: (data) => ({
      detail: [text(data, 'workflow'), text(data, 'reason')].filter(Boolean).join(' · ') || null,
    }),
  },
  '$run.failed': {
    label: 'Workflow failed',
    icon: 'IconCircleXFilled',
    describe: (data) => ({
      detail: [text(data, 'workflow'), text(data, 'error')].filter(Boolean).join(' · ') || null,
    }),
  },
};

export function describeStreamEvent(event: { name: string; data: unknown }): StreamDescription {
  const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Data;
  const definition = RESERVED[event.name];
  if (!definition) return { label: event.name, icon: 'IconZapFilled', detail: null };
  return { label: definition.label, icon: definition.icon, detail: null, ...definition.describe?.(data) };
}

export function summarizeData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data as Data);
  if (entries.length === 0) return null;
  const plain = entries.filter(([key]) => !key.startsWith('$'));
  return (plain.length > 0 ? plain : entries)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}
