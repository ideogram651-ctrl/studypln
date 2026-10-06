/**
 * tests/renderer/reports.test.js — Study-Planner Phase 6
 *
 * Focused renderer tests:
 *   - the report viewer renders each scope from the report model
 *   - the progress calendar renders 7 days with correctly positioned blocks
 *   - existing Phase 4/5 routes still parse (no regression)
 *
 * These are presentation tests: they assert structure and geometry, never
 * progress arithmetic (that belongs to the report model / progress engine).
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
const ReportTree = require(path.join(ROOT, 'src/components/reports/report-tree.js'));
const ExportControls = require(path.join(ROOT, 'src/components/reports/export-controls.js'));
const Router = require(path.join(ROOT, 'src/js/router.js'));

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

const FIRST_DATE = PLANS[0].date;

function makeModel(completions) {
  return ReportModel.createReportModel({
    courses: COURSES, completions: completions || {}, plans: PLANS
  });
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ---- calendar geometry (pure) ----------------------------------------------

test('block geometry places a block by its real start minutes', function () {
  const window = { startMinutes: 660, endMinutes: 1380, spanMinutes: 720 };
  const geo = ProgressCalendar.blockGeometry(
    { startMinutes: 660, endMinutes: 780, durationMinutes: 120 }, window);
  assert.equal(geo.top, 0);
  assert.equal(geo.height, 120 / 720 * 100);
});

test('block geometry gives 120 minutes exactly twice the height of 60', function () {
  const window = { startMinutes: 660, endMinutes: 1380, spanMinutes: 720 };
  const two = ProgressCalendar.blockGeometry(
    { startMinutes: 660, endMinutes: 780, durationMinutes: 120 }, window);
  const one = ProgressCalendar.blockGeometry(
    { startMinutes: 660, endMinutes: 720, durationMinutes: 60 }, window);
  assert.equal(two.height, one.height * 2);
});

test('half-hour times are positioned exactly, not rounded to the hour', function () {
  const window = { startMinutes: 660, endMinutes: 1380, spanMinutes: 720 };
  const geo = ProgressCalendar.blockGeometry(
    { startMinutes: 930, endMinutes: 960, durationMinutes: 30 }, window);
  // 15:30 is 270 minutes into the window: 270/720
  assert.equal(geo.top, 270 / 720 * 100);
  assert.equal(geo.height, 30 / 720 * 100);
});

test('formatClock renders a human 12-hour clock for axis labels (U3 §3.4)', function () {
  assert.equal(ProgressCalendar.formatClock(660), '11:00 AM');
  assert.equal(ProgressCalendar.formatClock(720), '12:00 PM');
  assert.equal(ProgressCalendar.formatClock(780), '1:00 PM');
  assert.equal(ProgressCalendar.formatClock(1275), '9:15 PM');
  assert.equal(ProgressCalendar.formatClock(1380), '11:00 PM');
  assert.equal(ProgressCalendar.formatClock(0), '12:00 AM');
  // Never the raw 24-hour sequence the spec rejects.
  assert.ok(!/\b1[3-9]:|\b2[0-3]:/.test(ProgressCalendar.formatClock(780) +
    ProgressCalendar.formatClock(1380)));
});

test('axis ticks fall on the hour across the whole window', function () {
  const ticks = ProgressCalendar.axisTicks({ startMinutes: 660, endMinutes: 1380, spanMinutes: 720 });
  assert.ok(ticks.length > 0);
  ticks.forEach(function (tick) {
    assert.equal(tick.minutes % 60, 0, 'ticks land on the hour');
    assert.ok(tick.top >= 0 && tick.top <= 100);
  });
});

test('block state reflects the engine node without inventing progress', function () {
  assert.equal(ProgressCalendar.blockState({ isTaskBearing: false, node: null }), 'none');
  assert.equal(ProgressCalendar.blockState(
    { isTaskBearing: true, node: { percent: 0, completed: 0 } }), 'none');
  assert.equal(ProgressCalendar.blockState(
    { isTaskBearing: true, node: { percent: 50, completed: 1 } }), 'partial');
  assert.equal(ProgressCalendar.blockState(
    { isTaskBearing: true, node: { percent: 100, completed: 3 } }), 'complete');
});

// ---- calendar view model + rendering ---------------------------------------

test('the calendar view model has seven days with correct dates', function () {
  const model = makeModel();
  const viewModel = ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1));
  assert.equal(viewModel.days.length, 7);
  assert.equal(viewModel.available, true);
  assert.equal(viewModel.window.spanMinutes, 720);
  assert.equal(viewModel.days[0].date, FIRST_DATE);
});

test('the calendar renders seven day columns and a time axis', function () {
  const model = makeModel();
  const viewModel = ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1));
  const html = ProgressCalendar.renderCalendarHTML(viewModel);
  assert.equal(count(html, 'class="pc-col"'), 7);
  assert.equal(count(html, 'class="pc-day-head"'), 7);
  // Ticks may carry edge classes (is-first / is-last), so match the prefix —
  // but not the inner pc-tick-hour / pc-tick-meridiem spans (U3 §3.4).
  assert.equal((html.match(/class="pc-tick[ "]/g) || []).length, viewModel.ticks.length);
  assert.ok(html.indexOf('class="pc-tick is-first"') !== -1, 'first tick is inset');
  assert.ok(html.indexOf('class="pc-tick is-last"') !== -1, 'last tick is inset');
});

test('every VISIBLE rendered block carries its real start and end time', function () {
  const model = makeModel();
  const report = model.buildCalendarReport(1);
  const viewModel = ProgressCalendar.buildCalendarViewModel(report);
  const html = ProgressCalendar.renderCalendarHTML(viewModel);
  // U3 §3.5: the view model hides break-only blocks, so the assertion runs
  // over what the chart actually renders (data preservation is covered in
  // reports-u3.test.js).
  viewModel.days.forEach(function (day) {
    day.blocks.forEach(function (block) {
      const expected = ProgressCalendar.formatClock(block.startMinutes) +
        ' – ' + ProgressCalendar.formatClock(block.endMinutes);
      assert.ok(html.indexOf(expected) !== -1, 'missing time ' + expected);
    });
  });
});

test('rendered block heights match their real durations', function () {
  const model = makeModel();
  const html = ProgressCalendar.renderCalendarHTML(
    ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1)));
  const heights = (html.match(/height:([\d.]+)%/g) || []).map(function (h) {
    return Number(/height:([\d.]+)%/.exec(h)[1]);
  });
  // Visible study blocks: Mathematics 120 min, Statistics 90 min — each at its
  // exact share of the shared 720-minute window (1px-per-minute geometry).
  const two = 120 / 720 * 100;
  const one = 90 / 720 * 100;
  assert.ok(heights.some(function (h) { return Math.abs(h - two) < 1e-9; }), '120-min block');
  assert.ok(heights.some(function (h) { return Math.abs(h - one) < 1e-9; }), '90-min block');
});

test('block colour classes are deterministic per subject token', function () {
  const model = makeModel();
  const html = ProgressCalendar.renderCalendarHTML(
    ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1)));
  // Study + revision + review tokens render (U3 §3.5 keeps academic colours).
  ['pc-tok-math', 'pc-tok-stats', 'pc-tok-ct', 'pc-tok-english', 'pc-tok-revision', 'pc-tok-review']
    .forEach(function (cls) {
      assert.ok(html.indexOf(cls) !== -1, 'missing ' + cls);
    });
  // The grey rest token belongs to break-only blocks, which U3 §3.5 hides
  // from the on-screen chart (the model/export still carry them).
  assert.ok(html.indexOf('pc-tok-rest') === -1, 'break-only grey blocks hidden');
});

test('task and non-task blocks are distinguished in the markup', function () {
  const model = makeModel();
  const html = ProgressCalendar.renderCalendarHTML(
    ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1)));
  assert.ok(html.indexOf('pc-block-tasks') !== -1, 'task-bearing blocks show task info');
  // A visible non-task block (revision/review survive the U3 §3.5 filter)
  // must not claim a task count.
  const viewModel = ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1));
  const nonTask = viewModel.days[0].blocks.filter(function (b) {
    return !b.isTaskBearing;
  })[0];
  assert.ok(nonTask, 'a non-task block is still visible');
  assert.equal(nonTask.isTaskBearing, false);
  assert.equal(nonTask.percent, null);
  assert.equal(nonTask.taskCount, 0);
});

test('the calendar shows no badges, streaks or timers', function () {
  const model = makeModel();
  const html = ProgressCalendar.renderCalendarHTML(
    ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1))) +
    ProgressCalendar.renderHeadHTML(
      ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1)));
  assert.ok(!/streak|pomodoro|timer|score|badge|achievement/i.test(html));
});

// ---- report viewer ----------------------------------------------------------

test('the viewer renders the overall report with subject and week tables', function () {
  const model = makeModel();
  const report = model.buildOverallReport();
  const html = ReportViewer.renderReportHTML('overall', report);
  assert.ok(html.indexOf('data-report-kind="overall"') !== -1);
  assert.ok(html.indexOf('Subjects') !== -1);
  assert.ok(html.indexOf('Weeks') !== -1);
  report.subjects.forEach(function (subject) {
    assert.ok(html.indexOf(subject.label) !== -1, subject.label);
  });
});

test('the viewer renders subject, week and day reports', function () {
  const model = makeModel();
  ['subject', 'week', 'day'].forEach(function (kind) {
    const report = kind === 'subject' ? model.buildSubjectReport('mathematics-i')
      : kind === 'week' ? model.buildWeekReport(1)
        : model.buildDayReport(FIRST_DATE);
    const html = ReportViewer.renderReportHTML(kind, report);
    assert.ok(html.indexOf('data-report-kind="' + kind + '"') !== -1, kind);
    assert.ok(html.length > 100, kind + ' must render content');
  });
});

test('the viewer shows the day schedule with real times', function () {
  const model = makeModel();
  const report = model.buildDayReport(FIRST_DATE);
  const html = ReportViewer.renderReportHTML('day', report);
  assert.ok(html.indexOf('Schedule') !== -1);
  report.blocks.forEach(function (block) {
    assert.ok(html.indexOf(ProgressCalendar.formatClock(block.startMinutes)) !== -1 ||
      html.indexOf(block.startText) !== -1, 'time for ' + block.label);
  });
});

test('the viewer reports a missing day honestly instead of inventing data', function () {
  const model = makeModel();
  const html = ReportViewer.renderReportHTML('day', model.buildDayReport('2026-01-01'));
  assert.ok(html.indexOf('No study plan available') !== -1);
});

test('the viewer marks report bars with an accessible label', function () {
  const model = makeModel();
  const html = ReportViewer.renderReportHTML('overall', model.buildOverallReport());
  assert.ok(html.indexOf('role="img"') !== -1);
  assert.ok(/aria-label="\d+ percent complete"/.test(html));
});

test('the viewer escapes text taken from the data', function () {
  const html = ReportViewer.renderForKind('day', {
    kind: 'day', available: true, dayNumber: 1, weekdayLong: 'Monday',
    date: '2026-10-02', weekNumber: 1,
    node: { total: 1, completed: 0, remaining: 1, percent: 0 },
    blocks: [{ label: '<script>x</script>', category: 'study', startText: '1:00',
      endText: '2:00', isTaskBearing: true, taskCount: 1, node: { percent: 0 } }],
    tasks: []
  });
  assert.ok(html.indexOf('&lt;script&gt;') !== -1);
  assert.ok(html.indexOf('<script>x</script>') === -1);
});

// ---- report tree + export controls ----------------------------------------

test('the report tree describes the overall/subject/week/day hierarchy', function () {
  const model = makeModel();
  const tree = ReportTree.buildTree(model, function (what) {
    return '#/reports/' + what.level + (what.weekNumber ? '/week/' + what.weekNumber : '');
  });
  const flat = ReportTree.flatten(tree);
  assert.ok(flat.length > 0);
  assert.equal(flat[0].level, 'overall');
  assert.ok(flat.some(function (node) { return node.level === 'subject'; }));
  assert.ok(flat.some(function (node) { return node.level === 'week'; }));
  assert.ok(flat.some(function (node) { return node.level === 'day'; }));
});

test('export controls render a single read-only export button', function () {
  const viewModel = ExportControls.buildControlsViewModel({
    scope: 'overall', fileName: 'IITM-Overall-Progress.html'
  });
  const html = ExportControls.renderControlsHTML(viewModel);
  assert.equal(count(html, '<button'), 1);
  assert.ok(html.indexOf('data-action="export-html"') !== -1);
  assert.ok(html.indexOf('IITM-Overall-Progress.html') !== -1);
});

test('export controls degrade safely when no DOM is available', function () {
  const result = ExportControls.downloadHTML(null, '<html></html>', 'x.html', null);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'environment');
  assert.equal(result.html, '<html></html>');
});

// ---- routing: new report routes + no regression ----------------------------

test('report routes parse to the expected view and level', function () {
  const cases = [
    ['#/reports', 'index'],
    ['#/reports/overall', 'overall'],
    ['#/reports/subject/mathematics-i', 'subject'],
    ['#/reports/week/2', 'week'],
    ['#/reports/day/2026-10-05', 'day'],
    // U3 §3.2: the bare calendar route is now the week-SELECT level, not Week 1.
    ['#/reports/calendar', 'calendar-select'],
    ['#/reports/calendar/week/3', 'calendar'],
    ['#/reports/calendar/subject/english-i', 'calendar']
  ];
  cases.forEach(function (pair) {
    const route = Router.parseRoute(pair[0]);
    assert.equal(route.view, 'reports', pair[0]);
    assert.equal(route.level, pair[1], pair[0]);
    assert.equal(route.fallback, false, pair[0]);
  });
});

test('report routes carry their parameters', function () {
  assert.equal(Router.parseRoute('#/reports/subject/mathematics-i').subjectId, 'mathematics-i');
  assert.equal(Router.parseRoute('#/reports/week/2').weekNumber, 2);
  assert.equal(Router.parseRoute('#/reports/day/2026-10-05').date, '2026-10-05');
  assert.equal(Router.parseRoute('#/reports/calendar/week/3').weekNumber, 3);
  assert.equal(Router.parseRoute('#/reports/calendar/subject/english-i').subjectId, 'english-i');
});

test('report route builders round-trip through the parser', function () {
  const hashes = [
    Router.routeForReports(),
    Router.routeForReportOverall(),
    Router.routeForReportSubject('mathematics-i'),
    Router.routeForReportWeek(2),
    Router.routeForReportDay('2026-10-05'),
    Router.routeForReportCalendar(3),
    Router.routeForReportCalendar(1, 'english-i')
  ];
  hashes.forEach(function (hash) {
    const route = Router.parseRoute(hash);
    assert.equal(route.view, 'reports', hash);
    assert.equal(route.hash, hash, 'builder and parser must agree for ' + hash);
  });
});

test('existing Phase 4 and Phase 5 routes still work', function () {
  assert.equal(Router.parseRoute('#/calendar').view, 'calendar');
  assert.equal(Router.parseRoute('#/day/2026-10-02').view, 'day');
  assert.equal(Router.parseRoute('#/day/2026-10-02').date, '2026-10-02');
  assert.equal(Router.parseRoute('#/progress').view, 'progress');
  assert.equal(Router.parseRoute('#/progress').level, 'overall');
  assert.equal(Router.parseRoute('#/progress/subject/statistics-i').level, 'subject');
  assert.equal(Router.parseRoute('#/progress/week/1').weekNumber, 1);
  assert.equal(Router.parseRoute('#/progress/day/2026-10-02').date, '2026-10-02');
  assert.equal(Router.parseRoute('#/progress/subject/statistics-i/week/2').level, 'subjectWeek');
  assert.equal(Router.parseRoute('#/progress/week/1').hash, '#/progress/week/1');
});

test('an unknown hash still falls back to the calendar', function () {
  const route = Router.parseRoute('#/not-a-real-route');
  assert.equal(route.view, 'calendar');
  assert.equal(route.fallback, true);
});

test('the report routes do not swallow the tracker or calendar routes', function () {
  assert.equal(Router.parseRoute('#/day/2026-10-02').view, 'day');
  assert.notEqual(Router.parseRoute('#/day/2026-10-02').view, 'reports');
  assert.equal(Router.parseRoute('#/reports/day/2026-10-02').view, 'reports');
});
