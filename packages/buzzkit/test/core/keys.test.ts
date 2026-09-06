import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../src/core/errors';
import { assertClientKey, assertServerKey } from '../../src/core/keys';

describe('assertServerKey', () => {
  it('accepts workspace and tenant keys', () => {
    expect(() => assertServerKey('bk_ws_live_abc')).not.toThrow();
    expect(() => assertServerKey('bk_tn_live_abc')).not.toThrow();
  });

  it('refuses a client key and points at the right entry', () => {
    expect(() => assertServerKey('bk_pk_live_abc')).toThrow(ConfigurationError);
    expect(() => assertServerKey('bk_pk_live_abc')).toThrow(/buzzkit\/client/);
  });

  it('leaves an unrecognized key to the API to reject', () => {
    expect(() => assertServerKey('session-token')).not.toThrow();
  });
});

describe('assertClientKey', () => {
  it('accepts a client key', () => {
    expect(() => assertClientKey('bk_pk_live_abc')).not.toThrow();
  });

  it('refuses the two secret key kinds', () => {
    for (const key of ['bk_ws_live_abc', 'bk_tn_live_abc']) {
      expect(() => assertClientKey(key), key).toThrow(ConfigurationError);
      expect(() => assertClientKey(key), key).toThrow(/never reach a browser/);
    }
  });

  it('leaves an unrecognized key to the API to reject', () => {
    expect(() => assertClientKey('session-token')).not.toThrow();
  });
});
