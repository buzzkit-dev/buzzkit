import { describe, expect, it } from 'vitest';
import { formatWorkflowPath, lintWorkflow } from '../../../src/workflows/index';

const messages = (value: unknown) =>
  lintWorkflow(value).map((issue) => `${formatWorkflowPath(issue.path)}: ${issue.message}`);

const base = { trigger: { event: 'a' } };

describe('repeat', () => {
  const loop = (repeat: Record<string, unknown>) => ({
    ...base,
    steps: [{ name: 'loop', repeat }],
  });
  const inner = [{ name: 'nudge', send: { title: 'Hi' } }];

  it('accepts a capped loop with every, until, and inner steps', () => {
    expect(
      messages(
        loop({
          steps: inner,
          every: '1d',
          max: 5,
          until: { occurred: 'workout.completed', since: 'iteration' },
        })
      )
    ).toEqual([]);
  });

  it('requires max in range and every as a duration', () => {
    expect(messages(loop({ steps: inner, every: '1d' }))).toEqual([
      'steps[0].repeat.max: A repeat needs a "max": how many passes at most, 2 to 30.',
    ]);
    expect(messages(loop({ steps: inner, every: '1d', max: 1 }))).toEqual([
      'steps[0].repeat.max: "max" takes a whole number of passes, 2 to 30, got 1.',
    ]);
    expect(messages(loop({ steps: inner, max: 3 }))).toEqual([
      'steps[0].repeat.every: A repeat needs an "every": the pause between passes.',
    ]);
  });

  it('refuses nested repeats but allows a repeat inside a branch', () => {
    const nested = loop({
      steps: [{ name: 'again', repeat: { steps: inner, every: '1h', max: 2 } }],
      every: '1d',
      max: 3,
    });
    expect(messages(nested)).toEqual([
      'steps[0].repeat.steps[0].repeat: Repeats do not nest. Restructure with one loop.',
    ]);
    const branched = {
      ...base,
      steps: [
        {
          name: 'gate',
          branch: [{ name: 'yes', steps: [{ name: 'loop', repeat: { steps: inner, every: '1d', max: 2 } }] }],
        },
      ],
    };
    expect(messages(branched)).toEqual([]);
  });

  it('keeps step names unique across the loop body', () => {
    expect(
      messages({
        ...base,
        steps: [
          { name: 'nudge', send: { title: 'Hi' } },
          { name: 'loop', repeat: { steps: inner, every: '1d', max: 2 } },
        ],
      })
    ).toEqual(['steps[1].repeat.steps[0].name: "nudge" is already the name of the step at steps[0].']);
  });
});

describe('forEach', () => {
  const each = (forEach: Record<string, unknown>) => ({
    ...base,
    steps: [{ name: 'fan', forEach }],
  });
  const inner = [{ name: 'ping', send: { title: 'Hi' } }];

  it('accepts a bounded data loop whose templates read the item', () => {
    expect(
      messages(
        each({
          items: 'vars.workouts.items',
          as: 'workout',
          max: 20,
          steps: [{ name: 'ping', send: { title: '{{ vars.workout.kind }}' } }],
        })
      )
    ).toEqual([]);
  });

  it('checks the items path root and the as name', () => {
    expect(messages(each({ items: 'workouts', as: 'workout', max: 5, steps: inner }))).toEqual([
      'steps[0].forEach.items: "items" starts from one of "vars", "steps", "trigger", "subscriber", got "workouts".',
    ]);
    expect(messages(each({ items: 'vars.list', as: 'My Item', max: 5, steps: inner }))).toEqual([
      'steps[0].forEach.as: "as" names the current item, readable as vars.<name> inside the loop, got "My Item".',
    ]);
  });

  it('requires max within bounds and refuses nesting', () => {
    expect(messages(each({ items: 'vars.list', as: 'item', max: 51, steps: inner }))).toEqual([
      'steps[0].forEach.max: "max" takes a whole number of items, 1 to 50, got 51.',
    ]);
    const nested = each({
      items: 'vars.list',
      as: 'item',
      max: 5,
      steps: [{ name: 'more', forEach: { items: 'vars.other', as: 'x', max: 5, steps: inner } }],
    });
    expect(messages(nested)).toEqual([
      'steps[0].forEach.steps[0].forEach: Data loops do not nest. Flatten the collection first.',
    ]);
  });

  it('allows a repeat inside a forEach', () => {
    expect(
      messages(
        each({
          items: 'vars.list',
          as: 'item',
          max: 5,
          steps: [{ name: 'loop', repeat: { steps: inner, every: '1h', max: 2 } }],
        })
      )
    ).toEqual([]);
  });
});

describe('waitFor extensions', () => {
  const wait = (waitFor: Record<string, unknown>) => ({
    ...base,
    steps: [{ name: 'decision', waitFor }],
  });

  it('accepts an events list with per-entry where, endOn, and filtered resets', () => {
    expect(
      messages(
        wait({
          events: [
            { event: 'subscription.started' },
            { event: 'trial.canceled', where: { ref: 'event.data.reason', neq: 'payment' } },
          ],
          endOn: [{ event: 'subscription.canceled' }],
          settleFor: '1h',
          resetOn: [{ event: '$app.opened', where: { ref: 'event.data.source', eq: 'push' } }],
          timeout: '7d',
        })
      )
    ).toEqual([]);
  });

  it('refuses event and events together, and where next to events', () => {
    expect(messages(wait({ event: 'a', events: [{ event: 'b' }], timeout: '1d' }))).toEqual([
      'steps[0].waitFor: A wait takes "event" or "events", not both.',
    ]);
    expect(
      messages(wait({ events: [{ event: 'b' }], where: { ref: 'event.data.x', eq: 1 }, timeout: '1d' }))
    ).toEqual(['steps[0].waitFor.where: With "events", each entry carries its own "where".']);
  });

  it('bounds the events list and validates entries', () => {
    expect(messages(wait({ events: [], timeout: '1d' }))).toEqual([
      'steps[0].waitFor.events: "events" cannot be empty: name at least one event to wait for.',
    ]);
    expect(
      messages(wait({ events: [1, 2, 3, 4, 5, 6].map((n) => ({ event: `e${n}` })), timeout: '1d' }))
    ).toEqual(['steps[0].waitFor.events: "events" takes at most 5 entries, got 6.']);
    expect(messages(wait({ events: ['b'], timeout: '1d' }))).toEqual([
      'steps[0].waitFor.events[0]: a waited event is { "event", "where" }, got "b".',
    ]);
  });

  it('endOn cannot repeat a waited event, and stale entries lint', () => {
    expect(messages(wait({ events: [{ event: 'b' }], endOn: [{ event: 'b' }], timeout: '1d' }))).toEqual([
      'steps[0].waitFor.endOn[0]: "b" is an event this step waits for; a match already ends the wait.',
    ]);
    expect(messages(wait({ event: 'b', endOn: [], timeout: '1d' }))).toEqual([
      'steps[0].waitFor.endOn: "endOn" cannot be empty: name the events that end the wait.',
    ]);
  });

  it('resetOn objects lint their where and still refuse the waited event', () => {
    expect(
      messages(
        wait({
          event: 'b',
          settleFor: '5m',
          resetOn: [{ event: 'b', where: { ref: 'event.data.x', eq: 1 } }],
          timeout: '1d',
        })
      )
    ).toEqual([
      'steps[0].waitFor.resetOn[0]: "b" is an event this step waits for; it cannot also restart it.',
    ]);
  });
});

describe('rich sends', () => {
  const send = (payload: Record<string, unknown>) => ({
    ...base,
    steps: [{ name: 'push', send: { title: 'Hi', ...payload } }],
  });

  it('accepts the full payload', () => {
    expect(
      messages(
        send({
          imageUrl: 'https://cdn.example.com/{{ trigger.data.id }}.png',
          sound: 'invite.caf',
          badge: 2,
          threadId: 'event-{{ trigger.data.id }}',
          collapseId: 'invite',
          interruptionLevel: 'timeSensitive',
          relevanceScore: 0.8,
          priority: 'normal',
          deepLink: 'app://events/{{ trigger.data.id }}',
          action: { name: 'show_event', data: { id: '{{ trigger.data.id }}' } },
          actions: [
            { id: 'accept', title: 'Accept', foreground: true },
            { id: 'reply', title: 'Reply', input: true, placeholder: 'Say something' },
          ],
          policy: 'ignore',
        })
      )
    ).toEqual([]);
  });

  it('checks levels, ranges, and button shapes', () => {
    expect(messages(send({ interruptionLevel: 'loud' }))).toEqual([
      'steps[0].send.interruptionLevel: "interruptionLevel" must be one of "passive", "active", "timeSensitive", "critical", got "loud".',
    ]);
    expect(messages(send({ relevanceScore: 2 }))).toEqual([
      'steps[0].send.relevanceScore: "relevanceScore" takes a number between 0 and 1, got 2.',
    ]);
    expect(messages(send({ badge: -1 }))).toEqual([
      'steps[0].send.badge: "badge" takes a whole number, 0 or more, got -1.',
    ]);
    expect(
      messages(
        send({
          actions: [
            { id: 'a', title: 'A' },
            { id: 'a', title: 'B' },
          ],
        })
      )
    ).toEqual(['steps[0].send.actions[1].id: "a" is already a button of this send.']);
    expect(messages(send({ actions: [{ id: 'a', title: 'A', placeholder: 'x' }] }))).toEqual([
      'steps[0].send.actions[0].placeholder: "placeholder" only means something on a button with "input": true.',
    ]);
    expect(messages(send({ actions: [1, 2, 3, 4, 5].map((n) => ({ id: `b${n}`, title: 'B' })) }))).toEqual([
      'steps[0].send.actions: A notification shows at most 4 buttons, got 5.',
    ]);
  });

  it('lints templates inside the new string fields', () => {
    const issues = messages(send({ deepLink: 'app://x/{{ nope.id }}' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('steps[0].send.deepLink');
  });
});

describe('settle and events interplay', () => {
  it('refuses settleFor next to an events list', () => {
    expect(
      messages({
        trigger: { event: 'a' },
        steps: [
          {
            name: 'x',
            waitFor: {
              events: [{ event: 'b' }],
              settleFor: '1h',
              resetOn: ['c'],
              timeout: '1d',
            },
          },
        ],
      })
    ).toContain(
      'steps[0].waitFor.settleFor: "settleFor" works with a single "event"; with "events" the first match ends the wait.'
    );
  });
});
