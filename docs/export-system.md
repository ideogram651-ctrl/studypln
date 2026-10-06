# Export System

## 1. Purpose

Export provides user-facing standalone HTML reports from calculated report models.

---

## 2. Architecture

```text
Syllabus
   +
Schedule
   +
Progress
   ↓
Progress Engine
   ↓
Report Model
   ↓
Export Engine
   ↓
HTML
```

The exporter does not own progress calculations.

---

## 3. Required export scopes

### Daily

```text
reports/daily/YYYY-MM-DD.html
```

### Weekly

```text
reports/weekly/<Subject>-Week-<N>.html
```

### Subject

```text
reports/subjects/<Subject>-Progress.html
```

### Overall

```text
reports/overall/IITM-Overall-Progress.html
```

---

## 4. Self-contained requirement

An exported report should not require:

- the Study-Planner application
- the source JSON files
- localStorage from the app
- an internet connection
- a backend server

The report should contain the data needed to display itself.

---

## 5. Interactivity

HTML reports should support useful browser-native interactions such as:

- expand/collapse sections
- week/day/task hierarchy
- completion indicators
- category summaries
- readable progress bars

A lightweight inline `<script>` is acceptable.

Avoid external runtime dependencies in exported reports.

---

## 6. Report hierarchy

Overall report:

```text
Overall
 ├── Mathematics I
 │    ├── Week 1
 │    │    ├── Day 1
 │    │    │    └── Tasks
 │    │    └── ...
 │    └── ...
 ├── Statistics
 ├── Computational Thinking
 └── English
```

---

## 7. Export safety

Export must be read-only with respect to application progress.

Generating a report must not mark tasks complete, alter schedules, or modify syllabus data.

---

## 8. Future formats

The report model should remain format-neutral so future outputs can include:

```text
Report Model
 ├── HTML
 └── PDF (future)
```

Do not make the report model dependent on HTML-specific DOM objects.
