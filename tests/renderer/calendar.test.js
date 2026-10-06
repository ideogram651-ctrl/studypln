'use strict';

/*
 * tests/renderer/calendar.test.js — Study-Planner Phase 4
 *
 * Validates the calendar-facing rendering layer:
 *   - the shared date model (src/js/calendar.js)
 *   - Month View (grid + day cell + plan-status colours)
 *   - Week View (Sunday->Saturday strip, identical cell semantics)
 *   - Calendar View coordinator (toolbar + body switching)
 *   - the hash Router (calendar / day routes, navigation, fallback)
 *
 * These are pure view-model + HTML-string assertions: no DOM required.
 *
 * Run with:  node --test tests/renderer/calendar.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src', 'js', 'calendar.js'));
const Router = require(path.join(ROOT, 'src', 'js', 'router.js'));
const MonthView = require(path.join(ROOT, 'src', 'components', 'calendar', 'month-view.js'));
const WeekView = require(path.join(ROOT, 'src', 'components', 'calendar', 'week-view.js'));
const CalendarView = require(path.join(ROOT, 'src', 'components', 'calendar', 'calendar-view.js'));

const OCT_2 = '2026-10-02'; // Friday, Day 1 of the cycle

// ---------------------------------------------------------------------------
// Date model
// ---------------------------------------------------------------------------

test('isValidIsoDate accepts real dates and rejects malformed / impossible ones', () => {
  assert.equal(C.isValidIsoDate('2026-10-02'), true);
  assert.equal(C.isValidIsoDate('2026-02-28'), true);
  assert.equal(C.isValidIsoDate('2026-02-30'), false);
  assert.equal(C.isValidIsoDate('2026-13-01'), false);
  assert.equal(C.isValidIsoDate('2026-1-1'), false);
  assert.equal(C.isValidIsoDate(''), false);
  assert.equal(C.isValidIsoDate(null), false);
  assert.equal(C.isValidIsoDate(20261002), false);
});

test('isoDate / parseIso round-trip and pad correctly', () => {
  assert.equal(C.isoDate(2026, 10, 2), OCT_2);
  assert.equal(C.isoDate(2026, 1, 9), '2026-01-09');
  assert.deepEqual(C.parseIso(OCT_2), { year: 2026, month: 10, day: 2 });
  assert.throws(() => C.parseIso('not-a-date'));
});

test('addDays / addMonths handle month and year rollover', () => {
  assert.equal(C.addDays(OCT_2, 1), '2026-10-03');
  assert.equal(C.addDays(OCT_2, -1), '2026-10-01');
  assert.equal(C.addDays('2026-10-31', 1), '2026-11-01');
  assert.deepEqual(C.addMonths(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(C.addMonths(2026, 1, -1), { year: 2025, month: 12 });
});

test('2026-10-02 is a Friday and Day 1 of the cycle', () => {
  assert.equal(C.weekdayIndex(OCT_2), 5);
  assert.equal(C.weekdayLong(OCT_2), 'Friday');
  assert.equal(C.formatLongDate(OCT_2), '2 October 2026');
});

test('buildMonthGrid produces a Sunday-first grid covering exactly the month', () => {
  const grid = C.buildMonthGrid(2026, 10);
  assert.equal(grid.title, 'October 2026');
  assert.equal(grid.weekdays.length, 7);
  assert.equal(grid.weekdays[0], 'Sun');
  // Oct 1 2026 is a Thursday -> 4 leading blanks, 31 days -> 5 full weeks.
  assert.equal(grid.weeks.length, 5);
  assert.equal(grid.weeks[0][0], null);
  assert.equal(grid.weeks[0][4].date, '2026-10-01');
  assert.equal(grid.weeks[4].every(Boolean), true);
  grid.weeks.forEach((row) => {
    assert.equal(row.length, 7);
    row.forEach((cell) => { if (cell) assert.equal(C.isValidIsoDate(cell.date), true); });
  });
});

test('buildWeekDates returns the Sunday->Saturday week containing the anchor', () => {
  const dates = C.buildWeekDates(OCT_2);
  assert.equal(dates.length, 7);
  assert.equal(dates[0], '2026-09-27'); // Sunday
  assert.equal(dates[5], OCT_2);
  assert.equal(dates[6], '2026-10-03'); // Saturday
  assert.deepEqual(C.buildWeekDates('2026-09-27'), dates); // same week, any anchor
});

test('formatWeekRangeLabel collapses shared month/year sensibly', () => {
  assert.equal(C.formatWeekRangeLabel(OCT_2), '27 September – 3 October 2026');
  assert.equal(C.formatWeekRangeLabel('2026-10-07'), '4 – 10 October 2026');
});

// ---------------------------------------------------------------------------
// Month View
// ---------------------------------------------------------------------------

test('normalizeStatus: absent plan, rounding and clamping', () => {
  assert.deepEqual(MonthView.normalizeStatus(null), { hasPlan: false, percent: null });
  assert.deepEqual(MonthView.normalizeStatus({ hasPlan: false }), { hasPlan: false, percent: null });
  assert.deepEqual(MonthView.normalizeStatus({ hasPlan: true, percent: 42.6 }), { hasPlan: true, percent: 43 });
  assert.deepEqual(MonthView.normalizeStatus({ hasPlan: true, percent: 250 }), { hasPlan: true, percent: 100 });
  assert.deepEqual(MonthView.normalizeStatus({ hasPlan: true, percent: -5 }), { hasPlan: true, percent: 0 });
});

test('progressState maps percentage to none / partial / complete', () => {
  assert.equal(MonthView.progressState(0), 'none');
  assert.equal(MonthView.progressState(1), 'partial');
  assert.equal(MonthView.progressState(99), 'partial');
  assert.equal(MonthView.progressState(100), 'complete');
});

test('buildDayCell carries selection + plan status and never invents a plan', () => {
  const planStatus = { [OCT_2]: { hasPlan: true, percent: 50 } };
  const selected = MonthView.buildDayCell(OCT_2, { selectedDate: OCT_2, planStatus });
  assert.equal(selected.selected, true);
  assert.equal(selected.hasPlan, true);
  assert.equal(selected.progressState, 'partial');
  assert.match(selected.ariaLabel, /50% complete/);

  const noPlan = MonthView.buildDayCell('2026-10-05', { selectedDate: OCT_2, planStatus });
  assert.equal(noPlan.selected, false);
  assert.equal(noPlan.hasPlan, false);
  assert.equal(noPlan.progressState, 'absent');
  assert.equal(noPlan.percent, null);
  assert.match(noPlan.ariaLabel, /no study plan/);
});

test('renderDayCell emits a single clickable date button with the right state', () => {
  const html = MonthView.renderDayCell(
    MonthView.buildDayCell(OCT_2, { selectedDate: OCT_2, planStatus: { [OCT_2]: { hasPlan: true, percent: 100 } } }),
    'day-cell'
  );
  assert.match(html, /data-date="2026-10-02"/);
  assert.match(html, /data-action="select-date"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /is-selected/);
  assert.match(html, /plan-complete/);
  assert.match(html, /day-progress-fill/);

  const bare = MonthView.renderDayCell(
    MonthView.buildDayCell('2026-10-05', { selectedDate: OCT_2, planStatus: {} }),
    'day-cell'
  );
  assert.match(bare, /no-plan/);
  assert.doesNotMatch(bare, /day-progress/);
});

test('buildMonthModel + renderMonthHTML paint the whole grid', () => {
  const model = MonthView.buildMonthModel({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: { [OCT_2]: { hasPlan: true, percent: 0 } }
  });
  assert.equal(model.weeks.length, 5);
  const html = MonthView.renderMonthHTML(model);
  assert.match(html, /class="month-view"/);
  assert.equal((html.match(/class="month-weekday"/g) || []).length, 7);
  assert.equal((html.match(/class="month-week"/g) || []).length, 5);
  assert.match(html, /data-date="2026-10-02"/);
});

// ---------------------------------------------------------------------------
// Week View
// ---------------------------------------------------------------------------

test('buildWeekModel: Sunday->Saturday strip anchored on the selected date', () => {
  const model = WeekView.buildWeekModel({
    anchorDate: OCT_2, selectedDate: OCT_2, planStatus: { [OCT_2]: { hasPlan: true, percent: 25 } }
  });
  assert.equal(model.title, '27 September – 3 October 2026');
  assert.equal(model.days.length, 7);
  assert.equal(model.days[0].date, '2026-09-27');
  assert.equal(model.days[5].date, OCT_2);
  assert.equal(model.days[5].selected, true);
  assert.equal(model.days[5].hasPlan, true);
});

test('Week View and Month View agree on the exact same day-cell semantics', () => {
  const opts = { anchorDate: OCT_2, selectedDate: OCT_2, planStatus: { [OCT_2]: { hasPlan: true, percent: 60 } } };
  const week = WeekView.buildWeekModel(opts);
  week.days.forEach((cell) => {
    assert.deepEqual(cell, MonthView.buildDayCell(cell.date, opts));
  });
});

test('renderWeekHTML marks plan / no-plan days and keeps one date identity', () => {
  const html = WeekView.renderWeekHTML(WeekView.buildWeekModel({
    anchorDate: OCT_2, selectedDate: OCT_2, planStatus: { [OCT_2]: { hasPlan: true, percent: 40 } }
  }));
  assert.match(html, /class="week-view"/);
  assert.equal((html.match(/class="week-day-card/g) || []).length, 7);
  assert.match(html, /data-date="2026-10-02"/);
  assert.match(html, /40%/);
  assert.match(html, /No plan/);
});

// ---------------------------------------------------------------------------
// Calendar View coordinator
// ---------------------------------------------------------------------------

test('buildCalendarViewModel switches body + title per view', () => {
  const month = CalendarView.buildCalendarViewModel({
    view: 'month', year: 2026, month: 10, selectedDate: OCT_2, planStatus: {}
  });
  assert.equal(month.view, 'month');
  assert.equal(month.isMonth, true);
  assert.equal(month.title, 'October 2026');
  assert.match(month.body, /class="month-view"/);

  const week = CalendarView.buildCalendarViewModel({
    view: 'week', anchorDate: OCT_2, selectedDate: OCT_2, planStatus: {}
  });
  assert.equal(week.view, 'week');
  assert.equal(week.isWeek, true);
  assert.equal(week.title, '27 September – 3 October 2026');
  assert.match(week.body, /class="week-view"/);
});

test('renderCalendarHTML exposes toolbar actions and the active segmented state', () => {
  const monthVM = CalendarView.buildCalendarViewModel({ view: 'month', year: 2026, month: 10, selectedDate: OCT_2, planStatus: {} });
  const monthHtml = CalendarView.renderCalendarHTML(monthVM);
  assert.match(monthHtml, /data-action="previous"/);
  assert.match(monthHtml, /data-action="next"/);
  assert.match(monthHtml, /data-action="view-month"/);
  assert.match(monthHtml, /data-action="view-week"/);
  assert.match(monthHtml, /October 2026/);
  assert.match(monthHtml, /calendar-hint/);
  assert.match(monthHtml, /data-action="view-month"[^>]*aria-pressed="true"/); // Monthly is active
  assert.match(monthHtml, /data-action="view-week"[^>]*aria-pressed="false"/);

  const weekVM = CalendarView.buildCalendarViewModel({ view: 'week', anchorDate: OCT_2, selectedDate: OCT_2, planStatus: {} });
  const weekHtml = CalendarView.renderCalendarHTML(weekVM);
  assert.match(weekHtml, /data-action="view-week"[^>]*aria-pressed="true"/);
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

test('parseRoute: calendar, day and fallback routes', () => {
  assert.deepEqual(Router.parseRoute(''), { view: 'calendar', hash: '#/calendar', fallback: false });
  assert.deepEqual(Router.parseRoute('#'), { view: 'calendar', hash: '#/calendar', fallback: false });
  assert.deepEqual(Router.parseRoute('#/calendar'), { view: 'calendar', hash: '#/calendar', fallback: false });

  const day = Router.parseRoute('#/day/2026-10-05');
  assert.equal(day.view, 'day');
  assert.equal(day.date, '2026-10-05');
  assert.equal(day.dateValid, true);

  const badDay = Router.parseRoute('#/day/2026-13-40');
  assert.equal(badDay.view, 'day');
  assert.equal(badDay.dateValid, false);

  assert.deepEqual(Router.parseRoute('#/nonsense'), { view: 'calendar', hash: '#/calendar', fallback: true });
});

test('routeForDay rejects invalid dates; routeForCalendar is stable', () => {
  assert.equal(Router.routeForCalendar(), '#/calendar');
  assert.equal(Router.routeForDay('2026-10-05'), '#/day/2026-10-05');
  assert.throws(() => Router.routeForDay('bogus'), (err) => {
    assert.equal(err.code, 'invalid_argument');
    return true;
  });
});

function fakeTransport(initial) {
  let currentHash = initial || '';
  const subscribers = [];
  return {
    getHash: () => currentHash,
    setHash: (hash) => {
      if (hash === currentHash) return;
      currentHash = hash;
      subscribers.slice().forEach((fn) => fn());
    },
    subscribe: (fn) => { subscribers.push(fn); return () => {}; }
  };
}

test('router: navigate notifies once per change and dedupes repeat routes', () => {
  const t = fakeTransport('#/calendar');
  const router = Router.createRouter({ getHash: t.getHash, setHash: t.setHash, subscribe: t.subscribe });
  const seen = [];
  router.onChange((route) => seen.push(route.view + (route.date ? ':' + route.date : '')));

  router.start(); // emits the initial route
  assert.equal(router.getCurrent().view, 'calendar');

  router.navigate(Router.routeForDay('2026-10-05'));
  assert.equal(router.getCurrent().view, 'day');
  assert.equal(router.getCurrent().date, '2026-10-05');

  router.navigate(Router.routeForDay('2026-10-05')); // identical -> no extra notify
  router.navigate('#/nonsense'); // fallback -> calendar

  assert.deepEqual(seen, ['calendar', 'day:2026-10-05', 'calendar']);
  // An unknown hash falls back to the calendar route (hash normalised to #/calendar).
  assert.equal(router.getCurrent().view, 'calendar');
  assert.equal(router.getCurrent().hash, '#/calendar');
  router.stop();
});

test('router: external hash change is picked up through the transport', () => {
  const t = fakeTransport('#/calendar');
  const router = Router.createRouter({ getHash: t.getHash, setHash: t.setHash, subscribe: t.subscribe });
  router.start();
  t.setHash('#/day/2026-10-08');
  assert.equal(router.getCurrent().view, 'day');
  assert.equal(router.getCurrent().date, '2026-10-08');
});
