# U2 — Calendar Experience + Shared UI

**Project:** Study-Planner — IIT Madras BS Data Science Study Planner
**Repository:** `E:\Study-Planner\`
**Phase:** U2 — Calendar Experience
**Implements:** CHANGE-001 §§2–9 (calendar UI, navigation, metadata, notes/events)
**Status:** COMPLETE — all 40 acceptance criteria verified
**Date:** 2026-10-05

> **Scope boundary.** U2 is the Calendar *experience* phase. U1 created the canonical
> truth; U2 makes the UI consume it. No Reports, Progress, Tracker, Planner, Storage or
> Progress-Engine behaviour was changed. U3–U6 work was not started.

---

## 1. U2 Status

**COMPLETE.** Test suite grew **323 → 386** (63 new U2 tests) with **0 failures** and
**0 regressions** to the 323-test U1 baseline.

## 2. Objective

Transform the minimal Calendar into a canonical-data-driven experience: study-week-aware
Weekly navigation, calendar-month Monthly navigation, mode-specific headers, visible
study-cycle metadata (week/day/graded/practice), a selected-date context panel, and
lightweight Add Note / New Event interactions — all driven by `data/calendar/calendar-2026.json`.

## 3. References Used

| Reference | How it was used |
|---|---|
| Change spec JSON | CHANGE-001 `machine_summary` + `complete_pdf_text` §§2–9 (mode-specific navigation, date-level hints, notes/events, functional-preservation and acceptance clauses). |
| Change spec PDF (27 pp, read) | §3.1 mode-specific navigation ("Oct Week 1 - 2026", "October 2026"), §6 Date-Level Visual Hints (the 2→8 Oct mapping table), §7 Add a Note / New Event. |
| `reports/update-u0-architecture-audit.md` | R-01 (week boundary), §5 reuse-first list, §9 identity model, §10 reusable components, §12 protected areas. |
| `reports/update-u1-calendar-data-foundation.md` | The U1 schema and `getStudyWeekDates()` contract consumed here. |
| U0/U1 source | `calendar.js`, `app.js`, `index.html`, `calendar.css`, all components. |

## 4. U1 Baseline

| Metric | Value |
|---|---|
| Tests before U2 | **323 / 323 pass** (measured, matches the U1 report) |
| Canonical calendar | 365 dates, 12 months, 28 active study dates |
| Study weeks | W1 Oct 2–8 · W2 Oct 9–15 · W3 Oct 16–22 · W4 Oct 23–29 |

Baseline confirmed at the start of U2 before any change.

## 5. Architecture Reused

| Reused asset | How U2 used it |
|---|---|
| `calendar.js createCalendarAccess` (U1) | The single source of study-week/day/graded/practice facts for the whole UI. |
| `getStudyWeekDates(n)` (U1) | Weekly mode date source — the Friday→Thursday strip. |
| `getAdjacentStudyWeek` (U1) | Study-week navigation, clamped to the canonical set. |
| `getStudyWeekForDate` (U1) | Resolves which week a selected date belongs to. |
| `buildWeekDates` (Sun→Sat) | **Deliberately retained and still unused by Weekly mode.** |
| `buildDayCell` / `buildMonthModel` / `renderMonthHTML` | Kept byte-identical; U2 added parallel `*WithMeta` builders so existing callers/tests are untouched. |
| `createPlanStore` | Daily-plan fetching unchanged (now gated by canonical data). |
| `storage.js` | Sole completion authority — untouched. |
| `Renderer.escapeHtml` | All new HTML escaped (verified by a test). |

## 6. Calendar Data Integration

`app.js` gained `createCalendarStore()`: an injectable, promise-cached loader that fetches
the canonical JSON **once per lifecycle** and returns a `createCalendarAccess` layer. The
access layer is cached in app state, so the 261 KB file is parsed once, not per cell render.
A load failure renders `renderCalendarUnavailableHTML()` — a clear, non-destructive message
that fabricates no dates and leaves the rest of the app working.

## 7. Monthly Mode

Monthly mode remains an **ordinary calendar month**. It uses the existing
`Calendar.buildMonthGrid` / `addMonths` — untouched by U2.

- **Header:** `October 2026` (calendar month + year), from `Calendar.monthTitle`.
- **Navigation:** `previous` / `next` step `addMonths`. Verified live: October → September →
  November → October.
- **Grid:** verified all 31 October dates render (1 … 31); no study-week logic is applied.
- No Friday→Thursday logic anywhere in Monthly mode.

## 8. Weekly Mode

**This is the core U2 behaviour change.** Weekly mode renders a **Study Planner study week
(Friday → Thursday)** sourced from the canonical access layer, never `buildWeekDates()`.

| Week | Rendered dates (live-verified) |
|---|---|
| W1 | Fri 2026-10-02 · Sat 10-03 · Sun 10-04 · Mon 10-05 · Tue 10-06 · Wed 10-07 · **Thu 10-08 (Graded)** |
| W2 | 2026-10-09 → 2026-10-15 |
| W3 | 2026-10-16 → 2026-10-22 |
| W4 | 2026-10-23 → 2026-10-29 |

**Explicitly verified: `2026-09-27` does NOT appear for W1** (the exact defect U0 recorded
as R-01). `2026-10-03` does appear, confirming the strip is the study week and not a
shifted calendar week.

An out-of-cycle selection renders a readable "outside the active study cycle" message rather
than an empty or fabricated strip.

## 9. Study-Week Navigation

`shiftPeriod` in Weekly mode now calls `access.getAdjacentStudyWeek(weekNumber, delta)`:

- Navigation **clamps to the canonical week set** — at W4 "next" and at W1 "previous" it
  stops rather than inventing a week 5 or week 0.
- The **study-day position is preserved** across a week change (Day 3 → Day 3 of the next week).
- Selecting a date re-derives the visible week from canonical data (`weekNumber = null`).

Verified live: W1 → W2 → W3 → W4, then stops; and back W4 → W3 → W2 → W1, then stops.

## 10. Monthly Navigation

Unchanged semantics, verified live at every width: October 2026 → September 2026 → October
2026 → November 2026 → October 2026. Month navigation is independent of study weeks.

## 11. Weekly/Monthly Toggle

The existing `.segmented` control is retained and made mode-explicit:
`aria-pressed="true"` on the active mode, `"false"` on the other (asserted by tests M1).
Navigation buttons carry **mode-specific accessible labels** — "Previous study week" /
"Next study week" in Weekly, "Previous month" / "Next month" in Monthly. Switching modes
preserves the selected date and never touches completion or planner data.

## 12. Date Metadata

Study metadata is **layered onto canonical records**, never recomputed in the UI:

- Month cell: day number, progress bar, `W1 · D1`, a special badge, note/event dots.
- Week card: weekday, day number, `D1`, special badge, progress.
- Context panel (selected date): full date, weekday, Study week, Study day, Cycle day
  (`1 of 28`), Special, Daily plan availability, notes and events.

Live-verified context panels:
- `2026-10-02` → Week 1 · Day 1 · Cycle day 1 of 28 · Special: Week start
- `2026-10-08` → Week 1 · Day 7 · Cycle day 7 of 28 · Special: **Graded**
- `2026-10-09` → Week 2 · Day 1 · Cycle day 8 of 28 · Special: Week start
- `2026-10-30` (inactive) → "Not part of the active cycle", **no** study-week rows

## 13. Graded-Day UI

Graded markers come from `record.isGradedDay` / `record.special` in the canonical calendar —
**no hardcoded dates anywhere in the UI**. Verified: all four canonical graded dates
(`10-08`, `10-15`, `10-22`, `10-29`) render a `Graded` badge, October shows exactly **4**
graded cells, and no non-graded date is styled as graded.

## 14. Practice-Day UI

Practice days (`10-07`, `10-14`, `10-21`, `10-28`) render a `Practice` badge using the
canonical `isPracticeDay` flag. They are visually secondary to graded (different colour and
class), and never reuse the graded class — asserted by test K1. No new practice calculation
was invented.

## 15. Selected-Date Behavior

Selection reuses the **existing** `state.selectedDate`; no competing store was created.
`setSelectedDate` re-derives the visible week in Weekly mode and triggers a full re-render
so the context panel refreshes. Exactly one cell reports `aria-pressed="true"` (test L2).
Selection does not alter completion state, planner data, or the daily-plan data.

## 16. Notes Architecture

New module **`src/js/calendar-metadata.js`** — a dedicated persistence layer:

| Property | Value |
|---|---|
| Storage key | `study-planner:calendar` (**distinct** from `study-planner:state`) |
| Backend | `localStorage`, with a memory fallback and an injectable backend for tests |
| Model | `{ schemaVersion, notes: { "YYYY-MM-DD": [{ id, date, text, time, createdAt }] }, events: {...} }` |
| Determinism | IDs are content-hashed (no clock read, no randomness) |
| Robustness | Missing → empty; malformed → diagnostics + empty reads, **writes refused until `reset()`** (no silent overwrite); individual bad entries dropped, valid ones kept |
| Validation | ISO date required; empty/whitespace text rejected; text capped at 500 chars |
| Removal | `removeNote` / `removeEvent` supported |

`createMemoryBackend` is exported for tests, mirroring `storage.js`.

## 17. Events Architecture

Same module and key. The event model is deliberately minimal — `id`, `date`, `title`
(`text`), optional `time` (validated `HH:MM`, stored as given, never shifted) — as required.
No recurrence, attendees, reminders or notifications were invented.

## 18. Persistence Isolation

**Proven in tests and live in the browser:**

| Scenario | Result |
|---|---|
| Add a note | `study-planner:state` remains `null`/unchanged ✅ |
| Add an event | `study-planner:state` remains `null`/unchanged ✅ |
| Complete a task | note/event store unchanged; note still present ✅ |
| Unrelated localStorage keys | preserved through reset ✅ |
| Metadata payload contents | contains no `completed` / `checked` / `percent` / `progress` field ✅ |

Live browser confirmation: after ticking a tracker checkbox, `study-planner:state` held the
completion while `study-planner:calendar` stayed `null`.

## 19. Shared UI Changes

**Intentionally minimal.** U2 made only the shared-shell change the Calendar needed:
registering the two new scripts in `index.html`. No header/logo/branding change was made —
CHANGE-005's Task Square SVG asset is **not present in the repository** (U0 risk R-11), so
substituting an approximation would violate "do not replace the uploaded icon with a
different icon". `base.css` and `components.css` were **not modified**. `reportShell` was
**not touched** — the full Reports breadcrumb hierarchy is CHANGE-002 and is left for the
phase that owns it.

All new styling lives in `src/css/calendar.css`, using the existing design tokens, so no
theme or layout system was disturbed.

## 20. Files Changed

### CREATED (3)
| File | Purpose |
|---|---|
| `src/js/calendar-metadata.js` | Notes/events persistence (dedicated key, isolated from completion) |
| `src/components/calendar/calendar-context.js` | View-model layer: headers, cell metadata, date context |
| `tests/renderer/calendar-u2.test.js` | 63 U2 tests |

### MODIFIED (7)
| File | Change |
|---|---|
| `src/js/app.js` | `createCalendarStore`, study-week navigation, canonical `renderCalendar`, note/event actions, new injectable stores |
| `src/components/calendar/week-view.js` | **Added** `buildStudyWeekModel` / `renderStudyWeekHTML` (Friday→Thursday). Legacy functions untouched. |
| `src/components/calendar/month-view.js` | **Added** `*WithMeta` builders/renderers. Legacy functions untouched. |
| `src/components/calendar/calendar-view.js` | **Added** `buildModeViewModel`, `renderDateContextHTML`, `renderCalendarHTMLWithMeta`, `renderCalendarUnavailableHTML`. Legacy untouched. |
| `src/css/calendar.css` | Metadata badges, context panel, note/event styles, responsive rules |
| `src/index.html` | Registered `calendar-metadata.js` and `calendar-context.js` |
| `tests/renderer/app.test.js`, `tests/renderer/progress.test.js` | **Harness only:** injected the new `calendarStore` / `calendarMetadata` dependencies. No assertion was changed, weakened or deleted. |

### UNCHANGED / PROTECTED (verified)
| System | Verification |
|---|---|
| `data/calendar/calendar-2026.json` | **MD5 byte-identical** — never written at runtime |
| `data/schedule/daily/*.json` (28) | **MD5 byte-identical** |
| `data/syllabus/*` (6) | **MD5 byte-identical** |
| `data/progress/*` (2) | **MD5 byte-identical** |
| `src/js/planner-engine.js` | mtime 10-04 21:39 — untouched |
| `src/js/storage.js` | mtime 10-04 20:58 — untouched (sole completion authority) |
| `src/js/progress-engine.js` | mtime 10-04 20:58 — untouched (sole progress authority) |
| `src/js/report-model.js`, `export-engine.js` | mtime 07:03 / 07:01 — untouched |
| `src/components/progress/*` (6) | newest mtime 10-05 00:49 — untouched |
| `src/components/reports/*` (4) | newest mtime 10-05 06:53 — untouched |
| `src/components/tracker/*` (3) | newest mtime 10-04 22:47 — untouched |
| `src/css/{progress,reports,tracker}.css`, `base.css`, `components.css` | untouched |
| `src/js/calendar.js` | unchanged in U2 (U1 additions only) |
| `tools/generate-calendar.js`, `tests/data/calendar-validation.test.js` | unchanged; `--check` still reports no drift |

> **Integrity method.** MD5 hashes of all 37 `data/` files were captured **before** U2 and
> re-verified **after** — all byte-identical, including the canonical calendar.

## 21. Protected Files Verified

All of §20's protected list verified by MD5 (data) and timestamp (source). No protected file
required modification for U2. `storage.js` remains the sole completion authority and
`progress-engine.js` the sole progress authority; the calendar layer introduces no
alternative and computes no progress of its own.

## 22. Tests Added/Updated

New: `tests/renderer/calendar-u2.test.js` — **63 tests**, covering groups A–T:
canonical loading, monthly navigation/coverage, weekly study-week navigation, exact W1–W4
ranges, Friday→Thursday boundary, week-header derivation, study/graded/practice metadata
rendering, selection, notes (add/read/date-specific/reload/remove/validation/counts),
events (add/read/reload/optional time/remove), malformed-metadata recovery, isolation,
tracker navigation, legacy-behaviour preservation, toggle semantics, accessible labels,
failure state, and HTML escaping.

Updated (harness only): `app.test.js`, `progress.test.js` — the app gained two injectable
dependencies; the harnesses now supply them. **No existing assertion was changed.**

## 23. Test Results

| Run | Result |
|---|---|
| U1 baseline (pre-U2) | 323 tests, **323 pass**, 0 fail |
| U2 suite alone | 63 tests, **63 pass**, 0 fail |
| **Final full suite** | **386 tests, 386 pass, 0 fail, 0 skipped, 0 todo** |

Zero regressions to the 323 baseline tests.

> **Note on a temporary regression.** The first app.js wiring caused 4 test failures because
> the existing harnesses injected `planStore` but not the new `calendarStore`, so the app fell
> back to a real `fetch` in Node. Fixed by injecting the dependency into the harnesses — a
> harness update, not a weakened test. One follow-on error (`createMemoryBackend is not a
> function`) was a genuine missing export, fixed by exporting it as `storage.js` does.

## 24. Browser Validation

Server: `python -m http.server 8099 --directory E:\Study-Planner`.

| Check | Result |
|---|---|
| Boot | ✅ clean, title `Study-Planner — IIT Madras BS` |
| Canonical calendar fetch | ✅ HTTP 200, 261,580 bytes |
| Monthly header + grid | ✅ `October 2026`, 31 cells, Oct 31 present, Oct 1 shows no study metadata |
| Monthly navigation | ✅ Sept / Nov / back to Oct |
| Graded markers | ✅ 4 in October; Oct 8 and Oct 29 show `Graded` |
| Practice markers | ✅ 4 in October; Oct 7 shows `Practice` |
| Context panel | ✅ Oct 2 → Week 1 / Day 1 / 1 of 28 / Week start |
| Weekly W1 | ✅ header `Oct Week 1 - 2026`, subtitle `Oct 2 - Oct 8`, 7 cards Oct 2→8 |
| **W1 has no Sep 27** | ✅ verified `containsSep27: false` |
| Weekly navigation | ✅ W1→W2→W3→W4 then stops; back to W1 then stops |
| Add note | ✅ prompt → note stored and displayed with dot indicator |
| Add event | ✅ prompt → title + optional time stored and displayed |
| Reload persistence | ✅ note and event survived a full page reload |
| Date specificity | ✅ Oct 15 shows no notes from Oct 8 |
| Mode/month switching | ✅ notes preserved |
| Completion isolation | ✅ `study-planner:state` null after notes/events; tracker tick writes state, calendar key untouched |
| Tracker completion | ✅ 19 checkboxes, "1 / 19 completed, 5%" |
| Boundary dates | ✅ `#/day/2026-10-01` and `#/day/2026-10-30` show the "No study plan" state; no fabricated plans |
| All routes | ✅ 12 routes render (calendar, tracker ×4, progress ×2, reports ×5) |
| Test data cleanup | ✅ validation notes/events/completions removed afterwards |

> **Environment note.** A browser HTTP cache initially served stale modules (a known quirk
> recorded in U0). Confirmed the server was correct, then cleared the browser cache via CDP;
> all results above are from the clean cache.

## 25. Responsive Validation

Measured at 1440 / 1024 / 768 / 390 px in both modes:

| Width | Page overflow | Month cells | Week cards | Toggle | Nav | Context actions |
|---|---|---|---|---|---|---|
| 1440 | **0** | 31 | 7 (Oct 2–8) | ✅ | ✅ | 3 |
| 1024 | **0** | 31 | 7 | ✅ | ✅ | 3 |
| 768 | **0** | 31 | 7 | ✅ | ✅ | 3 |
| 390 | **0** | 31 | 7 | ✅ | ✅ | 3 |

No horizontal page overflow at any width; graded markers render at every size; compact
metadata and full-width action buttons are applied below 640 px.

## 26. Console Validation

On a clean, cache-busted load: **0 console errors** during the full validation pass
(including tracker completion). The only console entry is the pre-existing benign
`favicon.ico` 404 from the U0/U1 baseline. The out-of-cycle plan 404s that Monthly browsing
would otherwise generate are now prevented by gating plan fetches on canonical data — a
U2 improvement, not a regression.

## 27. Risks / Limitations

**LOW**
- **Note/event input uses `window.prompt`.** Deliberately lightweight and dependency-free, and
  it keeps the Calendar uncluttered as the spec asks. It is modal and not ideal for long text
  or rich events; an inline editor would be a U6-quality-of-life improvement.
- **Notes/events are stored per browser profile.** They are runtime user metadata, so this is
  expected; there is no sync or export.
- **Weekly navigation clamps at the cycle boundary.** A user cannot page past W4 or before W1.
  This follows the spec's four active study weeks; the behaviour is derived from canonical data,
  so a future second cycle would extend the range automatically.
- **Selecting an out-of-cycle date while in Weekly mode shows an explanatory empty state**
  rather than auto-jumping to the nearest cycle week. Monthly mode remains fully browsable.
- **The calendar covers 2026 only.** A different year needs a regenerated canonical file.
- **CHANGE-005 (Task Square logo) was NOT implemented** — the asset is absent from the
  repository, and inventing an icon would violate the specification.

**INFORMATIONAL**
- `setSelectedDate` now triggers a full render instead of the previous targeted DOM toggle,
  because the context panel must also refresh. Plan fetching is cached, so this stays cheap.
- Test harnesses (`app.test.js`, `progress.test.js`) gained the new injected stores; assertions
  are unchanged.

**No BLOCKER or HIGH risks. No scope was exceeded.**

## 28. U2 Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Calendar uses U1 canonical data | ✅ | `createCalendarStore`; browser fetch 200 |
| 2 | Monthly navigates by calendar month | ✅ | B3; browser Sept/Oct/Nov |
| 3 | Weekly navigates by study week | ✅ | C3/C4; browser W1→W4 |
| 4 | Weekly uses Friday→Thursday | ✅ | C2, G2 |
| 5 | W1 = Oct 2–8 | ✅ | D1; browser `containsSep27:false` |
| 6 | W2 = Oct 9–15 | ✅ | E1 |
| 7 | W3 = Oct 16–22 | ✅ | F1 |
| 8 | W4 = Oct 23–29 | ✅ | G1 |
| 9 | Monthly October remains a normal month | ✅ | B2 (1…31) |
| 10 | Headers communicate correct context | ✅ | I1/I2; browser |
| 11 | Toggle communicates active mode | ✅ | M1 (`aria-pressed`) |
| 12 | Selected-date treatment works | ✅ | L1/L2 |
| 13 | Study Week metadata from canonical data | ✅ | I3 |
| 14 | Study Day metadata from canonical data | ✅ | G2; context panel |
| 15 | Graded dates from canonical metadata | ✅ | J1–J3; 4 in Oct |
| 16 | Practice metadata only if canonically supported | ✅ | K1/K2 |
| 17 | Add Note works | ✅ | M1; browser |
| 18 | Notes persist | ✅ | N1; browser reload |
| 19 | Notes remain date-specific | ✅ | M2; browser Oct 15 check |
| 20 | New Event works | ✅ | O1; browser |
| 21 | Events persist | ✅ | P1; browser reload |
| 22 | Events remain date-specific | ✅ | O2 |
| 23 | Notes/events don't modify completion storage | ✅ | T1–T4; browser |
| 24 | Existing task completion still works | ✅ | browser "1 / 19, 5%" |
| 25 | Daily Tracker navigation still works | ✅ | R1–R3; 4 day routes |
| 26 | Progress still works | ✅ | browser `#/progress` |
| 27 | Reports still work | ✅ | browser 5 report routes |
| 28 | No planner logic duplicated | ✅ | §13 authority chain |
| 29 | No progress logic duplicated | ✅ | views render engine values only |
| 30 | No completion store duplicated | ✅ | distinct key, §18 |
| 31 | Canonical calendar JSON remains static | ✅ | MD5 unchanged |
| 32 | Daily plan JSON unchanged | ✅ | MD5 unchanged (28) |
| 33 | Syllabus unchanged | ✅ | MD5 unchanged (6) |
| 34 | No external dependencies | ✅ | no package.json added |
| 35 | Desktop browser validation passes | ✅ | §24 |
| 36 | 390 px responsive validation passes | ✅ | §25 (overflow 0) |
| 37 | No new console errors | ✅ | §26 (0 errors) |
| 38 | Full regression suite passes | ✅ | 386/386 |
| 39 | Weekly does NOT show Sep 27 → Oct 3 | ✅ | C2; browser |
| 40 | Study-day position preserved across weeks | ✅ | §9 |

**40/40 verified.**

## 29. Final Verdict

**U2 COMPLETE.** The Calendar is now driven end-to-end by the U1 canonical data. Weekly mode
shows genuine Friday→Thursday study weeks (W1 = Fri 2 Oct → Thu 8 Oct, with no Sep 27 leak),
Monthly mode remains a normal calendar month, headers are mode-specific, study-week/day and
graded/practice metadata are visible and data-driven, selection drives a contextual panel,
and Add Note / New Event persist per date in an isolated store that never touches completion
state. All 40 acceptance criteria are verified by tests and live browser validation; the full
suite passes 386/386 with zero regressions; every protected file is byte-identical; and the
application produces zero console errors.

**Ready for U3 (Reports: Overall + Weekly Timetable Chart).** The Calendar is stable and its
boundaries are proven.

---

## 30. Authority Chain (required by the brief)

```text
Calendar dates/metadata ....... data/calendar/calendar-2026.json      (U1, read-only)
Calendar date access ........... src/js/calendar.js (createCalendarAccess)
Planner ....................... src/js/planner-engine.js              (untouched)
Task completion ................ src/js/storage.js                      (untouched)
Progress ....................... src/js/progress-engine.js              (untouched)
Calendar notes/events .......... src/js/calendar-metadata.js           (NEW, own key)
Reports ........................ existing Report Model / Reports architecture (untouched)
```

**Explicit confirmation:** U2 introduced **no duplicate planner, no duplicate progress engine,
and no duplicate completion store.** The only new persistence is the calendar notes/events
layer, which uses its own key (`study-planner:calendar`) and holds no completion or progress
state. The canonical calendar JSON was read but never written.

## 31. Deferred Work

| Item | Deferred to | Reason |
|---|---|---|
| CHANGE-002 Reports breadcrumb (Calendar → Reports) | U2 boundary / U3 | Belongs to CHANGE-002; `reportShell` deliberately untouched |
| CHANGE-003 reports work (naming, week selector, 12-hour axis, break blocks, scrollbar, table alignment) | U3 / U4 | Reports phases |
| CHANGE-004 tracker revision/review checkboxes | U5 | Tracker phase; still blocked on the task-ID decision |
| CHANGE-005 Task Square logo | not scheduled | **Asset absent from the repository** — needs the uploaded SVG |
| No git repository exists | U6 | Recommended before further phases for change review/rollback |
