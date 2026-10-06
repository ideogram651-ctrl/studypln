# Study-Planner Tracking Architecture

## 1. Three different data layers

### A. Syllabus
Location:
`data/syllabus/`

Purpose:
"What exists in the IITM course?"

Contains lectures, assignments, graded assignments, question counts, durations, week membership, etc.

This is canonical reference data.

### B. Daily Plan
Location:
`data/schedule/daily/`

Files:
`YYYY-MM-DD.json`

Purpose:
"What is planned for this date, and what has the user completed?"

A daily file may contain tasks such as:
- lecture
- normal assignment
- practice assignment
- graded assignment
- revision
- other planned activity

The task must reference the syllabus item rather than copying the full syllabus item.

Suggested task:

```json
{
  "taskId": "2026-10-02:mathematics-i:w1:item-01",
  "subjectId": "mathematics-i",
  "courseId": "BSMA1001",
  "weekNumber": 1,
  "syllabusItemId": "mathematics-i:w1:item-01",
  "type": "lecture",
  "title": "Display title is allowed for rendering",
  "planned": true,
  "completed": false,
  "completedAt": null
}
```

`title` is only a rendering convenience. The syllabus remains the canonical content source.

### C. Progress Store
Location:
`data/progress/progress.json`

Purpose:
"How much of the selected 4-week study period has been completed?"

It stores aggregate counters by:
- overall
- week
- subject
- subject within week

It should not store the full lecture/assignment catalog again.

## 2. Important rule

The 28 daily files are NOT 28 copies of the syllabus.

They are 28 date-specific plan/state files.

Example:

`2026-10-04.json`

means:
"What should happen on October 4, and which of those tasks are currently complete?"

It does not mean:
"Here is all Week 1 content."

## 3. Day 1-5 / Day 6 / Day 7

The planner can assign task types according to the study strategy:

- Days 1-5: lectures + normal assignments
- Day 6: practice assignments before graded work
- Day 7: graded assignment

This is a planning rule, not a property of the syllabus data.

Therefore the daily JSON should contain the resulting tasks, while `docs/planning-rules.md` should contain the rule itself.

## 4. Calendar interaction

Double-clicking a calendar date:

`calendar.js`
→ resolves `YYYY-MM-DD`
→ loads `data/schedule/daily/YYYY-MM-DD.json`
→ planner/renderer builds the HTML daily view.

The calendar should never need to know the task details itself.

## 5. Completion interaction

Checkbox click:

`HTML checkbox`
→ `taskId`
→ update matching task in daily JSON
→ save daily JSON
→ progress engine recalculates aggregate state
→ save `progress.json`
→ update visible progress bars

## 6. Why task IDs matter

Never identify a task using only an array index.

Use stable references:

`date + subjectId + weekNumber + syllabusItemId`

or a generated stable `taskId`.

This prevents progress from breaking if task order changes.

## 7. Progress calculation

For a given scope:

`percent = completed / total * 100`

The engine should derive:

- Day: tasks completed / tasks planned
- Week: completed syllabus-linked tasks / planned syllabus-linked tasks
- Subject: completed syllabus-linked tasks / planned syllabus-linked tasks
- Overall: all completed syllabus-linked tasks / all planned syllabus-linked tasks

If a task is not intended to contribute to academic progress (for example a personal break), mark it as non-progress or give it a task category that the progress engine excludes.

## 8. Source of truth

There are two different truths:

### Content truth
`data/syllabus/*.json`

### User-state truth
`data/schedule/daily/*.json`

`progress.json` is a derived aggregate/cache of user-state truth.

If `progress.json` ever becomes inconsistent, the engine should be able to rebuild it from the daily JSON files + syllabus JSON.
