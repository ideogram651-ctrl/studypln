'use strict';
/**
 * tests/renderer/reports-u3.test.js — U3 (CHANGE-003 §2 + §3)
 *
 * Covers the two U3 work items and their locked boundaries:
 *   §2   Overall Progress header -> column -> row alignment (scoped CSS fix)
 *   §3.1 rename to "Weekly Timetable Chart" (on-screen only)
 *   §3.2 week-selection view (W1-W4) before any chart opens
 *   §3.3 canonical study-week dates (never a second mapping)
 *   §3.4 12-hour AM/PM axis with distinguishable meridiem styling
 *   §3.5 break-only blocks hidden from the chart, DATA untouched
 *   §3.6 scrollbar root cause (gridlines stay inside the window)
 *   LOCK (reworked by U4): the export model title, document title, section
 *       heading and determinism stay untouched — while the calendar export's
 *       PRESENTATION now intentionally matches the chart (12-hour AM/PM axis,
 *       break-only blocks hidden), per the U4 task override. The Daily export
 *       keeps its original 24-hour clock.
 *
 * Presentation tests only — no progress arithmetic, no data mutation.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DataEngine = require(path.join(ROOT, 'src/js/data-engine.js'));
const ReportModel = require(path.join(ROOT, 'src/js/report-model.js'));
const ProgressCalendar = require(path.join(ROOT, 'src/components/reports/progress-calendar.js'));
const ReportViewer = require(path.join(ROOT, 'src/components/reports/report-viewer.js'));
const ExportEngine = require(path.join(ROOT, 'src/js/export-engine.js'));
const Router = require(path.join(ROOT, 'src/js/router.js'));

const CSS = fs.readFileSync(path.join(ROOT, 'src/css/reports.css'), 'utf8');

const SYLLABUS_FILES = ['mathematics-i', 'statistics', 'computational-thinking', 'english'];
const COURSES = DataEngine.sortCourses(SYLLABUS_FILES.map(function (file) {
  return DataEngine.normalizeCourse(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/syllabus', file + '.json'), 'utf8')));
}));

const PLAN_DIR = path.join(ROOT, 'data/schedule/daily');
const PLANS = fs.readdirSync(PLAN_DIR)
  .filter(function (file) { return /\.json$/.test(file); })
  .sort()
  .map(function (file) {
    return DataEngine.normalizeDailyPlan(
      JSON.parse(fs.readFileSync(path.join(PLAN_DIR, file), 'utf8')));
  });

function makeModel(completions) {
  return ReportModel.createReportModel({
    courses: COURSES, completions: completions || {}, plans: PLANS
  });
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// The canonical study-week mapping (spec: W1 Oct 2-8 ... W4 Oct 23-29).
const CANONICAL_WEEKS = {
  1: ['2026-10-02', '2026-10-08'],
  2: ['2026-10-09', '2026-10-15'],
  3: ['2026-10-16', '2026-10-22'],
  4: ['2026-10-23', '2026-10-29']
};

const BREAK_ONLY = ['break', 'free', 'fixed'];
const ACADEMIC = ['study', 'revision', 'review'];

// ---------------------------------------------------------------------------
// §3.4 — 12-hour AM/PM axis
// ---------------------------------------------------------------------------

test('U3-01: axis ticks speak 12-hour AM/PM, hour by hour', function () {
  const ticks = ProgressCalendar.axisTicks(
    { startMinutes: 660, endMinutes: 1380, spanMinutes: 720 });
  assert.equal(ticks[0].label, '11:00 AM');
  assert.equal(ticks[1].label, '12:00 PM');
  assert.equal(ticks[2].label, '1:00 PM');
  assert.equal(ticks[ticks.length - 1].label, '11:00 PM');
  ticks.forEach(function (tick) {
    assert.match(tick.label, /^\d{1,2}:\d{2} (AM|PM)$/, 'label ' + tick.label);
    assert.ok(tick.hour && tick.meridiem, 'tick carries hour + meridiem parts');
    assert.equal(tick.meridiem, tick.label.slice(-2));
  });
});

test('U3-02: the rendered axis stacks hour and meridiem with distinct colours', function () {
  const model = makeModel();
  const html = ProgressCalendar.renderCalendarHTML(
    ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1)));
  assert.ok(html.indexOf('pc-tick-hour') !== -1, 'hour span rendered');
  assert.ok(html.indexOf('pc-tick-meridiem is-am') !== -1, 'AM span rendered');
  assert.ok(html.indexOf('pc-tick-meridiem is-pm') !== -1, 'PM span rendered');
  assert.ok(html.indexOf('1:00 PM') !== -1, 'first PM hour shown human-readably');
  assert.ok(html.indexOf('13:00<') === -1, 'no raw 24-hour tick text');

  const am = /\.pc-tick-meridiem\.is-am\s*\{\s*color:\s*([^;}]+)/.exec(CSS);
  const pm = /\.pc-tick-meridiem\.is-pm\s*\{\s*color:\s*([^;}]+)/.exec(CSS);
  assert.ok(am && pm, 'both meridiem colours exist');
  assert.notEqual(am[1].trim(), pm[1].trim(), 'AM and PM must be distinguishable');
});

// ---------------------------------------------------------------------------
// §3.5 — break-only blocks hidden from the chart, data untouched
// ---------------------------------------------------------------------------

test('U3-03: break-only categories are filtered, academic ones never are', function () {
  BREAK_ONLY.forEach(function (cat) {
    assert.equal(ProgressCalendar.isBreakOnlyBlock({ category: cat }), true, cat);
  });
  ACADEMIC.forEach(function (cat) {
    assert.equal(ProgressCalendar.isBreakOnlyBlock({ category: cat }), false, cat);
  });
  assert.equal(ProgressCalendar.isBreakOnlyBlock(null), false);
});

test('U3-04: the chart hides break-only blocks while the model keeps them', function () {
  const model = makeModel();
  const report = model.buildCalendarReport(1);
  // Data preserved: the model still carries every block of every day.
  const allModelBlocks = report.days.reduce(function (acc, day) {
    return acc.concat(day.blocks);
  }, []);
  assert.equal(allModelBlocks.length, 7 * 12, 'all 12 blocks x 7 days in the model');
  assert.ok(allModelBlocks.some(function (b) { return b.blockId === 'lunch-rest'; }),
    'lunch/rest still present in the data');
  BREAK_ONLY.forEach(function (cat) {
    assert.ok(allModelBlocks.some(function (b) { return b.category === cat; }),
      'model retains category ' + cat);
  });

  // Presentation: none of them reach the visible view model or the HTML.
  const viewModel = ProgressCalendar.buildCalendarViewModel(report);
  const visible = viewModel.days.reduce(function (acc, day) {
    return acc.concat(day.blocks);
  }, []);
  assert.ok(visible.length > 0, 'academic blocks still render');
  visible.forEach(function (block) {
    assert.ok(BREAK_ONLY.indexOf(block.category) === -1,
      'break-only block leaked into the chart: ' + block.category);
  });
  ACADEMIC.forEach(function (cat) {
    assert.ok(visible.some(function (b) { return b.category === cat; }),
      'academic category ' + cat + ' stays visible');
  });
  assert.equal(visible.length, 42, '84 total - 42 break-only = 42 visible');

  const html = ProgressCalendar.renderCalendarHTML(viewModel);
  assert.ok(html.indexOf('Lunch / Rest') === -1, 'break label hidden');
  assert.ok(html.indexOf('FIXED TIME') === -1, 'fixed-time block hidden');
  assert.ok(html.indexOf('Free / Refresh') === -1, 'free block hidden');
  assert.ok(html.indexOf('Mathematics') !== -1, 'study blocks still shown');
});

// ---------------------------------------------------------------------------
// §3.3 — canonical study-week dates + day headers show the DATE (FIG-004)
// ---------------------------------------------------------------------------

test('U3-05: all four weeks use the canonical study-week ranges', function () {
  const model = makeModel();
  Object.keys(CANONICAL_WEEKS).forEach(function (key) {
    const n = Number(key);
    const weekReport = model.buildWeekReport(n);
    assert.equal(weekReport.startDate, CANONICAL_WEEKS[n][0], 'W' + n + ' start');
    assert.equal(weekReport.endDate, CANONICAL_WEEKS[n][1], 'W' + n + ' end');
    const calReport = model.buildCalendarReport(n);
    assert.equal(calReport.startDate, CANONICAL_WEEKS[n][0], 'W' + n + ' chart start');
    assert.equal(calReport.endDate, CANONICAL_WEEKS[n][1], 'W' + n + ' chart end');
  });
});

test('U3-06: day headers carry the canonical date — W1 starts Fri 2, not 1', function () {
  const model = makeModel();
  const viewModel = ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1));
  assert.equal(viewModel.days[0].date, '2026-10-02');
  assert.equal(viewModel.days[0].weekdayShort, 'Fri');
  assert.equal(viewModel.days[0].dayNum, 2, 'first column shows October 2');
  assert.equal(viewModel.days[6].dayNum, 8, 'last column shows October 8');
  // The cycle day number (1 for Oct 2) must not be what the chart displays.
  assert.notEqual(viewModel.days[0].dayNum, viewModel.days[0].dayNumber);
  const html = ProgressCalendar.renderCalendarHTML(viewModel);
  assert.ok(html.indexOf('<span class="pc-daynum">2</span>') !== -1,
    'header renders the date-of-month');
  assert.ok(html.indexOf('<span class="pc-daynum">1</span>') === -1,
    'cycle-day "1" must not appear as a header');
});

// ---------------------------------------------------------------------------
// §3.1 + §3.2 — rename and the week-selection view
// ---------------------------------------------------------------------------

test('U3-07: the report is named Weekly Timetable Chart on-screen', function () {
  assert.equal(ReportViewer.SCOPE_TITLES.calendar, 'Weekly Timetable Chart');
  assert.equal(ReportViewer.SCOPE_TITLES['calendar-select'], 'Weekly Timetable Chart');
  // The index entry hash is the selection level, never a silent Week 1.
  assert.equal(Router.routeForReportCalendar(), '#/reports/calendar');
  const route = Router.parseRoute(Router.routeForReportCalendar());
  assert.equal(route.level, 'calendar-select');
  assert.equal(route.weekNumber, undefined, 'bare route carries no week');
});

test('U3-08: the week-selection view lists W1-W4 with canonical ranges', function () {
  const model = makeModel();
  const weeks = [1, 2, 3, 4].map(function (n) {
    const week = model.buildWeekReport(n);
    return {
      weekNumber: n,
      startDate: week.startDate,
      endDate: week.endDate,
      dayCount: week.days.length,
      available: week.available
    };
  });
  const html = ReportViewer.renderWeekSelectHTML(weeks);
  [1, 2, 3, 4].forEach(function (n) {
    assert.ok(html.indexOf('Week ' + n + '</span>') !== -1, 'Week ' + n + ' card');
    assert.ok(html.indexOf(CANONICAL_WEEKS[n][0] + ' – ' + CANONICAL_WEEKS[n][1]) !== -1,
      'W' + n + ' canonical range on the card');
    assert.ok(html.indexOf('data-hash="#/reports/calendar/week/' + n + '"') !== -1,
      'W' + n + ' links to its chart');
  });
  assert.equal(count(html, 'class="rp-week-card"'), 4, 'exactly four cards');
});

// ---------------------------------------------------------------------------
// §2 — Overall Progress alignment + §3.6 scrollbar root cause (CSS)
// ---------------------------------------------------------------------------

test('U3-09: Overall numeric headers right-align over their values, scoped', function () {
  const scoped = /\.rp-root\[data-report-kind="overall"\][^{]*th\.rp-num\s*\{[^}]*text-align:\s*right/.test(CSS);
  assert.ok(scoped, 'scoped th.rp-num right-alignment rule exists');
  // The fix must NOT change the other report scopes (U4 territory).
  const unscoped = /(^|\n)\s*\.rp-table\s+th\.rp-num\s*\{/.test(CSS);
  assert.equal(unscoped, false, 'no unscoped th.rp-num rule');
});

test('U3-10: gridlines stay inside the window (scrollbar root cause fixed)', function () {
  const gridline = /\.pc-gridline\s*\{[^}]*\}/.exec(CSS);
  assert.ok(gridline, '.pc-gridline rule exists');
  assert.ok(/transform:\s*translateY\(-100%\)/.test(gridline[0]),
    'gridline draws ON its hour coordinate, not 1px below the window');
  // Horizontal contained scrolling stays for genuinely narrow screens.
  const calendar = /\.pc-calendar\s*\{[^}]*\}/.exec(CSS);
  assert.ok(/overflow-x:\s*auto/.test(calendar[0]), 'contained x-scroll preserved');
});

// ---------------------------------------------------------------------------
// LOCK (reworked by U4) — model/document identity stays untouched; the CALENDAR
// export's presentation intentionally matches the on-screen chart now.
// ---------------------------------------------------------------------------

test('U3-11: export matches the chart — 12h axis, breaks hidden, titles intact', function () {
  const model = makeModel();
  // The model title that feeds the exported <h1>/<title> is untouched.
  assert.equal(model.buildCalendarReport(1).title, 'Weekly timetable — Week 1');
  // The DAILY export scope keeps its original 24-hour formatClock (locked —
  // only the calendar/timetable export was reworked in U4).
  assert.equal(ExportEngine.formatClock(780), '13:00');
  assert.equal(ExportEngine.formatClock(1380), '23:00');
  // The calendar-scoped clock mirrors the on-screen 12-hour axis.
  assert.equal(ExportEngine.formatClock12(780), '1:00 PM');
  assert.equal(ExportEngine.formatClock12(1380), '11:00 PM');

  const html = ExportEngine.exportCalendar(model, 1);
  assert.ok(html.indexOf('<h2>Weekly timetable</h2>') !== -1,
    'export section heading unchanged');
  assert.ok(html.indexOf('Weekly timetable — Week 1') !== -1,
    'export document title unchanged');
  // U4 §3.4: human 12-hour axis, no raw 24-hour labels anywhere in the chart.
  assert.ok(/1:00 PM/.test(html), 'export axis speaks 12-hour AM/PM');
  assert.ok(!/\b13:00\b/.test(html), 'no raw 24-hour labels in the export');
  // U4 §3.5: break-only blocks are hidden — same presentation as the chart —
  // while the report MODEL still carries them (data preserved).
  assert.ok(html.indexOf('Lunch / Rest') === -1,
    'export hides break-only blocks like the on-screen chart');
  assert.ok(html.indexOf('Mathematics') !== -1, 'study blocks still drawn');
  const report = model.buildCalendarReport(1);
  assert.ok(report.days.some(function (day) {
    return day.blocks.some(function (block) { return block.category === 'break'; });
  }), 'the model keeps the break-only schedule data');
  // Deterministic: the export never drifts.
  assert.equal(html, ExportEngine.exportCalendar(model, 1));
  // Export styles stay export-scoped (no viewer class names in the document).
  assert.ok(!/class="pc-tick-meridiem/.test(html), 'no viewer styles in the export');
});
