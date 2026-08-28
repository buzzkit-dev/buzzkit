import {
  assertNoSystemAttributes,
  resolveSubscriptionEventData,
  resolveSystemAttributes,
} from '@buzzkit/api/api/subscribers/index';
import { describe, expect, it } from 'vitest';

function request(headers: Record<string, string> = {}, cf?: Record<string, string>) {
  const value = new Request('https://api.test/v1/client/identify', { headers });
  return cf ? Object.assign(value, { cf }) : value;
}

describe('resolveSystemAttributes', () => {
  it('prefers the edge metadata and takes the primary Accept-Language tag', () => {
    expect(
      resolveSystemAttributes(
        request(
          { 'cf-ipcountry': 'US', 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' },
          { country: 'DE', city: 'Berlin', region: 'Berlin', timezone: 'Europe/Berlin' }
        )
      )
    ).toEqual({
      $country: 'DE',
      $city: 'Berlin',
      $region: 'Berlin',
      $timezone: 'Europe/Berlin',
      $language: 'de-DE',
    });
  });

  it('falls back to the cf-ipcountry header when the edge object is missing', () => {
    expect(resolveSystemAttributes(request({ 'cf-ipcountry': 'FR' }))).toEqual({ $country: 'FR' });
  });

  it("ignores Cloudflare's unknown and Tor markers and a wildcard language", () => {
    expect(resolveSystemAttributes(request({ 'cf-ipcountry': 'XX', 'accept-language': '*' }))).toEqual({});
    expect(resolveSystemAttributes(request({ 'cf-ipcountry': 'T1' }))).toEqual({});
  });

  it('returns nothing when the request carries nothing', () => {
    expect(resolveSystemAttributes(request())).toEqual({});
  });

  it('only ever produces $-prefixed keys', () => {
    const keys = Object.keys(
      resolveSystemAttributes(
        request(
          { 'accept-language': 'ja' },
          { country: 'JP', city: 'Tokyo', region: 'Tokyo', timezone: 'Asia/Tokyo' }
        )
      )
    );
    expect(keys.every((key) => key.startsWith('$'))).toBe(true);
  });
});

describe('assertNoSystemAttributes', () => {
  it('accepts nothing, an empty object and custom keys', () => {
    expect(() => assertNoSystemAttributes(undefined)).not.toThrow();
    expect(() => assertNoSystemAttributes({})).not.toThrow();
    expect(() => assertNoSystemAttributes({ plan: 'pro', dollar$inside: true })).not.toThrow();
  });

  it('refuses any $-prefixed key with the system_attribute code on attributes', () => {
    for (const key of ['$country', '$language', '$anything']) {
      expect(() => assertNoSystemAttributes({ plan: 'pro', [key]: 'x' })).toThrow(
        expect.objectContaining({ code: 'system_attribute', param: 'attributes' })
      );
    }
  });
});

describe('resolveSubscriptionEventData', () => {
  const subscription = {
    id: 1,
    channel: 'push' as const,
    platform: 'ios' as const,
    endpoint: 'a1b2c3',
    token: 'secret-device-token',
    enabled: true,
  };

  it('carries only the channel, platform, endpoint and enabled state, never the rest of the row', () => {
    expect(resolveSubscriptionEventData(subscription)).toEqual({
      channel: 'push',
      platform: 'ios',
      endpoint: 'a1b2c3',
      enabled: true,
    });
  });

  it('adds the external id when the caller knows it', () => {
    expect(resolveSubscriptionEventData(subscription, 'user_1')).toEqual({
      externalId: 'user_1',
      channel: 'push',
      platform: 'ios',
      endpoint: 'a1b2c3',
      enabled: true,
    });
  });
});
