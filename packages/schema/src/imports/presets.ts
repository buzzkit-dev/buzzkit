import { normalizeHeader } from './csv';
import type { ImportPreset, ImportProvider } from './types';

export const IMPORT_PRESETS: Record<ImportProvider, ImportPreset> = {
  onesignal: {
    provider: 'onesignal',
    label: 'OneSignal',
    signature: ['identifier', 'device_type'],
    idPrefix: 'onesignal',
    mapping: {
      externalId: 'external_user_id',
      id: 'id',
      endpoint: 'identifier',
      target: {
        column: 'device_type',
        values: {
          '0': 'ios',
          '1': 'android',
          '5': 'web',
          '7': 'web',
          '8': 'web',
          '11': 'email',
          '14': 'sms',
        },
      },
      unsubscribed: { column: 'invalid_identifier' },
      timezone: 'timezone_id',
      language: 'language',
      country: 'country',
      lastSeenAt: 'last_active',
      appVersion: 'game_version',
      osVersion: 'device_os',
      model: 'device_model',
      attributes: { json: 'tags' },
    },
  },
  custom: {
    provider: 'custom',
    label: 'Custom',
    signature: [],
    idPrefix: 'import',
    mapping: { externalId: 'external_id', endpoint: 'token', target: { value: 'ios' } },
  },
};

export function detectPreset(headers: string[]): ImportProvider | null {
  const present = new Set(headers.map(normalizeHeader));
  const match = Object.values(IMPORT_PRESETS).find((preset) => {
    return preset.signature.length > 0 && preset.signature.every((column) => present.has(column));
  });
  return match?.provider ?? null;
}
