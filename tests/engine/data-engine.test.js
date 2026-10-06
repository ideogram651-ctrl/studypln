'use strict';

/*
 * tests/engine/data-engine.test.js — Study-Planner Phase 2
 *
 * Validates the core data access layer (src/js/data-engine.js):
 *   - loads / validates / normalizes the canonical syllabus
 *   - preserves source order, nulls, and source values
 *   - rejects malformed course and daily documents with clear errors
 *   - owns the stable, date-independent task id:  <subjectId>:<weekNumber>:<sourceId>
 *   - builds the task model and reads daily plans without generating them
 *
 * Run with:  node --test tests/engine/data-engine.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'data-engine.js'));
const extractor = require(path.resolve(__dirname, '..', '..', 'tools', 'extract-syllabus.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const SYLLABUS_DIR = path.join(ROOT, 'data', 'syllabus');
const DAILY_DIR = path.join(ROOT, 'data', 'schedule', 'daily');

const COURSE_IDS = ['BSMA1001', 'BSMA1002', 'BSCS1001', 'BSHS1001'];
const SUBJECT_IDS = ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i'];
const TOTAL_ITEMS = { 'mathematics-i': 166, 'statistics-i': 88, 'computational-thinking': 101, 'english-i': 58 };

function loadEngine() {
  return DE.createDataEngine({
    courses: DE.loadCoursesFromDirectory(SYLLABUS_DIR),
    dailyPlans: DE.loadDailyPlansFromDirectory(DAILY_DIR)
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validCourseDoc() {
  return readJson(path.join(SYLLABUS_DIR, 'mathematics-i.json'));
}

function brokenCourse(mutator) {
  const doc = validCourseDoc();
  mutator(doc);
  return doc;
}

function assertCode(fn, code, label) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code, label + ': code');
    return true;
  }, label);
}

// ---------------------------------------------------------------------------
// Loading, identity, source fidelity
// ---------------------------------------------------------------------------

test('loads all four courses with the expected identities', () => {
  const engine = loadEngine();
  const courses = engine.loadAllCourses();
  assert.equal(courses.length, 4);
  assert.deepEqual(courses.map((c) => c.courseId), COURSE_IDS);
  assert.deepEqual(courses.map((c) => c.subjectId), SUBJECT_IDS);
  for (const course of courses) {
    assert.equal(course.weekCount, 4, course.courseId + ': weekCount');
    assert.equal(course.weeks.length, 4, course.courseId + ': weeks');
    assert.equal(engine.getCourseBySubject(course.subjectId).courseId, course.courseId);
  }
  assert.equal(engine.getCourseBySubject('computational-thinking').courseName, 'CT');
});

test('source order is preserved through the engine', () => {
  const engine = loadEngine();
  const raw = readJson(path.join(SYLLABUS_DIR, 'mathematics-i.json'));
  const rawIds = raw.weeks.reduce((list, w) => list.concat(w.items.map((i) => i.sourceId)), []);
  const engineIds = engine.getAllItems('BSMA1001').map((i) => i.sourceId);
  assert.deepEqual(engineIds, rawIds, 'item order matches the canonical file');

  const rawWeeks = raw.weeks.map((w) => w.weekNumber);
  assert.deepEqual(engine.loadCourse('BSMA1001').weeks.map((w) => w.weekNumber), rawWeeks);
  assert.deepEqual(engine.getWeek('BSMA1001', 2).items.map((i) => i.sourceId),
    raw.weeks[1].items.map((i) => i.sourceId));
});

test('missing values remain null and are never fabricated', () => {
  const engine = loadEngine();
  const area = engine.getItem('BSMA1001', 2, 'L2.4');
  assert.equal(area.duration, null);
  assert.equal(area.durationSeconds, null);
  assert.deepEqual(area.warnings, ['duration_unavailable']);

  const programming = engine.getItem('BSMA1002', 4, 'Programming');
  assert.equal(programming.questionCount, null);
  assert.deepEqual(programming.links, []);
  assert.deepEqual(programming.warnings, ['open_failed', 'open_link_missing']);

  const known = engine.getItem('BSMA1001', 1, 'L1.1');
  assert.equal(known.duration, '20:49');
  assert.equal(known.durationSeconds, 1249);
  assert.equal(known.questionCount, null); // videos have no question count
  assert.ok(Object.prototype.hasOwnProperty.call(known, 'questionCount'));
});

test('queries: weeks, items, types, graded splits', () => {
  const engine = loadEngine();
  assert.equal(engine.getWeek('BSMA1001', 1).items.length, 30);
  assert.equal(engine.getItem('BSMA1001', 1, 'L1.1').type, 'lecture');
  assert.equal(engine.getAllItems('BSHS1001').length, TOTAL_ITEMS['english-i']);
  assert.equal(engine.getItemsByType('BSHS1001', 'activity').length, 25);
  assert.equal(engine.getItemsByType('BSMA1001', 'tutorial').length, 50);
  for (const [subjectId, total] of Object.entries(TOTAL_ITEMS)) {
    const courseId = engine.getCourseBySubject(subjectId).courseId;
    assert.equal(engine.getAllItems(courseId).length, total, subjectId + ': item count');
    assert.equal(engine.getGradedItems(courseId).length, 4, subjectId + ': graded count');
    assert.equal(engine.getNonGradedItems(courseId).length, total - 4, subjectId + ': non-graded count');
  }
});

// ---------------------------------------------------------------------------
// Failure modes and immutability
// ---------------------------------------------------------------------------

test('unknown course / week / item produce clear failures', () => {
  const engine = loadEngine();
  assertCode(() => engine.loadCourse('NOPE'), 'unknown_course', 'unknown courseId');
  assertCode(() => engine.getCourseBySubject('nope'), 'unknown_course', 'unknown subjectId');
  assertCode(() => engine.getWeek('BSMA1001', 9), 'unknown_week', 'unknown week');
  assertCode(() => engine.getItem('BSMA1001', 1, 'NOPE'), 'unknown_item', 'unknown item');
  assertCode(() => engine.getTask('mathematics-i:9:L1.1'), 'unknown_task', 'unresolvable task');
});

test('engine results are immutable copies', () => {
  const engine = loadEngine();
  const items = engine.getAllItems('BSMA1001');
  items[0].title = 'MUTATED';
  items[0].warnings.push('open_failed');
  const again = engine.getAllItems('BSMA1001');
  assert.equal(again[0].title, 'L1.1: Natural Numbers and their operations');
  assert.deepEqual(again[0].warnings, []);

  const course = engine.loadCourse('BSMA1001');
  course.weeks[0].items.pop();
  assert.equal(engine.getWeek('BSMA1001', 1).items.length, 30);
});

test('malformed course documents are rejected with useful errors', () => {
  const cases = [
    ['wrong schemaVersion', (d) => { d.schemaVersion = '9.9'; }, 'schemaVersion'],
    ['missing subjectId', (d) => { d.subjectId = ''; }, 'subjectId'],
    ['subjectId with colon', (d) => { d.subjectId = 'math:i'; }, 'subjectId'],
    ['weekCount mismatch', (d) => { d.weekCount = 3; }, 'weekCount'],
    ['bad weekId', (d) => { d.weeks[0].weekId = 'nope'; }, 'weekId'],
    ['itemCount mismatch', (d) => { d.weeks[0].source.itemCount = 999; }, 'itemCount'],
    ['unknown item type', (d) => { d.weeks[0].items[0].type = 'mystery'; }, 'type'],
    ['duration without seconds', (d) => { d.weeks[0].items[0].durationSeconds = null; }, 'durationSeconds'],
    ['seconds without duration', (d) => { d.weeks[1].items[0].duration = null; }, 'durationSeconds'],
    ['bad questionCount', (d) => {
      const item = d.weeks[0].items.find((i) => i.questionCount !== null);
      item.questionCount = -1;
    }, 'questionCount'],
    ['sourceId with colon', (d) => { d.weeks[0].items[0].sourceId = 'L:1.1'; }, 'sourceId'],
    ['duplicate sourceId in week', (d) => { d.weeks[0].items[1].sourceId = d.weeks[0].items[0].sourceId; }, 'duplicate'],
    ['unknown warning id', (d) => { d.weeks[0].items[0].warnings = ['mystery_warning']; }, 'warnings'],
    ['bad rowClass', (d) => { d.weeks[0].items[0].source.rowClass = 'weird'; }, 'rowClass'],
    ['weekNumber mismatch on item', (d) => { d.weeks[0].items[0].weekNumber = 4; }, 'weekNumber']
  ];
  for (const [label, mutator, fragment] of cases) {
    const doc = brokenCourse(mutator);
    const result = DE.validateCourse(doc);
    assert.equal(result.valid, false, label + ': must be invalid');
    assert.ok(result.errors.some((e) => e.indexOf(fragment) !== -1),
      label + ': errors mention "' + fragment + '" (got: ' + result.errors.join(' | ') + ')');
    assertCode(() => DE.normalizeCourse(doc), 'invalid_course', label + ': normalizeCourse throws');
  }
  // Positive control: the four real documents validate.
  for (const file of fs.readdirSync(SYLLABUS_DIR).filter((f) => /\.json$/.test(f) && f !== 'course-template.json')) {
    const result = DE.validateCourse(readJson(path.join(SYLLABUS_DIR, file)));
    assert.equal(result.valid, true, file + ' validates: ' + result.errors.join(' | '));
  }
});

test('vocabularies stay in sync with the Phase 1 extractor', () => {
  assert.deepEqual(DE.ROW_CLASSES, extractor.ROW_CLASSES);
  assert.deepEqual(DE.WARNING_VOCABULARY, extractor.WARNING_ORDER);
  assert.deepEqual(DE.SYLLABUS_ITEM_TYPES, extractor.TYPE_VOCABULARY);
});

// ---------------------------------------------------------------------------
// Daily plans (read-only in Phase 2 — no generation)
// ---------------------------------------------------------------------------

function syntheticTask(taskId, type, overrides) {
  const m = /^([^:]+):(\d+):([^:]+)$/.exec(taskId);
  const base = {
    taskId: taskId,
    subjectId: m[1],
    courseId: 'BSMA1001',
    weekNumber: +m[2],
    sourceId: m[3],
    type: type || 'lecture',
    title: 'Synthetic ' + taskId,
    planned: true,
    completed: false,
    completedAt: null
  };
  return Object.assign(base, overrides || {});
}

function syntheticPlan(date, dayNumber, weekNumber, tasks) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed === true).length;
  return {
    schemaVersion: '1.0',
    planType: 'daily-study-plan',
    date: date,
    dayNumber: dayNumber,
    weekNumber: weekNumber,
    status: 'not_started',
    schedule: [],
    tasks: tasks,
    completion: {
      totalTasks: total,
      completedTasks: completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0
    },
    meta: { createdAt: null, updatedAt: null, notes: '' }
  };
}

test('all 28 daily plan containers load and validate', () => {
  const files = fs.readdirSync(DAILY_DIR).filter((f) => /\.json$/i.test(f)).sort();
  assert.equal(files.length, 28, '28 daily containers');
  for (const file of files) {
    const doc = readJson(path.join(DAILY_DIR, file));
    const result = DE.validateDailyPlan(doc);
    assert.equal(result.valid, true, file + ': ' + result.errors.join(' | '));
    assert.equal(file.replace(/\.json$/, ''), doc.date, file + ': filename matches date');
  }
});

test('daily plan access: getDailyPlan / getPlannedTasks / getAllDailyPlans', () => {
  const engine = loadEngine();
  const plan = engine.getDailyPlan('2026-10-04');
  assert.equal(plan.dayNumber, 3);
  assert.equal(plan.weekNumber, 1);
  const plannedTasks = engine.getPlannedTasks('2026-10-04');
  assert.equal(plannedTasks.length, plan.tasks.length, 'planned tasks mirror the plan');
  assert.ok(plannedTasks.length > 0, 'the cycle is materialized (Phase 3)');
  assert.equal(plannedTasks[0].plannedDate, '2026-10-04');
  assert.equal(plannedTasks[0].completed, false,
    'plan files carry no completion state; seed state defaults to incomplete');
  assert.equal(engine.getDailyPlan('2099-01-01'), null);
  assert.equal(engine.getAllDailyPlans().length, 28);
  assert.equal(engine.getAllDailyPlans()[0].date, '2026-10-02');

  const raw = readJson(path.join(DAILY_DIR, '2026-10-02.json'));
  assert.deepEqual(engine.getDailyPlan('2026-10-02'), raw, 'engine returns the plan verbatim');
});

test('synthetic plan with tasks: planned tasks carry plannedDate and seed state', () => {
  const courses = DE.loadCoursesFromDirectory(SYLLABUS_DIR);
  const plan = syntheticPlan('2026-10-04', 3, 1, [
    syntheticTask('mathematics-i:1:L1.1', 'lecture'),
    syntheticTask('mathematics-i:1:break-block', 'break', {
      title: 'Break', completed: true, completedAt: '2026-10-04T13:00:00.000Z'
    })
  ]);
  const engine = DE.createDataEngine({ courses: courses, dailyPlans: [plan] });
  const tasks = engine.getPlannedTasks('2026-10-04');
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], {
    taskId: 'mathematics-i:1:L1.1',
    subjectId: 'mathematics-i',
    courseId: 'BSMA1001',
    weekNumber: 1,
    sourceId: 'L1.1',
    type: 'lecture',
    title: 'Synthetic mathematics-i:1:L1.1',
    plannedDate: '2026-10-04',
    completed: false,
    completedAt: null
  });
  assert.equal(tasks[1].type, 'break');
  assert.equal(tasks[1].completed, true, 'plan seed state is carried through');
  assert.equal(tasks[1].plannedDate, '2026-10-04');
});

test('malformed daily plans are rejected with useful errors', () => {
  const base = readJson(path.join(DAILY_DIR, '2026-10-04.json'));
  function broken(mutator) {
    const doc = JSON.parse(JSON.stringify(base));
    mutator(doc);
    return doc;
  }
  const cases = [
    ['not an object', () => 42, 'plain object'],
    ['bad date', () => broken((d) => { d.date = '10/04/2026'; }), 'date'],
    ['weekNumber mismatch', () => broken((d) => { d.weekNumber = 2; }), 'weekNumber'],
    ['unknown status', () => broken((d) => { d.status = 'done'; }), 'status'],
    ['completion mismatch', () => broken((d) => { d.completion.totalTasks = 9; }), 'totalTasks'],
    ['bad meta', () => broken((d) => { d.meta.notes = 42; }), 'notes'],
    ['bad schedule block', () => broken((d) => { d.schedule = [{ start: '11:00', end: '13:00' }]; }), 'schedule[0]'],
    ['malformed taskId', () => broken((d) => { d.tasks = [syntheticTask('mathematics-i:1:L1.1', 'lecture')]; d.tasks[0].taskId = 'nope'; }), 'taskId'],
    ['task part mismatch', () => broken((d) => { d.tasks = [syntheticTask('mathematics-i:1:L1.1', 'lecture')]; d.tasks[0].subjectId = 'english-i'; }), 'subjectId'],
    ['duplicate taskId', () => broken((d) => {
      d.tasks = [syntheticTask('mathematics-i:1:L1.1', 'lecture'), syntheticTask('mathematics-i:1:L1.1', 'lecture')];
    }), 'duplicate'],
    ['unknown task type', () => broken((d) => { d.tasks = [syntheticTask('mathematics-i:1:L1.1', 'mystery-type')]; }), 'type'],
    ['bad completed flag', () => broken((d) => { d.tasks = [syntheticTask('mathematics-i:1:L1.1', 'lecture', { completed: 'yes' })]; }), 'completed']
  ];
  for (const [label, make, fragment] of cases) {
    const doc = make();
    const result = DE.validateDailyPlan(doc);
    assert.equal(result.valid, false, label + ': must be invalid');
    assert.ok(result.errors.some((e) => e.indexOf(fragment) !== -1),
      label + ': errors mention "' + fragment + '" (got: ' + result.errors.join(' | ') + ')');
  }
  // Positive control: a synthetic valid plan with tasks passes.
  const ok = syntheticPlan('2026-10-04', 3, 1, [
    syntheticTask('statistics-i:1:AQ1.1', 'activity', { completed: true, completedAt: '2026-10-04T10:00:00.000Z' })
  ]);
  const result = DE.validateDailyPlan(ok);
  assert.equal(result.valid, true, result.errors.join(' | '));
});

// ---------------------------------------------------------------------------
// Task identity (Phase 2 core decision)
// ---------------------------------------------------------------------------

test('task ids are deterministic, date-independent, and week-scoped', () => {
  const engine = loadEngine();
  assert.equal(DE.buildTaskId('english-i', 1, 'Lecture 1'), 'english-i:1:Lecture 1');
  assert.equal(DE.buildTaskId('english-i', 1, 'Lecture 1'), DE.buildTaskId('english-i', 1, 'Lecture 1'));
  assert.ok(!/2026/.test(DE.buildTaskId('mathematics-i', 1, 'L1.1')), 'id contains no date');
  assert.deepEqual(DE.parseTaskId('english-i:2:Lecture 1'),
    { subjectId: 'english-i', weekNumber: 2, sourceId: 'Lecture 1' });

  // Repeated labels across weeks stay distinct (Phase 1 anomalies).
  const englishIds = [1, 2, 3].map((w) => DE.buildTaskId('english-i', w, 'Lecture 1'));
  assert.equal(new Set(englishIds).size, 3, 'english Lecture 1 in weeks 1-3 -> 3 distinct ids');
  for (const id of englishIds) assert.ok(engine.getTask(id), id + ' resolves');
  const mathIds = [1, 2, 3].map((w) => DE.buildTaskId('mathematics-i', w, 'Practice Assignment (Extra Practice)'));
  assert.equal(new Set(mathIds).size, 3, 'math extra practice in weeks 1-3 -> 3 distinct ids');
  for (const id of mathIds) assert.ok(engine.getTask(id), id + ' resolves');

  // Same item -> same id across independent engine instances.
  const other = loadEngine();
  assert.equal(other.getTask('mathematics-i:1:L1.1').taskId, engine.getTask('mathematics-i:1:L1.1').taskId);
});

test('task id construction and parsing reject malformed input', () => {
  assertCode(() => DE.buildTaskId('a:b', 1, 'x'), 'invalid_argument', 'colon in subjectId');
  assertCode(() => DE.buildTaskId('a', 0, 'x'), 'invalid_argument', 'weekNumber 0');
  assertCode(() => DE.buildTaskId('a', 1, ''), 'invalid_argument', 'empty sourceId');
  assertCode(() => DE.buildTaskId('a', 1, 'x:y'), 'invalid_argument', 'colon in sourceId');
  assertCode(() => DE.parseTaskId('nope'), 'invalid_task_id', 'missing parts');
  assertCode(() => DE.parseTaskId('a:1'), 'invalid_task_id', 'missing sourceId');
  assertCode(() => DE.parseTaskId('a:1:b:c'), 'invalid_task_id', 'extra colon');
  assertCode(() => DE.parseTaskId('a:x:b'), 'invalid_task_id', 'non-numeric week');
  assertCode(() => DE.parseTaskId(null), 'invalid_task_id', 'null');
});

test('no task id depends on array position: order-independent construction', () => {
  const engine = loadEngine();
  const items = engine.getWeek('BSMA1001', 1).items;
  const course = engine.getCourseBySubject('mathematics-i');
  const week = engine.getWeek('BSMA1001', 1);
  const forward = {};
  items.forEach((item) => { forward[item.sourceId] = DE.buildTaskForItem(course, week, item).taskId; });
  const reversed = {};
  items.slice().reverse().forEach((item) => { reversed[item.sourceId] = DE.buildTaskForItem(course, week, item).taskId; });
  assert.deepEqual(reversed, forward);
});

test('all 413 canonical tasks have unique ids (no collisions under the scheme)', () => {
  const engine = loadEngine();
  const tasks = engine.buildAllTasks();
  assert.equal(tasks.length, 413);
  const ids = tasks.map((t) => t.taskId);
  assert.equal(new Set(ids).size, ids.length, 'task ids are globally unique');
  const colonIds = tasks.filter((t) => t.sourceId.indexOf(':') !== -1);
  assert.equal(colonIds.length, 0, 'no sourceId contains the ":" separator');
});

test('task model: getTask, buildTasksForWeek, buildTasksForCourse, applyCompletion', () => {
  const engine = loadEngine();
  const task = engine.getTask('mathematics-i:1:L1.1');
  assert.deepEqual(task, {
    taskId: 'mathematics-i:1:L1.1',
    subjectId: 'mathematics-i',
    courseId: 'BSMA1001',
    weekNumber: 1,
    sourceId: 'L1.1',
    type: 'lecture',
    title: 'L1.1: Natural Numbers and their operations',
    plannedDate: null,
    completed: false,
    completedAt: null
  });
  const keys = Object.keys(task).sort();
  assert.deepEqual(keys, ['completed', 'completedAt', 'courseId', 'plannedDate', 'sourceId',
    'subjectId', 'taskId', 'title', 'type', 'weekNumber']);

  assert.deepEqual(engine.buildTasksForWeek('BSMA1001', 1).map((t) => t.sourceId).length, 30);
  const weekCounts = [1, 2, 3, 4].map((w) => engine.buildTasksForWeek('BSMA1001', w).length);
  assert.deepEqual(weekCounts, [30, 51, 38, 47]);
  assert.equal(engine.buildTasksForCourse('BSMA1001').length, 166);

  const completion = { completed: true, completedAt: '2026-10-04T12:30:00.000Z' };
  const merged = DE.applyCompletion(task, completion);
  assert.equal(merged.completed, true);
  assert.equal(merged.completedAt, '2026-10-04T12:30:00.000Z');
  assert.equal(merged.plannedDate, null);
  assert.equal(task.completed, false, 'original task is not mutated');
  assert.deepEqual(DE.applyCompletion(task, null), task);
});

test('load -> normalize -> identify is deterministic across runs', () => {
  const a = loadEngine();
  const b = loadEngine();
  assert.deepEqual(a.loadAllCourses(), b.loadAllCourses());
  assert.deepEqual(a.buildAllTasks(), b.buildAllTasks());
  assert.deepEqual(a.getAllDailyPlans(), b.getAllDailyPlans());
});




