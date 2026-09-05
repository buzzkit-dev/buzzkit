import type { FeaturePage } from './index';

export const workflows: FeaturePage = {
  slug: 'workflows',
  name: 'Workflows',
  icon: 'IconAgentsFilled',
  group: 'Automate',
  summary:
    'Lifecycle messaging that reacts to what people do: trigger on an event, wait, branch and send, per subscriber.',
  blurb: 'Event-triggered steps per subscriber',
  title: 'Automation that reads like a spec.',
  continuation: 'Trigger on an event, wait, branch, send.',
  intro:
    'A workflow turns an event into a sequence: the trial reminder, the win-back, the streak nudge. Write it once as a versioned document, rehearse it against a real subscriber, publish it, and it runs for every person who trips the trigger, with nothing to deploy in your backend.',
  vignette: 'workflow',
  sections: [
    {
      title: 'A workflow is a document',
      text: 'A trigger, optional conditions and steps, written as JSON and versioned like code. Publish a version and it keeps running while you draft the next one, and the dashboard draws the same document as a flow you can read at a glance.',
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
      text: 'Wait a day, wait until nine in the subscriber’s own morning, or wait for the person to do something. A settle window even waits for a quiet moment: the app goes to the background, a clock starts, and the nudge lands when they have actually put the phone down.',
      code: `{ "name": "quiet", "waitFor": {
    "event": "$app.backgrounded",
    "settleFor": "5m",
    "resetOn": ["$app.opened"],
    "timeout": "1d"
} }`,
    },
    {
      title: 'Branches, loops and fetches',
      text: 'Branch on who the subscriber is, on what they did, on whether they opened the last notification, or on a live answer from your own API. Loop a reminder every three days until they come back, and call your backend from a step with a secret from the vault, so a workflow can be as smart as your product.',
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
      text: 'Rehearse any version against a real subscriber or a made-up one before it can reach anyone. Waits resolve instantly, sends render without sending and assumed replies stand in for your API, so you see exactly what a run would do.',
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
      text: 'Every change is a new version and the published one keeps running, so a draft can never break a live workflow.',
    },
    {
      title: 'One run per subscriber',
      text: 'Each subscriber’s runs are processed in order on their own isolated actor, so two steps never race each other.',
    },
    {
      title: 'Schedules too',
      text: 'Trigger on a cron or at a daily local time over a segment, for the weekly recap and the morning nudge.',
    },
    {
      title: 'Cancel rules',
      text: 'Name the events that end a run, such as a purchase, and the reminder stops the moment it is no longer needed.',
    },
    {
      title: 'Local notifications',
      text: 'A send can fire on the device as a local notification at the exact moment, even with no connection.',
    },
    {
      title: 'Full run history',
      text: 'Every step, wait and send is on the subscriber’s timeline, so you can see why someone got a message.',
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
