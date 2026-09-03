import { describe, expect, it } from 'vitest';
import {
  BUSINESS,
  CADENCES,
  ENTERPRISE_FROM,
  estimate,
  FREE_LIMIT,
  PRO,
  readNumber,
} from '../../src/lib/estimate';

describe('estimate', () => {
  it('is free up to the free limit', () => {
    expect(estimate(0)).toEqual({ plan: 'Free', base: 0, extra: 0, extraDeliveries: 0 });
    expect(estimate(FREE_LIMIT)).toEqual({ plan: 'Free', base: 0, extra: 0, extraDeliveries: 0 });
  });

  it('picks Pro inside its included deliveries', () => {
    expect(estimate(FREE_LIMIT + 1)).toEqual({ plan: 'Pro', base: PRO.base, extra: 0, extraDeliveries: 0 });
    expect(estimate(650_000)).toEqual({ plan: 'Pro', base: 49, extra: 0, extraDeliveries: 0 });
  });

  it('charges Pro overage per thousand extra deliveries', () => {
    expect(estimate(1_400_000)).toEqual({ plan: 'Pro', base: 49, extra: 100, extraDeliveries: 400_000 });
  });

  it('switches to Business once it is the cheaper total', () => {
    const breakEven = PRO.included + ((BUSINESS.base - PRO.base) / PRO.overage) * 1000;
    expect(estimate(breakEven)?.plan).toBe('Pro');
    expect(estimate(breakEven + 1000)?.plan).toBe('Business');
    expect(estimate(BUSINESS.included)).toEqual({
      plan: 'Business',
      base: 299,
      extra: 0,
      extraDeliveries: 0,
    });
    expect(estimate(11_000_000)).toEqual({
      plan: 'Business',
      base: 299,
      extra: 100,
      extraDeliveries: 1_000_000,
    });
  });

  it('hands enterprise volume to sales', () => {
    expect(estimate(ENTERPRISE_FROM)).not.toBeNull();
    expect(estimate(ENTERPRISE_FROM + 1)).toBeNull();
  });
});

describe('readNumber', () => {
  it('keeps digits and dots, ignores separators, and falls back to zero', () => {
    expect(readNumber('50,000')).toBe(50_000);
    expect(readNumber('$12.5')).toBe(12.5);
    expect(readNumber('')).toBe(0);
    expect(readNumber('abc')).toBe(0);
    expect(readNumber('1.2.3')).toBe(0);
  });
});

describe('CADENCES', () => {
  it('converts a cadence to deliveries per month', () => {
    expect(CADENCES.map((cadence) => cadence.value)).toEqual(['day', 'week', 'month']);
    expect(CADENCES.find((cadence) => cadence.value === 'day')?.perMonth).toBe(30);
    expect(CADENCES.find((cadence) => cadence.value === 'week')?.perMonth).toBeCloseTo(4.333, 3);
    expect(CADENCES.find((cadence) => cadence.value === 'month')?.perMonth).toBe(1);
  });
});
