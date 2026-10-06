# Update U4 — Weekly Report selector + Daily spacing + export parity + Reports breadcrumbs

## 2. Scope, inputs, and baseline

U4 delivers four focused fixes from CHANGE-003 (§3.4/§3.5 carry-over, §4, §5) and
CHANGE-002 (Reports breadcrumbs):

1. **Weekly Timetable Chart export matches the on-screen presentation** — 12-hour
   AM/PM axis, break-only blocks hidden, Weekly Progress section kept (the §3
   on-screen behaviour U3 introduced, now mirrored in the export).
2. **Weekly Report W1–W4 selector** — bare `#/reports/week` opens a four-week
   selection layer with canonical dates; future weeks show their real **0%**.
3. **Daily Report schedule-row spacing** (§5.1) — scoped so the **Tasks table
   (§5.2, locked) stays untouched**.
4. **Reports breadcrumbs** (CHANGE-002) — `Calendar > Reports > [section]`,
   parents clickable, mirroring the Progress crumb pattern exactly.

**Baseline:** 453/453 green at the end of U3. After the U4 source edits the suite
read 451/453 with exactly the two *anticipated* lock failures (export-identity
locks that U4's task deliberately supersedes); both locks were reworked into
parity locks, and the suite ends at **462/462** with the 9 new U4 tests.

**Locked and verified unchanged:** `report-model.js`, `src/index.html`, `data/**`,
Tasks table rendering, daily/overall/subject/week export functions, the daily
export's 24-hour `formatClock`, Tracker/Planner/Progress/storage.

## 3. Section 1 — Weekly Timetable Chart export matches the chart

### 3.1 §3.4 12-hour AM/PM axis (export-engine.js)

The export engine now carries its own calendar-scoped clock, mirroring
`progress-calendar.js`:

- `clockParts(minutes)` → `{ label: '1:00 PM', hour: '1:00', meridiem: 'PM' }`;
  `formatClock12(minutes)` = its label. The original `formatClock` (24-hour) is
  **untouched** — the Daily export's schedule table keeps its locked rendering.
- `axisTicks(window)` emits hour + meridiem parts; `renderAxisHTML` stacks them
  as `<span class="cal-tick-hour">1:00</span><span class="cal-tick-meridiem
  is-pm">PM</span>` so CSS can colour them differently.
- `calendarStylesheet()` gained `.cal-tick-hour` / `.cal-tick-meridiem` rules
  with AM `#4aa8ff` (cool) and PM `#f7c541` (warm) — the same treatment as the
  on-screen `.pc-tick-meridiem` colours.
- Block captions and title attributes now read `11:00 AM – 1:00 PM` instead of
  `11:00 – 13:00`.

### 3.2 §3.5 break-only blocks hidden from the export chart

- `BREAK_ONLY_CATEGORIES = { break, free, fixed }` + `isBreakOnlyBlock(block)`
  copied into the export engine (the export is standalone and cannot import the
  component; the copy is asserted to classify **identically** to
  `ProgressCalendar.isBreakOnlyBlock` in U4-02).
- `renderCalendarHTML` skips break-only blocks before drawing. The report model
  still carries every block; only the drawing loop filters.
- The other export scopes (daily schedule table, weekly day tables) still render
  break rows exactly as before.

### 3.3 Weekly Progress section preserved

`renderCalendarReport` still emits `<h2>Weekly timetable</h2>` followed by
`<h2>Week progress</h2>` with the stat row and the Day/Date table — verified in
order, with canonical week dates listed. Determinism and standalone-ness
(no external script/stylesheet) unchanged.

### 3.4 Verification A — end-to-end export probe

Triggered the real **Export HTML** button in the browser (blob captured from the
live click, not a unit re-render): **16/16 checks passed** —

| Check | Result |
|---|---|
| `cal-tick-hour` stacked spans | ✅ |
| `cal-tick-meridiem is-am` / `is-pm` rendered | ✅ |
| AM `#4aa8ff` ≠ PM `#f7c541` | ✅ |
| No raw `13:00` / `>14:00` anywhere | ✅ |
| No `blk is-rest`, no `Lunch / Rest` | ✅ |
| Academic blocks (`Mathematics …`) still drawn | ✅ |
| `<h2>Weekly timetable</h2>` then `<h2>Week progress</h2>` (in order) | ✅ |
| Canonical `2026-10-02` … `2026-10-08` listed | ✅ |
| Standalone (no external script/stylesheet) | ✅ |
| Caption sample | `11:00 AM – 1:00 PM` |

## 4. Section 2 — Weekly Report W1–W4 selector

### 4.1 §4.1 the bare week route opens the selection layer

- `router.js`: `raw === '#/reports/week'` → `{ level: 'week-select' }`, placed
  after the `/week/:n` pattern so specific weeks keep parsing; new
  `routeForReportWeekSelect()` exported.
- `report-viewer.js`: `SCOPE_TITLES['week-select'] = 'Weekly report'` so the
  heading and the crumb title come from the same table.
- `app.js`: `renderReportWeekSelector()` mirrors `renderCalendarWeekSelector`
  (the already-approved U3 pattern): four `model.buildWeekReport(n)` cards with
  `startDate / endDate / dayCount / available / percent / hash`.
  `renderReports` dispatches `level === 'week-select'` to it, and the Reports
  index card "Weekly report" now points at `routeForReportWeekSelect()`
  (`#/reports/week`, previously a silent jump into Week 1).

### 4.2 Canonical dates and future weeks at real 0%

Each card shows `Week N`, the canonical range (`2026-10-02 – 2026-10-08` …
`2026-10-23 – 2026-10-29`), and `percent% · N study days`. The percent comes
from the *real* model — a future week shows **`0% · 7 study days`, never hidden
or omitted**. Card hashes are `routeForReportWeek(n)` so a click opens exactly
`#/reports/week/<n>`. No second week/date mapping was created (U0 rule).

**Live:** `#/reports/week` rendered 4 cards — W1 `13%` (real stored
completions), W2–W4 `0% · 7 study days`, all four canonical ranges correct.

### 4.3 §4.2 Weekly numeric headers right-aligned (scoped)

```css
.rp-root[data-report-kind="week"] .rp-table th.rp-num { text-align: right; }
```
Same shape as U3's Overall fix: the scoped rule outranks `.rp-table th` so
numeric headers define their column in the same alignment as the values below.
No unscoped `th.rp-num` rule exists (other scopes keep their rendering).

**Live:** on `#/reports/week/2` all 3 `th.rp-num` compute `textAlign: right`,
matching the `td.rp-num` cells beneath them.

## 5. Section 3 — Daily Report schedule spacing (§5.1), Tasks locked (§5.2)

### 5.1 The scope class

`sectionHTML(title, body, extraClass)` already supported a third argument, so
the Schedule section is rendered as
`<section class="rp-section rp-sched">` while the Tasks section stays
`<section class="rp-section">` — one class difference, zero JS to the Tasks
table. New rule in `reports.css`:

```css
.rp-sched .rp-table td { padding-top: 9px; padding-bottom: 14px; }
```

The base `.rp-table td { padding: 9px 10px 9px 0; … }` rule (the Tasks table's
locked presentation) is **byte-identical to baseline**; the scoped rule only
adds bottom clearance, and it is written with `padding-top`/`padding-bottom`
longhands so the base `9px` top padding is preserved.

### 5.2 Verification — computed styles, both tables

**Live** on `#/reports/day/2026-10-02`:

| Element | Class | Computed padding (top/bottom) |
|---|---|---|
| Schedule `td` | `rp-section rp-sched` | **9px / 14px** |
| Tasks `td` | `rp-section` (plain) | **9px / 9px** (locked, unchanged) |
| `rp-sched` occurrences in DOM | — | **1** (Schedule only) |

## 6. Section 4 — CHANGE-002 Reports breadcrumbs

### 6.1 One breadcrumb system, shared with Progress

The Reports shell no longer draws a flat `← Reports` link. The viewer builds
the crumb **model** with `ReportViewer.buildReportNavViewModel(level, ctx)` and
the shell emits it through **`ProgressDrilldown.renderNavHTML`** — the exact
renderer Progress uses — so both sections share one breadcrumb system and one
visual language. The viewer's own draft renderer (`renderReportNavHTML`) was
**removed**; `buildReportNavViewModel` is the viewer's exported piece.

- Index (`#/reports`): `Calendar > Reports` — Calendar is a
  `progress-crumb-link` button (`#/calendar`), Reports is the current crumb.
- Deep (`#/reports/week/2`, `#/reports/day/…`, selector, …):
  `Calendar > Reports > [Weekly report | Daily report | …]` — **both parents
  are buttons** with `data-action="navigate"`, the current crumb is plain text
  with `aria-current="page"`.
- `reportShell` now takes `opts.kind` (passed at every call site) and
  `opts.crumbTitle` where the heading alone is ambiguous; titles come from the
  same `SCOPE_TITLES` table as the page heading.
- No back-button on Reports (`back: null`) — crumbs replace it.

### 6.2 Verification — structure and real clicks (live)

- `#/reports` → crumbs `[Calendar (button), ›, Reports (current)]`.
- `#/reports/week/2` → `[Calendar (button), ›, Reports (button), ›, Weekly report (current)]`.
- Click **Reports** on a deep page → lands `#/reports`, heading `Reports`,
  crumbs collapse to `Calendar › Reports`. ✅
- Click **Calendar** on the index → lands `#/calendar` (Calendar view renders). ✅
- `reports.test.js` (and the whole suite) needed **no changes**: no test asserted
  the old `← Reports` markup — only the U0 audit document mentions it historically.

## 7. Tests

- **462/462 pass, 0 fail** (`node --test`), duration ~6.2 s.
- Baseline 453 (U3) → 451 after source edits (the two anticipated lock failures)
  → lock reworks → 453 → **+9 new U4 tests = 462**.
- **`tests/renderer/reports-u4.test.js` (new, 9 tests):**
  - U4-01 export 12-hour axis (`formatClock12`, stacked spans, distinct AM/PM
    colours, captions, no `13:00`).
  - U4-02 break filter parity with `ProgressCalendar.isBreakOnlyBlock`, labels
    absent, drawn-count = total − breaks, model data intact.
  - U4-03 Weekly Progress section present and ordered, canonical dates,
    determinism, standalone.
  - U4-04 `routeForReportWeekSelect()` + `parseRoute('#/reports/week')` →
    `week-select`; `/week/3` unchanged.
  - U4-05 selector: 4 cards, canonical ranges, per-card `0%`, own-report hashes.
  - U4-06 all four weeks available at real 0% with canonical dates visible.
  - U4-07 scoped week `th.rp-num` rule exists, no unscoped leak, base
    `.rp-table td` padding unchanged.
  - U4-08 `.rp-sched` on Schedule only (count = 1), Tasks section plain, scoped
    rule 9px/14px+, base rule locked.
  - U4-09 breadcrumb model + rendered markup (via `ProgressDrilldown`): index
    2 crumbs, deep 3 crumbs, parents carry `data-hash`, current has
    `aria-current`, no back-button, `week-select` crumb title.
- **Lock reworks (why 451 → 453):**
  - `export-engine.test.js` determinism test: expectation `blk is-rest` present
    → asserts it is **absent** (break filter) while determinism/identity stayed.
  - `reports-u3.test.js` U3-11: was "export clock/labels unchanged"; reworked to
    "export presentation matches the chart (12h + break filter), identity,
    titles, determinism and the daily export's 24h clock untouched". This is a
    deliberate supersession by the U4 mandate, recorded here as the lock's new
    contract — not a silent weakening.

## 8. Files changed (U4)

| File | Change |
|---|---|
| `src/js/export-engine.js` | `clockParts`/`formatClock12`, `axisTicks` + `renderAxisHTML` (stacked hour/meridiem), `BREAK_ONLY_CATEGORIES`/`isBreakOnlyBlock`, break filter in `renderCalendarHTML`, `.cal-tick-*` stylesheet rules, exports |
| `src/components/reports/report-viewer.js` | `SCOPE_TITLES['week-select']`; Schedule section gets `'rp-sched'` (3rd `sectionHTML` arg); week-card real percent; `buildReportNavViewModel` added, draft `renderReportNavHTML` removed |
| `src/js/router.js` | bare `#/reports/week` → `week-select`; `routeForReportWeekSelect()` |
| `src/js/app.js` | `reportShell` breadcrumbs via `ProgressDrilldown.renderNavHTML(buildReportNavViewModel(...))` + `kind` option at all call sites; `renderReportWeekSelector()`; `renderReports` dispatches `week-select`; index card hash |
| `src/css/reports.css` | scoped week `th.rp-num` right-align; `.rp-sched .rp-table td { padding-top: 9px; padding-bottom: 14px; }` |
| `tests/engine/export-engine.test.js` | determinism reworked to the break-filter expectation |
| `tests/renderer/reports-u3.test.js` | header note + U3-11 lock reworked to presentation-parity |
| `tests/renderer/reports-u4.test.js` | **new** — 9 tests |

## 9. Documented decisions & divergences

1. **Shared breadcrumb renderer.** The viewer *builds* the model, Progress
   *renders* it (`ProgressDrilldown.renderNavHTML`). A second Reports-specific
   renderer would have been a divergent second breadcrumb system (U0's explicit
   "do not reinvent" rule), so the draft viewer renderer was deleted instead of
   maintained in parallel.
2. **Export clock duplication is deliberate.** `formatClock12`/`clockParts` are
   copied into the export engine rather than imported, because the export must
   run standalone — same reasoning the export already applies to geometry/colours.
   Parity is enforced by test (U4-02 asserts predicate equality both ways).
3. **24-hour clock retained for the daily export** (`formatClock` untouched) —
   §5 locks the daily scope; only the *calendar* export adopts the 12-hour axis.
4. **U3-11 lock reworked, not dropped** — its identity/determinism/title half
   still stands verbatim; the "labels unchanged" half is superseded by U4's
   explicit "export must match the screen" instruction. The reworked test is
   stricter where it can be (no `13:00` anywhere, break filter, daily 24h kept).
5. **Spacing via longhand padding** (`padding-top`/`padding-bottom` on
   `.rp-sched`) so the base shorthand rule never has to be edited — the locked
   Tasks row rule stays byte-identical.

## 10. Remaining issues

None blocking. Notes for later passes:

- The temporary U4 static server (`tmp-server.js`, port 8099) and its scratch
  files are removed during cleanup; dev verification can reuse any static server
  rooted so that `src/index.html`'s relative asset paths resolve
  (e.g. serve with `/` → `src/index.html` **and** asset paths rewritten, or open
  `/src/index.html` directly).
- `.playwright-mcp` capture artifacts (snapshots, console logs, the downloaded
  `Week-1-Timetable.html`) are session artifacts of the browser tool; they live
  under the browser tool's own workspace and are cleaned with this session.
- W1 showed `13%` in the selector because the browser profile carries earlier
  stored completions — this is the *real* progress (by design); a fresh profile
  shows `0%`.

## 11. Verdict

# ✅ U4 COMPLETE

- Export presentation matches the on-screen chart (12-hour AM/PM axis, break
  blocks hidden, captions included) with the Weekly Progress section, canonical
  dates, determinism and standalone-ness intact — **16/16 live export checks**.
- `#/reports/week` opens the four-week selection; canonical dates on all four
  cards; future weeks visible at their real **0%**; `#/reports/week/:n` unchanged.
- Daily schedule rows carry 9px/14px clearance scoped to `.rp-sched`; the Tasks
  table computes 9px/9px exactly as locked.
- Reports breadcrumbs mirror Progress (`Calendar > Reports > [section]`), both
  parents clickable and verified by real navigation clicks.
- Tests: **462/462 green** (453 baseline + 9 new U4 tests, both anticipated
  lock reworks included); zero console errors in the live sweep.

**STOP — U5 not started, as instructed.**
