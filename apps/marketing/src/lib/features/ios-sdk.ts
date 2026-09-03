import type { FeaturePage } from './index';

export const iosSdk: FeaturePage = {
  slug: 'ios-sdk',
  name: 'iOS SDK',
  icon: 'IconAppleFilled',
  group: 'SDKs',
  summary:
    'Registration, identity, events, action buttons and a notification settings screen in one Swift package.',
  blurb: 'Identity, events and push in Swift',
  title: 'Drop the SDK in.',
  continuation: 'The rest is wired.',
  intro:
    'The iOS SDK is the only thing your app needs for notifications. Configure it with a client key, identify the user by your own id, register for push, and track what they do.',
  vignette: 'ios',
  sections: [
    {
      title: 'Four lines to a registered device',
      text: 'Configure once with a client key, identify the signed-in user, register for push and track events. The SDK stamps device model, app version and push permission on the subscriber as system attributes.',
      code: `BuzzKit.configure(apiKey: "bk_pk_live_…")
BuzzKit.identify("user_42")
try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed", data: ["duration": 42])`,
    },
    {
      title: 'Events that survive being offline',
      text: 'Every tracked event gets a unique id and its original timestamp, waits in a local queue while offline, and drains in batches of up to 100. The API dedupes on the id, and timestamps up to seven days old are accepted.',
      code: `// Queued on the device with its own id and time,
// sent in batches once the network is back
BuzzKit.track("workout.completed", data: ["duration": 42])
BuzzKit.track("class.booked", data: ["class": "hiit-18"])

// Opens, backgrounds and notification taps
// are tracked for you`,
    },
    {
      title: 'Actions, deep links and settings for free',
      text: 'Action buttons defined on a send are registered by the SDK, and the opened receipt carries the tapped button and any typed text. A deep link opens through your handler, and the preferences endpoint is the whole settings screen.',
      code: `BuzzKit.onDeepLink { url in
    router.open(url)
}`,
    },
  ],
  capabilities: [
    {
      title: 'Client keys',
      text: 'A key that only reaches the client API, safe inside the binary.',
    },
    {
      title: 'System attributes',
      text: 'Country, timezone, language, app version and permission on identify.',
    },
    {
      title: 'Sandbox aware',
      text: 'Debug builds register with the sandbox credential.',
    },
    { title: 'Live Activities', text: 'Activity and push-to-start tokens registered for you.' },
    {
      title: 'Local notifications',
      text: 'Workflow sends can fire as local notifications, offline included.',
    },
    { title: 'Preferences screen', text: 'The topic list per channel, grouped by category.' },
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
        'Client keys only reach the client API and carry no scopes. For production, have your backend compute an identity hash per user so a stolen key cannot claim another id.',
    },
    {
      question: 'Does the SDK work with SwiftUI and UIKit?',
      answer:
        'Yes. It is a Swift package with static entry points that fits either lifecycle, and it forwards the delegate callbacks for tokens and remote notifications.',
    },
  ],
  related: ['live-activities', 'topics', 'sending'],
};
