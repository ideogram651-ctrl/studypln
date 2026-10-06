# Progress JSON Schema — Conceptual Contract

`progress.json` is an aggregate state/cache.

Minimum hierarchy:

```text
overall
├── subjects
│   ├── mathematics-i
│   │   ├── overall
│   │   └── weeks
│   │       ├── week-1
│   │       ├── week-2
│   │       ├── week-3
│   │       └── week-4
│   ├── statistics-i
│   ├── computational-thinking
│   └── english-i
└── weeks
    ├── week-1
    │   ├── overall
    │   └── subjects
    ├── week-2
    ├── week-3
    └── week-4
```

Every progress node should use:

```json
{
  "total": 0,
  "completed": 0,
  "percent": 0
}
```

The same progress can therefore be rendered in:
- overall dashboard
- subject cards
- week cards
- week × subject matrix
- daily tracker
- downloadable reports

Do not treat `percent` as authoritative if it can be recomputed. It is a cached render value and should be recalculated whenever completion state changes.

Empty scopes (0 total tasks) are defined as `{ "total": 0, "completed": 0, "percent": 0 }` — never NaN/Infinity (Phase 2 decision). This file remains derived data: the progress engine rebuilds it from syllabus + completion state (see `docs/phase2-core-architecture.md`).

