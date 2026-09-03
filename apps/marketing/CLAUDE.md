# @buzzkit/marketing — the site at buzzkit.dev

Astro 7, fully static output, React islands wherever the page renders the product itself, served from Cloudflare Workers static assets with a thin worker in front for markdown negotiation and discovery headers. Dev port **5181**. `docs/marketing.md` is the site's architecture and the agent surface that must stay in sync with copy; `docs/design.md` is the source of truth for everything visual.

## Structure

```
src/
  lib/site.ts                   Every external URL and the site meta, once
  lib/logo.ts                   The logo `<img>` source and classes, shared by `Logo.astro` and `Logo.tsx`
  lib/content.ts                Homepage copy: hero, value props, feature cards, deep dives, FAQ
  lib/pricing.ts                Plans, overage, delivery rules, the plan matrix and the pricing FAQ
  lib/estimate.ts               The pricing calculator's math: plan constants, cadences, `estimate`, `readNumber` (pure, tested)
  lib/features/<slug>.ts        One file per feature page (`FeaturePage`), registered in `lib/features/index.ts`; `findFeature`,
                                `listFeatureGroups` (the grouped view the header menu and the footer both render)
  lib/compare/<slug>.ts         One file per comparison page (`ComparePage`), registered in `lib/compare/index.ts`, same shape
  lib/markdown/                 The markdown twins, one renderer per generated page: home.ts, feature.ts, comparison.ts, pricing.ts;
                                frontmatter.ts holds the frontmatter contract, blocks.ts the shared blocks (points, FAQ, cells, the
                                Start links); index.ts re-exports the four renderers
  lib/llms/                     The llms.txt bodies: home.ts (/llms.txt), features.ts, compare.ts, developers.ts (the section indexes),
                                full.ts (every twin plus auth.md in one file); index.ts re-exports the five renderers
  lib/structured-data.ts        JSON-LD: `pageStructuredData` (Organization + WebSite + SoftwareApplication + WebPage + BreadcrumbList)
                                and `faqStructuredData` (FAQPage), built from the same arrays the pages render
  lib/responses.ts              `markdownResponse`, `textResponse`, `pngResponse`: the only Response shapes endpoints return
  lib/agent-index.ts            `renderAgentIndex`: the agent-skills index with the SKILL.md sha256 digest (pure, tested)
  lib/og/                       The OG images: index.ts (one card per page: title, continuation, kicker, icon, visual), visuals/ (one
                                file per visual, each a faithful redraw of the site's own component: notifications, actions,
                                live-activity, workflow, segment, preferences, ledger, schedule, sources, tenants, api-key; elements.ts
                                holds the Card, Badge, Switch, table row and live-ping equivalents; index.ts the `Visual` type and the
                                dispatcher), primitives.ts (tokens as hex, PastelAvatar, the fonts, balanced line breaking measured with
                                the real font, icons from the Central paths)
  lib/highlight.ts              Shiki at build time: a CSS-variables theme (`--code-*`, mapped to tokens in global.css), language
                                detected from the snippet (http / json / swift / bash) unless given
  lib/snippets.ts               Every code snippet the site shows (send curl, send request, Swift, the Swift guide, self-host); highlighted
                                in `.astro` frontmatter and passed to islands as HTML, printed verbatim in the twins
  layouts/Site.astro            Meta, canonical, OG, JSON-LD, header menus derived from the registries, footer
  components/layout/            Header (island: collapses on scroll, menus from the registries) with its parts in header/ (types,
                                constants, navigation, useSignedIn, SlidingHighlight, MenuPanel, MobileMenu), Footer + FooterColumn,
                                Section, PageHero (the title + gray continuation + intro every non-home page opens with, with a slot
                                for CTAs), ProseSection (heading left, prose right)
  components/ui/                Button, Badge, CodeBlock (Shiki-highlighted, Astro), Snippet (the same block for islands, takes
                                pre-highlighted HTML), FitScale (scales a fixed-width demo to its container), ScrollRow (horizontal
                                scroller with edge fades), Icon, Logo (Astro and React, both reading `lib/logo.ts`)
  components/hero/              HeroStacks (the notification columns flanking the hero title) and Artifact (a notification card)
  components/features/          vignettes/ (every product demo, one file each, built from `@buzzkit/ui`; index.ts re-exports them),
                                FeatureCards, FeatureVignette (the kind → vignette registry), DeliveryLedger, ValueCards
  components/platform/          HeroPreview (the hero island: the frame, the floating pill, the auto-advancing carousel), DashboardPreview
                                (sidebar + crossfade), one file per screen (Overview, Workflow, Segment, Message), Screen (shared header)
  components/compare/           Cell: one comparison-table cell (checkmark, dash, Soon badge or text)
  components/pricing/           Calculator (the deliveries-versus-per-MAU estimate island, math from `lib/estimate.ts`), DeliveryHint
  components/sections/          The homepage sections, one file each (DeepDives renders the two wide cards that close the Features grid
                                through DeepDive; Faq is the questions section every page with an accordion renders, FaqList its island:
                                plus-to-minus glyph, height-auto spring)
  pages/                        index, why-buzzkit, pricing, developers, about, contact, privacy, 404, features/[slug] + [slug].md, compare/[slug] +
                                [slug].md, index.md, pricing.md, llms.txt, llms-full.txt, features/llms.txt, compare/llms.txt,
                                developers/llms.txt, og/[...path].png, logo.png, apple-touch-icon.png; every endpoint is a renderer
                                from `lib/` wrapped by `lib/responses.ts`
public/                         The exact logo SVG, favicon, robots.txt, the hand-kept twins (why-buzzkit, developers, about, contact, privacy, auth),
                                404.md, openapi.json (emitted from the API, never edited), .well-known/ (ard.json, api-catalog,
                                security.txt, agent-skills)
worker/                         index.ts (the fetch handler), routing.ts (docs redirects, the ai-catalog alias, request rewrites),
                                negotiation.ts (Accept: text/markdown, AI crawler agents, twin paths), headers.ts (Link discovery
                                headers, Vary, content types), session.ts (the signed-in hint: `data-signed-in` on <html> when the
                                shared session cookie is present)
scripts/emit-agent-index.ts     Post-build: reads SKILL.md from dist and writes the agent-skills index through `lib/agent-index.ts`
test/                           Vitest on the Node pool. lib/ and worker/ mirror `src/` and `worker/` file for file (the worker helpers, every
                                twin and llms renderer, the registries, the pricing math, the agent index digest). dist/ audits the built
                                site the way Is Agentic and Ora score it (pages, twins, discovery files); worker/contract drives the real
                                worker over `dist/` through a fake ASSETS binding. `bun run test` builds first; `bun run test:only` skips it
```

## Rules (non-negotiable)

- **The repo's conventions apply here unchanged.** No comments anywhere (`.astro` frontmatter included; the conventions checker parses it), the verb catalog, the readability rules, Biome's hardened set, knip, the multi-file structure (a concentration becomes a directory of one-concern files with an `index` barrel: `lib/markdown/`, `lib/llms/`, `lib/og/visuals/`, `components/features/vignettes/`, `components/layout/header/`, `worker/`). `bun lint`, `bun lint:conventions`, `bunx knip`, `bun check-types` and `bun run test` all cover this app; a pure module gets a test file at the mirrored path under `test/`.
- **Product demos are the real components.** Anything that shows the product renders `@buzzkit/ui` components (Card, Table, Badge, Switch, NumberFlow, PastelAvatar, the charts) with fixed sample data, cropped at the card edges. Never a screenshot, never lookalike markup, never a mock drawn from divs when a component exists. New demos go into `components/features/vignettes/` (one file, re-exported from its `index.ts`, registered by kind in `FeatureVignette`) so feature cards and feature pages share them.
- **The hero screens are the dashboard's own pages.** `@buzzkit/web` exports `./components/*`, and the marketing Vite config aliases `@/app/` to `apps/web/app/` so those files resolve; the hero screens import the real WorkflowFlow, SegmentBuilder, badges and DetailRow and mirror the dashboard routes' markup (back button, header, cards, tabs) with sample data. Only pieces that need react-router (subscriber rows, links) are re-drawn locally. Sample workflow specs must pass `lintWorkflow`; step names are slugs. Flags the screens use are copied into `public/flags/`.
- **Pages are data.** A feature or comparison page is a file in `lib/features` or `lib/compare` and nothing else: the Astro page, the markdown twin, the header menus, the footer, llms.txt and the sitemap all derive from the registry. Adding a page means adding a file and registering it. Copy lives in those files and in `lib/content.ts`, never inline in a section component (the only exceptions are section headings that exist once).
- **Every page has a markdown twin and the twin is never stale.** Registry pages, the homepage and pricing generate theirs at build from `lib/markdown/`; the prose pages (`why-buzzkit`, `developers`, `about`, `contact`, `privacy`) keep hand-written twins in `public/` that change in the same commit as the page. `llms-full.txt` concatenates every twin plus `auth.md`. Twins open with frontmatter and a single `#` heading, close every code fence, and link absolutely. The agent surface is pinned by `test/dist` and `test/worker/contract.test.ts` (the in-repo mirror of the Is Agentic and Ora checks, `docs/marketing.md` → the agent surface); a change that fails them is a score regression. The official Is Agentic skill lives at `.claude/skills/is-agentic` — use it to fetch the live report and work issues by tier.
- **OG images are rendered at build, one per page, and they obey the design system.** Every panel is a redraw of a real component with the same radii, tokens, shadows, badges and switches at 1.3× scale; nothing is invented for the card. `lib/og/index.ts` holds the card list (title, gray continuation, kicker with its Central icon, a visual per page kind) and draws it with satori on the subset Open Runde TTFs, titles balanced with `text-wrap: balance` semantics by measuring words with the same font; `Site.astro` takes `image` and every page passes its own `/og/<path>.png`. `logo.png` and `apple-touch-icon.png` come from `favicon.svg` the same way. Never commit a screenshot.
- **The OpenAPI document is emitted, never edited.** `public/openapi.json` comes from `bun run openapi` (the API's `openapi:emit`, which runs the contract under the test stubs and adds summaries, operation ids, servers and the bearer scheme); the marketing build runs it first. `auth.md`, the ARD catalog and the RFC 9727 api-catalog point at it.
- **The logo is the exported SVG, verbatim.** `public/buzzkit.svg` is byte-identical to the design export and rendered through `<img>` (`Logo.astro` / `Logo.tsx`, both reading `lib/logo.ts`). Never rebuild it from paths.
- **Design system only.** Tokens, Open Runde for everything except code blocks (mono), the press pattern, `text-balance` titles and `text-pretty` descriptions, sentence case everywhere except CTAs, which are Title Case ("Get Started", "Star on GitHub", "Read the API Overview"), no em or en dashes in user-facing copy, `font-medium` headings (Natural's weight, never semibold below the hero). One brand accent (`brand-*`, derived from the logo, defined in `src/styles/global.css`); every other color means a status.
- **Every page works at phone width.** Product demos never make the page scroll sideways: the hero renders the dashboard at a fixed natural width (640 without the sidebar below `md`, 1024 with it above) and scales it to the frame with a `ResizeObserver`; the home feature cards wrap their 440px vignettes in `FitScale`, which scales content down to the card with a small deliberate crop; table vignettes on feature pages sit in `ScrollRow`, a horizontal scroller with `ScrollFade` edges; the hero pill shows icons only below `sm`. Check with a 390px screenshot and `document.documentElement.scrollWidth === 390` before calling a section done.
- **The header sits on the page grid.** Its content box is the same `max-w-5xl` the sections use, padding lives on the outer element, and the hairline runs 24px past the content on both sides (`-mx-6`), never the other way around.
- **Platform claims are iOS-first.** iOS is supported today; Android, email and web push are connectors on the same core and follow. Never claim Android or FCM sending as supported.
- **No section eyebrows.** A section is a headline and one line. Categories live in the header menu and the footer, never as a label above a title.
- **One button size.** `Button.astro` is 32px only; hero CTAs use the same size as everything else.
- **Motion.** `motion/react` springs at `bounce: 0`, `AnimatePresence initial={false}` except the hero stacks' first paint, reduced motion freezes every loop. No entrance choreography on sections. The one entrance that exists is the hero stacks: cards fade and scale in on first paint (0.4s ease-out, staggered 120ms per slot, the right column 60ms behind) and swap in place the same way at 0.5s, the icon-museum feel; under reduced motion they render full and still. Below `lg` the same component scatters four banners around the title at 16% opacity as a background texture, swapping one at a time, the way icon-museum does with its icons.
- **Islands hydrate only where they must.** `client:load` for the header and hero, `client:visible` for everything below the fold. Islands take plain serializable props from Astro; a registry is read in `.astro` frontmatter and handed down, never imported into an island.
- **Component bodies read top to bottom in the dashboard's fixed order** (router hooks, derived values, state, refs, derived values, handlers, effects last).
- **File names and directories.** Components are PascalCase (`Header.tsx`, `Section.astro`); hooks are kebab-case `use-<name>.tsx` (`header/use-signed-in.tsx`, the dashboard's `hooks/use-time-ago.tsx`); `lib/` is `.ts` only. A directory never mixes `.ts` and `.tsx`: types, constants and helpers a component tree needs live inside the `.tsx` that owns them (the header's menu vocabulary in `MenuPanel.tsx`, its springs in `SlidingHighlight.tsx`, `Menus`/`Link` and the navigation helpers in `Header.tsx`), and a directory of components has no barrel — importers name the file.
- **Copy goes through the `copy` skill.** One job per string, full sentences, the API's nouns, honest claims only: no invented limits, pricing or competitor facts.
- **Code is highlighted at build time, never in the browser.** `CodeBlock.astro` takes `code` (and optionally `lang`) and runs Shiki in frontmatter; an island that shows code takes the highlighted HTML as a prop (`Snippet`) from the `.astro` that renders it. Colors come only from the `--code-*` variables in `global.css`, which point at status text tokens, and real code is set in the mono stack (`font-mono` on the block and the `code` element); Open Runde stays for everything else.
- **One hostname, path routes.** Marketing owns only the paths listed in `wrangler.jsonc`; the dashboard owns `buzzkit.dev/*`. A new marketing path needs a route entry there and must be a reserved slug in the API. The dashboard entry is `site.dashboardUrl` (`/dashboard`), sign-up is `site.signupUrl`, docs are `site.docsUrl` (docs.buzzkit.dev, Mintlify); the marketing worker 301s `/docs`, `/docs.md` and `/docs/*` there, so the site never hosts a docs page of its own.
- **SSR needs `vite.ssr.noExternal` for `@visx/*`, `d3-*` and NumberFlow** (`astro.config.mjs`); without it the dashboard preview throws "Element type is invalid" on the server.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on 5181 (Astro daemonizes it; `astro dev stop` ends it) |
| `bun run build` | Static build into `dist/` plus the agent-skills index |
| `bun run check-types` | `astro sync` + `tsc --noEmit` (`astro check` cannot run on TypeScript 7) |
| `bun run test` | Build, then every suite: lib and worker mirrors, the dist audit, the worker contract (`bun run test:only` skips the build) |
| `bun run test` | Vitest over `test/` (also part of the root `bun run test`) |
| `bun run deploy` | Build and `wrangler deploy` |
| `bunx wrangler dev --port 8799` | The built site behind the worker, for verifying negotiation and headers |
