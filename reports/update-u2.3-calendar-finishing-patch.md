# Update U2.3 — Calendar Finishing Patch

**Status: U2.3 COMPLETE** — both enumerated changes implemented, unit-tested, and browser-verified. `node --test` → **442/442 pass, 0 fail** (438 baseline + 4 new U2.3 tests). U2.1/U2.2 remain locked and untouched except where explicitly listed below.

## 2. Scope, inputs, and baseline

- Requirements taken from the task prompt's two enumerated changes (no PDF on disk):
  1. Extend the Monthly card downward for bottom breathing room — smallest possible CSS change, grid position/width/gutter/weekly untouched.
  2. Replace native `prompt()` for Add-a-Note / New Event with ONE custom in-app glassmorphism modal.
- **STEP 1 baseline:** `node --test` → 438/438 before any U2.3 change; no U2.3 code had been written yet.
- Integrity method: modification timestamps (no git repo). Files touched by U2.3: `src/js/app.js` (00:19), `src/css/calendar-u21.css` (00:27), `tests/renderer/calendar-u23.test.js` (00:27). Untouched: `src/index.html`, `calendar-card.js`, `calendar-wheel.js`, engines, `data/**` (all retain 10-05 22:1x timestamps).
- Serving during verification: temporary `tmp-server.js` on port 8099 with `Cache-Control: no-store` (deleted during cleanup). Browser gotchas applied: identical-URL `page.goto()` is a no-op → `reload()` used after edits.

## 3. CHANGE #1 — Monthly card extends downward

### 3.1 Baseline evidence (before)

Measured at 1440×900, Monthly: card **1040×585** (16/9), top 117 / bottom 702. Month grid 398→690, `.bottom-row` **690→746 → 44px BELOW the card bottom** (clipped by `overflow:hidden`): `gapGridToBottomRow = 0`, Add-a-note / New Event unusable in Monthly. At 1024×768 the grid itself extended 38px below the card. Root cause: the 16/9 card height cannot hold Monthly content (content needs ≈687px at reference width).

### 3.2 Discovery — baseline was flex-compressed

Under that overflow the flex children were squeezed ~14px (baseline pre-grid chain 281px vs natural 295px; arithmetic: children 611 natural → 597 used, overflow 70 = exactly the observed bottom-row overrun 746 vs inner bottom 676). Once the card fits its content the layout renders at natural size, so the grid sits at **top 412** (its true position) instead of the compressed 398. The grid never moves *up*; the old 398 was an artifact of the very overflow this change fixes.

### 3.3 Implementation (one rule)

```css
@media (min-width: 721px) {
  .calendar-card.monthly { min-height: 701px; }
}
```

Budget (natural geometry, documented in the CSS comment): 587 (card top → final grid row) + 32 breathing + 56 bottom-row + 26 bottom padding = 701. Why `min-height` (not aspect-ratio or hard height):
- **Monthly-only selector** → Weekly keeps `aspect-ratio: 16/9`, height 585, min-height 0 (verified computed styles).
- **Existing `max-height` caps still win** (CSS max overrides min) → short viewports keep `calc(100vh - 172px)` / `calc(100vh - 190px)` → page-level vertical scrollbar stays 0.
- **Scoped ≥721px** → the ≤720/≤460 `calc(100vh - …)` mobile card heights are untouched.
- Extra height flows into `.bottom-row { margin-top:auto }` → air opens *below the final date row*; top-anchored content (nav/toggle/hero/grid) does not re-flow.

### 3.4 Verification A — monthly breathing room (after)

| Metric | Baseline | After | Verdict |
|---|---|---|---|
| Card @1440 (Monthly) | 1040×585, top 117 | 1040×**701**, top **117** (bottom 702→818) | extended downward only; width/gutter 1040 / 200-200 unchanged |
| Gap: final grid row → bottom-row | **0 px** | **32 px** (clean state) | breathing room added |
| `.bottom-row` vs card | bottom 746 > card 702 (**44px clipped**) | 792 ≤ 818−26 (**fully inside**) | usability fixed |
| Grid position | 398 (compressed artifact) | 412 natural (grid bottom 690→704) | never moved *up*; +14 restores natural size (§3.2) |
| Weekly @1440 | 585, aspect 16/9, min-height 0 | **identical** (computed styles compared) | weekly untouched |
| hScroll / vScroll | 0 / 0 | **0 / 0** @1440/834/768/390 | no new overflow |
| Short viewports | — | max-height caps still apply (e.g. 1024×768 → 596px card, grid now fits: bottom 704 ≤ 713) | no page scroll ever |

Screenshot: `.u23-shots/monthly-1440-clean.png` (grid, glow, controls, 32px air below last row — deleted during cleanup with the rest of the temp shots).

Note on chip data: when a note + event chip are present the `.bottom-row` grows (56→95px) and absorbs the 32px gap down to 0 plus its own `padding-top: 22px` — controls remain fully inside the card (baseline clipped them by 44–90px in that state).

## 4. CHANGE #2 — one custom in-app modal

### 4.1 Implementation

`src/js/app.js` — removed `readPromptText`/`window.prompt` entirely; added a single shared component used by both flows:

- **`openEntryModal({ kind, date, onConfirm })` / `closeEntryModal()`** — builds the dialog once, mounted on `document.body` (outside `#view`, so route/calendar re-renders can never blank it mid-flow).
- **Note flow:** title “Add a note”, context line = `Calendar.formatLongDate(date)`, one text input.
- **Event flow:** title “New event”, same context line, title input + the *existing* optional start-time field (previously a second native prompt) — same dialog, no new fields, no native UI.
- **Behaviour:** Save (purple `#8f6fff→#7755e8` gradient, white text) → `onConfirm`; Cancel (secondary `rgba(255,255,255,.07)` ghost) / **Escape** / **backdrop click** → close and save nothing; **Enter** = Save; input autofocused; focus restored to trigger on close; `role="dialog" aria-modal="true" aria-labelledby`.
- **Persistence untouched:** callbacks call the exact same `calendarMetadata.addNote/addEvent` + toasts + `renderCalendar()`; remove-chip flow, no Edit affordance, storage key `study-planner:calendar` (`{schemaVersion, notes:{}, events:{}}`) all unchanged.

`src/css/calendar-u21.css` — modal styles appended: fixed backdrop `z-index:70` (above toast 60 / header 20), `backdrop-filter: blur(6px)` dim + `blur(18px) saturate(130%)` glass panel, dark-violet `linear-gradient` surface, `border-radius:22px`, rounded 12px inputs/buttons, focus rings, `@media (max-width:460px)` compact block (18px radius, equal-width buttons). No `src/index.html` change.

### 4.2 Verification B/C — note & event flows

Native-dialog tripwire: Playwright `page.on('dialog')` handler **never fired** across every flow; in-page `window.prompt/alert/confirm` wrappers **never set** (`__nativeCall` false).

| Check | Result |
|---|---|
| Modal opens (note) | `role=dialog`, `aria-modal=true`, title “Add a note”, context “6/8 October 2026”, 1 input, autofocused |
| Themed (computed) | backdrop `blur(6px)`, z `70`, panel radius `22px`, Save = `linear-gradient(rgb(143,111,255), rgb(119,85,232))` white text, Cancel = `rgba(255,255,255,0.07)` |
| Note Save | chip “U2.3 modal note” above control, toast “Note added to 6 October 2026.”, localStorage raw JSON written |
| Event Save | chip with `18:30` time, raw JSON `events["2026-10-06"]…time:"18:30"` |
| Persistence | full `reload()` → both chips still rendered |
| Cancel button / Escape / backdrop click | modal closes, **nothing saved** (event count 1→1 verified) |
| Opens from Monthly | Add a note + New Event buttons in Monthly bottom-row both open the correct modal |

## 5. Verification D — responsive matrix

Weekly + Monthly + modal probed at four sizes after edits (`reload()`, no-store server):

| Viewport | Card (wk / mo) | Gutters | hScroll | vScroll | Monthly: grid in card / gap / controls inside | Modal fits width / actions inside |
|---|---|---|---|---|---|---|
| 1440×900 | 1040×585 / 1040×701 | 200/200 | 0 | 0 | ✓ / 32 / ✓ | ✓ (420px) / ✓ |
| 834×1112 | 762×429 / 762×701 | 36/36 | 0 | 0 | ✓ / 45 / ✓ | ✓ / ✓ |
| 768×1024 | 696×392 / 696×701 | 36/36 | 0 | 0 | ✓ / 45 / ✓ | ✓ / ✓ |
| 390×844 | 354×744 (calc, both) | 18/18 | 0 | 0 | ✓ / 90 / ✓ | ✓ (362px) / ✓ |

Never full-bleed at any width. Mobile keeps its `calc(100vh - …)` heights (min-height rule scoped ≥721px — verified: 390 card = 744 = `100vh−100/105` family). Screenshot `modal-390.png` confirms the compact ≤460 dialog.

## 6. Verification E — quick weekly/monthly + wheel regression

- Session startup → Weekly (view mode not sticky), hero + arrows + toggle present; `.wheel-dot` indicators render (162 across the 129-date track — note: the class is `wheel-dot`, not `.dot`).
- Wheel click (active +2 days) → selection moved to `2026-10-08`, `.week-track` transform `matrix(1,0,0,1,-2592,0)` (centred), no page errors.
- Toggle Monthly → Weekly round-trip: back to `585` card (min-height 0, `aspect-ratio: 16/9`).
- Double-click active date → `#/day/2026-10-08`, tracker renders.
- Date preference remains sessionStorage-only; no console/page errors in any run.

## 7. Tests

- **`node --test` → 442/442 pass, 0 fail** (438 locked + 4 new in `tests/renderer/calendar-u23.test.js`):
  - `U2.3-01` no `window.prompt/alert/confirm` or `readPromptText` in `app.js`; shared `openEntryModal`/`closeEntryModal` exist.
  - `U2.3-02` both flows open the same modal (`kind:'note'/'event'`); persistence calls unchanged.
  - `U2.3-03` modal CSS: fixed backdrop, z≥61, ≥20px radius, blur present, violet gradient, purple `#7755e8` Save, ghost Cancel, ≤460 block.
  - `U2.3-04` monthly `min-height:701px` scoped `min-width:721px`; base card `16/9`, `width: min(100%,1040px)`, radius var intact; no `.calendar-card.weekly` rule; mobile `calc(100vh…)` heights intact.
- No existing test stubbed `window.prompt` (persistence is tested at the metadata layer), so no test rewrites were needed — only additions.

## 8. Preserved (locked) — explicit non-changes

- `calendar-wheel.js`, `calendar-card.js`, engines (`planner-engine.js`, `storage.js`, `progress-engine.js`), Progress/Reports/Tracker components, `data/**`, Study Week logic, `src/index.html`.
- Selection flow (`commitSelection`, 350ms deferred centre), pointer-capture-after-threshold, sessionStorage date preference, `study-planner:calendar` persistence mechanism.
- Weekly layout: card 16/9, wheel, curve, toggle behaviour — byte-identical CSS.
- U2.2 caps/gutters/header rules; ≤720/≤460 card heights; no Edit buttons; chips above controls; remove-chip flow.

## 9. Remaining issues (honest log)

1. **Weekly at 768–834 (tablet) can place the bottom controls below the card edge** (e.g. 768×1024 clean: note button 518–539 vs card bottom 499; wheel viewport squeezed to ~103px). **Pre-existing and reference-inherited** — the fixed 16/9 card (696×392, identical to U2.2's baseline matrix) cannot fit wheel + controls at that height; U2.2's matrix only asserted control *presence* and zero page scroll, both still true. Fixing it would require changing the Weekly layout or card proportions, which U2.3 explicitly locks.
2. **Monthly grid top 398 → 412 (+14px).** Not a layout move: baseline 398 was flex-compression under the old overflow (§3.2). Grid never moves upward; breathing room still strictly increases (0 → 32).
3. **Chip-heavy months** consume part of the 32px gap (bottom-row grows with stacked chips); controls stay fully visible (baseline clipped them).
4. **Short landscape viewports** (e.g. 1024×768): U2.2's locked `max-height` caps force card < content; Monthly grid now fits (baseline clipped 38px) but the bottom-row can still be partly clipped — improved, not perfect, without touching the locked caps.

## 10. Cleanup & hand-off

- Verification server (port 8099, `tmp-server.js`) stopped; `tmp-server.js` deleted; `.u23-shots/` deleted; test note/event data removed from the browser (`study-planner:calendar` clean/empty).
- Final gate: `node --test` → **442/442**.
- **STOP — U3 not started.**
