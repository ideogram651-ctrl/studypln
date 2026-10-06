# Update U4.1 — Daily Report Schedule table header alignment (TASKS / PROGRESS)

## 1. Problem

In the **Daily Report Schedule table**, the TASKS and PROGRESS **headers** were
left-aligned while their **values** are right-aligned (right column, numbers
read as TIME | BLOCK | CATEGORY on the left and TASKS | PROGRESS on the right).
The mismatch made the two right columns read as visually shifted — the same
header→column defect that U3 §2 (Overall) and U4 §4.2 (Weekly) already fixed for
their scopes. The Daily scope was simply missing the corresponding rule.

## 2. Root cause (CSS specificity)

`.rp-table th` (selector weight 0-0-1-1) **beats** the bare `.rp-num` class on
`th` (0-1-0), so the table-header base rule `text-align: left` won on the day
report's numeric headers. The `overall` (U3) and `week` (U4 §4.2) scopes carry a
scoped `th.rp-num` override; the `day` scope had none.

## 3. Fix — one scoped rule in `src/css/reports.css`

Added after the existing `week` rule (line 115):

```css
.rp-root[data-report-kind="day"] .rp-table th.rp-num { text-align: right; }
```

Scoped to `data-report-kind="day"` (emitted by `renderReportHTML`, report-viewer.js:244).
Within that scope only the Schedule table has numeric headers; the locked Tasks
table (Task/Type/State) has none, so it is unaffected — as are the weekly,
overall, subject reports and all export paths (ExportEngine exports the calendar
only, not report tables, so no export CSS copy is needed).

## 4. Verification

- **Full suite: 483/483 pass, 0 fail** (`node --test`).
- **Browser measurement** (`http://localhost:8099/src/index.html#/reports/day/2026-10-02`):
  - Schedule table — Time/Block/Category: th=left, delta 0; **Tasks & Progress:
    th=right, td=right, delta 0** on all 12 rows.
  - Tasks table (2nd table) — Task/Type/State all left, delta 0 (locked table
    unaffected).
- No test forbids a day-scoped `th.rp-num` rule (checked); the single edited
  file is `e:\Study-Planner\src\css\reports.css`.
