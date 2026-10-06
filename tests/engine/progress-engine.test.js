'use strict';

/*
 * tests/engine/progress-engine.test.js — Study-Planner Phase 2
 *
 * Validates the derived progress layer (src/js/progress-engine.js):
 *   - empty-scope rule (0 tasks -> 0%, never NaN/Infinity)
 *   - completion ratios and rounding
 *   - break / free / fixed exclusion from academic progress
 *   - category, week, subject, overall aggregation on the real syllabus
 *   - day progress from daily plans (when provided)
 *   - buildProgressStore shape (matches the shipped derived-cache schema)
 *   - rebuildability and determinism
 *
 * Run with:  node --test tests/engine/progress-engine.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'progress-engine.js'));
const DE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'data-engine.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const SYLLABUS_DIR = path.join(ROOT, 'data', 'syllabus');
const PROGRESS_FILE = path.join(ROOT, 'data', 'progress', 'progress.json');

const courses = DE.loadCoursesFromDirectory(SYLLABUS_DIR);
const sorted = DE.sortCourses(courses);
const math = sorted.find((c) => c.subjectId === 'mathematics-i');

const MATH_L1_1 = 'mathematics-i:1:L1.1';
const MATH_AQ1_1 = 'mathematics-i:1:AQ1.1';
const AT = '2026-10-04T12:30:00.000Z';

const TWO_DONE = {
  [MATH_L1_1]: { completed: true, completedAt: AT },
  [MATH_AQ1_1]: { completed: true, completedAt: AT }
};

function task(taskId, type) {
  return { taskId: taskId, type: type };
}

// ---------------------------------------------------------------------------
// Core counting rules
// ---------------------------------------------------------------------------

// Structural fingerprint: keys sorted, numbers -> '#', strings -> 'string', null stays null.
function shapeOf(value) {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach((key) => { out[key] = shapeOf(value[key]); });
    return out;
  }
  if (typeof value === 'number') return '#';
  if (value === null) return null;
  return typeof value;
}

test('empty-scope rule: 0 tasks -> 0%, never NaN or Infinity', () => {
  assert.deepEqual(PE.makeNode(0, 0), { total: 0, completed: 0, remaining: 0, percent: 0 });
  assert.deepEqual(PE.progressForTasks([], {}), { total: 0, completed: 0, remaining: 0, percent: 0 });
  assert.deepEqual(PE.progressForTasks([], null), { total: 0, completed: 0, remaining: 0, percent: 0 });
  assert.equal(PE.percentFor(0, 0), 0);
  assert.equal(PE.percentFor(1, 0), 0, 'guard against a non-zero numerator on an empty scope');
  assert.ok(!Number.isNaN(PE.percentFor(0, 0)));
  assert.ok(Number.isFinite(PE.percentFor(0, 0)));
});

test('completion ratios and rounding', () => {
  const one = [task('s:1:a', 'lecture')];
  assert.equal(PE.progressForTasks(one, { 's:1:a': { completed: true } }).percent, 100);
  assert.equal(PE.progressForTasks(one, {}).percent, 0);

  const three = [task('s:1:a', 'lecture'), task('s:1:b', 'lecture'), task('s:1:c', 'lecture')];
  assert.equal(PE.progressForTasks(three, { 's:1:a': { completed: true } }).percent, 33);
  assert.equal(PE.progressForTasks(three, {
    's:1:a': { completed: true }, 's:1:b': { completed: true }
  }).percent, 67);

  assert.equal(PE.percentFor(2, 30), 7);
  assert.equal(PE.percentFor(1, 138), 1);
  assert.equal(PE.percentFor(87, 87), 100);
  assert.equal(PE.percentFor(0, 87), 0);
});

test('breaks / free / fixed are excluded from academic progress', () => {
  assert.deepEqual(PE.NON_ACADEMIC_TYPES, ['break', 'free', 'fixed']);
  assert.equal(PE.isEligibleForProgress('lecture'), true);
  assert.equal(PE.isEligibleForProgress('graded'), true);
  assert.equal(PE.isEligibleForProgress('break'), false);
  assert.equal(PE.isEligibleForProgress('fixed'), false);

  const tasks = [
    task('s:1:l1', 'lecture'),
    task('s:1:br', 'break'),
    task('s:1:fx', 'fixed'),
    task('s:1:fr', 'free')
  ];
  const completions = {
    's:1:l1': { completed: true },
    's:1:br': { completed: true },
    's:1:fx': { completed: true },
    's:1:fr': { completed: true }
  };
  assert.deepEqual(PE.progressForTasks(tasks, completions),
    { total: 1, completed: 1, remaining: 0, percent: 100 },
    'only the lecture counts, even though breaks are marked complete');
});

test('category aggregation groups by type and hides excluded types', () => {
  const tasks = [
    task('s:1:l1', 'lecture'),
    task('s:1:l2', 'lecture'),
    task('s:1:a1', 'activity'),
    task('s:1:t1', 'tutorial'),
    task('s:1:br', 'break')
  ];
  const completions = {
    's:1:l1': { completed: true },
    's:1:t1': { completed: true },
    's:1:br': { completed: true }
  };
  const byType = PE.categoryProgress(tasks, completions);
  assert.deepEqual(Object.keys(byType), ['activity', 'lecture', 'tutorial']);
  assert.deepEqual(byType.lecture, { total: 2, completed: 1, remaining: 1, percent: 50 });
  assert.deepEqual(byType.activity, { total: 1, completed: 0, remaining: 1, percent: 0 });
  assert.deepEqual(byType.tutorial, { total: 1, completed: 1, remaining: 0, percent: 100 });
  assert.equal(byType.break, undefined);
});

// ---------------------------------------------------------------------------
// Aggregation over the real canonical syllabus
// ---------------------------------------------------------------------------

test('subject aggregation on real data (zero completions)', () => {
  const node = PE.progressForCourse(math, {});
  assert.equal(node.courseId, 'BSMA1001');
  assert.equal(node.subjectId, 'mathematics-i');
  assert.equal(node.total, 166);
  assert.equal(node.completed, 0);
  assert.equal(node.remaining, 166);
  assert.equal(node.percent, 0);
  assert.deepEqual(
    ['week-1', 'week-2', 'week-3', 'week-4'].map((k) => node.weeks[k].total),
    [30, 51, 38, 47]);
  assert.deepEqual(node.byType, {
    activity: { total: 45, completed: 0, remaining: 45, percent: 0 },
    graded: { total: 4, completed: 0, remaining: 4, percent: 0 },
    lecture: { total: 54, completed: 0, remaining: 54, percent: 0 },
    other: { total: 1, completed: 0, remaining: 1, percent: 0 },
    practice: { total: 8, completed: 0, remaining: 8, percent: 0 },
    solution: { total: 3, completed: 0, remaining: 3, percent: 0 },
    summary: { total: 1, completed: 0, remaining: 1, percent: 0 },
    tutorial: { total: 50, completed: 0, remaining: 50, percent: 0 }
  });
});

test('week aggregation across subjects (zero completions)', () => {
  const week1 = PE.weekProgressAcrossSubjects(courses, 1, {});
  assert.equal(week1.weekNumber, 1);
  assert.equal(week1.total, 87);
  assert.deepEqual(
    Object.keys(week1.subjects),
    ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i']);
  assert.deepEqual({
    math: week1.subjects['mathematics-i'].total,
    stats: week1.subjects['statistics-i'].total,
    ct: week1.subjects['computational-thinking'].total,
    english: week1.subjects['english-i'].total
  }, { math: 30, stats: 17, ct: 26, english: 14 });
  assert.equal(PE.weekProgressAcrossSubjects(courses, 9, {}).total, 0, 'unknown week is an empty scope');
});

test('overall aggregation on real data (zero completions)', () => {
  const result = PE.progressForAllCourses(courses, {});
  assert.deepEqual(result.overall, { total: 413, completed: 0, remaining: 413, percent: 0 });
  assert.deepEqual({
    math: result.subjects['mathematics-i'].total,
    stats: result.subjects['statistics-i'].total,
    ct: result.subjects['computational-thinking'].total,
    english: result.subjects['english-i'].total
  }, { math: 166, stats: 88, ct: 101, english: 58 });
  assert.deepEqual(
    ['week-1', 'week-2', 'week-3', 'week-4'].map((k) => result.weeks[k].total),
    [87, 114, 101, 111]);
  assert.deepEqual(result.byType, {
    activity: { total: 128, completed: 0, remaining: 128, percent: 0 },
    extra: { total: 3, completed: 0, remaining: 3, percent: 0 },
    graded: { total: 16, completed: 0, remaining: 16, percent: 0 },
    lecture: { total: 138, completed: 0, remaining: 138, percent: 0 },
    orientation: { total: 1, completed: 0, remaining: 1, percent: 0 },
    other: { total: 3, completed: 0, remaining: 3, percent: 0 },
    practice: { total: 27, completed: 0, remaining: 27, percent: 0 },
    solution: { total: 7, completed: 0, remaining: 7, percent: 0 },
    summary: { total: 1, completed: 0, remaining: 1, percent: 0 },
    tutorial: { total: 89, completed: 0, remaining: 89, percent: 0 }
  });
});

test('real integration: completing canonical tasks moves exact percentages', () => {
  const subject = PE.progressForCourse(math, TWO_DONE);
  assert.deepEqual(
    { total: subject.total, completed: subject.completed, percent: subject.percent },
    { total: 166, completed: 2, percent: 1 });
  assert.deepEqual(subject.weeks['week-1'], { total: 30, completed: 2, remaining: 28, percent: 7 });
  assert.deepEqual(subject.byType.lecture, { total: 54, completed: 1, remaining: 53, percent: 2 });
  assert.deepEqual(subject.byType.activity, { total: 45, completed: 1, remaining: 44, percent: 2 });

  const week1 = PE.weekProgressAcrossSubjects(courses, 1, TWO_DONE);
  assert.deepEqual(
    { total: week1.total, completed: week1.completed, percent: week1.percent },
    { total: 87, completed: 2, percent: 2 });

  const overall = PE.progressForAllCourses(courses, TWO_DONE);
  assert.deepEqual(overall.overall, { total: 413, completed: 2, remaining: 411, percent: 0 });

  const engine = PE.createProgressEngine({ courses: courses, completions: TWO_DONE });
  assert.equal(engine.getSubjectProgress('mathematics-i').percent, 1);
  assert.equal(engine.getWeekProgress(1, 'mathematics-i').percent, 7);
  assert.equal(engine.getWeekProgress(1).percent, 2);
  assert.equal(engine.getOverallProgress().overall.percent, 0);
  assert.equal(engine.getTaskCompletion(MATH_L1_1), true);
  assert.equal(engine.getTaskCompletion('mathematics-i:1:L1.2'), false);
});

test('missing / extra / malformed completion records are ignored safely', () => {
  assert.equal(PE.progressForAllCourses(courses, null).overall.completed, 0);
  assert.equal(PE.progressForAllCourses(courses, undefined).overall.completed, 0);

  const falseRecord = { [MATH_L1_1]: { completed: false } };
  assert.equal(PE.progressForCourse(math, falseRecord).completed, 0);

  const malformed = { [MATH_L1_1]: 'yes' };
  assert.equal(PE.progressForCourse(math, malformed).completed, 0);

  const unknown = { 'made-up-subject:1:x': { completed: true } };
  assert.equal(PE.progressForAllCourses(courses, unknown).overall.completed, 0,
    'records for unknown task ids have no effect');
});

// ---------------------------------------------------------------------------
// Day progress, wrapper queries, progress-store builder, determinism
// ---------------------------------------------------------------------------

test('day progress: plan-based with eligibility filtering; null for unknown dates', () => {
  const plan = {
    date: '2026-10-04',
    tasks: [
      task(MATH_L1_1, 'lecture'),
      task('mathematics-i:1:break-evening', 'break')
    ]
  };
  const node = PE.dayProgress(plan, { [MATH_L1_1]: { completed: true } });
  assert.deepEqual(
    { total: node.total, completed: node.completed, percent: node.percent },
    { total: 1, completed: 1, percent: 100 });
  assert.deepEqual(Object.keys(node.byType), ['lecture']);
  assert.equal(node.date, '2026-10-04');
  assert.throws(() => PE.dayProgress(null, {}), (err) => err.code === 'invalid_argument');

  const engine = PE.createProgressEngine({
    courses: courses, completions: { [MATH_L1_1]: { completed: true } }, dailyPlans: [plan]
  });
  assert.deepEqual(
    { total: engine.getDayProgress('2026-10-04').total, percent: engine.getDayProgress('2026-10-04').percent },
    { total: 1, percent: 100 });
  assert.equal(engine.getDayProgress('2099-01-01'), null);
});

test('wrapper category progress: scoped and global', () => {
  const engine = PE.createProgressEngine({ courses: courses, completions: {} });
  const english = engine.getCategoryProgress({ subjectId: 'english-i' });
  assert.deepEqual(Object.keys(english), ['activity', 'graded', 'lecture', 'practice']);
  assert.equal(english.activity.total, 25);
  assert.equal(english.lecture.total, 25);

  const week1 = engine.getCategoryProgress({ weekNumber: 1 });
  const week1Total = Object.keys(week1).reduce((sum, type) => sum + week1[type].total, 0);
  assert.equal(week1Total, engine.getWeekProgress(1).total, 'category totals sum to the week scope');

  const global = engine.getCategoryProgress({});
  const globalTotal = Object.keys(global).reduce((sum, type) => sum + global[type].total, 0);
  assert.equal(globalTotal, 413);
  assert.deepEqual(global, engine.getOverallProgress().byType);
});

test('buildProgressStore: explicit period required; totals and shape are correct', () => {
  assert.throws(() => PE.buildProgressStore(courses, {}, {}), (err) => err.code === 'invalid_argument');
  assert.throws(() => PE.buildProgressStore(courses, {}, { startDate: '02-10-2026', endDate: '2026-10-29' }),
    (err) => err.code === 'invalid_argument');
  assert.throws(() => PE.buildProgressStore(courses, {}, { startDate: '2026-10-29', endDate: '2026-10-02' }),
    (err) => err.code === 'invalid_argument');

  const store = PE.buildProgressStore(courses, {}, { startDate: '2026-10-02', endDate: '2026-10-29' });
  assert.deepEqual(store.period, { startDate: '2026-10-02', endDate: '2026-10-29', totalDays: 28, totalWeeks: 4 });
  assert.deepEqual(store.overall, { total: 413, completed: 0, percent: 0 });
  assert.deepEqual(store.subjects['mathematics-i'].overall, { total: 166, completed: 0, percent: 0 });
  assert.deepEqual(store.weeks['week-1'].overall, { total: 87, completed: 0, percent: 0 });
  assert.deepEqual(store.weeks['week-1'].subjects['english-i'], { total: 14, completed: 0, percent: 0 });
  assert.equal(store.lastUpdated, null);
  assert.equal(PE.buildProgressStore(courses, {}, {
    startDate: '2026-10-02', endDate: '2026-10-29', lastUpdated: AT
  }).lastUpdated, AT);

  const withState = PE.buildProgressStore(courses, TWO_DONE, { startDate: '2026-10-02', endDate: '2026-10-29' });
  assert.deepEqual(withState.subjects['mathematics-i'].overall, { total: 166, completed: 2, percent: 1 });
  assert.deepEqual(withState.weeks['week-1'].overall, { total: 87, completed: 2, percent: 2 });
  assert.deepEqual(withState.weeks['week-1'].subjects['mathematics-i'], { total: 30, completed: 2, percent: 7 });
  assert.deepEqual(withState.overall, { total: 413, completed: 2, percent: 0 });
});

test('buildProgressStore shape matches the shipped derived-cache schema', () => {
  const store = PE.buildProgressStore(courses, {}, { startDate: '2026-10-02', endDate: '2026-10-29' });
  const skeleton = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  assert.deepEqual(shapeOf(store), shapeOf(skeleton),
    'engine output and data/progress/progress.json share one schema shape');
});

test('rebuildability: the derived store recomputes exactly from completion state', () => {
  const period = { startDate: '2026-10-02', endDate: '2026-10-29' };
  const zeroA = PE.buildProgressStore(courses, {}, period);
  const zeroB = PE.buildProgressStore(courses, {}, period);
  assert.deepEqual(zeroA, zeroB);

  const withState = PE.buildProgressStore(courses, TWO_DONE, period);
  const rebuilt = PE.buildProgressStore(courses, JSON.parse(JSON.stringify(TWO_DONE)), period);
  assert.deepEqual(rebuilt, withState, 'reconstruction from raw completion state is exact');
  const cleared = PE.buildProgressStore(courses, {}, period);
  assert.deepEqual(cleared, zeroA, 'clearing state returns the store to its initial derived values');
});

test('progress calculations are deterministic across repeated calls', () => {
  assert.deepEqual(PE.progressForAllCourses(courses, TWO_DONE), PE.progressForAllCourses(courses, TWO_DONE));
  assert.deepEqual(PE.weekProgressAcrossSubjects(courses, 2, TWO_DONE),
    PE.weekProgressAcrossSubjects(courses, 2, TWO_DONE));
  assert.deepEqual(PE.progressForCourse(math, TWO_DONE), PE.progressForCourse(math, TWO_DONE));
});




