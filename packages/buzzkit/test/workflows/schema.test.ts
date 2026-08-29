import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { WorkflowSpecSchema } from '../../src/workflows/index';

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
          { name: 'u', waitUntil: { after: 'trigger', plus: '1d', at: '09:00', timezone: 'UTC' } },
          { name: 'f', waitFor: { event: 'c', until: '1d' } },
          { name: 'b', branch: { if: { ref: 'steps.f.matched', eq: true }, then: [{ exit: true }] } },
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
});
