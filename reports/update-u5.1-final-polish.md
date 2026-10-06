# U5.1 — FINAL CHANGE PASS: Reports + Calendar finishing (CHANGE #001–#006 + active nav)

**Project:** Study-Planner — E:\Study-Planner\
**Status:** `U5.1 COMPLETE`\
**Scope:** the six living changes (CHANGE #001–#006) + global navigation active-state.\
**Final regression:** `node --test` → **483 / 483 pass, 0 fail, 0 skipped, 0 todo.**

---

## 1. U5.1 status

`U5.1 COMPLETE` — every acceptance item in §48 of the U5.1 specification verified
programmatically in Node **and** live in the browser. The U5.1 recovery check (§4)
found prior-session U5.1 work already in place for CHANGE #001 (model/viewer/export),
index.html (Home + icons + logo) and the tracker Back button; that work was inspected,
kept, completed and verified rather than rebuilt.

## 2. CHANGE #001 result — timetable reflects revision/review completion

- **Path:** Daily Tracker checkbox → `storage.js` (`study-planner:state`) →
  `report-model.js` resolves the block's U5 id through the ONE authority
  (`TaskGroup.actionableTaskId`) → `progress-calendar.js` / `export-engine.js`
  `blockState()` → completed styling. No second completion system, no export-only state.
- **Live:** ticking *Math + Statistics Revision* + *Daily Review* produced exactly the
  records `revision:1:2026-10-02`, `daily-review:1:2026-10-02`; the week-1 timetable
  then rendered both blocks `data-state="complete"`, **opacity 0.5, line-through** —
  byte-identical treatment to course blocks (unticked Math block stayed
  `none` / 0.92 / no strike). Unchecking removed both records and returned the blocks
  to `none` / 0.92.
- **Not course progress:** overall stayed **0 / 413** with those records present
  (browser + Node `PE.progressForAllCourses` agreement).
- **Export:** node test U5.1-03 proves the standalone HTML carries the same
  `data-state="complete"` for the revision block while preserving all U4 behaviour
  (12-hour AM/PM axis, break-only blocks hidden, Weekly Progress section intact);
  the live Export button clicks with zero runtime error.

## 3. CHANGE #002 result — global Home

- `src/index.html`: `[ Home ] [ Progress ] [ Reports ]`, Home initially `hidden`.
- `app.js open-home` → `#/calendar`; router de-duplicates, so single- and
  double-click converge on one destination (live: double dispatch → still `#/calendar`,
  Home re-hides on arrival).
- Visibility derived from route on every route change: Home **hidden on `#/calendar`**,
  visible on Progress, Reports, Progress detail, Daily Tracker and every other
  non-home screen (live matrix verified, including `display:none` actually applying —
  see the `[hidden]` CSS override in §8).

## 4. Global navigation active-state result

- Three states, route-derived — never a hand-maintained flag:
  **NORMAL** (no attribute) / **HOVER** (`:hover` layers on top) /
  **ACTIVE** (`aria-current="page"` + `.is-active`, set by `updateHeaderNav(route)`).
- Live matrix: `#/progress` → Progress active (purple gradient), Reports normal;
  `#/reports` → Reports active, Progress cleared; `#/progress/subject/…` → stays
  Progress (section, not page); `#/day/…` → **both normal** (non-Progress/non-Reports);
  `#/calendar` → Home hidden, both normal.
- Persistence: with `aria-current` set, computed `backgroundImage` stays the active
  gradient; a pointer event on Reports left `reports.aria-current === null` —
  hover can neither replace nor erase active. Icon+text share the state because the
  whole button is the state-bearing control (single gradient background).

## 5. CHANGE #003 result — supplied SVG navigation icons

- `home.svg` → Home, `progress.svg` → Progress, `report.svg` → Reports (header) and
  `back-arrow.svg` → every Back control (shared renderer, tracker top, tracker
  empty-state, progress notice). No emoji, no icon library, no redrawn assets.
- All four assets verified present on disk and loading in the browser
  (`naturalWidth 800` each). Assets are black (`#000`/`#292D32`); CSS
  `filter: brightness(0) invert(1)` renders them white — presentation only, the
  supplied files are untouched.
- Icon and text always share one state because both live inside the single
  button element that carries `aria-current`/gradient (§4).

## 6. CHANGE #004 result — shared Back + right-aligned breadcrumbs

- **One renderer, both sections:** `ProgressDrilldown.renderNavHTML` emits
  `[ ← Back ] ……… [ Calendar › … ]` for Progress **and** Reports (Reports builds its
  view-model in `report-viewer.buildReportNavViewModel`, U4's single-system design kept).
- **Back semantics (`app.js goBack`):** one actual step via `window.history.back()`
  when the session has navigated (`state.routeSteps` > 0) — no second history system;
  otherwise the control's own semantic `data-hash` parent; otherwise the Calendar.
  - *Live, real history step:* `#/progress/subject/mathematics-i` → click Back →
    `#/progress`. *Cold-fallback (Node, no history):* back with hash → `#/progress/week/1`;
    back without hash → `#/calendar` (U5.1-07).
- **Layout live-measured:** Back at container-left (`offset 0`), crumbs flush right
  (`gap 0`) on Progress deep (`Calendar›Progress›Mathematics I`, 2 clickable parents)
  and Reports deep (`Calendar›Reports›Weekly report`, 2 clickable parents);
  Reports Back = `{label:'Back', hash:'#/reports'}` + icon. **Calendar has 0 Back
  buttons** (permanent-Back exception kept).
- Overall/Progress main now also carries Back (`{label:'Back', hash:'#/calendar'}`).
- The legacy `&#8592;` text arrow is gone from all three Back renderers (U5.1-08).

## 7. CHANGE #005 result — scrollbar glassmorphism

- `base.css`: `* { scrollbar-width: thin; scrollbar-color: rgba(151,119,255,.42) transparent }`
  + `::-webkit-scrollbar` 10px with rounded purple translucent thumb.
- **Visual only** — no `html/body overflow:hidden` (U2.2-007 rule re-asserted in
  U5.1-11), no new overflow (page stayed 0/0 at all widths, §11), wheel/trackpad/drag
  scrolling untouched. Browser confirms `scrollbar-width: thin` computed on `<html>`.

## 8. CHANGE #006 result — supplied white logo (+ supporting CSS)

- `index.html`: `<img class="app-logo-img" src="../assets/logo/Study-Planner-Logo.svg">`
  inside the existing brand tile; **SP monogram gone** (live: `.app-logo` text empty,
  image `naturalWidth 800`, `filter: brightness(0) invert(1)` → white).
- Title `Study-Planner`, subtitle `IIT Madras BS — 28-day cycle`, nav labels, header
  typography and dark theme all unchanged (asserted).
- Supporting rules in `components.css`: `.nav-icon`/`.back-icon` sizing + white filter;
  `inline-flex` alignment for ghost/back buttons; **`.app-nav .ghost-button[hidden] { display:none }`**
  (author `display:inline-flex` would otherwise beat the UA `[hidden]` rule — live proof:
  `hidden:true` **and** `display:"none"` on Calendar); active/hover rules documented in §4.
- `reports.css`: `.rp-page-nav .progress-nav { flex:1 1 auto }` right-aligns crumbs in
  the Reports row while contextual links trail (§6 measurements).

## 9. Files modified (U5.1 scope)

**Created**
| File | Purpose |
|---|---|
| `tests/renderer/u51.test.js` | 13 U5.1 regression tests (497 lines) |
| `reports/update-u5.1-final-polish.md` | this report |

**Modified**
| File | Why |
|---|---|
| `src/js/report-model.js` | CHANGE #001: blocks carry `actionableId`/`actionCompleted`, resolved through `TaskGroup.actionableTaskId` + the bound completion map |
| `src/components/reports/progress-calendar.js` | CHANGE #001: `blockState()` — actionable block → `complete`/`none` (never invented `partial`) |
| `src/js/export-engine.js` | CHANGE #001: identical `blockState()` parity so export = screen; **nothing else** in the export touched (U4 behaviour locked by U4-01..09 tests, still green) |
| `src/index.html` | CHANGE #002/#003/#006: Home button (initially `hidden`), nav SVG icons, supplied white logo |
| `src/js/app.js` | `updateHeaderNav`/`setNavCurrent` (route-derived states), `open-home` case, `goBack` + `routeSteps` tracking, `case 'back'` → `goBack(element)` |
| `src/components/progress/progress-drilldown.js` | shared Back (`data-action="back"`, `back-arrow.svg`, hash fallback), overall level gains Back |
| `src/components/progress/progress-dashboard.js` | notice Back: text arrow → `back-arrow.svg` (label/action unchanged) |
| `src/components/reports/report-viewer.js` | Reports Back view-model (`index → null hash`, `deep → '#/reports'`) |
| `src/components/tracker/daily-tracker.js` | empty-state Back → supplied icon + `Back` label |
| `src/css/base.css` | `.app-logo-img` white render; CHANGE #005 glass scrollbars |
| `src/css/components.css` | `.nav-icon`/`.back-icon`, inline-flex, `[hidden]` display override, active + combined-hover rules |
| `src/css/reports.css` | `.rp-page-nav .progress-nav` flex → crumbs right-aligned |
| `tests/renderer/reports-u4.test.js` | **Documented supersession (2 assertions only):** U4-09 asserted `deepVm.back === null` and *no* back control on Reports — U5.1 §12/§14 explicitly require Back there. Replaced with `{label:'Back', hash:'#/reports'}` + icon/data-action assertions. No other U4 test changed; no assertion weakened elsewhere. |

## 10. Files preserved / locked (verified, not assumed)

- **`data/**` — ZERO files modified today** (syllabus, 28 daily plans, `calendar-2026.json`,
  `progress.json` all untouched; canonical calendar read-only at runtime — the page was
  exercised across all routes and no data write occurred).
- **Engines untouched by U5.1** (mtimes): `planner-engine.js` 04-10 21:39,
  `storage.js` + `progress-engine.js` 04-10 20:58, `router.js` 06-10 06:25.
- **Not modified:** `calendar-u21.css`, all Calendar components (U2.x locked),
  `components/tracker/task-card.js` + `task-group.js` (U5 locked — CHANGE #001 *reads*
  `actionableTaskId`, never writes), Progress rendering components, `daily-tracker`
  rendering (only its empty-state Back button), Notes/Events persistence
  (`calendar-metadata.js`), `manifest.json`/`service-worker.js`, tests of other phases
  except the documented U4-09 supersession.
- **No new dependencies, no framework, no backend** — plain HTML/CSS/ES5-era JS + browser APIs.

## 11. Focused browser verification (§19) — all pass

| # | Check | Result |
|---|---|---|
| A1 | Tick revision + review in tracker | ✅ rows `is-completed`, badges `1 / 1`, storage holds exactly `revision:1:2026-10-02` + `daily-review:1:2026-10-02` |
| A2 | Week-1 timetable reflects it | ✅ both blocks `data-state="complete"`, **opacity 0.5, line-through**; unticked Math block `none`/0.92/no strike; break-only still hidden |
| A3 | Export reflects it | ✅ U5.1-03 (Node, same model/engine): `blk is-revision … data-state="complete"`, `Week progress`, `11:00 AM`, no `Lunch / Rest`, no `13:00`; live Export button click → **no runtime error** |
| A4 | Isolation | ✅ overall stayed **0 / 413** with action records present |
| A5 | Uncheck round-trip | ✅ records removed, block back to `none`/0.92 |
| B | Home | ✅ Calendar: `[Progress][Reports]` only (`hidden`+`display:none`); Progress page: Home visible; click → `#/calendar`; double-click converges; Home re-hides |
| C | Active states | ✅ matrix in §4; real-pointer session: `aria-current`/gradient persist while another button is hovered; hovered Reports stays `aria-current=null` with non-active background; active+hover still clearly current |
| D | Icons | ✅ all four supplied SVGs load (`naturalWidth 800`) at correct slots |
| E | Back + crumbs | ✅ Back-left/crumbs-right on Progress & Reports; real history step subject→`#/progress`; parent crumb `Calendar` navigates; Calendar has 0 Back buttons |
| F | Scrollbar | ✅ `scrollbar-width: thin` computed; page overflow **0 X / 0 Y** everywhere |
| G | Logo | ✅ white SVG logo, SP monogram absent, title/subtitle/nav labels intact |
| R | Regression routes | ✅ `#/progress`, `#/reports` render after all flows; `#/day/2026-10-02` renders |
| Responsive | 1440 / 1024 / 768 / 390 | ✅ no h/v page overflow at any width; gutters 200 / 36 / 36 / **18** (cards 1040 / 952 / 696 / 354) — **not full-bleed at 720 or 390**; nav never overflows |
| Console | whole session | ✅ **0 errors, 0 warnings** |

## 12. Any remaining issue

1. **No screenshot evidence.** The CDP screenshot call timed out twice (60 s MCP
   tool timeout) — every verification above is therefore programmatic (computed
   styles, geometry, storage JSON, console). The page itself stayed healthy.
2. **CSS `:hover` cannot engage under this automation** (`document.querySelector(':hover')`
   returns null even after a successful hover call) — so hover's *visual* layer was
   verified structurally: unit test U5.1-12 locks the rule cascade
   (active 0,3,0 beats hover 0,2,0; combined 0,4,0 keeps the gradient), and live
   assertions prove active state is attribute-driven and pointer-independent.
   Manual spot-check in a normal browser is the only unperformed step.
3. **Warm-Behaviour of `history.back()` is browser-only by design** — Node tests
   cover the cold-fallback chain; the browser covered the warm step
   (subject → `#/progress`). A real back() *out of the app* is prevented by the
   `routeSteps` guard (falls back instead).
4. **Label nuance:** after cross-section travel (Reports → header → Progress → Back),
   the history step can land where the user came from rather than where the
   semantic label says. U5.1 §12 prioritizes the actual step; natural drill flows
   match the label exactly (verified). Documented, not fixed — fixing would
   reintroduce a hand-maintained destination.
5. **Assets require HTTP serving** (pre-existing `file://` limitation, unchanged).

## 13. Final acceptance checklist

| §48 item | Status | Evidence |
|---|---|---|
| Weekly default / Monthly secondary / toggle order | ✅ preserved | U2.x locked, untouched, re-verified |
| Calendar follows reference; font stack; dark/purple/glass | ✅ preserved | no U2.x visual file restructured; only scoped additions |
| Calendar card / wheel / purple circle match reference | ✅ preserved | unchanged components; measurements identical |
| Wheel not locked; Oct 8→9, 15→16, 22→23; header auto-updates | ✅ preserved | U2.2 locked, untouched |
| Oct 1 selectable, no W0/D0 | ✅ preserved | U2.2 locked |
| W/D, WEEK START, PRACTICE, GRADED, Cycle Day, Daily Plan hidden | ✅ preserved | U2.1 locked; nothing reintroduced |
| Info box removed; no required "Open Daily Tracker" button; no footer text | ✅ preserved | U2.1/U2.2 locked |
| Double-click → exact Daily Tracker (both views) | ✅ preserved | U2.x locked |
| **Notes/Events supported, above controls, persist, ×delete, no Edit** | ✅ preserved | U2.x locked; not touched |
| **Existing canonical data / completion / Progress / Reports / Tracker intact** | ✅ | §10 mtimes + regression routes + 483/483 |
| **No duplicate calendar/Study Week/completion/progress system** | ✅ | U5.1-13 (no localStorage/setItem/getItem/history in shared UI modules); §10 |
| **No external font dependency** | ✅ | no font added anywhere |
| **No unrelated redesign** | ✅ | §9 file list is exactly the 6 changes |
| **No page-level horizontal overflow at tested widths** | ✅ | §11 responsive (1440–390, 0/0) |
| **Full suite passes** | ✅ | **483 / 483, 0 fail** |
| **New/updated U5.1 regression tests pass** | ✅ | **13 / 13** (`u51.test.js`) |

**CHANGE #001–#006 + active-state (§48 detailed items)**: all verified in §2–§8.

---

### Final verdict

**U5.1 COMPLETE**

Baseline 470/470 → final **483/483** (13 new U5.1 tests + 1 documented 2-assertion
supersession in U4-09, required by this specification). `data/**`, planner, storage,
progress-engine, router and all U2.x Calendar work verified untouched. No new
dependencies. U6 not started — awaiting review, per the STOP rule.
