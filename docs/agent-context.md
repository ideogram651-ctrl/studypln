# Agent Context — Study-Planner

This file is the implementation agent's operating contract.

## Before coding

Read:

1. `README.md`
2. `PROJECT_SPECIFICATION.md`
3. `docs/architecture.md`
4. `docs/json-schema.md`
5. `docs/planning-rules.md`
6. `docs/progress-system.md`
7. `docs/export-system.md`

Then inspect:

```text
reference/calendar/
reference/daily-tracker/
reference/syllabus/
```

---

## Source-of-truth rule

Do not invent syllabus content.

If a required value is missing:

- inspect the supplied source
- preserve missing/null data
- ask for clarification when implementation cannot proceed safely

Never silently fabricate course tasks, durations, question counts, dates or grading information.

---

## Reference rule

Reference files are examples.

Use them to understand:

- visual language
- interactions
- behavior
- layout
- expected UX

Do not copy their accidental limitations into the architecture.

Do not modify them unless explicitly requested.

---

## Architecture rule

Keep responsibilities separated:

```text
data-engine
    ↓
planner-engine
    ↓
renderer

progress-engine
    ↓
report-model
    ↓
export-engine
```

Do not put everything in `app.js`.

---

## Persistence rule

Use stable semantic task IDs.

Never persist completion by array index.

Do not scatter raw `localStorage` operations throughout components.

Use `storage.js`.

---

## Progress rule

Never hard-code:

```text
82%
62%
50%
```

as authoritative progress.

Calculate from actual task completion.

---

## Drill-down rule

Deep progress views must use the same underlying data as the daily tracker.

Do not create a separate manually maintained deep-syllabus JSON just for the progress screen.

---

## Export rule

Exported HTML must be generated from a report model.

Do not make the exporter responsible for business calculations.

---

## Change discipline

Before changing an architecture-level file:

1. Check existing implementation.
2. Check the specification.
3. Check related tests.
4. Preserve working behavior unless the specification explicitly changes it.
5. Make the smallest coherent change.

---

## No unnecessary technology

Do not introduce:

- backend servers
- databases
- Electron
- Tauri
- React
- heavy UI frameworks
- cloud APIs

unless a later specification explicitly requires them.

---

## Testing rule

After implementing a core engine:

- test normal cases
- test empty data
- test incomplete data
- test all-complete data
- test persistence
- test stable IDs
- test drill-down scope boundaries
- test export output

---

## Final implementation principle

The application should be understandable by another developer without reverse-engineering hidden assumptions from UI code.

If a rule matters, document it.
If data matters, give it a schema.
If behavior matters, test it.

---

## Current implementation status

Delivered so far:

| Phase | Scope | Main files |
| --- | --- | --- |
| 1 | Data loading and normalization | `src/js/data-engine.js` |
| 2 | Core engines and storage | `src/js/planner-engine.js`, `src/js/progress-engine.js`, `src/js/storage.js` |
| 3 | Calendar | `src/components/calendar/*` |
| 4 | Daily tracker | `src/components/tracker/*` |
| 5 | Progress dashboard and drill-down | `src/components/progress/*` |
| 6 | Reports, HTML export, progress calendar | `src/js/report-model.js`, `src/js/export-engine.js`, `src/components/reports/*` |

### Phase 5 notes for the next agent

`app.js` owns progress routing only. It loads syllabus JSON through
`data-engine.loadCoursesFromUrls()`, asks `progress-engine` for nodes, and hands
those nodes to a presentation-only component. If a progress screen seems to need
a new number, add it to the engine and test it there — do not compute it in a
component.

The progress views are read-only at task level on purpose. Checking work off is a
tracker action; duplicating the checkbox in the dashboard would create two places
that can disagree about what is complete. Day rows therefore link to the tracker.
### Phase 6 notes for the next agent

Reports are a **read-only view**, layered above the phases that already existed. The data
flow is:

```text
Syllabus + Daily Plans ──► Report Model ──► Report Viewer ──► Export Engine ──► HTML
                              ▲
                    Progress Engine (every number)
```

`createReportModel(context)` binds courses, completions and plans **once**. The app builds
one model per visit and hands that same instance to the viewer and to the export handler.
Reusing the model the user is already looking at is what stops a second, divergent
calculation from appearing.

The calendar's geometry rule is worth preserving: `top` and `height` are both ratios of one
shared day window, so block heights stay proportional to real durations automatically. Do
not introduce per-block pixel offsets.

Block colour is a pure function of the data — subject first, then category — emitted by the
model as a **token** (`math`, `stats`, `ct`, `english`, `revision`, `review`, `practice`,
`rest`). The actual colour values live in two places on purpose: `src/css/reports.css` for
the app and the embedded stylesheet in `export-engine.js` for the standalone file. Change
both together or the export will drift from the app.

Report routes live under `#/reports` and are parsed in `router.js` *after* the Phase 4/5
routes. Report components perform no counting and write nothing — completing work remains a
tracker action, exactly as in Phase 5.

**Known environment quirk:** browsers cache `reports.css` hard. After editing it, hard
reload before judging responsive behaviour, or the previous `min-width` rule is still the
one being computed.

Full detail: `reports/phase6-report-model-export-report.md`.