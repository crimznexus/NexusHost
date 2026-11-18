# NexusHost Design System

## 0. Research Log

- Embedded refs: the installed frontend skill ships only one Layer B file (`aside.md`); `taste-skill.md`, `raycast.md`, `linear.app.md` and `supabase.md` are listed in its index but missing on disk. Picked `aside.md` (neutral ink ramp, hairline dividers, squircle vs pill radii, 150 ms control motion) + `layout-skill.md` (fixed-sidenav shell, scroll ownership) + `design-system-architecture.md` (this structure).
- Lazyweb: skipped. This is an offline desktop control panel; time went to the server features the user asked for.
- Imagen drafts: skipped, no image-generation tool in this session.
- Skipped lanes are recorded as accepted debt in Section 8.

## 1. Atmosphere & Identity

A quiet machine room you can see into. Mostly neutral graphite (dark) or paper (light) surfaces with hairline dividers, dense where data lives (console, lists) and calm everywhere else. The **signature is the status beacon**: a lit, layered lamp on the dashboard whose colour and glow carry the server state (grass-green online, amber starting/stopping, ember-red crashed, unlit grey stopped). It is the only place colour glows; the rest of the UI stays ink-on-neutral so state is impossible to miss.

## 2. Color

Light/dark follow the OS (`prefers-color-scheme`).

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Surface/base | --surface-0 | #f6f6f4 | #0e1012 | Window background |
| Surface/panel | --surface-1 | #ffffff | #15181b | Panels, sidebar |
| Surface/raised | --surface-2 | #f0f0ee | #1c2024 | Inputs, rows on hover, chips |
| Surface/overlay | --surface-3 | #ffffff | #22272c | Dialogs, menus |
| Ink/primary | --ink-1 | #0b0d0e | #eef0f1 | Body, headings |
| Ink/secondary | --ink-2 | #5f6469 | #a3a9ae | Labels, hints |
| Ink/tertiary | --ink-3 | #8d9296 | #6d7378 | Disabled, timestamps |
| Line/default | --line | rgba(0,0,0,.08) | rgba(255,255,255,.08) | Dividers, panel edges |
| Line/strong | --line-strong | rgba(0,0,0,.14) | rgba(255,255,255,.14) | Input borders |
| Wash/hover | --wash-1 | rgba(0,0,0,.04) | rgba(255,255,255,.05) | Hover fill |
| Wash/active | --wash-2 | rgba(0,0,0,.07) | rgba(255,255,255,.09) | Selected nav item, pressed |
| Accent | --accent | #2f8f4e | #4cc26d | Primary action fill, links, focus ring |
| Accent/ink | --accent-ink | #ffffff | #06210f | Text on accent |
| Accent/hover | --accent-hover | #277a42 | #5fd27f | Primary hover |
| Status/online | --st-online | #2f9e57 | #4cd27a | Beacon, dots |
| Status/busy | --st-busy | #c98a12 | #f2b33d | Starting, stopping |
| Status/error | --st-error | #cc3d32 | #ff6b5e | Crashed, destructive |
| Status/idle | --st-idle | #9aa0a5 | #5c6369 | Stopped |
| Console/bg | --console-bg | #101315 | #0a0c0d | Console panel (always dark) |
| Console/ink | --console-ink | #d6dadd | #d6dadd | Console text |
| Console/warn, error, command, system | --console-warn / -error / -cmd / -sys | #f2c86b / #ff8a80 / #8fd8a8 / #8fb7e6 | same | Console line levels |
| Console/line, field, field-line | --console-line / -field / -field-line | white at .08 / .06 / .12 | same | Console dividers and input |

Ramp for the beacon glow: each status colour is used at 100% (core), 45% (halo, blurred) and 14% (ambient wash).

Rules: accent only on interactive elements and the online state. Destructive buttons use `--st-error`. No other colours.

## 3. Typography

Fonts are system fonts so the app works offline: **Segoe UI Variable Text** (UI), **Segoe UI Variable Display** (page titles and numbers), **Cascadia Mono / Consolas** (console, addresses, file editor).

| Level | Size | Weight | Line height | Tracking | Usage |
|---|---|---|---|---|---|
| Display | 30px | 600 | 1.15 | -0.01em | Dashboard server name |
| H1 | 22px | 600 | 1.25 | -0.005em | Page title |
| H2 | 16px | 600 | 1.35 | 0 | Panel titles |
| Body | 14px | 400 | 1.5 | 0 | Default |
| Body/strong | 14px | 600 | 1.5 | 0 | Row titles |
| Small | 13px | 400 | 1.45 | 0 | Secondary text in rows |
| Caption | 12px | 500 | 1.35 | 0.01em | Labels, metadata |
| Overline | 11px | 600 | 1.3 | 0.08em | Section labels (uppercase) |
| Metric | 26px | 600 | 1.1 | -0.01em | Stat values (tabular numbers) |
| Mono | 12.5px | 400 | 1.55 | 0 | Console, code |

Body never below 12px; 12px only for captions/metadata.

## 4. Spacing & Layout

Base unit 4px: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 20, `--s6` 24, `--s8` 32, `--s10` 40.
Radii by role (Aside's squircle/pill split): `--r-sm` 6px (chips, inputs), `--r-md` 10px (buttons, rows), `--r-lg` 14px (panels), `--r-pill` 999px (status pills, toggles).

Shell: **fixed-sidenav-shell**. Grid columns `232px 1fr`, height `100dvh`. Sidebar is fixed; the page body (`.page`) owns vertical scroll. The console page is a **scroll-body-shell**: header + command bar fixed, the log list owns scroll. File editor and log viewer: the text area owns scroll. Content max width 1120px inside `.page`. Panels in a page use the intrinsic grid `repeat(auto-fit, minmax(min(18rem, 100%), 1fr))`.

## 5. Components

### Button
- Structure: `<button class="btn btn--{primary|secondary|ghost|danger}">[icon] label</button>`
- Spacing: height 34px (sm 28px), padding-inline `--s4` (sm `--s3`), icon gap `--s2`, radius `--r-md`.
- States: hover (accent-hover / wash-1), active (scale .97 + wash-2), focus-visible (2px accent ring offset 2px), disabled (opacity .45, no pointer), loading (spinner replaces icon, label kept, disabled).
- A11y: native button, visible focus, icon-only buttons carry `aria-label` + `title`.

### Panel
- `<section class="panel"><header class="panel__head"><h2/>[actions]</header><div class="panel__body"/></section>`
- Surface-1, 1px `--line` edge, radius `--r-lg`, padding `--s5`. Empty state: centred icon + one line + optional action.

### Field family (Input, Select, Toggle, Slider, Textarea)
- Label (Caption, ink-2) above control, hint below (Small, ink-3). Control height 34px, surface-2, 1px `--line-strong`, radius `--r-sm`.
- States: hover (line becomes ink-3 alpha), focus-visible (accent ring), disabled, error (line + hint in `--st-error`).
- Toggle: pill track 36x20, knob translateX; checked = accent fill + check glyph inside knob (state not by border).

### NavItem
- `<button class="nav__item" aria-current>` icon + label (+ optional count). Selected: wash-2 fill + ink-1 text + bold icon stroke. Never a coloured edge.

### StatusPill
- Dot (8px) + label, pill radius, surface-2. Dot colour from status tokens; online dot has a soft pulse (opacity only, disabled under reduced motion).

### StatusBeacon (signature)
- Layered: ambient wash disc (14%), blurred halo (45%), glossy core (gradient from status colour to darker 70%, inner highlight), thin rim. 96px. Starting/stopping: halo breathes (opacity/scale 0.96-1.04, 1.6s). Stopped: core unlit graphite, no halo.

### Stat
- Overline label, Metric value (tabular-nums), optional caption. Lives in a `cluster`.

### Row (list item)
- Grid: [leading avatar/icon] [title + meta] [trailing actions]. Height ≥ 52px, padding `--s3 --s4`, divider `--line` between rows. Hover wash-1. Long titles truncate with ellipsis; unbroken strings use `overflow-wrap:anywhere`.

### Dialog
- Native `<dialog>` modal, surface-3, radius `--r-lg`, shadow prominent, max-width 480px. Title (H2), body, footer buttons right-aligned. Esc closes; focus moves to first control.

### Toast
- Bottom-right stack, surface-3, icon by kind, auto-dismiss 4.5s (errors 8s), `role="status"`.

### Progress
- 4px bar track surface-2, fill accent (transform scaleX). Indeterminate: sliding segment.

### ServerSwitcher + Menu
- Sidebar header button (server icon, name, server count, chevrons) opening a Menu popover: surface-3, radius `--r-lg`, shadow-3, 300px wide.
- Menu items: icon + title + caption (version and folder); the active server has wash-2 fill and a check glyph (never a coloured edge). Disabled items (another server running) at .45 opacity with a note below.
- Closes on outside click and Esc. Layout: absolute overlay below the header; the sidebar nav keeps its own scroll.

### Tabs (segmented)
- Pill group on surface-2; selected segment surface-1 + shadow subtle.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---|---|---|
| Micro | 120ms | ease-out | Button press, toggle knob, hover fills |
| Standard | 200ms | cubic-bezier(.2,.8,.2,1) | Page swap fade, dialog in, toast in |
| Ambient | 1600ms | ease-in-out, infinite | Beacon breathing, online dot pulse |

Only transform/opacity animate. Page change: content fades/rises 4px in (200ms). `prefers-reduced-motion`: ambient animations off, transitions instant.

## 7. Depth & Surface

Strategy: **mixed, tonal first**. Surfaces step surface-0 → 1 → 2 → 3; panels add a 1px `--line` hairline. Shadows only for floating layers:
- `--shadow-1`: 0 1px 2px rgba(0,0,0,.06) (segmented selection)
- `--shadow-3`: 0 18px 48px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.12) (dialogs, toasts)
The beacon is the only element with coloured light.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- WCAG 2.2 AA: 4.5:1 body text, 3:1 large text and UI component edges. Ink-2 on surface-1 checked in both themes.
- Every interactive element reachable by keyboard with a visible `focus-visible` ring (the only coloured edge).
- Status is never colour-only: pills and the beacon always carry a text label.
- `prefers-reduced-motion` respected (Section 6).

### Accepted Debt
| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Lazyweb and Imagen research lanes skipped; only one Layer B reference available | DESIGN.md §0 | Tooling missing in this session / offline desktop tool; user asked for features first | Revisit when the style references are installed |
| No 375px layout | Whole app | Desktop app with a 960px minimum window width; mobile reflow does not apply | Not planned |
| Lighthouse audit not run | Whole app | Electron renderer with no network page; perfection ruleset targets web pages | Not planned |
| react-grab / react-doctor not installed; only react-scan (dev-only) | src/renderer/src/main.tsx | Agent tooling not needed for the shipped app | Add if UI perf work starts |
