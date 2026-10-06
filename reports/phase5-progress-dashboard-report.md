# Phase 5 Completion Report — Progress Dashboard and Drill-Down

Project: Study-Planner (IIT Madras BS — 28-day cycle)
Phase: 5 of 6
Status: **Complete and verified**

---

## Phase 5 Recovery Check

Performed **before** any Phase 5 code was written, to establish whether this
phase was greenfield or a partial attempt left behind by an interrupted run.

| Check | Result |
| --- | --- |
| `src/components/progress/` existed | No — directory did not exist |
| Progress routes present in `router.js` | No — only calendar and tracker routes |
| Progress wiring in `app.js` | No — no `renderProgress` handler |
| `src/css/progress.css` existed | No |
| `tests/renderer/progress.test.js` existed | No |
| Phase 4 architecture intact | Yes — engine, storage, tracker and calendar unchanged |

**Conclusion: Phase 5 was greenfield.** There were no half-written files, no
placeholder or sentinel markers, and no orphaned references to a progress layer
that did not exist. Phase 4's component/renderer split, engine layer and route
table were all present and correct, so the established architecture was carried
forward rather than rebuilt.

The check was repeated at the end of the phase (see section 5 and section 15):
the authoritative files — `progress-engine.js`, `storage.js`, `planner-engine.js`,
all `data/` JSON and `reference/**` — were never modified, and all 193 tests pass.

---

## 1. Phase summary

Phase 5 delivers the progress UI: an overall dashboard plus a full drill-down
chain from overall scope down to individual tasks.

```text
Overall → Subject → Week → Day → Task → Daily Tracker
```

Every level is reachable by URL, so a deep link can be bookmarked, shared and
refreshed. Progress values shown on screen are produced by the existing
`progress-engine.js`; this phase adds presentation, routing and navigation only.
No calculation logic was duplicated into the UI.

---

## 2. Scope delivered

In scope:

- Overall dashboard: total completion, subject rows, week rows.
- Subject detail: four cycle weeks for one subject.
- Week detail: seven cycle days, either all subjects or one subject.
- Day detail: the tasks of one planned day, with completion state.
- Breadcrumb and back navigation on every level.
- Read-only task display that links to the existing tracker for ticking work off.
- Recalculation on every render so no percentage can go stale.

Out of scope (unchanged, Phase 6):

- Report model and HTML export.
- Category-level progress breakdown.

---

## 3. Files created

| File | Lines | Purpose |
| --- | --- | --- |
| `src/components/progress/overall-progress.js` | 76 | Overall node → summary card |
| `src/components/progress/subject-progress.js` | 155 | Subject list and subject week rows |
| `src/components/progress/week-progress.js` | 198 | Week rows and week day rows |
| `src/components/progress/day-progress.js` | 156 | Day summary and task table |
| `src/components/progress/progress-dashboard.js` | 94 | Composes the overall dashboard page |
| `src/components/progress/progress-drilldown.js` | 118 | Breadcrumb and back navigation |
| `src/css/progress.css` | 195 | Progress view styles |
| `tests/renderer/progress.test.js` | 907 | 38 tests for the whole phase |

Component module pattern matches the existing tracker and calendar components:
each exposes a `build*ViewModel` (pure, defensive) and a `render*HTML`
(presentation only), plus a public `XxxModule` object.

---

## 4. Files modified

| File | Change |
| --- | --- |
| `src/js/data-engine.js` | Added `loadCoursesFromUrls()` — loads the syllabus course files through the existing fetch/normalize path |
| `src/js/router.js` | Added five progress routes, their builders and parsing, with fallback to the dashboard |
| `src/js/app.js` | Syllabus loading, progress route handlers, progress rendering, drill-down click handling |
| `src/index.html` | Registered `progress.css` and the six progress component scripts |

No existing line of behaviour was replaced; all four files were extended.

---

## 5. Files deliberately unchanged

- `src/js/progress-engine.js` — the calculation authority.
- `src/js/storage.js` — the completion authority.
- `src/js/planner-engine.js` — plan generation.
- `data/schedule/daily/*.json` (28 files) — verified untouched, see section 15.
- `data/syllabus/*.json` (5 files) — verified untouched.
- `data/progress/progress.json` — derived cache, regenerated at runtime.
- `reference/**` — reference material, never edited.
- All Phase 3 and Phase 4 calendar/tracker components and tests.

---

## 6. Architecture and layer boundaries

```text
data/syllabus/*.json
        ↓  data-engine.loadCoursesFromUrls()
data/schedule/daily/*.json  →  cycle facts (dates, weeks)
        ↓  progress-engine (existing, unmodified)
   progress nodes + completions
        ↓  app.js (routing and composition only)
progress components (presentation only)
```

Rules enforced by this phase:

1. **No calculation in components.** A component renders `completed`/`total` and
   `percent` exactly as the engine supplied them. Tests assert the rendered value
   is character-for-character the engine value.
2. **No direct storage access in components.** Completions arrive as input.
3. **No progress writes from the dashboard.** Task completion stays in the
   tracker, so there is one place where completion state can change.
4. **Presentation components fail loudly, not silently.** If a node is missing,
   the component returns `null` and the route renders a visible error state
   instead of an empty page.

---

## 7. Data flow

Per render:

1. `app.js` asks the router for the current route.
2. Cycle facts (day/week grid, plan paths) are already held in app state.
3. `progress-engine` is called with the courses, the current completions from
   `storage.js`, and the cycle start date.
4. The engine returns the node for the requested scope (overall, subject, week,
   day) including child rows.
5. `app.js` builds a view model with the component, renders HTML into the root
   element and attaches navigation metadata.

Because step 3 runs on every navigation and every re-render, completing a task in
the tracker is reflected the next time a progress view is opened. Nothing is
cached between renders.

---

## 8. Routes and navigation

| Route | Screen |
| --- | --- |
| `#/progress` | Overall dashboard |
| `#/progress/subject/:subjectId` | One subject, its four weeks |
| `#/progress/subject/:subjectId/week/:weekNumber` | One subject in one week |
| `#/progress/week/:weekNumber` | One week, all subjects |
| `#/progress/day/:date` | One day, all subjects |

Route builders (`routeForProgress*`) and the parser round-trip, so a deep link
survives a refresh. An unrecognised progress hash falls back to the dashboard;
non-progress routes are untouched by the fallback.

Navigation model:

- Breadcrumb on every level: `Calendar › Progress › [Subject ›] [Week ›] [Day]`.
- A back button below the breadcrumb returns to the parent scope. The dashboard
  itself has no parent inside the drill-down, so it has no back button.
- Row clicks drill down; the day view is the deepest progress level and links to
  the tracker for the full task UI.

---

## 9. Behaviour details

- **Subject order** is the canonical order from `data-engine.js`
  (Mathematics I, Statistics I, CT, English I). It is never alphabetical and
  never re-sorted by progress; a test asserts this explicitly.
- **Week order** is numeric (week 2 before week 10), never lexicographic.
- **Subject-scoped week rows** show only that subject's tasks for the day, and
  their totals sum exactly to the subject week total. Verified live: Mathematics
  Week 1 → `8 + 6 + 4 + 6 + 3 + 2 + 1 = 30`. All-subject Week 1 →
  `19 + 13 + 13 + 17 + 15 + 6 + 4 = 87`.
- **Empty scopes** render as a labelled "no tasks in this scope" state, never as
  `0 / 0`, which would read as a real zero.
- **Missing plans** (dates past the cycle) render a visible notice, not an empty
  dashboard.
- **Task rows** show completion state and type from the plan; non-academic rows
  (break/fixed blocks) stay visible but are excluded from the task count, matching
  the tracker's own rules.

---

## 10. Error and empty states

| Situation | Result |
| --- | --- |
| Unknown subject in a URL | Visible error state; other links keep working |
| Date outside the cycle | "No plan for this date" notice |
| Invalid date string | Reported as invalid, not rendered as empty |
| Syllabus fetch failure | Controlled error message, no uncaught exception |
| Missing engine node | Component returns `null`; route renders an error state |

All five are covered by automated tests, including a test that asserts a failing
syllabus load does not throw out of `app.js`.

---

## 11. Accessibility and semantics

- Each drill-down row is a real `<button>` inside a `<li>` (with an `aria-label`
  naming the subject, week or day), so it is reachable by keyboard and announced
  as a control rather than a clickable `<div>`.
- Headline progress bars (overall, subject, week summaries) use
  `role="progressbar"` with `aria-valuenow`, `aria-valuemin` and `aria-valuemax`.
  The small bars inside list rows are `aria-hidden="true"` because the same
  percentage is already written as text next to them, so repeating it for screen
  readers would be noise.
- Breadcrumb is a `<nav aria-label="Breadcrumb">` containing an ordered list with
  `aria-current="page"` on the active crumb.
- Current percentage is always written as text, so nothing depends on a bar alone.
- Decorative separators and glyphs are `aria-hidden`.

---

## 12. Responsive behaviour

`progress.css` uses the existing project layout conventions and collapses to a
single column on narrow screens. Verified in a real browser at a 390 px viewport
(dpr 3): overall dashboard, subject-week page, day page, Daily Tracker and
calendar all reported `scrollWidth === innerWidth` with zero overflowing
elements. Evidence: `reports/phase5-dashboard-mobile.png`.

---

## 13. Testing

Command: `node --test` (Node's built-in runner, no framework, no new
dependencies).

| Test file | Passing |
| --- | --- |
| `tests/data/progress-validation.test.js` | 4 |
| `tests/data/schedule-validation.test.js` | 6 |
| `tests/data/syllabus-validation.test.js` | 18 |
| `tests/engine/data-engine.test.js` | 18 |
| `tests/engine/export-engine.test.js` | 1 |
| `tests/engine/planner-engine.test.js` | 21 |
| `tests/engine/progress-engine.test.js` | 15 |
| `tests/engine/report-model.test.js` | 1 |
| `tests/engine/storage.test.js` | 14 |
| `tests/renderer/app.test.js` | 15 |
| `tests/renderer/calendar.test.js` | 21 |
| `tests/renderer/progress.test.js` | 38 |
| `tests/renderer/tracker.test.js` | 21 |
| **Total** | **193 passing, 0 failing** |

Phase 5 contributed 38 tests in `tests/renderer/progress.test.js`, grouped by
concern:

- **Routing (3)** — parsing, round-tripping, unknown-hash fallback.
- **Values (4)** — engine figures rendered verbatim, bar width equals the
  percentage, empty scope is 0% and never `NaN`/`Infinity`, missing node refused.
- **Ordering and scope (3)** — canonical subject order preserved, week ordering
  numeric, subject-week rows summing exactly to the subject week total.
- **Tasks (2)** — non-academic tasks visible but excluded from counts, `taskId`
  identity preserved through the view model.
- **Navigation (5)** — deep links reopening after refresh, the full drill-down
  walk, back button and breadcrumb at every level including day → week →
  progress, header entry point.
- **Live data (2)** — tracker completion reaching the dashboard with no stale
  value, one task moving day/week/subject/overall consistently.
- **Failures (5)** — missing plan, invalid date, unknown scopes, syllabus load
  failure, unknown subject inside a subject-week link.

---

## 14. Manual validation performed

Served over a local static HTTP server and driven in a real browser:

1. `#/progress` — dashboard renders 413 tasks, 0% on a clean profile.
2. Subject drill-down → week drill-down → day drill-down, all figures matching
   the engine.
3. Deep links pasted directly into the address bar, including a subject-week link.
4. Back navigation verified in the browser: Day 1 (`Back to Week 1`) → Week 1
   (`Back to Progress`) → Progress (no back button) → Calendar.
5. Task completion in the tracker, then reopening the dashboard — the percentage
   updated immediately.
6. Unchecking a task — the dashboard returned to its previous value.
7. Page refresh on a deep progress link — the same level reopened.
8. Responsive check at 390 px across five views — no horizontal overflow.
9. Console inspected throughout: no JavaScript errors. The only network noise was
   expected 404s for dates outside the cycle and for the missing favicon.

Screenshots: `reports/phase5-dashboard.png`,
`reports/phase5-dashboard-mobile.png`.

---

## 15. Data integrity verification

- All 34 files under `data/` retain their original modification timestamp
  (2026-10-04 21:39), which predates all Phase 5 edits (which begin 2026-10-05
  00:24). No plan, syllabus or progress JSON was modified.
- The modification order confirms Phase 5 touched only `data-engine.js`,
  `router.js`, `app.js`, `index.html`, the six new components, `progress.css` and
  the new test file.
- Totals cross-check: subject totals 166 + 88 + 101 + 58 = 413; week totals
  87 + 114 + 101 + 111 = 413. Both match the overall figure reported by the
  engine.
- Cycle dates confirmed from the plan files themselves: 2026-10-02 through
  2026-10-29, Week 1 = 2026-10-02 … 2026-10-08, four weeks of seven days.
- No editor sentinels, placeholder markers or conflict markers remain in `src/`
  or `tests/`; the only matches for such words are ordinary prose in existing
  comments and test names.
- The project is not under version control, so the timestamp audit stands in for
  a diff.

---

## 16. Assumptions and deviations

1. **Phase 5 is read-only at task level.** The specification requires the
   dashboard to drill down to task granularity and to use the same data as the
   tracker; it does not require ticking tasks off inside the dashboard.
   Duplicating the checkbox would create two writers for one fact, so task rows
   link to the Daily Tracker. Recorded in `docs/implementation-checklist.md` and
   `docs/agent-context.md`.
2. **Drill-down uses single clicks.** The calendar's Phase 4 double-click
   drill-down is unchanged. Progress rows are ordinary buttons, which are
   keyboard-reachable and need no hidden gesture.
3. **No category breakdown.** `progress.json` has no category dimension, so a
   category view would require inventing a data model. Left as an explicit open
   item rather than approximated.
4. **Day-to-week navigation is hierarchical.** A day page's parent is the week
   containing it, which is why the day route receives the plan's week number.

---

## 17. Known limitations and follow-ups

- Overall and week scopes read all cycle plans, so their first paint depends on
  loading 28 daily JSON files. Fine for static hosting; a generated aggregate JSON
  could replace it if load time becomes a concern.
- The day drill-down is whole-day only. A subject-scoped day view would need a
  route such as `#/progress/subject/:subjectId/day/:date`; the subject-week scope
  already provides a narrowed equivalent.
- No printing or export from the progress views — that is Phase 6's report model.
- Week-over-week pace comparisons are not computed; nothing in the specification
  asks for them.

---

## 18. Conclusion and acceptance

| Acceptance criterion | Result |
| --- | --- |
| Overall, subject, week, day and task levels visible | Met |
| Every level reachable by URL and survives refresh | Met |
| Progress values computed only by `progress-engine.js` | Met |
| Completions read only through `storage.js` | Met |
| Canonical subject order preserved | Met |
| Automatic recalculation, never stale | Met |
| Empty, missing-plan and error states handled visibly | Met |
| Keyboard and screen-reader semantics | Met |
| Responsive at 390 px | Met |
| No regression in earlier phases | Met — 193/193 tests pass |
| No source data modified | Met |

**Phase 5 is complete.** The next step is Phase 6: the report model and
self-contained HTML export for the day, week, subject and overall scopes, built on
the same progress nodes this phase now displays.

---