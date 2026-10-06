# Update U5 — Daily Tracker: actionable Math + Statistics Revision & Daily Review (CHANGE-004)

## 2. Scope, inputs, and baseline

U5 implements CHANGE-004 in full: the two actionable non-course blocks —
**Math + Statistics Revision** (`category: revision`) and **Daily Review**
(`category: review`) — now carry the established Daily Tracker completion
control, persisted through the existing storage flow.

**Baseline:** 462/462 green at the end of U4. After the U5 edits the suite
reads **470/470** with 8 new focused tests in `tests/renderer/tracker-u5.test.js`
and **zero** modifications to any existing test.

**Inputs:** `reference/change-specification/v5/…CHANGE-004 pages` (problem,
required change, negative requirements, implementation hierarchy, acceptance
checklist), `reports/update-u0-architecture-audit.md` §7 (decision point +
task-ID options Q1, progress-eligibility Q2), `docs/tracking-architecture.md`
§5–6, `TRACKING_STORAGE_MANIFEST.json`.

**Locked and verified unchanged:** `storage.js`, `progress-engine.js`,
`task-card.js`, `app.js`, `tracker.css`, `planner-engine.js`, `data/**`
(all files verified untouched today), every existing test file, all progress
and report routes.

## 3. Architectural decisions (U0 Q1 / Q2 — now resolved)

### 3.1 Q1 — Task-ID scheme: `<blockId>:<weekNumber>:<date>`

The two blocks carry no `taskIds` in the plan JSON, but `storage.js`
(`TASK_ID_PATTERN = /^[^:]+:\d+:[^:]+$/`) gates every completion key. U5 mints:

```text
revision:1:2026-10-02        daily-review:1:2026-10-02
```

Chosen from U0 option **(a)** — follow the existing
`<subjectId>:<weekNumber>:<sourceId>` shape with a reserved identity segment —
with two documented refinements:

1. **The `blockId` occupies the first segment** (no subject exists for these
   blocks; `subjectId` is `null` in the plan).
2. **The date occupies the third segment.** Course task IDs are date-independent
   only because each course task is planned exactly once (413/413). These two
   blocks recur on all 28 days, so per-day independence requires the date in the
   ID — otherwise checking 2 October would tick every day.

The IDs satisfy **both** gates (`storage.js` and `data-engine.js` patterns) and
round-trip through `DE.parseTaskId`. No pattern was extended, no protected file
was touched, and the ID is minted in exactly one place
(`TaskGroup.actionableTaskId`, exported for tests). Rejected alternatives:
(b) extending `TASK_ID_PATTERN` (protected `storage.js` — not needed),
(c) regenerating 28 plan files via the planner (protected, expensive, and would
move progress denominators).

### 3.2 Q2 — Progress eligibility: persisted, but excluded from denominators

The completion record is **real and persisted** (it flows through
`storage.setCompletion` → `progress-engine` exactly like a course tick), but it
is deliberately **not a plan task**: it never enters `plan.tasks`. Therefore:

- `dayProgress` totals stay **19/19** per day-1 style day and overall stays
  **413** — every locked test expectation holds (U0's warned-of mass breakage
  does not occur);
- the block's own header count (`0 / 1` → `1 / 1`) plus the checked row give the
  motivational feedback CHANGE-004 asks for;
- academic progress keeps its documented meaning (syllabus-linked tasks only,
  `docs/progress-system.md`).

This resolves U0 Q2 without a product-side trade-off: no progress model changed,
no new storage, no new authority. `storage.js` writes, `progress-engine.js`
calculates, both untouched.

## 4. Implementation

### 4.1 `src/components/tracker/task-group.js` (the U0-identified decision point)

- `ACTIONABLE_CATEGORIES = { revision: true, review: true }` — an explicit
  allow-list of exactly the two named blocks. `break` / `free` / `fixed` are not
  in it and remain informational.
- `actionableTaskId(block, context)` mints the per-day id; returns `null` when
  the caller supplies no usable `{ date, weekNumber }` context (the block then
  renders exactly as before) or the category is not actionable.
- `buildBlockViewModel(block, tasksById, completions, context)` gained an
  **optional 4th parameter**. For an actionable block it appends **one** card
  built by the *same* `TaskCard.buildTaskCardViewModel` the course rows use —
  identical markup, styling and `data-action="toggle-task"` wiring. The card's
  meta line shows the plan's `focus` text (the block header already shows the
  label). `isAcademic` stays `false`; `taskIds` stays empty (no data edit).
- `renderBlockHTML` now renders task rows when `tasks.length > 0`
  (academic **or** actionable), keeps the `block-empty` branch for empty
  academic blocks, keeps every non-academic `block-note`, and shows the count
  badge for actionable blocks (`isAcademic || isActionable`).

### 4.2 `src/components/tracker/daily-tracker.js`

`buildTrackerViewModel` passes `{ date: plan.date, weekNumber: plan.weekNumber }`
into each `buildBlockViewModel` call — the only call site in the app.

### 4.3 Nothing else changed

`task-card.js`, `app.js` (the existing change-delegate handles the new
checkboxes with no edits), `storage.js`, `progress-engine.js`, `tracker.css`
(the established `.task-row` / `.task-checkbox` styling applies as-is), all
`data/**` files.

## 5. Acceptance checklist (requirement → evidence)

| Requirement | Evidence | Result |
|---|---|---|
| Math + Statistics Revision control present & usable | Live `#/day/2026-10-02`: 1 checkbox, `revision:1:2026-10-02`, click → checked, badge `0 / 1` → `1 / 1` | ✅ |
| Daily Review control present & usable | Live: 1 checkbox, `daily-review:1:2026-10-02`, click → checked | ✅ |
| Same established behavior/style | Row markup byte-shaped like course rows: `task-row` + `task-checkbox` + `data-action="toggle-task"`; screenshot shows identical styling, `is-completed` treatment on check | ✅ |
| Persistence through the existing flow | `localStorage["study-planner:state"]` holds both records with `completedAt`; full reload (cache-busted) re-renders both checked; uncheck deletes only its own record | ✅ |
| Course tasks unchanged | Day-1: 19 course checkboxes as before; ticking `mathematics-i:1:L1.1` → `1 / 19 completed, 5%`, record written; all 470 tests green | ✅ |
| Break blocks unchanged & non-actionable | Live: `lunch-rest`, `walk-refresh`, `free-refresh`, `fixed-time`, `relax`, `refresh` all 0 checkboxes, notes intact; U5-04 asserts it for every non-actionable Day-1 block | ✅ |
| No unnecessary redesign | Only 2 source files changed; hero, progress bar, order, layout untouched; hero still `0 / 19` after both blocks ticked (denominator locked) | ✅ |

## 6. Verification

### 6.1 Tests — `node --test` → **470 pass / 0 fail**

| Test | Covers |
|---|---|
| U5-01 | id minting, stability, both `TASK_ID_PATTERN`s, `parseTaskId` round-trip, null-context degradation, non-actionable categories never mint |
| U5-02 | ids unique per block and per day (no cross-day bleed) |
| U5-03 | view model: exactly one control, `isAcademic=false`, plan `taskIds` empty, note preserved |
| U5-04 | HTML reuses checkbox markup + count badge; **every** break/free/fixed Day-1 block still has 0 controls |
| U5-05 | persisted completion renders `checked`/`is-completed`/`1 / 1`; sibling block unaffected |
| U5-06 | controller → `storage.js` round trip for both ids, reload survival, uncheck clears |
| U5-07 | **progress isolation**: `dayProgress` deep-equals pre-U5 output (19), `0 / 19 completed`, subjectBlocks still 4 |
| U5-08 | full tracker renders exactly 21 checkboxes (19 course + 2 block), all original course ids still present |

### 6.2 Browser (§7 protocol) — temp no-store server, port 8098

| Check | Result |
|---|---|
| Block inventory `#/day/2026-10-02` | 21 checkboxes total: study 8/5/4/2, revision 1, review 1; break/free/fixed 0 |
| Click revision + daily-review | both checked, rows `is-completed`, badges `1 / 1`, `study-planner:state` holds both records with `completedAt` |
| Hero after ticking both | `0 / 19 completed`, `0%` — denominator unchanged (Q2) |
| Hard reload (cache-busted) | both remain checked — persistence proven end-to-end |
| Uncheck revision | record removed, badge back to `0 / 1`, daily-review record untouched |
| Course checkbox regression | tick `mathematics-i:1:L1.1` → `1 / 19 completed, 5%`, stored; then unticked |
| Break blocks | 0 checkboxes, notes present, unchanged |
| Console | no JS/runtime errors (only `favicon.ico` 404 — server artifact, no favicon file in repo) |
| Visual | screenshot: Refresh informational; revision `0 / 1` + unchecked row; daily-review `1 / 1` + checked row in native completed styling |

### 6.3 Cleanup

- Test completions removed from browser `localStorage`/`sessionStorage`
  (`study-planner:state: null`, 0 keys left).
- Browser page closed.
- Temp server (`tmp-server.js`, port 8098) stopped, port confirmed free,
  file deleted; `.u5-shots/` deleted.
- Root listing clean: `.claude .cortex .gitignore CLAUDE.md data docs generated
  PROJECT_SPECIFICATION.md README.md reference reports src tests tools
  TRACKING_STORAGE_MANIFEST.json` — no stray artifacts.
- Note: a pre-existing Python `SimpleHTTP` process (PID 16748) from an earlier
  session occupies port **8099**; it was not started by U5 and was left alone.
  U5 used its own no-store server on 8098 to avoid stale-cache false results.
- `data/` untouched today (verified); protected sources untouched.

## 7. Risks / limitations

**LOW.**

1. **Progress exclusion is a deliberate design decision** (§3.2): ticking these
   two blocks does not move day/overall percentages. This keeps every locked
   total (19/413) intact and matches the academic-progress definition. If a
   future change wants them counted, it must add plan tasks via the planner —
   an explicit product decision, not a UI tweak.
2. **Block controls are keyed per date.** Moving a revision block to another
   date in a future replanning feature would orphan its completion record —
   same replay-safe identity argument as course tasks (`docs/planning-rules.md`
   §15).
3. The count badge on actionable blocks (`0 / 1`) is a new-but-tiny visual
   element, using the pre-existing `.block-count` class — no new CSS was added.

## 8. Verdict

# U5 COMPLETE

- Both named blocks render the established completion control, clickable,
  checkable and uncheckable.
- Completion persists through the existing `checkbox → storage.js →
  progress-engine.js` flow with a documented, pattern-conformant per-day id.
- Course-task checkboxes behave exactly as before; all break/free/fixed blocks
  remain non-actionable and unchanged.
- **470/470 tests green**; no locked test or protected file modified;
  `data/**` untouched; cleanup complete.

**STOP — U6 not started.**
