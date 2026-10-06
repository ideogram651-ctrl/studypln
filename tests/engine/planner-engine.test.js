'use strict';

/*
 * tests/engine/planner-engine.test.js — Study-Planner Phase 3
 *
 * Proves the planner specification end to end:
 *   - workload formulas (video/note/question/learning unit)
 *   - lecture+activity pairing and unit integrity (units are never split)
 *   - fixed timetable + block capacities; non-academic blocks never receive tasks
 *   - weekly cycle: days 1-5 new content, day 6 practice, day 7 graded
 *   - golden Day-1 (2026-10-02) matches the reference structure exactly
 *   - 28 daily documents with correct date/day/week mapping
 *   - source order preserved; every syllabus item planned exactly once
 *   - no fabricated source data (nulls stay null; fallbacks flagged)
 *   - deterministic output matching the materialized files byte-for-byte
 *
 * Run with:  node --test tests/engine/planner-engine.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'data-engine.js'));
const PL = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'planner-engine.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const SYLLABUS_DIR = path.join(ROOT, 'data', 'syllabus');
const DAILY_DIR = path.join(ROOT, 'data', 'schedule', 'daily');
const CYCLE_START = '2026-10-02';

const courses = DE.loadCoursesFromDirectory(SYLLABUS_DIR);
const config = PL.createPlannerConfig();
const engine = DE.createDataEngine({ courses });

let cachedDocs = null;
function plannedDocs() {
  if (!cachedDocs) cachedDocs = PL.buildDailyDocuments({ courses: courses, startDate: CYCLE_START });
  return cachedDocs;
}
function docByDate(date) {
  return plannedDocs().find((doc) => doc.date === date);
}
function courseBySubject(subjectId) {
  return courses.find((course) => course.subjectId === subjectId);
}
function dayIndex(doc) {
  return ((doc.dayNumber - 1) % 7) + 1;
}
function allPlanTasks() {
  return plannedDocs().reduce(function (list, doc) { return list.concat(doc.tasks); }, []);
}
function subjectTasksByDate(date, subjectId) {
  return docByDate(date).tasks.filter((task) => task.subjectId === subjectId);
}
function fixtureItem(type, sourceId, durationSeconds, questionCount) {
  return {
    type: type,
    sourceId: sourceId,
    durationSeconds: durationSeconds === undefined ? null : durationSeconds,
    questionCount: questionCount === undefined ? null : questionCount,
    source: { rowClass: type === 'activity' ? 'assign' : 'video', details: 'x', rowNumber: 1 }
  };
}
const GOLDEN_DAY_ONE = {
  'mathematics-i': ['L1.1', 'AQ1.1', 'L1.2', 'AQ1.2', 'L1.3', 'AQ1.3', 'L1.4', 'AQ1.4'],
  'statistics-i': ['Course Overview', 'L1.1', 'AQ1.1', 'L1.2', 'AQ1.2'],
  'computational-thinking': ['L1.1', 'AQ1.1', 'L1.2', 'AQ1.2'],
  'english-i': ['Lecture 1', 'AQ1.1']
};

// ---------------------------------------------------------------------------
// Formulas and pairing
// ---------------------------------------------------------------------------

test('formula: note estimate = video x 0.67 and question load = questions x 1.5', () => {
  const video = PL.computeItemPlanning(fixtureItem('lecture', 'V', 900), config); // 15 minutes
  assert.equal(video.videoMinutes, 15);
  assert.ok(Math.abs(video.noteMinutes - 10.05) < 1e-9, '15 x 0.67 = 10.05');
  assert.ok(Math.abs(video.estimatedMinutes - 25.05) < 1e-9);

  const questions = PL.computeItemPlanning(fixtureItem('activity', 'Q', null, 5), config);
  assert.equal(questions.questionMinutes, 7.5);
  assert.equal(questions.estimatedMinutes, 7.5);
});

test('formula: learning unit = video x 1.67 + questions x 1.5 (20 min + 5 questions = 40.9)', () => {
  const units = PL.buildLearningUnits(
    [fixtureItem('lecture', 'L', 1200), fixtureItem('activity', 'AQ', null, 5)],
    'mathematics-i', 1, config);
  assert.equal(units.length, 1);
  assert.ok(Math.abs(units[0].videoMinutes - 20) < 1e-9);
  assert.ok(Math.abs(units[0].noteMinutes - 13.4) < 1e-9);
  assert.ok(Math.abs(units[0].questionMinutes - 7.5) < 1e-9);
  assert.ok(Math.abs(units[0].estimatedMinutes - 40.9) < 1e-9);
});

test('pairing: L1.1 + AQ1.1 form one learning unit in the real week-1 data', () => {
  const mathCourse = courseBySubject('mathematics-i');
  const units = PL.buildLearningUnits(mathCourse.weeks[0].items, 'mathematics-i', 1, config);
  assert.equal(units.length, 16,
    'math week 1: 11 paired units + 4 solo lectures (L1.12-L1.15) + 1 solution video');
  assert.deepEqual(units[0].items.map((item) => item.sourceId), ['L1.1', 'AQ1.1']);
  assert.equal(units[0].unitId, 'mathematics-i:1:L1.1');
  assert.deepEqual(units[1].items.map((item) => item.sourceId), ['L1.2', 'AQ1.2']);
  assert.deepEqual(units[11].items.map((item) => item.sourceId), ['L1.12'], 'lectures without activities are solo units');
  assert.equal(units[15].items[0].type, 'solution', 'solution videos stay in the learning sequence');
  for (const unit of units) {
    const first = unit.items[0];
    if (unit.items.length > 1) {
      assert.ok(PL.isVideoRow(first), 'paired units start with a video item');
      for (const extra of unit.items.slice(1)) assert.equal(extra.type, 'activity');
    }
  }
});

test('pairing: consecutive activities attach to the same lecture; standalone activity allowed', () => {
  const units = PL.buildLearningUnits([
    fixtureItem('lecture', 'L1', 600),
    fixtureItem('activity', 'AQ1', null, 5),
    fixtureItem('activity', 'AQ2', null, 3),
    fixtureItem('lecture', 'L2', 600)
  ], 'mathematics-i', 1, config);
  assert.equal(units.length, 2);
  assert.deepEqual(units[0].items.map((item) => item.sourceId), ['L1', 'AQ1', 'AQ2']);
  assert.deepEqual(units[1].items.map((item) => item.sourceId), ['L2']);

  const standalone = PL.buildLearningUnits([fixtureItem('activity', 'AQX', null, 4)], 'mathematics-i', 1, config);
  assert.equal(standalone.length, 1);
  assert.deepEqual(standalone[0].items.map((item) => item.sourceId), ['AQX']);
});

test('capacity constants and the fixed timetable match the specification', () => {
  assert.equal(PL.capacityForSubject(config, 'mathematics-i'), 120);
  assert.equal(PL.capacityForSubject(config, 'statistics-i'), 90);
  assert.equal(PL.capacityForSubject(config, 'computational-thinking'), 90);
  assert.equal(PL.capacityForSubject(config, 'english-i'), 45);
  assert.throws(() => PL.capacityForSubject(config, 'nope'), (err) => err.code === 'invalid_config');

  assert.equal(config.timetable.length, 12);
  assert.deepEqual(
    config.timetable.map((block) => block.start + '-' + block.end),
    ['11:00-1:00', '1:00-1:30', '1:30-3:00', '3:00-3:30', '3:30-5:00', '5:00-6:00',
      '6:00-8:00', '8:00-8:30', '8:30-9:15', '9:15-9:30', '9:30-10:30', '10:30-11:00']);
  assert.deepEqual(
    config.timetable.map((block) => block.label),
    ['Mathematics', 'Lunch / Rest', 'Statistics', 'Walk / Refresh', 'Computational Thinking',
      'Free / Refresh', 'FIXED TIME', 'Relax', 'English', 'Refresh',
      'Math + Statistics Revision', 'Daily Review']);
  const nonAcademic = config.timetable.filter((block) => block.category !== 'study');
  assert.ok(nonAcademic.every((block) => block.capacityMinutes === 0),
    'breaks, free, fixed, revision and review have zero academic capacity');
  assert.deepEqual(
    config.timetable.filter((block) => block.category === 'study').map((block) => block.capacityMinutes),
    [120, 90, 90, 45]);
});

test('fixed timetables: breaks / free / fixed / revision / review never receive academic tasks', () => {
  for (const doc of plannedDocs()) {
    assert.equal(doc.schedule.length, 12, doc.date + ': 12 blocks every day');
    for (const block of doc.schedule) {
      if (block.category !== 'study') {
        assert.deepEqual(block.taskIds, [], doc.date + '/' + block.blockId + ' must be empty');
        assert.equal(block.subjectId, null, doc.date + '/' + block.blockId + ' has no subject');
      }
    }
    const referenced = doc.schedule.reduce(function (count, block) { return count + block.taskIds.length; }, 0);
    assert.equal(referenced, doc.tasks.length, doc.date + ': every task referenced exactly once');
  }
});

// ---------------------------------------------------------------------------
// Weekly cycle, golden Day-1, coverage
// ---------------------------------------------------------------------------

test('weekly cycle: days 1-5 new content, day 6 practice only, day 7 graded only', () => {
  for (const doc of plannedDocs()) {
    const index = dayIndex(doc);
    if (index <= 5) {
      for (const task of doc.tasks) {
        assert.ok(task.type !== 'practice' && task.type !== 'graded',
          doc.date + ': new-content days must not carry practice/graded work');
      }
    } else if (index === 6) {
      assert.ok(doc.tasks.length > 0, doc.date + ': practice day is populated');
      for (const task of doc.tasks) assert.equal(task.type, 'practice', doc.date + ': day 6 is practice-only');
    } else {
      assert.ok(doc.tasks.length > 0, doc.date + ': graded day is populated');
      for (const task of doc.tasks) assert.equal(task.type, 'graded', doc.date + ': day 7 is graded-only');
    }
  }
});

test('day 7 carries exactly one graded assignment per subject per week', () => {
  for (let week = 1; week <= 4; week++) {
    const gradedDocs = plannedDocs().filter((doc) => doc.weekNumber === week && dayIndex(doc) === 7);
    assert.equal(gradedDocs.length, 1);
    const tasks = gradedDocs[0].tasks;
    assert.equal(tasks.length, 4, 'week ' + week + ': one graded item per subject');
    for (const subjectId of Object.keys(GOLDEN_DAY_ONE)) {
      const subjectGraded = tasks.filter((task) => task.subjectId === subjectId);
      assert.equal(subjectGraded.length, 1, 'week ' + week + ' ' + subjectId);
      assert.equal(subjectGraded[0].type, 'graded');
    }
  }
});

test('golden Day-1: 2026-10-02 matches the reference structure exactly', () => {
  const d1 = docByDate('2026-10-02');
  assert.equal(d1.dayNumber, 1);
  assert.equal(d1.weekNumber, 1);
  assert.deepEqual(
    d1.schedule.map((block) => block.blockId),
    ['mathematics', 'lunch-rest', 'statistics', 'walk-refresh', 'computational-thinking',
      'free-refresh', 'fixed-time', 'relax', 'english', 'refresh', 'revision', 'daily-review']);

  for (const subjectId of Object.keys(GOLDEN_DAY_ONE)) {
    const block = d1.schedule.find((candidate) => candidate.subjectId === subjectId);
    assert.ok(block, subjectId + ': study block present');
    assert.deepEqual(
      block.taskIds.map((taskId) => DE.parseTaskId(taskId).sourceId),
      GOLDEN_DAY_ONE[subjectId],
      subjectId + ': day-1 learning sequence matches the reference');
  }

  // Reference values from the Day-1 HTML / specification section 5.
  const find = (sourceId) => d1.tasks.find((task) => task.sourceId === sourceId);
  assert.equal(find('L1.1').durationSeconds, 1249); // 20:49
  assert.equal(find('AQ1.1').questionCount, 5);
  assert.equal(find('L1.3').durationSeconds, 507); // 8:27
  assert.equal(find('AQ1.4').questionCount, 7);
  assert.equal(find('L1.2').durationSeconds, 741); // mathematics L1.2 = 12:21
  assert.equal(
    d1.tasks.find((task) => task.subjectId === 'statistics-i' && task.sourceId === 'L1.2').durationSeconds,
    2506); // statistics L1.2 = 41:46
  assert.equal(d1.tasks.filter((task) => task.sourceId === 'AQ1.1' && task.subjectId === 'statistics-i')[0].questionCount, 12);
  assert.equal(d1.tasks.find((task) => task.subjectId === 'computational-thinking' && task.sourceId === 'L1.2').durationSeconds, 1519); // 25:19
  assert.equal(d1.tasks.find((task) => task.subjectId === 'english-i' && task.sourceId === 'Lecture 1').durationSeconds, 1306); // 21:46
});

test('date mapping: 28 documents from 2026-10-02 to 2026-10-29 with correct day/week numbers', () => {
  const docs = plannedDocs();
  assert.equal(docs.length, 28);
  assert.equal(docs[0].date, '2026-10-02');
  assert.equal(docs[27].date, '2026-10-29');
  docs.forEach((doc, index) => {
    assert.equal(doc.dayNumber, index + 1, doc.date + ': dayNumber');
    assert.equal(doc.weekNumber, Math.floor(index / 7) + 1, doc.date + ': weekNumber');
    assert.equal(doc.date, PL.addDaysToDateString(CYCLE_START, index), doc.date + ': date sequence');
  });
  assert.equal(docByDate('2026-10-08').dayNumber, 7);
  assert.equal(docByDate('2026-10-09').dayNumber, 8);
  assert.equal(docByDate('2026-10-09').weekNumber, 2);
  assert.equal(PL.addDaysToDateString('2026-10-02', 27), '2026-10-29');
});

test('every syllabus item is planned exactly once (413 tasks, no duplicates, no omissions)', () => {
  const planTasks = allPlanTasks();
  assert.equal(planTasks.length, 413);
  const planIds = new Set(planTasks.map((task) => task.taskId));
  assert.equal(planIds.size, 413, 'no duplicate task ids');
  const syllabusTasks = engine.buildAllTasks();
  assert.equal(syllabusTasks.length, 413);
  for (const task of syllabusTasks) {
    assert.ok(planIds.has(task.taskId), 'planned: ' + task.taskId);
  }
});

test('source order is preserved across days 1-5 for every subject and week', () => {
  for (const course of courses) {
    for (const week of course.weeks) {
      const expected = week.items
        .filter((item) => PL.classifyItem(item) === 'new-content')
        .map((item) => item.sourceId);
      const actual = [];
      for (const doc of plannedDocs()) {
        if (doc.weekNumber !== week.weekNumber || dayIndex(doc) > 5) continue;
        for (const task of doc.tasks) {
          if (task.subjectId === course.subjectId) actual.push(task.sourceId);
        }
      }
      assert.deepEqual(actual, expected,
        course.subjectId + ' week ' + week.weekNumber + ': day 1-5 sequence equals syllabus order');
    }
  }
});

test('learning units are never split across days', () => {
  const dayOf = {};
  for (const doc of plannedDocs()) {
    for (const task of doc.tasks) dayOf[task.taskId] = doc.dayNumber;
  }
  for (const task of allPlanTasks()) {
    assert.equal(dayOf[task.taskId], dayOf[task.planning.unitId],
      'unit ' + task.planning.unitId + ' must stay on one day (task ' + task.taskId + ')');
  }
});

test('day 6 uses the week practice items and day 7 the graded item (per subject and week)', () => {
  for (const course of courses) {
    for (const week of course.weeks) {
      const practiceIds = week.items.filter((item) => item.type === 'practice').map((item) => item.sourceId);
      const gradedIds = week.items.filter((item) => item.type === 'graded').map((item) => item.sourceId);
      const weekDocs = plannedDocs().filter((doc) => doc.weekNumber === week.weekNumber);
      const day6 = weekDocs.find((doc) => dayIndex(doc) === 6);
      const day7 = weekDocs.find((doc) => dayIndex(doc) === 7);
      assert.deepEqual(
        day6.tasks.filter((task) => task.subjectId === course.subjectId).map((task) => task.sourceId),
        practiceIds,
        course.subjectId + ' week ' + week.weekNumber + ': day-6 practice bundle');
      assert.deepEqual(
        day7.tasks.filter((task) => task.subjectId === course.subjectId).map((task) => task.sourceId),
        gradedIds,
        course.subjectId + ' week ' + week.weekNumber + ': day-7 graded bundle');
    }
  }
});

// ---------------------------------------------------------------------------
// Balance, determinism, materialization, integrity
// ---------------------------------------------------------------------------

test('workload balance: days 1-5 follow the fair share and the final day is not a dump', () => {
  for (const course of courses) {
    for (const week of course.weeks) {
      const weekDocs = plannedDocs().filter((doc) => doc.weekNumber === week.weekNumber);
      const loads = [1, 2, 3, 4, 5].map((index) => {
        const doc = weekDocs.find((candidate) => dayIndex(candidate) === index);
        return doc.tasks
          .filter((task) => task.subjectId === course.subjectId)
          .reduce((sum, task) => sum + task.planning.estimatedMinutes, 0);
      });
      assert.ok(loads.every((load) => load > 0),
        course.subjectId + ' week ' + week.weekNumber + ': every new-content day carries work');

      // The week's total planned workload equals the sum of its unit workloads.
      // Stored per-task minutes are display-rounded to 1 decimal, so allow up
      // to half a tenth of drift per planned task.
      const units = PL.buildLearningUnits(week.items, course.subjectId, week.weekNumber, config);
      const total = PL.sumWorkload(units);
      const planned = loads.reduce((sum, load) => sum + load, 0);
      const taskCount = weekDocs.reduce((count, doc) => count +
        (dayIndex(doc) <= 5 ? doc.tasks.filter((task) => task.subjectId === course.subjectId).length : 0), 0);
      assert.ok(Math.abs(planned - total) < 0.05 * taskCount + 0.01,
        course.subjectId + ' week ' + week.weekNumber + ': planned ' + planned + ' vs unit total ' + total);

      // No dumping: the final day stays within one largest-unit of the busiest earlier day.
      const largestUnit = units.reduce((max, unit) => Math.max(max, unit.estimatedMinutes), 0);
      const busiestEarlier = Math.max.apply(null, loads.slice(0, 4));
      assert.ok(loads[4] <= busiestEarlier + largestUnit + 0.05,
        course.subjectId + ' week ' + week.weekNumber + ': final day ' + loads[4] +
        ' must not dump beyond one unit past ' + busiestEarlier);
    }
  }
});

test('determinism: identical inputs produce deep-equal and byte-identical plans', () => {
  const runA = PL.buildDailyDocuments({ courses: courses, startDate: CYCLE_START });
  const runB = PL.buildDailyDocuments({ courses: courses, startDate: CYCLE_START });
  assert.deepEqual(runA, runB);
  for (let i = 0; i < runA.length; i++) {
    assert.equal(PL.serializePlan(runA[i]), PL.serializePlan(runB[i]), runA[i].date + ': byte-identical');
  }
});

test('materialized files match deterministic regeneration byte-for-byte', () => {
  const files = fs.readdirSync(DAILY_DIR).filter((file) => /\.json$/i.test(file)).sort();
  assert.equal(files.length, 28);
  for (const doc of plannedDocs()) {
    const onDisk = fs.readFileSync(path.join(DAILY_DIR, doc.date + '.json'), 'utf8');
    assert.equal(onDisk, PL.serializePlan(doc), doc.date + ': file matches regeneration');
  }
});

test('generated plans validate against the daily schema and carry no completion state', () => {
  for (const doc of plannedDocs()) {
    const result = DE.validateDailyPlan(doc);
    assert.equal(result.valid, true, doc.date + ': ' + result.errors.join(' | '));
    assert.equal(doc.status, 'not_started');
    assert.deepEqual(doc.completion, { totalTasks: doc.tasks.length, completedTasks: 0, percent: 0 });
    assert.equal(doc.meta.generator, 'planner-engine');
    for (const task of doc.tasks) {
      assert.equal(Object.prototype.hasOwnProperty.call(task, 'completed'), false,
        'plan tasks must not carry completion state');
      assert.equal(Object.prototype.hasOwnProperty.call(task, 'completedAt'), false);
      assert.equal(task.planned, true);
    }
  }
});

test('no fabrication: source values are preserved and fallback estimates are flagged', () => {
  for (const task of allPlanTasks()) {
    const item = engine.getItem(task.courseId, task.weekNumber, task.sourceId);
    assert.equal(task.durationSeconds, item.durationSeconds, task.taskId + ': source duration preserved');
    assert.equal(task.questionCount, item.questionCount, task.taskId + ': source question count preserved');
    if (PL.isVideoRow(item)) {
      assert.equal(task.planning.sourceDurationMissing, item.durationSeconds === null, task.taskId);
    }
    if (PL.isQuestionRow(item)) {
      assert.equal(task.planning.sourceQuestionsMissing, item.questionCount === null, task.taskId);
    }
  }

  const d1 = docByDate('2026-10-02');
  const overview = d1.tasks.find((task) => task.sourceId === 'Course Overview');
  assert.equal(overview.durationSeconds, null, 'Course Overview has no source duration');
  assert.equal(overview.planning.sourceDurationMissing, true);
  assert.equal(overview.planning.videoMinutes, config.fallbackVideoMinutes, 'documented fallback used');

  const l11 = d1.tasks.find((task) => task.taskId === 'mathematics-i:1:L1.1');
  assert.equal(l11.durationSeconds, 1249);
  assert.equal(l11.planning.videoMinutes, 20.8, '1249s -> 20.8 min (display rounded)');
  assert.equal(l11.planning.noteMinutes, 13.9, '20.82 x 0.67 = 13.9');
  assert.equal(l11.planning.estimatedMinutes, 34.8);
});

test('config is centralized and reusable: overrides reshape results deterministically', () => {
  assert.equal(config.noteMultiplier, 0.67);
  assert.equal(config.questionMinutes, 1.5);
  assert.equal(config.newContentDays, 5);
  assert.equal(config.practiceDay, 6);
  assert.equal(config.gradedDay, 7);

  const docs = PL.buildDailyDocuments({
    courses: courses,
    startDate: CYCLE_START,
    config: { noteMultiplier: 1 }
  });
  const l11 = docs[0].tasks.find((task) => task.taskId === 'mathematics-i:1:L1.1');
  assert.equal(l11.planning.noteMinutes, 20.8, 'note multiplier override applies (20.82 x 1)');
  assert.deepEqual(
    docs[0].schedule.find((block) => block.subjectId === 'mathematics-i').taskIds,
    plannedDocs()[0].schedule.find((block) => block.subjectId === 'mathematics-i').taskIds,
    'golden anchor independent of the note multiplier');

  assert.throws(() => PL.createPlannerConfig({ unknownKey: 1 }), (err) => err.code === 'invalid_config');
  assert.throws(() => PL.buildDailyDocuments({ courses: courses, startDate: '02-10-2026' }),
    (err) => err.code === 'invalid_argument');
});

test('golden anchor references real week-1 syllabus items (regression guard)', () => {
  for (const subjectId of Object.keys(config.goldenFirstDay)) {
    const course = courseBySubject(subjectId);
    assert.ok(course, subjectId + ': course exists');
    for (const sourceId of config.goldenFirstDay[subjectId]) {
      const item = engine.getItem(course.courseId, 1, sourceId);
      assert.ok(item, subjectId + ' week 1 contains "' + sourceId + '"');
    }
  }
});






