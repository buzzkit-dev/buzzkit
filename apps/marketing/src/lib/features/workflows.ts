import type { FeaturePage } from './index';

export const workflows: FeaturePage = {
  slug: 'workflows',
  name: 'Workflows',
  icon: 'IconAgentsFilled',
  group: 'Automate',
  summary: 'Event-triggered automation with waits, branches and sends, run per subscriber.',
  blurb: 'Event-triggered steps per subscriber',
  title: 'Automation that reads like a spec.',
  continuation: 'Trigger on an event, wait, branch, send.',
  intro:
    'A workflow is a versioned document: a trigger, optional conditions and steps that run for one subscriber at a time. Write it in the dashboard or send it to the API, dry-run it, then publish.',
  vignette: 'workflow',
  sections: [
    {
      title: 'A workflow is a document',
      text: 'A trigger, optional conditions and steps, written as JSON and versioned like code. Publish a version and it keeps running while you draft the next one. The dashboard draws the same document as a flow.',
      code: `{
  // An event, or a schedule over a segment
  "trigger": { "event": "trial.started" },

  // One run at a time per subscriber
  "concurrency": "one-per-subscriber",

  // Events that cancel a live run
  "cancelOn": [{ "event": "subscription.started" }],

  // Steps run top to bottom, each with a name
  "steps": [
    { "name": "settle", "wait": "1d" },
    {
      "name": "quiet",
      "waitFor": {
        "event": "$app.backgrounded",
        "timeout": "1d"
      }
    },
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
  ]
}`,
    },
    {
      title: 'Three kinds of waiting',
      text: 'A step can wait for a duration, for a moment on the subscriber’s clock, or for an event. With a settle window, the app going to the background starts a clock, opening it resets it, and the step completes once it runs out. Time becomes a step, so a workflow follows how people actually use the app.',
      code: `{ "name": "quiet", "waitFor": {
    "event": "$app.backgrounded",
    "settleFor": "5m",
    "resetOn": ["$app.opened"],
    "timeout": "1d"
} }`,
    },
    {
      title: 'Branches, loops and fetches',
      text: 'Branch on the subscriber’s attributes, on what they did, or on a reply from your own API. Loops repeat steps until a condition holds, and a fetch step calls your backend with a secret from the vault.',
      code: `{
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
    {
      // A lane without a condition catches the rest
      "name": "free",
      "steps": [
        {
          "name": "offer",
          "fetch": {
            "url": "https://api.example.com/offers",
            "headers": {
              "Authorization": "Bearer {{ secrets.api }}"
            },
            "as": "offer"
          }
        },
        {
          // Up to three reminders, three days apart,
          // until the app is opened
          "name": "remind",
          "repeat": {
            "every": "3d",
            "max": 3,
            "until": {
              "occurred": "$app.opened",
              "since": "trigger"
            },
            "steps": []
          }
        }
      ]
    }
  ]
}`,
    },
    {
      title: 'Dry runs before every publish',
      text: 'Test any version against a real subscriber or a made-up one. Waits resolve instantly, sends render without sending, and assumed replies stand in for your API.',
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
      title: 'Versioned specs',
      text: 'Every change is a new version, and the published one keeps running.',
    },
    {
      title: 'One run per subscriber',
      text: 'Runs live on a Durable Object per subscriber, so ordering is exact.',
    },
    {
      title: 'Schedules too',
      text: 'A trigger can be a cron or a daily time over a segment.',
    },
    {
      title: 'Cancel rules',
      text: 'An event such as a purchase cancels the live run.',
    },
    {
      title: 'Local notifications',
      text: 'A send can fire on the device as a local notification, even offline.',
    },
    {
      title: 'Full run history',
      text: 'Every step, wait and send lands on the subscriber’s event stream.',
    },
  ],
  faq: [
    {
      question: 'What can start a workflow?',
      answer:
        'Any event your app or backend tracks, an event that arrives through a source such as Stripe, or a schedule over a segment. Each start runs for one subscriber.',
    },
    {
      question: 'Can a step wait for the user to do something?',
      answer:
        'Yes. A step can wait for an event, with a timeout, and match on the event’s data. It can also wait for a quiet moment, such as five minutes after the app went to the background.',
    },
    {
      question: 'What if the user does the thing before the reminder goes out?',
      answer:
        'Give the workflow cancel rules. When one of those events arrives, the live run stops and nothing more is sent.',
    },
    {
      question: 'Can I test a workflow before publishing?',
      answer:
        'Yes. A dry run walks any version against a real or made-up subscriber, resolves every wait instantly and renders the sends without sending them.',
    },
  ],
  related: ['segments', 'scheduling', 'sending'],
};
