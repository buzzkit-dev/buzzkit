import type { Step } from '@buzzkit/schema/workflows';
import { describe, expect, it } from 'vitest';
import { describeStep, flattenSteps } from '@/app/components/workflows/describe';

describe('E9 step vocabulary', () => {
  it('summarizes repeat with its cadence, cap, and until', () => {
    const step: Step = {
      name: 'loop',
      repeat: {
        every: '1d',
        max: 5,
        until: { occurred: 'workout.completed', since: 'iteration' },
        steps: [{ name: 'nudge', send: { title: 'Go' } }],
      },
    };
    expect(describeStep(step)).toBe('Every 1 day, up to 5 times until it lands');
    expect(describeStep({ name: 'loop', repeat: { every: '2h', max: 3, steps: [] } } as Step)).toBe(
      'Every 2 hours, up to 3 times'
    );
  });

  it('summarizes forEach with its source and cap', () => {
    const step: Step = {
      name: 'fan',
      forEach: { items: 'vars.workouts.items', as: 'workout', max: 10, steps: [] },
    };
    expect(describeStep(step)).toBe('For each of vars.workouts.items, up to 10');
  });

  it('summarizes multi-event waits with endOn', () => {
    const step: Step = {
      name: 'decision',
      waitFor: {
        events: [{ event: 'recap.viewed' }, { event: 'recap.shared' }],
        endOn: [{ event: 'subscription.canceled' }],
        timeout: '3d',
      },
    };
    const summary = describeStep(step);
    expect(summary).toContain('recap.viewed or recap.shared');
    expect(summary).toContain('ended by subscription.canceled');
  });

  it('flattens loop bodies as nested rows', () => {
    const rows = flattenSteps([
      {
        name: 'loop',
        repeat: { every: '1d', max: 2, steps: [{ name: 'inner', send: { title: 'x' } }] },
      },
      {
        name: 'fan',
        forEach: { items: 'vars.list', as: 'item', max: 3, steps: [{ name: 'ping', send: { title: 'y' } }] },
      },
    ] as Step[]);
    expect(rows.map((row) => [row.name, row.depth])).toEqual([
      ['loop', 0],
      ['inner', 1],
      ['fan', 0],
      ['ping', 1],
    ]);
    expect(rows[0]?.kind).toBe('repeat');
    expect(rows[2]?.kind).toBe('forEach');
  });
});
