/**
 * tests/engine/report-model.test.js — Study-Planner Phase 6
 *
 * Focused tests for the report model:
 *   - the four report scopes build from real data
 *   - totals and completion values are correct
 *   - the model agrees with progress-engine (the calculation authority)
 *   - time resolution and block positioning are exact
 *
 * Uses the real repository data (canonical syllabus + materialised plans) so the
 * assertions describe the actual application, not a hand-built fixture.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DataEngine = require(path.join(ROOT, 'src/js/data-engine.js'));
const ProgressEngine = require(path.join(ROOT, 'src/js/progress-engine.js'));
const ReportModel = require(path.join(ROOT, 'src/js/report-model.js'));

const SYLLABUS_FILES = ['mathematics-i', 'statistics', 'computational-thinking', 'english'];

function loadCourses() {
  const courses = SYLLABUS_FILES.map(function (file) {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/syllabus', file + '.json'), 'utf8'));
    return DataEngine.normalizeCourse(doc);
  });
  return DataEngine.sortCourses(courses);
}

function loadPlans() {
  const dir = path.join(ROOT, 'data/schedule/daily');
  return fs.readdirSync(dir)
    .filter(function (file) { return /\.json$/.test(file); })
    .sort()
    .map(function (file) {
      return DataEngine.normalizeDailyPlan(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    });
}

const COURSES = loadCourses();
const PLANS = loadPlans();
const FIRST_DATE = PLANS[0].date;          // 2026-10-02

function makeModel(completions) {
  return ReportModel.createReportModel({
    courses: COURSES,
    completions: completions || {},
    plans: PLANS
  });
}

// Completing every task in one schedule block of day 1.
function completionsForBlock(blockIndex) {
  const block = PLANS[0].schedule[blockIndex];
  const map = {};
  (block.taskIds || []).forEach(function (id) {
    map[id] = { completed: true, completedAt: '2026-10-02T00:00:00.000Z' };
  });
  return map;
}

// ---- time resolution -------------------------------------------------------

test('clockToDialMinutes parses the 12-hour clock the planner emits', function () {
  assert.equal(ReportModel.clockToDialMinutes('11:00'), 660);
  assert.equal(ReportModel.clockToDialMinutes('1:00'), 60);
  assert.equal(ReportModel.clockToDialMinutes('9:15'), 555);
  assert.equal(ReportModel.clockToDialMinutes('10:30'), 630);
});

test('clockToDialMinutes rejects unusable values instead of guessing', function () {
  assert.equal(ReportModel.clockToDialMinutes('13:00'), null);
  assert.equal(ReportModel.clockToDialMinutes('25:00'), null);
  assert.equal(ReportModel.clockToDialMinutes('nope'), null);
  assert.equal(ReportModel.clockToDialMinutes(''), null);
  assert.equal(ReportModel.clockToDialMinutes(null), null);
});

test('resolveSchedule recovers the meridiem so the day runs forward', function () {
  const resolved = ReportModel.resolveSchedule(PLANS[0].schedule);
  // Day 1 starts at 11:00 (660) and ends at 23:00 (1380): a 12-hour window.
  assert.equal(resolved[0].startMinutes, 660);
  assert.equal(resolved[resolved.length - 1].endMinutes, 1380);
  for (let i = 1; i < resolved.length; i++) {
    assert.ok(resolved[i].startMinutes >= resolved[i - 1].startMinutes,
      'block ' + i + ' must not move backwards');
  }
});

test('duration is exact, including half-hour boundaries', function () {
  const resolved = ReportModel.resolveSchedule(PLANS[0].schedule);
  const byId = {};
  resolved.forEach(function (entry) { byId[entry.block.blockId] = entry; });
  assert.equal(byId.mathematics.durationMinutes, 120);       // 11:00 -> 13:00
  assert.equal(byId['lunch-rest'].durationMinutes, 30);      // 13:00 -> 13:30
  assert.equal(byId.english.durationMinutes, 45);           // 20:30 -> 21:15
  assert.equal(byId.refresh.durationMinutes, 15);            // 21:15 -> 21:30
  assert.equal(byId.revision.durationMinutes, 60);          // 21:30 -> 22:30
});

test('a 120-minute block is exactly twice a 60-minute block', function () {
  const resolved = ReportModel.resolveSchedule(PLANS[0].schedule);
  const byId = {};
  resolved.forEach(function (entry) { byId[entry.block.blockId] = entry; });
  assert.equal(byId.mathematics.durationMinutes, byId.revision.durationMinutes * 2);
});

test('resolveWindow reports the span the blocks actually cover', function () {
  const window = ReportModel.resolveWindow(ReportModel.resolveSchedule(PLANS[0].schedule));
  assert.equal(window.startMinutes, 660);
  assert.equal(window.endMinutes, 1380);
  assert.equal(window.spanMinutes, 720);
});

// ---- daily report ----------------------------------------------------------

test('day report exposes date, blocks, tasks and a progress node', function () {
  const report = makeModel().buildDayReport(FIRST_DATE);
  assert.equal(report.available, true);
  assert.equal(report.date, FIRST_DATE);
  assert.equal(report.dayNumber, 1);
  assert.equal(report.weekNumber, 1);
  assert.equal(report.blocks.length, PLANS[0].schedule.length);
  assert.ok(report.tasks.length > 0);
});

test('day report total matches progress-engine.dayProgress', function () {
  const report = makeModel().buildDayReport(FIRST_DATE);
  const expected = ProgressEngine.dayProgress(PLANS[0], {});
  // The engine's day node carries extra detail (byType); the report exposes the
  // four shared numbers, which must be identical.
  ['total', 'completed', 'remaining', 'percent'].forEach(function (key) {
    assert.equal(report.node[key], expected[key], key + ' must match the engine');
  });
});

test('day report reflects completion from the completion map', function () {
  const completions = completionsForBlock(0);            // the Mathematics block
  const report = makeModel(completions).buildDayReport(FIRST_DATE);
  assert.equal(report.node.completed, completionsForBlock(0) &&
    PLANS[0].schedule[0].taskIds.length);
  assert.ok(report.node.percent > 0);
  assert.equal(report.node.remaining, report.node.total - report.node.completed);
});

test('a day with no plan reports unavailable without inventing data', function () {
  const report = makeModel().buildDayReport('2026-01-01');
  assert.equal(report.available, false);
  assert.deepEqual(report.blocks, []);
  assert.equal(report.node.total, 0);
  assert.equal(report.node.percent, 0);
});

test('non-academic blocks are shown but carry no progress node', function () {
  const report = makeModel().buildDayReport(FIRST_DATE);
  const lunch = report.blocks.filter(function (b) { return b.blockId === 'lunch-rest'; })[0];
  assert.equal(lunch.isTaskBearing, false);
  assert.equal(lunch.node, null);
  assert.equal(lunch.taskCount, 0);
});

test('block colour is deterministic and identical for the same subject', function () {
  const a = ReportModel.colorTokenFor({ subjectId: 'mathematics-i', category: 'study' });
  const b = ReportModel.colorTokenFor({ subjectId: 'mathematics-i', category: 'study' });
  assert.equal(a, b);
  assert.equal(a, 'math');
  assert.equal(ReportModel.colorTokenFor({ subjectId: null, category: 'break' }), 'rest');
});

test('different subjects get different colour tokens', function () {
  const tokens = ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i']
    .map(function (id) { return ReportModel.colorTokenFor({ subjectId: id }); });
  assert.equal(new Set(tokens).size, 4);
});

// ---- weekly report + calendar --------------------------------------------

test('week report lists seven days with the right dates', function () {
  const report = makeModel().buildWeekReport(1);
  assert.equal(report.available, true);
  assert.equal(report.days.length, 7);
  assert.equal(report.startDate, '2026-10-02');
  assert.equal(report.endDate, '2026-10-08');
  assert.equal(report.weekNumber, 1);
});

test('week report total equals the sum of its day totals', function () {
  const report = makeModel().buildWeekReport(1);
  const sum = report.days.reduce(function (acc, day) { return acc + day.node.total; }, 0);
  assert.equal(report.node.total, sum);
});

test('week report agrees with progress-engine week scope', function () {
  const report = makeModel().buildWeekReport(2);
  const expected = ProgressEngine.weekProgressAcrossSubjects(COURSES, 2, {});
  ['total', 'completed', 'remaining', 'percent'].forEach(function (key) {
    assert.equal(report.node[key], expected[key], key + ' must match the engine');
  });
});

test('subject-scoped week totals sum from the day rows', function () {
  const report = makeModel().buildWeekReport(1, 'mathematics-i');
  const sum = report.days.reduce(function (acc, day) { return acc + day.node.total; }, 0);
  assert.equal(report.node.total, sum);
  assert.ok(report.node.total > 0);
});

test('weekly calendar has seven days, each with real positioned blocks', function () {
  const report = makeModel().buildCalendarReport(1);
  assert.equal(report.kind, 'calendar');
  assert.equal(report.days.length, 7);
  assert.equal(report.window.spanMinutes, 720);
  report.days.forEach(function (day) {
    assert.ok(day.blocks.length > 0, day.date + ' must have blocks');
    day.blocks.forEach(function (block) {
      assert.ok(block.startMinutes < block.endMinutes);
      assert.equal(block.durationMinutes, block.endMinutes - block.startMinutes);
    });
  });
});

test('calendar day dates match the week they belong to', function () {
  const report = makeModel().buildCalendarReport(2);
  report.days.forEach(function (day, index) {
    assert.equal(day.date, PLANS[7 + index].date);
  });
});

test('subject-scoped calendar keeps only that subject blocks', function () {
  const report = makeModel().buildCalendarReport(1, { subjectId: 'statistics-i' });
  report.days.forEach(function (day) {
    day.blocks.forEach(function (block) {
      assert.equal(block.subjectId, 'statistics-i');
    });
  });
});

test('calendar blocks are all inside the shared window', function () {
  const report = makeModel().buildCalendarReport(1);
  report.days.forEach(function (day) {
    day.blocks.forEach(function (block) {
      assert.ok(block.startMinutes >= report.window.startMinutes);
      assert.ok(block.endMinutes <= report.window.endMinutes);
    });
  });
});

// ---- subject + overall -----------------------------------------------------

test('subject report carries identity, totals and per-week nodes', function () {
  const report = makeModel().buildSubjectReport('mathematics-i');
  assert.equal(report.available, true);
  assert.equal(report.subjectId, 'mathematics-i');
  assert.equal(report.label, 'Mathematics I');
  assert.equal(report.courseId, 'BSMA1001');
  assert.equal(report.weeks.length, 4);
  assert.ok(report.node.total > 0);
});

test('subject report agrees with progress-engine subject scope', function () {
  const report = makeModel().buildSubjectReport('statistics-i');
  const expected = ProgressEngine.progressForCourse(
    COURSES.filter(function (c) { return c.subjectId === 'statistics-i'; })[0], {});
  assert.equal(report.node.total, expected.total);
  assert.equal(report.node.percent, expected.percent);
});

test('subject week nodes sum to the subject total', function () {
  const report = makeModel().buildSubjectReport('computational-thinking');
  const sum = report.weeks.reduce(function (acc, week) { return acc + week.node.total; }, 0);
  assert.equal(report.node.total, sum);
});

test('unknown subject is unavailable rather than an error', function () {
  const report = makeModel().buildSubjectReport('does-not-exist');
  assert.equal(report.available, false);
  assert.equal(report.node.total, 0);
});

test('overall report covers the cycle and lists subjects and weeks', function () {
  const report = makeModel().buildOverallReport();
  assert.equal(report.kind, 'overall');
  assert.equal(report.subjects.length, 4);
  assert.equal(report.weeks.length, 4);
  assert.equal(report.cycleStart, PLANS[0].date);
  assert.equal(report.cycleEnd, PLANS[PLANS.length - 1].date);
});

test('overall report agrees with progress-engine overall scope', function () {
  const report = makeModel().buildOverallReport();
  const expected = ProgressEngine.progressForAllCourses(COURSES, {}).overall;
  ['total', 'completed', 'remaining', 'percent'].forEach(function (key) {
    assert.equal(report.node[key], expected[key], key + ' must match the engine');
  });
});

test('subject rows sum to the overall total', function () {
  const report = makeModel().buildOverallReport();
  const sum = report.subjects.reduce(function (acc, s) { return acc + s.node.total; }, 0);
  assert.equal(report.node.total, sum);
});

test('week rows sum to the overall total', function () {
  const report = makeModel().buildOverallReport();
  const sum = report.weeks.reduce(function (acc, w) { return acc + w.node.total; }, 0);
  assert.equal(report.node.total, sum);
});

test('subjects keep the canonical order from the data engine', function () {
  const report = makeModel().buildOverallReport();
  assert.deepEqual(report.subjects.map(function (s) { return s.subjectId; }),
    ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i']);
});

// ---- read-only guarantees --------------------------------------------------

test('building every report leaves the source plans untouched', function () {
  const before = JSON.stringify(PLANS);
  const model = makeModel();
  model.buildOverallReport();
  model.buildSubjectReport('mathematics-i');
  model.buildWeekReport(1);
  model.buildDayReport(FIRST_DATE);
  model.buildCalendarReport(1);
  assert.equal(JSON.stringify(PLANS), before, 'plan documents must not be mutated');
});

test('building every report leaves the completion map untouched', function () {
  const completions = completionsForBlock(0);
  const before = JSON.stringify(completions);
  const model = makeModel(completions);
  model.buildOverallReport();
  model.buildCalendarReport(1);
  assert.equal(JSON.stringify(completions), before);
});

test('the model exposes copies, so callers cannot reach into its state', function () {
  const model = makeModel();
  const copy = model.getPlans();
  copy[0].date = 'mutated';
  assert.notEqual(model.getPlans()[0].date, 'mutated');
});

test('two models built from the same data produce identical reports', function () {
  const a = makeModel().buildOverallReport();
  const b = makeModel().buildOverallReport();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('a missing day inside an otherwise full week is reported honestly', function () {
  const partial = PLANS.filter(function (plan) { return plan.date !== '2026-10-05'; });
  const model = ReportModel.createReportModel({
    courses: COURSES, completions: {}, plans: partial
  });
  const report = model.buildWeekReport(1);
  assert.equal(report.days.length, 6);
  assert.equal(report.node.total,
    report.days.reduce(function (acc, day) { return acc + day.node.total; }, 0));
});
