# Planning Rules — Implemented Specification (Phase 3)

> This document describes the planning rules **as implemented** by
> `src/js/planner-engine.js` and materialized by `tools/generate-plans.js`.
> It matches the Phase 3 specification exactly. Where the specification leaves
> implementation freedom (algorithm structure), the chosen deterministic
> behavior is documented here.

---

## 1. Pipeline

```text
canonical syllabus (data/syllabus/*.json)
        ↓
planner engine (src/js/planner-engine.js)
        ↓
28 daily plan documents (data/schedule/daily/2026-10-02 … 2026-10-29)
```

Deterministic: same syllabus + same configuration + same start date produce
byte-identical output. Plan documents describe **what to study**; completion
state is owned by `storage.js` (plan is not state — no completion fields are
written into plan files).

---

## 2. Workload formulas (fixed, not preferences)

```text
V  = video minutes          (source durationSeconds / 60)
N  = V × 0.67               (note-making estimate, noteMultiplier)
Q  = number of questions

Lecture workload      = V + N = V × 1.67
Question workload     = Q × 1.5 minutes (questionMinutes)
Learning unit load U  = (V × 1.67) + (Q × 1.5)
```

- All computation runs at full precision; stored planning minutes are
  display-rounded to one decimal (`round1`) — never rounded mid-calculation.
- Example: a 15-minute video → 10.05 min notes → 25.05 min lecture workload;
  5 questions → 7.5 min; a 20-minute video with 5 questions → 40.9 min unit.

## 3. Learning units and pairing

- New-content items form units **in source order**.
- Activity questions attach to the **nearest preceding video item** (their
  lecture). Consecutive activities may share one lecture; an activity with no
  preceding video becomes a standalone unit.
- Practice and graded items are single-item bundles and never pair.
- **Learning units are never split** by the planner (the overflow rule pushes
  the intact unit to the next day).

### Item classification (deterministic)

```text
type "practice" → practice   (day 6)
type "graded"   → graded     (day 7)
everything else → new content (days 1–5), in source order
```

Tutorials, solutions, extras, orientation, summary and other videos or
assignments stay in the week's learning sequence (days 1–5).

### Workload class (derived from the source row class, not the app type)

```text
rowClass video  / video warn        → time = video + notes
rowClass assign / assign warn / graded → time = questions × 1.5
```

This keeps e.g. "Programming" (an assign row typed `other`) on the question
formula.

## 4. Missing data (never fabricated)

- Missing source duration (`null`) → planning estimate
  `fallbackVideoMinutes` (20), flagged as `sourceDurationMissing: true`.
- Missing question count (`null`) → `fallbackQuestionCount` (5) × 1.5 min,
  flagged as `sourceQuestionsMissing: true`.
- `durationSeconds` / `questionCount` in every planned task mirror the
  syllabus exactly — `null` stays `null`.
- Fallback values are configuration values; they are never written as source
  data and never overwrite canonical fields.

---

## 5. Weekly cycle and daily target

```text
Day 1–5 → new content        Day 6 → practice        Day 7 → graded assignment
```

- Days 1–5 carry **all** non-practice, non-graded items of that week.
- Day 6 carries the week's `practice` items; day 7 carries the week's `graded`
  assignment (exactly one graded item per subject per week exists in the
  canonical data).
- Daily target = weekly new-content workload / 5. It is a **target**, not an
  equality: complete learning units are preserved, so
  `daily workload ≈ daily target`.

## 6. Fixed daily timetable (never redesigned)

```text
11:00 – 1:00    Mathematics                       study    capacity 120 min
1:00  – 1:30    Lunch / Rest                      break    capacity 0
1:30  – 3:00    Statistics                        study    capacity 90 min
3:00  – 3:30    Walk / Refresh                    break    capacity 0
3:30  – 5:00    Computational Thinking            study    capacity 90 min
5:00  – 6:00    Free / Refresh                    free     capacity 0
6:00  – 8:00    FIXED TIME (Temple + Food + Personal)  fixed  capacity 0
8:00  – 8:30    Relax                             break    capacity 0
8:30  – 9:15    English                           study    capacity 45 min
9:15  – 9:30    Refresh                           break    capacity 0
9:30  – 10:30   Math + Statistics Revision        revision capacity 0
10:30 – 11:00   Daily Review                      review   capacity 0
```

Times are 12-hour clock strings without AM/PM (`11:00`, `1:00`, `10:30`).

- Breaks, free, fixed, revision and review blocks **never** receive academic
  tasks (verified for all 28 days).
- Block capacity is a soft guideline ("do not exceed it when avoidable").
  When a week's fair share exceeds its block capacity the overflow is
  unavoidable — the planner spreads it evenly across days 1–5 instead of
  dumping it on one day.

## 7. Distribution algorithm (deterministic balance)

For every subject and week:

1. Build learning units in source order.
2. Week 1, day 1: the golden reference anchor (exact prefix — see §8).
3. For each remaining day: `want = remainingWork / remainingDays`; take the
   next unit while the day ends **no farther** from `want` than it started
   (ties inclusive); otherwise push the unit down to the next day. An empty
   day always takes at least one unit.
4. Day 5 (the final new-content day) drains all remaining units — completing
   the weekly content by day 5 is a higher priority than perfect equality.

Consequences (all tested): source order preserved, units never split, no
duplicate or omitted tasks (413/413 planned exactly once).

## 8. Golden Day-1 reference (2026-10-02)

The Day-1 tracker reference (`reference/daily-tracker/`) defines the exact
first-day structure, encoded in `config.goldenFirstDay`:

```text
mathematics-i            L1.1, AQ1.1, L1.2, AQ1.2, L1.3, AQ1.3, L1.4, AQ1.4
statistics-i             Course Overview, L1.1, AQ1.1, L1.2, AQ1.2
computational-thinking   L1.1, AQ1.1, L1.2, AQ1.2
english-i                Lecture 1, AQ1.1
```

- The anchor must be an exact, unit-aligned prefix of week-1 content; the
  engine throws `invalid_anchor` otherwise.
- Weeks 2–4 and days 2–5 use the balance algorithm from §7.
- Note: the reference Day-1 itself exceeds the nominal Statistics (170.4 vs
  90 min) and Mathematics (133.5 vs 120 min) block capacities — the golden
  anchor intentionally preserves the reference over capacity equality.

---

## 9. Revision and daily review blocks

- `9:30 – 10:30  Math + Statistics Revision` — reserved for weak topics,
  recall, the error log and consolidation. It carries **no tasks**, has zero
  academic capacity, and is never used to hide unfinished new content.
- `10:30 – 11:00  Daily Review` — administrative review (completed work,
  pending items, tomorrow's plan). Zero academic capacity; no tasks.
- Day 6 study blocks are labelled `Practice + Consolidation`; day 7 study
  blocks are labelled `Graded Assignment` (days 1–5 keep the reference focus
  strings from the timetable).

## 10. Task identity and the planned task entry

```text
taskId = <subjectId>:<weekNumber>:<sourceId>   (Phase 2 identity; date-independent)
```

Every planned task entry contains:

```json
{
  "taskId": "mathematics-i:1:L1.1",
  "subjectId": "mathematics-i",
  "courseId": "BSMA1001",
  "weekNumber": 1,
  "sourceId": "L1.1",
  "type": "lecture",
  "title": "L1.1: Natural Numbers and their operations",
  "planned": true,
  "durationSeconds": 1249,
  "questionCount": null,
  "planning": {
    "unitId": "mathematics-i:1:L1.1",
    "videoMinutes": 20.8,
    "noteMinutes": 13.9,
    "questionMinutes": null,
    "estimatedMinutes": 34.8,
    "sourceDurationMissing": false,
    "sourceQuestionsMissing": false
  }
}
```

- `durationSeconds` / `questionCount` are **source** values (null stays null).
- `planning.*` are **planner estimates** (display-rounded to 1 decimal) and
  never replace source data.
- No `completed` / `completedAt` fields: plan files carry no runtime state.

## 11. Daily plan document

```text
schemaVersion "1.0" · planType "daily-study-plan" · date · dayNumber · weekNumber
status "not_started"
schedule: 12 blocks —
  { blockId, start, end, label, focus, category, subjectId, taskIds[] }
tasks:    flat, in schedule order (planner task entries, §10)
completion: { totalTasks, completedTasks: 0, percent: 0 }   (plan summary; not state)
meta:     { createdAt: null, updatedAt: null, notes: "", generator: "planner-engine" }
```

`taskIds` reference the flat `tasks` array; every task is referenced by
exactly one block (validator-enforced). Break/free/fixed/revision/review
blocks have `taskIds: []` and `subjectId: null`.

## 12. Configuration (centralized)

`src/js/planner-engine.js` owns the configuration:

```text
noteMultiplier 0.67 · questionMinutes 1.5
newContentDays 5 · practiceDay 6 · gradedDay 7 · daysPerWeek 7 · weeks 4
fallbackVideoMinutes 20 · fallbackQuestionCount 5
practiceFocus "Practice + Consolidation" · gradedFocus "Graded Assignment"
timetable (12 blocks, §6) · goldenFirstDay (anchors, §8)
```

Override via `createPlannerConfig({…})`; unknown keys and invalid values throw
`invalid_config`. Formula constants, the timetable and the golden anchors are
specification values — not personal preferences.

---

## 13. Determinism guarantees

- No randomness, no clock reads, no AI/subjective decisions, no
  environment-dependent iteration.
- Serialization: fixed key order from construction, 2-space indent, trailing
  newline (`serializePlan`).
- Verified by tests: two independent runs are deep-equal and byte-identical,
  and the materialized files match deterministic regeneration
  (`node tools/generate-plans.js --check`).

## 14. Materialization and tooling

```text
node tools/generate-plans.js           # (re)write all 28 daily plan files
node tools/generate-plans.js --check   # verify files match regeneration byte-for-byte
```

The materializer loads the canonical syllabus through the data engine, runs
the planner, validates every generated day with `validateDailyPlan`, and
writes `data/schedule/daily/YYYY-MM-DD.json`. It never writes completion
state and never touches `data/progress/progress.json`.

## 15. Replanning

If replanning is introduced later, it must preserve stable source identities
(`subjectId:weekNumber:sourceId`, §10) so persisted completion state can be
matched to the new schedule. The planner itself never reads completion state.
