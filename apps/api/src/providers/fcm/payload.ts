import type { ProviderSendInput } from '../types';

function resolveFcmEnvelope(payload: ProviderSendInput['payload']): Record<string, unknown> | undefined {
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
      ? { actions: payload.actions, ...(payload.category ? { category: payload.category } : {}) }
      : {}),
  };
  return Object.keys(envelope).length > 0 ? envelope : undefined;
}

export function buildFcmMessage(
  token: string,
  payload: ProviderSendInput['payload'],
  expiresAt: Date | null
) {
  const silent = payload.silent === true || payload.deliver === 'local';
  const notification: Record<string, unknown> = {};
  if (!silent) {
    if (payload.title !== undefined) notification.title = payload.title;
    if (payload.body !== undefined) notification.body = payload.body;
    if (payload.imageUrl !== undefined) notification.image = payload.imageUrl;
  }

  const envelope = resolveFcmEnvelope(payload);
  const data = {
    ...Object.fromEntries(
      Object.entries(payload.data ?? {}).map(([key, value]) => {
        return [key, typeof value === 'string' ? value : JSON.stringify(value)];
      })
    ),
    ...(envelope !== undefined ? { bk: JSON.stringify(envelope) } : {}),
  };

  const ttlSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : null;

  const android: Record<string, unknown> = {
    priority: payload.priority === 'normal' ? 'NORMAL' : 'HIGH',
    ...(payload.collapseId ? { collapse_key: payload.collapseId } : {}),
    ...(ttlSeconds !== null ? { ttl: `${ttlSeconds}s` } : {}),
    ...(payload.sound ? { notification: { sound: payload.sound } } : {}),
    ...(payload.fcm?.android ?? {}),
  };

  return {
    message: {
      token,
      ...(Object.keys(notification).length > 0 ? { notification } : {}),
      ...(Object.keys(data).length > 0 ? { data } : {}),
      android,
      ...(payload.fcm?.payload ?? {}),
    },
  };
}
