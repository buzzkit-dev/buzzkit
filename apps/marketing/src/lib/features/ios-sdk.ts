import type { FeaturePage } from './index';

export const iosSdk: FeaturePage = {
  slug: 'ios-sdk',
  name: 'iOS SDK',
  icon: 'IconAppleFilled',
  group: 'SDKs',
  summary:
    'Registration, identity, events, action buttons, Live Activities and a settings screen in one Swift package.',
  blurb: 'Identity, events and push in Swift',
  title: 'Drop the SDK in.',
  continuation: 'The rest is wired.',
  intro:
    'Four lines at launch and your app has push. Configure with a client key, identify the user by your own id, register for push and track what they do. Tokens, permission state, offline queues and receipts are handled for you from then on.',
  vignette: 'ios',
  sections: [
    {
      title: 'Four lines to a registered device',
      text: 'Configure, identify, register, track. The SDK keeps the device token current, stamps model, app version, locale, timezone and push permission on the subscriber, and reports delivered and opened receipts for every push, so targeting and reporting work from the first launch.',
      code: `BuzzKit.configure(apiKey: "bk_pk_live_…")
BuzzKit.identify("user_42")
try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed", data: ["duration": 42])`,
    },
    {
      title: 'Events that survive being offline',
      text: 'Track from anywhere in the app and never think about the network. Events queue on the device with their own id and timestamp, drain in batches once a connection returns, and the API deduplicates them, so a subway ride never costs you a data point.',
      code: `// Queued on the device with its own id and time,
// sent in batches once the network is back
BuzzKit.track("workout.completed", data: ["duration": 42])
BuzzKit.track("class.booked", data: ["class": "hiit-18"])

// Opens, backgrounds and notification taps
// are tracked for you`,
    },
    {
      title: 'Actions, deep links and settings built in',
      text: 'Action buttons you define on a send show up on the device with no extra code, and a tap reports back which one was pressed. Deep links open through your handler, and the notification settings screen is one call to the preferences endpoint.',
      code: `BuzzKit.onDeepLink { url in
    router.open(url)
}`,
    },
  ],
  capabilities: [
    {
      title: 'Delivered and opened receipts',
      text: 'A service extension reports the moment a push lands, and the app reports opens, taps and typed replies.',
    },
    {
      title: 'System attributes',
      text: 'Country, timezone, language, app version and permission arrive on identify.',
    },
    {
      title: 'Sandbox aware',
      text: 'Debug builds register against the sandbox credential on their own.',
    },
    { title: 'Live Activities', text: 'Activity and push-to-start tokens registered for you.' },
    {
      title: 'Local notifications',
      text: 'Workflow sends can fire as local notifications, even offline.',
    },
    {
      title: 'Preferences screen',
      text: 'The topic list per channel, grouped by category, ready to render.',
    },
  ],
  faq: [
    {
      question: 'How do I add push notifications to an iOS app?',
      answer:
        'Add the Swift package, call configure with a client key, identify the user and register for push. Tokens, permission state and events are handled by the SDK.',
    },
    {
      question: 'Is it safe to ship the API key in the app?',
      answer:
        'Client keys reach the client API and nothing else, and carry no scopes. For production, have your backend compute an identity hash per user so a stolen key cannot claim another id.',
    },
    {
      question: 'Does the SDK work with SwiftUI and UIKit?',
      answer:
        'Yes. It is a Swift package with static entry points that fits either lifecycle, and it forwards the delegate callbacks for tokens and remote notifications.',
    },
  ],
  related: ['live-activities', 'topics', 'sending'],
};
