'use strict';

/*
 * tests/data/progress-validation.test.js — Study-Planner Phase 2
 *
 * Validates the derived progress store (data/progress/progress.json):
 *   - documented derived-cache shape (period / subjects / weeks / overall)
 *   - every node is recomputable: percent === round(completed / total * 100), 0 for empty
 *   - subject and course identities align with the canonical syllabus
 *   - the engine rebuilds an identical shape and valid values from completion state
 *   - percentages are derived (changing completion state changes numbers)
 *
 * Note: the shipped file's VALUES are a cache and may be refreshed by later
 * phases; these tests validate structure and recomputability, not frozen values.
 *
 * Run with:  node --test tests/data/progress-validation.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'data-engine.js'));
const PE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'progress-engine.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const PROGRESS_FILE = path.join(ROOT, 'data', 'progress', 'progress.json');
const SYLLABUS_DIR = path.join(ROOT, 'data', 'syllabus');

const doc = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
const courses = DE.loadCoursesFromDirectory(SYLLABUS_DIR);
const subjects = courses.map((c) => c.subjectId);
const SUBJECT_NODES = ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i'];
const WEEK_KEYS = ['week-1', 'week-2', 'week-3', 'week-4'];

// Returns a problem description, or null when the node is valid + recomputable.
function nodeProblem(node, label) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return label + ': not an object';
  for (const key of ['total', 'completed', 'percent']) {
    if (!Number.isInteger(node[key]) || node[key] < 0) return label + '.' + key + ': not a non-negative integer';
  }
  if (node.completed > node.total) return label + ': completed exceeds total';
  if (node.percent > 100) return label + ': percent exceeds 100';
  const expected = node.total > 0 ? Math.round((node.completed / node.total) * 100) : 0;
  if (node.percent !== expected) return label + ': percent is not recomputable from total/completed';
  return null;
}

function collectProblems() {
  const problems = [];
  if (doc.schemaVersion !== '1.0') problems.push('schemaVersion: expected "1.0"');
  if (doc.progressType !== 'month-progress-store') problems.push('progressType: expected "month-progress-store"');

  const period = doc.period || {};
  if (period.startDate !== '2026-10-02') problems.push('period.startDate');
  if (period.endDate !== '2026-10-29') problems.push('period.endDate');
  if (period.totalDays !== 28) problems.push('period.totalDays');
  if (period.totalWeeks !== 4) problems.push('period.totalWeeks');

  if (!doc.subjects || typeof doc.subjects !== 'object') {
    problems.push('subjects: missing');
  } else {
    const keys = Object.keys(doc.subjects).sort();
    if (keys.join(',') !== SUBJECT_NODES.slice().sort().join(',')) {
      problems.push('subjects: keys must be exactly ' + SUBJECT_NODES.join(', '));
    }
    for (const subjectId of SUBJECT_NODES) {
      const subject = doc.subjects[subjectId];
      if (!subject) { problems.push('subjects.' + subjectId + ': missing'); continue; }
      if (subject.subjectId !== subjectId) problems.push('subjects.' + subjectId + '.subjectId mismatch');
      if (typeof subject.courseId !== 'string' || !subject.courseId) {
        problems.push('subjects.' + subjectId + '.courseId');
      }
      const overallProblem = nodeProblem(subject.overall, 'subjects.' + subjectId + '.overall');
      if (overallProblem) problems.push(overallProblem);
      for (const weekKey of WEEK_KEYS) {
        const weekProblem = nodeProblem(subject.weeks && subject.weeks[weekKey],
          'subjects.' + subjectId + '.' + weekKey);
        if (weekProblem) problems.push(weekProblem);
      }
    }
  }

  if (!doc.weeks || typeof doc.weeks !== 'object') {
    problems.push('weeks: missing');
  } else {
    const keys = Object.keys(doc.weeks).sort();
    if (keys.join(',') !== WEEK_KEYS.slice().sort().join(',')) {
      problems.push('weeks: keys must be exactly ' + WEEK_KEYS.join(', '));
    }
    for (const weekKey of WEEK_KEYS) {
      const week = doc.weeks[weekKey];
      if (!week) { problems.push('weeks.' + weekKey + ': missing'); continue; }
      const overallProblem = nodeProblem(week.overall, 'weeks.' + weekKey + '.overall');
      if (overallProblem) problems.push(overallProblem);
      if (!week.subjects || typeof week.subjects !== 'object') {
        problems.push('weeks.' + weekKey + '.subjects: missing');
      } else {
        for (const subjectId of SUBJECT_NODES) {
          const subjectProblem = nodeProblem(week.subjects[subjectId], 'weeks.' + weekKey + '.' + subjectId);
          if (subjectProblem) problems.push(subjectProblem);
        }
      }
    }
  }

  const overallProblem = nodeProblem(doc.overall, 'overall');
  if (overallProblem) problems.push(overallProblem);

  if (!(doc.lastUpdated === null || (typeof doc.lastUpdated === 'string' && !isNaN(Date.parse(doc.lastUpdated))))) {
    problems.push('lastUpdated: must be null or an ISO timestamp');
  }
  return problems;
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('progress.json has the documented derived-store shape with recomputable nodes', () => {
  const problems = collectProblems();
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('subject and course identities align with the canonical syllabus', () => {
  for (const course of courses) {
    const subject = doc.subjects[course.subjectId];
    assert.ok(subject, course.subjectId + ' present in progress.json');
    assert.equal(subject.courseId, course.courseId, course.subjectId + ': courseId matches syllabus');
  }
  assert.deepEqual(Object.keys(doc.subjects).sort(), subjects.slice().sort());
});

test('the engine rebuilds an identical shape from completion state', () => {
  const rebuilt = PE.buildProgressStore(courses, {}, {
    startDate: doc.period.startDate,
    endDate: doc.period.endDate
  });
  assert.deepEqual(shapeOf(rebuilt), shapeOf(doc),
    'engine-derived store and the shipped cache share one schema shape');
  assert.deepEqual(collectProblemsFor(rebuilt), [], 'rebuilt store satisfies the same invariants');
});

function collectProblemsFor(store) {
  const saved = doc.subjects; // reuse the validator logic against another document
  doc.subjects = store.subjects;
  const period = doc.period;
  doc.period = store.period;
  const overall = doc.overall;
  doc.overall = store.overall;
  const weeks = doc.weeks;
  doc.weeks = store.weeks;
  const version = doc.schemaVersion;
  doc.schemaVersion = store.schemaVersion;
  const type = doc.progressType;
  doc.progressType = store.progressType;
  const problems = collectProblems();
  doc.subjects = saved;
  doc.period = period;
  doc.overall = overall;
  doc.weeks = weeks;
  doc.schemaVersion = version;
  doc.progressType = type;
  return problems;
}

test('percentages derive from completion state (rebuildability on the real files)', () => {
  const period = { startDate: '2026-10-02', endDate: '2026-10-29' };
  const zero = PE.buildProgressStore(courses, {}, period);
  const oneDone = PE.buildProgressStore(courses, {
    'mathematics-i:1:L1.1': { completed: true, completedAt: '2026-10-04T12:30:00.000Z' }
  }, period);

  assert.deepEqual(zero.overall, { total: 413, completed: 0, percent: 0 });
  assert.deepEqual(oneDone.overall, { total: 413, completed: 1, percent: 0 });
  assert.equal(zero.subjects['mathematics-i'].overall.completed, 0);
  assert.equal(oneDone.subjects['mathematics-i'].overall.completed, 1);
  assert.deepEqual(oneDone.weeks['week-1'].subjects['mathematics-i'],
    { total: 30, completed: 1, percent: 3 });

  // Reconciliation (documented in docs/phase2-core-architecture.md): the shipped
  // cache is either still the unpopulated placeholder (totals 0, written before
  // the syllabus existed) or a refreshed cache whose totals equal the engine's
  // canonical syllabus scope. Nothing else is valid.
  assert.ok(doc.overall.total === 0 || doc.overall.total === zero.overall.total,
    'cache totals are either the placeholder (0) or the engine scope total (got ' + doc.overall.total + ')');
  assert.ok(doc.subjects['mathematics-i'].overall.total === 0 ||
    doc.subjects['mathematics-i'].overall.total === zero.subjects['mathematics-i'].overall.total,
    'subject cache totals are either the placeholder (0) or the engine scope total');
});


