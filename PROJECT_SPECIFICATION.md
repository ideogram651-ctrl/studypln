# Study-Planner — Project Specification v2

> **Status:** Current product specification  
> **Cycle:** 2026-10-02 → 2026-10-29  
> **Primary audience:** Cline/Claude/Coding Agents + project owner  
> **Purpose:** Complete source-of-truth specification for the current Study-Planner product direction.

---

# 1. Product definition

Study-Planner is a browser-first personal study planning and progress management application for an IIT Madras BS Data Science workflow.

The product combines:

1. Calendar navigation
2. Date-based study planning
3. Dynamic daily tracking
4. Course syllabus data
5. Persistent task completion
6. Real progress calculation
7. Overall/weekly/subject/day/task drill-down
8. Interactive progress dashboard
9. Standalone HTML reports
10. PWA-ready browser architecture

Four subjects are currently in scope:

- Mathematics I
- Statistics I
- Computational Thinking
- English I

The canonical course content must come from the supplied syllabus JSON/reference data.

**Never invent syllabus content that is not present in source data.**

---

# 2. Current 28-day cycle

The current study cycle is exactly:

```text
2026-10-02
through
2026-10-29
```

There are exactly 28 date-specific JSON containers:

```text
data/schedule/daily/
2026-10-02.json
...
2026-10-29.json
```

Important distinction:

> There are 28 daily JSON files, but there must not be 28 manually authored HTML tracker pages.

The daily tracker is generated at runtime from the relevant JSON + syllabus + persisted state.

---

# 3. Product architecture

The intended architecture is:

```text
┌──────────────────────┐
│  Syllabus JSON       │
│  What exists         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Planner Engine      │
│  What happens when   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Daily Schedule JSON  │
│ 28 date containers   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Calendar             │
│ Select / open date   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Daily Tracker        │
│ Runtime-rendered     │
└──────────┬───────────┘
           │
           │ task completion
           ▼
┌──────────────────────┐
│ Storage              │
│ Persist task state   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Progress Engine      │
│ Task → Day → Week    │
│ → Subject → Overall  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Progress Dashboard   │
│ Overview / drilldown │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Report Model         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ HTML Export Engine   │
└──────────────────────┘
```

---

# 4. Repository structure

The current repository is organized as:

```text
Study-Planner/
├─ .claude/
│  └─ settings.json
├─ .cortex/
│  ├─ .hooks/
│  ├─ episodes/
│  ├─ config.json
│  ├─ decisions.md
│  └─ working.md
├─ data/
│  ├─ progress/
│  │  ├─ progress.json
│  │  └─ README.md
│  ├─ schedule/
│  │  └─ daily/
│  │     ├─ 2026-10-02.json
│  │     ├─ ...
│  │     └─ 2026-10-29.json
│  └─ syllabus/
│     ├─ computational-thinking.json
│     ├─ course-template.json
│     ├─ english.json
│     ├─ mathematics-i.json
│     ├─ README.md
│     └─ statistics.json
├─ docs/
│  ├─ agent-context.md
│  ├─ architecture.md
│  ├─ daily-json-schema.md
│  ├─ export-system.md
│  ├─ implementation-checklist.md
│  ├─ json-schema.md
│  ├─ planning-rules.md
│  ├─ progress-json-schema.md
│  ├─ progress-system.md
│  └─ tracking-architecture.md
├─ generated/
│  └─ .gitkeep
├─ reference/
│  ├─ calendar/
│  │  └─ august_2026_soft_calendar_dark_fixed.html
│  ├─ daily-tracker/
│  │  └─ Day_1_Study_Tracker_2_October_2026.html
│  ├─ progress/
│  │  └─ progress-reference.html
│  └─ syllabus/
│     ├─ CT — IITM CourseXtract (...).html
│     ├─ English I — IITM CourseXtract (...).html
│     ├─ Mathematics I — IITM CourseXtract (...).html
│     └─ Statistics I — IITM CourseXtract (...).html
├─ reports/
│  ├─ daily/
│  ├─ overall/
│  ├─ subjects/
│  └─ weekly/
├─ src/
│  ├─ components/
│  │  ├─ calendar/
│  │  ├─ progress/
│  │  ├─ reports/
│  │  ├─ tasks/
│  │  └─ tracker/
│  ├─ css/
│  │  ├─ base.css
│  │  ├─ calendar.css
│  │  ├─ components.css
│  │  ├─ progress.css
│  │  ├─ reports.css
│  │  └─ tracker.css
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ calendar.js
│  │  ├─ data-engine.js
│  │  ├─ export-engine.js
│  │  ├─ planner-engine.js
│  │  ├─ progress-engine.js
│  │  ├─ renderer.js
│  │  ├─ report-model.js
│  │  ├─ router.js
│  │  └─ storage.js
│  ├─ index.html
│  ├─ manifest.json
│  └─ service-worker.js
├─ tests/
│  ├─ data/
│  ├─ engine/
│  └─ renderer/
├─ .gitignore
├─ CLAUDE.md
├─ PROJECT_SPECIFICATION.md
├─ README.md
└─ TRACKING_STORAGE_MANIFEST.json
```

This structure is already intentional. Agents should extend it rather than casually replacing it.

---

# 5. Source-of-truth rules

## 5.1 Syllabus is canonical course content

`data/syllabus/` answers:

> What exists?

The UI must not maintain another manually edited copy of course items.

## 5.2 Schedule is date planning

`data/schedule/daily/` answers:

> What is planned for this date?

The date JSON may reference canonical syllabus items by stable IDs.

## 5.3 Progress is derived state

`data/progress/progress.json` answers:

> What is completed and what is the aggregate progress?

It is not a second syllabus.

## 5.4 UI is presentation

HTML/CSS/JS should render data.

Do not make the UI the database.

---

# 6. Calendar requirements

The calendar is the application's main entry point.

Reference:

```text
reference/calendar/august_2026_soft_calendar_dark_fixed.html
```

Required interaction model:

### Single click

Select a date.

The selected-date circle/highlight moves to that date.

### Double click

Open that date's daily tracker.

### Week view

Preserve the reference's horizontal date-wheel concept and smooth selection/scroll behavior where practical.

### Month view

Preserve the reference's calendar grid and selected-date behavior.

### Navigation

The calendar must remain usable on desktop and responsive layouts.

Do not copy the reference's implementation blindly.

Extract the behavior and visual intent.

---

# 7. Progress entry point

The main calendar UI should expose a clear Progress control/button.

Conceptually:

```text
Calendar
   ↓
Progress Button
   ↓
Progress Dashboard
```

The Progress control is a first-class application navigation point.

---

# 8. Daily tracker requirements

Reference:

```text
reference/daily-tracker/Day_1_Study_Tracker_2_October_2026.html
```

The production tracker must be generated dynamically.

Runtime:

```text
Selected date
    ↓
Daily JSON
    +
Syllabus JSON
    +
Persisted task state
    ↓
Daily View Model
    ↓
Tracker renderer
```

The daily tracker must support completion interaction.

When the user checks a task:

```text
UI event
  ↓
storage update
  ↓
progress recalculation
  ↓
visible progress update
```

The daily view must not contain hard-coded course content.

---

# 9. Daily JSON responsibilities

Each date JSON should represent the state/planning container for that date.

At minimum, it should be able to represent:

```json
{
  "date": "2026-10-04",
  "dayNumber": 3,
  "weekNumber": 1,
  "schedule": [],
  "tasks": [],
  "completion": {
    "totalTasks": 0,
    "completedTasks": 0,
    "percent": 0
  }
}
```

The exact production schema is governed by:

```text
docs/daily-json-schema.md
```

The important rule is that task completion is persistent and tied to stable task IDs.

---

# 10. Task model

Every study task must have a stable unique identity.

Recommended conceptual fields:

```text
taskId
subjectId
courseId
weekNumber
syllabusItemId
type
title
planned
completed
completedAt
```

Stable identity is more important than the exact textual ID format.

Never use array indexes as persistent identity.

---

# 11. Task categories

Supported semantic categories include:

```text
lecture
activity
practice
graded
revision
review
break
free
fixed
```

The system can add a new category only when there is a real product requirement.

Task categories should drive:

- grouping
- labels
- icons
- progress categories
- report breakdowns

They should not become a replacement for stable task identity.

---

# 12. Planning rules

The planner must follow the documented scheduling policy.

Normal learning days:

```text
Day 1–5
```

Practice day:

```text
Day 6
```

Graded day:

```text
Day 7
```

Rules:

1. Preserve syllabus chronological order.
2. Keep an atomic lecture with its immediately associated non-graded activity where possible.
3. Do not arbitrarily split atomic learning units.
4. Target approximately 20% of normal learning workload per day on Days 1–5.
5. Practice assignments belong to the practice phase/day.
6. Graded assignments belong to the graded phase/day.
7. Do not silently mix graded work into normal Days 1–5.
8. Fixed personal blocks are separate from academic allocation.
9. Planning must be deterministic.

The detailed source is:

```text
docs/planning-rules.md
```

---

# 13. Four-week progress model

The progress model contains four weeks:

```text
Week 1
Week 2
Week 3
Week 4
```

Each week can be analyzed across the four subjects:

```text
                W1     W2     W3     W4
Math            ✓      ✓      ✓      ✓
Statistics      ✓      ✓      ✓      ✓
CT              ✓      ✓      ✓      ✓
English         ✓      ✓      ✓      ✓
```

The exact values are derived from task state.

---

# 14. Overall progress model

Overall progress is the combined aggregate of the relevant underlying tasks.

Conceptually:

```text
All tasks
   ↓
Completed / total
   ↓
Overall %
```

Do not hard-code a number such as 62%, 75%, etc.

Any numbers shown in the progress reference are mock UI data only.

---

# 15. Progress dashboard UX

Reference:

```text
reference/progress/progress-reference.html
```

The production dashboard should communicate the following hierarchy.

## Level 1 — Overview

Show:

- overall progress
- four weeks
- four subjects
- high-level completion statistics

## Level 2 — Week

Selecting/opening a week shows:

- week overall
- all four subjects
- subject completion inside that week

## Level 3 — Subject

Selecting a subject shows:

- subject overall
- Week 1
- Week 2
- Week 3
- Week 4

## Level 4 — Week inside subject

Expand to show category/task groups.

## Level 5 — Day

Show planned days and their completion.

## Level 6 — Task

Show actual task completion state.

Conceptual hierarchy:

```text
Overall
 ├── Week
 │    └── Subject
 │         └── Day
 │              └── Task
 │
 └── Subject
      └── Week
           └── Day
                └── Task
```

The exact navigation interaction may use cards, click-to-expand, accordion, or deeper views, but it must preserve this information hierarchy.

---

# 16. Progress categories

Where actual data supports the categories, show breakdowns such as:

```text
Lectures       12 / 15
Activities      8 / 10
Practice        4 /  6
Graded          1 /  2
```

Do not display fake categories.

Category totals must be calculated from actual task types.

---

# 17. Progress engine

`src/js/progress-engine.js` owns progress calculation.

It should be able to calculate:

```text
task progress
day progress
week progress
subject progress
overall progress
category progress
```

A task is complete only when persisted task state says it is complete.

Progress calculation should be deterministic.

Conceptual algorithm:

```text
tasks
  ↓
filter scope
  ↓
count total
  ↓
count completed
  ↓
calculate percentage
```

If a percentage cannot be meaningfully calculated because there are zero tasks, the system must define a consistent empty-state rule rather than inventing completion.

---

# 18. Progress persistence/update flow

When a task is toggled:

```text
1. Identify task by taskId.
2. Update completion state.
3. Set/clear completedAt.
4. Persist through storage abstraction.
5. Recalculate affected day.
6. Recalculate affected week.
7. Recalculate affected subject.
8. Recalculate overall.
9. Persist/update progress aggregate.
10. Re-render the affected UI.
```

Avoid unnecessary full application reloads.

---

# 19. Storage architecture

All persistent state access should go through:

```text
src/js/storage.js
```

Components should not directly call `localStorage` everywhere.

This abstraction makes persistence replaceable and testable.

The initial implementation may use browser local storage or another lightweight local mechanism consistent with the current architecture.

No backend is required.

---

# 20. Report architecture

The report system is:

```text
Underlying data
      ↓
Report Model
      ↓
HTML Export Engine
      ↓
Standalone report
```

`report-model.js` should create a normalized representation independent of the final HTML template.

`export-engine.js` converts the report model into standalone HTML.

---

# 21. Report scopes

Required scopes:

### Daily

```text
reports/daily/2026-10-04.html
```

### Weekly

```text
reports/weekly/Mathematics-Week-1.html
```

### Subject

```text
reports/subjects/Mathematics-I-Progress.html
```

### Overall

```text
reports/overall/IITM-Overall-Progress.html
```

The overall report may include:

```text
all subjects
→ all weeks
→ all days
→ all tasks
```

---

# 22. Export requirements

Exported HTML must:

- work independently
- open directly in a browser
- contain the information needed to render itself
- not require the application runtime
- be interactive where practical
- support expand/collapse where appropriate
- not mutate source progress

Export should use a serialized report model.

---

# 23. PWA architecture

The app is browser-first and PWA-ready.

Existing intended files:

```text
src/manifest.json
src/service-worker.js
```

PWA support must remain optional from the user's perspective.

The core product must not require:

- desktop wrappers
- backend servers
- databases
- cloud APIs

---

# 24. Reference files

References are requirements for visual/behavioral understanding.

They are not production source.

Agents must inspect them before implementing the corresponding feature.

Never silently overwrite them.

Reference groups:

```text
Calendar
Daily Tracker
Progress
Syllabus
```

The syllabus references are particularly important for understanding extracted course structure.

When source data contains missing information, preserve the missing state. Do not fabricate durations, assignments, or syllabus items.

---

# 25. Module responsibilities

## `app.js`

Application bootstrap and orchestration.

## `router.js`

Controls view/navigation state.

## `calendar.js`

Coordinates calendar behavior.

## `data-engine.js`

Loads, validates, normalizes, and resolves source data.

## `planner-engine.js`

Creates deterministic date plans from syllabus data and planning rules.

## `progress-engine.js`

Calculates all progress scopes.

## `storage.js`

Owns persistence.

## `renderer.js`

Coordinates UI rendering without owning business rules.

## `report-model.js`

Creates normalized report data.

## `export-engine.js`

Generates standalone HTML reports.

---

# 26. Component responsibilities

### Calendar

```text
calendar-view.js
month-view.js
week-view.js
```

### Progress

```text
progress-dashboard.js
overall-progress.js
subject-progress.js
week-progress.js
day-progress.js
progress-drilldown.js
```

### Tracker

```text
daily-tracker.js
task-card.js
task-group.js
```

### Tasks

```text
task-card.js
task-status.js
task-types.js
```

### Reports

```text
report-viewer.js
report-tree.js
export-controls.js
```

Components render and interact with models; they should not independently invent business rules.

---

# 27. Visual direction

The supplied references establish a dark, polished, glass-inspired visual direction.

Important characteristics to preserve where applicable:

- dark background
- soft/glass surfaces
- subtle gradients
- rounded cards
- clear progress bars
- strong selected-date state
- readable hierarchy
- restrained motion
- responsive layout
- clean typography
- purple-accent visual language where consistent with the references

Do not turn the app into an unrelated visual redesign.

The references are the visual baseline.

---

# 28. Error and empty states

The application must handle:

- missing date JSON
- malformed JSON
- unresolved syllabus reference
- task with unknown type
- zero tasks
- incomplete progress aggregate
- missing optional metadata

The system should fail visibly and safely.

Never silently invent data to hide an error.

---

# 29. Testing requirements

At minimum test:

### Data

- syllabus validation
- schedule validation
- progress validation

### Engines

- planner engine
- progress engine
- report model
- export engine

### Renderer

- calendar
- tracker
- progress

Important state transitions must be tested, especially:

```text
unchecked → checked
checked → unchecked
refresh → state survives
task update → progress changes
```

---

# 30. Definition of done

The implementation is complete only when:

## Calendar

- main view works
- month/week views work
- date selection works
- double-click opens daily tracker
- Progress button opens progress dashboard

## Daily tracker

- selected date loads its JSON
- tasks render from data
- syllabus references resolve
- task state persists
- daily progress updates

## Planning

- source order preserved
- planning rules enforced
- deterministic output
- fixed blocks separated from academic tasks

## Progress

- actual completion drives all percentages
- overall works
- weeks work
- subjects work
- days work
- task drill-down works
- category breakdown works where data exists

## Reports

- daily export works
- weekly export works
- subject export works
- overall export works
- exported HTML is standalone

## Architecture

- source data remains separate
- stable task IDs exist
- storage is centralized
- progress engine is separate
- report/export is separate
- references remain unchanged
- tests pass

---

# 31. Non-goals

Do not introduce unless explicitly requested:

- backend
- database
- authentication
- cloud sync
- unnecessary framework migration
- Electron/Tauri
- AI APIs
- permanent HTML page per day
- duplicate syllabus databases
- manually hard-coded progress percentages

---

# 32. Agent operating rule

The agent must follow this sequence:

```text
READ
 ↓
INSPECT
 ↓
UNDERSTAND
 ↓
PLAN
 ↓
IMPLEMENT
 ↓
TEST
 ↓
REPORT
```

Before changing a feature:

1. Read this specification.
2. Read relevant `docs/` files.
3. Inspect the corresponding `reference/` file.
4. Inspect existing implementation.
5. Reuse existing architecture where appropriate.
6. Make the smallest coherent change.
7. Run relevant tests.
8. Report what changed and what remains.

Do not rewrite working architecture simply because another approach is preferred.

---

# 33. Final product vision

The final application should feel like one connected system rather than separate pages.

The user's mental model should be:

```text
"I choose a date."
        ↓
"I see exactly what I need to study."
        ↓
"I complete tasks."
        ↓
"The system remembers it."
        ↓
"My daily progress updates."
        ↓
"My week updates."
        ↓
"My subject updates."
        ↓
"My overall progress updates."
        ↓
"I can drill down to exactly what is incomplete."
        ↓
"I can export the same truth as a report."
```

That connected data flow is the central product requirement.
