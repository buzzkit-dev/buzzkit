import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it } from 'vitest';
import { describeSchedule, describeStep, describeTrigger } from '@/app/components/workflows/describe';

describe('describeStep', () => {
  it('reads every step kind as a sentence', () => {
    expect(describeStep({ name: 'a', wait: '2h' })).toBe('Wait 2 hours');
    expect(describeStep({ name: 'a', waitUntil: { time: '10:00', timezone: 'subscriber' } })).toBe(
      "Wait until 10:00 in the subscriber's timezone"
    );
    expect(
      describeStep({
        name: 'a',
        waitFor: { event: '$app.backgrounded', settleFor: '5m', resetOn: ['$app.opened'], timeout: '1d' },
      })
    ).toBe('Wait for $app.backgrounded, then 5 minutes of quiet (restarted by $app.opened) for up to 1 day');
    expect(
      describeStep({
        name: 'a',
        branch: [
          { name: 'x', when: { ref: 'vars.n', gte: 1 }, steps: [] },
          { name: 'y', steps: [] },
        ],
      })
    ).toBe('Cases: x · y');
    expect(
      describeStep({ name: 'a', branch: [{ name: 'x', when: { ref: 'vars.n', gte: 1 }, steps: [] }] })
    ).toBe('Cases: x · else');
    expect(describeStep({ name: 'a', fetch: { url: 'https://api.example.com/status' } })).toBe(
      'GET api.example.com'
    );
    expect(describeStep({ name: 'a', fetch: { url: 'https://api.example.com/x', body: { a: 1 } } })).toBe(
      'POST api.example.com'
    );
    expect(describeStep({ name: 'a', set: { attribute: 'plan', value: 'pro' } })).toBe(
      'Set attribute plan to pro'
    );
    expect(describeStep({ name: 'a', send: { title: 'Hi', topic: 'news' } })).toBe('Send “Hi” to news');
    expect(describeStep({ exit: true })).toBe('Exit');
  });
});

describe('describeSchedule', () => {
  it('reads daily times and cron fields', () => {
    expect(describeSchedule({ daily: '19:00' })).toBe('every day at 19:00');
    expect(describeSchedule({ cron: '0 9 * * 1' })).toContain('09:00');
    expect(describeSchedule({ cron: '0 9 * * 1' }).toLowerCase()).toContain('monday');
  });
});

describe('describeTrigger', () => {
  it('reads event and schedule triggers', () => {
    const event: WorkflowSpec = { trigger: { event: 'trial.started' }, steps: [] };
    expect(describeTrigger(event)).toContain('trial.started');
    const schedule: WorkflowSpec = {
      trigger: { schedule: { daily: '09:00' }, timezone: 'subscriber' },
      steps: [],
    };
    expect(describeTrigger(schedule)).toContain('09:00');
  });
});
