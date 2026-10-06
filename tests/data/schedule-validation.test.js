'use strict';

/*
 * tests/data/schedule-validation.test.js — Study-Planner Phase 2
 *
 * Validates the 28 daily plan containers (data/schedule/daily/*.json):
 *   - exactly the cycle dates exist (2026-10-02 -> 2026-10-29)
 *   - every file passes the daily schema validator
 *   - filename/date/dayNumber/weekNumber are consistent
 *   - completion summaries are consistent with the task lists
 *   - planned tasks (once Phase 3 materializes them) resolve to canonical
 *     syllabus items with matching identity
 *   - malformed daily data is rejected (fixture-based)
 *
 * Run with:  node --test tests/data/schedule-validation.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'data-engine.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const SYLLABUS_DIR = path.join(ROOT, 'data', 'syllabus');
const DAILY_DIR = path.join(ROOT, 'data', 'schedule', 'daily');

const engine = DE.createDataEngine({ courses: DE.loadCoursesFromDirectory(SYLLABUS_DIR) });

const CYCLE_START_UTC = Date.UTC(2026, 9, 2); // 2026-10-02
const CYCLE_DAYS = 28;

function expectedDates() {
  const dates = [];
  for (let i = 0; i < CYCLE_DAYS; i++) {
    dates.push(new Date(CYCLE_START_UTC + i * 86400000).toISOString().slice(0, 10));
  }
  return dates;
}

function dailyFiles() {
  return fs.readdirSync(DAILY_DIR).filter((f) => /\.json$/i.test(f)).sort();
}

function readDaily(date) {
  return JSON.parse(fs.readFileSync(path.join(DAILY_DIR, date + '.json'), 'utf8'));
}

// Resolves every planned task against the canonical syllabus. Syllabus-linked
// tasks (any type outside the planner-only set) must identify a real syllabus
// item with matching identity; planner-only tasks (revision/review/break/free/
// fixed, Phase 3) must still carry a well-formed id under a real subject.
function assertPlanTasksResolve(plan, label) {
  for (const entry of plan.tasks) {
    const parsed = DE.parseTaskId(entry.taskId);
    assert.equal(entry.subjectId, parsed.subjectId, label + ': subjectId matches taskId');
    assert.equal(entry.weekNumber, parsed.weekNumber, label + ': weekNumber matches taskId');
    assert.equal(entry.sourceId, parsed.sourceId, label + ': sourceId matches taskId');
    const course = engine.getCourseBySubject(parsed.subjectId); // throws unknown_course otherwise
    const plannerOnly = DE.PLANNER_TASK_TYPES.indexOf(entry.type) !== -1;
    if (!plannerOnly) {
      const resolved = engine.getTask(entry.taskId); // throws unknown_task otherwise
      assert.equal(entry.courseId, resolved.courseId, label + ': courseId matches the syllabus');
    } else {
      assert.equal(entry.courseId, course.courseId, label + ': courseId matches the subject');
    }
  }
}

// ---------------------------------------------------------------------------
// Real cycle files
// ---------------------------------------------------------------------------

test('exactly the 28 cycle date files exist (2026-10-02 -> 2026-10-29)', () => {
  const expected = expectedDates().map((d) => d + '.json');
  assert.equal(expected.length, 28);
  assert.deepEqual(dailyFiles(), expected);
});

test('every daily file passes schema validation', () => {
  for (const file of dailyFiles()) {
    const doc = readDaily(file.replace(/\.json$/, ''));
    const result = DE.validateDailyPlan(doc);
    assert.equal(result.valid, true, file + ': ' + result.errors.join(' | '));
  }
});

test('filename, date, dayNumber, weekNumber are consistent', () => {
  expectedDates().forEach((date, index) => {
    const doc = readDaily(date);
    assert.equal(doc.planType, 'daily-study-plan', date);
    assert.equal(doc.schemaVersion, '1.0', date);
    assert.equal(doc.date, date, date + ': date matches filename');
    assert.equal(doc.dayNumber, index + 1, date + ': dayNumber');
    assert.equal(doc.weekNumber, Math.ceil((index + 1) / 7), date + ': weekNumber = ceil(day / 7)');
    assert.ok(DE.DAILY_STATUSES.indexOf(doc.status) !== -1, date + ': status in vocabulary');
  });
});

test('completion summaries are consistent with the task lists', () => {
  for (const date of expectedDates()) {
    const doc = readDaily(date);
    const completed = doc.tasks.filter((t) => t.completed === true).length;
    assert.equal(doc.completion.totalTasks, doc.tasks.length, date + ': totalTasks');
    assert.equal(doc.completion.completedTasks, completed, date + ': completedTasks');
    const expectedPercent = doc.tasks.length > 0 ? Math.round((completed / doc.tasks.length) * 100) : 0;
    assert.equal(doc.completion.percent, expectedPercent, date + ': percent');
  }
});

// ---------------------------------------------------------------------------
// Task resolution (matters most once Phase 3 materializes plans)
// ---------------------------------------------------------------------------

test('planned tasks (when present) resolve to canonical syllabus items', () => {
  for (const date of expectedDates()) {
    assertPlanTasksResolve(readDaily(date), date);
  }

  // Prove the resolution check on the materialized Day-3 plan, and that a
  // completed seed record (export workflow) remains schema-valid.
  const populated = readDaily('2026-10-04');
  assert.ok(populated.tasks.length > 0, 'Phase 3 materializes plans');
  assertPlanTasksResolve(populated, 'materialized fixture');

  const seedCopy = JSON.parse(JSON.stringify(populated));
  seedCopy.tasks[0].completed = true;
  seedCopy.tasks[0].completedAt = '2026-10-04T12:30:00.000Z';
  seedCopy.status = 'in_progress';
  seedCopy.completion = {
    totalTasks: seedCopy.tasks.length,
    completedTasks: 1,
    percent: Math.round((1 / seedCopy.tasks.length) * 100)
  };
  const seedCheck = DE.validateDailyPlan(seedCopy);
  assert.equal(seedCheck.valid, true, 'completed seed fields stay valid: ' + seedCheck.errors.join(' | '));

  const bad = JSON.parse(JSON.stringify(populated));
  bad.tasks[0].taskId = 'mathematics-i:1:NOT-A-REAL-ITEM';
  bad.tasks[0].sourceId = 'NOT-A-REAL-ITEM';
  assert.throws(() => assertPlanTasksResolve(bad, 'bad fixture'), (err) => err.code === 'unknown_task');
});

test('weekNumber mapping rule is enforced (ceil(day / 7))', () => {
  const doc = readDaily('2026-10-09'); // day 8 -> week 2
  assert.equal(doc.weekNumber, 2);
  const broken = JSON.parse(JSON.stringify(doc));
  broken.weekNumber = 1;
  const result = DE.validateDailyPlan(broken);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.indexOf('weekNumber') !== -1), result.errors.join(' | '));
});


