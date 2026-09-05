import type { FeaturePage } from './index';

export const topics: FeaturePage = {
  slug: 'topics',
  name: 'Topics & Preferences',
  icon: 'IconTagFilled',
  group: 'Platform',
  summary:
    'Notification categories with per-topic, per-channel choices, and a settings screen your app gets with no backend code.',
  blurb: 'A settings screen with no backend',
  title: 'A settings screen with no backend code.',
  continuation: 'Per topic, per channel, resolved for you.',
  intro:
    'Topics are the categories your notifications belong to: workout reminders, progress updates, tips and offers. Subscribers choose per topic and per channel, the settings screen comes straight from the API, and every send to a topic reaches the people who said yes.',
  vignette: 'preferences',
  sections: [
    {
      title: 'Defaults with overrides',
      text: 'Decide what people get before they ever open settings. A topic carries a default choice, per-channel defaults and a category heading, and a subscriber’s own choice always wins over both.',
      code: `POST /v1/topics
{
  "slug": "running-reminders",
  "name": "Running reminders",
  "category": "Training",
  "channels": ["push", "email"],
  "defaultOptedIn": true,
  "channelDefaults": { "email": false },
  "dailyCap": 3
}`,
    },
    {
      title: 'The settings screen is two requests',
      text: 'One GET returns the whole catalog with the resolved state per channel, grouped by category, ready to render as a list of switches. One PATCH saves a choice. The iOS SDK wraps both, so the screen is an afternoon and not a sprint.',
      code: `PATCH /v1/client/preferences
BuzzKit-Subscriber: user_42
{
  "preferences": {
    "marketing": false,
    "running-reminders": { "email": false }
  }
}`,
    },
    {
      title: 'Every send respects the choice',
      text: 'Send to a topic and BuzzKit filters to the people opted in on that channel. A muted device, a topic turned off or a channel switched off stops a delivery before it is queued, so a preference is a promise and not a suggestion.',
      code: `POST /v1/messages
{
  "topic": "running-reminders",
  "channel": "push",
  "title": "Tempo run tonight",
  "body": "Track is booked from 19:00."
}

// Only subscribers opted into running-reminders
// on push are reachable
{ "id": "msg_4k1d", "counts": { "total": 812 } }`,
    },
  ],
  capabilities: [
    {
      title: 'Deviations only',
      text: 'Only changes are stored, so a new default reaches everyone who never chose.',
    },
    {
      title: 'Categories',
      text: 'Group topics under headings and the settings screen organizes itself.',
    },
    {
      title: 'Server or client',
      text: 'Read and write preferences from your backend or straight from the app.',
    },
    {
      title: 'Identity verification',
      text: 'A hash from your backend proves which user a request speaks for, so nobody can change someone else’s settings.',
    },
    {
      title: 'Kept through changes',
      text: 'Narrow a topic’s channels and the choices people already made survive.',
    },
    {
      title: 'On the timeline',
      text: 'Every change is an event on the subscriber’s stream, so segments and workflows can react to it.',
    },
  ],
  faq: [
    {
      question: 'How do I let users choose which notifications they get?',
      answer:
        'Create a topic per category, then render the client preferences endpoint as a list of switches. The iOS SDK does this out of the box.',
    },
    {
      question: 'What happens when I change a topic’s default?',
      answer:
        'Subscribers who never chose follow the new default immediately. Subscribers who chose keep their choice.',
    },
    {
      question: 'Can a subscriber opt out of push but keep email for the same topic?',
      answer:
        'Yes. Preferences are per topic and per channel, so a subscriber can keep the email and turn off the push, or the other way around.',
    },
  ],
  related: ['sending', 'segments', 'ios-sdk'],
};
