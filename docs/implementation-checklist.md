# Implementation Checklist

Use this checklist during implementation.

Status: Phases 1-6 complete.

## Foundation

- [x] Load source JSON
- [x] Validate/normalize data
- [x] Implement storage abstraction
- [x] Implement calendar state
- [x] Implement routing/view switching

## Daily planner

- [x] Build deterministic planner
- [x] Preserve lecture/activity ordering
- [x] Separate practice and graded days
- [x] Add fixed blocks
- [x] Generate daily view dynamically

## Task state

- [x] Stable task IDs
- [x] Persist completion
- [x] Persist completion timestamp
- [x] Restore state on reload

## Progress

- [x] Task progress
- [x] Day progress
- [x] Week progress
- [x] Subject progress
- [x] Overall progress
- [ ] Category breakdown — progress is task-based; `progress.json` carries no
      category dimension, so there is nothing to break down yet. Deferred until
      a specification adds category-level progress data.
- [x] Automatic recalculation — every dashboard render recomputes from storage
- [x] Double-click drill-down — calendar cells; progress rows drill on a single
      click (also keyboard reachable)

## Reports

- [x] Report model
- [x] Daily HTML export
- [x] Week HTML export
- [x] Subject HTML export
- [x] Overall HTML export
- [x] Self-contained report
- [x] Expand/collapse hierarchy — reports render the Overall → Subject → Week → Day
      hierarchy as tables and navigation links. Interactive expand/collapse is not
      implemented: the report viewer and the export present the same hierarchy
      read-only, and no requirement introduced a collapsible control.
- [x] Weekly progress calendar (7-day timetable from real schedule data)
- [x] Calendar HTML export — same report model → export engine pipeline
- [ ] Category reports — `progress.json` carries no category dimension, so this
      remains excluded rather than fabricated. Same deferral as the progress
      category breakdown above.

## Quality

- [x] Unit tests
- [x] Empty-state handling
- [x] No NaN/Infinity progress
- [x] No duplicated syllabus data
- [x] No index-based persistence
- [x] Reference files remain unchanged

---

## Phase 5 — Progress dashboard and drill-down

Delivered in `src/components/progress/` plus five routes (`#/progress`,
`#/progress/subject/:subjectId`, `#/progress/subject/:subjectId/week/:weekNumber`,
`#/progress/week/:weekNumber`, `#/progress/day/:date`).

Rules that must survive future edits:

- Progress UI components never compute a percentage. They render nodes produced
  by `progress-engine.js`.
- Completions are read through `storage.js`; the dashboard never writes.
  Completing work happens in the Daily Tracker.
- Subject order comes from `data-engine.js` canonical order, never alphabetical
  or sorted by progress.
- A progress render always recomputes from current storage, so a percentage can
  never be stale.

Covered by `tests/renderer/progress.test.js` (38 tests).
Covered by `tests/renderer/progress.test.js` (38 tests).

---

## Phase 6 — Report model, export engine, report viewer, progress calendar

Delivered in `src/js/report-model.js`, `src/js/export-engine.js`,
`src/components/reports/*`, `src/css/reports.css`, plus routes under `#/reports`.

All Phase 6 files already existed as 0-byte placeholders; this phase filled them
rather than creating a new structure.

Rules that must survive future edits:

- `report-model.js` computes no progress. Every total, completed, remaining and percent
  value comes from `progress-engine.js`. If a report seems to need a new number, add it
  to the engine and test it there.
- `export-engine.js` serialises a report model. It never recalculates progress, never
  reads storage, and never touches a plan document.
- The export must stay deterministic: no `Date.now()`, no `Math.random()`, no generated
  timestamp. Two exports of the same model are byte-identical.
- The export must stay standalone: no `<link>`, no `<script src>`, no `fetch`, no
  `localStorage`. CSS is embedded.
- Report routes are parsed in `router.js` *after* the Phase 4/5 routes, so the existing
  routes keep their exact behaviour.
- The progress calendar uses the real `schedule[]` data only. No hardcoded timetable
  events, no sample data.

### The schedule time format — read this before touching the calendar

`planner-engine.js` emits **12-hour clock strings with no meridiem** (`"11:00"`,
`"1:00"`, `"10:30"`). The study day runs **11:00 → 23:00**, so the raw clock values
*decrease* across the day. Parsing them as 24-hour values produces an inverted calendar.

`report-model.js` recovers the meridiem from the day's own ordering: whenever a clock
value moves backwards relative to the previous block, one 12-hour cycle (720 min) is
added. Times are never rounded. Block geometry is then a ratio of a single shared day
window, so a 120-minute block is exactly twice the height of a 60-minute block by
construction — not by tuning.

If the planner's time format ever changes, `resolveSchedule` and `resolveWindow` in
`report-model.js` are the only places that need to change.

Covered by `tests/engine/report-model.test.js` (35),
`tests/engine/export-engine.test.js` (20) and `tests/renderer/reports.test.js` (28).