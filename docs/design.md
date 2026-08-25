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

**Purple is for tags, labels and badges only** (tenant keys, Android, a message that is currently sending). Never accent chrome with it.

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

- **One typeface, never a monospace.** Ids, keys, code snippets, URLs and file names all set in Open Runde like everything else; there is no `--font-mono` token and `font-mono` is never used. Hierarchy and "this is a value" come from the `fg` ramp and `tabular-nums`, not from a second face.
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

JS animation is `motion/react` (Motion, formerly Framer Motion) only, for anything CSS transitions cannot express. Two specialised pieces sit beside it and are the required answer for their cases: **numbers that change animate with NumberFlow** (`@buzzkit/ui/components/number-flow`, the library wrapped with the one 400ms `cubic-bezier(0.22, 1, 0.36, 1)` timing for slide, spin and fade; never the raw `@number-flow/react`; always inside `tabular-nums`), and **short text that changes in place swaps with `TextSwap`** (`@buzzkit/ui/components/text-swap`): a button label that flips from `Next` to `Connect Apple`, a status word. It moves like a slot machine reel with memory: labels are remembered in the order they first appeared, moving to a later one rolls forward (new drops in from the top, old leaves through the bottom) and moving back to an earlier one rolls backward (new rises from the bottom, old leaves through the top), so `Next` returns from where it went (0.4s bounce-0 spring with a 3px blur resolving on the same curve, opacity on a 0.25s ease-out), and the box springs to the new text's width on the same curve so the button grows or shrinks smoothly. Overflow is solved the way NumberFlow solves it, not by clipping: the box carries a `0.5em` × `0.3em` padding zone, pulled back with negative margins so layout is unchanged, under a gradient mask that is fully opaque over the text at rest and fades to nothing across the zone, so while the width is still catching up, whatever pokes past the text area dissolves into the edge instead of being hard-cut or spilling into the button's padding. Letter-morphing libraries are out (they segment by word and degrade to a cross-fade the moment two labels share no word). Never hand-roll a digit roll or a text cross-fade, and never use a letter-morphing library for labels (they segment by word and degrade to a cross-fade the moment two labels share no word). Springs are `{ type: 'spring', duration: 0.3–0.5, bounce: 0 }` — **bounce is always 0**. `AnimatePresence initial={false}` everywhere, so nothing animates on page load. Layout-size moves (the inbox panel slide) run the 0.5 spring; small state swaps run 0.3.

### Icon size

**18px is the icon size.** An icon sitting in a button or inline with text is `size-4.5`; `Button` applies it to any svg child without an explicit size class, so callers never set it. Larger tiles (`IconTile`, 20px) and smaller marks are the deliberate exceptions, never a default.

### Toast copy

A toast title is one line, always: a short statement of what happened ("Email or password is incorrect", "Credential connected"). Anything that would push it to a second line, and any instruction ("Double-check your details or create an account."), goes into the `description`. Toasts are top-centred with a 16px offset (feedbase sat lower only because of its header). A toast is not clickable and shows `cursor-default`; only its action, cancel and close buttons get the pointer.

### Brand marks

Brand marks are icons like any other: `<Icon name='IconGithub' />` comes from Central, and marks Central does not carry (`IconResend`, and our own logo as `IconBuzzkit`) live in `packages/ui/src/components/icon/custom.ts`, drawn into the same 24×24 box and emitted into `paths.ts` by the generator when referenced. No separate brand components, no inline SVGs. On a sign-in button the mark runs at `opacity-100`; inside an `IconTile` it takes the tile's treatment. The sign-in button always reads "Continue with GitHub", whichever page it is on.

### Auth pages

`/login`, `/signup` and `/invite/:token` are the onboarding card without the progress lines (workspace creation at `/onboarding` is the onboarding card itself, step 1 active): a `max-w-md` `Card` centred on the page, title and one-line description in the header, the form in the content, and the alternate action ("Already have an account? Sign in") as the card footer. Sign in and create account are one form: header and footer swap instantly, Email, Password and the button never move, and the Name field rises out from behind Email (height, 24px translate, 0.95 scale, fade, 0.4s bounce-0 spring) when switching to create account. When GitHub is configured the card opens with a full-width `elevated` "Sign in with GitHub" / "Sign up with GitHub" button above an `or` divider, then the email form.

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

buzzkit controls press by deflating **only the background** by a fixed number of pixels. The label, icons and layout stay fixed, and every control deflates by the same amount whatever its width: a press is an **inset, never a ratio**, so a full-width dialog button, a sidebar row and a short "Create key" button all feel identical and nothing ever needs a per-instance override.

```tsx
// The fill and its shadow live on ::before, which is what deflates.
"before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
'before:transition-[background-color,box-shadow,inset] before:duration-150 before:ease-out',
'enabled:active:before:inset-x-(--press-inset-x) enabled:active:before:inset-y-(--press-inset-y)',
```

- The amounts are two tokens in `globals.css`: `--press-inset-x: 1px`, `--press-inset-y: 0.5px`, calibrated on the default 32px button (where the old `scale(0.975)` deflated roughly 1.3px × 0.4px, a touch too strong). Tune them there, never in a component.
- `HighlightList` reads the same tokens and converts them to a per-item `scale(x, y)` on its sliding indicator, so menu items, select items, sidebar rows and choice rows deflate by the same pixels as buttons.
- Anything **without** content — checkbox, radio, icon-only buttons — scales itself (`0.95` / `0.975`): their size is fixed, so a ratio is already a constant.
- Link buttons and ghost tabs have no background, so the text itself scales to `0.975`.
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

Country flags are `Flag` (`@buzzkit/ui/components/flag`): `<Flag code='DE' />` renders the 16px SVG from the app's `/flags/<code>.svg` (the set lives in `apps/web/public/flags`), decorative, with a 1px upward nudge so it sits on the text baseline next to the country name. Never an inline `<img>`.

Central Icons, exclusively:

```tsx
import { Icon } from '@buzzkit/ui/components/icon';
<Icon name='IconBell' className='size-4' />
```

- `scripts/generate-icons.ts` scans the repo for `name='Icon…'` **string literals** and generates `paths.ts`. Never build a name dynamically — the icon will not be bundled. It runs before dev/build/check-types.
- Icons paint via `currentColor`; state comes from CSS color, never a second asset.
- Default `size-4` (16px) inside controls; one stroke weight across the set.
- Decorative icons get `aria-hidden` automatically. Pass `ariaLabel` to make one meaningful (it then gets `role="img"`).
- Icons are generated in Central's **raw** mode: plain paths with `currentColor`, no `<mask>`, no ids. Render the same icon as often as you like, hidden or not; the masked mode's shared ids once turned a select's checkmark into a black rectangle whenever the first copy sat in a closed popup.
- `IconCheckmark1` is the checkmark, with `rotate-[4deg]` — the other checkmarks in the set are optically wrong at small sizes.
- **Glyph icons are solid: append `Filled`** (`IconPeopleFilled`, `IconTagFilled`) — any catalog name renders filled with the suffix. Outline is only for icons that have no meaningful fill: chevrons, arrows, checkmarks, the spinner.
- Filled icons render at **50% opacity automatically** (in the `Icon` component) — solid glyphs carry more ink than strokes, so this keeps both at the same visual weight. Override with an `opacity-*` class when a filled icon must be full-strength.
- **State lifts the opacity, on a 200ms fade:** menu and select items raise their icons to 100% while the sliding highlight sits on them (`data-indicator-here`); sidebar nav items raise theirs to **85%** for the active and highlighted item — text goes full `fg-4`, the icon stays a step quieter.

Components with an `icon` prop (`Button`, `Badge`, menu items) accept `icon='IconBell'` or `icon={{ name: 'IconBell', position: 'inline-end' }}`, and trim 2px of padding on the icon's side so the glyph sits optically level with the text edge.

---

## 9. Components

All from `@buzzkit/ui/components/<name>`.

### Button

A button's `loading` prop is the only busy state: it disables the button and swaps the icon for a spinner (leading when there is no icon) while the label stays, so the width and the meaning hold; never compose `{pending && <Spinner />}` by hand. Icon buttons keep their label 6px (`gap-1.5`) from the glyph at every size, not 8px (plain text buttons keep `gap-2`; the gap only matters once there is an icon): Central icons carry generous viewboxes, so the optical gap is already wider than the number. Chevrons are the extreme case and get their own treatment inside `Button` (`data-chevron`, set automatically for any `IconChevron*`): 16px glyph, 2px gap, 5px edge padding. Never tune these per instance.

`variant`: `default` · `elevated` · `soft` · `ghost` · `destructive` · `link`
`size`: `xs` (26px) · `sm` (30px) · `default` (32px) · `lg` (36px), plus `icon-xs` · `icon-sm` · `icon` · `icon-lg`
`icon`: `MenuItemIcon`

`default` is the single primary action on a view. `elevated` is the neutral workhorse. `soft` and `ghost` are secondary and tertiary; `ghost` rests in `fg-2` and only turns `fg-4` on hover and press, so a row of ghost actions reads as chrome until you reach for it. `destructive` only for irreversible actions. Use `xs` inside dense chrome such as a card footer.

### Badge

A value that belongs to a vocabulary (key kind, platform, channel, credential status, verified, revoked, sandbox, invalid) is never a hand-written `Badge` on a page: `apps/web/app/components/badges` owns the label and the colour for each value (`KeyKindBadge`, `PlatformBadge`, `ChannelBadge`, `CredentialStatusBadge`, `VerifiedBadge`, `RevokedBadge`, `SandboxBadge`, `SubscriptionStatusBadge`), so iOS is blue and Android purple on every screen without anyone remembering. Add a value there first, then use it.

`variant`: `default` · `purple` · `sky` · `blue` · `green` · `amber` · `orange` · `red` · `pink` · `solid`
`size`: `sm` (20px, `text-xs`) · `default` (24px, `text-sm`)

Status chips: `-1` tint + `-text`. Never interactive — if it needs a click, it is a Button.

### Input / Textarea

34px tall, `rounded-xl`, `bg-bg-2`. Focus draws a 1.5px outline plus ring; `aria-invalid` draws a 1px `red-4` ring at rest, so an error stays visible after leaving the field, and the focus ring turns red and thickens to 1.5px while editing. Read-only fields keep a quieter focus ring — never remove it. Textarea auto-grows via `field-sizing-content`.

Fields that fetch as you type (the subscribers lookup) take `loading`: the spinner fades in at the trailing edge, the field never grows a button. Searching is automatic, 300ms after the last keystroke, and the busy state covers both the wait and the navigation.

**Every field needs a real `<Label htmlFor>`.** A placeholder shows the expected format, never the label.

### Select

One trigger size, matching the default button (32px, `rounded-xl`). The popup aligns the selected item over the trigger (`alignItemWithTrigger`), takes the trigger's width via `w-(--anchor-width)`, and `SelectValue` mirrors the selected item's icon. Only the popup's surface animates in (it lives on `::before`; the list itself is the scroll container and its text lands instantly): over the trigger (Base UI's `data-side="none"`) the surface grows 0.975 → 1 from its centre in 150ms ease-out, picking up exactly where the trigger's press scale (`0.975`) let go; beside the trigger it fades in while growing from 95%. Closing is instant, no exit animation. Item padding is tuned so the aligned popup sits exactly over the trigger (list 4px + item 6px = trigger 10px).

### ScopePicker

`@buzzkit/ui/components/scope-picker`, the one picker for permission-like strings (API key scopes, webhook events, later agent scopes): a search field over collapsible groups. A group row carries a checkbox that stands for the group's wildcard (`subscribers:*`; groups without one select every option), the wildcard or label in mono, a count (`all`, `2`), and a chevron that rotates 90° in 150ms; its options fold open and closed with the sidebar's springs (unfold 0.3s, fold 0.2s, bounce 0, height auto + opacity). Picking every option of a group collapses the selection back into its wildcard; searching expands every matching group. Rows press with the shared inset tokens.

### Checkbox · Radio · Switch

18px, 18px, and 32×20 with a 16px knob. Each expands its hit area with `after:-inset-x-3 after:-inset-y-2` so the target clears 24×24 without growing visually. All three take `cursor-pointer` unless disabled.

### Tabs

`variant`: `default` (segmented — a sliding pill on `bg-bg-2`) · `ghost` (bare text switchers, no indicator; the content itself presses).

### PillTabs

Free-floating pill pickers (no track): header nav, inbox status filters, composer modes. **The pill is a clip-path window, never a color transition**: an aria-hidden copy of the label row in the inverted color sits on the pill background, clipped by an animated `inset(… round 9999px)` — mid-slide a label splits at the pill edge instead of cross-fading. `variant`: `primary` (black pill, inverted labels) · `amber` (internal-mode composer picker) · `soft` (`bg-bg-2`). On first mount the pill snaps to position and fades in over 150ms; only value changes animate the slide. Interactive elements are buttons by default; pass `renderItem` for router Links. Keep the root padding-free (the overlay aligns to its box) — pad a wrapper instead.


The clip window is driven by two numeric springs (one per edge, identical config) combined into the `clip-path` string every frame, never by animating the string itself: interpolating the string lets the two edges move at different rates, and the pill visibly stretches across every tab in between. A re-measure that lands on the same target (the page re-rendering while the pill is mid-slide) leaves the springs alone; only a genuinely new target snaps or slides.

### Nav lists (sidebars)

Vertical navs (the workspace sidebar, the `/ui` section nav) and pickers (the onboarding choice rows) share the menu mechanic via `useAnimatedIndicator`: one `bg-a2` highlight that **rests on the active item**, slides to the hovered item, and glides back on pointer leave — items never draw their own hover background. Text runs `fg-2` → `fg-4` under the indicator and stays `fg-4` on the active item; both transitions run 200ms so switching tabs shifts color instead of snapping. Group headers are quiet `text-xs fg-2` labels above their items. Active state must always be knowable with the pointer elsewhere.

### CodeBlock

Copyable snippet on `bg-bg-2`, `rounded-xl`: `text-xs` in the regular face, horizontal `ScrollFade` (hidden scrollbar, fade hint), clipboard button top-right on a solid `bg-bg-2` backing so scrolled code never shows through beneath it. The clipboard flips to a full-strength `green-4` checkmark for 1.5s via the icon-swap standard (§6) — it confirms the copy succeeded. No syntax highlighting — deliberately plain.

### DropdownMenu

Items share one sliding highlight from `HighlightList` rather than each drawing its own hover. `DropdownMenuItem variant='destructive'` tints the indicator red. Submenus offset 12px. **`DropdownMenuLabel` must sit inside a `DropdownMenuGroup`** — Base UI throws otherwise, which kills hydration silently.

### Dialog / AlertDialog

Dialogs carry a title and the form, nothing else: no `DialogDescription` restating what the fields already say. `AlertDialog` is the exception, its description is the consequence the user is confirming.


Centered, 420px (`size='sm'` → `max-w-xs`), `rounded-3xl`, 20px padding (`p-5`), 16px between header, body and footer. Title (`text-xl`) over description (`text-sm`), both centered and balanced, 2px apart (`gap-0.5`). AlertDialog is for destructive confirms: two actions splitting the width 50/50, and the confirm button **repeats the consequence** ("Delete workspace", never "Delete").

### IconTile

A glyph on a soft `bg-2` surface, the one way an icon sits on its own: `size` `sm` (32px tile, 18px glyph: dense rows, card titles) · `default` (34px / 20px, the input height: choice rows) · `lg` (48px / 28px: empty states, headers). It always wears its 1px `bg-4/70` hairline ring; that ring is part of the component, not something a caller adds, and there is no ring-less variant. `tone` themes it in any accent ramp (`green` for success, `red` for errors, …): the glyph takes the ramp's `-4` at 85% (red, the loudest ramp, at 70%), the fill is `-4` at 15%, the ring `-4` at 25%, so one rule covers every color and both themes. Callers never compose these classes by hand. Never change its fill on hover. `EmptyState`, the file drop zone, the icon gallery on `/ui` and every list row that leads with an icon use it; a glyph on a surface is never hand-rolled.

### Time

Every time the UI shows, relative or absolute (created, updated, last used, last seen), is hoverable and reveals the exact time: `TimeAgo` (relative, ticks every minute) and `Time` (`Aug 24, 2026`) in `apps/web/app/hooks/use-time-ago.tsx`, both rendering a `<time dateTime>` with a 150ms-delay tooltip carrying `exactTime` (`Aug 24, 2026, 12:58 PM`). A bare `formatDate()` in JSX is a bug.

### Table

`@buzzkit/ui/components/table`. Lives inside a `Card`, edge to edge: hairline rows (`border-bg-3`), header cells `text-xs` `text-fg-2` at 36px, body cells `text-sm` `text-fg-3` with the identifying column `font-medium text-fg-4`, 12px horizontal padding and 16px at the card edges. Every cell is `whitespace-nowrap` and the wrapper is `overflow-auto`, so a narrow viewport scrolls the table sideways and never the page. `Table` is a column: a scroll viewport (`overflow-auto`, `min-h-0 flex-1`) holding the `<table>`, and below it anything that must never scroll. The header is sticky inside the viewport (`border-separate` table, hairlines drawn on cells so the sticky row keeps its line); when a page pins the table, the card takes `min-h-0` and the rows scroll in both directions while `TablePagination`, composed as the last child of `Table` and lifted out of the viewport by it, stays put across the full width: a 36px row (`border-t`, `text-xs`) holding "Page 1 / 3 (131)" (NumberFlow, the total in `fg-1`) and Previous / Next as `xs` ghost buttons that navigate through `LinkProvider`; it only exists when there is more than one page. Rows are not pressed and have no hover; table cells use `cursor: auto` (set in `globals.css`), so the I-beam appears only over the glyphs and the arrow over a cell's whitespace; per-row actions sit in a trailing `…` menu in a `w-0` cell. A row's category gets its own column as a `Badge size='sm'`, one colour per category (keys: Workspace blue, Tenant purple, Client green); state badges (`Revoked`, red) sit after the name; secondary counts (scopes) carry a dotted underline and a tooltip listing the detail; empty values say the word (`Never`, `All tenants`) in `text-fg-2` rather than a dash. Every time in a table goes through `Time` / `TimeAgo` (exact time on hover).

### Avatar

People and workspaces with a picture use `AvatarImage`. Everything else gets a generated picture, never an initial: `<Avatar name={externalId} />` renders a `PastelAvatar` **orb**, a lit sphere in a single accent ramp (`-3` shading to `-2` towards a plain white highlight), picked from the name with its own hash, so a subscriber and a workspace never share a look even from the same string (tiles are diagonal blends of two neighbouring ramps on a superellipse; orbs stay in one hue and are fully round: one colour per person keeps a list of them calm). Pure tokens, so it renders on the server, follows the theme and needs no network. `AvatarFallback` (initials) remains for a person whose real image fails to load. The Kodama faces that preceded this were dropped together with the shader spheres: generated art in buzzkit comes from the token ramps.

### BlurImage

`@buzzkit/ui/components/blur-image`: an `<img>` inside a `bg-3` frame, `opacity-0 blur-[4px]` until `load` (or already complete from cache), then `opacity-100 blur-0` on a 300ms ease-out; an optional `placeholder` sits centred underneath. Use it for any remote picture that would otherwise pop in.

### EmptyState

Every empty state is an `EmptyState`, never a sentence, with no exceptions: an empty list, a lookup that found nothing, a filter with no matches, an empty section inside a card. Title is the plain fact, short ("No subscriber found", "No API keys yet", "No topics yet"), the description says where the first one comes from or what to check, quoting the user's own input in curly quotes. Inside a card use `size='sm'`: a 32px tile, `text-sm` title, `text-xs` description, `p-6` with half the top padding (`pt-3`) because the card title above already carries its own.

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

### FilterBar

Every filterable table gets the same row above it: `FilterBar` holding, left to right, one `FilterSelect` per facet whose empty state reads "Any status" / "Any channel" and whose trigger turns `fg-4` once something is picked, a `FilterClear` ghost button that only appears while anything is active, and on the far right a `FilterSearch` (a magnifying-glass input with the debounced `loading` spinner). The bar is `justify-between`: the facets form one group on the left, the search field sits alone on the right. It pulls the table 10px closer (`-mb-2.5` against the page's 20px rhythm, so 10px), because it belongs to the table, not to the page. The components are fully controlled and know nothing about routing: the dashboard's `useFilters` hook keeps the values in the URL (`?q=&status=&…`), drops the page cursor whenever a filter changes, and applies typed search 300ms after the last keystroke. Time is its own facet, `FilterRange`: a select of presets (the dashboard passes Last 24 hours, 7 days, 30 days, 90 days, 12 months; the API takes any `from` / `to`, the presets are only convenience) plus a "Custom range" item that, instead of selecting, opens a `Popover` anchored to the trigger with a two-month range `Calendar` (react-day-picker restyled to the tokens: 32px cells, neighbouring months' days in `fg-1` so each month reads on its own, today on a `bg-a1` tile, `bg-a1` for the span, `primary-4` for the two ends, future days disabled), a live "Jun 3 – Jun 17" readout and Cancel / Apply. Applying emits `YYYY-MM-DD..YYYY-MM-DD`, which the select then shows as its own item ("Jun 3 – Jun 17"), so the trigger always names the window; presets emit their key. The page turns either into `from` / `to` for the API (`resolveRange` in `use-filters.ts`; custom days run from 00:00 to 23:59:59 UTC). A facet with many values passes groups instead of a flat list (`{ label, options }[]`, rendered as `SelectGroup`s with a quiet `SelectLabel` each; the Events page lists thirty event names under their object), the "Any …" item staying first and ungrouped. Never invent per-page chips or "Add filter" menus; the facets are few and fixed, so show them.

### PastelAvatar

Workspaces never show an initial: a workspace without an uploaded picture gets a **pastel gradient tile**, a `linear-gradient` between two *neighbouring* accent ramps (`purple-2 → pink-3`, `sky-2 → blue-3`, `green-2 → yellow-3`, …) picked deterministically from the slug, with a soft radial highlight in the top corner so it reads as a rounded object. The highlight is plain white in both themes (a specular glow does not turn black at night), and every ramp stop goes through `light-dark()`: the `-2` / `-3` ramp by day, and by night the accent `-4` lifted toward white (45% for the light stop, 25% for the dark one), because the dark ramps' own `-2` / `-3` are deep and saturated and would turn the tiles into neon. The root sets `color-scheme` per theme so `light-dark()` and native controls follow the toggle. Otherwise it is built entirely from the ramp tokens, so it renders on the server, follows the theme and sits in the same family as the badges. A shader-generated avatar was tried and dropped: too strong for a soft, playful palette. People keep initials or their uploaded image; the gradient is for workspaces.

### Truncate

`Truncate` is the only way to cut a line of data-driven text: it renders `truncate` and, when the text really is clipped (measured with a `ResizeObserver`, so it follows resizes), shows the full text in a tooltip after the same 150ms every time stamp uses. Text that fits never gets a tooltip. A bare `<span className='truncate'>` is fine for static labels only (navigation, headings); names, descriptions, addresses, message titles, endpoints go through `Truncate`.

### ScrollArea / ScrollFade

Both fade the scrolling edges with a **mask on the scrolling element**, never a gradient overlay — an overlay has to guess the surface behind it and paints over the container's own border. `ScrollArea` adds a custom auto-hiding scrollbar; `ScrollFade` decorates a plain overflow container (or an existing one via `targetRef`). Fade size is `--fade-size`; edges animate via `@property`-registered lengths.

Every overflow region on a dashboard page gets one — a content column, a side column, a table viewport — there is no bare `overflow-auto` without fades. A detail page with a side column is two independent scroll columns, each with its own fade, never one page scroller whose fade also dims the column that is not scrolling. The columns are wheel-linked: a wheel over either column also moves the other by the same delta (each clamps on its own), so the page scrolls as one no matter where the pointer is, and a short side column still scrolls the content. And an overflow container never hugs its cards: give it a few pixels of padding pulled back with a matching negative margin (`-m-1 p-1`, `-mx-8.5 px-8.5`) so the 1px ring and shadow of the first and edge cards are not clipped at the scroller's edge.

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
- Meta titles join with a middle dot: `Acme · BuzzKit`. The product is written **BuzzKit** everywhere a user can read it, including example values inside illustrations; `buzzkit` stays lowercase only in package names, slugs, hostnames and code.
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

Illustrations are laid out at a fixed design size (640×400) inside `Browser` and scaled to the frame with a transform, so they read as a thumbnail of the whole screen rather than a zoomed crop and nothing truncates. The scale is pure CSS (`scale(calc(100cqw / 640px))` inside an `@container` frame of the same 16:10 ratio), so the server-rendered page is already at its final size and there is no measure-then-resize shift on first paint. Likewise the ring skips its delayed entry on the very first paint after a page load, where it would only appear a second late; it animates in on every step change after that. They are built from `components/onboarding/illustration/` primitives only (`Browser`, `Sidebar`, `Page`, `MockButton`, `MockInput`, `MockCheckbox`, `MockRow`, `MockTabs`, `MockDialog`, `Spot`): a focused crop of the third-party dashboard, drawn in our tokens, with exactly one `Spot` ring marking the thing to click or copy. The ring is one 2px `sky-4` ring and nothing else: no offset, no inner hairline, no fill, sitting `-inset-1` outside the target (wider insets only when the target has no padding of its own), on the target's own radius. It arrives only once the step transition has landed and been read: 0.6s after mount it fades in while settling from 1.12 to 1 (0.4s spring, bounce 0); earlier than that the user is still processing the slide and would miss it. Every two seconds it pulses once, a soft halo swelling 10px outward and fading, so the eye finds it on a busy mock without the ring shouting the rest of the time; `MockRow highlight` is the same ring and pulse on a table row. `SpotRing` in `illustration/spot.tsx` is the only source of the ring, its entry and its pulse; `Spot` and `MockRow highlight` both render it. Structure and copy mirror the real product screens; neutrals and type are ours, and the third party's own accent is kept for its primary actions (`MockButton variant='accent'`: Apple and Firebase blue) so the next thing to press reads as it does in their UI. Never paste screenshots. Never clip inside a padding: the `Browser` box clips at its own border, the card clips at its edge, and nothing in between carries `overflow-hidden`, or borders and slide transitions get cut.
