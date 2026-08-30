import { describe, expect, it } from 'vitest';
import { cronProblem, parseCron, scheduleFields } from '../../../src/workflows/index';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('parseCron', () => {
  it('parses fields, names, ranges, steps and lists', () => {
    expect(parseCron('0 10 * * MON')).toEqual({
      minutes: [0],
      hours: [10],
      days: range(1, 31),
      months: range(1, 12),
      weekdays: [1],
      anyDay: true,
      anyWeekday: false,
    });
    const fields = parseCron('*/15 9-17/4 1,15 jan-mar 7,SAT');
    expect(fields.minutes).toEqual([0, 15, 30, 45]);
    expect(fields.hours).toEqual([9, 13, 17]);
    expect(fields.days).toEqual([1, 15]);
    expect(fields.months).toEqual([1, 2, 3]);
    expect(fields.weekdays).toEqual([0, 6]);
    expect(fields.anyDay).toBe(false);
    expect(parseCron('5/10 * * * *').minutes).toEqual([5, 15, 25, 35, 45, 55]);
    expect(scheduleFields({ daily: '19:30' })).toEqual(parseCron('30 19 * * *'));
  });

  it('names problems', () => {
    expect(cronProblem('0 10 * * MON')).toBeNull();
    expect(cronProblem('0 10 * *')).toBe(
      'A cron expression has five fields (minute, hour, day of month, month, day of week), got 4.'
    );
    expect(cronProblem('60 * * * *')).toBe('The minute runs from 0 to 59, got 60.');
    expect(cronProblem('* * * * moon')).toBe('"moon" is not a day of week.');
    expect(cronProblem('5-1 * * * *')).toBe('A minute range runs upward, got "5-1".');
    expect(cronProblem('*/0 * * * *')).toBe('A step in the minute is a whole number from 1, got "0".');
    expect(cronProblem('1-2-3 * * * *')).toBe('"1-2-3" is not a minute range.');
    expect(cronProblem(5)).toBe('A cron expression is a string such as "0 10 * * MON".');
  });
});
