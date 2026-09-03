import { site } from './site';

export const SEND_CURL = `curl https://api.buzzkit.dev/v1/messages \\
  -H "Authorization: Bearer bk_live_…" \\
  -d '{
    "to": "user_42",
    "title": "Leg day",
    "body": "Let’s go. 6:00 with Maya."
  }'`;

export const SEND_REQUEST = `POST /v1/messages
{
  "to": "user_42",
  "topic": "gym-reminders",
  "title": "Leg day",
  "body": "Let’s go. 6:00 with Maya.",
  "deepLink": "app://workouts/legs"
}`;

export const SWIFT = `BuzzKit.configure(apiKey: "bk_pk_live_…")
BuzzKit.identify("user_42")
try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed")`;

export const SWIFT_GUIDE = `// Configure once at launch with the client key
BuzzKit.configure(apiKey: "bk_pk_live_…")

// Tell BuzzKit who this device belongs to
BuzzKit.identify("user_42")

// Ask for permission and register the device token
try await BuzzKit.registerForPush()

// Track what they do. Segments and workflows react to it
BuzzKit.track("workout.completed")`;

export const SELF_HOST = `git clone ${site.githubUrl}
cd buzzkit && bun install
bun db:up && bun dev`;
