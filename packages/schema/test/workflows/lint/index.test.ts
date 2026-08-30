import { describe, expect, it } from 'vitest';
import { formatWorkflowPath, lintWorkflow, TEMPLATE_FILTERS } from '../../../src/workflows/index';

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
  defaultTimezone: 'Europe/Berlin',
  steps: [
    { name: 'settle', wait: '2h' },
    { name: 'cancel', waitFor: { event: 'trial.canceled', timeout: { delay: '1d' } } },
    {
      name: 'outcome',
      branch: [
        {
          name: 'canceled',
          when: { ref: 'steps.cancel.matched', eq: true },
          steps: [{ name: 'sorry', send: { title: 'Your trial is canceled' } }, { exit: true }],
        },
        {
          name: 'otherwise',
          steps: [{ name: 'nudge', send: { topic: 'trial', title: 'Your trial ends tomorrow' } }],
        },
      ],
    },
    { name: 'final', waitUntil: { delay: '2d', time: '09:00', timezone: 'subscriber' } },
    { name: 'bye', send: { title: 'Thanks for trying' } },
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
    expect(messages({ trigger: { event: 'a' }, steps: [{ name: 'x', wait: '1h' }], extra: 1 })).toEqual([
      'extra: "extra" is not a key of a workflow. Allowed keys: "trigger", "concurrency", "cancelOn", "defaultTimezone", "steps".',
    ]);
    expect(
      messages({ trigger: { event: 'a' }, concurrency: 'always', steps: [{ name: 'x', wait: '1h' }] })
    ).toEqual(['concurrency: "concurrency" must be one of "per-event", "one-per-subscriber", got "always".']);
    expect(
      messages({ trigger: { event: 'a' }, defaultTimezone: 'subscriber', steps: [{ name: 'x', wait: '1h' }] })
    ).toEqual([
      'defaultTimezone: "defaultTimezone" is an IANA name such as "Europe/Berlin", got "subscriber".',
    ]);
  });

  it('checks the trigger: event names, sources, the reserved run events and ref roots', () => {
    const steps = [{ name: 'x', wait: '1h' }];
    expect(messages({ trigger: { event: '$run.started' }, steps })).toEqual([
      'trigger.event: "$run.started" is written by workflows themselves and cannot start or steer one.',
    ]);
    expect(messages({ trigger: { event: 'Trial Started' }, steps })[0]).toContain('trigger.event:');
    expect(messages({ trigger: { event: 'a', sources: ['sms'] }, steps })).toEqual([
      'trigger.sources[0]: "sms" is not a source. Use one of "server", "ios", "android", "web", "system".',
    ]);
    expect(
      messages({ trigger: { event: 'a', where: { ref: 'attributes.plan', eq: 'pro' } }, steps })
    ).toEqual([
      'trigger.where.ref: "attributes.plan" is not something a trigger can read. Use "trigger.<key>" or "subscriber.<key>".',
    ]);
    expect(messages({ trigger: { event: 'a', where: { lastSeen: { within: '1d' } } }, steps })).toEqual([
      'trigger.where: "lastSeen" conditions are not available here. Use one of "ref", "count", "never", "occurred".',
    ]);
  });

  it('checks schedule triggers: cron or daily, a timezone, a segment slug and subscriber-only refs', () => {
    const steps = [{ name: 'x', send: { title: 'a' } }];
    expect(
      messages({
        trigger: { schedule: { cron: '0 10 * * MON' }, timezone: 'Europe/Berlin', segment: 'runners' },
        steps,
      })
    ).toEqual([]);
    expect(
      messages({
        trigger: {
          schedule: { daily: '19:00' },
          timezone: 'subscriber',
          where: { count: 'workout.completed', since: 'localMidnight', eq: 0 },
        },
        steps,
      })
    ).toEqual([]);
    expect(messages({ trigger: { schedule: { cron: '0 10 * *' }, timezone: 'UTC' }, steps })).toEqual([
      'trigger.schedule.cron: A cron expression has five fields (minute, hour, day of month, month, day of week), got 4.',
    ]);
    expect(messages({ trigger: { schedule: { daily: '7pm' }, timezone: 'UTC' }, steps })).toEqual([
      'trigger.schedule.daily: "daily" is a wall-clock time such as "19:00", got "7pm".',
    ]);
    expect(messages({ trigger: { schedule: { daily: '19:00' } }, steps })).toEqual([
      'trigger.timezone: A schedule needs a "timezone": an IANA name such as "Europe/Berlin", or "subscriber" for each subscriber\'s own.',
    ]);
    expect(messages({ trigger: { schedule: { daily: '19:00' }, timezone: 'Mars/Olympus' }, steps })).toEqual([
      'trigger.timezone: "timezone" is an IANA name such as "Europe/Berlin" or "subscriber" for each subscriber\'s own, got "Mars/Olympus".',
    ]);
    expect(
      messages({ trigger: { schedule: { daily: '19:00' }, timezone: 'UTC', sources: ['ios'] }, steps })
    ).toEqual([
      'trigger.sources: "sources" is not a key of a schedule trigger. Allowed keys: "schedule", "timezone", "segment", "where".',
    ]);
    expect(
      messages({
        trigger: { schedule: { daily: '19:00' }, timezone: 'UTC', where: { ref: 'trigger.data.x', eq: 1 } },
        steps,
      })
    ).toEqual([
      'trigger.where.ref: "trigger.data.x" is not something a schedule can read. Use "subscriber.<key>".',
    ]);
    expect(
      messages({ trigger: { schedule: { cron: '0 10 * * *', daily: '10:00' }, timezone: 'UTC' }, steps })
    ).toEqual(['trigger.schedule: A schedule is one of "cron" or "daily".']);
    expect(messages({ trigger: { event: 'a', schedule: { daily: '19:00' } }, steps })).toEqual([
      'trigger: A trigger is an "event" or a "schedule", not both and not neither.',
    ]);
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
    expect(messages({ ...base, steps: [{ name: 'x', wait: '1h' }, { exit: true }] })).toEqual([]);
    expect(messages({ ...base, steps: [{ exit: true }, { name: 'x', wait: '1h' }] })).toEqual([
      'steps[0]: Nothing after "exit" runs. Put it last, or drop the steps after it.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'b',
            branch: [
              {
                name: 'yes',
                when: { ref: 'trigger.data.x', exists: true },
                steps: [{ exit: true }, { name: 'y', wait: '1h' }],
              },
            ],
          },
        ],
      })
    ).toEqual([
      'steps[0].branch[0].steps[0]: Nothing after "exit" runs. Put it last, or drop the steps after it.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', wait: '400d' }] })).toEqual([
      'steps[0].wait: A wait is at most a year, got 400d.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', wait: '0m' }] })).toEqual([
      'steps[0].wait: A wait must be longer than zero.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', wait: { for: '5m' } }] })).toEqual([
      'steps[0].wait: an object is not a duration. Use a number followed by m, h or d, such as "15m", "2h" or "3d".',
    ]);
  });

  it('checks moments: a delay or a time, a timezone with the time', () => {
    const base = { trigger: { event: 'a' } };
    expect(messages({ ...base, steps: [{ name: 'x', waitUntil: { delay: '2d' } }] })).toEqual([]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitUntil: { time: '09:00', timezone: 'subscriber' } }] })
    ).toEqual([]);
    expect(messages({ ...base, steps: [{ name: 'x', waitUntil: {} }] })).toEqual([
      'steps[0].waitUntil: A moment needs a "delay" from the start of the run, a "time" of day, or both.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', waitUntil: { time: '09:00' } }] })).toEqual([
      'steps[0].waitUntil.timezone: "time" needs a "timezone" to say whose clock it reads.',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitUntil: { time: '9am', timezone: 'UTC' } }] })
    ).toEqual(['steps[0].waitUntil.time: "time" is a wall-clock time such as "09:00", got "9am".']);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitUntil: { delay: '1d', timezone: 'UTC' } }] })
    ).toEqual(['steps[0].waitUntil.timezone: "timezone" only means something next to a "time".']);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitUntil: { time: '09:00', timezone: 'Mars/Olympus' } }] })
    ).toEqual([
      'steps[0].waitUntil.timezone: "timezone" is an IANA name such as "Europe/Berlin" or "subscriber" for each subscriber\'s own, got "Mars/Olympus".',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitUntil: { after: 'trigger', plus: '1d' } }] })
    ).toEqual([
      'steps[0].waitUntil.after: "after" is not a key of a moment. Allowed keys: "delay", "time", "timezone".',
      'steps[0].waitUntil.plus: "plus" is not a key of a moment. Allowed keys: "delay", "time", "timezone".',
      'steps[0].waitUntil: A moment needs a "delay" from the start of the run, a "time" of day, or both.',
    ]);
  });

  it('checks waits for events: a timeout, settle with reset events, where refs', () => {
    const base = { trigger: { event: 'a' } };
    expect(messages({ ...base, steps: [{ name: 'x', waitFor: { event: 'b' } }] })).toEqual([
      'steps[0].waitFor.timeout: A wait for an event needs a "timeout": a duration or a moment to give up at.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          { name: 'x', waitFor: { event: 'b', timeout: '2d', where: { ref: 'event.data.kind', eq: 'run' } } },
        ],
      })
    ).toEqual([]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'quiet',
            waitFor: { event: '$app.backgrounded', settleFor: '5m', resetOn: ['$app.opened'], timeout: '1d' },
          },
        ],
      })
    ).toEqual([]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitFor: { event: 'b', settleFor: '5m', timeout: '1d' } }] })
    ).toEqual([
      'steps[0].waitFor.resetOn: "settleFor" needs "resetOn": the events that restart the settle clock.',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitFor: { event: 'b', resetOn: ['c'], timeout: '1d' } }] })
    ).toEqual([
      'steps[0].waitFor.settleFor: "resetOn" needs "settleFor": how long things must stay quiet after the event.',
    ]);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', waitFor: { event: 'b', settleFor: '5m', resetOn: ['b'], timeout: '1d' } }],
      })
    ).toEqual([
      'steps[0].waitFor.resetOn[0]: "b" is the event this step waits for; it cannot also restart it.',
    ]);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', waitFor: { event: 'b', settleFor: '5m', resetOn: [], timeout: '1d' } }],
      })
    ).toEqual([
      'steps[0].waitFor.resetOn: "resetOn" takes a list of event names that restart the settle clock, got a list.',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', waitFor: { event: 'b', timeout: { delay: '1d' } } }] })
    ).toEqual([]);
    expect(messages({ ...base, steps: [{ name: 'x', waitFor: { event: 'b', until: '1d' } }] })).toEqual([
      'steps[0].waitFor.until: "until" is not a key of a waitFor step. Allowed keys: "event", "where", "settleFor", "resetOn", "timeout".',
      'steps[0].waitFor.timeout: A wait for an event needs a "timeout": a duration or a moment to give up at.',
    ]);
  });

  it('checks branches: named cases, refs into earlier steps, nesting depth', () => {
    const base = { trigger: { event: 'a' } };
    const nest = (depth: number): unknown =>
      depth === 0
        ? { name: `leaf-${depth}`, wait: '1h' }
        : {
            name: `b-${depth}`,
            branch: [
              { name: 'yes', when: { ref: 'trigger.data.x', exists: true }, steps: [nest(depth - 1)] },
            ],
          };
    expect(messages({ ...base, steps: [nest(4)] })).toEqual([]);
    expect(messages({ ...base, steps: [nest(5)] })[0]).toContain('Branches nest at most 4 levels deep.');
    expect(
      messages({
        ...base,
        steps: [
          { name: 'n', set: { var: 'workouts', value: 3 } },
          {
            name: 'tier',
            branch: [
              {
                name: 'beginner',
                when: { ref: 'vars.workouts', lt: 5 },
                steps: [{ name: 'a', send: { title: 'a' } }],
              },
              {
                name: 'regular',
                when: { ref: 'vars.workouts', lt: 10 },
                steps: [{ name: 'b', send: { title: 'b' } }],
              },
              { name: 'otherwise', steps: [{ name: 'c', send: { title: 'c' } }] },
            ],
          },
        ],
      })
    ).toEqual([]);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', branch: { if: { ref: 'trigger.data.x', eq: 1 }, then: [] } }],
      })
    ).toEqual([
      'steps[0].branch: "branch" takes a list of cases { "name", "when", "steps" }, got an object.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: [
              { name: 'everyone', steps: [] },
              { name: 'some', when: { ref: 'trigger.data.x', eq: 1 }, steps: [] },
            ],
          },
        ],
      })
    ).toEqual([
      'steps[0].branch[0]: A case without "when" always matches, so nothing after it runs. Put it last, and keep only one.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: [
              { name: 'a', steps: [] },
              { name: 'b', steps: [] },
            ],
          },
        ],
      })
    ).toEqual([
      'steps[0].branch[0]: A case without "when" always matches, so nothing after it runs. Put it last, and keep only one.',
    ]);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', branch: [{ name: 'else', when: { ref: 'trigger.data.x', eq: 1 }, steps: [] }] }],
      })
    ).toEqual([
      'steps[0].branch[0].name: "else" is the name of the case that runs when no other matches. Give this case a "when"-less last place, or another name.',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: [
              { name: 'yes', when: { ref: 'trigger.data.x', eq: 1 }, steps: [] },
              { name: 'yes', when: { ref: 'trigger.data.x', eq: 2 }, steps: [] },
            ],
          },
        ],
      })
    ).toEqual(['steps[0].branch[1].name: "yes" is already a case of this branch.']);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: [{ name: 'Yes', when: { ref: 'trigger.data.x', eq: 1 }, steps: [] }],
          },
        ],
      })
    ).toEqual([
      'steps[0].branch[0].name: Every case needs a "name" of lowercase letters, digits and dashes (at most 48 characters), got "Yes".',
    ]);
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            branch: [
              {
                name: 'yes',
                when: { ref: 'trigger.data.x', exists: true },
                steps: [{ name: 'y', wait: '1h' }],
              },
            ],
          },
          {
            name: 'z',
            branch: [{ name: 'yes', when: { ref: 'steps.y.at', exists: true }, steps: [] }],
          },
        ],
      })
    ).toEqual([]);
  });

  it('checks history conditions: since anchors, opened and delivered read earlier send steps', () => {
    const base = { trigger: { event: 'a', where: { occurred: '$app.opened', within: '7d' } } };
    const branch = (when: unknown) => ({
      name: 'check',
      branch: [{ name: 'yes', when, steps: [{ exit: true }] }],
    });
    expect(
      messages({
        ...base,
        steps: [
          { name: 'nudge', send: { title: 'a' } },
          { name: 'settle', wait: '1d' },
          branch({
            any: [
              { opened: 'nudge' },
              { delivered: 'nudge' },
              { count: 'workout.completed', since: 'trigger', gte: 1 },
            ],
          }),
        ],
      })
    ).toEqual([]);
    expect(
      messages({ ...base, steps: [branch({ opened: 'nudge' }), { name: 'nudge', send: { title: 'a' } }] })
    ).toEqual([
      'steps[0].branch[0].when.opened: "nudge" is not a step that comes before this one. "opened" reads an earlier send step.',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'settle', wait: '1d' }, branch({ delivered: 'settle' })] })
    ).toEqual([
      'steps[1].branch[0].when.delivered: "settle" is not a send step. "delivered" reads what a send step sent.',
    ]);
    expect(
      messages({ trigger: { event: 'a', where: { opened: 'nudge' } }, steps: [{ name: 'x', wait: '1h' }] })
    ).toEqual([
      'trigger.where: "opened" conditions are not available here. Use one of "ref", "count", "never", "occurred".',
    ]);
    expect(
      messages({
        trigger: { event: 'a', where: { count: 'b', within: '1d', since: 'trigger', gte: 1 } },
        steps: [{ name: 'x', wait: '1h' }],
      })
    ).toEqual(['trigger.where: An event count takes "within" or "since", not both.']);
    expect(
      messages({
        trigger: { event: 'a', where: { count: 'b', since: 'yesterday', gte: 1 } },
        steps: [{ name: 'x', wait: '1h' }],
      })
    ).toEqual(['trigger.where.since: "since" must be one of "trigger", "localMidnight", got "yesterday".']);
  });

  it('checks fetch steps: methods, urls, headers with secrets, bodies, timeouts, expected statuses', () => {
    const base = { trigger: { event: 'a' } };
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'status',
            fetch: {
              method: 'POST',
              url: 'https://api.example.com/status?user={{ subscriber.externalId }}',
              headers: { Authorization: 'Bearer {{ secrets.api }}', 'X-Plan': '{{ trigger.data.plan }}' },
              body: { plan: '{{ trigger.data.plan }}' },
              timeout: '30s',
              expect: { status: [200, 404] },
              as: 'status',
              onError: 'skip',
            },
          },
          {
            name: 'raw',
            fetch: {
              method: 'PUT',
              url: 'https://api.example.com/note',
              body: 'plain {{ trigger.data.plan }}',
            },
          },
          { name: 'say', send: { title: '{{ vars.status.checks }}' } },
        ],
      })
    ).toEqual([]);
    expect(messages({ ...base, steps: [{ name: 'x', fetch: { url: 'http://api.example.com' } }] })).toEqual([
      'steps[0].fetch.url: "url" is an https address, such as "https://api.example.com/status", got "http://api.example.com".',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', fetch: { url: 'https://a.io', method: 'HEAD' } }] })
    ).toEqual([
      'steps[0].fetch.method: "method" must be one of "GET", "POST", "PUT", "PATCH", "DELETE", got "HEAD".',
    ]);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', fetch: { url: 'https://a.io', method: 'GET', body: { a: 1 } } }],
      })
    ).toEqual(['steps[0].fetch.body: A GET request carries no body. Drop "body" or use POST.']);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', fetch: { url: 'https://a.io', headers: { 'Bad Header': 'x' } } }],
      })
    ).toEqual(['steps[0].fetch.headers.Bad Header: "Bad Header" is not a header name.']);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', fetch: { url: 'https://a.io', headers: { 'X-Key': '{{ secrets.Api-Key }}' } } }],
      })
    ).toEqual([
      'steps[0].fetch.headers.X-Key: {{ secrets.Api-Key }} names a secret: "secrets.<name>", a lowercase letter followed by letters, digits and underscores.',
    ]);
    expect(
      messages({
        ...base,
        steps: [{ name: 'x', fetch: { url: 'https://a.io', body: { key: '{{ secrets.api }}' } } }],
      })
    ).toEqual([
      'steps[0].fetch.body.key: {{ secrets.api }} is not something a template can read here. Use "trigger.<key>", "subscriber.<key>", "steps.<key>", "vars.<key>" or "now".',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', fetch: { url: 'https://a.io', expect: { status: [99] } } }] })
    ).toEqual(['steps[0].fetch.expect.status[0]: A status code is a whole number from 100 to 599, got 99.']);
    expect(
      messages({ ...base, steps: [{ name: 'x', fetch: { url: 'https://a.io', as: 'Status' } }] })
    ).toEqual([
      'steps[0].fetch.as: "as" names a variable: a lowercase letter followed by letters, digits and underscores, got "Status".',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', fetch: { url: 'https://a.io', onError: 'retry' } }] })
    ).toEqual(['steps[0].fetch.onError: "onError" must be one of "fail", "skip", "continue", got "retry".']);
    expect(
      messages({ ...base, steps: [{ name: 'x', fetch: { url: 'https://a.io', timeout: '5m' } }] })
    ).toEqual([
      'steps[0].fetch.timeout: "timeout" is a number of seconds from 1s to 60s, such as "30s", got "5m".',
    ]);
  });

  it('checks set steps: one target, no system attributes, scalar values, variables that exist', () => {
    const base = { trigger: { event: 'a' } };
    expect(
      messages({
        ...base,
        steps: [
          { name: 'flag', set: { attribute: 'marketingFatigue', value: true } },
          { name: 'n', set: { var: 'checks', value: '{{ trigger.data.checks }}' } },
          { name: 'say', send: { title: '{{ vars.checks | number }} checks' } },
        ],
      })
    ).toEqual([]);
    expect(
      messages({ ...base, steps: [{ name: 'x', set: { attribute: 'a', var: 'b', value: 1 } }] })
    ).toEqual([
      'steps[0].set: A set writes one thing: an "attribute" of the subscriber or a "var" of the run.',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', set: { attribute: '$timezone', value: 'UTC' } }] })
    ).toEqual(['steps[0].set.attribute: "$timezone" is written by the SDK and cannot be set by a workflow.']);
    expect(messages({ ...base, steps: [{ name: 'x', set: { var: 'a', value: { nested: 1 } } }] })).toEqual([
      'steps[0].set.value: "value" takes a string, number, boolean or null, got an object.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', send: { title: 'Hi {{ vars.name }}' } }] })).toEqual([
      'steps[0].send.title: {{ vars.name }} reads a variable no "set" step writes.',
    ]);
  });

  it('checks templates and sends: syntax, filters, what they read, skipIfSentWithin', () => {
    const base = { trigger: { event: 'a' } };
    expect(
      messages({
        ...base,
        steps: [
          {
            name: 'x',
            send: {
              title: '{{ trigger.data.endsAt | date }}',
              body: '{{ subscriber.attributes.name | default: "there" }}, {{ trigger.data.cancel ? "bye" : "hi" }}',
              topic: 'trial',
              skipIfSentWithin: '1d',
            },
          },
        ],
      })
    ).toEqual([]);
    expect(
      messages({ ...base, steps: [{ name: 'x', send: { title: '{{ trigger.data.x | shout }}' } }] })
    ).toEqual([
      `steps[0].send.title: {{ trigger.data.x | shout }}: "shout" is not a filter. Filters: ${TEMPLATE_FILTERS.map((filter) => `"${filter}"`).join(', ')}.`,
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', send: { title: '{{ event.data.x }}' } }] })).toEqual([
      'steps[0].send.title: {{ event.data.x }} is not something a template can read here. Use "trigger.<key>", "subscriber.<key>", "steps.<key>", "vars.<key>" or "now".',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'x', send: { title: 'a', data: { deep: ['{{ trigger }}'] } } }] })
    ).toEqual(['steps[0].send.data.deep[0]: {{ trigger }} needs a key after it, such as "trigger.<key>".']);
    expect(messages({ ...base, steps: [{ name: 'x', send: {} }] })).toEqual([
      'steps[0].send: A send needs at least a title, a body or data.',
    ]);
    expect(messages({ ...base, steps: [{ name: 'x', send: { title: 'a', channel: 'email' } }] })).toEqual([
      'steps[0].send.channel: "channel" must be one of "push", got "email".',
    ]);
    expect(
      messages({ ...base, steps: [{ name: 'y', send: { title: 'a', skipIfSentWithin: '2y' } }] })
    ).toEqual([
      'steps[0].send.skipIfSentWithin: "2y" is not a duration. Use a number followed by m, h or d, such as "15m", "2h" or "3d".',
    ]);
  });
});
