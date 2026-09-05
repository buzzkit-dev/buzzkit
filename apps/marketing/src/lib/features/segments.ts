import type { FeaturePage } from './index';

export const segments: FeaturePage = {
  slug: 'segments',
  name: 'Segments',
  icon: 'IconTargetFilled',
  group: 'Automate',
  summary:
    'Audiences described by who a subscriber is and what they did, evaluated live the moment you send.',
  blurb: 'Expressions evaluated at send time',
  title: 'Who they are and what they did.',
  continuation: 'Evaluated the moment you send.',
  intro:
    'A segment describes an audience: attributes, events and how often, last activity, which channels can reach them. It is never a frozen list. Every send reads the audience as it stands right now, so nobody who churned yesterday gets today’s message.',
  vignette: 'segment',
  sections: [
    {
      title: 'One grammar for every condition',
      text: 'Combine conditions in all, any and not groups. Compare attributes, count events inside a window or require that one never happened, and filter on last activity and reachable channels. One grammar answers the whole audience question.',
      code: `{
  "all": [
    { "ref": "attributes.plan", "eq": "pro" },
    {
      "count": "workout.completed",
      "within": "7d",
      "gte": 3
    },
    { "lastSeen": { "within": "30d" } },
    { "channel": "push" }
  ]
}`,
    },
    {
      title: 'Preview before you save',
      text: 'See the audience before you commit to it. The preview answers with how many subscribers match right now and a sample of who they are, and the dashboard builder updates the count as you type.',
      code: `POST /v1/segments/preview
{
  "expression": {
    "count": "workout.completed",
    "within": "7d",
    "gte": 3
  }
}

{ "count": 1284, "sample": [ … ] }`,
    },
    {
      title: 'Versioned, and pinned on send',
      text: 'Editing a segment creates a new version, and every message remembers which one it used. An edit never changes who an in-flight message reaches, and you can always explain why someone was in the audience.',
      code: `POST /v1/messages
{
  "segment": "active-pro",
  "title": "Three evening slots opened up",
  "body": "Book before Maya’s class fills."
}

// The message remembers exactly who it went to
{
  "id": "msg_7g2h",
  "targets": {
    "segment": "active-pro",
    "segmentVersion": 4
  },
  "counts": { "total": 1284, "sent": 1279 }
}`,
    },
  ],
  capabilities: [
    {
      title: 'Event windows',
      text: 'Count an event in the last minutes, hours or days, or target the people who never did it.',
    },
    {
      title: 'System attributes',
      text: 'Country, timezone, language, app version and push permission arrive from the device with no work on your side.',
    },
    {
      title: 'Fresh within seconds',
      text: 'Membership is one query over the event stream, as current as the last event that came in.',
    },
    {
      title: 'Inline on a send',
      text: 'Write the expression on the message itself for a one-off audience.',
    },
    {
      title: 'Shared with workflows',
      text: 'Triggers, branches and schedules speak the same grammar, so an audience is defined once.',
    },
    {
      title: 'Typed in the SDK',
      text: 'Types and lint ship in the buzzkit package, so a broken expression fails on your machine and not in production.',
    },
  ],
  faq: [
    {
      question: 'How fresh is a segment when I send to it?',
      answer:
        'Membership is evaluated at send time against the event stream, usually within seconds of the last event. Nothing is cached as a list.',
    },
    {
      question: 'Can a segment filter on event data, not just the event name?',
      answer:
        'Today a segment counts events by name inside a window. Event data is stored as a queryable column, and predicates on it are the next step of the grammar.',
    },
    {
      question: 'How large can an expression be?',
      answer:
        'Groups nest up to eight levels deep with at most fifty conditions, and an in condition takes up to a hundred values. The lint names the node when a limit is crossed.',
    },
  ],
  related: ['sending', 'workflows', 'topics'],
};
