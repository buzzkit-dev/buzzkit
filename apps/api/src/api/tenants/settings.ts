import { BadRequestError } from '@buzzkit/api/libs/error';
import { isTimezone } from '@buzzkit/schema/workflows';
import type { SendPolicyPatch, TenantSettings, TenantSettingsPatch } from './types';

type SettingType = 'boolean';

const SETTINGS_CATALOG: Record<string, Record<string, SettingType>> = {
  identity: { requireVerification: 'boolean' },
  'channels.push': { enabled: 'boolean' },
  'channels.email': { enabled: 'boolean' },
};

const QUIET_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertSendPolicyPatch(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError('settings.sendPolicy must be an object');
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === 'dailyCap') {
      if (
        entry !== null &&
        (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 1 || entry > 50)
      ) {
        throw new BadRequestError(
          'settings.sendPolicy.dailyCap must be a whole number from 1 to 50, or null'
        );
      }
    } else if (key === 'quietHours') {
      if (entry === null) continue;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new BadRequestError('settings.sendPolicy.quietHours must be { from, to, timezone? } or null');
      }
      const quiet = entry as Record<string, unknown>;
      for (const bound of ['from', 'to'] as const) {
        if (typeof quiet[bound] !== 'string' || !QUIET_TIME_PATTERN.test(quiet[bound] as string)) {
          throw new BadRequestError(`settings.sendPolicy.quietHours.${bound} must be a time such as "22:00"`);
        }
      }
      if (quiet.from === quiet.to) {
        throw new BadRequestError('settings.sendPolicy.quietHours.from and .to cannot be the same time');
      }
      if (quiet.timezone !== undefined && quiet.timezone !== 'subscriber' && !isTimezone(quiet.timezone)) {
        throw new BadRequestError(
          'settings.sendPolicy.quietHours.timezone must be "subscriber" or an IANA timezone'
        );
      }
      const extras = Object.keys(quiet).filter((k) => !['from', 'to', 'timezone'].includes(k));
      if (extras.length > 0) {
        throw new BadRequestError(`Unknown setting 'settings.sendPolicy.quietHours.${extras[0]}'`);
      }
    } else {
      throw new BadRequestError(`Unknown setting 'settings.sendPolicy.${key}'`);
    }
  }
}

function assertSettingValue(path: string, key: string, expected: SettingType, entry: unknown): void {
  if (expected === 'boolean' && typeof entry !== 'boolean') {
    throw new BadRequestError(`settings.${path}.${key} must be a boolean`);
  }
}

export function assertValidTenantSettings(patch: unknown): asserts patch is TenantSettingsPatch {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new BadRequestError('settings must be an object');
  }

  const groups = new Map<string, unknown>();
  for (const [group, value] of Object.entries(patch)) {
    if (group === 'sendPolicy') {
      assertSendPolicyPatch(value);
      continue;
    }
    if (group === 'channels') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestError('settings.channels must be an object');
      }
      for (const [channel, channelValue] of Object.entries(value)) {
        groups.set(`channels.${channel}`, channelValue);
      }
    } else {
      groups.set(group, value);
    }
  }

  for (const [path, value] of groups) {
    const catalog = SETTINGS_CATALOG[path];
    if (!catalog) {
      throw new BadRequestError(`Unknown setting group 'settings.${path}'`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestError(`settings.${path} must be an object`);
    }
    for (const [key, entry] of Object.entries(value)) {
      const expected = catalog[key];
      if (!expected) {
        throw new BadRequestError(`Unknown setting 'settings.${path}.${key}'`);
      }
      assertSettingValue(path, key, expected, entry);
    }
  }
}

export function resolveTenantSettings(raw: unknown): TenantSettings {
  const stored = (raw ?? {}) as {
    identity?: TenantSettingsPatch['identity'];
    channels?: TenantSettingsPatch['channels'];
    sendPolicy?: SendPolicyPatch;
  };
  const quiet = stored.sendPolicy?.quietHours ?? null;

  return {
    identity: { requireVerification: false, ...stored.identity },
    channels: {
      push: { enabled: true, ...stored.channels?.push },
      email: { enabled: true, ...stored.channels?.email },
    },
    sendPolicy: {
      quietHours: quiet ? { from: quiet.from, to: quiet.to, timezone: quiet.timezone ?? 'subscriber' } : null,
      dailyCap: stored.sendPolicy?.dailyCap ?? null,
    },
  };
}

export function mergeTenantSettings(current: unknown, patch: TenantSettingsPatch): unknown {
  const stored = (current ?? {}) as {
    identity?: TenantSettingsPatch['identity'];
    channels?: TenantSettingsPatch['channels'];
    sendPolicy?: SendPolicyPatch;
  };

  return {
    ...stored,
    ...(patch.identity ? { identity: { ...stored.identity, ...patch.identity } } : {}),
    ...(patch.sendPolicy ? { sendPolicy: { ...stored.sendPolicy, ...patch.sendPolicy } } : {}),
    ...(patch.channels
      ? {
          channels: {
            ...stored.channels,
            ...(patch.channels.push ? { push: { ...stored.channels?.push, ...patch.channels.push } } : {}),
            ...(patch.channels.email
              ? { email: { ...stored.channels?.email, ...patch.channels.email } }
              : {}),
          },
        }
      : {}),
  };
}
