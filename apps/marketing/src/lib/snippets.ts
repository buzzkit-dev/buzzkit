import { site } from './site';

export const SEND_CURL = `curl https://api.buzzkit.dev/v1/messages \\
  -H "Authorization: Bearer bk_live_…" \\
  -d '{
    "to": "user_42",
    "title": "Leg day",
    "body": "Let’s go. 6:00 with Maya."
  }'`;

export const BUZZ_NOTIFY = `curl -X POST https://ping.buzzkit.dev/YOUR_KEY \\
  -d '{"title": "Tests passed", "body": "142 passed in 38s"}'`;

export const BUZZ_SESSION = `POST https://ping.buzzkit.dev/YOUR_KEY
{
  "session": "buzzkit/ts-sdk",
  "title": "Running migrations",
  "body": "3 of 7 applied",
  "status": "working",
  "progress": 0.43,
  "agent": "claude-code",
  "project": "buzzkit"
}`;

export const BUZZ_MCP = `claude mcp add --transport http buzz https://ping.buzzkit.dev/YOUR_KEY/mcp`;

export const BUZZ_CLAIM = `curl -X POST https://ping.buzzkit.dev/pair/claim \\
  -d '{"code": "482913"}'

{ "endpoint": "https://ping.buzzkit.dev/bz_…", "mcp": "https://ping.buzzkit.dev/bz_…/mcp" }`;

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
