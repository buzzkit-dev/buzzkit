import type { WorkflowSpec } from '@buzzkit/schema/workflows';

export interface SampleWorkflow {
  slug: string;
  name: string;
  description: string;
  version: number;
  live: number;
  spec: WorkflowSpec;
  counts: Record<string, number>;
}

export const trialNudge: SampleWorkflow = {
  slug: 'trial-nudge',
  name: 'Trial nudge',
  description: 'Once per subscriber, when trial.started fires.',
  version: 3,
  live: 18,
  spec: {
    trigger: { event: 'trial.started' },
    concurrency: 'one-per-subscriber',
    steps: [
      {
        name: 'opened-the-app-since',
        branch: [
          {
            name: 'yes',
            when: { occurred: '$app.opened', since: 'trigger' },
            steps: [
              { name: 'give-it-a-day', wait: '1d' },
              {
                name: 'a-quiet-moment',
                waitFor: {
                  event: '$app.backgrounded',
                  settleFor: '5m',
                  resetOn: ['$app.opened'],
                  timeout: '1d',
                },
              },
              {
                name: 'trial-ends-tomorrow',
                send: {
                  topic: 'gym-reminders',
                  title: 'Your trial ends tomorrow',
                  body: 'Keep the streak going with Pro.',
                  deepLink: 'app://upgrade',
                },
              },
            ],
          },
          {
            name: 'no',
            steps: [
              {
                name: 'first-class-waiting',
                send: {
                  topic: 'gym-reminders',
                  title: 'Your first class is waiting',
                  body: 'Pick a time. Maya saved you a spot.',
                  deepLink: 'app://classes',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  counts: { 'give-it-a-day': 6, 'a-quiet-moment': 12 },
};

const winBack: SampleWorkflow = {
  slug: 'win-back',
  name: 'Win-back',
  description: 'Daily at 10:00 in each subscriber’s time zone, for the inactive-30d segment.',
  version: 7,
  live: 241,
  spec: {
    trigger: { schedule: { daily: '10:00' }, timezone: 'subscriber', segment: 'inactive-30d' },
    concurrency: 'one-per-subscriber',
    cancelOn: [{ event: '$app.opened' }],
    steps: [
      {
        name: 'which-plan',
        branch: [
          {
            name: 'pro',
            when: { ref: 'subscriber.attributes.plan', eq: 'pro' },
            steps: [
              {
                name: 'we-miss-you',
                send: {
                  topic: 'gym-reminders',
                  title: 'We miss you at the gym',
                  body: 'Your Pro plan still has classes waiting.',
                  deepLink: 'app://classes',
                },
              },
            ],
          },
          {
            name: 'free',
            steps: [
              {
                name: 'personal-offer',
                fetch: {
                  method: 'POST',
                  url: 'https://api.orbit.app/offers',
                  body: { subscriber: '{{ subscriber.externalId }}' },
                  as: 'offer',
                  timeout: '5s',
                },
              },
              {
                name: 'remind',
                repeat: {
                  every: '3d',
                  max: 3,
                  until: { occurred: '$app.opened', since: 'trigger' },
                  steps: [
                    {
                      name: 'come-back-offer',
                      send: {
                        topic: 'gym-reminders',
                        title: 'A month of Pro, on us',
                        body: '{{ vars.offer.headline }}',
                        deepLink: 'app://offers/{{ vars.offer.id }}',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  },
  counts: { remind: 84, 'personal-offer': 3 },
};

const onboarding: SampleWorkflow = {
  slug: 'onboarding',
  name: 'Onboarding',
  description: 'Once per subscriber, when account.created fires.',
  version: 12,
  live: 57,
  spec: {
    trigger: { event: 'account.created' },
    concurrency: 'one-per-subscriber',
    steps: [
      { name: 'settle-in', wait: '1h' },
      {
        name: 'booked-a-class',
        branch: [
          {
            name: 'yes',
            when: { occurred: 'class.booked', since: 'trigger' },
            steps: [
              {
                name: 'see-you-there',
                send: {
                  topic: 'gym-reminders',
                  title: 'See you at your first class',
                  body: 'Arrive ten minutes early and say hi to Maya.',
                },
              },
            ],
          },
          {
            name: 'not-yet',
            steps: [
              {
                name: 'wait-for-a-booking',
                waitFor: { event: 'class.booked', timeout: '3d' },
              },
              {
                name: 'pick-a-class',
                send: {
                  topic: 'gym-reminders',
                  title: 'Pick your first class',
                  body: 'Beginner sessions run every evening this week.',
                  deepLink: 'app://classes',
                },
              },
            ],
          },
        ],
      },
      { name: 'one-week-in', wait: '7d' },
      {
        name: 'week-one-recap',
        send: {
          topic: 'progress-updates',
          title: 'Your first week',
          body: '{{ subscriber.attributes.workouts }} workouts. Keep going.',
          deepLink: 'app://progress',
        },
      },
    ],
  },
  counts: { 'settle-in': 9, 'wait-for-a-booking': 21, 'one-week-in': 27 },
};

export const sampleWorkflows: SampleWorkflow[] = [trialNudge, winBack, onboarding];
