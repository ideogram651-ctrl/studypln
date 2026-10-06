# Progress Storage

`progress.json` is the mutable aggregate progress store.

It does NOT duplicate the syllabus.

## Source relationships

- `data/syllabus/*.json` = canonical course content
- `data/schedule/daily/YYYY-MM-DD.json` = that day's planned tasks + task completion state
- `data/progress/progress.json` = aggregate progress derived from completed daily tasks

## Update flow

1. Calendar selects a date.
2. Planner loads `data/schedule/daily/YYYY-MM-DD.json`.
3. Renderer displays the day.
4. User ticks/unticks a task.
5. The daily JSON is updated.
6. Progress engine reads the task's syllabus reference:
   - subjectId
   - weekNumber
   - itemId
7. Progress engine recalculates:
   - day progress
   - week progress
   - subject progress
   - overall progress
8. `progress.json` is saved.
9. Progress UI/progress bars re-render.

Progress must always be calculated from task state; never hard-code percentages.
