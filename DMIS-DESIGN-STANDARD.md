# DMIS / e-MAAFA Design Standard (v2 — 2026-07-03)

Binding UI standard for the whole system (public portal + internal modules). Raised from user
direction: **fonts were too small for public view, space under-utilized (content squeezed into a
centered column), decorative gradients everywhere, tooltips too shallow.** Every new screen and
every touched screen must conform.

## Where styles live (do not guess)
| Surface | Files actually loaded |
|---|---|
| Public portal (/, /portal, /education, …) | `frontend/public/css/v2-shared.css` + `frontend/public/css/portal-landing.css` (attached at runtime by `public-layout.component.ts`, cache-busted `?v=YYYYMMDD`) + component inline styles |
| Internal app (dashboard, modules) | `frontend/src/assets/css/dmis-v2.css` + `frontend/src/styles.scss` (angular.json) + component inline styles |
| DEAD (not referenced anywhere) | `frontend/src/assets/css/{app.css, tanzania-theme.css, v2-shared.css}` — do not edit, do not copy from |

## 1. Typography — minimum sizes (root is 17px, so 1rem ≈ 17px)
**Public-facing pages (hard floor: `0.8rem`; nothing below it, ever):**
- Micro-labels / uppercase eyebrows / tags / chips: `0.8rem` (was 0.48–0.72rem — all must be raised)
- Meta / secondary text (dates, authors, sources): `0.9rem`
- Body text, descriptions, list items, form controls: `1rem`
- Card titles: `1.1rem`; section intro text `1.05rem`
- Nav links `1rem`; footer body `0.9rem`, footer headings `1rem`
- Buttons: `0.95rem`, height ≥ 42px (touch-friendly)
- Live-monitoring numbers: `1.7rem`+; their labels `0.8rem` uppercase
- Leaflet popups/tooltips: body `0.9rem`, titles `0.95–1rem`

**Internal system pages (hard floor: `0.75rem`):**
- Table `th` labels: 12px+; `td` inherits body (15px)
- Card headers ≥ 12.5px; stat tile numbers 26px, labels 12.5px
- No component may set text below 0.75rem.

## 2. Space utilization — expanded layout
- Public containers/wrappers: `max-width: min(1560px, 94vw)` on ≥1200px screens (was 1140–1320px).
  Applies to `.container` inside public sections and every page wrapper (`/portal` 1280 → standard,
  `/education` 1320 → standard, etc.).
- Two-pane layouts size the side pane with `clamp()` (e.g. map+list: `minmax(0,1fr) clamp(420px, 32vw, 540px)`), never a fixed px column that strands whitespace.
- Internal pages: list/dashboard/map screens fill the content area (no narrow max-width caps);
  long **forms** may keep `max-width: 1100px` for readability — that is the only sanctioned cap.
- Section vertical rhythm: `padding: 3.5rem 0` desktop, `2rem 0` mobile.

## 3. Flat, system-grade look ("no gradients, smart buttons")
- **No decorative gradients**: linear/radial-gradient backgrounds on buttons, cards, banners,
  section backgrounds, "ambient orbs" → replace with flat solid tokens + 1px borders + shadow.
- **Exception (functional, keep):** photo scrims — a dark gradient overlay on top of a photograph
  whose only job is text legibility (news card images, hero photo overlay). Keep those.
- Buttons: solid fills, consistent `border-radius: 8px` (pills only for chips/badges/toggles),
  consistent heights (42px public / 34–36px internal), aligned in toolbars (`display:flex; gap:8px`),
  icon + label, visible hover state (darken 8%), no glow/gradient/shine.
  - Public primary: solid `#0d3b66` white text. Public accent (Report Hazard): solid gold `#f0b429`,
    ink text `#1f2a37`. Outline: 1.5px border, transparent bg.
  - Internal: keep `.btn` / `.btn-primary` from styles.scss — never invent new one-off button styles.
- Cards: white surface, `1px solid` line, radius 12px (public) / 8px (internal), soft shadow, hover
  lift `translateY(-2px)` + deeper shadow on interactive cards.

## 4. Advanced tooltips & popovers (portal + map) — shared classes
Rich hover popovers replace bare `title=""` attributes on the public portal. Classes are defined
ONCE in `portal-landing.css` and reused everywhere (landing, /portal, threats strip, stats):

```
.pp-pop-wrap                      relative anchor; shows its .pp-pop on :hover / :focus-within
.pp-pop                           absolute panel: min-width 300px, max-width 400px, bg #fff,
                                  border 1px rgba(13,43,77,.14), radius 12px,
                                  shadow 0 16px 48px rgba(9,30,58,.18), padding .9rem 1rem,
                                  opacity/visibility+translateY(4px) transition .15s
.pp-pop.pp-right / .pp-left / .pp-below   placement helpers
.pp-pop-title                     1rem, weight 800, ink
.pp-pop-meta                      .9rem muted row (icon + source + time)
.pp-pop-row                       flex row, .9rem, gap 8px, icon column 16px muted
.pp-pop-list                      stacked mini-items with 1px separators (max ~5, then "+N more")
.pp-pop-foot                      .8rem muted italic hint ("Click to open full details")
.pp-sev                           severity chip: .8rem uppercase bold pill;
                                  .sev-emergency (#fde3e3/#b51c1c), .sev-warning (#ffeede/#a85607),
                                  .sev-watch (#fff7d6/#8a6d00), .sev-incident (#ece7fb/#5b21b6)
```

Leaflet **rich popup cards** (className `map-pop` passed to `bindPopup`):
```
.map-pop .leaflet-popup-content-wrapper   radius 12px, padding 0, overflow hidden
.map-pop .leaflet-popup-content           margin 0, min-width 280px, font-size .9rem
.mp-head    colored banner (severity color bg, white text, .95rem, weight 800, icon)
.mp-body    padding .7rem .9rem, grid gap 6px
.mp-row     .88rem row: fixed 16px icon column (muted) + text (#334155)
.mp-actions button row, top border, gap 8px
.mp-btn     solid #0d3b66 white pill-less button .85rem/700; .mp-btn.ghost = #eef4fb/#0d3b66
```
Leaflet **hover tooltips** (className `map-tip`): white card, radius 8px, `.88rem`, weight 600,
shadow, 1px border — bound with `bindTooltip(..., { className: 'map-tip', sticky: true })`.
Both light + `[data-theme="dark"]` variants required.

Rules:
- Popover content is REAL data (the actual warnings/incidents behind a number, the actual agency,
  trend and severity of a threat) — never generic text.
- Everything hoverable is also clickable → full detail (popover is preview, click is commitment).
- All user/operator text injected into Leaflet HTML strings goes through the component's `escHtml`.

## 5. Bilingual rule
Do NOT add keys to `portal-i18n.ts` (parallel-edit collisions). New public strings are inline:
`{{ L.lang() === 'sw' ? 'Kiswahili…' : 'English…' }}` — pattern already used in education.component.

## 6. Engagement / self-sufficiency baseline (public)
- Live surfaces show freshness: "Updated HH:MM" chip near live counters (data already auto-polls).
- Interactive cards lift on hover; sections reveal on scroll (existing `fxReveal`).
- Back-to-top button on long public pages.
- Empty states carry an icon + a next action, never a bare "no data".

## 7. Professional register — "an institution's system, not a vibe-coded app" (user directive 2026-07-03)
The visual target is the **classic, established enterprise/government system of ~2010–2016** —
structured, formal, information-first — with components that function *better* than modern apps:
- Structure over decoration: clear page headers with breadcrumbs, labeled toolbars, definition-style
  detail rows (label: value), real tables with sortable headers where lists are long, status bars.
- Restraint: border-radius stays modest (6–12px, never bubble-round), shadows subtle, motion minimal
  and purposeful (no parallax, no floating blobs, no glassmorphism, no emoji in UI copy).
- Formal wording: institutional English/Swahili ("Directorate of Disaster Management", "Issued by",
  "Reference No."), sentence case for body, uppercase only for small structural labels. Every label
  is a real term a government officer would use — no marketing filler.
- Density with legibility: prefer one more piece of useful information over one more blank band —
  but always at the §1 type floors.
- **Smart features must be complementary and flawless**: only add a feature when it serves the page's
  job (freshness stamps, live filters, print/save, structured popovers, real counts). A feature that
  is decorative, unrelated, or half-working is worse than none. Everything shipped must be driven by
  real data and verified working.

## 8. Verification bar
`NODE_OPTIONS=--max-old-space-size=4096 npx ng build --configuration production` must pass
(0 errors / 0 warnings), and changed screens are screenshot-checked via `frontend/render-tests/shot.js`.
