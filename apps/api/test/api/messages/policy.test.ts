import {
  policyExempt,
  quietDeferSeconds,
  shiftOutOfQuietHours,
  withinQuietHours,
} from '@buzzkit/api/api/messages/policy';
import { describe, expect, it } from 'vitest';

const overnight = { from: '22:00', to: '08:00' };
const daytime = { from: '13:00', to: '15:00' };

describe('quiet hours', () => {
  it('detects overnight windows across midnight', () => {
    expect(withinQuietHours(new Date('2026-09-01T23:30:00Z'), overnight, 'UTC')).toBe(true);
    expect(withinQuietHours(new Date('2026-09-01T03:00:00Z'), overnight, 'UTC')).toBe(true);
    expect(withinQuietHours(new Date('2026-09-01T08:00:00Z'), overnight, 'UTC')).toBe(false);
    expect(withinQuietHours(new Date('2026-09-01T12:00:00Z'), overnight, 'UTC')).toBe(false);
  });

  it('detects same-day windows and respects the timezone', () => {
    expect(withinQuietHours(new Date('2026-09-01T13:30:00Z'), daytime, 'UTC')).toBe(true);
    expect(withinQuietHours(new Date('2026-09-01T12:30:00Z'), daytime, 'Europe/Berlin')).toBe(true);
    expect(withinQuietHours(new Date('2026-09-01T13:30:00Z'), daytime, 'Europe/Berlin')).toBe(false);
  });

  it('defers to the end of the window, never past it', () => {
    const lateEvening = quietDeferSeconds(new Date('2026-09-01T23:00:00Z'), overnight, 'UTC');
    expect(lateEvening).toBe(9 * 3600);
    const earlyMorning = quietDeferSeconds(new Date('2026-09-01T06:00:00Z'), overnight, 'UTC');
    expect(earlyMorning).toBe(2 * 3600);
    expect(quietDeferSeconds(new Date('2026-09-01T12:00:00Z'), overnight, 'UTC')).toBeNull();
  });

  it('shifts instants out of the window for local scheduling', () => {
    const shifted = shiftOutOfQuietHours(new Date('2026-09-01T23:00:00Z'), overnight, 'UTC');
    expect(shifted.toISOString()).toBe('2026-09-02T08:00:00.000Z');
    const untouched = shiftOutOfQuietHours(new Date('2026-09-01T12:00:00Z'), overnight, 'UTC');
    expect(untouched.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });
});

describe('policy exemptions', () => {
  it('exempts silent pushes, local carriers, and explicit ignores', () => {
    expect(policyExempt({ silent: true })).toBe(true);
    expect(policyExempt({ deliver: 'local' })).toBe(true);
    expect(policyExempt({ policy: 'ignore', title: 'x' })).toBe(true);
    expect(policyExempt({ title: 'x' })).toBe(false);
  });
});
