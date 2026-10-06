# Update U3 — Reports: Overall Progress alignment + Weekly Timetable Chart

**Status: U3 COMPLETE** — both CHANGE-003 sections implemented, unit-tested, and browser-verified.
`node --test` → **453/453 pass, 0 fail** (442 baseline + 11 new U3 tests). Calendar (U2.x),
Export HTML, Calendar/Tracker/Planner/storage/progress engines remain locked and untouched
(mtime-verified).

## 2. Scope, inputs, and baseline

- Requirements taken from the on-disk change specification
  `reference/change-specification/v5/Study-Planner_Change-Specification-v5.json` (CHANGE-003,
  extracted to readable text):
  - **§2 Overall Progress** — Problem A: header cells and data cells must hold one stable
    column/row structure ("every header must define one stable column, and every row's value
    must remain directly under the correct header"). Problem B (negative): do not change the
    Export HTML action, generation flow, or behavior.
  - **§3 Weekly Timetable → Weekly Timetable Chart** — 3.1 rename; 3.2 show all four weeks
    *before* opening a chart; 3.3 canonical study-week dates (W1 must read Friday, October 2 —
    not October 1); 3.4 human 12-hour AM/PM axis with visually distinguishable meridiem (FIG-005,
    desirable reference FIG-007); 3.5 hide break-only grey blocks without deleting data
    (FIG-006); 3.6 remove the unnecessary internal scrollbar while preserving page scrolling,
    and do not add it back unless the chart genuinely needs it (FIG-008).
- Design reference on disk: `reference/academic-schedule/Dark Weekly Academic Schedule.png`
  (stacked `hour / AM` labels, AM cool-blue, PM warm-amber, day headers = weekday + **date**,
  no grey blocks, no internal scrollbar). The implementation matches this treatment.
- **STEP 1 baseline:** `node --test` → 442/442 before any U3 change (U2.3 state).
- Integrity method: modification timestamps (no git repo). Files touched by U3 (10-06 01:2x–01:29):
  `src/js/app.js`, `src/js/router.js`, `src/components/reports/progress-calendar.js`,
  `src/components/reports/report-viewer.js`, `src/css/reports.css`,
  `tests/renderer/reports.test.js` (3 behavioral updates), new `tests/renderer/reports-u3.test.js`.
  Untouched (pre-U3 mtimes): `src/js/export-engine.js` (10-05 07:01), `src/js/report-model.js`
  (10-05 07:03), `progress-engine.js`, `storage.js`, `planner-engine.js`, `calendar-wheel.js`,
  `calendar-u21.css`, `src/index.html`, `data/**`.
- Serving during verification: temporary `tmp-server.js` on port 8099 with `Cache-Control:
  no-store` (deleted during cleanup). Fresh query strings were used between navigations (the
  identical-URL `page.goto()` no-op gotcha).

## 3. Section 1 — Overall Progress table alignment (verified first, per the strict hierarchy)

### 3.1 Diagnosis (baseline evidence)

At 1440×900, `#/reports/overall` — table geometry is structurally a real `<table>`, so cells of
one column share identical left/right edges. The drift is **header vs value alignment**:

| Column | Header (text edge) | First-row value | Baseline problem |
|---|---|---|---|
| Completed (Subjects) | left-aligned at 555 | right-aligned, right edge 814 | value sat under the **TOTAL** header |
| Total (Subjects) | left at 814 | right edge 963 | value sat under **PROGRESS** |
| Progress (Subjects) | left at 963 | right edge 1192 | value had no header above it |
| Completed/Total/Progress (Weeks) | left | right | same horizontal "drift" |

Root cause: `tableHTML` correctly marks numeric headers `class="rp-num"`, but the rule
`.rp-table th { text-align: left; }` (specificity 0-1-1) **outranks** `.rp-num` (0-1-0), so every
numeric header rendered left-aligned over right-aligned values. Left edges of section title, first
header and first cell were already equal (240.8px), so no markup change was needed.

### 3.2 Fix (one scoped rule, zero JS)

```css
.rp-root[data-report-kind="overall"] .rp-table th.rp-num { text-align: right; }
```

Scoped **only to the Overall report** — Subject/Week/Daily tables (other spec sections, U4
territory) keep their exact previous rendering.

### 3.3 Verification A — after

| Column | Header right edge | Value right edge | Verdict |
|---|---|---|---|
| Subjects: Completed / Total / Progress | 814 / 963 / 1192 | **814 / 963 / 1192** | header sits exactly on its column, value directly under it |
| Weeks: Completed / Total / Progress | 929 / 1032 / 1192 | **929 / 1032 / 1192** | same |
| Text columns (Subject/Week/Dates) | left-aligned | left cells | unchanged |

Screenshot: `.u3-shots/overall-after.png` — every scan line now reads header → value in one
vertical column. No data, calculation, markup or export path was touched for Part 1.

## 4. Section 2 — Weekly Timetable → Weekly Timetable Chart

### 4.1 §3.1 Rename (on-screen; the locked export keeps its own strings)

| Location | Before | After |
|---|---|---|
| Reports index card (`app.js`) | `Weekly timetable` → `#/reports/calendar/week/1` | **`Weekly Timetable Chart`** → `#/reports/calendar` |
| Index card detail | `7-day schedule with real times` | `Week 1–4 · 7-day schedule with real times` |
| `ReportViewer.SCOPE_TITLES.calendar` / `['calendar-select']` | `Weekly timetable` | **`Weekly Timetable Chart`** |
| Chart head (`.pc-title`, app override) | `Weekly timetable — Week N` | **`Weekly Timetable Chart — Week N`** |
| Selector heading | n/a | **`Weekly Timetable Chart`** |

**Deliberate lock decision:** the shared *report-model* title
(`'Weekly timetable — Week N'`) and the export's `<h2>Weekly timetable</h2>` are **unchanged** —
the model feeds the locked export's `<title>/<h1>`, and the U3 prompt requires the export to
remain byte-for-byte untouched. The rename is applied at the presentation layer only (app.js
view-model override + viewer labels), with a comment in `app.js` explaining the boundary.
The browser-verified export still reads `<h1>Weekly timetable — Week 1</h1>` (§6).

### 4.2 §3.2 Week-selection view before any chart

- **Router** (`router.js`): `#/reports/calendar` now parses to `level: 'calendar-select'`
  (previously it silently injected `weekNumber: 1`). `routeForReportCalendar()` with no week
  returns `#/reports/calendar`; with a week it still returns `#/reports/calendar/week/:n`;
  subject scoping unchanged. Route comments updated.
- **App** (`app.js`): new `renderCalendarWeekSelector()` runs through the existing
  `runReportLevel` (same loading/failure/error handling as every other scope) and builds the four
  cards from **`model.buildWeekReport(1..4)`** — the same report model the chart itself uses, i.e.
  the canonical `plan.weekNumber → first/last plan date` mapping. No second week/date mapping was
  created (per U0's "do not reinvent" rule).
- **Viewer** (`report-viewer.js`): new pure `renderWeekSelectHTML(weeks, opts)` renders a
  `role="list"` of four `.rp-week-card` links, each with `Week N`, its ISO range and day count.
- **Dispatch** (`renderReports`): `level === 'calendar-select'` → selector; `level === 'calendar'`
  → chart (unchanged). Export button is *not* rendered on the selector; `exportCurrentReport`
  falls through to its "no report on this page" toast for that level (never hits the export path).

**Live evidence:** index card click → `#/reports/calendar` shows exactly four cards:

| Card | Range shown | Link |
|---|---|---|
| Week 1 | 2026-10-02 – 2026-10-08 | `#/reports/calendar/week/1` |
| Week 2 | 2026-10-09 – 2026-10-15 | `#/reports/calendar/week/2` |
| Week 3 | 2026-10-16 – 2026-10-22 | `#/reports/calendar/week/3` |
| Week 4 | 2026-10-23 – 2026-10-29 | `#/reports/calendar/week/4` |

Screenshot: `.u3-shots/selector.png`. Each card opens its week's chart; W1–W4 each rendered
42 visible blocks with correct headers (probe table in §5).

### 4.3 §3.3 Canonical dates (no second mapping)

- Chart head subtitle is model-derived and was already canonical: W1 `2026-10-02 – 2026-10-08`
  … W4 `2026-10-23 – 2026-10-29` (plan `weekNumber` filtering — U0 audit: "already canonical,
  do not reinvent"; untouched).
- **FIG-004 fix:** the day column headers previously displayed the **cycle day number**
  (`Fri 1` for October 2 — readable as "October 1"). The view model now derives the
  **date-of-month from the plan's own ISO date** (`dayNum`, presentation-only):
  W1 renders `FRI 2 … THU 8`, W2 `… 9–15`, W3 `16–22`, W4 `23–29` — first study day = Friday,
  October 2, exactly as the spec demands. Unit test U3-06 asserts `dayNum !== dayNumber` for
  Oct 2 and that no `pc-daynum">1<` appears.

### 4.4 §3.4 Human 12-hour axis with distinguishable AM/PM

- `ProgressCalendar.formatClock` now formats minutes as `h:mm AM/PM`
  (`660 → 11:00 AM`, `720 → 12:00 PM`, `780 → 1:00 PM`, `1380 → 11:00 PM`) — pure display;
  block geometry, windows and all schedule data still use raw minutes.
- `axisTicks` additionally exposes `hour` + `meridiem`; `renderAxisHTML` stacks them in separate
  spans (`.pc-tick-hour` / `.pc-tick-meridiem.is-am|.is-pm`) so CSS colours them like the
  desirable reference: **AM `#4aa8ff` (cool blue), PM `#f7c541` (warm amber)** — live-computed
  colors `rgb(74,168,255)` vs `rgb(247,197,65)`, verified distinct.
- Live tick row (was `11:00 12:00 13:00 … 23:00`):
  `11:00 AM · 12:00 PM · 1:00 PM · 2:00 PM … 11:00 PM`.
- Block captions/tooltips use the same 12-hour format (on-screen only).
- **`export-engine.js`'s own `formatClock` is intentionally untouched** — see §7 divergence D1.

### 4.5 §3.5 Break-only blocks hidden (presentation filter, data untouched)

- Predicate `ProgressCalendar.isBreakOnlyBlock(block)`:
  `category ∈ { break, free, fixed }` — the zero-capacity, non-academic grey blocks
  (`Lunch / Rest`, `Relax`, `Walk / Refresh`, `Refresh`, `Free / Refresh`, `FIXED TIME`).
  `study / revision / review / practice` are study activities and are **never** filtered
  (unit-tested both directions, U3-03).
- Filter applied **only** in `buildCalendarViewModel` (the view model), before rendering.
  `report.days[].blocks` in the report model still carries all 84 blocks of the week; the
  locked export renders break blocks exactly as before (verified live: downloaded
  `Week-1-Timetable.html` contains `Lunch / Rest` **and** `FIXED TIME`).
- Live effect: 84 → **42 visible blocks** per week (28 study + 7 revision + 7 review),
  0 break-only labels on screen; grey gaps now read as empty space, study schedule is the
  focus — matching FIG-007's desirable look. Data-preservation proven by test U3-04.

### 4.6 §3.6 Internal scrollbar — root cause found and fixed at the source

**Diagnosis (measured, not guessed):**

- `.pc-calendar` is auto-height with `overflow-x: auto`. Per CSS, pairing a non-`visible` axis
  makes `overflow-y` *compute to* `auto` — so a vertical scrollbar is possible even though the
  container grows with its content and never needs to scroll.
- The content measured **778px vs clientHeight 777px → a 1px phantom overflow**. The offender:
  `.pc-gridline` at `top:100%` draws its `border-top` **1px below** the 720px body window
  (720→721). That single decorative hairline made `scrollHeight > clientHeight`, and the
  computed `overflow-y:auto` put the needless scrollbar on the right of the chart (FIG-008).

**Fix (sizing, not suppression):** the gridline now draws *on* its hour coordinate
(`transform: translateY(-100%)`) so every line stays inside the window. `overflow-x: auto`
is kept because narrow screens genuinely need contained horizontal scrolling (spec allows:
"unless the chart genuinely requires scrolling"); nothing was hidden and no scrollbar was
"CSS-suppressed".

**Evidence:** desktop `scrollHeight = clientHeight = 777` → `vBar: false`, `hBar: false`;
page-level scrolling intact (`docHScroll: false` at 1440 and at 390). Mobile 390×780:
`hBar: true` (genuine, contained inside `.pc-calendar`), `vBar: false`, page never overflows
horizontally. Unit test U3-10 locks the gridline rule and the preserved `overflow-x: auto`.

## 5. Verification B — week selector × axis × breaks × scrollbar (live probe)

| Check | W1 | W2 | W3 | W4 |
|---|---|---|---|---|
| Title | Weekly Timetable Chart — Week 1 | … Week 2 | … Week 3 | … Week 4 |
| Canonical range | 2026-10-02 – 2026-10-08 | 2026-10-09 – 2026-10-15 | 2026-10-16 – 2026-10-22 | 2026-10-23 – 2026-10-29 |
| Day headers (dates) | 2…8 (Fri…Thu) | 9…15 | 16…22 | 23…29 |
| Visible blocks | 42 (0 break-only) | 42 | 42 | 42 |
| Axis (W1) | `11:00 AM, 12:00 PM, 1:00 PM … 11:00 PM` — stacked, AM `rgb(74,168,255)`, PM `rgb(247,197,65)` | same 12-hour pattern | same | same |
| Internal scrollbar | none (777 = 777) | none | none | none |
| Export button on chart | present | present | present | present |

Navigation path verified end-to-end: Reports index → click **Weekly Timetable Chart** →
selector → click **Week N** → correct chart; hash deep-links `#/reports/calendar/week/2..4`
also re-render correctly (router-driven, refresh-safe).
Screenshots: `.u3-shots/chart-w1.png`, `.u3-shots/chart-w4.png`, `.u3-shots/selector.png`,
`.u3-shots/overall-after.png`.

## 6. Verification C — Export HTML preserved (locked)

- **Implementation untouched:** `export-engine.js` and `report-model.js` retain pre-U3 mtimes
  (10-05 07:01 / 07:03); all export-engine tests pass unmodified.
- **Live download:** clicking *Export HTML* on the W1 chart produced
  `Week-1-Timetable.html` (31,599 bytes) and the file was inspected:
  - `<h1>Weekly timetable — Week 1</h1>` ✓ (original title intact — the rename did not leak)
  - `<h2>Weekly timetable</h2>` ✓ (original section heading intact)
  - 24-hour ticks (`13:00` present), **no** `1:00 PM` / `pc-tick-meridiem` leakage ✓
  - break blocks still rendered (`Lunch / Rest`, `FIXED TIME`) ✓
- `tests/engine/export-engine.test.js` untouched and green (determinism, single `<h1>`,
  7 day columns, exact geometry, token colors, break block, states).
- New test U3-11 additionally *locks* this state (old title string, `ExportEngine.formatClock`
  still 24-hour, breaks present, byte determinism), so any future accidental export change fails
  the suite.

## 7. Verification D — regression sweep (live, zero console errors)

Hash-routed through 8 routes after the changes; every route rendered content with the expected
heading and **zero page/console errors**: `#/calendar` (calendar-view-active),
`#/day/2026-10-02` (Day 1 — Study Tracker), `#/progress` (Progress), `#/reports` (Reports),
`#/reports/overall` (Overall progress), `#/reports/week/1` (Weekly report),
`#/reports/day/2026-10-05` (Daily report), `#/reports/calendar/subject/mathematics-i`
(Mathematics I — Week 1). Calendar/Tracker/Planner/Progress sections were read-only during U3.

## 8. Tests

`node --test` → **453/453 pass, 0 fail, 0 skipped** (baseline 442 + 11 new).

- **New `tests/renderer/reports-u3.test.js` (11):**
  U3-01 ticks speak 12-hour AM/PM; U3-02 stacked hour+meridiem spans with distinct colours;
  U3-03 break-only predicate (break/free/fixed yes, study/revision/review no);
  U3-04 chart hides 42 break-only blocks while the model keeps all 84 (incl. `lunch-rest`);
  U3-05 all four weeks carry the canonical ranges; U3-06 day headers show the date (Fri 2, not 1);
  U3-07 rename + bare route = selection level with no week; U3-08 selector renders W1–W4 cards
  with canonical ranges and per-week links; U3-09 scoped Overall `th.rp-num` CSS (and no unscoped
  rule); U3-10 gridline root-cause rule + preserved contained x-scroll; U3-11 export lock
  (old title, 24-hour `formatClock`, break blocks, determinism).
- **Updated in `tests/renderer/reports.test.js` (existing expectations that intentionally changed):**
  `formatClock` 24h → 12h assertions; "every *VISIBLE* rendered block carries its real time"
  (iterates the view model); tick-count regex no longer matches inner `pc-tick-hour` spans;
  colour-token test asserts study/revision/review present and `pc-tok-rest` absent on screen;
  non-task block check now uses a visible revision/review block (break blocks no longer render);
  heights test uses visible 120-min/90-min blocks (60-min `free` block is hidden);
  route table: `#/reports/calendar` → `calendar-select`.
- Untouched test files: all engine, data, calendar, tracker, progress and app tests — green.

## 9. Files changed (U3)

| File | Change |
|---|---|
| `src/css/reports.css` | scoped Overall `th.rp-num` right-align; AM/PM tick colours; `.pc-gridline` translateY root-cause fix; `.rp-week-select/.rp-week-card` styles |
| `src/components/reports/progress-calendar.js` | 12-hour `formatClock` + `clockParts`; `axisTicks` hour/meridiem; `isBreakOnlyBlock` view filter; `dayNum` date headers; stacked `renderAxisHTML`; exports |
| `src/components/reports/report-viewer.js` | `SCOPE_TITLES` rename (+ `calendar-select`); new `renderWeekSelectHTML` |
| `src/js/router.js` | bare `#/reports/calendar` → `calendar-select` level; `routeForReportCalendar()` no-week → selection route; comments |
| `src/js/app.js` | index card rename + selection hash; `renderCalendarWeekSelector()`; dispatch; on-screen chart title override (model/export untouched) |
| `tests/renderer/reports.test.js` | 7 expectations updated to the new intended behavior |
| `tests/renderer/reports-u3.test.js` | **new**, 11 tests |
| `reports/update-u3-reports-overall-timetable.md` | this report |

**Locked & untouched (mtime-verified):** `export-engine.js`, `report-model.js`,
`progress-engine.js`, `storage.js`, `planner-engine.js`, `data-engine.js`, calendar components/
CSS (`calendar-wheel.js`, `calendar-u21.css`, …), `src/index.html`, `data/**`, Tracker/Progress
components, note/event persistence.

## 10. Documented decisions & divergences

- **D1 — export vs screen (deliberate, prompt-mandated):** the on-screen chart now uses 12-hour
  AM/PM, the new title and hidden break blocks; the **locked export keeps 24-hour labels, the
  original `Weekly timetable` headings, and break blocks**. `export-engine.js` even carries an
  internal comment claiming the cycle-day header matches "the app viewer" — now stale, but the
  file is explicitly locked by the U3 prompt, so it was not edited. Unifying them would require
  modifying the export implementation — out of scope and forbidden by U3.
- **D2 — `FIXED TIME` hidden with the breaks:** it is a zero-capacity, non-academic
  (`Temple + Food + Personal`) grey block in the break/free/fixed family; hiding it follows
  "grey break/gap blocks should not occupy chart space" while never touching academic blocks
  (`study`, `revision`, `review`, `practice` all remain). Easy to narrow to `break/free` only if
  preferred — one line in `BREAK_ONLY_CATEGORIES`.
- **D3 — fix scoped to Overall:** the shared `.rp-table` defect also exists in other scopes, but
  the U3 spec fixes Section 1 only; the selector is scoped with
  `[data-report-kind="overall"]` so Weekly/Daily/Subject rendering is byte-identical to before
  (their alignment work belongs to §4.2/U4).

## 11. Remaining issues

None blocking. Notes for later updates: (1) export/screen divergence D1 resolves only when an
explicitly export-scoped change is authorized; (2) the Reports index "Weekly report" card still
says "Week 1 tasks and progress" — that is §4 (U4) scope, untouched here.

## 12. Verdict

**U3 COMPLETE.** Part 1 (Overall header→column→row alignment) and Part 2 (rename, W1–W4 selector,
canonical dates, 12-hour AM/PM axis, break-only blocks hidden, scrollbar root cause) all
implemented, unit-tested (453/453) and browser-verified; Export HTML proven unchanged and working;
Calendar/Tracker/Planner/storage/progress untouched. Temp artifacts (`tmp-server.js`, port 8099,
`.u3-shots/`, `spec-u3.txt`) removed during cleanup. **Stopping here — not starting U4.**
