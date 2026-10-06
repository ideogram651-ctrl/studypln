# Update U2.2 — Calendar Finishing Pass (moving date wheel, startup state, navigation, gutter, dots)

**Status: U2.2 COMPLETE** — all enumerated requirements implemented, unit-tested, and browser-validated at reference width and across the full responsive matrix. Full suite **438/438 pass, 0 fail**. Protected modules and data untouched. **STOP — not starting U3.**

---

## 1. Summary and verdict

U2.2 was a focused finishing pass over the U2.1 reference-faithful Calendar. Eight requirement groups (001–008) plus a secondary event dot were implemented:

| ID | Requirement | Verdict |
|----|-------------|---------|
| U2.2-001 | Moving date-wheel selection (circle travels with its date; no fixed circle under sliding dates) | **DONE** — in-place selection, one entry point (`commitSelection`), track re-centred with reference animation |
| U2.2-002 | Today-based startup / session persistence / restart semantics | **DONE** — session → real local today → config fallback; session-only, never localStorage |
| U2.2-003 | Navigation outside the Study Cycle (Oct 1, Sep 30, Nov 1, cycle edges) | **DONE** — month context only, free movement, no fake "Week 0", no traps |
| U2.2-004 | Full-year Monthly navigation with shared selection | **DONE** — prev/next step `Calendar.addMonths`, day clamp, selection shared across modes |
| U2.2-005 | Reference gutter — never full-bleed (36px desktop / 18px ≤720) | **DONE** — no `100vw` math; card centred with reference gutters at every width |
| U2.2-006 | Text cleanup — explanatory footer removed | **DONE** — `app-footer` gone from `index.html` |
| U2.2-007 | Overflow fixes — page never scrolls for the card | **DONE** — `max-height` caps + reference mobile card height + non-wrapping header; 0 h/v scroll at all 12 widths |
| U2.2-008 | Primary special-day dot colours (purple/green/yellow/red) | **DONE** — from canonical `record.special`; every date gets exactly one primary dot |
| extra | Secondary event dot (distinct colour; never recolours primary) | **DONE** — `.is-event` second dot with its own colour |

Verdict line for automation: **`U2.2 COMPLETE`**.

## 2. Scope, inputs, and baseline

- The U2.2 PDF was **not present on disk**; requirements were taken from the task prompt's enumerated list (001–008 + event dot) and the acceptance language carried in the U2.1 hand-off.
- **STEP 1 baseline:** `node --test` → **413/413 pass, 0 fail** before any U2.2 change (386 pre-existing + 27 U2.1).
- Reference inspected again (`reference/Reference-Calendar-Project/{index.html,style.css,script.js}`): confirmed `weekViewport`/`weekTrack`/`centerSelected` model, `updateWeekOpacity()` distance-based `edge/near` fade, `.bottom-row{margin-top:auto}`, mobile `height:calc(100vh - 100px)` card, `.stage{padding:14px 0}`, `.page{padding:0 18px}`.
- Architecture rule enforced throughout: **one selection authority (`state.selectedDate`), one entry point (`commitSelection`), date preference session-only, `Calendar.weekdayShort` (not `parseIso().weekdayShort`)**.

## 3. U2.2-001 — moving date-wheel selection model

**Implementation** (`src/js/app.js`):
- `updateSelectionInPlace(date, deferCenter)` — guards (`[data-date]` item + `#calendarCard` present), then: toggle `active`/`is-selected`/`aria-pressed` on the existing item, update hero (month+day), period label, bottom row, and re-centre the track (`state.wheel.setSelected(date, true)` = the reference's `translate3d` + `.46s cubic-bezier(.22,.75,.2,1)` transition). **No DOM rebuild, no `wheel-dots` re-render, no full `renderCalendar`.**
- `commitSelection(date, origin)` — the single entry for every selection change: in-place when possible, full `renderCalendar(date)` only for month/mode changes or dates outside the rendered 81-day run; persists the date in the same place either way.
- Pointer-origin selections (`onSelect(date, 'pointer')` from `calendar-wheel.js onClick`) defer the track re-centre by 350 ms (coalesced, cancelled by any non-pointer selection) so the geometry is still during the double-click window; keyboard/wheel/drag/programmatic selections still centre immediately.

**Browser evidence (1440×900, clean session):**
- Track node identity `SAME` across click → arrow → wheel; window fixed (Aug 26 … Nov 14, 81 items); clicked target node identity preserved (`targetNodePreserved: true`).
- Transform follows the selection: `-3656px → -3352px (click) → -3428px (ArrowRight) → -3504px (wheel)` — exactly one item (76px) per step; active item offset from centre = 0 after settle.
- Hero, period label, and `sessionStorage` update in the same step; zero page errors.

## 4. U2.2-002 — startup, session, today

**Implementation** (`src/js/app.js`): `formatLocalDate()` (local Y-M-D, no UTC drift), `normalizeSessionStore()` (validated, clamped into the canonical year with fallback), `persistSelectedDate()` (sessionStorage key `study-planner:selected-date` only). Startup priority: **session → real local today → config fallback**. `opts.now` / `opts.sessionStore` injectable for tests. Dates outside the canonical year clamp to `initialDate` after load.

**Evidence:**
- Test A (fresh start): active = **2026-10-05 = actual local today** (not the hardcoded 2026-10-02 config fallback), session empty, **localStorage has no date key**.
- Test B (refresh): manual Oct 22 selection survives reload; session updated; localStorage still date-free.
- Test C (full restart, new tab): fresh session → resolves **today** again, session empty.
- Out-of-cycle session date (seeded `2026-08-23`): hero/label/active all consistent (`August 2026`), no crash.
- Unit: 5 tests incl. "never localStorage" and outside-canonical-year fallback.

## 5. U2.2-003 — navigation outside the Study Cycle

**Implementation:** `shiftPeriod` falls through to `moveSelectedByDays(±7)` at W1/W4 edges and for out-of-cycle dates (no traps, no fake "Week 0"); `moveSelectedByDays` clamps through `access.hasDate`.

**Evidence — full date matrix (all 12 required dates, live):**

| Date | Period label | Hero |
|------|--------------|------|
| 2026-10-01 | **October 2026** (no study week) | 1 October |
| 2026-10-02 | Oct Week 1 - 2026 | 2 October |
| 2026-10-05 | Oct Week 1 - 2026 | 5 October |
| 2026-10-08 | Oct Week 1 - 2026 | 8 October |
| 2026-10-09 | Oct Week 2 - 2026 | 9 October |
| 2026-10-15 | Oct Week 2 - 2026 | 15 October |
| 2026-10-16 | Oct Week 3 - 2026 | 16 October |
| 2026-10-22 | Oct Week 3 - 2026 | 22 October |
| 2026-10-23 | Oct Week 4 - 2026 | 23 October |
| 2026-10-29 | Oct Week 4 - 2026 | 29 October |
| 2026-09-30 | **September 2026** | 30 September |
| 2026-11-01 | **November 2026** | 1 November |

Cross-week transitions without any top-nav interaction: **8→9 (W1→W2), 15→16 (W2→W3), 22→23 (W3→W4)** — all three verified live.

## 6. U2.2-004 — full-year Monthly navigation

**Implementation:** Monthly prev/next derives the month from `state.selectedDate` via `Calendar.addMonths`, clamps the day to the target month (`Calendar.daysInMonth`), and guards with `access.hasDate`; the selection is the **shared authority** for both modes.

**Evidence (live):** shared selection Weekly→Monthly (Oct 16 selected cell = Oct 16 active); navigation **Oct→Nov→Dec→back Nov→Oct→Sep→Aug** — all six steps landed on the same day-of-month with correct grid day counts (31/30/31/30/31/31); Monthly→Weekly returns the same shared selection; unit tests cover steps across a full year.

## 7. U2.2-005 — reference gutter (never full-bleed)

**Implementation:** removed all `100vw/-50vw` full-bleed math; added `.app-view.calendar-view-active` (max-width `calc(1040px + 72px)`, padding 36px desktop, `padding: 14px 18px` ≤720) toggled by `setCalendarRootClass()` — on for Calendar, off for Tracker/Progress/Reports.

**Evidence:** card box at 1440 = **1040×585 at x=200** — pixel-identical to the reference (ref box also 1040×585 at x=200). Gutters by width: 1440→200/200 (centred in 1112 container), 1280→120/120, **1024/900/834/768→36/36 (reference values)**, **720/600/480/430/390/375→18/18 (reference mobile gutter)**. Unit test asserts no viewport-width full-bleed, the 36px/18px gutters, and `max-width: calc(1040px + 72px)`.

## 8. U2.2-006 — text cleanup

Removed the explanatory `app-footer` block from `src/index.html`. Evidence: live `document.querySelector('.app-footer')` = **null**; unit test asserts the removal and that no explanatory/status/debug copy sits below the Calendar.

## 9. U2.2-007 — overflow fixes

**Implementation:**
- Desktop `max-height: calc(100vh - 172px)`; `≤900px` → `calc(100vh - 190px)`; **no global `overflow:hidden`** (would have hidden real bugs and disabled spec-required inner scrolling).
- **≤720:** card `height: calc(100vh - 105px)` (reference's `calc(100vh - 100px)` adapted to this app's measured header ~77px + 14/14 padding) with `max-height:none`, `aspect-ratio:auto` — the reference's full-height mobile card with bottom row pinned at its bottom (gap ≈14px = reference's stage padding).
- **≤460:** the app header's brand + nav (427px) wrapped to **133px**, which pushed a 56px page scrollbar once the card took reference height. Fixed with a one-row header at the reference's mobile proportions (`height:72px`, ellipsising tagline, smaller logo/buttons — no copy removed above 460px) and card `height: calc(100vh - 100px)` (= ref's exact formula with the ref's 72px navbar budget).

**Evidence — 12-width matrix, final:**

| Width | Card | Header | Gutter | hScroll | vScroll |
|-------|------|--------|--------|---------|---------|
| 1440 | 1040×585 | 77 | 200/200 | 0 | 0 |
| 1280 | 1040×585 | 77 | 120/120 | 0 | 0 |
| 1024 | 952×536 | 77 | 36/36 | 0 | 0 |
| 900 | 828×466 | 77 | 36/36 | 0 | 0 |
| 834 | 762×429 | 77 | 36/36 | 0 | 0 |
| 768 | 696×392 | 77 | 36/36 | 0 | 0 |
| 720 | 795 tall | 77 | 18/18 | 0 | 0 |
| 600 | 795 tall | 77 | 18/18 | 0 | 0 |
| 480 | 795 tall | 77 | 18/18 | 0 | 0 |
| 430 | 832 tall | **72** | 18/18 | 0 | 0 |
| 390 | 744 tall | **72** | 18/18 | 0 | 0 |
| 375 | 712 tall | **72** | 18/18 | 0 | 0 |

Monthly grid readable at every width (≥28 day cells, cell height ≥28px); toggle (≥40px), arrows (2), hero, wheel circle, notes/events controls present at every width.

## 10. U2.2-008 — primary special-day dot colours

**Implementation** (`calendar-card.js`): `primaryDotClass(record)` maps canonical `record.special` → `is-week-start` (green) / `is-practice` (yellow) / `is-graded` (red) / default purple; renders inside the date item as `.wheel-dot.wheel-primary-dot` (4px, subordinate to the 50px circle). Exported for tests. Visible text/legend/`wheel-cycle-dot` wording removed (dead `hasMarkers`/`markerHTML` dropped).

**Evidence — computed styles (live):**

| Day type | Date | Computed background |
|----------|------|---------------------|
| normal / outside / other months | 2026-10-13, 2026-10-01, 2026-09-30, 2026-11-01 | `rgba(151, 119, 255, 0.85)` (purple) |
| week start | 2026-10-02 | `rgb(74, 222, 128)` (green) |
| practice | 2026-10-07 | `rgb(251, 191, 36)` (yellow) |
| graded | 2026-10-08 | `rgb(248, 113, 113)` (red) |

**81/81** rendered dates carry exactly one primary dot; no legend or dot-meaning labels exist anywhere (unit-asserted).

## 11. Secondary event dot

**Implementation:** `.wheel-dots` column = primary + optional `.is-event` (distinct colour, its own CSS rule) + `.is-note`. The primary class comes from canonical metadata only, so an event can never recolour it.

**Evidence — live lifecycle:** add event on Oct 8 → `primaryDots:1 (is-graded red), eventDots:1`; chip appears **above** the New Event pill (geometry-asserted); **no Edit** affordance; reload → event + dot persist (`eventDots:1`, remove control present); delete → `eventDots:0`, primary still `1`, chip gone. Unit tests cover add → second event without dot-duplication → delete → dot removed.

## 12. Notes / Events regression (U2.1 features preserved)

- Note: chip renders **above** "Add a note…", no Edit control, delete removes chip and note dot; event chip above "New Event". Geometry asserted live (`chip.bottom <= control.top`).
- Chip text escaped; persistence across reload confirmed; empty store left behind is `{"schemaVersion":1,"notes":{},"events":{}}` under the **U2-owned key `study-planner:calendar`** (documented in the U2 report) — it holds no date/progress state; the **date preference remains session-only** (`study-planner:selected-date`, sessionStorage), and `study-planner:state` (tracker completions) is untouched.

## 13. Input-method matrix (all five required inputs + real pointer events)

| Input | Evidence |
|-------|----------|
| Click (real mouse) | Selects the clicked date, deferred-centre glides track to offset 0 (`.click()` synthetic also verified in unit tests) |
| Wheel (vertical + horizontal trackpad delta) | Steps one day per gesture, lock respected, transform ±76px/step |
| Drag / swipe | Threshold-gated; swipe left = next date (verified Oct 4 → Oct 5 live) |
| Keyboard | ArrowRight/ArrowLeft step ±1 with label/hero/session sync; viewport focusable |
| Programmatic (other application state) | `state.selectedDate` → `commitSelection` → same in-place path (unit-tested via `setSelectedDate`) |

**Two real defects found and fixed during browser validation:**
1. **Pointer capture broke click/dblclick.** `viewport.setPointerCapture()` on `pointerdown` (inherited from the reference) retargeted `mouseup`/`click`/`dblclick` to the viewport, so a real mouse click never reached the date item and **double-click could never open the Daily Tracker**. Fix: capture only after the drag threshold is crossed (`onPointerMove`) — drag still gets capture (released automatically on pointerup), clicks keep their natural target. Right-click (`#/day/YYYY-MM-DD`) was and remains unaffected.
2. **Click-1's animation moved click-2's target.** Immediate re-centring on selection made the item move between the two clicks of a double-click. Fix: pointer-origin selections defer the centre by 350 ms (coalesced; non-pointer origins cancel the timer and centre immediately). Verified: real dblclick on an **unselected visible** date → `#/day/2026-10-08`; on the **already-centred** date → same exact-date hash; single click still settles at offset 0.

## 14. Regression matrix (full)

- **12 required dates** — all correct (table in §5).
- **3 cross-week transitions** — W1→W2, W2→W3, W3→W4 without top nav (§5).
- **Top study-week navigation** — next Oct 8→Oct 9, next →Oct 16, previous →Oct 9; labels follow (live).
- **Startup / refresh / restart** — A/B/C all pass (§4).
- **Monthly Oct→Nov→Dec→back (6 steps) + shared selection** — pass (§6).
- **Double-click → `#/day/…`** — real-mouse dblclick opens the exact date (§13); right-click likewise (`#/day/2026-10-04`, `#/day/2026-10-02` observed).
- **Notes/Events** — add/delete/persistence/chip-position/no-Edit (§12).
- **Storage isolation** — date key sessionStorage-only; `study-planner:calendar` holds only notes/events; tracker `study-planner:state` untouched by calendar interactions (U2 test T2 + live checks).
- **Console** — zero page errors and zero console errors across every browser pass in this update.

## 15. Reference visual comparison

- **1440 weekly:** live card crop vs reference card crop — identical geometry (1040×585 @ x=200), same nav label ("Oct Week 1 - 2026"), same segmented toggle, hero placement, curve, glow, bottom row. Live adds only the intended U2 features (primary dots under dates; reference has none).
- **Dimming parity (§32):** initially mis-read as asymmetric; computed styles prove live and reference are **identical and symmetric** — `edge` (.30) at ±228/304/380/456px, `near` (.78) at ±152px, base .96, `active` 1 — both driven by the same distance rules (`updateWeekOpacity` logic in the wheel controller).
- **720:** with the reference mobile card height, live now matches the reference frame (full-height card, bottom row pinned ~14px from the bottom, 18px gutters, single-row header). Before the fix the card was content-height (~421px) — see §19.
- **390:** one-row header (72px), card `100vh−100`, dots visible, controls usable — screenshot captured.
- Screenshots were captured to `.u22-shots/` during validation and removed at cleanup (temporary artifacts).

## 16. Test suite results

| Suite | Before U2.2 | After U2.2 |
|-------|-------------|------------|
| Total | 413 pass / 0 fail | **438 pass / 0 fail** |
| Baseline + U2.1 | 413 | 413 (unchanged) |
| New U2.2 tests (`tests/renderer/calendar-u22.test.js`) | — | **25** |

Coverage of the new file: 002 (A today / B refresh / C restart / session-only / outside-canonical), 001 (circle inside item, in-place update, no rebuild, track re-centre), 003 (Oct 1 month-context + free navigation), 004 (shared selection across modes), 005 (gutter/no full-bleed/class-toggled), 006 (footer text gone), 007 (card height caps), 008 (four colours from metadata, one primary per date, matrix dates, no legend), event-dot lifecycle.

Obsolete assertions updated (behaviour legitimately changed): `app.test.js` (new startup helpers + `now` mock), `progress.test.js` (`now` mock), `calendar-u21.test.js` U2.1-18 (invisible dot class names are no longer forbidden — only visible text is). One U2.2 assertion updated in this pass to accept the shorthand gutter form `padding: 14px 18px` (horizontal still exactly 18px).

## 17. Deviations discovered in validation (all fixed)

1. Pointer capture vs click/dblclick (§13.1) — **fixed in `calendar-wheel.js`.**
2. Double-click vs animation (§13.2) — **fixed via deferred pointer-origin centre in `app.js`.**
3. ≤720 card was content-height while the reference is full-height (`calc(100vh − 100px)`) — **fixed** (§9), adapted to this app's chrome so no page scrollbar appears.
4. Header wrap at ≤459px produced a 56px vertical scrollbar — **fixed** with a one-row reference-proportioned header (§9).
5. Test-harness pitfalls (not product bugs): `page.goto()` to an identical URL is a no-op (kept stale documents/stylesheets alive — resolved by using `reload()`); double-clicking coordinates of clipped items hits bare HTML; the earlier "stale cache" scare was this no-op behaviour plus python-era cache entries, both eliminated (`tmp-server.js` sends `no-store`).

## 18. Files changed in U2.2

| File | Change |
|------|--------|
| `src/js/app.js` | `formatLocalDate`, `normalizeSessionStore`, `persistSelectedDate`, startup priority (session → today → config), `updateSelectionInPlace`, `commitSelection`, `centerWheel` + 350ms pointer-origin deferred centre, `setCalendarRootClass`, `shiftPeriod`/`moveSelectedByDays` outside-cycle handling, monthly nav via `Calendar.addMonths` + clamp, `renderCalendar` persistence + outside-canonical clamp |
| `src/components/calendar/calendar-wheel.js` | `onSelect(date, 'pointer')` origin; pointer capture moved from `pointerdown` to drag-threshold crossing (fixes real-mouse click/dblclick) |
| `src/components/calendar/calendar-card.js` | `primaryDotClass` from canonical `record.special`, `.wheel-dots` column (primary + `.is-event` + `.is-note`), `hasEntries`, export of `primaryDotClass`; removed dead `hasMarkers`/`markerHTML` |
| `src/css/calendar-u21.css` | gutter rules (no full-bleed; 36px desktop / `14px 18px` ≤720), dot colours, `max-height` caps (172/190), ≤720 reference card height, ≤460 one-row header + `calc(100vh − 100px)` card |
| `src/index.html` | explanatory `app-footer` removed (U2.2-006) |
| `tests/renderer/calendar-u22.test.js` | **new** — 25 tests for 001–008 + event dot (gutter assertion accepts shorthand padding form) |
| `tests/renderer/app.test.js`, `tests/renderer/progress.test.js`, `tests/renderer/calendar-u21.test.js` | obsolete assertions updated for new startup helpers, `now` mock, invisible dot class names |

## 19. Files NOT changed + integrity

Untouched: `planner-engine.js`, `storage.js`, `progress-engine.js`, all `src/components/{progress,reports}` (and `report`-side modules), `src/js/{router,report-model,export-engine,data-engine}.js` outside the calendar flow, all `data/**`, `Report/Progress/Tracker` components, `base.css`/`components.css` header source (U2.2 header rules live only in `calendar-u21.css` and only ≤460px).

**Integrity method** (no git repository in this project — same convention as `update-u0-architecture-audit.md`): modification timestamps. The U2.2 editing window is 22:14–23:20; every protected file predates it:

| Protected set | Newest modification | Inside U2.2 window? |
|---|---|---|
| `planner-engine.js` | 2026-10-04 21:39 | No |
| `storage.js`, `progress-engine.js` | 2026-10-04 20:58 | No |
| `src/components/progress/*` | 2026-10-05 00:25–00:49 | No |
| `src/components/reports/*` | 2026-10-05 06:33–06:53 | No |
| `data/**` (36 files) | 2026-10-05 14:31 (canonical calendar; all others 10-04 21:39 or earlier) | No |
| `src/index.html`, calendar components, `calendar-u21.css`, `app.js` (expected edits) | 2026-10-05 22:14–22:47 | Yes (allowed) |

## 20. Known limitations and honest notes

1. **`monthTitle` in Monthly** — `calendar-card.js` uses `Calendar.monthTitle(year, month)` for the monthly period label; live evidence shows `October 2026` correctly after mode switch and after navigation. No stale title observed; the legacy quirk flagged in earlier hand-offs did not reproduce.
2. **Double-click needs a visible item.** Dates clipped outside the viewport (track translated away) cannot be double-clicked — same physical limit as the reference. The rendered window is 81 dates (±40), so any centred ±6 dates are always visible.
3. **350 ms deferred centre on pointer clicks** (keyboard/wheel/drag centre immediately). Chosen so a normal double-click (~100–300 ms apart) lands on a still track; a slower second click falls back to plain selection — same semantics as OS double-click timing.
4. **Control heights match the reference exactly** (note 21px, New Event 34px desktop / 30px mobile). This is below the 24px WCAG-2.5.8 target used by one of my own assertions; the reference is the North Star here, so heights were **not** redesigned. Flagging for a future accessibility pass if required.
5. **≤460 header** is a U2.2 addition (the reference has no ≤460 header rules because its navbar is already 72px and narrower). Tagline may ellipsis only below ~370px; no text removed above 460px.
6. **`study-planner:calendar` in localStorage is by design** (U2 notes/events store, empty `{notes:{},events:{}}` after test cleanup) — the U2.2 "never localStorage" requirement applies to the **selected date**, which is sessionStorage-only.

## 21. Temporary artifacts and cleanup (completed)

| Artifact | Purpose | Disposition |
|----------|---------|-------------|
| `tmp-server.js` (:8099, `Cache-Control: no-store`) | browser validation without stale-cache interference | **deleted**; process (PID 8460) stopped; **port 8099 free** |
| `.u21-shots/` | U2.1 screenshots | **deleted** |
| `.u22-shots/` | U2.2 validation screenshots (1440 live/ref, 720, 390) | **deleted** after review |
| `.playwright-mcp/` | browser session logs | already absent / removed |
| Browser session | validation only | closed |

Root listing after cleanup: `.claude, .cortex, data, docs, generated, reference, reports, src, tests, tools, .gitignore, CLAUDE.md, PROJECT_SPECIFICATION.md, README.md, TRACKING_STORAGE_MANIFEST.json` — no stray files.

## 22. Acceptance checklist (requirement → evidence)

| # | Requirement | Evidence |
|---|-------------|----------|
| 1 | Purple circle travels with its date; whole track moves; item can be centred | §3 transform deltas + node identity |
| 2 | No full re-render on selection; no fixed circle under sliding dates | §3 (`SAME` track node, preserved target) |
| 3 | Startup = today (or session), never hardcoded | §4 A/C |
| 4 | Refresh keeps manual selection | §4 B |
| 5 | Date preference sessionStorage only | §4 + §16 (unit) + §20.6 |
| 6 | Oct 1 / Sep 30 / Nov 1: month context, no fake week, free navigation | §5 matrix |
| 7 | Cross-week without top nav | §5 (3 transitions) |
| 8 | Top study-week nav still works | §14 |
| 9 | Monthly full-year nav, selection shared | §6 |
| 10 | Reference gutter at every width, no full-bleed | §7 + §9 table |
| 11 | Footer explanatory text removed | §8 |
| 12 | No page h/v scroll from the card | §9 (0/0 at 12 widths) |
| 13 | Primary dot colours from canonical metadata, all four types | §10 computed styles |
| 14 | Every date exactly one primary dot; no legend/labels | §10 (81/81) + §16 |
| 15 | Secondary event dot, lifecycle, never recolours primary | §11 |
| 16 | Double-click/right-click → exact `/day/…` date | §13 + §14 |
| 17 | Notes/Events regressions | §12 |
| 18 | Full suite green | §16: **438/438** |
| 19 | Protected data/modules unchanged | §19 |

## 23. Re-validation instructions

1. `node --test` from the repo root → expect `tests 438 / pass 438 / fail 0`.
2. Serve `src/` with any no-cache static server (e.g. a small `http.server` with `Cache-Control: no-store`, or a hard-reload), open `#/calendar`.
3. Startup checks: fresh session → today; click a date → refresh keeps it; new tab → today.
4. Responsive: resize 1440→375 checking gutters (36/18px) and zero scrollbars.
5. Real-pointer checks: single click selects + centres; double-click opens `#/day/<date>`; drag swipes; arrows/wheel step.

## 24. Hand-off notes for the next update (U3)

- Selection authority is `state.selectedDate`; **all** selection changes must flow through `commitSelection` (origin `'pointer'` opts into deferred centre). Adding new inputs should reuse it rather than calling `renderCalendar` directly.
- `calendar-wheel.js` deliberately captures the pointer only after the drag threshold — do not "restore" capture-on-down; it silently breaks click/dblclick.
- Mobile card height is budgeted against the measured chrome (77/72px header + 14/14 padding). If the header/navbar changes height, revisit `calc(100vh − 105px)` (≤720) and `calc(100vh − 100px)` (≤460).
- `page.goto()` with an identical URL (including hash) is a no-op in the browser tooling — use `reload()` when re-testing after edits.
- The notes/events store (`study-planner:calendar`) and the tracker store (`study-planner:state`) must stay separate from the date preference (`study-planner:selected-date`, sessionStorage).

## 25. Final verdict

All eight enumerated U2.2 requirement groups plus the secondary event dot are implemented, unit-tested (25 new tests), browser-validated (interaction, matrix, responsive, reference-comparison passes), and regression-tested (438/438 green). Protected modules and data are byte-untouched by timestamp evidence, temporary artifacts are removed, and the console is clean at every checked width.

# **U2.2 COMPLETE**

**STOP — U3 is not started.**
