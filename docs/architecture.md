# Architecture

## 1. High-level architecture

```text
                    ┌───────────────┐
                    │    Calendar   │
                    └───────┬───────┘
                            ↓
                    Selected Date
                            ↓
                 ┌────────────────────┐
                 │   Data Engine      │
                 └─────────┬──────────┘
                           ↓
                 ┌────────────────────┐
                 │  Planner Engine    │
                 └─────────┬──────────┘
                           ↓
                 Daily View Model
                           ↓
                 ┌────────────────────┐
                 │     Renderer       │
                 └─────────┬──────────┘
                           ↓
                    Daily Tracker
                           ↓
                    Task Completion
                           ↓
                 ┌────────────────────┐
                 │  Progress Engine   │
                 └─────────┬──────────┘
                           ↓
               Hierarchical Progress
                           ↓
                 ┌────────────────────┐
                 │   Report Model     │
                 └─────────┬──────────┘
                           ↓
                 ┌────────────────────┐
                 │   Export Engine    │
                 └─────────┬──────────┘
                           ↓
                 Standalone HTML
```

---

## 2. Module responsibilities

### `app.js`

Application bootstrap and top-level coordination.

### `router.js`

Controls application views/routes.

### `calendar.js`

Calendar state, date selection and calendar interaction orchestration.

### `data-engine.js`

Loads, validates and normalizes source JSON.

It should not decide visual presentation.

### `planner-engine.js`

Converts syllabus + schedule rules into daily study plans.

It owns planning logic.

### `renderer.js`

Coordinates DOM rendering.

It should consume view models instead of deciding business rules.

### `progress-engine.js`

Calculates:

- task progress
- day progress
- week progress
- subject progress
- overall progress
- category breakdowns

### `report-model.js`

Builds a serializable report representation from the progress hierarchy.

It is the bridge between analytics and output formats.

### `export-engine.js`

Serializes report models into standalone HTML.

It should not calculate authoritative progress.

### `storage.js`

The only abstraction responsible for persisted application state.

---

## 3. Component responsibilities

### Calendar components

Responsible for displaying:

- month view
- week view
- selected date
- calendar interactions

### Tracker components

Responsible for displaying:

- daily schedule
- task groups
- task cards
- completion controls

### Progress components

Responsible for displaying:

- overall progress
- subject progress
- week progress
- day progress
- deep drill-down

### Report components

Responsible for displaying report/export controls inside the application.

### Task components

Shared task presentation and semantic status/type behavior.

---

## 4. Data flow

### Daily tracker

```text
date
 ↓
schedule lookup
 ↓
syllabus lookup
 ↓
progress lookup
 ↓
planner/view model
 ↓
renderer
```

### Task completion

```text
checkbox interaction
 ↓
stable taskId
 ↓
storage.js
 ↓
progress state
 ↓
progress-engine.js
 ↓
updated dashboard
```

### Drill-down

```text
double click
 ↓
scope identifier
 ↓
progress-engine
 ↓
scope report model
 ↓
detail renderer
```

### Export

```text
scope
 ↓
progress-engine
 ↓
report-model
 ↓
export-engine
 ↓
standalone HTML
```

---

## 5. Browser-first constraint

The core product should work without:

- backend server
- database
- desktop shell
- cloud API

Development tooling may use a local server where useful, but the product architecture must remain browser-first.

---

## 6. Dependency discipline

Avoid adding libraries for functionality that can be implemented with standard browser APIs.

Any future dependency must have a documented reason.
