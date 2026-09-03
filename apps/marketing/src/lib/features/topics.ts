import type { FeaturePage } from './index';

export const topics: FeaturePage = {
  slug: 'topics',
  name: 'Topics & Preferences',
  icon: 'IconTagFilled',
  group: 'Platform',
  summary: 'Named notification categories with per-topic, per-channel choices for every subscriber.',
  blurb: 'A settings screen with no backend',
  title: 'A settings screen with no backend code.',
  continuation: 'Per topic, per channel, resolved for you.',
  intro:
    'Topics are the named categories your notifications belong to: workout reminders, progress updates, tips and offers. Each subscriber chooses per topic and per channel, and every send to a topic filters to the people who said yes.',
  vignette: 'preferences',
  sections: [
    {
      title: 'Defaults with overrides',
      text: 'A topic carries a baseline choice, optional per-channel defaults and a category heading. Resolution is explicit choice first, then the channel default, then the topic default.',
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
      text: 'A GET on the client preferences endpoint returns the topic catalog with the resolved state per channel and its category, and a PATCH saves a choice. The iOS SDK wraps both.',
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
      text: 'Sending targets a topic and a channel, and BuzzKit filters to subscribers whose preference for that pair is opted in. A muted device, a topic turned off or a channel switched off all stop a delivery before it is queued.',
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
      text: 'Only changes are stored, so defaults keep applying to everyone else.',
    },
    { title: 'Categories', text: 'Group topics under headings for the settings screen.' },
    {
      title: 'Server or client',
      text: 'Read and write preferences from your backend or from the app.',
    },
    {
      title: 'Identity verification',
      text: 'A hash from your backend proves which user a request speaks for.',
    },
    {
      title: 'Kept through changes',
      text: 'Narrowing a topic’s channels keeps the stored choices.',
    },
    {
      title: 'On the timeline',
      text: 'Every change writes a preferences event to the subscriber’s stream.',
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
