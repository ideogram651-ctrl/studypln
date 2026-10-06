# Progress System

## 1. Purpose

Progress is a calculated view of actual task completion.

The system is hierarchical:

```text
OVERALL
  ↓
SUBJECT
  ↓
WEEK
  ↓
DAY
  ↓
TASK
```

---

## 2. Source of truth

The authoritative completion state is the persisted progress state.

A percentage displayed in the UI is never the source of truth.

---

## 3. Calculation hierarchy

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

Each higher level aggregates lower-level task state.

---

## 4. Task progress

For a scope:

```text
completedTasks / totalTasks
```

Percentage:

```text
(completed / total) × 100
```

Define a clear policy for an empty scope; the implementation must not produce NaN or Infinity.

---

## 5. Category progress

Group tasks by semantic type.

Example:

```text
Lecture:   8 / 10
Activity:  7 /  8
Practice:  3 /  5
Graded:    1 /  2
```

The category breakdown is descriptive and must derive from actual tasks.

---

## 6. Daily completion

A day report should include:

- date
- subject(s)
- tasks
- completion state
- completion timestamps where available
- task categories
- percentage

---

## 7. Week completion

A week report should include:

- subject
- week number
- week percentage
- all included days
- all tasks
- category breakdown

---

## 8. Subject completion

A subject report should include:

- subject identity
- overall subject percentage
- every included week
- week percentages
- detailed tasks

---

## 9. Overall completion

Overall progress combines all configured subjects.

The overall report should be able to drill through:

```text
Subject
 → Week
   → Day
     → Task
```

---

## 10. Double-click behavior

Double-clicking a progress scope should open the next appropriate detail level.

Examples:

```text
Overall → Subject detail
Subject → Week detail
Week → Day/task detail
Day → Task detail
```

The exact UI transition may be implemented as a modal, panel, route, or view, but the underlying data model must remain the same.

---

## 11. Daily tracker synchronization

When a task is checked in the daily tracker:

1. Persist the stable `taskId`.
2. Update completion state.
3. Recalculate affected day.
4. Recalculate affected week.
5. Recalculate affected subject.
6. Recalculate overall progress.
7. Refresh visible progress UI.

No separate manual update should be required.

---

## 12. Deep syllabus view

The deep view is generated from:

```text
Syllabus + Schedule + Progress
```

It should show both completed and incomplete items.

Completed:

```text
✓
```

Incomplete:

```text
○
```

The deep view is not a second syllabus database.
