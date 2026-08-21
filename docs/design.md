# Design system

The source of truth for everything visual in buzzkit. If you are building UI — a route, a component, a one-off panel — read the rules here first and reach for the tokens and components below before writing anything custom.

- **Package:** `packages/ui` → `@buzzkit/ui`
- **Tokens:** `packages/ui/src/styles/globals.css` (the only file that may contain a raw color)
- **Live reference:** `/ui` in `apps/web` — every component, every state, rendered in both themes. Anything you add belongs there.
- **This file, served:** `/design.md`

Built on **shadcn (Base UI style, `base-nova`)** + **Tailwind v4**. Components are ours to edit; add new ones with `bunx shadcn add <name>` inside `packages/ui`, then restyle to tokens.

**Visual identity:** soft, playful, clean, few colors used deliberately. Open Runde as the typeface, a black primary so color is reserved for meaning, superellipse corners, hairline shadows instead of borders, and a press that moves the background but never the label.

---

## 1. The rules that never bend

1. **Never hardcode a color.** No hex, no `rgb()`, no `rgba()`, no raw Tailwind palette (`bg-zinc-100`) in a component. Use a token utility (`bg-bg-2`, `text-fg-3`, `shadow-control`). `globals.css` is the only place a literal color exists. The one exemption is **user data colors** — hex values stored through the API (status and label colors, and the swatch presets offered for picking them) render via inline `style`, since they are content, not chrome.
2. **All colors are OKLCH.** Perceptually uniform lightness, stable hue across a ramp. Never add a hex.
3. **The brand is only ever `primary-*`.** Components reference the alias ramp, never a concrete hue. Re-pointing `--primary-*` re-brands the product.
4. **Icons are Central Icons only**, via `<Icon name='Icon…' />`. Never lucide, never an inline `<svg>`.
5. **Only the background scales on press.** The label never moves. See §7.
6. **Tailwind only emits classes it can see as literal strings.** `` `bg-${ramp}-1` `` produces nothing. Use lookup tables of complete class names.
7. **Every state has a static cue.** Motion is enhancement; it is removed entirely under `prefers-reduced-motion`.
8. **Never let `hover:` be the only feedback.** Pair it with the same value on `active:` — see §7.1. A hover-only affordance is completely invisible on touch.
9. **A title and its description sit `gap-0.5` (2px) apart**, everywhere: card headers, page headers, row title over subtitle, step title over description. Never `gap-px`, never more. (This is the one place buzzkit departs from feedbase, which runs them flush.)

---

## 2. Color

Light lives in `:root`, dark in `.dark` on `<html>`. Tokens flip automatically — components use tokens plus `dark:` variants, never theme-conditional JS.

### 2.1 Neutrals — the whole UI

Two ladders. Surfaces recede as the number climbs; foregrounds strengthen.

| Token | Role | Use for |
| --- | --- | --- |
| `bg-1` | page / card | The default surface |
| `bg-2` | recessed | Inputs, segmented tracks, kbd, code blocks |
| `bg-3` | more recessed | **The border color** — every separator, divider and structural border, plus the dark-mode shadow rings and unchecked control tracks |
| `bg-4` | most recessed | Disabled fills, focus rings, avatar fallbacks, skeletons, the read-only input border |
| `fg-1` | **decorative only** | Dividers, watermarks, disabled glyphs. **Never text, labels or placeholders** — it measures ~2.1:1 |
| `fg-2` | secondary text | Descriptions, captions, placeholders, inactive tabs, menu shortcuts |
| `fg-3` | body text | The inherited default on `<body>` |
| `fg-4` | strong text | Titles, headings, active states |

Measured contrast (WCAG 2):

| Pair | Light | Dark |
| --- | --- | --- |
| `fg-2` on `bg-1` | 5.01 | 5.75 |
| `fg-2` on `bg-2` | 4.64 | 5.36 |
| `fg-3` on `bg-1` | 7.67 | 9.33 |
| `fg-4` on `bg-1` | 17.74 | 15.59 |

**Alpha neutrals** (`bg-a1`…`bg-a4`, `fg-a1`…`fg-a4`) are translucent — they tint what is underneath instead of covering it. Use them for hover fills and borders on a surface whose color you do not know.

Two more neutral aliases exist for page chrome: `background` (the page) and `background-subtle` (page background when cards need to read as elevated).

### 2.2 Accent ramps

Nine hues: `purple`, `sky`, `blue`, `green`, `amber`, `orange`, `red`, `pink`, `yellow`.

| Step | Role |
| --- | --- |
| `-1` | Tint background (chips, subtle callouts) |
| `-2` | Stronger tint, hover on a tint |
| `-3` | Mid — borders, decorative fills |
| `-4` | **Solid fill** — the saturated one |
| `-text` | **Text on the matching `-1` tint** — the only step safe to read as type on a tint |
| `-a1`…`-a4` | Alpha variants of `-4` |

**`-4` is a fill, `-text` is a text color.** Reading `-4` as text on its own `-1` tint lands at 1.7:1–2.4:1 — unreadable. In light mode `-text` keeps its ramp's hue and rides maximum chroma while dropping lightness until it clears **APCA Lc 60**, the threshold for non-body text like chips (measured Lc 60–61, WCAG 3.4–3.9 — deliberate; the WCAG-4.5 alternative turns amber and orange into mud). In dark mode `-4` already clears 4.5:1 on its own tint, so `-text` aliases it and the tuned dark palette is untouched.

```tsx
<Badge variant='amber'>Pending</Badge>   // bg-amber-1 + text-amber-text
```

**Purple is for tags and labels only.** Never accent chrome with it.

### 2.3 Primary — the brand alias

`--primary-1`…`--primary-4` and `--primary-a1`…`--primary-a4` are **aliases**, currently pointed at the neutrals — which is what makes the brand black. Solid buttons, checked controls and focus rings all read through them. To re-brand, re-point that one block:

```css
--primary-4: var(--sky-4);   /* the whole product follows */
```

### 2.4 Semantic (shadcn) mapping

`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring` all resolve to the tokens above. They exist so shadcn components drop in unmodified. Prefer the direct tokens (`bg-bg-2`) in our own code — they say more. `--border` points at `bg-3` and a base rule paints every bare `border` utility with it, so unqualified borders land on the one border color automatically.

### 2.5 Selection follows the surface

`::selection` reads the inherited **`--selection`** variable (default `--bg-a4`, the neutral surface tint: dark on light surfaces, light on dark), so text selection adapts to whatever surface it sits on. A tinted surface re-colors selection for its whole subtree with one utility — `selection-inverse` on dark/primary surfaces (primary bubbles, solid badges, the primary pill), `selection-amber` on internal-message surfaces, `selection-<hue>` on each badge tint. Backgrounds are translucent alpha steps (`-a3`), so the original text color stays readable and no per-surface text color is needed. When you build a new tinted surface, set its selection utility in the same commit.

### 2.6 Contrast floors

- Body text: WCAG 4.5:1 / APCA Lc 75
- Non-body (chips, badges, captions): APCA Lc 60
- Disabled text is exempt
- Verify **both** themes. Dark is not a mechanical inversion — it is tuned separately.

---

## 3. Typography

**Open Runde**, self-hosted `.woff2`, four weights. `font-medium` (500) is effectively the only UI weight — hierarchy comes from the `fg` ramp and size, not from weight.

| Class | Size | Leading | Use |
| --- | --- | --- | --- |
| `text-xs` | **13px** | 1.2 | Captions, badges, shortcuts, `xs`/`sm` buttons |
| `text-sm` | 14px | 1.25 | The UI default: buttons, inputs, menus, descriptions |
| `text-base` | 16px | 1.35 | Body copy, card titles |
| `text-xl` | 20px | `leading-tighter` | Dialog titles |
| `text-2xl` | 24px | `leading-tighter` | Page titles |

Default leading is deliberately tighter than the stock Tailwind ratios (1.43/1.5), which read airy in a dense dashboard — wrapped descriptions keep a normal line gap instead of drifting apart.

Rules:

- **No off-scale sizes.** There is no `text-[11px]` anywhere; if you need a step, add it to `@theme`.
- **Inputs are `text-sm` at every width.** iOS Safari auto-zooms the page when a focused field is under 16px, and the usual answer is to bump inputs to 16px on mobile. We do the opposite: the field keeps the size it should be, and `maximum-scale=1` in the viewport meta (`apps/web/app/root.tsx`, `apps/widget/index.html`) stops the zoom. Every new HTML entry point needs that meta tag.
- **Textareas render at normal weight, inputs at `font-medium`.** A textarea holds prose that becomes a message, and text must not change weight the moment it is sent; a single-line input holds a short value and reads as data.
- `leading-tighter` (1.15) on anything that can wrap to two lines. Never `leading-none` on wrapping text — descenders collide.
- `text-balance` on titles, `text-pretty` on descriptions.
- `tracking-tight` on large headings only; base tracking is already slightly tight (`-0.0175em`).
- Cap long-form measure around 60–75 characters.
- `tabular-nums` on any number that changes.
- Body text keeps `cursor: text`; chrome keeps the arrow (handled in `globals.css`).

---

## 4. Shape

Native `corner-shape: superellipse(1.125)` via `corner-superellipse/1.125`, applied to the element **and** its `::before`/`::after` so press layers keep the same corner. Degrades to a plain radius where unsupported.

| Radius | Where |
| --- | --- |
| `rounded-[10px]` | `xs` / `sm` buttons |
| `rounded-xl` (12px) | **The default control radius** — buttons, inputs, selects, popovers, tooltips |
| `rounded-2xl` (16px) | Cards |
| `rounded-3xl` (24px) | Dialogs, sheets, toasts |
| `rounded-full` | Badges, avatars, switches, radios, scrollbar thumbs |

**Nested radii are concentric:** `outer = inner + padding`. TabsList is `rounded-xl` with `p-[3px]` and a `rounded-[9px]` indicator; menu popups are `rounded-xl` with `p-1` and `rounded-lg` items.

Rectangles with clean corners — never pill-shaped buttons.

---

## 5. Elevation

| Token | Use |
| --- | --- |
| `shadow-1` / `shadow-xs` | Barely-there lift |
| `shadow-2` / `shadow-sm` | Cards, tooltips |
| `shadow-3` / `shadow-md` | Popovers, menus, dialogs, toasts |
| `shadow-4` / `shadow-lg` | Sheets |
| `shadow-control` | Solid button fill (drop shadow + inner top highlight) |
| `shadow-control-destructive` | Destructive button fill |
| `shadow-control-elevated` / `-hover` | Elevated button — **flips recipe in dark mode** (drop shadow → inner hairline), so never add a `dark:` variant |
| `shadow-control-knob` | Switch knob |
| `shadow-control-dot` | Radio dot |

Every shadow ends in a hairline ring — that ring **is** the border. In light mode it is a dark outer ring; in dark mode the recipes flip it inward (a dark ring is invisible on a dark page): surface shadows (`shadow-1`…`4`) switch to an inset `bg-3` ring, the same single border color as every separator and divider, while the elevated control keeps its inner hairline of light. Never add a `dark:` variant to compensate — the tokens flip themselves. Use a real `border` only for structure (the `CardFooter` divider, row dividers, the chat header), always `bg-3`, never to fake elevation; the read-only input's `bg-4` border is the one deliberate exception.

---

## 6. Motion

| Interaction | Duration | Easing |
| --- | --- | --- |
| Press / hover / color | 150ms | `ease-out` |
| Nav tab color + icon fades | 200ms | `ease-out` |
| Overlay enter/exit, switch track | 200ms | `ease-out` |
| Sliding indicators | 180ms | `cubic-bezier(0.22, 1, 0.36, 1)` |

- **Never `transition-all`.** Always name the properties: `transition-[color,background-color,box-shadow]`.
- CSS transitions for state; keyframes only for one-shot sequences.
- `will-change` only on `transform` / `opacity` / `filter`, and only where you saw stutter.

### Springs

JS animation is `motion/react` (Motion, formerly Framer Motion) only, for anything CSS transitions cannot express. Two specialised libraries sit beside it and are the required answer for their cases: **numbers that change animate with NumberFlow** (`@number-flow/react`, always inside `tabular-nums`), and **text that changes in place morphs with Torph** (`torph/react`, `TextMorph`): a button label that flips from `Next` to `Connect Apple Push`, a counter, a status word. Never hand-roll a digit roll or a text cross-fade. Springs are `{ type: 'spring', duration: 0.3–0.5, bounce: 0 }` — **bounce is always 0**. `AnimatePresence initial={false}` everywhere, so nothing animates on page load. Layout-size moves (the inbox panel slide) run the 0.5 spring; small state swaps run 0.3.

### The icon-swap standard

Whenever one icon or glyph replaces another in place — copy → check, step number → check, any stateful icon — both states swap with one recipe, shared from **`@buzzkit/ui/lib/icon-swap`**: the outgoing icon scales down to `0.65` as it fades out behind a subtle `2px` blur, and the incoming icon scales in from `0.65` as it fades in. Both at once, one duration — a simple symmetric cross-fade. Never toggle visibility, never scale from 0, never skip the blur.

CSS flavor — `iconSwap` + `iconSwapIn` / `iconSwapOut`; both icons stay mounted, absolute-stacked, so transitions retarget mid-swap:

```
base:   transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]
shown:  scale-100 opacity-100 blur-none
hidden: scale-[0.65] opacity-0 blur-[2px]
```

motion/react flavor — `iconSwapMotion`, for `AnimatePresence`-driven swaps: same endpoints, `{ type: 'spring', duration: 0.3, bounce: 0 }`.

Reference implementations: the `CodeBlock` copy button and the conversation header's details toggle (CSS), the onboarding `StepMarker` (motion, `components/onboarding/guide-step.tsx`).

### Restraint

- **Frequency decides.** Anything triggered dozens of times a day — navigation, keyboard actions, list hovers — gets no animation. Occasional surfaces (dialogs, toasts) get the standard timings. Delight spends only on rare moments (first-run, success).
- **No entrance choreography.** Screens render settled — no staggered fly-ins, no per-section reveals. Motion belongs to state *changes*, not to arrival.
- **Waiting states use the live dot**, not a spinner: `LivePing` (`@buzzkit/ui/components/live-ping`) — a `size-2` solid `green-4` core under an `animate-ping` ring at 60% opacity (`motion-reduce:animate-none`), placed at the right edge of the waiting item's title and paired with a short label naming what it waits for, dot first: "● Waiting for user". A spinner means the *app* is working; the dot means the app is ready and *listening*.

### Reduced motion

`globals.css` carries one unlayered `@media (prefers-reduced-motion: reduce)` block that collapses every animation and transition to `0.01ms` and kills the skeleton pulse. **`.animate-spin` is exempt** — a spinner that stops spinning stops communicating progress. It is unlayered on purpose so it also beats sonner's injected stylesheet.

---

## 7. The press pattern

buzzkit controls press by scaling **only the background**. The label, icons and layout stay fixed.

```tsx
// The fill and its shadow live on ::before, which is what scales.
"before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
'before:transition-[background-color,box-shadow,scale] before:duration-150 before:ease-out',
'enabled:active:before:scale-[0.975]',
```

- Anything with content — buttons, selects, tabs, menu items — scales its `::before` to `0.975`.
- Anything **without** content — checkbox, radio — scales itself to `0.95`.
- Link buttons have no background, so the content itself scales to `0.975`.
- **Disabled controls never show press feedback.** Gate on `enabled:` / `not-data-disabled:`.
- Pressing a `<label>` presses its sibling control (handled in `globals.css`).

> Base UI renders checkbox/radio/switch as `<span>` + a hidden `<input>`, so `:enabled` / `:disabled` never match. Use `not-data-disabled:` and `data-disabled:` on those three.

### 7.1 Touch: `hover:` is desktop-only, so pair it with `active:`

Tailwind v4 compiles every `hover:` into `@media (hover: hover)`. That is the right default (it kills iOS sticky-hover), but it has a consequence that is easy to ship without noticing: **on a phone, a hover-only affordance does nothing at all.** A ghost button tapped on mobile looks broken, because its entire fill lives in `hover:`.

`active:` is not gated, so it is the channel that fires on touch. The rule:

```tsx
// Wrong — invisible on every phone.
'not-disabled:hover:before:bg-bg-a2/70'
// Right — same value, twice.
'not-disabled:hover:before:bg-bg-a2/70 not-disabled:active:before:bg-bg-a2/70'
```

Write the value **twice, identically**. Do not reach for a custom `tap:`/`hover:none` variant: `active:` also fires on keyboard activation (Space on a focused button), which a touch-gated variant would miss.

Pair whenever hover carries feedback a press should show: ghost/soft/link buttons, list rows, tabs, select triggers, attachments, prose links. Do **not** pair when hover is a pointer-only affordance with no tap meaning — the scrollbar thumb, the sidebar resize rail, or a hover that reveals a control a touch user reaches another way.

`-webkit-tap-highlight-color: transparent` is set on `html` so Safari's grey flash does not fight these states.

---

## 8. Icons

Central Icons, exclusively:

```tsx
import { Icon } from '@buzzkit/ui/components/icon';
<Icon name='IconBell' className='size-4' />
```

- `scripts/generate-icons.ts` scans the repo for `name='Icon…'` **string literals** and generates `paths.ts`. Never build a name dynamically — the icon will not be bundled. It runs before dev/build/check-types.
- Icons paint via `currentColor`; state comes from CSS color, never a second asset.
- Default `size-4` (16px) inside controls; one stroke weight across the set.
- Decorative icons get `aria-hidden` automatically. Pass `ariaLabel` to make one meaningful (it then gets `role="img"`).
- The generated SVGs carry a `<mask id>` per icon name, so **never render the same icon twice where one copy is `display: none`** (a hidden first copy owns the id and the visible one paints unmasked as a solid square). Reposition one node with CSS instead of rendering a mobile and a desktop copy.
- `IconCheckmark1` is the checkmark, with `rotate-[4deg]` — the other checkmarks in the set are optically wrong at small sizes.
- **Glyph icons are solid: append `Filled`** (`IconPeopleFilled`, `IconTagFilled`) — any catalog name renders filled with the suffix. Outline is only for icons that have no meaningful fill: chevrons, arrows, checkmarks, the spinner.
- Filled icons render at **50% opacity automatically** (in the `Icon` component) — solid glyphs carry more ink than strokes, so this keeps both at the same visual weight. Override with an `opacity-*` class when a filled icon must be full-strength.
- **State lifts the opacity, on a 200ms fade:** menu and select items raise their icons to 100% while the sliding highlight sits on them (`data-indicator-here`); sidebar nav items raise theirs to **85%** for the active and highlighted item — text goes full `fg-4`, the icon stays a step quieter.

Components with an `icon` prop (`Button`, `Badge`, menu items) accept `icon='IconBell'` or `icon={{ name: 'IconBell', position: 'inline-end' }}`, and trim 2px of padding on the icon's side so the glyph sits optically level with the text edge.

---

## 9. Components

All from `@buzzkit/ui/components/<name>`.

### Button

`variant`: `default` · `elevated` · `soft` · `ghost` · `destructive` · `link`
`size`: `xs` (26px) · `sm` (30px) · `default` (32px) · `lg` (36px), plus `icon-xs` · `icon-sm` · `icon` · `icon-lg`
`icon`: `MenuItemIcon`

`default` is the single primary action on a view. `elevated` is the neutral workhorse. `soft` and `ghost` are secondary and tertiary; `ghost` rests in `fg-2` and only turns `fg-4` on hover and press, so a row of ghost actions reads as chrome until you reach for it. `destructive` only for irreversible actions. Use `xs` inside dense chrome such as a card footer.

### Badge

`variant`: `default` · `purple` · `sky` · `blue` · `green` · `amber` · `orange` · `red` · `pink` · `solid`
`size`: `sm` (20px, `text-xs`) · `default` (24px, `text-sm`)

Status chips: `-1` tint + `-text`. Never interactive — if it needs a click, it is a Button.

### Input / Textarea

34px tall, `rounded-xl`, `bg-bg-2`. Focus draws a 1.5px outline plus ring; `aria-invalid` turns it red. Read-only fields keep a quieter focus ring — never remove it. Textarea auto-grows via `field-sizing-content`.

**Every field needs a real `<Label htmlFor>`.** A placeholder shows the expected format, never the label.

### Select

One trigger size, matching the default button (32px, `rounded-xl`). The popup aligns the selected item over the trigger (`alignItemWithTrigger`), takes the trigger's width via `w-(--anchor-width)`, and `SelectValue` mirrors the selected item's icon.

### Checkbox · Radio · Switch

18px, 18px, and 32×20 with a 16px knob. Each expands its hit area with `after:-inset-x-3 after:-inset-y-2` so the target clears 24×24 without growing visually. All three take `cursor-pointer` unless disabled.

### Tabs

`variant`: `default` (segmented — a sliding pill on `bg-bg-2`) · `ghost` (bare text switchers, no indicator; the content itself presses).

### PillTabs

Free-floating pill pickers (no track): header nav, inbox status filters, composer modes. **The pill is a clip-path window, never a color transition**: an aria-hidden copy of the label row in the inverted color sits on the pill background, clipped by an animated `inset(… round 9999px)` — mid-slide a label splits at the pill edge instead of cross-fading. `variant`: `primary` (black pill, inverted labels) · `amber` (internal-mode composer picker) · `soft` (`bg-bg-2`). On first mount the pill snaps to position and fades in over 150ms; only value changes animate the slide. Interactive elements are buttons by default; pass `renderItem` for router Links. Keep the root padding-free (the overlay aligns to its box) — pad a wrapper instead.

### Nav lists (sidebars)

Vertical navs (the settings sidebar, the `/ui` section nav) share the menu mechanic via `useAnimatedIndicator`: one `bg-a2` highlight that **rests on the active item**, slides to the hovered item, and glides back on pointer leave — items never draw their own hover background. Text runs `fg-2` → `fg-4` under the indicator and stays `fg-4` on the active item; both transitions run 200ms so switching tabs shifts color instead of snapping. Group headers are quiet `text-xs fg-2` labels above their items. Active state must always be knowable with the pointer elsewhere.

### CodeBlock

Copyable snippet on `bg-bg-2`, `rounded-xl`: mono `text-xs`, horizontal `ScrollFade` (hidden scrollbar, fade hint), clipboard button top-right on a solid `bg-bg-2` backing so scrolled code never shows through beneath it. The clipboard flips to a full-strength `green-4` checkmark for 1.5s via the icon-swap standard (§6) — it confirms the copy succeeded. No syntax highlighting — deliberately plain.

### DropdownMenu

Items share one sliding highlight from `HighlightList` rather than each drawing its own hover. `DropdownMenuItem variant='destructive'` tints the indicator red. Submenus offset 12px. **`DropdownMenuLabel` must sit inside a `DropdownMenuGroup`** — Base UI throws otherwise, which kills hydration silently.

### Dialog / AlertDialog

Centered, 420px (`size='sm'` → `max-w-xs`), `rounded-3xl`. Title (`text-xl`) over description (`text-sm`), both centered and balanced, no gap. AlertDialog is for destructive confirms: two actions splitting the width 50/50, and the confirm button **repeats the consequence** ("Delete workspace", never "Delete").

### IconTile

A glyph on a soft `bg-2` surface, the one way an icon sits on its own: `size` `sm` (32px tile, 18px glyph: dense rows, card titles) · `default` (34px / 20px, the input height: choice rows) · `lg` (48px / 28px: empty states, headers). It carries a transparent 1px ring; list rows that lead with a tile draw it as a permanent hairline at `ring-bg-4/70`, between the divider color and the read-only border. Never change its fill on hover. `EmptyState` and every list row that leads with an icon use it instead of a hand-rolled span.

### EmptyState

`icon` · `title` · `description?` · one optional action as `children`. **The** blank-slate treatment: glyph in a `size-12` `bg-bg-2` tile, title over description, at most one Button. Every "nothing here yet", "cannot load this" and "pick something" surface uses it, in the dashboard and the widget alike. Never hand-roll another one, and never give it two actions.

### Sheet

`side`: `top` · `right` · `bottom` · `left`. Header and footer stay pinned; scrolling content goes in `SheetBody`.

**The panel only slides, it never fades** — a full translate from off-screen (`transition-[translate]`, 200ms `ease-out`), both directions. Fading a panel that also moves reads as unclean, so only the backdrop fades. Put the primary action (`New conversation`, `Save`) in `SheetFooter`, not the header.

### Drawer

Draggable panel on [vaul](https://vaul.emilkowal.ski). Same anatomy as Sheet (`DrawerHeader` / `DrawerBody` / `DrawerFooter`, primary action in the footer), and `DrawerContent` styles itself from vaul's `data-vaul-drawer-direction`, so one component covers every side.

**`responsive` is the house default.** A full-width bottom sheet on a desktop viewport is absurd, and a 310px side panel on a phone is worse, so `<Drawer responsive>` resolves the direction from the breakpoint: **bottom** under 768px (96% height, `rounded-t-3xl`, drag handle, background scales behind it) and **left** above it (an inset panel, `top-2 bottom-2 left-2`, `rounded-3xl`, `shadow-4`, no handle). Both directions still drag to dismiss; the side panel travels its width plus the 8px inset via `--initial-transform`.

**Drawer vs Sheet:** a drawer is *dragged*, a sheet is *opened*. Vaul is Radix-based, so its trigger takes `asChild`, not Base UI's `render`.

### Popover / Tooltip

Popover: 288px, `rounded-xl`, title + description with no gap. Tooltip: a 24px dark chip, `rounded-lg`, no arrow — the 4px offset reads as attached. A `Kbd` inside a tooltip inverts automatically.

### Card

`rounded-2xl`, `px-4 py-4`. Header drops to `pb-[13px]` when a `CardContent` follows (the onboarding card tightens that to `pb-2.5`). `CardAction` puts a control top-right; `CardFooter` is a bordered 48px strip; a ghost button at its left edge takes `-ml-2` so its label aligns with the card content.

### Toast

`toast.success | error | warning | info | loading` from `@buzzkit/ui/components/sonner`. Firing the same kind+message twice pings the existing toast (shake for error/warning, bump otherwise) instead of stacking a duplicate. `toast.loading` is a promise toast underneath, so settling it by id cross-fades the spinner into the result icon. Toasts are translucent + blurred; their CSS is unlayered so it beats sonner's own stylesheet.

### ScrollArea / ScrollFade

Both fade the scrolling edges with a **mask on the scrolling element**, never a gradient overlay — an overlay has to guess the surface behind it and paints over the container's own border. `ScrollArea` adds a custom auto-hiding scrollbar; `ScrollFade` decorates a plain overflow container (or an existing one via `targetRef`). Fade size is `--fade-size`; edges animate via `@property`-registered lengths.

### Chat pieces — shared by the dashboard and the widget

The two chat surfaces render the same things, so the shared parts live here rather than twice:

- `MessageAttachments` — the tile row under a bubble (image thumbnail, or `FileTypeIcon` with the extension stamped on it). Takes a structural `MessageAttachment`, which both the workspace and client message serializers satisfy.
- `useAttachmentUploads` (`@buzzkit/ui/hooks/use-attachment-uploads`) — the composer's attachment state: 25 MB and empty-file validation, per-file upload status, removal. **The transport is injected**, because it legitimately differs: the dashboard posts to its own route so the browser never holds the API token, the widget uploads straight to the client files door with its client token.
- `AttachmentUploads` — the pending chips that pair with the hook.
- `formatBytes` (`@buzzkit/ui/lib/bytes`).

What stays per-app: the composer *shells* (the dashboard has internal-mode tabs and drag-and-drop and submits through a React Router fetcher; the widget calls a promise), and message rendering, because the dashboard shows internal messages and suggestions the client API must never serialize.

### Others

`Avatar` (+ `Image`, `Fallback`, `Badge`, `Group`, `GroupCount`) · `Separator` · `Skeleton` · `Spinner` · `Kbd` / `KbdGroup` · `SizeAnimator` (animates height around changing content) · `HighlightList` / `useAnimatedIndicator` (the sliding-indicator primitive) · `FileTypeIcon`.

---

## 10. Writing

- **Never an em dash, never an en dash, in any user-facing string.** Use a period, a comma, or a colon; spell ranges out ("3 to 48"). This covers labels, captions, errors, empty states, aria text — everything a user can read. (Code comments and this doc are exempt.)
- Meta titles join with a middle dot: `Acme · buzzkit`.
- Sentence case everywhere — buttons, headings, labels. **The widget is the one exception:** its titles and buttons are Title Case ("New Conversation", "Ask Us Anything"), which reads as product chrome on someone else's site rather than as that site's own copy. Descriptions stay sentences everywhere.
- Buttons start with a verb naming the action: "Save draft", "Delete project". Never "OK", never bare "Yes"/"No" on a consequential action.
- **Front-load the outcome and keep it short.** One line per description; if the title carries the meaning, drop the description entirely. Say what happens in plain words ("Sends the first message as that user"), not how it works.
- No jargon: product nouns like "publishable key" and "clientToken" stay; "idempotent", "payload", "envelope" never appear.
- Errors say how to recover, next to what broke: "Unable to reach the API. Check your connection and try again." No "Oops", no blame, no exclamation marks.
- **Promise liveness only where it is real.** "It appears here the moment it arrives" is a claim the socket must honor.
- Toggles are labelled for their ON state.
- Links describe their destination; never "click here" or a bare "Learn more".
- Empty states say what the place is and offer one next action.
- `text-balance` on titles, `text-pretty` on every description — no exceptions.

---

## 11. Accessibility contract

Non-negotiable, and verified on `/ui`:

- Every control has an accessible name; icon-only buttons take `aria-label`.
- Every field has a `<label for>`.
- Focus is `:focus-visible` with a visible ring. Never `outline-none` without a replacement — including read-only fields.
- Targets clear 24×24, extending with a pseudo-element rather than growing visually. Extended areas never overlap.
- Modals trap focus, close on Escape, and restore focus to the trigger.
- Toasts announce politely.
- Reduced motion is honored (§6).
- The layout reflows at 320px and 200% zoom with no horizontal scroll.
- Repeated navigation is preceded by a skip link.

---

## 12. Adding to the system

**A component:** `bunx shadcn add <name>` inside `packages/ui`, restyle to tokens, delete every color literal, apply the press pattern and the radius scale, then **add it to `/ui`** with every variant, size and state — including disabled and invalid.

**A token:** add the value to both `:root` and `.dark` in `globals.css`, map it under `@theme inline`, and document its role here. If a component needs a color no token covers, the missing thing is a token, not a hex.

**Never:** invent a size outside the type scale, borrow a token outside its role (`-4` as text, `fg-1` as text), or introduce a second styling approach.

---

## 13. Dashboard conventions

`apps/web` is Vite + React Router 8 (SSR) on Cloudflare Workers, deliberately **not** Next.js.

```
app/
  root.tsx                      Layout, providers, ErrorBoundary
  entry.server.tsx              Stock SSR entry
  cloudflare.ts                 `cloudflareContext`: env/ctx via RouterContextProvider
  routes.ts                     Route table
  lib/                          Server modules (`*.server.ts`: session cookie, API client, auth proxy)
                                and pure helpers (form, time, format)
  hooks/                        Client hooks (use-focus-first-error, use-time-ago)
  components/<feature>/         One directory per feature, presentational only:
                                auth/ · shell/ · workspace/ · onboarding/ · settings/ · system/
  routes/<segment>/index.tsx    File-based routes, mirroring the API convention
  routes/[slug]/layout.tsx      Layout route for nested segments (brackets for dynamic parts)
```

**IDs in URLs are always bare.** Paths and query params carry the unprefixed sqid (via `bareId` in `lib/format.ts`); the API accepts both forms. The prefixed form (`msg_…`) is for display and copy actions only.

**No comments in apps/web.** The dashboard's code carries no comments; naming, small modules, and this document do the explaining. The only exceptions are `TEMPORARY` markers on code scheduled for deletion and lint directives.

**`routes/` is for routes; `components/<feature>/` is for the presentational modules they render.** Every feature owns a directory and splits along its seams, one module per surface: `onboarding/` keeps the shell, the progress stepper, the choice cards, the guide engine, and one file per provider guide apart. Feature components are plain components (no loaders, no route entries) so they stay previewable and restylable; route files own loaders/actions and error mapping. Anything reusable beyond this app belongs in `@buzzkit/ui` instead (`LivePing`, `CodeBlock`).

`ErrorBoundary` lives in `root.tsx` because the name is React Router's contract: the framework renders that exact export when a route throws or nothing matches. It contains no markup of its own; it maps the thrown value onto a page component, picking `NotFoundPage` for a 404 (nothing broke, so it gets calmer copy and a real link home), `NoAccessPage` for a 403, and `ErrorPage` for everything else.

Theming is the shadcn Vite recipe: a `ThemeProvider` with `light | dark | system`, persisted to `localStorage` under `buzzkit-ui-theme`, applied by toggling the class on `<html>`, with `useTheme()` for consumers. `system` keeps following the OS via a `matchMedia` listener rather than only reading it once. `<html>` carries `suppressHydrationWarning` because the class is written on the client.

There is no inline pre-paint script, which is the one cost of the plain-React approach on SSR: a visitor whose stored theme is dark sees one light frame before hydration.

### Loaders are the source of truth, and the dashboard never polls

1. **Route loaders are the single source of truth.** Components render loader data; no client-side entity caches. Mutations go through route actions (`useActionFetcher` / `useFetcher`) and React Router revalidates the active loaders afterwards.
2. **The browser never holds the API token.** Every `/v1/*` call happens server-side in a loader or action with the bearer token from the signed session cookie (`docs/dashboard.md`).
3. **No `setInterval` fetching anywhere.** Live claims in copy ("appears the moment…") are reserved for a future realtime seam; until then waiting states use the live dot only where a navigation or action will settle them.
4. **Waiting states show the live dot** (§6 Restraint); arrival swaps it for the state change itself, never a toast announcing what the screen already shows.

### The onboarding guides

The onboarding is a single centered `Card` under four thin progress lines (no step numbers, no labels): `Card` anatomy throughout, choice rows with the press pattern (`::before` tint + `0.985` scale, never a shadow change), and the provider guide one sub-step at a time with `Back` / `Next` in the `CardFooter`. Sub-steps swap with the 0.3 bounce-0 spring inside a `SizeAnimator`; the progress fill moves on the 0.5 spring.

The provider guides (`components/onboarding/guides/*.tsx`) are **data**: an ordered list of sub-steps, each with a title, a one-line description, an optional outbound link, the field(s) it produces, and an `illustration` component. The guide engine (`provider-guide.tsx`) renders the current sub-step, validates its fields, and submits every field in one form.

Illustrations are laid out at a fixed design size (640×420) inside `Browser` and scaled to the frame with a transform, so they read as a thumbnail of the whole screen rather than a zoomed crop and nothing truncates. They are built from `components/onboarding/illustration.tsx` primitives only (`Browser`, `Sidebar`, `Page`, `MockButton`, `MockInput`, `MockCheckbox`, `MockRow`, `MockTabs`, `MockDialog`, `Spot`): a focused crop of the third-party dashboard, drawn in our tokens, with exactly one `Spot` ring (sky) marking the thing to click or copy. Structure and copy mirror the real product screens; colors and type are ours. Never paste screenshots.
