import { describe, expect, it } from 'vitest';
import { formatWorkflowPath, lintWorkflow } from '../../src/workflows/index';

const messages = (value: unknown) =>
  lintWorkflow(value).map((issue) => `${formatWorkflowPath(issue.path)}: ${issue.message}`);

const trial = {
  trigger: {
    event: 'trial.started',
    sources: ['server'],
    where: { ref: 'trigger.data.plan', eq: 'monthly' },
  },
  concurrency: 'one-per-subscriber',
  cancelOn: [{ event: 'subscription.started' }],
  steps: [
    { name: 'settle', wait: '2h' },
    { name: 'cancel', waitFor: { event: 'trial.cancelled', until: { after: 'trigger', plus: '1d' } } },
    {
      name: 'outcome',
      branch: {
        if: { ref: 'steps.cancel.matched', eq: true },
        then: [{ name: 'sorry', send: { title: 'Your trial is cancelled' } }],
        else: [{ name: 'nudge', send: { topic: 'trial', title: 'Your trial ends tomorrow' } }],
      },
    },
    { name: 'final', waitUntil: { after: 'trigger', plus: '2d', at: '09:00', timezone: 'UTC' } },
    { name: 'bye', send: { title: 'Thanks for trying' } },
    { exit: true },
  ],
};

describe('lintWorkflow', () => {
  it('accepts the trial workflow', () => {
    expect(messages(trial)).toEqual([]);
  });

  it('insists on the shape of the top level', () => {
    expect(messages(null)).toEqual([
      'the workflow: A workflow is an object with "trigger" and "steps", got null.',
    ]);
    expect(messages({ trigger: { event: 'a' } })).toEqual(['steps: A workflow needs at least one step.']);
    expect(messages({ trigger: { event: 'a' }, steps: [] })).toEqual([
      'steps: A workflow needs at least one step.',
    ]);
    expect(messages({ trigger: { event: 'a' }, steps: [{ exit: true }], extra: 1 })).toEqual([
      'extra: "extra" is not a key of a workflow. Allowed keys: "trigger", "concurrency", "cancelOn", "steps".',
    ]);
    expect(messages({ trigger: { event: 'a' }, concurrency: 'always', steps: [{ exit: true }] })).toEqual([
      'concurrency: "concurrency" must be one of "per-event", "one-per-subscriber", got "always".',
    ]);
  });

  it('checks the trigger: event names, sources, the reserved run events and ref roots', () => {
    expect(messages({ trigger: { event: '$run.started' }, steps: [{ exit: true }] })).toEqual([
      'trigger.event: "$run.started" is written by workflows themselves and cannot start or steer one.',
    ]);
    expect(messages({ trigger: { event: 'Trial Started' }, steps: [{ exit: true }] })[0]).toContain(
      'trigger.event:'
    );
    expect(messages({ trigger: { event: 'a', sources: ['sms'] }, steps: [{ exit: true }] })).toEqual([
      'trigger.sources[0]: "sms" is not a source. Use one of "server", "ios", "android", "web", "system".',
    ]);
    expect(
      messages({
        trigger: { event: 'a', where: { ref: 'attributes.plan', eq: 'pro' } },
        steps: [{ exit: true }],
      })
    ).toEqual([
      'trigger.where.ref: "attributes.plan" is not something a workflow can read. Use "trigger.<key>" or "subscriber.<key>" or "steps.<key>".',
    ]);
    expect(
      messages({ trigger: { event: 'a', where: { count: 'b', gte: 1 } }, steps: [{ exit: true }] })
    ).toEqual(['trigger.where: "count" conditions are not available here. Use one of "ref".']);
  });

  it('checks steps: names, uniqueness, one kind each, exit last', () => {
    const base = { trigger: { event: 'a' } };
    expect(messages({ ...base, steps: [{ wait: '1h' }] })).toEqual([
      'steps[0].name: Every step needs a "name" of lowercase letters, digits and dashes (at most 48 characters), got undefined.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          { name: 'x', wait: '1h' },
          { name: 'x', wait: '1h' },
        ],
      })
    ).toEqual(['steps[1].name: "x" is already the name of the step at steps[0].']);
    expect(messages({ ...base, steps: [{ name: 'x', wait: '1h', send: { title: 'a' } }] })).toEqual([
      'steps[0]: A step does one thing. Pick one of "wait", "send".',
    ]);
    expect(messages({ ...base, steps: [{ exit: true }, { name: 'x', wait: '1h' }] })).toEqual([
      'steps[0]: Nothing after "exit" runs. Put it last, or drop the steps after it.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', wait: '400d' }] })).toEqual([
      'steps[0].wait: A wait is at most a year, got 400d.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', wait: '0m' }] })).toEqual([
      'steps[0].wait: A wait must be longer than zero.',
    ]);
  });

  it('checks anchors: earlier steps only, wall-clock times need a timezone, subscriber time is not here yet', () => {
    const base = { trigger: { event: 'a' } };
    expect(
      messages({
        ...base,
        steps: [
          { name: 'x', waitUntil: { after: 'steps.y', plus: '1d' } },
          { name: 'y', wait: '1h' },
        ],
      })
    ).toEqual([
      'steps[0].waitUntil.after: "steps.y" refers to a step that does not come before this one. Anchors point at earlier steps.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          { name: 'y', wait: '1h' },
          { name: 'x', waitUntil: { after: 'steps.y', plus: '1d' } },
        ],
      })
    ).toEqual([]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitUntil: { after: 'trigger', at: '09:00' } }] })
    ).toEqual(['steps[0].waitUntil.timezone: "at" needs a "timezone" to say whose clock it reads.']);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', waitUntil: { after: 'trigger', at: '9am', timezone: 'UTC' } }],
      })
    ).toEqual(['steps[0].waitUntil.at: "at" is a wall-clock time such as "09:00", got "9am".']);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', waitUntil: { after: 'trigger', at: '09:00', timezone: 'subscriber' } }],
      })
    ).toEqual([
      "steps[0].waitUntil.timezone: Waiting for each subscriber's local time arrives with the next workflow phase.",
    ]);
  });

  it('checks waits for events and sends', () => {
    const base = { trigger: { event: 'a' } };
    expect(messages({ ...base, steps: [{ name: 'x', waitFor: { event: 'b' } }] })).toEqual([
      'steps[0].waitFor.until: A wait for an event needs an "until": a duration or an anchor.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          { name: 'x', waitFor: { event: 'b', until: '2d', where: { ref: 'event.data.kind', eq: 'run' } } },
        ],
      })
    ).toEqual([]);
    expect(messages({ ...base, steps: [{ name: 'x', send: {} }] })).toEqual([
      'steps[0].send: A send needs at least a title, a body or data.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', send: { title: 'a', channel: 'email' } }] })).toEqual([
      'steps[0].send.channel: "channel" must be one of "push", got "email".',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', send: { title: 'a', deliver: 'sms' } }] })).toEqual([
      'steps[0].send.deliver: "deliver" must be one of "push", "local", got "sms".',
    ]);
  });

  it('checks branches: refs into earlier steps, nesting depth', () => {
    const base = { trigger: { event: 'a' } };
    const nest = (depth: number): unknown =>
      depth === 0
        ? { name: `leaf-${depth}`, wait: '1h' }
        : {
            name: `b-${depth}`,
            branch: { if: { ref: 'trigger.data.x', exists: true }, then: [nest(depth - 1)] },
          };
    expect(messages({ ...base, steps: [nest(4)] })).toEqual([]);
    expect(messages({ ...base, steps: [nest(5)] })[0]).toContain('Branches nest at most 4 levels deep.');
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: { if: { ref: 'trigger.data.x', exists: true }, then: [{ name: 'y', wait: '1h' }] },
          },
          { name: 'z', waitUntil: { after: 'steps.y', plus: '1h' } },
        ],
      })
    ).toEqual([
      'steps[1].waitUntil.after: "steps.y" refers to a step that does not come before this one. Anchors point at earlier steps.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: { if: { ref: 'trigger.data.x', exists: true }, then: [{ name: 'y', wait: '1h' }] },
          },
          { name: 'z', waitUntil: { after: 'steps.x', plus: '1h' } },
        ],
      })
    ).toEqual([]);
  });
});
