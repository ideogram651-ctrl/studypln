# U0 — Architecture Audit

**Project:** Study-Planner — IIT Madras BS Data Science Study Planner
**Repository:** `E:\Study-Planner\`
**Phase:** U0 — Architecture Audit (read-only)
**Status:** Complete
**Date:** 2026-10-05

> **Scope statement.** U0 performed no product changes. No application file, no data file,
> no test, and no configuration was modified. The only file created is this report. The
> Update Track (U1–U6) was **not** started.
---

## 1. Audit Summary

Study-Planner is a **no-build, no-framework, plain-ES5 static web application**. It runs
from `src/index.html` over plain `<script>` tags (no bundler, no `package.json`, no
`node_modules`). Every module is a UMD-style IIFE that attaches to
`globalThis.StudyPlanner.<Name>` and also supports `module.exports`, which is why the same
file is testable under `node --test` without a browser.

The architecture is a **strictly layered pipeline** with one rule enforced throughout:
**engines calculate, components render, only storage writes.**

```text
data/syllabus/*.json          (canonical content, 4 courses + template)
        │  data-engine.js     validate/normalize → canonical courses + tasks
        ▼
planner-engine.js              syllabus × config → 28 daily plans
        │
        ▼
data/schedule/daily/*.json     (materialised, 2026-10-02 … 2026-10-29, never written at runtime)
        │
        ├──────────────► calendar.js  (pure date/grid helpers, DOM-free)
        │                     ▼
        │              month-view / week-view / calendar-view
        │
        ▼
storage.js  ◄── completion writes (tracker only)
        │
        ▼
progress-engine.js             the ONLY progress calculator
        │
        ├──► Progress UI      (progress/*, read-only)
        ├──► report-model.js  ──► report-viewer.js
        │                          └──► export-engine.js  (standalone HTML)
        └──► Progress Calendar (reports/progress-calendar.js)
```

**Five headline findings** (details in §13):

1. **No canonical calendar JSON exists.** U1 must create it. Study-week metadata currently
   lives only inside the 28 generated plan documents.
2. **The weekly calendar uses Sun→Sat, but the study cycle is Fri→Thu.** Live-verified:
   the Weekly view of 2026-10-02 renders `27 Sep – 3 Oct`, not `2 Oct – 8 Oct`. This is the
   single most consequential mismatch for U1/U2.
3. **`formatClock` is duplicated** in `progress-calendar.js` and `export-engine.js`. The
   24-hour axis that CHANGE-003 targets must be fixed in **both** files or app and export
   will disagree.
4. **U5 is blocked on data, not UI.** `revision` and `review` blocks have **no `taskIds`**
   (28 each), and `storage.js` rejects any task ID that fails `/^[^:]+:\d+:[^:]+$/`. New
   IDs must be minted deliberately.
5. **Three orphaned 0-byte files** (`src/components/tasks/*.js`) are dead weight — an
   attractive false starting point for a future phase. They must not be filled in.

**Verified clean:** storage authority (no raw `localStorage` outside `storage.js`),
progress authority (every `percent` traces to `progress-engine`), planner exclusivity,
route registration order, and CSS layering.---

## 2. Repository State

### 2.1 Source files (`src/`) — 36 files

Every file below was checked for (a) size, (b) whether it is referenced by
`index.html` or `require()`d by another file, and (c) live browser behaviour.

| File | Bytes | Loaded in `index.html` | Reachable at runtime | Status |
|---|---|---|---|---|
| `index.html` | 4183 | — | yes | **active** — sole entry point |
| `manifest.json` | **0** | no | no | **stub (orphan)** |
| `service-worker.js` | **0** | no | no | **stub (orphan)** |
| `js/app.js` | 43553 | yes | yes | **active** — orchestration hub |
| `js/data-engine.js` | 35000 | yes | yes | **active** — validation + task model |
| `js/planner-engine.js` | 28377 | yes | yes | **active** — syllabus → plans |
| `js/export-engine.js` | 23324 | yes | yes | **active** — standalone HTML |
| `js/report-model.js` | 19897 | yes | yes | **active** — read-only report model |
| `js/progress-engine.js` | 14252 | yes | yes | **active** — sole progress authority |
| `js/storage.js` | 12971 | yes | yes | **active** — sole completion authority |
| `js/router.js` | 12765 | yes | yes | **active** — hash router |
| `js/calendar.js` | 5700 | yes | yes | **active** — pure date helpers |
| `js/renderer.js` | 2364 | yes | yes | **active** — DOM/escaping helpers |
| `components/reports/report-viewer.js` | 10863 | yes | yes | **active** |
| `components/reports/progress-calendar.js` | 9745 | yes | yes | **active** |
| `components/tracker/daily-tracker.js` | 7052 | yes | yes | **active** |
| `components/reports/export-controls.js` | 3169 | yes | yes | **active** |
| `components/reports/report-tree.js` | 3264 | yes | yes | **active** |
| `components/progress/week-progress.js` | 8528 | yes | yes | **active** |
| `components/progress/day-progress.js` | 6858 | yes | yes | **active** |
| `components/progress/subject-progress.js` | 6523 | yes | yes | **active** |
| `components/progress/progress-drilldown.js` | 4666 | yes | yes | **active** — breadcrumb builder |
| `components/calendar/month-view.js` | 4635 | yes | yes | **active** |
| `components/tracker/task-card.js` | 4546 | yes | yes | **active** — checkbox control |
| `components/tracker/task-group.js` | 4340 | yes | yes | **active** — block renderer |
| `components/progress/progress-dashboard.js` | 3836 | yes | yes | **active** |
| `components/calendar/calendar-view.js` | 3148 | yes | yes | **active** |
| `components/progress/overall-progress.js` | 3151 | yes | yes | **active** |
| `components/calendar/week-view.js` | 2652 | yes | yes | **active** |
| `css/reports.css` | 9901 | yes | yes | **active** |
| `css/progress.css` | 5342 | yes | yes | **active** — breadcrumb styles |
| `css/base.css` | 4162 | yes | yes | **active** — tokens + header |
| `css/calendar.css` | 4021 | yes | yes | **active** |
| `css/components.css` | 3063 | yes | yes | **active** |
| `css/tracker.css` | 2795 | yes | yes | **active** |
| `components/tasks/task-card.js` | **0** | **no** | no | **stub (orphan)** |
| `components/tasks/task-status.js` | **0** | **no** | no | **stub (orphan)** |
| `components/tasks/task-types.js` | **0** | **no** | no | **stub (orphan)** |

**The five 0-byte files are the only stubs.** The runtime namespace was enumerated in the
browser and contains **26** members (`App, Calendar, CalendarView, DailyTracker,
DataEngine, DayProgress, ExportControls, ExportEngine, MonthView, OverallProgress,
PlannerEngine, ProgressCalendar, ProgressDashboard, ProgressDrilldown, ProgressEngine,
Renderer, ReportModel, ReportTree, ReportViewer, Router, Storage, SubjectProgress,
TaskCard, TaskGroup, WeekProgress, WeekView`). Nothing from `components/tasks/` or
`service-worker.js` appears — they are genuinely dead, not merely unused-but-loaded.

> **Trap warning.** `src/components/tasks/task-card.js` and
> `src/components/tracker/task-card.js` share a filename. A naive "is `task-card.js`
> referenced?" check returns a false positive. The `components/tasks/` copy is the stub.

### 2.2 Data (`data/`) — 36 files, all read-only, all untouched by U0

| Path | Count | Notes |
|---|---|---|
| `data/syllabus/*.json` | 4 + template | canonical content; `mathematics-i` 225 KB is the largest |
| `data/schedule/daily/*.json` | 28 | one per cycle date, 6 KB–21 KB |
| `data/progress/progress.json` | 1 | derived cache, never written at runtime |
| `data/progress/README.md`, `data/syllabus/README.md` | 2 | documentation |

**No canonical calendar JSON exists anywhere in the repository.** A recursive filename
search for `*calendar*` returns only source files and screenshots. This confirms U1's
premise: the calendar currently derives all date structure from generic arithmetic.### 2.3 Tests — 14 files, 274 cases

| Suite | File | Covers |
|---|---|---|
| data | `syllabus-validation.test.js` | syllabus schema |
| data | `schedule-validation.test.js` | daily-plan schema |
| data | `progress-validation.test.js` | progress cache schema |
| engine | `data-engine.test.js` | validation + task model |
| engine | `planner-engine.test.js` | materialisation |
| engine | `progress-engine.test.js` | progress nodes |
| engine | `storage.test.js` | completion persistence |
| engine | `report-model.test.js` | 4 scopes + calendar |
| engine | `export-engine.test.js` | standalone/deterministic HTML |
| renderer | `app.test.js` | app shell/routes |
| renderer | `calendar.test.js` | month + week views |
| renderer | `tracker.test.js` | tracker + completion flow |
| renderer | `progress.test.js` | dashboard + drill-down |
| renderer | `reports.test.js` | report viewer + timetable |

No `package.json`; the suite is run with plain `node --test`.

### 2.4 Other

- `docs/` — 10 files (architecture, schemas, planning/progress/export rules, checklists).
- `reports/` — 6 phase screenshots + 3 phase markdown reports.
- `reference/` — `calendar/`, `daily-tracker/`, `syllabus/`, `progress/`,
  `academic-schedule/`, `change-specification/v5/`.
- `tools/` — `extract-syllabus.js`, `generate-plans.js` (offline generators).
- `generated/` — contains **only** `.gitkeep`. The planner writes nothing here; plans
  land in `data/schedule/daily/`.
- `TRACKING_STORAGE_MANIFEST.json` — declares source-of-truth and explicit `doNotDo`
  constraints. Treat as a contract, not documentation.
- **No git metadata.** Integrity was verified by modification timestamps instead:
  **no file under `data/` has today's date.**

---

## 3. Current Data Flow

The conceptual flow in the project brief is accurate. One clarification: the Progress
Calendar sits *beside* the main calendar rather than downstream of the Daily Tracker —
both read the same plan documents.

```text
Syllabus JSON
   │ data-engine.js  validate + normalize
   ▼
Canonical courses  ──► progress-engine.js ◄── storage.js (completions)
   │ planner-engine.js                    │
   ▼                                      ▼
28 daily plan JSON                 Progress nodes {total, completed, remaining, percent}
   │                                      │
   ├──► calendar.js ──► month/week views  ├──► progress/*        (read-only UI)
   │                     (planStatus map)  ├──► report-model.js ──► report-viewer.js
   │                                      │                        └──► export-engine.js
   └──► tracker (plan + completions) ──────┘
```

**Verified real couplings:**

- The calendar never fetches progress. `app.js:286` builds a `planStatus` map by calling
  `ProgressEngine.dayProgress(plan, completions).percent`, then passes plain numbers to
  `MonthView`. `month-view.js:32` only clamps/rounds an already-computed value.
- The report model receives completions read-only. `report-model.js` header states it
  has "no storage access: the app passes the completion map in".
- `createReportModel(context)` binds courses/completions/plans **once**; the viewer and
  the exporter consume that same instance. This is what prevents a second, divergent
  calculation path.
- Every report scope is assembled from three shared primitives — `scopeTasks`,
  `scopeNode`, `scopeTitle` — precisely so daily/weekly/subject/overall do not duplicate
  business logic.---

## 4. Calendar Architecture

### 4.1 Where calendar dates currently come from

**From generic date arithmetic — not from any Study-Planner-specific calendar data.**

`src/js/calendar.js` is a pure, DOM-free helper module (UTC-only, fully deterministic).
It knows about months, weekdays and grids. It has **no knowledge of study weeks, study
days, graded days, or the 28-day cycle.** It exposes `isValidIsoDate`, `parseIso`,
`isoDate`, `daysInMonth`, `addDays`, `addWeeks`, `weekdayIndex`, `monthName`,
`monthTitle`, `buildMonthGrid`, `addMonths`, `buildWeekDates`, `formatDateParts`,
`formatLongDate`, `formatWeekRangeLabel`.

Date identity is a single ISO string `"YYYY-MM-DD"`. Month View and Week View both
resolve to it, so the two views cannot drift in *identity* — but see §4.6 for why they
do drift in *meaning*.

### 4.2 Month view

`buildMonthGrid(year, month)` produces leading `null` cells up to the first weekday, then
one cell per day, padded to whole 7-cell rows. Weeks run **Sun→Sat**, matching the header
row (`WEEKDAY_SHORT` starts at `Sun`). `month-view.js` maps those cells through
`buildDayCell`, which adds `hasPlan`, `percent`, `progressState`
(`complete`/`partial`/`none`/`absent`) and an `ariaLabel`.

Progress is **injected, never computed** — the docblock states values "arrive
pre-computed (progress engine) through the planStatus map provided by the app".

### 4.3 Weekly view

`week-view.js` builds a 7-day strip by delegating to `Calendar.buildWeekDates(anchorDate)`.
Its own docblock is explicit: *"Sunday->Saturday week strip sharing the exact same date
identity, selection state and plan status as Month View (day cells come from MonthView so
the semantics cannot drift)."* Reusing `MonthView.buildDayCell` is good practice and should
be preserved.

### 4.4 Date identity and selection

- Identity: ISO string only.
- Selection: `state.selectedDate` in `app.js` — application state, deliberately **not** a
  route. `setSelectedDate` triggers `applySelectionInDom`, a targeted class/attribute
  toggle with no re-render and no refetch.
- Selection is also reflected into the URL for the tracker (`#/day/<date>`) but not for
  the calendar itself.

### 4.5 Study weeks and study days — where they actually live

**Two different "week" concepts exist, and they are not the same thing.**

**Concept A — syllabus weeks (`progress-engine`).** Each course JSON has
`weeks[].weekNumber` (1–4). `progress-engine.js:104` builds `weeks['week-' + n]` nodes.
These are *content* buckets used for progress rollups.

**Concept B — study weeks (`report-model`).** `report-model.js:290` filters plans by
`plan.weekNumber`:
```js
var weekPlans = planList.filter(function (plan) { return plan.weekNumber === weekNumber; });
```
So the **study-week boundary is already canonically encoded in the generated plan
documents.** Verified across all 28 files:

| Week | Dates | dayNumber | Length |
|---|---|---|---|
| 1 | 2026-10-02 → 2026-10-08 | 1–7 | 7 |
| 2 | 2026-10-09 → 2026-10-15 | 8–14 | 7 |
| 3 | 2026-10-16 → 2026-10-22 | 15–21 | 7 |
| 4 | 2026-10-23 → 2026-10-29 | 22–28 | 7 |

Each plan's top-level keys are:
`schemaVersion, planType, date, dayNumber, weekNumber, status, schedule, tasks, completion, meta`.

This exactly matches the CHANGE-001 requirement (W1 = 2026-10-02 → 2026-10-08).
**U1 must not invent this mapping — it already exists in data.** The gap is that
`calendar.js` and the app's Weekly view do not read it.

**Graded days.** There is **no date-level graded flag** anywhere. Graded-ness is
per-task (`task.type === 'graded'`), present on exactly 4 dates: 2026-10-08, 10-15,
10-22, 10-29 (4 graded tasks each = 16 total). Verified rule across all 28 plans:

> **graded-day ⇔ `dayNumber % 7 === 0`**

The rule holds universally with zero exceptions. So a canonical calendar JSON *can*
derive graded-ness, but doing so silently re-implements an inference the data does not
state. See risk R-07.

### 4.6 The week-boundary mismatch (most important calendar finding)

The study cycle runs **Fri→Thu**. `calendar.js:121` builds **Sun→Sat**.

**Live-verified in the browser.** Selecting 2026-10-02 and switching the main calendar
to Weekly yields:

```text
title: "27 September – 3 October 2026"
days:  2026-09-27 Sun, 09-28 Mon, 09-29 Tue, 09-30 Wed,
       10-01 Thu, 10-02 Fri, 10-03 Sat
```

So of the 7 cells shown, **only one (10-02) has a study plan**; the other six are empty
or out-of-cycle. The user cannot see the study week they are actually in.

`tests/renderer/calendar.test.js:83` **actively locks in** this Sun→Sat behaviour
(`assert.equal(dates[0], '2026-09-27'); // Sunday`), and line 93 asserts the label
`'27 September – 3 October 2026'`. **U1/U2 must update these tests deliberately** — they
are specification-encoding tests, not incidental assertions.

Month mode is unaffected (a real calendar month is the correct unit there), but
`app.js:182` calls `buildWeekDates` for the weekly strip while month mode uses
`buildMonthGrid`, so month/week currently use **different date logic**.

### 4.7 Navigation

`shiftPeriod(delta)` at `app.js:216` is mode-dependent:
- week → `Calendar.addDays(selectedDate, delta * 7)` (rolling 7-day jump)
- month → `Calendar.addMonths(...)`

CHANGE-001 requires week navigation to move between **study weeks** and month navigation
between **calendar months**. The month half is already correct; the week half must become
study-week-aware. There is currently **no concept of "navigate to week N"**.

### 4.8 Hardcoded calendar information

| Location | Value | Assessment |
|---|---|---|
| `index.html` `initialDate` | `2026-10-02` | config, fine |
| `index.html` `cycleStart` | `2026-10-02` | config, fine |
| `index.html` `calendarView` | `month` | config, fine |
| `app.js` initial state | derived from `cycleStart` | config-driven |
| `reports.css:252` | `height` set inline, 1px/minute | presentation, fine |
| `progress-calendar.js:45` | `formatClock` → 24-hour | **the CHANGE-003 defect** |

There is **no hardcoded study-week table** anywhere. Good.

### 4.9 What U1 must decide

U1's canonical calendar JSON should carry, per date: `date`, `dayOfWeek`, `dayNumber`,
`weekNumber`, `isStudyDay`, `isGradedDay`, and `inCycle`. It should be **generated** from
the verified plan metadata (or from an explicit generator in `tools/`), never hand-typed
for 365 days, and it must be validated by a test that cross-checks it against the 28
existing plans. Hardcoding the four week boundaries in JS would create the second source
of truth that CHANGE-003 explicitly forbids.---

## 5. Progress Architecture

### 5.1 The authority chain is intact — verified

```text
storage.js  ──(completions map, read-only)──►  progress-engine.js  ──►  all UI
     ▲
     │
tracker (only writer)
```

**Verification 1 — storage is the only completion authority.** A repository-wide search for
`localStorage` / `sessionStorage` returns hits in **only two** files: `storage.js` itself
(helpers, probe, comments) and prose comments in `app.js` / `export-engine.js` /
`daily-tracker.js`. **No component reads or writes raw storage.**

**Verification 2 — progress-engine is the only progress authority.** Every `percent` and
`completed` assignment outside `progress-engine.js` was enumerated. All are either
(a) pass-through reads of an engine node, (b) clamping an injected value
(`month-view.js:32` normalises 0–100), or (c) validation logic that checks the shape of
the derived cache (`data-engine.js:344`, comparing `progress.json` against a recomputation).

No component computes a percentage from a ratio. `progress-engine.js` contains the single
`percentFor()` implementation.

### 5.2 The single calculation primitive

`progressForTasks(tasks, completions)` counts tasks whose `type` is eligible and are
present-and-completed in the completions map:
```js
function isEligibleForProgress(type) { return NON_ACADEMIC_TYPES.indexOf(type) === -1; }
var NON_ACADEMIC_TYPES = ['break', 'free', 'fixed'];
```
Every scope (task/day/week/subject/course/all) funnels through it. Empty scope → `0`,
never `NaN`/`Infinity`.

### 5.3 Reports and calendar do **not** calculate independently

- `report-model.js` delegates every node to `ProgressEngine.progressForTasks` via one
  helper, `scopeNode`. Its own docblock states it "never counts, rounds or re-derives progress".
- The Progress Calendar derives block state (`complete`/`partial`/`none`) from
  `block.node.percent` — a pre-computed node — not from a local tally.
- Calendar (month/week) receives percentages from `app.js` via the `planStatus` map.

### 5.4 Completion flow (tracker only)

`onTaskToggle(taskId, completed)` → `storage.setCompletion(taskId, completed)` →
re-render → `updateTrackerUI()` reads `ProgressEngine.dayProgress`. Tests assert the full
round trip including uncheck, sibling isolation, and survival across a fresh `storage`
instance on the same backend.

### 5.5 Implications for U5

Adding checkboxes to `revision`/`review` blocks **must** route through `storage.setCompletion`.
The danger is a "visual toggle that doesn't persist" — explicitly forbidden by CHANGE-004
("Do not create a separate temporary UI-only checkbox system"). Any U5 implementation must
keep the invariant: `storage.js` writes, `progress-engine.js` calculates.

⚠️ **Because these new checkboxes would be real tasks, they change progress denominators.**
Adding 2 tasks × 28 days = 56 new tasks would move overall totals (currently 413) unless
they are typed as `break`/`free`/`fixed` (excluded) or the policy is consciously chosen.
This is a **specification decision, not an implementation detail** — see §17.

---

## 6. Reports Architecture

### 6.1 Structure

| Layer | File | Responsibility |
|---|---|---|
| Model | `report-model.js` | read-only scopes: overall, subject, week, day, calendar |
| Viewer | `reports/report-viewer.js` | scope → HTML (overall/subject/day + index) |
| Timetable | `reports/progress-calendar.js` | positioned 7-day block chart |
| Index | `reports/report-tree.js` | report landing links |
| Controls | `reports/export-controls.js` | export button |
| Export | `export-engine.js` | model → standalone HTML |
| Shell | `app.js:744` `reportShell()` | nav + title + body wrapper |

### 6.2 Routes (all live-verified rendering)

```text
#/reports                                  index
#/reports/overall                          overall
#/reports/subject/:subjectId               subject
#/reports/week/:weekNumber                 weekly
#/reports/day/:date                        daily
#/reports/calendar                         → redirects to calendar/week/1
#/reports/calendar/week/:weekNumber        weekly timetable
#/reports/calendar/subject/:subjectId      timetable scoped to a subject
```

Parsed by `parseReportsRoute` in `router.js`, which runs **after** the Phase 4/5 parsers
so existing routes keep exact precedence. Note `#/reports/calendar` defaults to
`weekNumber: 1` — this is the CHANGE-003 §3.2 discovery problem in code form.

### 6.3 Progress numbers — all from the engine

Confirmed in §5.3. `report-model.js` has no arithmetic on completion.

### 6.4 Timetable generation

`buildCalendarReport(weekNumber, options)` = `buildWeekReport(...)` + positioned blocks.
Times come from `resolveSchedule()`, which solves the 12-hour-without-meridiem problem:
plan times are `"11:00"`, `"1:00"`, `"10:30"` with **no AM/PM**, and the day runs
11:00→23:00, so raw values *decrease* (660 → 60). The meridiem is recovered from the
day's own ordering — when a clock value moves backwards, one 720-minute cycle is added.
`resolveWindow()` then gives all seven columns one shared window, so block geometry is a
ratio of a single span (a 120-min block is exactly twice a 60-min block, by construction).

### 6.5 Export — treated as working, per instruction

Verified characteristics: deterministic (fixed export stamp, deliberately not a clock
read), standalone (embedded CSS, no external refs), single `<h1>`. Five entry points:
`exportOverall`, `exportSubject`, `exportWeek`, `exportDaily`, `exportCalendar`.

⚠️ **Export duplicates viewer logic by necessity.** `export-engine.js` has its own
`formatClock` (line 171), `axisTicks` (179), `renderAxisHTML` (202), and a full embedded
stylesheet. This is intentional — the export must not depend on the app runtime — but it
means **any presentation change must be applied in both places.** See risk R-02.

### 6.6 Reusable report components

`ReportViewer.renderReportHTML(kind, report, {links})` is already parameterized by kind
and takes a `links` factory (`reportLinkFor()`), so subject/week/day/overall all share one
entry point. `reportShell()` centralises nav. `ExportControls` is scope-agnostic.
`progress-calendar.js` exports `formatClock`, `axisTicks`, `blockState` for testing.

---

## 7. Daily Tracker Architecture

### 7.1 Rendering path

```text
renderTracker(date, dateValid)
  └─ DailyTracker.buildTrackerViewModel(plan, completions, {context})
       ├─ ProgressEngine.dayProgress(plan, completions)   ← the only progress source
       └─ plan.schedule.map(block → TaskGroup.buildBlockViewModel(block, tasksById, completions))
            └─ isAcademic = (block.category === 'study')
                 ├─ yes → taskIds.map(→ TaskCard.buildTaskCardViewModel)   ← checkboxes
                 └─ no  → CATEGORY_NOTES[category]                          ← prose note only
  └─ DailyTracker.renderTrackerHTML(viewModel) → TaskGroup.renderBlockHTML → TaskCard.renderTaskCardHTML
```

**This is the single decision point for CHANGE-004: `task-group.js:40`.**

### 7.2 Live-verified block inventory (2026-10-02)

| Category | Label | Checkboxes |
|---|---|---|
| study | Mathematics | 8 |
| break | Lunch / Rest | 0 |
| study | Statistics | 5 |
| break | Walk / Refresh | 0 |
| study | Computational Thinking | 4 |
| free | Free / Refresh | 0 |
| fixed | FIXED TIME | 0 |
| break | Relax | 0 |
| study | English | 2 |
| break | Refresh | 0 |
| **revision** | **Math + Statistics Revision** | **0 ← target** |
| **review** | **Daily Review** | **0 ← target** |

Exactly matches the specification: only the two named blocks lack checkboxes, and the
break/free/fixed blocks must stay non-actionable.

Across all 28 plans: `study` 112 blocks (all with task IDs), `break` 112, `free` 28,
`fixed` 28, `revision` 28, `review` 28 — **all with zero task IDs.**

### 7.3 Why U5 is not a pure UI change

`revision` and `review` blocks carry **no `taskIds`**. To make them completable through
the existing mechanism they need real task IDs, and:

```js
// storage.js:45
var TASK_ID_PATTERN = /^[^:]+:\d+:[^:]+$/;
```

Every ID must match `something:numeric:something` with exactly two colons and no
additional colons. Existing IDs look like `mathematics-i:1:L1.1` — the middle segment is
the **week number**. So a valid revision ID would be e.g. `mathematics-i:1:revision-day1`,
but the scheme has no existing precedent for a non-subject activity, and the three
segments are semantically `subjectId:weekNumber:sourceId`.

**U5 therefore has three legitimate options** (see §13 R-08) and needs a decision before
implementation. This is the single most likely cause of U5 scope creep.

### 7.4 Existing protective mechanism

`task-group.js:8-10` documents that non-academic blocks "keep zero tasks and never
receives generated placeholder tasks (specification section 21)". A placeholder-task
auto-generator would violate an explicit existing specification clause.

### 7.5 Routes

`#/day/<date>`. `openTracker(date)` navigates via `RouterModule.routeForDay(date)`;
`backToCalendar()` returns to `#/calendar`. Invalid dates render an explicit recoverable
empty state (`renderInvalidDateHTML`) — no crash, no blank screen.---

## 8. Shared UI Architecture

### 8.1 Header (`index.html:46-58` + `base.css`)

```html
<header class="app-header" id="app-header">
  <div class="app-brand">
    <span class="app-logo" aria-hidden="true">SP</span>
    <div class="app-brand-text">
      <h1 class="app-title">Study-Planner</h1>
      <p class="app-tagline">IIT Madras BS — 28-day cycle</p>
    </div>
  </div>
  <nav class="app-nav" aria-label="Primary">
    <button data-action="open-progress">Progress</button>
    <button data-action="open-reports">Reports</button>
  </nav>
</header>
```

Static markup in `index.html` — **not** rendered by a JS component. There is no
"shared layout component"; the header *is* the markup.

**CHANGE-005 touchpoint (fully localised):** `index.html:48` is the only place the SP
monogram exists. `.app-logo` has exactly one CSS rule (`base.css:91`: 44×44, radius 14px,
grid-centred). Replacing the span's contents with an inline SVG and setting white stroke is
a ~2-line change confined to those two files. No JS reads `.app-logo`. ✅ Low risk.

Note: the spec calls the asset `task-square-svgrepo-com.svg`. **That asset is not present
in the repository** (see §13 R-11).

### 8.2 Breadcrumbs — the CHANGE-002 root cause

Breadcrumbs exist **only for Progress**. Repository-wide, the string `breadcrumb`/`crumb`
appears in exactly two places: `progress.css` (styles) and `app.js:237` (a comment).

**Progress — working, reusable pattern.** `progress-drilldown.js:30` exposes
`buildNavViewModel(level, context)` → `renderNavHTML()`. It builds an ordered crumb list
(`{label, hash, current}`) and emits `<button data-action="navigate" data-hash="...">`.
Levels: overall → subject → subject-week → week → day. Styles: `.progress-crumbs`,
`.progress-crumb-link`, `.progress-crumb.is-current`, `.progress-crumb-sep` (`›`).

**Reports — a flat link row.** `app.js:744` `reportShell()` renders:
```html
<div class="rp-page-nav">
  <a data-action="navigate" data-hash="#/reports">← Reports</a>
  [<a>Timetable</a>]  [<a>Progress</a>]
</div>
```

**Live-verified difference (the exact defect in CHANGE-002):**

| Route | Nav text | Calendar crumb? |
|---|---|---|
| `#/progress/subject/mathematics-i` | `Calendar › Progress › Mathematics I` | ✅ yes |
| `#/reports/overall` | `← Reports … Progress` | ❌ **no** |

The fix is therefore small and well-scoped: reuse `buildNavViewModel` (or mirror its
shape) for Reports, adding a Calendar crumb that points at `routeForCalendar()`. The
specification explicitly forbids disturbing Progress — so Progress's builder must remain
the source of the *visual language* while Reports gets its own instance. **Do not
refactor `progress-drilldown.js` into a shared module during U0/U2**; duplication of ~30
lines is cheaper than regression risk in working navigation.

### 8.3 Routing

`router.js` parses in strict order: progress routes → reports routes → `#/day/<date>` →
`#/calendar` → **fallback to calendar**. Verified: `#/progress/nonsense` renders Progress
overall, `#/totally/bogus` renders the calendar. Nothing 404s.

Global event delegation (`app.js:925 onActionClick`) handles exactly **10** actions:

| Action | Handler |
|---|---|
| `select-date` | `setSelectedDate` |
| `previous` / `next` | `shiftPeriod(∓1)` |
| `view-month` / `view-week` | `setCalendarView` |
| `back` | `backToCalendar` |
| `open-progress` / `open-reports` | `router.navigate(...)` |
| `navigate` | `navigateTo(data-hash)` (internal `#/` only) |
| `export-html` | `exportCurrentReport` |

⚠️ **There is no generic "add a button" mechanism** — a new interactive control requires
a `case` in `app.js` plus a `data-action` attribute. This is the main friction point for
U1's "Add a note / New Event".

### 8.4 CSS architecture

Six stylesheets, loaded in order: `base` → `components` → `calendar` → `tracker` →
`progress` → `reports`. Design tokens (colors, radius, font) live in `base.css`.

Class-count scan found **two overlaps**, both verified benign:
- `.app-header` — `base.css:77` (layout) and `components.css:127` (inside a media query,
  responsive override).
- `.tracker-hero`, `.study-block` — `components.css:7-8` (shared panel styling) and
  `tracker.css:10,24` (inside a media query).

All three overlaps are **intentional base-plus-responsive layering**. No CSS conflicts.
No `!important` battles. `reports.css` already contains a deliberate overflow-containment
pattern (`.pc-calendar` scrolls internally, page never overflows) which U2 should copy
rather than reinvent.---

## 9. Change Specification Mapping

Both reference files were read: the JSON (`Study-Planner_Change-Specification-v5.json`,
1014 lines, 27 pages, 24 figure entries) **and** the PDF (27 pages, verified 27).
`implementation_rules` were honoured:

> Preserve existing working functionality unless explicitly targeted. Use canonical
> existing data and architecture instead of creating parallel systems. Treat negative
> requirements as hard constraints.

⚠️ **Figure ID collision:** `figure_index` reuses `FIG-001`…`FIG-012` across three
different changes. `figure_id` is **not** globally unique — resolve figures as
(`change_id`, `figure_id`). Do not build a lookup keyed on `figure_id` alone.

### CHANGE-001 — Calendar UI / Data / Interaction → **U1 + U2**

| Requirement | Existing component | Current state | Phase | Likely modification |
|---|---|---|---|---|
| Full-year calendar JSON | *(none)* | **does not exist** | U1 | **create** `data/calendar/2026.json` + loader |
| Study week/day/graded metadata | plan `weekNumber`/`dayNumber`; graded only as `task.type==='graded'` | present but scattered; graded not a date flag | U1 | derive into calendar JSON |
| 2 Oct = Week 1 / Day 1 | plan `2026-10-02.json` `weekNumber:1 dayNumber:1` | ✅ already true in data | U1 | expose via JSON |
| 8 Oct = graded day | 4 tasks `type:'graded'` | inferable (`dayNumber%7===0`) | U1 | encode explicitly in JSON |
| Weekly nav = **study weeks** | `app.js:216 shiftPeriod` → `addDays(±7)` | rolling Sun→Sat | U2 | navigate by `weekNumber` |
| Monthly nav = calendar months | `app.js:216` → `addMonths` | ✅ already correct | — | none |
| Mode-specific headers | `calendar-view.js:54` single `<h2>` | one shared title | U2 | "Oct Week 1 - 2026" vs "October 2026" |
| Visual hierarchy vs reference | `month-view.js` / `week-view.js` / `calendar.css` | minimal | U2 | restyle |
| Add a note | *(none)* | no UI, no storage | U1/U2 | new; **must not** pollute `storage.js` completions |
| New Event | *(none)* | no UI, no storage | U1/U2 | new; same |
| Date hints ("Week 1", "Graded") | `month-view.js buildDayCell` | day number + progress bar only | U2 | add labels from calendar JSON |
| Preserve Fri→Thu | `calendar.js:121` uses Sun→Sat | ❌ **mismatch** | U1/U2 | replace with study-week logic |
| No duplicate progress/completion/planner | engines intact | ✅ clean | — | enforce |

### CHANGE-002 — Breadcrumb & Navigation → **U2** (reports half only)

| Requirement | Existing component | Current state | Phase | Likely modification |
|---|---|---|---|---|
| Reports gains Calendar crumb | `app.js:744 reportShell` | only `← Reports` | U2 | add crumb via `routeForCalendar()` |
| Clickable, returns to Calendar | `data-action="navigate"` | mechanism exists | U2 | reuse `navigateTo` |
| Deep pages keep parent path | `reportShell` | flat link row | U2 | level-aware crumbs |
| Match Progress language | `progress-drilldown.js:30 buildNavViewModel` | ✅ working reference | U2 | mirror pattern; add `reports.css` rules |
| Do not disturb Progress | `progress-drilldown.js` | working | — | **no edits** |

### CHANGE-003 — Reports: four subsections → **U3 (sections 1–2) + U4 (sections 3–4)**

Strict hierarchy, verified against live app:

| # | Requirement | Existing component | Current state | Phase | Likely modification |
|---|---|---|---|---|---|
| 1 | Overall table alignment | `report-viewer.js:55 tableHTML` | drift between rows/cols | U3 | `reports.css` table layout |
| 1 | Export still works | `export-engine.js` | ✅ deterministic | U3 | regression-check only |
| 2 | Rename → "Weekly Timetable Chart" | `app.js:772` label | "Weekly timetable" | U3 | label string(s) |
| 2 | Show Week 1–4 before opening | `app.js:773` → `routeForReportCalendar(1)`; `router.js` `#/reports/calendar` → week 1 | ❌ **hardcoded to Week 1** | U3 | selection view + new level |
| 2 | Canonical study-week dates | `report-model.js:290` filters `plan.weekNumber` | ✅ already canonical | — | none — **do not reinvent** |
| 2 | 12-hour AM/PM axis | `progress-calendar.js:45 formatClock` **and** `export-engine.js:171` | ❌ 24-hour (`13:00`…`23:00`) | U3 | **both files** (R-02) |
| 2 | Hide break-only visual blocks | `progress-calendar.js blockState` | break blocks rendered | U3 | presentation filter; **keep data** |
| 2 | Remove internal scrollbar | `reports.css:213 overflow-x:auto` | intentional containment | U3 | only if genuinely unneeded after layout |
| 3 | Weekly Report week selector | `app.js:807` → `routeForReportWeek(1)` | ❌ Week 1 only | U4 | 4-week selection layer |
| 3 | Weekly table alignment | `report-viewer.js tableHTML` | drift | U4 | CSS |
| 4 | Daily Schedule spacing | `report-viewer.js renderDayHTML` | one row drifts | U4 | scoped padding |
| 4 | **Tasks table untouched** | `renderDayHTML` | correct | — | **forbidden** |
| — | Real zero progress for empty weeks | `report-model` scopeNode | ✅ returns 0, never NaN | — | none — show, don't hide |

### CHANGE-004 — Tracker actionable blocks → **U5**

| Requirement | Existing component | Current state | Phase | Likely modification |
|---|---|---|---|---|
| Revision + Review checkboxes | `task-group.js:40 isAcademic` | ❌ no checkboxes | U5 | extend block classification |
| Use existing completion flow | `storage.setCompletion` | ✅ exists | U5 | **reuse** |
| Must persist | `storage.js` | ✅ exists | U5 | no new store |
| Break blocks unchanged | `CATEGORY_NOTES` | ✅ correct | — | **no edits** |
| No tracker redesign | `daily-tracker.js` | stable | — | minimal diff |

### CHANGE-005 — Header logo → **U2**

| Requirement | Existing component | Current state | Phase | Likely modification |
|---|---|---|---|---|
| Remove SP monogram | `index.html:48` | `<span class="app-logo">SP</span>` | U2 | replace with inline SVG |
| White, crisp, scalable | `base.css:91` | 44×44 box | U2 | white stroke, keep geometry |
| Keep title/subtitle/nav | `index.html:50-56` | correct | — | **no edits** |
| Use uploaded SVG as-is | *(asset missing)* | ❌ not in repo | — | needs asset (R-11) |---

## 10. Reusable Components

The Update Track must be *existing system + small targeted changes*, never a parallel
system. These are the pieces to reuse.

### 10.1 Date & calendar
| Asset | Why reuse it |
|---|---|
| `calendar.js` — `isoDate`, `parseIso`, `addDays`, `weekdayIndex`, `isValidIsoDate` | Pure, UTC-only, deterministic. Single date identity. |
| `calendar.js` — `formatDateParts`, `formatLongDate` | Consistent date text everywhere. |
| `calendar.js` — `buildMonthGrid`, `addMonths` | Correct for month mode. **Reuse as-is.** |
| `month-view.js` — `buildDayCell` | Shared by month *and* week views; adding hints here updates both. |
| `progress-calendar.js` — `blockGeometry`, `resolveWindow` | Ratio-of-one-window geometry keeps blocks proportional automatically. |
| `report-model.js` — `resolveSchedule` | Solves the 12-hour-no-meridiem problem deterministically. |

### 10.2 Study-week logic — **already exists, do not recreate**
| Asset | Location |
|---|---|
| Canonical `weekNumber` / `dayNumber` | top-level fields of all 28 plan documents |
| Study-week filtering | `report-model.js:290 buildWeekReport()` |
| Week enumeration | `report-model.js:422-429 buildOverallReport()` |
| Syllabus week nodes | `progress-engine.js:104` `weeks['week-'+n]` |
| **This is the single biggest reuse win in the whole track.** CHANGE-003 explicitly forbids "a second independent study-week date system". |

### 10.3 Progress, storage, identity
| Asset | Why |
|---|---|
| `progress-engine.js` — `progressForTasks`, `dayProgress`, `isEligibleForProgress` | Only calculator. Any new UI reads nodes, never counts. |
| `storage.js` — `setCompletion`, `clearCompletion`, `getAllCompletions`, `reset` | Only writer. U5 checkboxes go here. |
| `storage.js` — `TASK_ID_PATTERN` | Gate every new task ID at authoring time. |
| `data-engine.js` — `buildTasksForWeek`, `buildTasksForCourse`, `parseTaskId` | Task construction + ID parsing. |
| Task ID scheme `{subjectId}:{weekNumber}:{sourceId}` | 413 IDs, all matching, persisted. Never change. |

### 10.4 Reports, export, routing, UI
| Asset | Why |
|---|---|
| `report-model.js` — `createReportModel`, 5 scopes | Reuse for U3/U4 content; it already returns canonical week dates. |
| `report-viewer.js` — `renderReportHTML(kind, report, {links})` | Kind-parameterized; new report kinds plug in. |
| `app.js` — `reportShell(title, body, options)` | Single place to add the Calendar crumb. |
| `app.js` — `reportLinkFor()` | Link factory already injected into the viewer. |
| `progress-drilldown.js` — `buildNavViewModel`, `renderNavHTML` | Working breadcrumb pattern to mirror. |
| `export-engine.js` — `exportOverall/Subject/Week/Daily/Calendar`, `renderStandaloneHTML` | Working export; extend, don't replace. |
| `renderer.js` — `escapeHtml`, `setHtml` | XSS-safe rendering; must be used for all new HTML. |
| `reports.css` overflow-containment pattern | `.pc-calendar` scrolls internally, page never overflows. Copy for U2 calendar. |
| `base.css` tokens | Single source of colour/spacing/radius. |

### 10.5 Where a future phase could accidentally duplicate logic

| Duplicate risk | Where it would creep in | Prevention |
|---|---|---|
| **Study-week table** | new `calendar.js` helper hardcoding the 4 boundaries | read `plan.weekNumber`; generate calendar JSON from it |
| **Time formatting** | a *third* `formatClock` beside the two existing | fix both, or export from one shared module |
| **Progress math** | counting `done/total` inside a new calendar/report widget | always `ProgressEngine.*` |
| **Completion store** | a second `localStorage` key for notes/events | notes/events need their own key, but must live in `storage.js`, never ad hoc |
| **Task ID minting** | `revision-day-1` style IDs bypassing the pattern | validate against `TASK_ID_PATTERN` in a test |
| **Breadcrumb markup** | a second `.rp-crumbs` system alongside `.progress-crumbs` | mirror the class/structure; don't fork the router |
| **Ghost components** | filling in the 0-byte `components/tasks/*.js` stubs | leave them; delete or ignore |
| **Plan loading** | a second fetch path for calendar dates | reuse `createPlanStore` in `app.js` |

---

## 11. Files Likely to Change

### U1 — Canonical Calendar Data Foundation
- `data/calendar/2026.json` — **CREATE** (generate; don't hand-type)
- `src/js/calendar.js` — **EXTEND** with study-week/day/graded lookups reading the JSON
- `tools/` — **CREATE** a generator so the JSON is derived, not typed
- `tests/data/calendar-validation.test.js` — **CREATE** (cross-check vs the 28 plans)
- `tests/renderer/calendar.test.js` — update the Sun→Sat assertions (`L83`, `L93`)
- `src/index.html` — register the new script/data path if a loader is added

### U2 — Calendar Experience + Shared UI
- `src/components/calendar/month-view.js` — date hints, selected-day treatment
- `src/components/calendar/week-view.js` — study-week strip
- `src/components/calendar/calendar-view.js` — **mode-specific headers** (§8.3 action cases)
- `src/css/calendar.css` — visual hierarchy to reference
- `src/js/app.js` — `shiftPeriod` (study-week nav), `reportShell` (Calendar crumb), new
  note/event actions, logo markup if header moves
- `src/css/reports.css` — report breadcrumb styles
- `src/index.html` — header logo replacement (CHANGE-005)
- `src/css/base.css` — `.app-logo` SVG sizing/alignment
- New: note/event component + its view-model module

### U3 — Reports: Overall + Weekly Timetable
- `src/components/reports/progress-calendar.js` — **`formatClock` → 12-hour** (R-02)
- `src/js/export-engine.js` — **`formatClock` → 12-hour**, keep in sync
- `src/js/router.js` — week-selection level (`#/reports/calendar` must not auto-pick W1)
- `src/js/app.js` — `renderReportsIndex` label + selection view, break-block filter
- `src/components/reports/report-viewer.js` — selection view + table alignment markup
- `src/css/reports.css` — tables, week cards, scrollbar
- `src/js/report-model.js` — only if a new selection scope is needed (prefer not)

### U4 — Reports: Weekly + Daily
- `src/components/reports/report-viewer.js` — week selector, Daily Schedule spacing
- `src/js/app.js` — `renderReportWeek` selection layer
- `src/js/router.js` — week-selection level
- `src/css/reports.css` — table alignment
- ⚠️ **The Daily Report Tasks table must not change** — verify by diffing that table's
  markup/classes before and after.

### U5 — Daily Tracker Completion
- `src/components/tracker/task-group.js` — block classification (primary change)
- `src/components/tracker/daily-tracker.js` — only if the summary counts revision/review
- `src/css/tracker.css` — checkbox styling to match existing task cards
- `tests/renderer/tracker.test.js` — assert revision/review checkboxes + persistence
- ⚠️ Requires an agreed task-ID scheme (R-08) and a decision on progress eligibility.
- **Do not touch** `storage.js` unless a validation gap is proven (its `setCompletion`
  already accepts any pattern-conforming ID).

### U6 — Full Integration + Regression
- `tests/renderer/*.test.js` — extend coverage across all changed surfaces
- `docs/*` — update architecture/checklist/agent-context
- `src/index.html` — script registration if new modules were added
- No behavioural changes expected; U6 is verification + documentation.---

## 12. Protected Files / Systems

### 12.1 Absolutely protected — no change warranted by any of CHANGE-001…005

| System | Path | Why protected |
|---|---|---|
| **Syllabus content** | `data/syllabus/*.json` (4 files, 560 KB) | Canonical source of truth. Never invented, never duplicated. |
| **Generated daily plans** | `data/schedule/daily/*.json` (28 files) | Materialised by `planner-engine.js`. Runtime only *reads* them. |
| **Planner algorithm** | `src/js/planner-engine.js` (28 KB) | Encodes the whole 28-day allocation. 413/413 tasks placed exactly once. |
| **Task ID scheme** | `{subjectId}:{weekNumber}:{sourceId}` | 413 persisted IDs + `TASK_ID_PATTERN` + `data-engine.parseTaskId`. Changing it orphans stored completion. |
| **Completion authority** | `src/js/storage.js` | Sole writer. Only mutable state in the app. |
| **Progress authority** | `src/js/progress-engine.js` | Sole calculator. Every UI reads its nodes. |
| **Export behaviour** | `src/js/export-engine.js` | Explicitly "considered working"; determinism + standalone are hard-won. |
| **Progress routes** | `router.js parseProgressRoute` + `components/progress/*` | CHANGE-002/003 both say "do not disturb Progress". |
| **Completion flow** | `tracker/task-card.js` → `onTaskToggle` → `storage` | Fully working; U5 must extend, not replace. |

### 12.2 Protected pending justification

| System | Condition for change |
|---|---|
| `calendar.js` `buildWeekDates` | **Must change for U1/U2** — it encodes Sun→Sat while the cycle is Fri→Thu. Justified by CHANGE-001 ("weekly navigation must use study weeks") and the anti-regression clause ("Fri→Thu behavior must not be silently replaced"). Only `buildWeekDates` and its two tests; **not** the ISO/parse/month helpers. |
| `progress-drilldown.js` | Read as a **reference**, not edited. Extract to shared module only if U2 explicitly requires it, with Progress regression tests. |
| `tests/renderer/calendar.test.js` | Its Sun→Sat assertions **encode the bug**. Updating them is required, but they must be rewritten to assert *study-week* semantics, not deleted. |

### 12.3 Explicitly out of bounds for U0 (re-confirmed)

Planner logic · syllabus JSON · daily-plan JSON · progress JSON · task IDs · canonical
calendar JSON · notes · events · timetable behaviour · tracker checkboxes · report
redesign · weekly selectors · daily reports · breadcrumbs · header/logo · export behaviour
· unrelated refactoring · speculative features. **None were implemented.**

---

## 13. Architectural Risks

### BLOCKER

**None.** No finding prevents starting U1.

### HIGH

**R-01 — Weekly calendar shows Sun→Sat, but the study cycle is Fri→Thu.**
`calendar.js:121`; live-verified (`27 Sep – 3 Oct` for a 2 Oct anchor). Only 1 of 7 cells
carries a plan. CHANGE-001 requires study-week navigation, and a wrong-week calendar would
contradict "the study-cycle timing and Fri→Thu behavior must not be silently replaced".
Two tests actively lock in the wrong behaviour (`calendar.test.js:83,93`).
→ *Fix in U1/U2. Highest-severity calendar item.*

**R-02 — `formatClock` is duplicated; a partial AM/PM fix silently desynchronises app and export.**
`progress-calendar.js:45` and `export-engine.js:171` are independent implementations
(plus `axisTicks` at `:72` and `:179`). Both currently emit 24-hour. Changing one and not
the other means the downloaded HTML contradicts the on-screen report.
→ *Change both in U3, or export `formatClock` from one module and consume it in both.*

**R-03 — U5 needs task IDs that the data model cannot currently express.**
`revision`/`review` blocks have **no `taskIds`** (28 each), while `storage.js:45` requires
`/^[^:]+:\d+:[^:]+$/` and the ID scheme is `{subjectId}:{weekNumber}:{sourceId}` — there is
no precedent for a non-subject activity.
→ *Decision required before U5 (see §17).*

### MEDIUM

**R-04 — No canonical calendar JSON; calendar structure is pure arithmetic.**
The spec's U1 premise is confirmed absent. Risk: implementing week/day/graded logic
*inside* JS instead of as data creates the "second independent study-week date system"
that CHANGE-003 explicitly forbids.
→ *U1 creates the JSON; validate it against the 28 plans in a test.*

**R-05 — Graded-ness is inferable but never stated.**
Verified rule `graded-day ⇔ dayNumber % 7 === 0` holds for all 28 days, but no plan
carries a date-level graded flag, and there is **no graded *block*** in any schedule
(only graded *tasks*). U1 must decide whether to encode the rule as data (recommended) or
recompute it in the UI.
→ *Encode once, in the calendar JSON.*

**R-06 — Two competing "week" concepts could be conflated.**
Syllabus content weeks (`progress-engine`, keyed off `course.weeks[].weekNumber`) vs study
cycle weeks (`report-model`, keyed off `plan.weekNumber`). They coincide today (both 1–4,
same boundaries) but come from different sources.
→ *Document explicitly; never merge them; never assume one from the other.*

**R-07 — Report week selection is hardcoded to Week 1.**
`app.js:773` (`routeForReportCalendar(1)`) and `router.js` (`#/reports/calendar` →
`weekNumber: 1`). Exactly the CHANGE-003 §3.2/§4.1 "only Week 1 discoverable" defect.
→ *U3/U4 add a selection layer; do not paper over by changing the default.*

**R-08 — New U5 tasks will change progress denominators.**
Adding 2 tasks/day × 28 days = 56 new tasks moves the overall total (currently **413**)
and every day/week/subject percent, invalidating hard-coded expectations in tests. If
typed as `break`/`free`/`fixed` they are excluded by `isEligibleForProgress` — but then
they'd also be excluded from the tracker UI, which contradicts "actionable".
→ *Needs an explicit product decision: are revision/review counted as progress?*

**R-09 — No generic action-dispatch mechanism.**
`app.js` handles exactly 10 hardcoded `data-action` cases. U1's note/event controls and
U3/U4 week selectors each need new cases; a sprawling switch is the likely failure mode.
→ *Keep additions minimal and centralised; consider a small action registry, but only if
U1 needs >2–3 new actions.*

### LOW

**R-10 — Five 0-byte orphan files.**
`components/tasks/{task-card,task-status,task-types}.js`, `manifest.json`,
`service-worker.js`. Never loaded (confirmed: absent from the 26-member runtime
namespace). `components/tasks/task-card.js` collides by filename with the *live*
`components/tracker/task-card.js` — a false-positive reference trap.
→ *Ignore. Do not fill them in (would be a parallel task system). Leave or remove in a
separate cleanup.*

**R-11 — CHANGE-005's SVG asset is not in the repository.**
The spec names `task-square-svgrepo-com.svg` (viewBox `0 0 24 24`, stroke `#292D32`,
width 1.5) and states the file is "already attached". It is not present. Inlining an
approximation would violate "Do not replace the uploaded icon with a different icon".
→ *Obtain the exact asset before U2.*

**R-12 — Console 404s on boot.**
`2026-10-01.json`, `2026-10-30.json`, `2026-10-31.json` are requested by the month grid but
don't exist (outside the cycle), plus `favicon.ico`. Handled gracefully
(`app.js:276` catches per-date and warns); the app renders correctly. Cosmetic noise.

**R-13 — No git repository.**
`fatal: not a git repository`. No `git diff`, no `git stash`, no branch rollback. Integrity
relies on the 274-test suite plus timestamps. **Recommend `git init` before U1** so the
Update Track has change review and rollback.

### SAFE (verified, no action)

- **Storage authority** — zero raw `localStorage` outside `storage.js`.
- **Progress authority** — no component computes a ratio; one `percentFor` in the engine.
- **Route registration** — progress → reports → day → calendar → fallback; no conflicts;
  16/16 routes render, including both bogus-route fallbacks.
- **CSS layering** — the 2 class overlaps are base + responsive overrides; no conflicts.
- **Report/export parity** — both bind one model instance; viewer and export share scope helpers.
- **Export determinism** — fixed stamp, byte-identical, standalone, single `<h1>`.
- **Data immutability** — no `data/` file modified (timestamps confirm).
- **Block geometry** — ratio-of-one-window; block heights proportional by construction.
- **Time parsing** — deterministic 720-minute rollover; no rounding, no invented times.
- **Test harness** — no `package.json`/bundler; plain `node --test`, works in CI.---

## 14. Regression Baseline

**Command:** `node --test` (no `package.json`; plain Node test runner).

### Actual current result — measured, not assumed

```text
ℹ tests 274
ℹ suites 0
ℹ pass 274
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6348.2474
```

| Metric | Value |
|---|---|
| Total tests | **274** |
| Passing | **274** |
| Failing | **0** |
| Skipped | **0** |
| Todo | **0** |
| Cancelled | **0** |
| Warnings | **0** |
| Duration | ~6.35 s |

This matches the Phase 6 figure of 274/274 — **independently re-verified in this phase,
not copied forward.** No test was modified, skipped, or made to pass during U0.

**Per-suite spot check:** `tests/engine/export-engine.test.js` → 20 pass / 0 fail,
confirming export determinism still holds.

**Baseline contract for U1–U6:** the suite must remain **≥274 passing, 0 failing** after
every update phase. Any reduction in count, or any edit to an existing assertion without a
documented reason, is a regression.

> ⚠️ Note on `tests/renderer/calendar.test.js:83,93`: these assert Sun→Sat behaviour
> (R-01). They are *correct tests of current behaviour* and *incorrect specifications*.
> U1/U2 will legitimately update them — and U6 must confirm that the **only** changed
> assertions are those two.

---

## 15. Browser Baseline

**Method (as specified):**
```powershell
cd E:\Study-Planner
python -m http.server 8099
```
→ `http://localhost:8099/src/`

### 15.1 Boot

Loads cleanly. Title `Study-Planner — IIT Madras BS`. All 26 namespaces present.
**4 console errors, all benign 404s** (R-12): `2026-10-01.json`, `2026-10-30.json`,
`2026-10-31.json` (out-of-cycle dates probed by the month grid) and `favicon.ico`.
No JavaScript exceptions; no stack traces; the app renders fully.

### 15.2 Route matrix — 16/16 render, 0 broken

| Route | Result | Content confirmed |
|---|---|---|
| `#/calendar` | ✅ | `‹ October 2026 › Monthly Weekly SUN…SAT` |
| `#/day/2026-10-02` | ✅ | `← Calendar Day 1 — Study Tracker Friday • 2 October 2026` |
| `#/progress` | ✅ | `Calendar › Progress` + `3% 11 / 413` |
| `#/reports` | ✅ | index, 4 entries |
| `#/reports/overall` | ✅ | `← Reports Progress` + `3% OVERALL 11 / 413` |
| `#/reports/week/1` | ✅ | `13% WEEK 1 11 / 87` |
| `#/reports/week/4` | ✅ | `0% WEEK 4 0 / 111` (real zero, not hidden) |
| `#/reports/day/2026-10-02` | ✅ | `58% DAY 1 11 / 19` |
| `#/reports/calendar/week/1` | ✅ | `Weekly timetable — Week 1  2026-10-02 – 2026-10-0…` |
| `#/reports/subject/mathematics-i` | ✅ | `5% MATHEMATICS I 8 / 16` |
| `#/progress/subject/mathematics-i` | ✅ | `Calendar › Progress › Mathematics I` |
| `#/progress/week/1` | ✅ | `Calendar › Progress › Week 1` |
| `#/progress/day/2026-10-02` | ✅ | `Calendar › Progress › Week 1 › Day 1` |
| `#/reports/calendar` | ✅ | correctly redirects to Week 1 |
| `#/progress/nonsense` | ✅ | falls back to Progress overall |
| `#/totally/bogus` | ✅ | falls back to calendar |

Deep-link refresh works for every route (URL is the single source of truth).

### 15.3 CHANGE-002 evidence (live)

```text
Progress  #/progress/subject/mathematics-i  →  "Calendar › Progress › Mathematics I"   ✅
Reports   #/reports/overall                 →  "← Reports … Progress"                ❌ no Calendar
```
Confirms the defect and confirms the reusable Progress pattern.

### 15.4 CHANGE-003 evidence (live)

Weekly timetable time axis (`#/reports/calendar/week/1`):
```text
11:00 12:00 13:00 14:00 15:00 16:00 17:00 18:00 19:00 20:00 21:00 22:00 23:00
```
→ **24-hour, zero-padded, no AM/PM.** Exactly the specified defect.

Day-1 column blocks (12 total) include `Lunch / Rest`, `Walk / Refresh`, `Free / Refresh`,
`FIXED TIME`, `Relax`, `Refresh` — all rendered as visible grey/`pc-tok-rest` blocks.
→ **Break-only blocks not hidden**, as specified.

### 15.5 CHANGE-004 evidence (live)

`#/day/2026-10-02`: `study` blocks carry 8 / 5 / 4 / 2 checkboxes. All `break`, `free`,
`fixed` blocks carry 0. `Math + Statistics Revision` and `Daily Review` carry **0** — the
two targets, with all break blocks correctly untouched.

### 15.6 CHANGE-001 evidence (live)

Main calendar → Weekly at anchor 2026-10-02:
```text
title: "27 September – 3 October 2026"
cells: 09-27 Sun, 09-28 Mon, 09-29 Tue, 09-30 Wed, 10-01 Thu, 10-02 Fri, 10-03 Sat
```
→ **Sun→Sat, not Fri→Thu.** Only one of seven cells has a plan. R-01 confirmed live.

### 15.7 Layout

At 1536 px viewport, **all 7 major routes report `pageOverflow = 0`** (no horizontal
page overflow). Timetable columns are readable; the grid scrolls internally as designed.

### 15.8 Cleanup

Server stopped, port 8099 closed, browser session closed, no `.playwright-mcp` artifacts
left in the repository, **no `data/` file modified**.

### 15.9 Verdict

**The application boots, navigates, and renders every existing route correctly, with no
runtime errors and no broken routes.** The baseline is sound for starting U1.---

## 16. Recommended Implementation Order

### Is `U1 → U2 → U3 → U4 → U5 → U6` safe?

**Yes — with three caveats.** The specified order is architecturally sound, and the
dependency direction is correct in every case:

- U1 creates the canonical calendar data that U2's navigation reads. ✅ correct order.
- U2 establishes shared UI + breadcrumbs that U3/U4 then reuse rather than reinvent. ✅
- U3 (Overall + Timetable) precedes U4 (Weekly + Daily) because both share the week-selection
  pattern U3 introduces; building it once in U3 avoids duplication. ✅
- U5 is independent of U3/U4 (tracker vs reports) and could run in parallel. ✅
- U6 last, as full regression. ✅

### Caveat 1 — U1 must land the *data* and U2 the *week navigation*, atomically in effect

`buildWeekDates` (Sun→Sat) is shared by `week-view.js` **and** `app.js:182`. If U1 adds a
calendar JSON but leaves `buildWeekDates` alone, the app keeps showing wrong weeks. If U2
changes `buildWeekDates` before U1's JSON exists, there is nothing to read study weeks
from. **They are one logical change split across two phases.** Treat the Sun→Sat
replacement as a single unit of work that completes by the end of U2 — do not declare U1
"done" while the app still shows `27 Sep – 3 Oct`.

### Caveat 2 — U3 and U4 share the week-selection layer

Both require "Week 1–4 selection before opening". Building it twice is exactly the
duplication the spec forbids. **Build the reusable selector in U3**, then have U4 consume
it. U4 should be roughly half the size of U3 as a result — if it isn't, the selector was
not generalised.

### Caveat 3 — U5 carries an unresolved product decision (R-03, R-08)

U5 should not begin until §17's two questions are answered. Its *UI* work is small, but the
task-ID scheme and progress-eligibility policy are prerequisites, not implementation
details.

### Optional parallelism

U5 (tracker) and U3/U4 (reports) touch disjoint files and can proceed concurrently, since
both only read the engines. U2 must still precede both if the shared UI changes are to be
reused. **Recommended: strict U1→U2→(U3→U4) with U5 parallel after U2, then U6.**

---

## 17. U1 Readiness

# ✅ READY

U1 is unblocked. Specifically:

- **No blocker exists.** Nothing in the repository prevents starting U1.
- **The canonical study-week data already exists** in the 28 plan documents
  (`weekNumber`, `dayNumber`), verified for all 28 files and matching the spec's boundaries
  exactly (W1 = 2026-10-02 → 2026-10-08, W4 = 2026-10-23 → 2026-10-29). U1 is a
  *projection* of verified facts into a year-level JSON, not an invention.
- **The graded-day rule is verified** (`dayNumber % 7 === 0`, 28/28) and can be encoded as
  data.
- **Baseline is green**: 274/274 tests, 0 fail; 16/16 routes render; storage and progress
  authorities are clean.
- **`data/` is untouched**, so U1 can validate its generated JSON against the pristine
  source of truth.

### Recommended U1 entry conditions

1. **`git init` + initial commit** (R-13). Without version control, the Update Track has
   no review or rollback. This is the only thing I would insist on before code is written.
2. **Generate, don't hand-type.** Produce the year JSON via a `tools/` script from the plan
   metadata. 365 hand-typed entries would drift immediately.
3. **Add a validation test** cross-checking the JSON against all 28 plan documents
   (`weekNumber`, `dayNumber`, graded-ness) so U1 cannot silently diverge from the plans.
4. **Record the graded-day decision** (R-05): encode explicitly in JSON rather than
   recomputing in UI.

### Two decisions required before U5 (not before U1)

**Q1 — Task-ID scheme for `revision`/`review`.** They have no `taskIds`, and
`TASK_ID_PATTERN` requires `{x}:{digits}:{y}`. Options: (a) mint IDs following the existing
scheme with a reserved `sourceId` segment; (b) extend `TASK_ID_PATTERN` (touches protected
`storage.js` — avoid unless proven necessary); (c) give the blocks a synthetic task each
via the planner (regenerates 28 files — expensive, and `planner-engine.js` is protected).
*Option (a) is lowest risk.*

**Q2 — Progress eligibility.** Does checking off `Math + Statistics Revision` / `Daily
Review` count toward academic progress? If yes, overall totals move from 413 and many test
expectations change. If no, they must be typed `break`/`free`/`fixed` to be excluded — but
that also hides them from the tracker's own counting. *This changes what the progress
numbers mean and should be an explicit product decision.*

---

## Appendix A — Method

**Inspected:** both specification files (JSON 1014 lines + PDF 27 pages); all 36 `src/`
files; all 36 `data/` files (structurally, via script); all 14 test files; `index.html`;
`docs/`; `README.md`; `PROJECT_SPECIFICATION.md`; `CLAUDE.md`; `TRACKING_STORAGE_MANIFEST.json`;
`tools/`; the 26-member runtime namespace enumerated in-browser.

**Verified by execution, not assumption:**
- `node --test` full suite (§14)
- File-reference analysis for every source file (size + referenced + live-reachable)
- Study-week/day/graded derivation across all 28 plan documents
- Task-ID pattern conformance across all 413 tasks
- Category → task-ID presence census (112/112/28/28/28/28)
- CSS class-collision scan across all 6 stylesheets
- Browser: boot, 16 routes, breadcrumb comparison, 24-hour axis, break-block visibility,
  tracker checkbox inventory, weekly-strip dates, per-route overflow

**Not modified:** any application file, data file, test, or configuration. The only
artifact of this phase is this report.

**Integrity verification note.** A naive "modified today" timestamp scan *does* list ~25
files under `src/`, `tests/` and `docs/` — these are **Phase 6 edits from earlier the same
day**, not U0 changes. Verified by exact timestamps: those files were last written between
**06:42 and 07:22**, whereas this U0 audit ran from **08:18** onward and its only write is
this report at **14:11**. No file was touched during U0, and **no file under `data/` has
today's date at all** (so the 36 data files are provably untouched). This is exactly the
weakness that having no git history (R-13) creates, and the reason §17 recommends
`git init`.

**Cleanup:** port 8099 closed, browser session closed, no temporary artifacts retained.