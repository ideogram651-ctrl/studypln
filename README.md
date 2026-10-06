# Study-Planner

> **Current project documentation — October 2026**
>
> This README describes the current Study-Planner architecture and intended product behavior. It supersedes the older high-level README.
>
> Practical sections — **local development**, **routing**, **production deployment**, **persistence limitations**, and **current status** — are documented in sections 29–33 at the end.

## 1. What is Study-Planner?

Study-Planner is a browser-first personal study planning, daily tracking, and progress analytics application for an IIT Madras BS Data Science study workflow.

The application is designed around four subjects:

- Mathematics I
- Statistics I
- Computational Thinking
- English I

The exact course content comes from the supplied syllabus JSON/reference data. The application must never invent missing syllabus items.

The product is not just a calendar and not just a checklist. It is a connected system:

```text
Syllabus
   ↓
Planning
   ↓
28 Daily Schedule JSONs
   ↓
Calendar
   ↓
Daily Tracker
   ↓
Task Completion
   ↓
Progress Engine
   ↓
Overall / Week / Subject / Day / Task
   ↓
Report Model
   ↓
Standalone HTML Reports
```

---

# 2. Current project state

The repository currently contains:

- `assets/` — supplied logo, navigation SVGs, and favicon assets
- `data/` — canonical syllabus, calendar, schedule, and progress-schema JSON
- `docs/` — architecture and implementation documentation
- `netlify.toml` — static-hosting configuration (publish root + root redirect; section 31)
- `reference/` — visual and behavioral references (not production code)
- `src/` — production application code (entry point `src/index.html`)
- `tests/` — data/engine/renderer validation
- `reports/` — phase QA and update documentation (plus a few evidence screenshots)
- `tools/` — Node scripts that generated the canonical calendar/syllabus/schedule data
- `generated/` — reserved output folder (currently only `.gitkeep`)
- root-level project instructions and manifests (`CLAUDE.md`, `PROJECT_SPECIFICATION.md`, `TRACKING_STORAGE_MANIFEST.json`)

`.claude/` and `.cortex/` are machine-local agent/tooling state; they are listed in `.gitignore` and are **not** project content.

The current 28-day study cycle is:

```text
2026-10-02 → 2026-10-29
```

There are exactly 28 date-specific schedule JSON files:

```text
data/schedule/daily/
├── 2026-10-02.json
├── ...
└── 2026-10-29.json
```

These files represent date-specific planning/state containers. They are not 28 permanent HTML pages.

---

# 3. Core architectural principle

## JSON/data is the source of truth.

The UI is a renderer.

Progress is derived from actual persisted task state.

This means:

1. Course content must not be hard-coded into UI components.
2. Daily planning data must live in the schedule layer.
3. Completion state must be persisted.
4. Progress percentages must be calculated from task state.
5. Progress UI must never become a manually maintained second database.
6. The same underlying data must drive the daily tracker, progress drill-down, and reports.

---

# 4. Data ownership

The project has three important data domains.

## `data/syllabus/`

Answers:

> What exists in the course?

Contains the canonical course/syllabus information.

Files currently include:

```text
computational-thinking.json
english.json
mathematics-i.json
statistics.json
course-template.json
README.md
```

The syllabus layer is the canonical definition of course content.

---

## `data/schedule/`

Answers:

> When is this content planned?

The current project stores date-wise plans under:

```text
data/schedule/daily/
```

with one JSON file per date from October 2 through October 29, 2026.

A daily JSON may contain:

- date
- day number
- week number
- schedule blocks
- study tasks
- task IDs
- syllabus references
- task type
- completion state
- completion timestamp
- daily completion summary
- metadata/notes

The exact schema is documented in:

```text
docs/daily-json-schema.md
```

---

## `data/progress/`

Answers:

> How much has actually been completed?

The primary aggregate file is:

```text
data/progress/progress.json
```

Progress is an aggregate/cache representation derived from task completion.

It must not become a duplicate copy of the syllabus.

If aggregate progress becomes inconsistent, it should be possible to rebuild it from the underlying task/schedule/syllabus state.

---

# 5. The calendar is the main entry point

The application opens on the calendar.

The calendar reference is:

```text
reference/calendar/august_2026_soft_calendar_dark_fixed.html
```

The production calendar should preserve the relevant visual and interaction concepts from that reference without treating the reference HTML as production code.

Expected behavior:

### Single click

Selecting a date changes the active/selected date.

### Double click

Double-clicking a date opens the daily tracker for that date.

### Month / Week

The calendar supports monthly and weekly views.

The weekly interaction should retain the reference's smooth horizontal date-wheel behavior where practical.

The monthly view should retain the selected-date visual behavior.

The exact implementation may differ internally, but the user-facing interaction should feel consistent with the reference.

---

# 6. Daily tracker

The daily tracker reference is:

```text
reference/daily-tracker/
└── Day_1_Study_Tracker_2_October_2026.html
```

The reference establishes the intended visual language and daily study experience.

The production tracker must be generated dynamically.

There must NOT be a manually authored HTML file for every date.

Runtime flow:

```text
Calendar date
    ↓
YYYY-MM-DD
    ↓
data/schedule/daily/YYYY-MM-DD.json
    +
data/syllabus/*.json
    +
persisted completion state
    ↓
Daily View Model
    ↓
Renderer
    ↓
Daily Tracker UI
```

When the user leaves the daily tracker, the view may be destroyed.

When reopened, it should be regenerated from persisted data.

This prevents the UI from becoming a second source of truth.

---

# 7. Daily tracker responsibilities

The daily tracker should show, where applicable:

- Date
- Day number
- Week number
- Overall daily progress
- Study blocks
- Subject
- Task title
- Task type
- Time/duration when available
- Completion checkbox/status
- Break/fixed/personal blocks
- Category grouping
- Daily summary

The tracker should feel like the supplied Day 1 reference while remaining data-driven.

The exact schedule must come from the date JSON and syllabus data. Do not fabricate study allocations.

---

# 8. Task identity

Every persistent study task needs a stable unique `taskId`.

Never use:

- array index
- visual position
- title text alone
- DOM ID generated from array position

as the persistent identity.

The actual persistent task ID scheme is:

```text
<subjectId>:<weekNumber>:<sourceSyllabusId>

mathematics-i:4:L4.1
statistics-i:1:Week 1 Tutorial 3 - Spreadsheet formulae
```

The important property is:

> The same logical task must keep the same identity across renders.

---

# 9. Task types

The application may use semantic task types such as:

```text
lecture
activity
practice
graded
break
free
revision
review
fixed
```

Task type determines presentation/category behavior.

It does not replace the task's underlying identity.

Examples:

```text
lecture  → lecture/learning presentation
activity → activity presentation
practice → practice presentation
graded   → graded-assignment presentation
break    → break/glass presentation
free     → muted/free-time presentation
revision → revision presentation
review   → review presentation
fixed    → fixed/personal block presentation
```

The renderer must never infer a task's meaning merely from its label or array position.

---

# 10. Planning model

The planner maps canonical syllabus items into the date-wise schedule.

Important rules:

- Preserve syllabus chronological order.
- Keep an atomic lecture with its immediately associated non-graded activity where possible.
- Do not split an atomic lecture just to force a mathematical percentage.
- Days 1–5 are normal learning/content days.
- Target approximately 20% of the normal learning workload per day across Days 1–5.
- Day 6 is reserved for practice assignments.
- Day 7 is reserved for graded assignments.
- Graded assignments must not silently be mixed into normal Days 1–5.
- Fixed daily blocks are separate from course-content planning.
- Identical source inputs must produce deterministic plans.

Full rules remain documented in:

```text
docs/planning-rules.md
```

---

# 11. Progress system

Progress is not decorative.

A checkbox changing from incomplete to complete is a data change.

The conceptual flow is:

```text
Task
 ↓
Day
 ↓
Week
 ↓
Subject
 ↓
Overall
```

The application should be able to answer:

- How much of today is complete?
- How much of Week 1 is complete?
- How much of Mathematics I is complete?
- How much of all four subjects is complete?
- Which tasks are incomplete?
- Which categories are complete?
- When was a task completed?

Percentages must be calculated from actual task state.

---

# 12. Progress dashboard

The progress visual reference is:

```text
reference/progress/progress-reference.html
```

This reference exists specifically to communicate the desired progress UX.

It is a visual/interaction reference, not production data.

The progress dashboard should provide a hierarchy similar to:

```text
PROGRESS
│
├── Overall
│   ├── Week 1
│   ├── Week 2
│   ├── Week 3
│   └── Week 4
│
├── Subjects
│   ├── Mathematics I
│   ├── Statistics I
│   ├── Computational Thinking
│   └── English I
│
└── Deeper detail
    └── Week
        └── Day
            └── Task
```

The reference specifically demonstrates:

1. Overall progress
2. Four week cards
3. Four subject entries
4. Week-level detail
5. Subject-level detail
6. Subject Week 1–4 accordion
7. Category/task-group breakdown
8. Deeper drill-down

Mock numbers in the reference are UI-only and must never become production progress values.

---

# 13. Overall progress

The top-level progress area should communicate the combined state of all four subjects.

It should be possible to see:

- Overall percentage
- Total tasks/content count where applicable
- Completed count
- Remaining count
- Subject distribution
- Week distribution

The overall percentage must be calculated from the underlying task model.

---

# 14. Week progress

The project has four logical weeks:

```text
Week 1
Week 2
Week 3
Week 4
```

A week-level view should show:

- week percentage
- subject breakdown
- completed/total values
- deeper navigation

Example hierarchy:

```text
Week 1
├── Mathematics I
├── Statistics I
├── Computational Thinking
└── English I
```

The date itself is not the identity of aggregate progress.

Date belongs to the day layer.

Week and subject are aggregate scopes.

---

# 15. Subject progress

Each subject has its own aggregate progress.

Subjects:

```text
Mathematics I
Statistics I
Computational Thinking
English I
```

A subject detail view should show:

```text
Subject
 ├── Overall
 ├── Week 1
 ├── Week 2
 ├── Week 3
 └── Week 4
```

Each week can expand to reveal category/task-group information.

Possible categories include:

```text
Lectures / learning content
Normal activities/assignments
Practice
Graded
Revision
Review
```

Only categories supported by actual task data should be displayed.

---

# 16. Deep progress drill-down

A deep progress view must expose real underlying information.

It may show:

- Day groups
- Tasks
- Task type
- Completion state
- Completion timestamp
- Planned date
- Week
- Subject
- Source syllabus ID
- Category totals
- Category completed counts
- Scope percentage

Example:

```text
MATHEMATICS I
WEEK 1
82%

DAY 1
✓ Lecture 1
✓ Activity 1

DAY 2
✓ Lecture 2
○ Activity 2
```

This view must be generated from:

```text
syllabus + schedule + persisted task state
```

There must not be a manually duplicated “deep syllabus” dataset.

---

# 17. Persistence

All persistence should pass through:

```text
src/js/storage.js
```

UI components must not scatter direct `localStorage` calls throughout the application.

At minimum, completion persistence needs:

```text
taskId
completed
completedAt
```

plus any explicitly supported user-editable fields.

After refresh:

- checked tasks remain checked
- progress remains correct
- the same task IDs remain stable

---

# 18. Progress recalculation

When a task changes:

```text
User checks task
      ↓
Persist task state
      ↓
Recalculate affected day
      ↓
Recalculate affected week
      ↓
Recalculate affected subject
      ↓
Recalculate overall
      ↓
Persist/update progress aggregate
      ↓
Refresh visible progress UI
```

The progress engine should be responsible for calculation.

The renderer should be responsible for presentation.

The exporter should be responsible for report generation.

These concerns must remain separated.

---

# 19. Reports

The project supports four report scopes:

```text
reports/
├── daily/
├── weekly/
├── subjects/
└── overall/
```

Examples:

```text
reports/daily/2026-10-04.html
reports/weekly/Mathematics-Week-1.html
reports/subjects/Mathematics-I-Progress.html
reports/overall/IITM-Overall-Progress.html
```

The report system should use a shared report model.

---

# 20. HTML export

HTML is the primary export target.

An exported report must be:

- standalone
- directly openable in a browser
- independent from the application runtime
- based on serialized report data
- interactive where practical
- capable of hierarchy expansion/collapse
- readable without external application state

Export must be read-only with respect to progress.

The exporter must never silently mutate task completion or progress data.

---

# 21. PDF

PDF is optional/future work.

Do not add PDF dependencies merely to satisfy the current product.

Architecture should allow:

```text
Report Model
   ├── HTML Export
   └── Future PDF Export
```

---

# 22. PWA

The app is browser-first. `src/manifest.json` and `src/service-worker.js`
exist only as **0-byte placeholder stubs** (flagged in the P1 production-path
audit, R-10): they are not referenced by `index.html`, no service worker is
registered, and they have no effect on the running application. A real PWA
layer is future work and is not part of the current release.

The PWA layer must not force:

- Electron
- Tauri
- a backend
- a database

The application should remain usable as a normal browser application.

---

# 23. Reference policy

The `reference/` directory contains examples.

Current references:

```text
reference/
├── calendar/
│   └── august_2026_soft_calendar_dark_fixed.html
├── daily-tracker/
│   └── Day_1_Study_Tracker_2_October_2026.html
├── progress/
│   └── progress-reference.html
└── syllabus/
    ├── CT — IITM CourseXtract ...
    ├── English I — IITM CourseXtract ...
    ├── Mathematics I — IITM CourseXtract ...
    └── Statistics I — IITM CourseXtract ...
```

Before implementing a related feature, the agent must inspect the relevant reference.

References are not production source code.

Do not silently modify them.

Do not copy accidental implementation limitations.

Extract:

- visual language
- interaction behavior
- information hierarchy
- useful component ideas

Then implement those requirements cleanly in production architecture.

---

# 24. Existing source modules

Production source is currently organized as:

```text
src/
├── components/
│   ├── calendar/
│   ├── progress/
│   ├── reports/
│   ├── tasks/
│   └── tracker/
├── css/
└── js/
```

Important engines:

```text
data-engine.js
planner-engine.js
progress-engine.js
export-engine.js
report-model.js
storage.js
router.js
renderer.js
calendar.js
app.js
```

The preferred responsibility boundaries are:

- `data-engine.js` — load/normalize source data
- `planner-engine.js` — planning logic
- `progress-engine.js` — progress calculation
- `storage.js` — persistence abstraction
- `report-model.js` — normalized report representation
- `export-engine.js` — standalone HTML export
- `renderer.js` — shared rendering coordination
- `router.js` — application view/navigation state
- `calendar.js` — calendar coordination
- `app.js` — application bootstrap/orchestration

---

# 25. Testing

Tests are divided into:

```text
tests/
├── data/
├── engine/
└── renderer/
```

Core expectations:

- syllabus validation
- schedule validation
- progress validation
- planner engine tests
- progress engine tests
- report model tests
- export engine tests
- calendar rendering tests
- tracker rendering tests
- progress rendering tests

Do not declare a feature complete merely because it renders.

Validate its data flow and state behavior.

---

# 26. Definition of done

The project should eventually satisfy all of the following:

### Calendar

- Calendar opens as the main view.
- Month/week behavior works.
- Single-click selection works.
- Double-click opens the selected date's tracker.
- Selected-date visual behavior is preserved.

### Daily tracker

- Correct date JSON loads.
- Syllabus references resolve correctly.
- Tasks render dynamically.
- Completion state persists.
- Refresh preserves completion.

### Planning

- Syllabus order is preserved.
- Planning rules are deterministic.
- Day 6 practice behavior is respected.
- Day 7 graded behavior is respected.
- Fixed blocks remain separate from course planning.

### Progress

- Progress derives from task state.
- Overall progress works.
- Week progress works.
- Subject progress works.
- Day progress works.
- Task drill-down works.
- Four subjects and four weeks are represented.
- Progress updates after completion changes.

### Reports

- Daily report works.
- Weekly report works.
- Subject report works.
- Overall report works.
- Exported HTML is standalone and interactive.

### Architecture

- No duplicated syllabus dataset.
- Stable task IDs.
- Storage abstraction.
- Planning separated from rendering.
- Progress separated from export.
- References remain untouched.
- Tests cover core behavior.

---

# 27. Non-goals

Unless explicitly added later, do not introduce:

- backend services
- cloud database
- authentication
- unnecessary frameworks
- Electron/Tauri desktop packaging
- API-dependent AI features
- a permanent HTML file for every study day
- manually maintained progress percentages
- duplicated syllabus data inside UI code

---

# 28. Agent rule

When working on this repository:

> **Read first. Inspect references second. Understand data flow third. Implement fourth. Test fifth.**

Do not begin by rewriting the architecture from scratch.

Do not replace working modules merely because a different architecture is personally preferred.

Make changes consistent with this document and the existing `docs/` files unless a deliberate architectural decision is documented.

---

# 29. Local development

The application is a no-build static site. Serve the **repository root** with
any static HTTP server and open the app under `/src/`:

```text
cd E:\Study-Planner
python -m http.server 8099
```

Then browse to:

```text
http://localhost:8099/src/
```

A local HTTP server is required because the app loads its JSON data (daily
plans, syllabus, canonical calendar) through browser `fetch()` requests — the
`file://` protocol blocks fetching local JSON files.

Tests (Node, no dependencies):

```text
node --test
```

---

# 30. Routing

The application uses **hash-based routing**:

```text
#/calendar
#/day/YYYY-MM-DD
#/progress
#/progress/week/N
#/reports
#/reports/overall
#/reports/week/N
#/reports/day/YYYY-MM-DD
...
```

The hash never reaches the server, so static hosting needs **no server-side
route rewrites**: a deep link such as `/src/#/reports/day/2026-10-02` is served
by the same `src/index.html`, and refreshing it reopens the same view.

---

# 31. Production deployment

The production structure approved in the P1 production-path audit:

- The **repository root is the publish directory** — `src/`, `data/`, and
  `assets/` are siblings, and the app's runtime paths are relative
  (`css/`, `js/`, `../data/`, `../assets/`), so publishing the root keeps every
  path intact. Publishing `src/` alone would break `../data/` and `../assets/`.
- `netlify.toml` declares this:

  ```toml
  [build]
    publish = "."

  [[redirects]]
    from = "/"
    to = "/src/"
    status = 302
  ```

  The root redirect is a *redirect* (not a rewrite) so the browser URL becomes
  `/src/` and the app's relative paths resolve correctly; the `#hash` fragment
  is preserved across it.
- `src/index.html` remains the application entry point.
- Deployment is **static hosting only** (Netlify or any static file host). No
  backend, database, build step, or server-side runtime is required.

The project is **not yet deployed** and no live URL exists; connecting a GitHub
repository to Netlify is a future phase.

---

# 32. Persistence limitations

Task completion state, notes, and calendar events are persisted in the
browser's `localStorage` under the versioned key `study-planner:state`
(through `src/js/storage.js`).

This is **browser-local persistence**:

- it belongs to the specific browser + device profile where it was written
- it is **not** automatically shared, synced, or backed up across devices or users
- clearing site data, or opening the app in another browser/device, starts from
  an empty completion state
- canonical syllabus/calendar/schedule JSON is read-only at runtime and never
  written by the app

---

# 33. Current status

- **Implemented and complete:** the full planned product loop — Calendar
  (monthly/weekly, date wheel, notes/events), Daily Tracker, Progress
  Dashboard with drill-down (Overall → Weeks → Subjects → Days → Tasks),
  Reports (Overall / Subject / Weekly / Weekly Timetable Chart / Daily), and
  standalone HTML exports. Development phases U0–U6 are closed with passing
  QA documentation in `reports/`.
- **Release preparation:** the P1 production-path audit and the P1.1
  progress-bar fix + release-hygiene pass are complete (`reports/release-p1*`).
  The project is technically ready to be placed on GitHub and connected to
  Netlify without changing application paths or behavior.
- **Not done yet (future phases):** GitHub repository setup, Netlify
  deployment, and any optional PWA work.
- **Verification baseline:** the automated suite (`node --test`) covers data
  validation, engines, and rendering; it passes in full on every release
  phase to date.
