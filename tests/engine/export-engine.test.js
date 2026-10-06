/**
 * tests/engine/export-engine.test.js — Study-Planner Phase 6
 *
 * Focused tests for the export engine:
 *   - deterministic output
 *   - the exported HTML carries the real report data
 *   - the output is standalone (no runtime dependency on the app)
 *   - exporting never modifies source data
 *
 * The calendar export is exercised through the same report model the viewer
 * uses, so it is covered by the same pipeline rather than a separate path.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DataEngine = require(path.join(ROOT, 'src/js/data-engine.js'));
const ReportModel = require(path.join(ROOT, 'src/js/report-model.js'));
const ExportEngine = require(path.join(ROOT, 'src/js/export-engine.js'));

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

// ---- determinism ------------------------------------------------------------

test('the same report always exports byte-identical HTML', function () {
  const model = makeModel();
  assert.equal(ExportEngine.exportOverall(model), ExportEngine.exportOverall(model));
  assert.equal(ExportEngine.exportCalendar(model, 1), ExportEngine.exportCalendar(model, 1));
  assert.equal(ExportEngine.exportDaily(model, FIRST_DATE), ExportEngine.exportDaily(model, FIRST_DATE));
});

test('two models built from the same data export identical HTML', function () {
  assert.equal(ExportEngine.exportOverall(makeModel()), ExportEngine.exportOverall(makeModel()));
});

test('the output contains no timestamp or random value', function () {
  const html = ExportEngine.exportOverall(makeModel());
  assert.ok(!/Date\.now|Math\.random|new Date\(\)/.test(html));
  // A full ISO timestamp appearing anywhere would break reproducibility.
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(html));
});

// ---- standalone output ------------------------------------------------------

test('the export is a complete standalone HTML document', function () {
  const html = ExportEngine.exportOverall(makeModel());
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('</html>'));
  assert.ok(html.includes('<meta charset="utf-8">'));
});

test('the export references no external asset and needs no app runtime', function () {
  const html = ExportEngine.exportOverall(makeModel());
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external script');
  assert.ok(!/<link[^>]+stylesheet/i.test(html), 'no external stylesheet');
  assert.ok(!/localStorage/.test(html), 'no localStorage');
  assert.ok(!/fetch\(/.test(html), 'no runtime fetch');
  assert.ok(!/StudyPlanner/.test(html.replace(/Study Planner/g, '')), 'no app global');
});

test('the export embeds its own stylesheet', function () {
  const html = ExportEngine.exportOverall(makeModel());
  assert.ok(html.includes('<style>'));
  // The export carries its OWN selectors (not the app's component classes).
  assert.ok(html.includes('.cal-gridline'), 'calendar styles must be embedded');
  assert.ok(html.includes('.blk'), 'block styles must be embedded');
  assert.ok(html.includes('table{width:100%'), 'table styles must be embedded');
});

// ---- data fidelity ----------------------------------------------------------

test('the overall export contains the real totals', function () {
  const model = makeModel();
  const report = model.buildOverallReport();
  const html = ExportEngine.exportOverall(model);
  assert.ok(html.includes(report.node.total + ''), 'total must appear');
  assert.ok(html.includes(report.node.percent + '%'), 'percent must appear');
  report.subjects.forEach(function (subject) {
    assert.ok(html.includes(subject.label), subject.label + ' must appear');
  });
});

test('the daily export contains that date, its blocks and times', function () {
  const model = makeModel();
  const report = model.buildDayReport(FIRST_DATE);
  const html = ExportEngine.exportDaily(model, FIRST_DATE);
  // The date heads the document (title + <h1>) rather than repeating in a body heading.
  assert.ok(html.includes(FIRST_DATE));
  assert.equal(count(html, '<h1>'), 1, 'exactly one document heading');
  report.blocks.forEach(function (block) {
    assert.ok(html.includes(ExportEngine.escapeHtml(block.label)),
      'block "' + block.label + '" must appear');
  });
});

test('every export has exactly one heading', function () {
  const model = makeModel();
  [
    ExportEngine.exportOverall(model),
    ExportEngine.exportWeek(model, 1),
    ExportEngine.exportSubject(model, 'mathematics-i'),
    ExportEngine.exportDaily(model, FIRST_DATE),
    ExportEngine.exportCalendar(model, 1)
  ].forEach(function (html) {
    assert.equal(count(html, '<h1>'), 1);
  });
});

test('the weekly export lists all seven days', function () {
  const model = makeModel();
  const report = model.buildWeekReport(1);
  const html = ExportEngine.exportWeek(model, 1);
  assert.equal(report.days.length, 7);
  report.days.forEach(function (day) {
    assert.ok(html.includes(day.date), day.date + ' must appear');
  });
});

test('the subject export contains that subject', function () {
  const model = makeModel();
  const html = ExportEngine.exportSubject(model, 'mathematics-i');
  assert.ok(html.includes('Mathematics I'));
});

// ---- calendar export --------------------------------------------------------

test('the calendar export draws seven day columns', function () {
  const html = ExportEngine.exportCalendar(makeModel(), 1);
  // 7 headers + 7 columns.
  assert.equal((html.match(/class="cal-day-head"/g) || []).length, 7);
  assert.equal((html.match(/class="cal-col"/g) || []).length, 7);
});

test('the calendar export positions blocks by real minutes', function () {
  const model = makeModel();
  const report = model.buildCalendarReport(1);
  const html = ExportEngine.exportCalendar(model, 1);
  const mathBlock = report.days[0].blocks.filter(function (b) {
    return b.blockId === 'mathematics';
  })[0];
  const geo = ExportEngine.geometry(mathBlock, report.window);
  // The Mathematics block is the first of the day: 0% from the window start.
  assert.equal(geo.topPercent, 0);
  // 120 of 720 minutes = 16.666...%
  assert.ok(Math.abs(geo.heightPercent - 120 / 720 * 100) < 1e-9);
  assert.ok(html.includes('top:0%;height:' + geo.heightPercent + '%'));
});

test('the calendar export writes exact top/height percentages', function () {
  const html = ExportEngine.exportCalendar(makeModel(), 1);
  const matches = html.match(/style="top:([\d.]+)%;height:([\d.]+)%"/g) || [];
  assert.ok(matches.length > 0);
  // 11:00-13:00 (120min) must be exactly twice 21:30-22:30 (60min).
  const heights = matches.map(function (m) {
    const parsed = /height:([\d.]+)%/.exec(m);
    return Number(parsed[1]);
  });
  const twoHours = 120 / 720 * 100;
  const oneHour = 60 / 720 * 100;
  assert.ok(heights.some(function (h) { return Math.abs(h - twoHours) < 1e-6; }));
  assert.ok(heights.some(function (h) { return Math.abs(h - oneHour) < 1e-6; }));
});

test('the calendar export colours blocks deterministically by token', function () {
  const model = makeModel();
  const html = ExportEngine.exportCalendar(model, 1);
  assert.ok(html.includes('blk is-math'));
  assert.ok(html.includes('blk is-stats'));
  assert.ok(html.includes('blk is-ct'));
  assert.ok(html.includes('blk is-english'));
  // U4 §3.5: break-only blocks (category break/free/fixed -> 'rest' token) are
  // hidden from the exported chart, exactly like the on-screen chart.
  assert.ok(!html.includes('blk is-rest'),
    'break-only rest blocks are filtered from the timetable chart');
  // The same subject always lands on the same token.
  assert.equal(ExportEngine.exportCalendar(model, 1), ExportEngine.exportCalendar(model, 1));
});

test('the calendar export marks completed blocks subtly, not with badges', function () {
  const block = PLANS[0].schedule[0];
  const completions = {};
  block.taskIds.forEach(function (id) {
    completions[id] = { completed: true, completedAt: '2026-10-02T00:00:00.000Z' };
  });
  const model = makeModel(completions);
  const html = ExportEngine.exportCalendar(model, 1);
  assert.ok(html.includes('data-state="complete"'));
  assert.ok(html.includes('data-state="none"'), 'untouched blocks stay normal');
  assert.ok(!/streak|badge|pomodoro|score/i.test(html));
});

// ---- read-only guarantees ---------------------------------------------------

test('exporting never modifies the source plans', function () {
  const before = JSON.stringify(PLANS);
  const model = makeModel();
  ExportEngine.exportOverall(model);
  ExportEngine.exportCalendar(model, 1);
  ExportEngine.exportDaily(model, FIRST_DATE);
  ExportEngine.exportWeek(model, 2);
  ExportEngine.exportSubject(model, 'english-i');
  assert.equal(JSON.stringify(PLANS), before);
});

test('exporting never modifies the completion map', function () {
  const completions = {};
  PLANS[0].schedule[0].taskIds.forEach(function (id) {
    completions[id] = { completed: true, completedAt: '2026-10-02T00:00:00.000Z' };
  });
  const before = JSON.stringify(completions);
  ExportEngine.exportOverall(makeModel(completions));
  assert.equal(JSON.stringify(completions), before);
});

test('exporting a report that is not in the report model is refused', function () {
  assert.throws(function () { ExportEngine.renderStandaloneHTML(null); });
  assert.throws(function () { ExportEngine.renderStandaloneHTML({ kind: 'nonsense' }); });
});

test('suggested file names follow the documented layout', function () {
  assert.equal(ExportEngine.suggestFileName('day', '2026-10-02'), 'reports/daily/2026-10-02.html');
  assert.equal(ExportEngine.suggestFileName('week', '1'), 'reports/weekly/Week-1.html');
  assert.equal(ExportEngine.suggestFileName('calendar', '2'), 'reports/weekly/Week-2-Timetable.html');
  assert.equal(ExportEngine.suggestFileName('overall', null), 'reports/overall/IITM-Overall-Progress.html');
});
