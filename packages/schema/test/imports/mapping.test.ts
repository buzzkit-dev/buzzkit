import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_CHANNELS,
  detectPreset,
  findImportTarget,
  IMPORT_PRESETS,
  IMPORT_TARGETS,
  type ImportOptions,
  mapImportRecord,
  parseCsv,
  planImport,
} from '../../src/imports/index';

const options: ImportOptions = {
  environment: 'production',
  anonymous: 'provider_id',
  unsubscribed: 'skip',
  idPrefix: 'onesignal',
  connectedChannels: ['push', 'email'],
};

const onesignalCsv = [
  'id,identifier,session_count,language,timezone,game_version,device_os,device_type,device_model,ad_id,tags,last_active,playtime,amount_spent,created_at,invalid_identifier,badge_count,external_user_id,country,timezone_id',
  `a1,${'a'.repeat(64)},12,en,-25200,3.2.0,17.4,0,"iPhone15,2",,"{""plan"":""pro"",""level"":4}",1756800000,0,0,1700000000,f,0,user_42,us,America/Los_Angeles`,
  `a2,fcm-token-${'b'.repeat(80)},3,de,3600,3.1.9,14,1,Pixel 8,,{},1756700000,0,0,1700000000,f,0,,de,Europe/Berlin`,
  `a3,${'c'.repeat(64)},1,en,0,3.2.0,17.0,0,iPhone,,"",1756600000,0,0,1700000000,t,0,user_43,,`,
  `a4,maya@acme.com,0,en,0,,,11,,,"",1756500000,0,0,1700000000,f,0,user_42,,`,
  `a5,web-token-${'d'.repeat(80)},1,en,0,,,5,,,"",1756400000,0,0,1700000000,f,0,user_44,,`,
  `a6,+4915112345678,1,en,0,,,14,,,"",1756300000,0,0,1700000000,f,0,user_45,,`,
  `a7,${'e'.repeat(64)},1,en,0,,,9,,,"",1756200000,0,0,1700000000,f,0,user_46,,`,
].join('\n');

describe('target catalog', () => {
  it('lists every channel once, marks the shipped ones available, and resolves by id', () => {
    const channels = new Set(IMPORT_TARGETS.map((target) => target.channel));
    expect([...channels]).toEqual(['push', 'email', 'sms', 'web']);
    expect(IMPORT_TARGETS.filter((target) => target.available).map((target) => target.id)).toEqual([
      'ios',
      'android',
      'email',
    ]);
    for (const target of IMPORT_TARGETS) {
      expect(target.available).toBe((AVAILABLE_CHANNELS as readonly string[]).includes(target.channel));
    }
    expect(findImportTarget('android')).toMatchObject({ channel: 'push', platform: 'android' });
    expect(findImportTarget('fax')).toBeNull();
  });
});

describe('detectPreset', () => {
  it('recognizes a OneSignal export from its signature columns, in any case', () => {
    expect(detectPreset(['Id', 'Identifier', 'Device_Type', 'tags'])).toBe('onesignal');
    expect(detectPreset(['external_id', 'token'])).toBeNull();
  });
});

describe('OneSignal preset', () => {
  const plan = planImport(parseCsv(onesignalCsv).records, IMPORT_PRESETS.onesignal.mapping, options);

  it('maps device types, tags, timezone, language, country, device and last activity', () => {
    expect(plan.rows[0]).toEqual({
      externalId: 'user_42',
      channel: 'push',
      platform: 'ios',
      environment: 'production',
      token: 'a'.repeat(64),
      attributes: { plan: 'pro', level: 4 },
      timezone: 'America/Los_Angeles',
      language: 'en',
      country: 'US',
      device: { appVersion: '3.2.0', osVersion: '17.4', model: 'iPhone15,2' },
      lastSeenAt: '2025-09-02T08:00:00.000Z',
    });
  });

  it('falls back to the provider id for anonymous rows, and never puts an Apple environment on Android', () => {
    expect(plan.rows[1]).toMatchObject({
      externalId: 'onesignal:a2',
      platform: 'android',
      timezone: 'Europe/Berlin',
    });
    expect(plan.rows[1]).not.toHaveProperty('environment');
    expect(plan.counts.anonymous).toBe(1);
  });

  it('maps email subscriptions and skips unsubscribed, not-yet-available and unknown device types', () => {
    expect(plan.rows[2]).toMatchObject({
      externalId: 'user_42',
      channel: 'email',
      address: 'maya@acme.com',
      attributes: { email: 'maya@acme.com' },
    });
    expect(plan.rows).toHaveLength(3);
    expect(plan.skipped).toEqual([
      { index: 2, reason: 'unsubscribed', detail: 'The provider marked this subscription as unsubscribed' },
      { index: 4, reason: 'unsupported_target', detail: 'Web push subscriptions cannot be imported yet' },
      { index: 5, reason: 'unsupported_target', detail: 'Phone numbers cannot be imported yet' },
      {
        index: 6,
        reason: 'unsupported_target',
        detail: 'Device type "9" is not a subscription BuzzKit knows',
      },
    ]);
    expect(plan.counts).toMatchObject({
      records: 7,
      rows: 3,
      muted: 0,
      profileEmails: 0,
      byTarget: { ios: 1, android: 1, email: 1, sms: 0, web: 0 },
      byChannel: { push: 2, email: 1, sms: 0, web: 0 },
      byReason: { unsubscribed: 1, unsupported_target: 3, no_external_id: 0 },
    });
  });

  it('keeps an email as profile data when the email channel is not connected', () => {
    const pushOnly = planImport(parseCsv(onesignalCsv).records, IMPORT_PRESETS.onesignal.mapping, {
      ...options,
      connectedChannels: ['push'],
    });
    expect(pushOnly.rows).toHaveLength(3);
    expect(pushOnly.rows[2]).toEqual({
      externalId: 'user_42',
      language: 'en',
      attributes: { email: 'maya@acme.com' },
    });
    expect(pushOnly.counts.profileEmails).toBe(1);
    expect(pushOnly.counts.byTarget.email).toBe(0);
    expect(pushOnly.counts.byReason.channel_not_connected).toBe(0);
  });

  it('imports unsubscribed rows as muted and skips anonymous rows when asked', () => {
    const strict = planImport(parseCsv(onesignalCsv).records, IMPORT_PRESETS.onesignal.mapping, {
      ...options,
      anonymous: 'skip',
      unsubscribed: 'muted',
      environment: 'sandbox',
    });
    expect(strict.rows.map((row) => row.externalId)).toEqual(['user_42', 'user_43', 'user_42']);
    expect(strict.rows[1]).toMatchObject({ enabled: false, environment: 'sandbox' });
    expect(strict.counts.muted).toBe(1);
    expect(strict.counts.byReason.no_external_id).toBe(1);
  });
});

describe('custom mapping', () => {
  it('reads a fixed target, picked attribute columns and a parsed time', () => {
    const mapped = mapImportRecord(
      { user: 'u1', device_token: 'x'.repeat(64), plan: 'pro', seen: '2026-01-02T03:04:05Z', $secret: 'no' },
      {
        externalId: 'user',
        endpoint: 'device_token',
        target: { value: 'android' },
        attributes: { columns: ['plan', '$secret'] },
        lastSeenAt: 'seen',
      },
      { ...options, idPrefix: 'import' }
    );
    expect(mapped).toEqual({
      outcome: 'row',
      anonymous: false,
      row: {
        externalId: 'u1',
        channel: 'push',
        platform: 'android',
        token: 'x'.repeat(64),
        attributes: { plan: 'pro' },
        lastSeenAt: '2026-01-02T03:04:05.000Z',
      },
    });
  });

  it('keeps a row without an endpoint column as a profile-only row and rejects bad endpoints', () => {
    expect(
      mapImportRecord({ user: 'u1' }, { externalId: 'user', target: { value: 'ios' } }, options)
    ).toEqual({
      outcome: 'row',
      anonymous: false,
      row: { externalId: 'u1' },
    });
    expect(
      mapImportRecord(
        { user: 'u1', token: 'short' },
        { externalId: 'user', endpoint: 'token', target: { value: 'ios' } },
        options
      )
    ).toMatchObject({ outcome: 'skipped', reason: 'invalid_endpoint' });
    expect(
      mapImportRecord(
        { user: 'u1', token: '' },
        { externalId: 'user', endpoint: 'token', target: { value: 'ios' } },
        options
      )
    ).toMatchObject({ outcome: 'skipped', reason: 'no_endpoint' });
    expect(
      mapImportRecord(
        { user: 'u1', mail: 'nope' },
        { externalId: 'user', endpoint: 'mail', target: { value: 'email' } },
        options
      )
    ).toMatchObject({ outcome: 'skipped', reason: 'invalid_endpoint' });
  });

  it('refuses a fixed target that is not available yet', () => {
    expect(
      mapImportRecord(
        { user: 'u1', phone: '+4915112345678' },
        { externalId: 'user', endpoint: 'phone', target: { value: 'sms' } },
        options
      )
    ).toEqual({
      outcome: 'skipped',
      reason: 'unsupported_target',
      detail: 'Phone numbers cannot be imported yet',
    });
  });
});
