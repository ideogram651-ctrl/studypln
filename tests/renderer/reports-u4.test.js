'use strict';
/**
 * tests/renderer/reports-u4.test.js — U4 (CHANGE-002 + CHANGE-003 §4/§5)
 *
 * Covers the four U4 work items and their boundaries:
 *   §3.4/§3.5  Weekly Timetable Chart EXPORT matches the on-screen chart:
 *              12-hour AM/PM axis, break-only blocks hidden, Weekly Progress
 *              section still present, deterministic standalone output.
 *   §4.1       Weekly Report W1-W4 selector: bare #/reports/week route, cards
 *              with canonical dates, future weeks visible at their real 0%.
 *   §4.2       Weekly numeric headers right-aligned over their values (scoped).
 *   §5.1/§5.2  Daily Report schedule-row spacing, scoped via .rp-sched so the
 *              LOCKED Tasks table keeps the base rules untouched.
 *   CHANGE-002 Reports breadcrumbs mirror the Progress crumb hierarchy
 *              (Calendar > Reports > [section], parents clickable).
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
const ReportViewer = require(path.join(ROOT, 'src/components/reports/report-viewer.js'));
const ProgressCalendar = require(path.join(ROOT, 'src/components/reports/progress-calendar.js'));
const ProgressDrilldown = require(path.join(ROOT, 'src/components/progress/progress-drilldown.js'));
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

// ---------------------------------------------------------------------------
// §3.4 — the export speaks the chart's 12-hour AM/PM axis
// ---------------------------------------------------------------------------

test('U4-01: the exported chart axis speaks the same 12-hour AM/PM as the screen', function () {
  assert.equal(ExportEngine.formatClock12(660), '11:00 AM');
  assert.equal(ExportEngine.formatClock12(720), '12:00 PM');
  assert.equal(ExportEngine.formatClock12(780), '1:00 PM');
  assert.equal(ExportEngine.formatClock12(1380), '11:00 PM');

  const parts = ExportEngine.clockParts(780);
  assert.equal(parts.hour, '1:00');
  assert.equal(parts.meridiem, 'PM');
  assert.equal(parts.label, '1:00 PM');

  const html = ExportEngine.exportCalendar(makeModel(), 1);
  // Stacked hour + meridiem spans, coloured AM vs PM (chart's treatment).
  assert.ok(html.includes('<span class="cal-tick-hour">11:00</span>'),
    'hour rendered on its own span');
  assert.ok(html.includes('cal-tick-meridiem is-am'), 'AM spans rendered');
  assert.ok(html.includes('cal-tick-meridiem is-pm'), 'PM spans rendered');
  assert.ok(html.includes('<span class="h">11:00 AM – 1:00 PM</span>'),
    'block captions speak 12-hour time too');
  assert.ok(!html.includes('13:00'), 'no raw 24-hour labels anywhere in the export');

  const am = /\.cal-axis \.cal-tick-meridiem\.is-am\s*\{\s*color:\s*([^;}]+)/.exec(html);
  const pm = /\.cal-axis \.cal-tick-meridiem\.is-pm\s*\{\s*color:\s*([^;}]+)/.exec(html);
  assert.ok(am && pm, 'both meridiem colours exist in the embedded stylesheet');
  assert.notEqual(am[1], pm[1], 'AM and PM must be distinguishable');
});

// ---------------------------------------------------------------------------
// §3.5 — break-only blocks hidden from the export chart, data untouched
// ---------------------------------------------------------------------------

test('U4-02: break-only blocks are hidden from the export chart, data intact', function () {
  const model = makeModel();
  const html = ExportEngine.exportCalendar(model, 1);

  // The standalone export carries its own copy of the predicate — and it must
  // classify exactly like the on-screen chart's predicate.
  ['break', 'free', 'fixed'].forEach(function (cat) {
    assert.equal(ExportEngine.isBreakOnlyBlock({ category: cat }), true, cat);
    assert.equal(ExportEngine.isBreakOnlyBlock({ category: cat }),
      ProgressCalendar.isBreakOnlyBlock({ category: cat }), 'parity for ' + cat);
  });
  ['study', 'revision', 'review'].forEach(function (cat) {
    assert.equal(ExportEngine.isBreakOnlyBlock({ category: cat }), false, cat);
    assert.equal(ExportEngine.isBreakOnlyBlock({ category: cat }),
      ProgressCalendar.isBreakOnlyBlock({ category: cat }), 'parity for ' + cat);
  });
  assert.equal(ExportEngine.isBreakOnlyBlock(null), false);

  // Every break-only block in the model is absent from the chart; the academic
  // blocks stay; the MODEL still carries the break data.
  const report = model.buildCalendarReport(1);
  const breakLabels = [];
  let totalBlocks = 0;
  report.days.forEach(function (day) {
    day.blocks.forEach(function (block) {
      totalBlocks += 1;
      if (ExportEngine.isBreakOnlyBlock(block)) breakLabels.push(block.label);
    });
  });
  assert.ok(breakLabels.length > 0, 'the week carries break-only blocks');
  breakLabels.forEach(function (label) {
    assert.ok(!html.includes(label), label + ' must be hidden from the chart');
  });
  assert.ok(html.includes('Mathematics'), 'academic blocks still drawn');
  assert.ok(!html.includes('blk is-rest'), 'no rest token drawn');

  const drawn = (html.match(/class="blk /g) || []).length;
  assert.equal(drawn, totalBlocks - breakLabels.length,
    'the chart draws exactly the non-break blocks');
});

// ---------------------------------------------------------------------------
// §3/§5 — the Weekly Progress section survives under the timetable
// ---------------------------------------------------------------------------

test('U4-03: the export keeps its Weekly Progress section under the timetable', function () {
  const html = ExportEngine.exportCalendar(makeModel(), 1);
  assert.ok(html.includes('<h2>Weekly timetable</h2>'), 'timetable card kept');
  assert.ok(html.includes('<h2>Week progress</h2>'), 'Weekly Progress section kept');
  assert.ok(html.indexOf('<h2>Weekly timetable</h2>') <
    html.indexOf('<h2>Week progress</h2>'), 'the progress section follows the timetable');
  // Canonical week dates still listed in the progress table.
  assert.ok(html.includes(CANONICAL_WEEKS[1][0]), 'week start listed');
  assert.ok(html.includes(CANONICAL_WEEKS[1][1]), 'week end listed');
  // Still deterministic and standalone.
  assert.equal(html, ExportEngine.exportCalendar(makeModel(), 1));
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external script');
  assert.ok(!/<link[^>]+stylesheet/i.test(html), 'no external stylesheet');
});

// ---------------------------------------------------------------------------
// §4.1 — the Weekly Report selector: route + four-week cards + real 0%
// ---------------------------------------------------------------------------

test('U4-04: the bare week route opens the four-week selection, never Week 1', function () {
  assert.equal(Router.routeForReportWeekSelect(), '#/reports/week');
  const route = Router.parseRoute('#/reports/week');
  assert.equal(route.view, 'reports');
  assert.equal(route.level, 'week-select');
  assert.equal(route.fallback, false);
  assert.ok(route.weekNumber == null, 'selection carries no week number');
  // A specific week still opens that week's report.
  const week3 = Router.parseRoute('#/reports/week/3');
  assert.equal(week3.level, 'week');
  assert.equal(week3.weekNumber, 3);
  assert.equal(week3.hash, '#/reports/week/3');
});

test('U4-05: the selection lists W1-W4 with canonical dates and real 0%', function () {
  const model = makeModel();
  // Mirrors app.js renderReportWeekSelector's mapping exactly (same model
  // fields, same hashes) — selector and report can never disagree.
  const weeks = [1, 2, 3, 4].map(function (n) {
    const week = model.buildWeekReport(n);
    return {
      weekNumber: n,
      startDate: week.startDate,
      endDate: week.endDate,
      dayCount: week.days.length,
      available: week.available,
      percent: week.node ? week.node.percent : 0,
      hash: Router.routeForReportWeek(n)
    };
  });
  const html = ReportViewer.renderWeekSelectHTML(weeks, { note: 'pick one' });
  assert.ok(html.includes('<p class="rp-note">pick one</p>'), 'note rendered');
  assert.equal(count(html, 'class="rp-week-card"'), 4, 'four week cards');
  [1, 2, 3, 4].forEach(function (n) {
    assert.ok(html.includes('Week ' + n + '</span>'), 'Week ' + n + ' card');
    assert.ok(html.includes(CANONICAL_WEEKS[n][0] + ' – ' + CANONICAL_WEEKS[n][1]),
      'Week ' + n + ' canonical range');
    assert.ok(html.includes('data-hash="#/reports/week/' + n + '"'),
      'Week ' + n + ' opens its own report');
    assert.ok(html.includes('0% · '), 'Week ' + n + ' shows its real zero progress');
    assert.ok(html.includes('7 study days'), 'Week ' + n + ' day count visible');
  });
});

test('U4-06: all four weeks open a real report — future weeks stay at 0%', function () {
  const model = makeModel();
  [1, 2, 3, 4].forEach(function (n) {
    const report = model.buildWeekReport(n);
    assert.equal(report.available, true, 'week ' + n + ' available');
    assert.equal(report.days.length, 7, 'week ' + n + ' has seven days');
    assert.equal(report.node.percent, 0, 'week ' + n + ' real zero (no completions)');
    assert.equal(report.startDate, CANONICAL_WEEKS[n][0], 'week ' + n + ' start');
    assert.equal(report.endDate, CANONICAL_WEEKS[n][1], 'week ' + n + ' end');
    const html = ReportViewer.renderReportHTML('week', report, {});
    assert.ok(html.includes('data-report-kind="week"'), 'week root rendered');
    assert.ok(html.includes(CANONICAL_WEEKS[n][0]), 'canonical dates visible');
    assert.ok(html.includes('>0%<'), 'zero progress visible, never hidden');
  });
});

// ---------------------------------------------------------------------------
// §4.2 — Weekly numeric headers right-align over their values (scoped)
// ---------------------------------------------------------------------------

test('U4-07: Weekly numeric headers right-align over their values, scoped', function () {
  assert.ok(/\.rp-root\[data-report-kind="week"\] \.rp-table th\.rp-num \{ text-align: right; \}/
    .test(CSS), 'scoped th.rp-num right-alignment exists for the Weekly report');
  assert.ok(!/(?:^|\n)\s*\.rp-table th\.rp-num /.test(CSS),
    'no unscoped th.rp-num rule that would leak into other report scopes');
  // The base cell rule (locked presentation) is untouched.
  const base = /(?:^|\n)\s*\.rp-table td\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(base && /padding:\s*9px 10px 9px 0/.test(base[1]),
    'base .rp-table td padding unchanged');
});

// ---------------------------------------------------------------------------
// §5.1 — Daily Report schedule-row spacing, scoped; §5.2 Tasks table locked
// ---------------------------------------------------------------------------

test('U4-08: Schedule rows gain bottom clearance; the Tasks table is untouched', function () {
  const model = makeModel();
  const html = ReportViewer.renderReportHTML('day',
    model.buildDayReport(PLANS[0].date), {});

  assert.ok(html.includes('<section class="rp-section rp-sched">'),
    'the Schedule section carries the scope class');
  assert.equal(count(html, 'rp-sched'), 1, 'ONLY the Schedule section is scoped');
  assert.ok(html.includes('<section class="rp-section">'),
    'the Tasks section stays a plain section on the base rules (locked)');

  // Scoped rule: extra BOTTOM clearance so row content never crowds the next row.
  const scoped = /(?:^|\n)\s*\.rp-sched \.rp-table td\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(scoped, '.rp-sched rule exists');
  const top = /padding-top:\s*(\d+)px/.exec(scoped[1]);
  const bottom = /padding-bottom:\s*(\d+)px/.exec(scoped[1]);
  assert.ok(top && Number(top[1]) === 9, 'top padding stays at the base value');
  assert.ok(bottom && Number(bottom[1]) > 9, 'extra bottom clearance added');
});

// ---------------------------------------------------------------------------
// CHANGE-002 — Reports breadcrumbs mirror the Progress crumb hierarchy
// ---------------------------------------------------------------------------

test('U4-09: Reports breadcrumbs mirror Progress — parents clickable', function () {
  const ctx = {
    calendarHash: Router.routeForCalendar(),
    reportsHash: Router.routeForReports()
  };
  assert.equal(ctx.calendarHash, '#/calendar');
  assert.equal(ctx.reportsHash, '#/reports');

  // Index: Calendar > Reports, with Reports as the current crumb.
  const indexVm = ReportViewer.buildReportNavViewModel('index', ctx);
  assert.deepEqual(indexVm.crumbs.map(function (c) { return c.label; }),
    ['Calendar', 'Reports']);
  assert.equal(indexVm.crumbs[0].hash, '#/calendar', 'Calendar is a link');
  assert.equal(indexVm.crumbs[0].current, false);
  assert.equal(indexVm.crumbs[1].current, true);
  assert.equal(indexVm.crumbs[1].hash, null, 'the current crumb is not a link');

  // Deep: Calendar > Reports > [section], BOTH parents clickable.
  const deepVm = ReportViewer.buildReportNavViewModel('week', ctx);
  assert.deepEqual(deepVm.crumbs.map(function (c) { return c.label; }),
    ['Calendar', 'Reports', 'Weekly report']);
  assert.equal(deepVm.crumbs[1].hash, '#/reports');
  assert.equal(deepVm.crumbs[1].current, false, 'Reports is a LINK on a deep page');
  assert.equal(deepVm.crumbs[2].current, true);
  // U5.1 CHANGE #004 supersedes U4: Reports now carries the shared Back
  // control (history step; the Reports index is its cold-start fallback).
  assert.deepEqual(deepVm.back, { label: 'Back', hash: '#/reports' });

  // Emitted by the SAME renderer Progress uses (one breadcrumb system).
  const html = ProgressDrilldown.renderNavHTML(deepVm);
  assert.ok(html.includes('<nav aria-label="Breadcrumb">'), 'breadcrumb nav');
  assert.ok(html.includes('<ol class="progress-crumbs">'), 'Progress crumb classes');
  assert.ok(html.includes('data-hash="#/calendar"'), 'Calendar crumb clickable');
  assert.ok(html.includes('data-hash="#/reports"'), 'Reports crumb clickable');
  assert.ok(html.includes('aria-current="page"'), 'current crumb marked');
  // U5.1 CHANGE #004 supersedes U4: the shared Back control is present on
  // Reports pages, uses the supplied back-arrow.svg and takes an actual step.
  assert.ok(html.includes('class="back-button" data-action="back"'),
    'shared Back control on Reports');
  assert.ok(html.includes('assets/svg/back-arrow.svg'), 'supplied back-arrow.svg icon');

  // Index renders with Reports current, and therefore NOT as a link.
  const indexHtml = ProgressDrilldown.renderNavHTML(indexVm);
  assert.ok(indexHtml.includes('is-current" aria-current="page">Reports</li>'),
    'index Reports crumb is current');
  assert.ok(!indexHtml.includes('data-hash="#/reports"'),
    'index Reports crumb renders as plain text, not a link');

  // The week-selection level gets a proper crumb title from the scope table.
  const selectVm = ReportViewer.buildReportNavViewModel('week-select', ctx);
  assert.equal(selectVm.crumbs[2].label, ReportViewer.SCOPE_TITLES['week-select']);
  assert.equal(selectVm.crumbs[2].label, 'Weekly report');
  assert.equal(
    ProgressDrilldown.renderNavHTML(selectVm).includes(
      '<li class="progress-crumb is-current" aria-current="page">Weekly report</li>'),
    true, 'week-select current crumb rendered as text');
});
