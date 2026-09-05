import type { ProviderSendInput } from '../types';

const INTERRUPTION_LEVELS = {
  passive: 'passive',
  active: 'active',
  timeSensitive: 'time-sensitive',
  critical: 'critical',
} as const;

export function isSilentPayload(payload: ProviderSendInput['payload']): boolean {
  return payload.silent === true || payload.deliver === 'local';
}

export function resolvePushType(
  payload: ProviderSendInput['payload']
): 'alert' | 'background' | 'liveactivity' {
  if (payload.liveActivity) return 'liveactivity';
  return isSilentPayload(payload) ? 'background' : 'alert';
}

export function resolveCategoryId(payload: ProviderSendInput['payload']): string | undefined {
  if (payload.category) return payload.category;
  if (!payload.actions || payload.actions.length === 0) return undefined;

  const fingerprint = payload.actions
    .map((action) => [action.id, action.title, action.destructive, action.foreground, action.input].join('|'))
    .join(';');
  let hash = 5381;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash = ((hash << 5) + hash + fingerprint.charCodeAt(index)) >>> 0;
  }

  return `bk.${hash.toString(16)}`;
}

function epochSeconds(iso: string): number | undefined {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
}

export function buildLiveActivityPayload(payload: ProviderSendInput['payload']): Record<string, unknown> {
  const activity = payload.liveActivity;
  if (!activity) return {};

  const stale = activity.staleDate ? epochSeconds(activity.staleDate) : undefined;
  const dismissal = activity.dismissalDate ? epochSeconds(activity.dismissalDate) : undefined;

  return {
    aps: {
      timestamp: activity.timestamp ?? Math.floor(Date.now() / 1000),
      event: activity.event,
      'content-state': activity.contentState,
      ...(activity.event === 'start' && activity.attributesType
        ? { 'attributes-type': activity.attributesType, attributes: activity.attributes ?? {} }
        : {}),
      ...(activity.alert
        ? {
            alert: {
              ...(activity.alert.title !== undefined ? { title: activity.alert.title } : {}),
              ...(activity.alert.body !== undefined ? { body: activity.alert.body } : {}),
            },
            ...(activity.alert.sound !== undefined ? { sound: activity.alert.sound } : {}),
          }
        : {}),
      ...(stale !== undefined ? { 'stale-date': stale } : {}),
      ...(dismissal !== undefined ? { 'dismissal-date': dismissal } : {}),
    },
  };
}

export function buildApnsPayload(payload: ProviderSendInput['payload']): Record<string, unknown> {
  if (payload.liveActivity) {
    return buildLiveActivityPayload(payload);
  }
  if (isSilentPayload(payload)) {
    return {
      aps: { 'content-available': 1 },
      ...(resolveEnvelope(payload) !== undefined ? { bk: resolveEnvelope(payload) } : {}),
      ...(payload.apns?.payload ?? {}),
    };
  }

  const alert: Record<string, unknown> = {};
  if (payload.title !== undefined) alert.title = payload.title;
  if (payload.subtitle !== undefined) alert.subtitle = payload.subtitle;
  if (payload.body !== undefined) alert.body = payload.body;

  const aps: Record<string, unknown> = {};
  if (Object.keys(alert).length > 0) aps.alert = alert;
  if (payload.badge !== undefined) aps.badge = payload.badge;
  if (payload.sound !== undefined) aps.sound = payload.sound;
  if (payload.threadId !== undefined) aps['thread-id'] = payload.threadId;
  if (payload.interruptionLevel !== undefined) {
    aps['interruption-level'] = INTERRUPTION_LEVELS[payload.interruptionLevel];
  }
  if (payload.relevanceScore !== undefined) aps['relevance-score'] = payload.relevanceScore;
  if (payload.targetContentId !== undefined) aps['target-content-id'] = payload.targetContentId;
  const category = resolveCategoryId(payload);
  if (category !== undefined) aps.category = category;
  if (aps.alert !== undefined) aps['mutable-content'] = 1;

  return {
    aps,
    ...(payload.data ?? {}),
    ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
    ...(resolveEnvelope(payload) !== undefined ? { bk: resolveEnvelope(payload) } : {}),
    ...(payload.apns?.payload ?? {}),
  };
}

export function resolveEnvelope(payload: ProviderSendInput['payload']): Record<string, unknown> | undefined {
  const local =
    payload.deliver === 'local' && payload.local
      ? {
          ...payload.local,
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.body !== undefined ? { body: payload.body } : {}),
          ...(payload.data !== undefined ? { data: payload.data } : {}),
        }
      : undefined;
  const envelope = {
    ...(payload.bk ?? {}),
    ...(payload.deepLink !== undefined ? { deepLink: payload.deepLink } : {}),
    ...(payload.action !== undefined ? { action: payload.action } : {}),
    ...(local ? { local } : {}),
    ...((payload.actions?.length ?? 0) > 0
      ? { actions: payload.actions, category: resolveCategoryId(payload) }
      : {}),
  };
  return Object.keys(envelope).length > 0 ? envelope : undefined;
}
