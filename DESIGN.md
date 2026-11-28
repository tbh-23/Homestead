# Design System: Harrington — Storybook Meadow

Design system specification extracted directly from Harrington's frontend source (`tailwind.config.cjs`, `src/css/styles.css`, and `src/js/views/*`). All user-facing copy uses Australian English (`colour`, `practise`/`practice`, `organise`, `maths`).

## 1. Visual Theme & Atmosphere

**Storybook Meadow** is a warm, daylight-first family learning workspace designed to feel like an illustrated children's picture book printed on cream cotton paper rather than a clinical corporate dashboard.

- **Surface Temperature & Lightness**: Light-only (`color-scheme: light`), grounded in warm Cream Paper (`#fbf6ec`) with elevated Warm Card (`#fffdf8`) surfaces and sunlit Meadow Sky (`#e3eff6`) header hero bands featuring gently rolling hill illustrations.
- **Physical Metaphor & Density**: Soft, unhurried editorial spacing with generous touch targets, rounded organic corners (`1.5rem`–`1.75rem`), subtle grounded warm shadows (`rgba(94, 78, 48, 0.38)`), and zero harsh black borders or glassmorphism bloat.
- **Accessibility & Calmness**: Pastel tones are strictly fills; every pastel fill pairs with its matching `*-deep` ink partner so all text maintains ≥ 4.5:1 WCAG AA contrast. Mastery scores and assessment metrics are parent-only and never surfaced inside the Child View.

## 2. Color Palette & Roles

### Primary Foundation
- **Cream Paper (`#fbf6ec`, `paper`)**: Primary viewport and canvas background.
- **Warm Card (`#fffdf8`, `paper-card`)**: Primary elevated container surface for `.meadow-card` panels, modals, and sheets.
- **Parchment Hairline (`#ede3cf`, `paper-line`)**: `1px` structural borders, dividers, and input outlines.
- **Pressed Parchment (`#f4ecda`, `paper-deep`)**: Subtle hover states, secondary pill backgrounds, and recessed surfaces.

### Accent & Interactive
- **Meadow Brand Green (`#3f6b3b`, `brand`)**: Primary call-to-action fills, range slider accents, mastery bars, and key interactive highlights.
- **Forest Green (`#2e4f2b`, `brand-dark`)**: Hover/pressed state for primary buttons and high-contrast text on light sage pills.
- **Soft Sage Wash (`#e4eedf`, `brand-light`)**: Skill-tree canvas backdrop, subtle success washes, and status badges.
- **Active Sage (`#a9c9a0`, `sage`)** with **Meadow Green (`#3f6b3b`, `sage-deep`)** and **Pale Sage (`#cfe0c6`, `sage-light`)**: Active navigation pill (`.nav-active`), mastered states, and positive progress fills.
- **Buttercup Yellow (`#f2c14e`, `butter`)** with **Honey Ochre (`#8a6412`, `butter-deep`)** and **Warm Cream (`#fbecc4`, `butter-light`)**: Keyboard focus rings (`3px solid #f2c14e`), Child View launch button, and warm highlights.
- **Meadow Sky (`#bfdcec`, `sky`)** with **Deep Sky (`#2f6285`, `sky-deep`)** and **Morning Sky (`#e3eff6`, `sky-light`)**: Hero header illustration band (`.meadow-hero`) and World Map canvas background (`.world-map`).
- **Soft Lavender (`#d6caea`, `lavender`)** with **Plum (`#5b4a86`, `lavender-deep`)** and **Mist Lavender (`#eee8f6`, `lavender-light`)**: Secondary subject accents and reading/phonics highlights.

### Typography & Text Hierarchy
- **Espresso Ink (`#2e2a24`, `ink`)**: Primary headings, body copy, active navigation labels, and bold prose.
- **Warm Umber (`#5f574c`, `ink-soft`)**: Secondary descriptions, card subtitles, and helper text.
- **Muted Stone (`#6f665a`, `ink-faint`)**: Metadata, timestamps, uppercase micro-labels, and subtle captions.

### Functional States
- **Terracotta Rose (`#a4473a`, `rose-deep`)** on **Blush Wash (`#fbe5de`, `rose-light`)** with **Soft Rose (`#f3b7a8`, `rose`)**: Validation errors, destructive buttons, voice recording indicators, PIN lockout alerts, and blocking prerequisite pulses.
- **Mastery Progression**:
  - `Not started`: Pressed Parchment (`#f4ecda`) / Muted Stone (`#6f665a`)
  - `Learning` / `Practising`: Buttercup (`#fbecc4` / `#8a6412`) or Sky (`#e3eff6` / `#2f6285`)
  - `Mastered`: Meadow Green (`#3f6b3b`) / Soft Sage (`#e4eedf`)

## 3. Typography Rules

All fonts are locally self-hosted variable/static WOFF2 files (SIL OFL 1.1, zero third-party font CDN requests):

- **Fraunces Variable (`font-display`)**: Warm, soft, slightly playful storybook serif (`font-variation-settings: 'SOFT' 100, 'WONK' 1; letter-spacing: -0.01em`) used for greetings, page titles, modal headers, and World Map realm labels.
  - Hero greeting (`h1`): `30px`–`36px` (`text-3xl`/`text-4xl`), weight `600`, line-height `1.15`.
  - Section & modal headings (`h2`/`h3`): `18px`–`24px` (`text-lg`–`text-2xl`), weight `600`, line-height `1.25`.
- **Lexend Variable (`font-sans`)**: High-legibility sans-serif engineered for reading fluency, used for all UI controls, navigation, descriptions, and body prose.
  - Body copy: `14px`–`15px` (`text-sm`), weight `400`–`500`, line-height `1.5`.
  - UI buttons & nav items: `13px`–`14px`, weight `500`–`600`.
  - Metadata & micro-labels: `11px`–`12px` (`text-xs`), weight `500`–`600`, uppercase tracking `0.05em` where used as section kickers.
- **Andika (SIL OFL)**: Dedicated early-reader literacy font used exclusively for printable and on-screen **Decodable Books** (`16px`–`22px`, pure black `#000000` on white paper, single-storey `a` and `g` letterforms for beginner phonics).

## 4. Component Stylings

- **Meadow Cards (`.meadow-card`)**: `#fffdf8` surface, `1.75rem` (`rounded-3xl`) radius, no hard border, grounded warm shadow (`0 1px 0 rgba(46,42,36,.04), 0 14px 30px -20px rgba(94,78,48,.38)`), `20px`–`24px` internal padding. Hoverable cards lift `-2px` (`card-hover`).
- **Buttons**:
  - Primary: Full pill (`rounded-full`) or soft pill (`rounded-xl`), Meadow Brand Green (`#3f6b3b`) fill, white text, `40px`–`44px` height, transitions to Forest Green (`#2e4f2b`).
  - Secondary: Warm Card (`#fffdf8`) or Cream Paper (`#fbf6ec`) fill with `1px` Parchment (`#ede3cf`) border, Espresso Ink (`#2e2a24`) text.
  - Child View CTA: Buttercup Yellow (`#f2c14e`) pill with Espresso Ink (`#2e2a24`) bold text and seedling icon.
- **Navigation Shell**:
  - Desktop (`>= 1024px`): Fixed left sidebar (`240px`–`260px`) on Cream Paper with learner selector pill at top, vertical route list with Active Sage (`#a9c9a0`) pill highlight, and "Private family space" action card (Export, Import, Child-view PIN, AI provider) anchored at the bottom.
  - Mobile (`< 1024px`): Sticky top header (`Harrington` emblem, Guide, Notification bell, Learner avatar pill) + fixed bottom 5-tab navigation bar (Dashboard, Calendar, Map, Records, Insights) with `pb-24` scroll clearance.
- **Inputs & Modals**: Rounded `0.875rem`–`1rem` (`rounded-lg`/`rounded-2xl`) fields on `#fbf6ec` with `1px` `#ede3cf` border and Buttercup (`#f2c14e`) focus ring. Modals sit inside a centred Warm Card sheet (`rounded-3xl`) over a soft dark scrim (`bg-ink/40 backdrop-blur-sm`).
- **Domain Components**:
  - **Meadow Hero (`.meadow-hero`)**: Morning Sky (`#e3eff6`) rounded banner (`1.75rem`) layered over an inline rolling-hills-and-clouds SVG scene, greeting the active learner with quick actions (`Record what happened`, `Note`, `Open map`, `<Learner>'s view`).
  - **World Map & Skill Tree (`.world-map`, `.skill-tree-scroller`)**: Illustrated curriculum realms on `#e3eff6` transitioning into circular `52px` `.skill-orb` nodes on `#e4eedf` with a side `.quest-log` detail drawer (`22rem` desktop, stacked below `800px`).
  - **Decodable Book Cards & Print Sheets**: High-contrast black-and-white outline line art on white cards with Andika text, stage badges, and A5/A4 booklet print controls.

## 5. Layout Principles

- **Viewport & Grid**: `1280x800` desktop standard with a `max-w-5xl` (`1024px`) content column inside the main scroll area; `4px` / `8px` spacing grid; `16px`–`24px` card gutters; `min-w-0` enforced on every flex/grid item and `[overflow-wrap:anywhere]` on learner name slots so 360 px–412 px phones never scroll horizontally.
- **Breakpoints**:
  - Mobile phone: `360px`–`412px` single-column stack, wrapped header action rows, fixed bottom nav bar.
  - Tablet (`768px`–`1023px`): Two-column summary cards, stacked quest log below `800px`, generous `44px+` touch targets for kids.
  - Desktop (`>= 1024px`, `lg:`): Left sidebar + 2-column dashboard layout (`Today's path` / `Recent growth` alongside weekly progress, mastery ring, and learner interests).
- **Tablet & E-Ink Readiness**: Warm light surfaces, clear borders, high-contrast ink pairs, and `prefers-reduced-motion: reduce` support keep screens calm and legible on matte/paper-like tablets (TCL NXTPAPER, BOOX).

## 6. Design System Notes for Stitch Generation

- **Atmosphere keywords**: Storybook Meadow, warm cream paper (`#fbf6ec`), soft serif headings (`Fraunces`), clean reader-friendly sans (`Lexend`), rolling green hills illustration, tactile rounded cards (`1.75rem`), calm family learning workspace, zero neon/glassmorphism clutter.
- **Canonical colour anchors**: Cream Paper `#fbf6ec`, Warm Card `#fffdf8`, Meadow Brand Green `#3f6b3b`, Active Sage `#a9c9a0`, Buttercup Yellow `#f2c14e`, Morning Sky `#e3eff6`, Terracotta Rose `#a4473a`, Espresso Ink `#2e2a24`.
- **Example component prompts**:
  - *"Design a calm parent Dashboard card on Warm Card `#fffdf8` (`1.75rem` radius, soft warm shadow) with a Fraunces heading, Lexend body copy, and Meadow Brand Green `#3f6b3b` pill actions over a Cream Paper `#fbf6ec` canvas."*
  - *"Design a distraction-free Child View tablet home screen on `#fbf6ec` with big Buttercup `#f2c14e` and Active Sage `#a9c9a0` activity cards, large `52px+` touch targets, zero scores or grades, and a top-right Grown-ups lock button."*
  - *"Design an E-Ink / High-Contrast tablet reading mode for Harrington's Decodable Books using crisp `#000000` Andika typography, pure `#ffffff` background, `2px` solid black borders, zero shadows or animations, and generous page-turn buttons."*
