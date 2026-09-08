import type { FeaturePage } from './index';

export const topics: FeaturePage = {
  slug: 'topics',
  name: 'Topics & Preferences',
  icon: 'IconTagFilled',
  group: 'Platform',
  summary: 'Let users choose what they receive. Preferences apply to every send, automatically.',
  blurb: 'Users choose what they get',
  title: 'Let users choose what they receive.',
  continuation: 'Applied to every send, automatically.',
  intro:
    'A notification settings screen with no backend behind it, and no opt-out list to check before you send.',
  vignette: 'preferences',
  sections: [
    {
      title: 'Defaults, with room to opt out.',
      text: 'Start people on what makes sense. Their own choice always wins.',
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
      title: 'A settings screen from the API.',
      text: 'One call reads the topics, another saves a choice, and the SDK renders the whole screen for you.',
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
      title: 'Every send respects the choice.',
      text: 'Send to a topic and only the people who said yes get it.',
      code: `POST /v1/messages
{
  "topic": "running-reminders",
  "channel": "push",
  "title": "Tempo run tonight",
  "body": "Track is booked from 19:00."
}

{ "id": "msg_4k1d", "counts": { "total": 812 } }`,
    },
  ],
  capabilities: [
    {
      title: 'Defaults you can change later',
      text: 'A new default reaches everyone who never chose for themselves.',
    },
    {
      title: 'Categories',
      text: 'Group topics under headings and the settings screen organizes itself.',
    },
    {
      title: 'Server or client',
      text: 'You can read and write preferences from your backend or straight from the app.',
    },
    {
      title: 'Identity verification',
      text: 'A hash from your backend proves the request really is for that person.',
    },
    {
      title: 'Kept through changes',
      text: 'A choice someone already made survives even if you narrow a topic’s channels.',
    },
    {
      title: 'Opting out is an event',
      text: 'Segments and workflows can react when someone turns something off.',
    },
  ],
  faq: [
    {
      question: 'Do I need a settings screen to use topics?',
      answer:
        'No. A topic is useful as a category on a send even if your app never shows one, and you can add the screen later.',
    },
    {
      question: 'Can someone turn off one channel and keep another?',
      answer: 'Yes. Someone can keep the push and drop the email for the same topic.',
    },
  ],
  related: ['sending', 'segments', 'ios-sdk'],
};
