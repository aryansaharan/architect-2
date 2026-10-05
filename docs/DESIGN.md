# Prod AI design rules: Paper & Pencil

One idea holds the product together: **what people write is in pencil, what Prod AI types is in print.**
A plan is a pencil sketch on paper, the build inks it in, and the real app appears in its own clean theme
on the same sheet. Every screen, including the ones under the hood, is the same sheet of paper.

The generated apps (`components/renderer/*`) use their own slate theme on purpose. These rules cover
everything around them.

## Logo

The name is written **prod** with its **o** drawn as a quick pencil circle around a drop of ink, and a
small **AI** beside it: the gesture people use to pick what they want, and the point where it becomes
real. It lives in `components/brand/logo.tsx`.

- `Wordmark` is the name, wherever there's room (site headers, the architecture title block). Don't
  set "Prod AI" in plain type as a logo.
- `LogoMark` is the circle alone, where space is tight (the project top bar, "Built with Prod AI",
  the browser tab: `app/icon.svg`).
- The circle is brand green and the ink drop is ink (paper on dark). Nothing else is added to it.

## Type

Twelve sizes, defined as tokens in `app/globals.css`. Don't use arbitrary sizes such as `text-[13.5px]`.

| Role | Font | Class | Size |
|---|---|---|---|
| Landing headline | Caveat | `font-pencil text-[46px] sm:text-hero` | 60 (46 on phones) |
| Page title | Caveat | `font-pencil text-title` | 40 |
| Section heading | Caveat | `font-pencil text-section` | 30 |
| Note heading, sticky note | Caveat | `font-pencil text-note` | 22 |
| Sketch label, eyebrow, chip | Architects Daughter | `font-sketch text-sketch` | 13 |
| Lead paragraph | Hanken Grotesk | `text-lead` | 16 |
| Body | Hanken Grotesk | `text-body` | 14 |
| Buttons, menus, form labels | Hanken Grotesk | `text-ui` | 13 |
| Meta, captions, timestamps | Hanken Grotesk | `text-meta` | 12 |
| Pills, counters | Hanken Grotesk | `text-badge` | 11 |
| Code | JetBrains Mono | `font-mono text-code` | 12.5 |
| IDs, keys, paths | JetBrains Mono | `font-mono text-badge` | 11 |

- **Pencil (Caveat)** is for titles, headings and words a person wrote (notes, the brief). Never for
  figures, never for dense text, never below 22px.
- **Sketch (Architects Daughter)** is for labels on sketches, eyebrows and chips, at 13px only.
  Never for body text or sentences.
- **Figures** (credits, prices, percentages, counts) are grotesk with `tabular-nums`, never handwriting.
- **Mono** is for code, IDs, keys and paths only. Credits and dates are not code.
- `.micro-label` is the small uppercase label above a group, in the UI's grotesk.

## Colour

- **Ink** (`text-foreground`) and **muted** (`text-muted-foreground`) for text. `text-faint` for the least important.
- **Brand green** (`brand`) for the one primary action on a screen, the current selection
  (`bg-brand-soft ring-1 ring-brand/30`), links and focus.
- **ok** (the brand green) for success and live states: Published, connected, passed.
- **Semantic colours mean one thing each, only:** `read` green = an AI helper may read; `change` blue =
  may change something you can undo; `ask` rose = can't be undone, and destructive actions; `fix` violet
  = Prod AI fixing its own mistake. Never use them for decoration, info toasts, teammates or comment pins.
- **Errors** are ink with an icon (and a plain sentence), not rose. Rose is reserved for can't-undo.
- **No raw hex in TSX.** Use tokens: `hairline`, `hairline-hi`, `line-strong` (hover borders), `sticky`
  and `sticky-line` (sticky notes), `deep`, `panel`, `raised`, `canvas`.

## Surfaces

| Surface | Class | Use it for | Never |
|---|---|---|---|
| Paper | the page background (`bg-canvas`) | every page | |
| Sheet | `panel rounded-md` | the one main sheet on a page | more than one per page |
| Sketch | `sketch` or `sketch-soft` | things not yet real: a planned screen, a proposal, fix options | a shadow |
| Sticky note | `sticky-note` | an AI helper's identity, a starter example | form controls inside it |
| Card | `panel rounded-md` | data, settings, lists | a shadow beyond `panel` |
| Floating | `panel-raised rounded-lg` | menus, dialogs, popovers, toasts, command | |

- Radii: `rounded-sm` (3px, notes), `rounded-md` (6px, controls and cards), `rounded-lg` (10px, floating
  layers) and `rounded-full` (pills, avatars). Nothing else.
- Shadows: `shadow-hair`, `shadow-float`, `shadow-note`. Nothing lifts on hover.
- Selection looks the same everywhere: `bg-brand-soft ring-1 ring-brand/30` (or a brand border on a card).

## Components

- **Button** (`components/ui/button.tsx`): sizes `sm` (h-7), `default` (h-8), `lg` (h-10, a page's main
  action) and `cta` (h-11, the one action a page exists for). Don't override heights or font sizes with
  classes. `outline` already sits on paper; don't add `bg-panel`.
- **Segmented** (`components/arch/segmented.tsx`) and **PencilRadio** are the same control: one tab stop,
  arrow keys move. Use it for every small either/or (device, mode, speed). No native `<select>` for two
  to four options.
- **Pill** (`components/ui/pill.tsx`) for every status and count, with a tone from the colour rules.
- **Links** in text: `underline decoration-dotted underline-offset-4`. The wavy `pencil-underline` is for
  one word in a title only.
- **Loading**: the thing's outline in faint dashed pencil (`.skeleton`). Nothing sweeps or pulses.
- **Credits** are always written the same way: `12 credits` in text, `12 cr` only in a pill or counter.

## Motion

- Durations: 150ms hover, 250ms menus and panels, 450ms a page fade, and `ink-in` (1100ms) for a
  sketch becoming real. Constants are in `lib/motion.ts` (`EASE`, `SPRING`, `DUR`).
- One easing: `cubic-bezier(0.22, 1, 0.36, 1)` (`ease-paper` in CSS, `EASE` in motion/react).
- One spring: stiffness 480, damping 40.
- Presses: `active:translate-y-px`. No scaling.
- Loops run only while a build is running. No glows, no gradients, nothing that blinks.

## Words

The primary screens use plain words: AI helpers, test runs, Make it real, a change and its price,
version N, Publish. Developer words (agents, rehearsals, Work Orders, blueprints, save points, models)
belong under the hood and behind "Details for developers". Say what's simulated once, where it matters,
in plain words.
