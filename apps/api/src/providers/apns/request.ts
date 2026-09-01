import type { ProviderEnvironment } from '../types';

export const HOSTS: Record<ProviderEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

export function buildHeaders(params: {
  jwt: string;
  bundleId: string;
  priority: number;
  pushType?: 'alert' | 'background' | 'liveactivity';
  collapseId?: string;
  expiresAt: Date | null;
}): Record<string, string> {
  return {
    authorization: `bearer ${params.jwt}`,
    'apns-topic':
      params.pushType === 'liveactivity' ? `${params.bundleId}.push-type.liveactivity` : params.bundleId,
    'apns-push-type': params.pushType ?? 'alert',
    'apns-priority': String(params.priority),
    'apns-expiration': String(params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : 0),
    'content-type': 'application/json',
    ...(params.collapseId ? { 'apns-collapse-id': params.collapseId } : {}),
  };
}
