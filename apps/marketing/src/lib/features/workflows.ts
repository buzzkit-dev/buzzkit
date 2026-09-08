import type { FeaturePage } from './index';

export const workflows: FeaturePage = {
  slug: 'workflows',
  name: 'Workflows',
  icon: 'IconAgentsFilled',
  group: 'Automate',
  summary: 'Send a trial reminder after three days. Stop it if they subscribe. No custom code.',
  blurb: 'Waits, conditions, follow-ups',
  title: 'Build complex, event-based workflows.',
  continuation: 'No custom code.',
  intro:
    'Everything you would otherwise build with cron jobs, queues and a state machine in your backend, without writing any of it.',
  vignette: 'workflow',
  sections: [
    {
      title: 'Start from an event or a schedule.',
      text: 'An event your app tracks, an event from Stripe, or every Monday at 10 over a segment.',
      code: `// An event, filtered however you need
"trigger": {
  "event": "trial.started",
  "where": {
    "ref": "trigger.data.plan",
    "eq": "monthly"
  }
}

// Or a schedule, in each subscriber's own time zone
"trigger": {
  "schedule": { "cron": "0 10 * * MON" },
  "timezone": "subscriber",
  "segment": "active-runners"
}`,
    },
    {
      title: 'Wait for the right time.',
      text: 'Wait a day, wait until 9 a.m. in their time zone, or wait until they put the phone down.',
      code: `// A fixed wait
{ "name": "settle", "wait": "1d" }

// Or wait for them: five quiet minutes after
// they close the app, giving up after a day
{ "name": "quiet", "waitFor": {
    "event": "$app.backgrounded",
    "settleFor": "5m",
    "resetOn": ["$app.opened"],
    "timeout": "1d"
} }`,
    },
    {
      title: 'Send, or stop before you do.',
      text: 'Branch on who they are, call your own API, repeat until they come back. Name the events that end the run and nothing more goes out.',
      code: `// Anyone who subscribes stops here
"cancelOn": [{ "event": "subscription.started" }],

"steps": [
  {
    "name": "plan",
    "branch": [
      {
        "name": "pro",
        "when": {
          "ref": "subscriber.attributes.plan",
          "eq": "pro"
        },
        "steps": []
      },
      // A lane without a condition catches the rest
      { "name": "free", "steps": [] }
    ]
  },
  {
    "name": "nudge",
    "send": {
      "topic": "gym-reminders",
      "title": "Trial ends tomorrow"
    }
  }
]`,
    },
    {
      title: 'Test it against a real subscriber.',
      text: 'Every wait resolves instantly, so you see the whole run in one call. Nothing is sent.',
      code: `POST /v1/workflows/trial-nudge/test
{
  "externalId": "user_42",
  "event": {
    "name": "trial.started",
    "data": { "plan": "monthly" }
  },
  "assume": {
    "status": {
      "status": 200,
      "data": { "canceled": false }
    }
  }
}`,
    },
  ],
  capabilities: [
    {
      title: 'Version history',
      text: 'The live one keeps running while you draft the next.',
    },
    {
      title: 'One run per person',
      text: 'Two steps never race each other.',
    },
    {
      title: 'Schedules',
      text: 'A cron or a daily local time over a segment.',
    },
    {
      title: 'Cancel rules',
      text: 'Name the events that end a run, and the reminder stops.',
    },
    {
      title: 'Local notifications',
      text: 'Fire on the device at the exact time, even offline.',
    },
    {
      title: 'Run history',
      text: 'See why someone got a message.',
    },
  ],
  faq: [
    {
      question: 'Do quiet hours and daily caps apply to workflow sends?',
      answer:
        'Yes. A workflow send follows the same policy as any other send, so a step due at midnight waits for morning.',
    },
    {
      question: 'What if someone turned off the topic the workflow sends to?',
      answer: 'They are skipped and the run carries on. Preferences are checked on every send.',
    },
  ],
  related: ['segments', 'scheduling', 'sending'],
};
