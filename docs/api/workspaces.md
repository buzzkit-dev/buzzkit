# Workspaces, Members & Invites

## Workspaces

- `POST /v1/workspaces` (session) — `{ name, slug, avatarUrl? }` → 201. Creates owner membership **and the `default` tenant** in one transaction. Slugs: 3–48 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`, reserved list applies.
- `GET /v1/workspaces` (session) — the caller's workspaces with their role.
- `GET /v1/workspaces/:slug` — `workspace:read`; `role` is null for key callers.
- `PATCH /v1/workspaces/:slug` — `workspace:write`; `{ name?, slug?, avatarUrl? }`.
- `DELETE /v1/workspaces/:slug` — `workspace:delete` (owner); soft-deletes and revokes all workspace keys.

## Members

- `GET /v1/workspaces/:slug/members` — `members:read`; members with user info.
- `PATCH /v1/workspaces/:slug/members/:id` — `members:write`; `{ role: member|admin|owner }`. The last owner cannot be demoted.
- `DELETE /v1/workspaces/:slug/members/:id` — `members:write`; soft-remove. The last owner cannot be removed.

## Invites

No email delivery yet (dashboard phase wires it) — the create/list responses include the `token`; share `<dashboard>/invite/<token>` out-of-band.

- `POST /v1/workspaces/:slug/invites` — `invites:write`; `{ email, role?: member|admin }` → 201 with token. One pending invite per email; existing members conflict.
- `GET /v1/workspaces/:slug/invites` — `invites:read`; pending invites.
- `DELETE /v1/workspaces/:slug/invites/:id` — `invites:write`; revoke.
- `GET /v1/invites/:token` — **public** preview: workspace name/slug, masked email, role, expired/accepted flags.
- `POST /v1/invites/:token/accept` — session; only the invited email may accept; expiry 7 days.

## Profile

- `GET /v1/profile`, `PATCH /v1/profile` (`{ name }`) — session-only.
