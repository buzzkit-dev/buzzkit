import { describe, expect, it } from 'vitest';
import { isTimezone } from '../../../src/workflows/index';

describe('isTimezone', () => {
  it('knows IANA names', () => {
    expect(isTimezone('Europe/Berlin')).toBe(true);
    expect(isTimezone('UTC')).toBe(true);
    expect(isTimezone('subscriber')).toBe(false);
    expect(isTimezone('')).toBe(false);
    expect(isTimezone(null)).toBe(false);
  });
});
