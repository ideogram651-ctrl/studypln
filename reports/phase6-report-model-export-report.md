# Phase 6 — Report Model, Export Engine, Report Viewer

**Project:** Study-Planner (IIT Madras BS, 28-day cycle)
**Phase:** 6 — Report Model + Export Engine + Report Viewer + Progress Calendar
**Status:** Complete and validated
**Date:** 2026-10-05

---

## 1. Recovery Check

Performed before writing any code, per the Phase 6 instructions.

### 1.1 Current repository state

| Area | Finding |
|---|---|
| Phases 1–5 | Intact. All 193 pre-existing tests passed at the start of the phase and pass unchanged now. |
| `data/` | 36 files, all present, none modified in this phase. |
| Version control | No git repository (`fatal: not a git repository`). Integrity was verified by modification timestamp instead (see §1.7). |

### 1.2 Pre-existing report/export files — the key finding

Every Phase 6 file **already existed but was 0 bytes** — empty placeholders that were
never implemented and never referenced by `index.html`, `app.js`, or `router.js`:

| File | Size at start | Referenced? |
|---|---|---|
| `src/js/report-model.js` | 0 bytes | No |
| `src/js/export-engine.js` | 0 bytes | No |
| `src/components/reports/report-viewer.js` | 0 bytes | No |
| `src/components/reports/report-tree.js` | 0 bytes | No |
| `src/components/reports/export-controls.js` | 0 bytes | No |
| `src/css/reports.css` | 0 bytes | No |
| `tests/engine/report-model.test.js` | 0 bytes | No |
| `tests/engine/export-engine.test.js` | 0 bytes | No |

Consequence: Phase 6 was **greenfield**. This phase filled the declared stubs rather
than inventing a new file structure. Each empty test file counted as "1 pass" in
`node --test` purely as an empty file-level test, which is consistent with the Phase 5
report's table.

### 1.3 Phase 5 confirmed intact

`progress-engine.js`, `storage.js`, and the six progress components were read and left
untouched. `progress-engine.js` remains the only progress calculation authority and
`storage.js` the only completion authority. Task completion remains tracker-only.

### 1.4 Schedule schema — inspected before implementing the calendar

Read directly from `data/schedule/daily/2026-10-02.json` and `planner-engine.js`:

```json
{
  "blockId": "mathematics",
  "start": "11:00",
  "end": "1:00",
  "label": "Mathematics",
  "focus": "New Lectures + Questions",
  "category": "study",
  "subjectId": "mathematics-i",
  "taskIds": ["mathematics-i:1:L1.1", ...]
}
```

Facts established:

- 28 plan files, `2026-10-02` → `2026-10-29`; 4 weeks × 7 days.
- Exactly 12 schedule blocks per day, 336 blocks in the cycle.
- Plan categories present: `study`, `break`, `free`, `revision`, `review`, `fixed`.
- Each block carries real `start`, `end`, `label`, `subjectId`, `category` and `taskIds`.

**Critical finding — times are 12-hour clock strings with no meridiem.** `planner-engine.js`
states this explicitly (*"Times are 12-hour clock strings without AM/PM, exactly as
specified"*). The distinct times in use are `1:00 1:30 3:00 3:30 5:00 6:00 8:00 8:30 9:15
9:30 10:30 11:00`.

Read naively the day's clock values *decrease* (660 → 60), because the study day runs
**11:00 → 23:00**. Any implementation that parsed these as 24-hour values would draw an
inverted, wrong calendar. The meridiem is therefore recovered deterministically from the
day's own ordering (see §3.2). No time is rounded, and nothing is invented.

### 1.5 Architecture read before implementation

`data-engine.js`, `storage.js`, `progress-engine.js`, `planner-engine.js`, `calendar.js`,
`router.js`, `renderer.js`, `app.js` and the progress components were all read. The
report model follows their established conventions exactly: the same UMD wrapper, the
same `globalThis.StudyPlanner.*` + `module.exports` dual export, the same error-class
style, and the same dependency-guard pattern.

### 1.6 Existing export documentation

`docs/export-system.md` already specified the export scopes, the self-contained
requirement, the Overall → Subject → Week → Day → Task hierarchy, the read-only
guarantee, and the target file layout. Phase 6 conforms to it; the suggested file names
from §3 are implemented and unit-tested.

### 1.7 Data integrity

All 36 files under `data/` carry their original timestamp; none was written in this
phase. `data/syllabus/` (4 files) and `data/schedule/daily/` (28 files) are untouched,
as are `data/progress/`. The schedule validation suite (6 tests) still passes.

---

## 2. Implementation Summary

Phase 6 adds a read-only reporting layer above the existing architecture. No planning
logic, no second progress calculation, and no new source of truth were introduced.

Delivered:

1. **Report Model** (`src/js/report-model.js`) — normalized, read-only interpretation of
   the canonical syllabus plus the materialized daily plans, with five scopes: overall,
   subject, week, day, and the weekly progress calendar.
2. **Export Engine** (`src/js/export-engine.js`) — consumes the report model and emits
   deterministic, standalone HTML.
3. **Report Viewer** — five in-app report routes plus an index, rendered through the
   existing router and component architecture.
4. **Progress Calendar** — a clean 7-day weekly timetable driven entirely by real
   schedule data and real progress, following the supplied reference design.

Architectural boundaries held:

- `progress-engine.js` is still the only progress authority; the report model delegates
  every number to it and performs no arithmetic of its own.
- `storage.js` is still the only completion authority; the report model receives the
  completion map read-only.
- Reports are strictly read-only: no report path writes storage or mutates a plan.

---

## 3. Report Model

`src/js/report-model.js` — UMD module, `globalThis.StudyPlanner.ReportModel`.

### 3.1 Structure

`createReportModel(context)` binds three inputs once — canonical `courses`, the
`completions` map, and the `plans` — and exposes the report scopes as accessors over
that fixed context. Because the context is bound once, the viewer and the export engine
consume **the same model instance**; there is no second calculation path.

### 3.2 Time resolution

Three small pure functions, exported for direct testing:

- `clockToDialMinutes('11:00')` → `660`. Rejects out-of-range input (`13:00`, `25:00`,
  `'nope'`) by returning `null` instead of guessing.
- `resolveSchedule(blocks)` — the day is known to run forward from its first block, so
  whenever a clock value moves backwards relative to the previous block, one 12-hour
  cycle (720 min) is added. Result for a real day: `11:00`→660 … `23:00`→1380, monotone
  non-decreasing, durations 120/30/90/30/90/60/120/30/45/15/60/30.
- `resolveWindow(resolved)` — earliest start to latest end, shared across a whole week
  so every column aligns to one time axis.

Verified properties: a 120-minute block is **exactly twice** a 60-minute block; `:15`
and `:30` boundaries are positioned exactly; times are never rounded.

### 3.3 The five scopes

| Scope | Provides |
|---|---|
| **Overall** | cycle start/end, day count, totals, subject rows, week rows, all tasks |
| **Subject** | identity (subjectId, courseId, courseName), weekCount, per-week nodes, tasks |
| **Week** | week number, start/end date, per-day nodes, week total |
| **Day** | date, day/week number, weekday, the 12 resolved blocks, tasks, node |
| **Calendar** | week scope **plus** a shared window and time-positioned blocks per day |

All four content scopes are assembled from three shared helpers — `planTasks`,
`scopeNode`, `tasksToSummary` — so report types share one implementation instead of
repeating business logic. A week with a missing plan reports 6 days honestly rather than
padding to 7.

### 3.4 Deterministic colour

`colorTokenFor(block)` maps a block to a token from data only: the subject first
(`mathematics-i`→`math`, `statistics-i`→`stats`, `computational-thinking`→`ct`,
`english-i`→`english`), else the category (`revision`, `review`, `practice`, then
`break`/`free`/`fixed`→`rest`). No randomness, no generated hues. The same subject is
always the same colour in the app and in the export. The model emits **tokens**, not
colours, so it stays format-neutral; the actual palette lives in `reports.css` and in
the export stylesheet.

### 3.5 Consistency with progress-engine

Verified by test against the real data, comparing the four shared numbers
(`total`, `completed`, `remaining`, `percent`):

| Report scope | Engine function |
|---|---|
| Day | `dayProgress` |
| Week | `weekProgressAcrossSubjects` |
| Subject | `progressForCourse` |
| Overall | `progressForAllCourses().overall` |

Note: `progressForAllCourses` nests the cycle node under `.overall`; the report exposes
that node directly so a report node and an engine week/day node have the same shape.
This was found by the tests and fixed in the model rather than worked around in the test.

Reconciliation also holds: week totals equal the sum of their day rows, subject totals
equal the sum of their week nodes, and overall equals the sum of both subject and week
rows.---

## 4. Report Viewer

The Report Viewer is a **view inside the existing application**, not a second
application. It renders into the existing `#view` root through the existing router and
follows the existing component conventions (`buildXViewModel` + `renderXHTML`).

### 4.1 Routes

Report routes live under `#/reports`, checked in `parseRoute` *after* the Phase 4 and
Phase 5 routes so the earlier phases keep their exact behaviour.

| Hash | Scope |
|---|---|
| `#/reports` | report index |
| `#/reports/overall` | overall report |
| `#/reports/subject/:subjectId` | subject report |
| `#/reports/week/:n` | weekly report |
| `#/reports/day/:YYYY-MM-DD` | daily report |
| `#/reports/calendar` | weekly timetable (week 1) |
| `#/reports/calendar/week/:n` | weekly timetable, week n |
| `#/reports/calendar/subject/:subjectId` | timetable scoped to one subject |

Every scope is a real URL, so refreshing reopens exactly that report — matching the
Phase 4/5 refresh-safe convention. A `Reports` entry was added to the existing header
nav alongside `Progress`.

### 4.2 Components

| File | Role |
|---|---|
| `report-viewer.js` | renders the four content scopes, the index, and the shared stat/table/section pieces |
| `progress-calendar.js` | the weekly timetable view model and markup |
| `report-tree.js` | the Overall → Subject → Week → Day navigation hierarchy (links only, no numbers) |
| `export-controls.js` | the export button markup and the Blob download |

The viewer performs **no counting**. It is handed a report and renders it. All text
sourced from data is escaped through `Renderer.escapeHtml`, and progress bars carry an
`aria-label` so the value is announced, not merely visual.

### 4.3 Bug found and fixed during browser validation

On a **direct visit or refresh** to `#/reports`, the index rendered empty. Two separate
defects caused it:

1. The index list was gated on `currentModel`, which is only populated by a
   data-loading render, so a cold load had nothing to show. The links are static routes
   and must not depend on loaded data.
2. `renderReportsIndex()` *returned* its HTML while every other scope painted via
   `runReportLevel`, so the returned string was discarded and the view stayed blank.

Both were fixed: the index is now a static list, and it paints synchronously via
`Renderer.setHtml`. Verified by direct navigation to `http://localhost:8099/src/#/reports`
returning all four links.

---

## 5. Progress Calendar

The special Phase 6 feature. A clean 7-day weekly timetable built from the real
schedule, following the supplied reference design.

### 5.1 Adherence to the reference

| Reference element | Implementation |
|---|---|
| Dark background | Existing `base.css` tokens (`--bg: #050507`, soft surfaces, purple accent) |
| 7 day columns | `grid-template-columns: 62px repeat(7, minmax(112px, 1fr))` |
| Day headers | Weekday short name + cycle day number |
| Left time axis | Hour ticks from the shared window |
| Horizontal grid | Hour gridlines, quiet (`rgba(255,255,255,.055)`) |
| Colored schedule blocks | Absolute positioning with deterministic token colours |
| Real start/end times | Every block shows its true `HH:MM – HH:MM` |
| Simple presentation | No badges, streaks, timers, scores, or decorative widgets |

### 5.2 Real schedule data only

Every block comes from a plan's own `schedule[]` array. No hardcoded timetable events, no
sample data, no invented schedules. In the browser the calendar renders **84 blocks**
(12 real blocks × 7 days) for week 1.

### 5.3 Time-based positioning

```
top    = (startMinutes - windowStart) / span × 100     (%)
height =  durationMinutes        / span × 100           (%)
```

Both are ratios of the same window, so proportional relationships hold *by construction*
rather than by tuning — a 120-minute block is exactly twice the height of a 60-minute one.
The row height is the day window in pixels (1px per minute), 720px for the real
11:00–23:00 day. Verified live: the first Mathematics block renders
`top:0%;height:16.666666666666664%`, exactly 120/720.

### 5.4 Progress integration

Block state is derived from the engine-built node for that block's tasks:

| State | Condition | Treatment |
|---|---|---|
| `none` | 0 completed | normal block |
| `partial` | 0 < completed < total | opacity .84 |
| `complete` | percent ≥ 100 | opacity .5 + struck-through title |

Non-academic blocks (break / free / fixed) carry no node and are always `none` — they are
displayed but never counted. The treatment is deliberately minimal: **no large completion
badges**.

### 5.5 Visual fixes made during validation

Three defects were caught by inspecting the rendered output and fixed:

1. **Duplicate heading** — the calendar title printed twice (shell `<h2>` plus the
   calendar's own header). Removed the redundant one.
2. **Text overflowing short blocks** — 15–45 minute blocks could not fit three caption
   lines, so text spilled past the rounded corners. Blocks under 45 minutes now drop the
   optional caption and keep only the title; blocks ≤ 25 minutes use tighter padding.
   Presentation only — each block still occupies exactly its real duration.
3. **Clipped axis labels** — the first and last hour labels were centred on their line and
   clipped by the container. They are now inset (`is-first` / `is-last`).---

## 6. Export Engine

`src/js/export-engine.js` — UMD module, `globalThis.StudyPlanner.ExportEngine`.

### 6.1 Consumes the model, never recalculates

The export engine receives a report-model object and renders it. It calls no progress
function, reads no storage, and touches no plan document. Exporting is a pure
serialisation of a value that was already computed by the report model.

### 6.2 Deterministic

The same model always produces byte-identical HTML. Enforced and tested:

- No `Date.now()`, `Math.random()`, or `new Date()` anywhere in the output.
- No generated timestamp — the footer carries a fixed generator string, not a clock read.
- No iteration-order dependence; collections are built in deterministic order.

Verified in the browser as well as in tests: two consecutive exports compared equal.

### 6.3 Standalone

The output embeds its own CSS and references nothing external. Tested against
`<script src>`, `<link rel=stylesheet>`, `localStorage`, and `fetch(` — none present.
It needs no server, no network, no backend, and no Study-Planner runtime.

Confirmed in the browser by loading the exported file directly from disk over a plain
static server; it rendered correctly with all assets inline.

### 6.4 Scopes and file names

Following `docs/export-system.md` §3:

| Export | File name |
|---|---|
| `exportDaily(model, date)` | `reports/daily/<YYYY-MM-DD>.html` |
| `exportWeek(model, weekNumber)` | `reports/weekly/Week-<n>.html` |
| `exportSubject(model, subjectId)` | `reports/subjects/<Subject>-Progress.html` |
| `exportOverall(model)` | `reports/overall/IITM-Overall-Progress.html` |
| `exportCalendar(model, weekNumber)` | `reports/weekly/Week-<n>-Timetable.html` |

Only HTML was added, as specified. No PDF/CSV/JSON export was implemented because the
repository had no established implementation for them. The report model stays
format-neutral so a future format can consume the same input.

### 6.5 Calendar export uses the same pipeline

The weekly calendar travels exactly the same path as every other report — no separate
calendar export system:

```
Daily Plans → Report Model → Calendar Report → Export Engine → Standalone HTML
```

`exportCalendar` is a thin call over `renderStandaloneHTML(model.buildCalendarReport(n))`,
the same generic renderer used by the other four scopes.

### 6.6 Read-only

Exporting cannot alter application progress: it only returns a string. Verified by
tests that assert the serialized source plans and the completion map are byte-identical
before and after exporting every scope. `export-controls.js` triggers the download with a
Blob plus object URL, leaving no temporary file on disk, and degrades safely (returns
`{ok: false, reason: 'environment'}`) where Blob is unavailable.

### 6.7 Issue found and fixed during validation

The standalone calendar initially rendered **two headings** — the document already
carries the title in `<title>` and `<h1>`, and each scope renderer added its own `<h1>`.
Removed the duplicates and added a test asserting every export contains exactly one
`<h1>`. The same pass fixed the export's short-block caption overflow, clipped bottom
axis label, and a day-number inconsistency (the export labelled columns by day-of-month
while the app used the cycle day number; both now use the cycle day number).

---

## 7. Data Flow

The implemented flow, unchanged from the specification:

```
Syllabus ──┐
           ├──► Planner ──► Daily Plans ──► Storage + Progress Engine
Progress ──┘                                              │
                                                          ▼
                                                   Report Model
                                                          │
                                   ┌──────────────────────┴───────────┐
                                   ▼                                  ▼
                            Report Viewer                     Progress Calendar
                                   └──────────────────────┬───────────┘
                                                          ▼
                                                   Export Engine
                                                          ▼
                                                    HTML Reports
```

Supporting paths:

- The **app** builds one model per visit from the same plans and completion map the
  Phase 5 dashboard uses, and hands it to the viewer.
- The **export handler** reuses that same already-rendered model, rather than rebuilding
  it — which is what prevents a second, divergent calculation.
- **Tests** consume the same engines the browser does; there is no mock progress path.

---

## 8. Files Created/Modified

### Created (7)

| File | Purpose |
|---|---|
| `src/js/report-model.js` | Report model: five scopes, time resolution, colour tokens |
| `src/js/export-engine.js` | Export engine: deterministic standalone HTML |
| `src/components/reports/report-viewer.js` | Report viewer renderers |
| `src/components/reports/progress-calendar.js` | Weekly progress calendar |
| `src/components/reports/report-tree.js` | Report hierarchy navigation |
| `src/components/reports/export-controls.js` | Export buttons + Blob download |
| `src/css/reports.css` | Report chrome, colour tokens, calendar grid |

*All seven were 0-byte placeholders before this phase.*

### Created — tests (1)

| File | Tests |
|---|---|
| `tests/renderer/reports.test.js` | 28 |

### Modified (5)

| File | Change |
|---|---|
| `src/js/router.js` | Added `parseReportsRoute` + 6 route builders + `REPORTS_HASH`; hooked into `parseRoute` **after** the Phase 4/5 routes |
| `src/js/app.js` | Added report route dispatch, the five scope renderers, report link/ shell helpers, and the export handler |
| `src/index.html` | Registered `reports.css` and the six Phase 6 scripts; added the `Reports` nav button |
| `docs/implementation-checklist.md` | Marked Phase 6 complete |
| `docs/agent-context.md` | Recorded Phase 6 architecture and boundaries |

### Tests filled in (2)

`tests/engine/report-model.test.js` (35 tests) and `tests/engine/export-engine.test.js`
(20 tests) — both were 0 bytes.

### Explicitly not modified

`data/syllabus/` (4), `data/schedule/daily/` (28), `data/progress/`, `planner-engine.js`,
`data-engine.js`, `storage.js`, `progress-engine.js`, `renderer.js`, `calendar.js`, and
all six Phase 5 progress components and their tests.

---

## 9. Tests

**Full suite: 274 passing, 0 failing** (193 pre-existing + 81 new).

| File | Tests | Status |
|---|---|---|
| `tests/data/progress-validation.test.js` | 4 | pass |
| `tests/data/schedule-validation.test.js` | 6 | pass |
| `tests/data/syllabus-validation.test.js` | 18 | pass |
| `tests/engine/data-engine.test.js` | 18 | pass |
| `tests/engine/export-engine.test.js` | 20 | **new** |
| `tests/engine/planner-engine.test.js` | 21 | pass |
| `tests/engine/progress-engine.test.js` | 15 | pass |
| `tests/engine/report-model.test.js` | 35 | **new** |
| `tests/engine/storage.test.js` | 14 | pass |
| `tests/renderer/app.test.js` | 15 | pass |
| `tests/renderer/calendar.test.js` | 21 | pass |
| `tests/renderer/progress.test.js` | 38 | pass |
| `tests/renderer/reports.test.js` | 28 | **new** |
| `tests/renderer/tracker.test.js` | 21 | pass |

Coverage matches the brief, using the **real** repository data rather than hand-built
fixtures, so the assertions describe the actual application:

- **Report model** — daily, weekly, subject, overall and calendar scopes; correct task
  totals and completion values; agreement with `progress-engine` across all four scopes;
  week = sum of days, subject = sum of weeks, overall = sum of both; canonical subject
  order preserved; a missing day reported honestly; no mutation of plans or completions.
- **Export engine** — byte-identical output across repeated exports and across two
  independently built models; no timestamps or randomness; standalone (no external refs);
  correct report data in every scope; exactly one heading; source-data immutability;
  suggested file names matching the documented layout.
- **Progress calendar** — 7 days; correct dates; correct blocks; exact start/end times;
  correct durations; positioning arithmetic (120 min = 2 × 60 min; half-hour times
  positioned exactly); deterministic colour tokens; task vs non-task distinction; no
  badges/streaks/timers.
- **Viewer and routing** — each scope renders; escaping of data-derived text; accessible
  progress bars; the report hierarchy; report routes parse with their parameters;
  builder/parser round-trip; **all Phase 4 and Phase 5 routes still work**; unknown hashes
  still fall back to the calendar.

No tests were written for any explicitly forbidden feature (streaks, badges, timers,
productivity scores, fake analytics), by design.

---

## 10. Browser Validation

Validated live in Chrome against a static server (`python -m http.server 8099`).

### Reports and calendar

| Route | Result |
|---|---|
| `#/reports` | 4 index links render (after the fix in §4.3) |
| `#/reports/overall` | 2 tables, 8 rows (4 subjects + 4 weeks), export button `IITM-Overall-Progress.html` |
| `#/reports/subject/mathematics-i` | subject report renders |
| `#/reports/week/2` | weekly report renders |
| `#/reports/day/2026-10-05` | daily report renders (2 tables) |
| `#/reports/calendar/week/1` | 7 columns, 84 blocks, 13 hour ticks, 720px window |
| `#/reports/calendar/week/3` | renders with week 3 dates |
| `#/reports/calendar/subject/english-i` | renders scoped to that subject (7 blocks) |

### Time positioning (live)

First Mathematics block rendered `top:0%;height:16.666666666666664%` — exactly 120/720 of
the real 11:00–23:00 window.

### Progress integration (end-to-end)

Ticked 8 tasks in the tracker at `#/day/2026-10-02`, then opened the calendar:

- Week summary became **8/87 tasks, 9%**.
- The Mathematics block reported `complete`, "8 tasks · 100%".
- Ticking 3 more (Statistics) produced a `partial` block at **60%**, computed opacity
  **0.84**; final states were `{complete: 1, partial: 1, none: 82}`.

All values originate from `progress-engine.js` via the report model — the DOM was not
trusted; the persisted completion map was independently verified at 8 entries.

### Export (live)

Exercised the real in-browser path: 30,487 bytes, deterministic across two calls,
standalone (no external refs), 7 columns, Blob object URL created successfully.
Opening the exported file directly rendered the full timetable.

### Responsive validation

| Width | Page overflow | Calendar | Columns | Blocks |
|---|---|---|---|---|
| 1440 px | none (1425 ≤ 1440) | no scroll | 7 | 84 |
| 1024 px | none (1009 ≤ 1024) | no scroll | 7 | 84 |
| 768 px | none (753 ≤ 768) | contained scroll | 7 | 84 |
| 390 px | none (375 ≤ 390) | contained scroll | 7 | 84 |

Desktop is the primary target; the weekly calendar uses an intentional contained
horizontal scroll on narrow screens. **No accidental page-level overflow at any width.**

### Console

No Phase 6 errors. Four pre-existing, unrelated 404s remain: `favicon.ico`, and
`2026-10-01` / `2026-10-30` / `2026-10-31.json`, which fall outside the 28-day cycle and
are treated by the existing plan store as a stable "no plan for this date" state.

### Phase 1–5 regression

Every existing route re-checked in the browser and rendering correctly: `#/calendar`,
`#/day/2026-10-02` (tracker with 19 task checkboxes), `#/progress` (dashboard with
Overall progress / Subjects / Weeks), `#/progress/subject/statistics-i`,
`#/progress/week/1`, `#/progress/day/2026-10-02`,
`#/progress/subject/statistics-i/week/1`.---

## 11. Screenshots

| File | Shows |
|---|---|
| `reports/phase6-progress-calendar.png` | Weekly Progress Calendar at 1440 px — 7 day columns, time axis, hour grid, coloured blocks positioned by real time, export button |
| `reports/phase6-calendar-mobile.png` | Same calendar at 390 px — no page overflow, contained horizontal scroll |
| `reports/phase6-export-calendar.png` | The standalone exported HTML rendered on its own — proving it works without the application |
| `reports/phase6-report-overall.png` | The overall report scope (subjects and weeks tables) |

The calendar was built to the supplied reference: dark background, seven day columns with
weekday + day headers, a left-hand time axis, a horizontal hour grid, coloured schedule
blocks at their true times, and no unrelated productivity-app furniture.

---

## 12. Limitations / Remaining Issues

Stated plainly, including the items that were fixed during validation.

1. **Category-level reporting remains unsupported.** `progress.json` carries no category
   dimension, so no report can invent one. This is unchanged from Phase 5 and remains a
   deliberate exclusion rather than a defect.
2. **The calendar's day starts at 11:00 and ends at 23:00**, because that is what the real
   materialized schedule contains. The axis reflects the data; it was not forced into a
   conventional 08:00–18:00 shape.
3. **The week grid shows the cycle's 7 dates, not a Monday–Sunday week.** Week 1 is
   2026-10-02 (Friday) → 2026-10-08, matching the planner's 7-day cycle. Column order
   therefore starts on Friday. Aligning columns to calendar weeks would require
   re-deriving the plan's week boundary, which would contradict the authoritative data.
4. **Long block labels are ellipsised** (e.g. "Computational Thi…", "Math + Statistics R…")
   at narrow column widths. The full text is always present in the `title` attribute and
   in the export.
5. **Blocks shorter than 45 minutes hide their time caption** to avoid text spilling
   outside the block. Their real start and end remain available via `title`, the day
   report, and the export.
6. **No PDF, CSV or JSON export.** HTML only, as specified. The report model is
   format-neutral so another format can be added without changing it.
7. **Exports are not written to `reports/` automatically.** The export offers a browser
   download; the suggested file names follow `docs/export-system.md` §3, and writing into
   the repository is left to the user.
8. **The header now shows two buttons** (Progress, Reports). Phase 4/5 layout otherwise
   unchanged.
9. **Two pre-existing issues were found and fixed during this phase**, both in code this
   phase added: the empty report index on direct visit (§4.3) and the duplicate heading in
   the exported calendar (§6.7).
10. **One environment caveat:** browsers cache `reports.css` aggressively. After editing
    the stylesheet, verify with a hard reload — otherwise the old `min-width: 660px` rule
    will still be computed and 390 px appears to overflow.

### Explicitly out of scope, per the brief

Not implemented and not tested, by design: streak badges, focus timers, Pomodoro,
productivity scores, "X hours this week", motivational cards, achievement badges, AI
insights, fake statistics, floating notifications, decorative widgets.

---

## Phase 6 Checklist

- [x] Report Model implemented
- [x] Daily report works
- [x] Weekly report works
- [x] Subject report works
- [x] Overall report works
- [x] Report Viewer works
- [x] Progress Calendar works
- [x] 7-day timetable works
- [x] Real schedule data used
- [x] Accurate time positioning
- [x] Progress uses `progress-engine.js`
- [x] Export Engine works
- [x] Standalone HTML export works
- [x] Calendar can be exported
- [x] Existing Phase 1–5 functionality preserved
- [x] Existing tests pass (193)
- [x] New tests pass (81)
- [x] No console errors (Phase 6)
- [x] Responsive validation passes (1440 / 1024 / 768 / 390)
- [x] No badges
- [x] No streaks
- [x] No focus timer
- [x] No fake analytics
- [x] No unnecessary UI

**Final: 274/274 tests passing.**