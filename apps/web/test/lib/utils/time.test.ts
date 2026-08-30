import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeAgo } from '@/app/lib/utils/time';

describe('timeAgo', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-01T12:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  it('reads the past compactly', () => {
    expect(timeAgo('2026-09-01T11:59:30Z')).toBe('Now');
    expect(timeAgo('2026-09-01T11:13:00Z')).toBe('47m');
    expect(timeAgo('2026-09-01T04:00:00Z')).toBe('8h');
    expect(timeAgo('2026-08-30T12:00:00Z')).toBe('2d');
    expect(timeAgo('2026-08-11T12:00:00Z')).toBe('3w');
    expect(timeAgo('2026-06-01T12:00:00Z')).toBe('Jun 1');
  });

  it('reads the future with "in", never as now', () => {
    expect(timeAgo('2026-09-01T12:00:30Z')).toBe('Now');
    expect(timeAgo('2026-09-01T12:07:00Z')).toBe('in 7m');
    expect(timeAgo('2026-09-01T15:00:00Z')).toBe('in 3h');
    expect(timeAgo('2026-09-04T12:00:00Z')).toBe('in 3d');
    expect(timeAgo('2026-09-15T12:00:00Z')).toBe('in 2w');
  });

  it('is empty for junk', () => {
    expect(timeAgo('soon')).toBe('');
  });
});
