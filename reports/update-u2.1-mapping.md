# U2.1 — Reference → Existing Application Map (working note)

## Reference HTML → Existing components

| Reference node | Existing target |
|---|---|
| `.page` | `body` (already `#050507` + purple glow in base.css) |
| `.app-navbar` / `.brand` / `.nav-action` | **existing** `.app-header` / `.app-brand` / `.app-nav` — KEEP (do not redesign) |
| `.stage` | existing `#view` (`.app-view`) |
| `.calendar-card` | new `.calendar-card` rendered by calendar-view.js |
| `.dummy-month-nav` (‹ label ›) | NEW nav row; label = Study Week (weekly) / Month (monthly) |
| `.segmented` Weekly\|Monthly | NEW; **order flipped** from U2 (Monthly\|Weekly) |
| `.hero-date` `.month-name` / `.day-number` | NEW; bound to existing `state.selectedDate` |
| `.weekly-area` `.curve` `.week-viewport` `.week-track` `.week-day` | NEW continuous date wheel over canonical dates |
| `.monthly-area` `.month-grid` `.grid-head` `.grid-cell` | NEW minimal 7-col grid |
| `.bottom-row` `.note` / `.event-pill` | NEW controls → existing `calendar-metadata.js` |

## Reference CSS → new `calendar.css` section
Port 1:1: `--selected #7755e8`, `--radius 36px`, `--font` (exact stack), card gradients,
glass `:before` dust texture, `:after` purple bloom, segmented 50px/17px, hero clamp()
typography, `.week-day` 76px + edge/near/active opacity, `.date-circle` 50px,
`.curve` perspective rotateX(3deg), `.grid-cell` 50% radius (selected 16px), bottom row,
`@media (max-width:720px)` block, `@media (max-width:460px)` hook.

## Reference JS → existing architecture
| Reference behaviour | Existing integration |
|---|---|
| `selectedDay` | existing `state.selectedDate` (NO second store) |
| `createWeekTrack` (all month days) | canonical `access.orderedDates` for the visible window |
| `centerSelected` / `updateWeekOpacity` | new U2.1 controller, re-centred after each render |
| `moveBy(delta)` | `setSelectedDate(Calendar.addDays(...))` |
| wheel / drag / ArrowLeft / ArrowRight | same model, wired to app actions |
| `showWeekly` / `showMonthly` | `setCalendarView('week'/'month')` |
| `createMonthly` | canonical `getMonthDates(y, m)` |
| note / event click | existing `calendar-metadata.js` add/remove |
| daily tracker entry | existing `#/day/<date>` route via double-click / right-click |
