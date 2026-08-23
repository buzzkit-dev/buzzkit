# Workspaces, Members & Invites

## Workspaces

- `POST /v1/workspaces` (session) — `{ name, slug, avatarUrl? }` → 201. Creates owner membership **and the `default` tenant** in one transaction. Slugs: 3–48 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`, reserved list applies.
- `GET /v1/workspaces` (session) — the caller's workspaces with their role (`{ items, hasMore, nextCursor }`). Workspace objects: `id`, `name`, `slug`, `avatarUrl`, `createdAt`, `updatedAt` (+ `role` where the caller has one).
- `GET /v1/workspaces/:workspaceSlug` — `workspace:read`; `role` is null for key callers.
- `PATCH /v1/workspaces/:workspaceSlug` — `workspace:write`; `{ name?, slug?, avatarUrl? }`.
- `DELETE /v1/workspaces/:workspaceSlug` — `workspace:delete` (owner); soft-deletes and revokes all workspace keys.

## Members

- `GET /v1/workspaces/:workspaceSlug/members` — `members:read`; list of `{ id, role, createdAt, updatedAt, user: { id, name, email, image } }`.
- `GET /v1/workspaces/:workspaceSlug/members/:id` — `members:read`; one member in the same shape.
- `PATCH /v1/workspaces/:workspaceSlug/members/:id` — `members:write`; `{ role: member|admin|owner }`. Granting or revoking `owner` additionally requires owner-level authority (`workspace:delete`) — an admin can never escalate. The last owner cannot be demoted.
- `DELETE /v1/workspaces/:workspaceSlug/members/:id` — `members:write`; soft-remove (removing an owner is owner-only), returns the member with `deleted: true`. The last owner cannot be removed. PATCH/DELETE return `{ id, role, createdAt, updatedAt }` — same object as the list minus the embedded user.

## Invites

Invites are **session-only** (`invites:*` cannot be granted to API keys — an invite is a path to a dashboard seat, so only a person may create one). Emails go through the Cloudflare Email Service binding (`EMAIL`, from `mail@tm.buzzkit.dev`); delivery failure never fails the mutation — create/resend responses carry `emailSent` and the `token` so the inviter can share the link (`<dashboard>/invite/<token>`) directly. The token is never included in list responses.

- `POST /v1/workspaces/:workspaceSlug/invites` — `invites:write`; `{ email, role?: member|admin }` → 201 with token + `emailSent`. One pending invite per email; existing members conflict.
- `GET /v1/workspaces/:workspaceSlug/invites` — `invites:read`; pending invites (no tokens).
- `GET /v1/workspaces/:workspaceSlug/invites/:id` — `invites:read`; one invite.
- `POST /v1/workspaces/:workspaceSlug/invites/:id/resend` — `invites:write`; refreshes the 7-day expiry and re-sends the email.
- `DELETE /v1/workspaces/:workspaceSlug/invites/:id` — `invites:write`; revoke.
- `GET /v1/invites/:token` — **public** preview: workspace name/slug, masked email, role, expired/accepted flags.
- `POST /v1/invites/:token/accept` — session; only the invited email may accept; expiry 7 days.

## Profile

- `GET /v1/profile`, `PATCH /v1/profile` (`{ name }`) — session-only.
