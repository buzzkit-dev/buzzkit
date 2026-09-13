# iOS SDK

The Swift package at `https://github.com/buzzkit-dev/buzzkit-ios`. It identifies the user, registers the device for push, tracks events durably on disk, renders the notification settings screen, routes deep links and named actions, keeps Live Activity tokens registered, and schedules workflow-driven local notifications. Messages, segments, workflows and topics stay in the dashboard and the API; the SDK keeps the device, the user and their preferences in sync with them.

Docs: `https://docs.buzzkit.dev/sdks/ios/overview` and the pages `push`, `identity`, `events`, `deep-links`, `preferences`, `live-activities`, `local-notifications` (append `.md` for markdown).

```swift
import BuzzKit

BuzzKit.configure(apiKey: "bk_pk_…")
BuzzKit.identify("user_42", email: user.email, identityHash: session.identityHash, attributes: ["plan": "trial"])
let granted = try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed", data: ["duration": 42])
```

## Install

Xcode → File → Add Package Dependencies, or in `Package.swift`:

```swift
.package(url: "https://github.com/buzzkit-dev/buzzkit-ios", from: "1.0.0")
```

| Product | Add to | What it does |
| --- | --- | --- |
| `BuzzKit` | The app target | Identity, events, push, preferences, deep links, Live Activities |
| `BuzzKitUI` | The app target | `BuzzKitPreferencesView`, the drop-in notification settings screen |
| `BuzzKitNotificationServiceExtension` | A notification service extension target | Rich media attachments, action buttons and delivered receipts |

iOS 15 or Mac Catalyst 15, Swift 6 toolchain under strict concurrency.

## Xcode capabilities

A package cannot add these; set them on the app target once.

| Setting | Needed for |
| --- | --- |
| Push Notifications capability | Everything |
| Background Modes → Remote notifications | Silent pushes and workflow-scheduled local notifications |
| An app group on the app and the extension | Delivered receipts that survive the extension |
| A Notification Service Extension target | Rich media, action buttons and delivered receipts |
| `NSSupportsLiveActivities` in Info.plist | Live Activities (`NSSupportsLiveActivitiesFrequentUpdates` for many updates an hour) |

## Configure

Call once, as early in launch as possible (`App.init` or `application(_:didFinishLaunchingWithOptions:)`). A second call logs a warning and keeps the first. `BuzzKit.isConfigured` reports it; every other call logs and does nothing until it has run.

```swift
BuzzKit.configure(with: BuzzKit.Configuration(
    apiKey: "bk_pk_…",
    logLevel: .info,
    appGroup: "group.com.example.gym"
))
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `apiKey` | `String` | required | The client key from the dashboard. |
| `apiURL` | `URL` | `https://api.buzzkit.dev` | The API origin. Point it at a self-hosted deployment. |
| `logLevel` | `BuzzKitLogLevel` | `.warn` | System log verbosity. |
| `foregroundPresentation` | `ForegroundPresentation` | `.banner` | How a push arriving while the app is open is shown; `.hidden` shows nothing. |
| `automaticSessionTracking` | `Bool` | `true` | Emits `$app.opened`, `$app.backgrounded`, `$session.ended`. |
| `appGroup` | `String?` | `nil` | The app group shared with the notification service extension. Also writes the key and API URL into the shared container so the extension needs no configuration. |
| `pushEnvironment` | `BuzzKit.PushEnvironment?` | `nil` | Forces `.sandbox` or `.production` instead of reading the provisioning profile. |
| `automaticPushHandling` | `Bool` | `true` | Receives the app delegate's three push callbacks for you. |

The client key (`bk_pk_`) is the only key meant to ship in a binary: it reaches `/v1/client/*` and nothing else. It cannot send, read other subscribers or reach other tenants.

## Identity

- **Anonymous by default.** From first launch the SDK mints `anon_` + 21 random characters and stores it. Events queue and send, sessions are tracked, and the push subscription registers under that id, so nothing needs a login.
- **Identify** at login and on every launch where the user is already signed in. It returns immediately and works on a serial queue.

```swift
BuzzKit.identify(
    "user_42",
    email: user.email,
    identityHash: session.buzzkitHash,
    attributes: ["plan": "trial", "signupAt": "2026-09-01T10:00:00Z", "locale": "de-DE"],
    subscribe: [:]
)
```

  Signature: `identify(_ externalId: String, email: String? = nil, identityHash: String? = nil, attributes: [String: JSONValue]? = nil, subscribe: [Channel: Bool] = [:])`. When the device was anonymous the anonymous subscriber is merged into this id (subscriptions, preferences, attributes, the whole timeline, the anonymous id kept as an alias). Then the subscriber is upserted with the id, email, attributes and device context, queued events flush and the push subscription re-registers under the new id. Calling it again with the same id is a no-op. The email is saved as the `email` attribute either way and subscribed once an email provider is connected; `subscribe: [.email: false]` keeps it on file without subscribing.
- **Attributes**: `BuzzKit.setAttributes(["plan": "pro", "streak": 4])` merges into the subscriber (the client API merges, so nothing the backend set is wiped). `JSONValue` is expressible by string, integer, float, boolean, nil, array and dictionary literals.
- **System attributes** the SDK stamps on its own: `$platform`, `$pushPermission`, `$appVersion`, `$appBuild`, `$sdkVersion`, `$osVersion`, `$deviceModel`, plus `$country`, `$city`, `$region`, `$timezone`, `$language` from the edge.
- **Logout**: `BuzzKit.logout()` deletes this device's subscription for the user, clears the id and hash, mints a fresh anonymous id and re-registers under it.
- **Verification**: pass `identityHash` (HMAC-SHA256 of the external id under the tenant's identity secret, hex, minted on the backend) and the subscriber is marked verified; the SDK attaches it to every call until logout. Turn on required verification in the tenant once every client sends it.

## Push

```swift
let granted = try await BuzzKit.registerForPush()
```

One call runs the permission prompt, `registerForRemoteNotifications()`, the wait for the token, environment detection and registration against the API. The return value is whether permission was granted; the token is registered either way, so a person who said no is still reachable by silent pushes and is there when they change their mind. It throws `BuzzKitError.permissionDenied` when iOS refuses to present the prompt and `BuzzKitError.network` when permission was granted but registration failed. `@discardableResult`.

- Ask where asking makes sense: during onboarding or right before the first thing worth being notified about, not blindly on first launch.
- `registerForPush(provisional: true)` delivers quietly with no prompt (Notification Center only, Keep / Turn Off buttons); call the plain form later to ask properly.
- `BuzzKit.notificationPermission()` returns the `UNAuthorizationStatus`. The SDK checks it on every launch, emits `$permission.changed` with `status` and syncs `$pushPermission` on the subscriber.
- You never call `registerForPush` again: on every launch the SDK re-requests the token and re-registers if it changed, so a rotated token never orphans a device.
- Environment: `aps-environment` in the profile; `development` registers `sandbox`, anything else `production`; simulators are sandbox. Override with `pushEnvironment`.
- Foreground: the SDK installs itself as the `UNUserNotificationCenter` delegate and forwards to any delegate the app installed first. Decide per notification with `BuzzKitDelegate.buzzKit(_:willPresent:)` returning `UNNotificationPresentationOptions?` (`nil` falls back to the configured default).
- Badge: comes from the message's `badge` field; the SDK never sets or clears it.
- Manual forwarding with `automaticPushHandling: false`: `BuzzKit.didRegisterForRemoteNotifications(deviceToken:)`, `BuzzKit.didFailToRegisterForRemoteNotifications(error:)`, and `await BuzzKit.didReceiveRemoteNotification(userInfo:).fetchResult` from `application(_:didReceiveRemoteNotification:)`. The third one matters: silent pushes are how workflows schedule and cancel local notifications.

### The notification service extension

Gives three things the app process cannot: images attached to the notification, action buttons registered before display, and a `$notification.delivered` receipt for every push that arrived.

```swift
import BuzzKitNotificationServiceExtension

final class NotificationService: BuzzKitNotificationService {
    override var buzzKitAppGroup: String? { "group.com.example.gym" }
}
```

Add a Notification Service Extension target, link `BuzzKitNotificationServiceExtension`, replace the generated class with the above, and add the same app group to the app target and the extension (and pass it as `appGroup` in the configuration). Without an app group, receipts are best effort; with it, a receipt that cannot reach the API in the extension's few seconds is written to the shared container and delivered by the app on its next launch. BuzzKit sets `mutable-content` on every message carrying an image or buttons.

`PushPayload(userInfo:)` parses any notification's `userInfo` into the message id, deep link, action, image and your `data` (delivered at the payload root exactly as sent); it returns `nil` for notifications that are not BuzzKit's.

## Events

```swift
BuzzKit.track("cart.checked_out", data: ["total": 49.9, "currency": "EUR", "items": ["mat", "strap"]])
```

`track(_ name: String, data: [String: JSONValue]? = nil)` returns immediately and writes to SQLite on a background task, so it is safe in view bodies and button actions. Names are non-empty, at most 128 bytes, never `$`-prefixed; an invalid name is logged and dropped.

- The queue lives on disk (in the app group container when configured), flushes in batches of 100, and deletes a batch only after the server acknowledged it. Flushes run three seconds after a track, five seconds after `configure`, when the device comes back online, on background, on a new identity, and when a notification is opened or dismissed. `await BuzzKit.pendingEventCount()` and `await BuzzKit.flushEvents()` take over when needed.
- A batch the server rejects with an API error is dropped (retrying a malformed batch would block the queue); a network failure keeps it queued, up to 20 attempts.
- Sessions: foreground starts a session (`$app.opened`), background emits `$app.backgrounded`, returning within 30 seconds resumes the same session, otherwise `$session.ended` carries `durationSec`.

Reserved events the SDK emits, all usable in segments and workflows:

| Event | When | Data |
| --- | --- | --- |
| `$app.installed` | First launch after install | `version`, `build` |
| `$app.updated` | First launch after the version or build changed | `fromVersion`, `toVersion`, `fromBuild`, `toBuild` |
| `$app.opened` / `$app.backgrounded` / `$session.ended` | Session lifecycle | `durationSec` on ended |
| `$notification.delivered` | The push arrived (service extension) | `messageId` |
| `$notification.opened` | The person opened it | `messageId`, `action`, `input`, `deepLink` |
| `$notification.dismissed` | Dismissed a notification carrying buttons | `messageId` |
| `$local.scheduled` | A workflow's silent push scheduled a local notification | `localId`, `messageId` |
| `$deeplink.opened` | A notification's link was routed | `url`, `via` (`delegate` / `handler` / `system`), `messageId` |
| `$action.triggered` | A notification named a remote action | `name`, `handled`, `messageId` |
| `$permission.changed` | The permission changed | `status` |
| `$activity.started` / `ended` / `dismissed` / `stale` | Live Activity lifecycle | `activityId`, `attributesType` |

## Deep links and actions

Register once at launch, after `configure`:

```swift
BuzzKit.onDeepLink { url in router.open(url) }

BuzzKit.actions.register("show_offer") { action in
    guard case .string(let offerId)? = action.data["offerId"] else { return }
    paywall.present(offerId: offerId)
}
BuzzKit.actions.register("start_workout") { _ in router.open(.workout) }
```

- A message's `deepLink` is routed through `BuzzKitDelegate.buzzKit(_:openDeepLink:)` (return `true` to consume), then the `onDeepLink` closure, then `UIApplication.open`. Every routed link is tracked as `$deeplink.opened` with `via`.
- A message's `action: { name, data }` runs the registered handler by name with `action.data` as `[String: JSONValue]`; `BuzzKit.actions.unregister(_:)` removes one. An unregistered name is tracked as `$action.triggered` with `handled: false` and logged. Both the action and the deep link run when a payload carries both, action first.
- Ship a small set of capable handlers (open a paywall, a screen, a purchase flow) and let the dashboard decide which notification calls which with what data. That is what lets a campaign's destination change without a release.
- Action buttons come from the message's `actions` array (`id`, `title`, `destructive`, `foreground`, `input`, `placeholder`) and need the service extension. The tapped button arrives through `buzzKit(_:didOpen:actionIdentifier:)`; `actionIdentifier` is the button's `id`, `nil` for the body. Typed input reaches the `$notification.opened` event's `input`, not the delegate.

## Preferences

```swift
import BuzzKitUI

NavigationStack {
    BuzzKitPreferencesView()
        .navigationTitle("Notifications")
}
```

A `List` and nothing else: present it in a page, sheet or tab. It loads on appearance, supports pull to refresh, saves optimistically and reloads on failure. Topics arrive resolved from the dashboard, grouped by `category`; a topic offered on several channels gets a menu (Off, then a checkable entry per channel). Identify before showing it, so it works even when push permission was denied.

- Custom rows keep the loading and saving: `BuzzKitPreferencesView { topic, isOptedIn in … }` hands a `Binding<Bool>` for the whole topic.
- Custom data source: `BuzzKitPreferencesView(load:save:)` (and `saveChannel:`).
- Custom screen: `try await BuzzKit.preferences.all()`, `try await BuzzKit.preferences.set("gym-reminders", enabled: false)`, `set("digest", channel: .push, enabled: true)`, each returning the full `[BuzzKit.Topic]`. `BuzzKit.TopicGroup.group(topics)` sections them like the drop-in screen. A `Topic` carries `slug`, `name`, `description`, `category`, `channels: [Channel: ChannelPreference]` (`isOptedIn`, `isDefault`), `isOptedIn` and `settingAllChannels(optedIn:)`.

## Live Activities

Share the `ActivityAttributes` type between the app and the widget extension. Its type name (as `String(describing:)`) is the `attributesType` the backend sends.

```swift
BuzzKit.activities.observe(MatchAttributes.self)
let activity = try BuzzKit.activities.start(MatchAttributes(matchId: "m_1"), state: .init(score: 0))
await BuzzKit.activities.end(activity)
```

- `observe(_:)` once at every launch per attributes type (iOS 16.2+): registers every activity's push token and re-registers on rotation, tracks the `$activity.*` events, tells the server about ended activities, and on iOS 17.2+ registers the push-to-start token so the backend can start an activity while the app is not running. Call it at every launch, not only the one that started an activity.
- `start(_:state:staleDate:relevanceScore:)` requests through ActivityKit with `pushType: .token` and monitors it; it is not `async` and throws what `Activity.request` throws. End through BuzzKit (`end(activity)` or `end(id:)`) so the server row is cleared.
- The backend drives them with `POST /v1/live-activities/send` (`to`, `event: start | update | end`, `activityId` or `attributesType`, `contentState` (required), `attributes` for `start`, `alert { title, body, sound }` (required for `start`), `staleDate`, `dismissalDate`, `priority`, `timestamp`); the reply carries one result per token. Renaming the attributes struct changes the identifier, so ship the new name from the backend with the rename.
- Low-level surface when needed: `register(id:token:attributesType:)`, `registerPushToStartToken(_:attributesType:)`, `monitor(_:)`, `end(id:)`.

## Local notifications

A workflow `send` step with `deliver: "local"` hands the notification to the device in a silent push when the wait begins; the device schedules a `UNCalendarNotificationTrigger` at the wall-clock moment, tracks `$local.scheduled` at once, cancels it on the workflow's `cancelOn` events (offline included), and removes it on a `bk.cancel` push when the run is canceled centrally. If no device acknowledged by the time the wait ends, the run sends the same message as an ordinary push. The app needs nothing beyond `configure`, the Remote notifications background mode, and permission; with `automaticPushHandling: false`, forward `didReceiveRemoteNotification` as above.

## Self-hosting

Point `apiURL` at the deployment. Everything else, including the client key format, is identical.
