import type { FeaturePage } from './index';

export const iosSdk: FeaturePage = {
  slug: 'ios-sdk',
  name: 'iOS SDK',
  icon: 'IconAppleFilled',
  group: 'SDKs',
  summary: 'Push in a few lines of Swift. Tokens, permission and events are handled by the SDK.',
  blurb: 'A few lines to push',
  title: 'Push in a few lines of Swift.',
  continuation: 'No token management.',
  intro:
    'Device tokens, permission, sandbox builds and the event queue are handled by the SDK, so none of it ends up in your app code.',
  vignette: 'ios',
  sections: [
    {
      title: 'A few lines to a registered device.',
      text: 'Configure the SDK, say who the user is and ask for permission. Tokens and device facts are handled from then on.',
      code: `BuzzKit.configure(apiKey: "bk_pk_live_…")
BuzzKit.identify("user_42")
try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed", data: ["duration": 42])`,
    },
    {
      title: 'Events that wait for a connection.',
      text: 'Track from anywhere in the app. They queue on the device and send when the network is back.',
      code: `// Queued on the device with its own id and time,
// sent in batches once the network is back
BuzzKit.track("workout.completed", data: ["duration": 42])
BuzzKit.track("class.booked", data: ["class": "hiit-18"])

// Opens, backgrounds and notification taps
// are tracked for you`,
    },
    {
      title: 'Actions, deep links and settings.',
      text: 'Buttons you define on a send appear on the device, deep links open where you send them, and the preferences screen is one call.',
      code: `// An action button you named on the send
BuzzKit.actions.register("snooze") { action in
    reminders.snooze(action.data["workoutId"])
}

// The deep link a notification carries
BuzzKit.onDeepLink { url in
    router.open(url)
}

// The settings screen, grouped by category
let topics = try await BuzzKit.preferences.all()
try await BuzzKit.preferences.set("running-reminders", enabled: false)`,
    },
  ],
  capabilities: [
    {
      title: 'Delivered and opened',
      text: 'The SDK reports when a push lands and when it is opened.',
    },
    {
      title: 'Device facts',
      text: 'Country, time zone, language, app version and permission arrive when you identify someone.',
    },
    {
      title: 'Sandbox aware',
      text: 'A debug build registers against the sandbox credential without being told.',
    },
    {
      title: 'Live Activities',
      text: 'Activity and push-to-start tokens are registered for you.',
    },
    {
      title: 'Local notifications',
      text: 'A workflow can fire a notification on the device itself, even offline.',
    },
    {
      title: 'Preferences screen',
      text: 'The topic list comes back grouped by category, ready to render.',
    },
  ],
  faq: [
    {
      question: 'Is it safe to put the key in the app?',
      answer:
        'Yes. A client key reaches nothing but the client API, and in production your backend signs a hash that proves who the user is.',
    },
    {
      question: 'Does it work with SwiftUI and UIKit?',
      answer: 'Yes. It is a Swift package that fits either lifecycle.',
    },
  ],
  related: ['live-activities', 'topics', 'sending'],
};
