# Phase 2 — Core Data + Storage Architecture (Decision Record)

> Status: implemented in Phase 2. Sources of truth: `src/js/data-engine.js`,
> `src/js/storage.js`, `src/js/progress-engine.js` and their tests.
> This document records the architectural decisions made in Phase 2; it does
> not replace `PROJECT_SPECIFICATION.md` or the other `docs/` files — it
> reconciles them where Phase 2 made concrete choices.

---

## 1. Task identity — final format

```text
taskId = "<subjectId>:<weekNumber>:<sourceId>"
```

Real examples:

```text
mathematics-i:1:L1.1
english-i:2:Lecture 1
computational-thinking:3:L3.8
statistics-i:4:Practice Assignment (EMQ) 1 - Not Graded Programming
```

Rules:

- The planned date is **never** part of the identity. It lives on the task as
  mutable planning state (`plannedDate`), so a task can move between days
  without becoming a different task.
- `weekNumber` is mandatory because Phase 1 preserved genuine cross-week
  duplicate labels (english-i `Lecture 1`..`Lecture 6` in weeks 1–3;
  mathematics-i `Practice Assignment (Extra Practice)` in weeks 1–3). A bare
  `sourceId` would collide.
- `sourceId` is the Phase 1 source identity and is guaranteed to contain no
  `:` (extractor-validated; re-asserted by tests over all 413 items).
- Identity is built/parsed only via `buildTaskId()` / `parseTaskId()`
  in `data-engine.js`; malformed input throws `DataEngineError`
  (`invalid_argument` / `invalid_task_id`).
- Uniqueness of `(subjectId, weekNumber, sourceId)` is proven for the whole
  canonical corpus (413/413 unique ids), and construction is order-independent
  (no array indexes, no dates, no random ids).

## 2. Task model

```json
{
  "taskId": "mathematics-i:1:L1.1",
  "subjectId": "mathematics-i",
  "courseId": "BSMA1001",
  "weekNumber": 1,
  "sourceId": "L1.1",
  "type": "lecture",
  "title": "L1.1: Natural Numbers and their operations",
  "plannedDate": null,
  "completed": false,
  "completedAt": null
}
```

- Canonical content stays in the syllabus layer; the task carries identity plus
  planning/state fields only (`title` is the documented rendering convenience).
- Built by `data-engine.js`: `buildTaskForItem`, `buildTasksForWeek`,
  `buildTasksForCourse`, `buildAllTasks`, `getTask`; daily plan entries map to
  the same model via `taskFromDailyEntry`; `applyCompletion` overlays stored
  state without mutating the source task.

## 3. Storage architecture (mutable user state)

- Repository JSON files ship canonical/plan data and are **never written at
  runtime** — a browser page cannot rewrite `data/*.json`.
- Completion state lives in browser storage under one versioned key:
  `study-planner:state` (via `src/js/storage.js`).
- Backend: `localStorage` when available; otherwise an in-memory fallback so
  the app keeps working. Diagnostics always report which backend is active and
  whether it persists (`diagnostics().persistent`).
- State shape (`schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "completions": {
    "mathematics-i:1:L1.1": { "completed": true, "completedAt": "2026-10-04T12:30:00.000Z" }
  }
}
```

- Only mutable state is stored — never syllabus content. Unchecking a task
  removes its record entirely; `null` / missing means "not completed".
- Deterministic serialization: task ids sorted, stable key order, trailing
  newline (safe for diffing and export).
- Corruption policy (no crash, no silent overwrite):
  - missing state → healthy empty state;
  - malformed JSON / invalid records → `diagnostics().status === 'corrupt'`,
    reads degrade to "not completed", **writes throw** (`corrupt_state`),
    `reset()` recovers, `getRawState()` preserves the raw payload for backup,
    `importState()` can replace it;
  - unknown `schemaVersion` → `incompatible`, same protection
    (`incompatible_state`);
  - export/import are validated (`invalid_import`); merge unions with existing
    state (imported records win); a failed import never mutates current state.
- Daily JSON reconciliation: the `completed` / `completedAt` fields inside
  `data/schedule/daily/*.json` are **seed/export containers**. Runtime
  completion truth is the storage layer. (Reconciles
  `docs/tracking-architecture.md`, which assumed files could be rewritten.)
  **Phase 3 update:** canonical plan files omit those fields entirely (plan is
  not state); the validator accepts them optionally for export workflows.

## 4. Canonical vs derived vs mutable

| Layer | Location | Status |
|---|---|---|
| Course content | `data/syllabus/*.json` | **Canonical** (Phase 1, read-only at runtime) |
| Plan intent | `data/schedule/daily/*.json` | **Canonical plan** (materialized by Phase 3, deterministic) |
| Completion state | browser storage (`study-planner:state`) | **Mutable user state** (the only mutable layer) |
| Progress numbers | computed by `progress-engine.js` | **Derived** (recomputed on demand) |
| `data/progress/progress.json` | derived aggregate/cache | **Derived cache** — never truth, rebuildable, may lag |

Rebuild path (tested):

```text
syllabus + daily plans + completion state
        ↓
progress-engine.js
        ↓
derived store (same shape as data/progress/progress.json)
```

## 5. Progress calculation source and rules

- Source: canonical syllabus tasks (`buildAllTasks`) + persisted completion
  state. Day scopes use daily plan tasks when a plan exists.
- Eligibility: **all task types count except `break`, `free`, `fixed`**
  (personal/non-academic blocks can never inflate academic progress).
- Graded assignments count like any other academic task; no weighting is
  invented.
- `percent = Math.round(completed / total * 100)` — always derived from counted
  tasks, never hard-coded.
- Hierarchy: task → category (`byType`) → day (plan-based) → week (per subject
  and across subjects) → subject → overall. Every scope returns
  `{ total, completed, remaining, percent }`.

## 6. Empty-scope rule

`0 eligible tasks → { total: 0, completed: 0, remaining: 0, percent: 0 }`.

Never `NaN`, `Infinity`, or `100%`. A missing daily plan is represented as
`null` day progress (distinct from an empty plan, which is `0 / 0 / 0%`).
The same rule is mirrored by `docs/progress-json-schema.md`.

## 7. Daily JSON schema adjustment (minimal, documented)

The daily task entry now uses the canonical identity:

```json
{
  "taskId": "mathematics-i:1:L1.1",
  "subjectId": "mathematics-i",
  "courseId": "BSMA1001",
  "weekNumber": 1,
  "sourceId": "L1.1",
  "type": "lecture",
  "title": "Display title",
  "planned": true,
  "completed": false,
  "completedAt": null
}
```

- `syllabusItemId` (shown in the original docs example) is replaced by
  `sourceId`, matching the canonical syllabus layer. No other rename.
- Validator rules (`validateDailyPlan`): taskId must match
  `<subjectId>:<weekNumber>:<sourceId>` and agree with the other id fields;
  `weekNumber === ceil(dayNumber / 7)`; `completion.totalTasks === tasks.length`;
  `completion.completedTasks === completed count`;
  `completion.percent === round(completed / total * 100) or 0`.
- Planner-only task types (`revision`, `review`, `break`, `free`, `fixed`) are
  accepted for Phase 3 plans; they must still carry a real subject.
- **No daily file was generated or modified in Phase 2** — the 28 containers
  remain empty skeletons with zero tasks.

## 8. progress.json reconciliation

- `data/progress/progress.json` is **not populated** in Phase 2 (per phase
  boundary). Its shipped zeros were written before the syllabus existed and are
  treated as an unpopulated placeholder.
- The engine's derived store has the identical schema shape and real scope
  totals (overall 413 items: 166 / 88 / 101 / 58 per subject; weeks 87 / 114 /
  101 / 111). A valid cache total is either `0` (placeholder) or the engine's
  scope total — nothing else.
- `buildProgressStore()` requires an explicit period (`startDate`, `endDate`);
  the engine never invents cycle dates. `percent` values remain recomputable
  from `total`/`completed`.

## 9. Environment and module pattern

- Plain scripts with a minimal UMD wrapper: CommonJS for Node (`require`) and
  `globalThis.StudyPlanner.DataEngine` / `.Storage` / `.ProgressEngine` in the
  browser (load order: data-engine first).
- Zero dependencies; Node built-ins only (`fs`, `path` in the Node-only
  loaders, which throw a clear `environment` error elsewhere).
- The engine core is pure over loaded documents — browser loading (fetch) is a
  later-phase concern.

## 10. Phase boundaries kept

No UI, no calendar, no tracker, no planner algorithm, no 28-day generation, no
export/PWA work, and no changes to `reference/**` were made in Phase 2. All
Phase 1 tests still pass unchanged.


