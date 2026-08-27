# buzzkit — the framework package

The public `buzzkit` package: what customers install, and what the platform (`apps/api`) dogfoods. One package, organized by subpath exports (`buzzkit/webhooks` today; channels, workflows, segments, campaigns, the send client and device token APIs as they land), never split into separate npm packages for organization's sake.

## Rules

- **Same code standards as the API** (`apps/api/CLAUDE.md`): no comments anywhere, names written out, the verb vocabulary, one concern per file, ordered types → constants → errors → pure helpers → the public functions. A subpath is a directory with an `index.ts` barrel that exports only its public surface; internals stay unexported.
- **Runtime-neutral.** Web platform APIs only (`crypto.subtle`, `TextEncoder`, `fetch`, `Headers`): the same file must run in a Worker, Node 22+, Bun and a browser. No `node:*` imports in `src/`. Typed arrays are allocated so they are `Uint8Array<ArrayBuffer>` (WebCrypto's `BufferSource` refuses `ArrayBufferLike`).
- **Tests mirror `src/`** in `test/` (`test/webhooks/signature.test.ts` ↔ `src/webhooks/signature.ts`), vitest in the plain Node pool, no mocks of the platform; `bun run test` here, `bun run check-types` for types. Node's `crypto.createHmac` is allowed in tests as an independent oracle.
- **Every export is API surface.** Adding one means docs (`docs/`) and a test; renaming one is a breaking change once the package is published.
