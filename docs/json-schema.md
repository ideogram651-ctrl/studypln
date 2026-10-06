# JSON Data Model

This document defines the logical JSON contracts. Exact syllabus content must come from the supplied course source files.

## 1. Course/Syllabus

```json
{
  "courseId": "BSMA1001",
  "courseName": "Mathematics I",
  "subjectId": "mathematics-i",
  "weeks": [
    {
      "weekId": "math-w1",
      "weekNumber": 1,
      "title": "Week 1",
      "items": [
        {
          "sourceId": "L1.1",
          "type": "lecture",
          "title": "Natural Numbers",
          "durationSeconds": 1249
        },
        {
          "sourceId": "AQ1.1",
          "type": "activity",
          "title": "Activity Questions",
          "questionCount": 5
        }
      ]
    }
  ]
}
```

### Rules

- `courseId` is stable.
- `subjectId` is stable.
- `weekId` is stable.
- `sourceId` must identify the original syllabus item.
- Duration is stored in seconds when known.
- Missing source information must remain missing/null rather than invented.

---

## 2. Schedule

```json
{
  "scheduleVersion": 1,
  "plans": [
    {
      "date": "2026-10-04",
      "subjectId": "mathematics-i",
      "weekId": "math-w1",
      "tasks": [
        {
          "taskId": "mathematics-i:1:L1.1",
          "sourceId": "L1.1",
          "type": "lecture",
          "plannedDate": "2026-10-04"
        }
      ]
    }
  ]
}
```

### Task ID rule

Persistent state must use a stable semantic ID.

`taskId` is date-independent: `<subjectId>:<weekNumber>:<sourceId>` (Phase 2
decision — the planned date lives in `plannedDate`; see
`docs/phase2-core-architecture.md`).


Do not use:

```text
task-0
task-1
task-2
```

Do not use array indexes as identity.

---

## 3. Fixed blocks

Fixed personal schedule blocks may exist separately from syllabus tasks.

Example:

```json
{
  "blockId": "fixed-18-20",
  "type": "fixed",
  "start": "18:00",
  "end": "20:00",
  "title": "Temple + Food + Personal"
}
```

Fixed blocks are schedule entities, not course syllabus items.

---

## 4. Progress

```json
{
  "version": 1,
  "tasks": {
    "mathematics-i:1:L1.1": {
      "completed": true,
      "completedAt": "2026-10-04T12:31:00+05:30"
    }
  }
}
```

Progress should contain state, not copied syllabus metadata.

---

## 5. Report model

A report model should be serializable and contain enough information for the exporter to render the requested scope.

Example:

```json
{
  "reportType": "week",
  "generatedAt": "2026-10-04T20:00:00+05:30",
  "subjectId": "mathematics-i",
  "weekId": "math-w1",
  "progress": {
    "completed": 12,
    "total": 15,
    "percentage": 80
  },
  "categories": {},
  "days": []
}
```

The report model is derived data. It is not the source of truth.

---

## 6. Dates

Use ISO date format:

```text
YYYY-MM-DD
```

Example:

```text
2026-10-04
```

Timestamps should use ISO 8601.

---

## 7. Nullability

If source data does not contain a value, prefer:

```json
null
```

rather than fabricating a value.

---

## 8. Compatibility

Schema changes must be versioned when persisted data would otherwise become ambiguous or incompatible.
