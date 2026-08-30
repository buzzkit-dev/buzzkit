import { describe, expect, it } from 'vitest';
import { describeDuration, durationSeconds, isDuration } from '../../../src/workflows/index';

describe('durations', () => {
  it('parses, measures and describes', () => {
    expect(isDuration('2h')).toBe(true);
    expect(isDuration('2 h')).toBe(false);
    expect(isDuration(2)).toBe(false);
    expect(durationSeconds('15m')).toBe(900);
    expect(durationSeconds('2h')).toBe(7200);
    expect(durationSeconds('3d')).toBe(259_200);
    expect(describeDuration('1h')).toBe('1 hour');
    expect(describeDuration('3d')).toBe('3 days');
  });
});
