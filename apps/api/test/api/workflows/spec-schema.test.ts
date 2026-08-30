import { WorkflowExpressionSchema, WorkflowSpecSchema } from '@buzzkit/api/api/workflows/spec-schema';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

const valid = (value: unknown) => Value.Check(WorkflowSpecSchema, value);

describe('WorkflowSpecSchema', () => {
  it('accepts every step shape and rejects unknown keys', () => {
    expect(
      valid({
        trigger: { event: 'a', sources: ['ios'], where: { ref: 'trigger.data.x', eq: 1 } },
        concurrency: 'per-event',
        cancelOn: [{ event: 'b' }],
        steps: [
          { name: 'w', wait: '5m' },
          { name: 'u', waitUntil: { delay: '1d', time: '09:00', timezone: 'UTC' } },
          { name: 'f', waitFor: { event: 'c', timeout: '1d' } },
          {
            name: 'b',
            branch: [{ name: 'yes', when: { ref: 'steps.f.matched', eq: true }, steps: [{ exit: true }] }],
          },
          { name: 's', send: { title: 't', body: 'b', data: { k: 1 }, deliver: 'local' } },
          { exit: true },
        ],
      })
    ).toBe(true);
    expect(valid({ trigger: { event: 'a' }, steps: [{ name: 'w', wait: '5m', extra: 1 }] })).toBe(false);
    expect(valid({ trigger: { event: 'a' }, steps: [{ name: 'W', wait: '5m' }] })).toBe(false);
    expect(valid({ trigger: { event: 'a' }, steps: [{ exit: false }] })).toBe(false);
    expect(valid({ trigger: { event: 'a' }, steps: [] })).toBe(false);
    expect(valid({ trigger: { event: 'a', sources: [] }, steps: [{ exit: true }] })).toBe(false);
  });

  it('accepts the data, schedule, quiet wait and history shapes and rejects their malformed twins', () => {
    expect(
      valid({
        trigger: {
          schedule: { cron: '0 10 * * MON' },
          timezone: 'subscriber',
          segment: 'runners',
          where: { count: 'workout.completed', since: 'localMidnight', eq: 0 },
        },
        defaultTimezone: 'UTC',
        steps: [
          {
            name: 'status',
            fetch: {
              url: 'https://api.example.com',
              as: 'status',
              body: { a: 1 },
              onError: 'skip',
              timeout: '30s',
            },
          },
          { name: 'flag', set: { attribute: 'fatigue', value: true } },
          { name: 'n', set: { var: 'checks', value: '{{ vars.status.checks }}' } },
          {
            name: 'quiet',
            waitFor: { event: '$app.backgrounded', settleFor: '5m', resetOn: ['$app.opened'], timeout: '1d' },
          },
          {
            name: 'b',
            branch: [
              {
                name: 'yes',
                when: { any: [{ opened: 'x' }, { delivered: 'x' }, { occurred: 'a', since: 'trigger' }] },
                steps: [],
              },
            ],
          },
          { name: 'x', send: { title: 't', skipIfSentWithin: '1d' } },
        ],
      })
    ).toBe(true);
    expect(
      valid({ trigger: { schedule: { daily: '19:00' }, timezone: 'UTC' }, steps: [{ exit: true }] })
    ).toBe(true);
    expect(
      valid({
        trigger: { schedule: { cron: '0 10 * * *', daily: '10:00' }, timezone: 'UTC' },
        steps: [{ exit: true }],
      })
    ).toBe(false);
    expect(valid({ trigger: { schedule: { daily: '19:00' } }, steps: [{ exit: true }] })).toBe(false);
    expect(valid({ trigger: { event: 'a' }, steps: [{ name: 'x', fetch: { url: 'x' } }] })).toBe(false);
    expect(valid({ trigger: { event: 'a' }, steps: [{ name: 'x', branch: [] }] })).toBe(false);
    expect(
      valid({
        trigger: { event: 'a' },
        steps: [{ name: 'x', fetch: { url: 'https://a.io', timeout: '5m' } }],
      })
    ).toBe(false);
    expect(
      valid({ trigger: { event: 'a' }, steps: [{ name: 'x', set: { attribute: 'a', var: 'b', value: 1 } }] })
    ).toBe(false);
    expect(
      valid({ trigger: { event: 'a' }, steps: [{ name: 'x', set: { var: 'a', value: { nested: 1 } } }] })
    ).toBe(false);
    expect(
      valid({ trigger: { event: 'a' }, steps: [{ name: 'x', wait: { after: '$app.backgrounded' } }] })
    ).toBe(false);
    expect(valid({ trigger: { event: 'a' }, steps: [{ name: 'x', wait: { for: '5m', unless: [] } }] })).toBe(
      false
    );
    expect(
      valid({ trigger: { event: 'a', where: { lastSeen: { within: '1d' } } }, steps: [{ exit: true }] })
    ).toBe(false);
    expect(valid({ trigger: { event: 'a', where: { opened: 'Nudge' } }, steps: [{ exit: true }] })).toBe(
      false
    );
  });

  it('keeps the run history conditions to the workflow grammar', () => {
    const workflow = (value: unknown) => Value.Check(WorkflowExpressionSchema, value);
    for (const condition of [
      { occurred: '$app.opened', since: 'trigger' },
      { occurred: 'a', within: '1d' },
      { count: 'a', since: 'localMidnight', eq: 0 },
      { opened: 'nudge' },
      { delivered: 'nudge' },
      { all: [{ not: { opened: 'nudge' } }, { ref: 'trigger.data.x', eq: 1 }] },
    ]) {
      expect(workflow(condition), JSON.stringify(condition)).toBe(true);
    }
    expect(workflow({ lastSeen: { within: '1d' } })).toBe(false);
    expect(workflow({ channel: 'push' })).toBe(false);
    expect(workflow({ opened: 'Nudge' })).toBe(false);
    expect(workflow({ occurred: 'a', since: 'yesterday' })).toBe(false);
  });
});
