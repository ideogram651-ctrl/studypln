'use strict';

/*
 * tests/renderer/tracker.test.js — Study-Planner Phase 4
 *
 * Validates the Daily Tracker rendering + completion flow:
 *   - TaskCard  : one planned task -> view model / row HTML (stable taskId identity)
 *   - TaskGroup  : schedule block -> academic vs non-academic, plan order preserved
 *   - DailyTracker: view model + HTML, unavailable / missing / invalid states
 *   - Controller: UI event -> storage write -> progress recalculation
 *
 * The plan used is the real materialised Day-1 document (2026-10-02); progress
 * numbers are always cross-checked against progress-engine, never re-derived
 * inside the component.
 *
 * Run with:  node --test tests/renderer/tracker.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src', 'js', 'calendar.js'));
const PE = require(path.join(ROOT, 'src', 'js', 'progress-engine.js'));
const S = require(path.join(ROOT, 'src', 'js', 'storage.js'));
const TaskCard = require(path.join(ROOT, 'src', 'components', 'tracker', 'task-card.js'));
const TaskGroup = require(path.join(ROOT, 'src', 'components', 'tracker', 'task-group.js'));
const DailyTracker = require(path.join(ROOT, 'src', 'components', 'tracker', 'daily-tracker.js'));

const DAY1 = '2026-10-02';
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schedule', 'daily', DAY1 + '.json'), 'utf8'));

const MATH_L1_1 = 'mathematics-i:1:L1.1';
const MATH_AQ1_1 = 'mathematics-i:1:AQ1.1';
const AT = '2026-10-04T12:30:00.000Z';

function taskOf(taskId) {
  return PLAN.tasks.find((t) => t.taskId === taskId);
}

function newStorage() {
  return S.createStorage({ backend: S.createMemoryBackend() });
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

test('typeLabel maps known types and falls back safely', () => {
  assert.equal(TaskCard.typeLabel('lecture'), 'Lecture');
  assert.equal(TaskCard.typeLabel('activity'), 'Activity');
  assert.equal(TaskCard.typeLabel('practice'), 'Practice');
  assert.equal(TaskCard.typeLabel('mystery'), 'mystery');
  assert.equal(TaskCard.typeLabel(undefined), 'Task');
});

test('formatDurationSeconds formats, and returns null for missing / invalid values', () => {
  assert.equal(TaskCard.formatDurationSeconds(1249), '20:49');
  assert.equal(TaskCard.formatDurationSeconds(3661), '1:01:01');
  assert.equal(TaskCard.formatDurationSeconds(60), '1:00');
  assert.equal(TaskCard.formatDurationSeconds(0), null);
  assert.equal(TaskCard.formatDurationSeconds(null), null);
  assert.equal(TaskCard.formatDurationSeconds(-5), null);
  assert.equal(TaskCard.formatDurationSeconds('abc'), null);
});

test('questionLabel pluralises correctly', () => {
  assert.equal(TaskCard.questionLabel(1), '1 Question');
  assert.equal(TaskCard.questionLabel(3), '3 Questions');
});

test('buildTaskMeta uses real source values first and estimates only as a fallback', () => {
  assert.equal(
    TaskCard.buildTaskMeta({ type: 'lecture', durationSeconds: 1249, questionCount: null, planning: {} }),
    'Lecture • 🎥 20:49'
  );
  assert.equal(
    TaskCard.buildTaskMeta({ type: 'activity', durationSeconds: null, questionCount: 3, planning: {} }),
    'Activity • 📝 3 Questions'
  );
  assert.equal(
    TaskCard.buildTaskMeta({ type: 'lecture', durationSeconds: null, questionCount: null, planning: { videoMinutes: 20.8 } }),
    'Lecture • 🎥 ~21 min (est.)'
  );
  assert.equal(TaskCard.buildTaskMeta({ type: 'break', durationSeconds: null, questionCount: null, planning: {} }), 'Break');
});

test('real Day-1 tasks produce a meta line beginning with their type label', () => {
  const lecture = taskOf(MATH_L1_1);
  assert.equal(lecture.type, 'lecture');
  assert.match(TaskCard.buildTaskMeta(lecture), /^Lecture • /);
  const activity = taskOf(MATH_AQ1_1);
  assert.match(TaskCard.buildTaskMeta(activity), /^Activity • /);
});

test('buildTaskCardViewModel reflects persisted completion', () => {
  const task = taskOf(MATH_L1_1);
  const unchecked = TaskCard.buildTaskCardViewModel(task, null);
  assert.equal(unchecked.taskId, MATH_L1_1);
  assert.equal(unchecked.checked, false);
  assert.equal(unchecked.completedAt, null);

  const checked = TaskCard.buildTaskCardViewModel(task, { completed: true, completedAt: AT });
  assert.equal(checked.checked, true);
  assert.equal(checked.completedAt, AT);
});

test('renderTaskCardHTML keys the row + checkbox by taskId, never an index', () => {
  const pending = TaskCard.renderTaskCardHTML(TaskCard.buildTaskCardViewModel(taskOf(MATH_L1_1), null));
  assert.match(pending, new RegExp('class="task-row" data-task-id="' + MATH_L1_1.replace(/[:.]/g, '\\$&') + '"'));
  assert.match(pending, /data-action="toggle-task"/);
  assert.doesNotMatch(pending, / checked>/);
  assert.doesNotMatch(pending, /is-completed/);

  const done = TaskCard.renderTaskCardHTML(TaskCard.buildTaskCardViewModel(taskOf(MATH_L1_1), { completed: true, completedAt: AT }));
  assert.match(done, /is-completed/);
  assert.match(done, / checked>/);
});

// ---------------------------------------------------------------------------
// TaskGroup (schedule block)
// ---------------------------------------------------------------------------

const TASKS_BY_ID = PLAN.tasks.reduce((map, t) => { map[t.taskId] = t; return map; }, {});
const MATH_BLOCK = PLAN.schedule.find((b) => b.blockId === 'mathematics');
const BREAK_BLOCK = PLAN.schedule.find((b) => b.blockId === 'lunch-rest');

test('academic block resolves its tasks by taskId and preserves plan order', () => {
  const vm = TaskGroup.buildBlockViewModel(MATH_BLOCK, TASKS_BY_ID, {});
  assert.equal(vm.isAcademic, true);
  assert.equal(vm.blockId, 'mathematics');
  assert.equal(vm.timeLabel, MATH_BLOCK.start + ' – ' + MATH_BLOCK.end);
  assert.equal(vm.tasks.length, MATH_BLOCK.taskIds.length);
  assert.deepEqual(vm.tasks.map((c) => c.taskId), MATH_BLOCK.taskIds);
  assert.equal(vm.total, MATH_BLOCK.taskIds.length);
  assert.equal(vm.completed, 0);
  assert.match(vm.ariaLabel, new RegExp('0 of ' + MATH_BLOCK.taskIds.length + ' tasks completed'));
});

test('block completed count reflects persisted completions', () => {
  const completions = { [MATH_L1_1]: { completed: true, completedAt: AT } };
  const vm = TaskGroup.buildBlockViewModel(MATH_BLOCK, TASKS_BY_ID, completions);
  assert.equal(vm.completed, 1);
  assert.equal(vm.tasks.find((c) => c.taskId === MATH_L1_1).checked, true);
});

test('non-academic blocks never gain generated placeholder tasks', () => {
  const vm = TaskGroup.buildBlockViewModel(BREAK_BLOCK, TASKS_BY_ID, {});
  assert.equal(vm.isAcademic, false);
  assert.equal(vm.category, 'break');
  assert.equal(vm.total, 0);
  assert.deepEqual(vm.tasks, []);
  assert.equal(vm.note, TaskGroup.CATEGORY_NOTES.break);
});

test('unresolved syllabus references are dropped, not invented', () => {
  const vm = TaskGroup.buildBlockViewModel(
    { blockId: 'x', start: '1:00', end: '2:00', label: 'X', focus: 'X', category: 'study', taskIds: ['ghost:1:NOPE'] },
    TASKS_BY_ID,
    {}
  );
  assert.equal(vm.total, 0);
  assert.deepEqual(vm.tasks, []);
});

test('renderBlockHTML renders tasks for academic blocks and notes for the rest', () => {
  const academic = TaskGroup.renderBlockHTML(TaskGroup.buildBlockViewModel(MATH_BLOCK, TASKS_BY_ID, {}));
  assert.match(academic, /is-academic/);
  assert.match(academic, /category-study/);
  assert.match(academic, /data-block-id="mathematics"/);
  assert.match(academic, new RegExp('0 / ' + MATH_BLOCK.taskIds.length));
  assert.equal((academic.match(/class="task-row/g) || []).length, MATH_BLOCK.taskIds.length);

  const rest = TaskGroup.renderBlockHTML(TaskGroup.buildBlockViewModel(BREAK_BLOCK, TASKS_BY_ID, {}));
  assert.match(rest, /is-break/);
  assert.match(rest, /block-note/);
  assert.doesNotMatch(rest, /task-checkbox/);
  assert.doesNotMatch(rest, /block-count/);
});

// ---------------------------------------------------------------------------
// DailyTracker view model + HTML
// ---------------------------------------------------------------------------

test('buildTrackerViewModel matches the materialised Day-1 plan', () => {
  const vm = DailyTracker.buildTrackerViewModel(PLAN, {}, { context: 'IIT Madras BS' });
  const parts = C.formatDateParts(DAY1);

  assert.equal(vm.date, DAY1);
  assert.equal(vm.dayNumber, 1);
  assert.equal(vm.weekNumber, 1);
  assert.equal(vm.heading, 'Day 1 — Study Tracker');
  assert.equal(vm.subtitle, parts.weekdayLong + ' • 2 October 2026 • IIT Madras BS — Week 1');
  assert.equal(vm.blocks.length, PLAN.schedule.length);
  assert.deepEqual(vm.blocks.map((b) => b.blockId), PLAN.schedule.map((b) => b.blockId));
  assert.equal(vm.subjectBlocks, 4);
  assert.ok(vm.estimatedMinutes > 0);

  assert.equal(vm.progress.total, PLAN.tasks.length);
  assert.equal(vm.progress.total, 19);
  assert.equal(vm.progress.completed, 0);
  assert.equal(vm.progress.percent, 0);
  assert.equal(vm.progressLabel, '0 / 19 completed');
  assert.equal(vm.percentLabel, '0%');
});

test('buildTrackerViewModel refuses to fabricate a plan', () => {
  assert.equal(DailyTracker.buildTrackerViewModel(null, {}), null);
  assert.equal(DailyTracker.buildTrackerViewModel(undefined, {}), null);
});

test('renderTrackerHTML: hero, progress bar, stats and a back control', () => {
  const html = DailyTracker.renderTrackerHTML(DailyTracker.buildTrackerViewModel(PLAN, {}, { context: 'IIT Madras BS' }));
  assert.match(html, /class="tracker"/);
  assert.match(html, /Day 1 — Study Tracker/);
  assert.match(html, /class="progress-fill" style="width:0%"/);
  assert.match(html, /0 \/ 19 completed/);
  assert.match(html, /data-action="back"/);
  assert.equal((html.match(/class="study-block/g) || []).length, PLAN.schedule.length);
});

test('unavailable / missing / invalid states are explicit and recoverable', () => {
  const missing = DailyTracker.renderMissingPlanHTML(DAY1);
  assert.match(missing, /No study plan for this date/);
  assert.match(missing, /2 October 2026/);
  assert.match(missing, /data-action="back"/);

  const invalid = DailyTracker.renderInvalidDateHTML('2026-13-40');
  assert.match(invalid, /Invalid date/);
  assert.match(invalid, /2026-13-40/);
  assert.match(invalid, /data-action="back"/);

  const custom = DailyTracker.renderUnavailableHTML({ heading: 'Boom', message: 'Try again.' });
  assert.match(custom, /Boom/);
  assert.match(custom, /Try again\./);
});

// ---------------------------------------------------------------------------
// Controller: UI event -> storage write -> progress recalculation
// ---------------------------------------------------------------------------

test('controller: unchecked -> checked writes through storage and lifts progress', () => {
  const storage = newStorage();
  const controller = DailyTracker.createTrackerController({ plan: PLAN, storage: storage });
  const before = controller.getProgress();
  assert.equal(before.completed, 0);

  const after = controller.setTaskCompleted(MATH_L1_1, true);

  // completion is persisted through storage.js (never held in the component)
  assert.deepEqual(storage.getCompletion(MATH_L1_1), { completed: true, completedAt: storage.getCompletion(MATH_L1_1).completedAt });
  assert.equal(controller.isCompleted(MATH_L1_1), true);
  assert.equal(after.completed, before.completed + 1);

  // progress numbers come from the progress engine, not the component
  assert.deepEqual(after, PE.dayProgress(PLAN, storage.getAllCompletions()));
  assert.ok(after.percent > before.percent);
});

test('controller: checked -> unchecked removes the completion and resets progress', () => {
  const storage = newStorage();
  const controller = DailyTracker.createTrackerController({ plan: PLAN, storage: storage });
  controller.setTaskCompleted(MATH_L1_1, true);
  controller.setTaskCompleted(MATH_L1_1, false);

  assert.equal(storage.getCompletion(MATH_L1_1), null);
  assert.equal(controller.getProgress().completed, 0);
  assert.equal(controller.getProgress().percent, 0);
});

test('controller: toggleTask flips the persisted state each call', () => {
  const storage = newStorage();
  const controller = DailyTracker.createTrackerController({ plan: PLAN, storage: storage });
  assert.equal(controller.toggleTask(MATH_L1_1).completed, 1);
  assert.equal(controller.toggleTask(MATH_L1_1).completed, 0);
});

test('controller: completing one task leaves sibling tasks untouched', () => {
  const storage = newStorage();
  const controller = DailyTracker.createTrackerController({ plan: PLAN, storage: storage });
  controller.setTaskCompleted(MATH_L1_1, true);
  assert.equal(controller.isCompleted(MATH_AQ1_1), false);
  const vm = controller.getViewModel();
  const mathBlock = vm.blocks.find((b) => b.blockId === 'mathematics');
  assert.equal(mathBlock.completed, 1);
  assert.equal(mathBlock.total, MATH_BLOCK.taskIds.length);
});

test('refresh -> completed state survives (same backend, fresh storage)', () => {
  const backend = S.createMemoryBackend();
  const first = DailyTracker.createTrackerController({ plan: PLAN, storage: S.createStorage({ backend: backend }) });
  first.setTaskCompleted(MATH_L1_1, true);

  // simulating a page refresh: brand new storage over the same persisted backend
  const second = DailyTracker.createTrackerController({ plan: PLAN, storage: S.createStorage({ backend: backend }) });
  assert.equal(second.isCompleted(MATH_L1_1), true);

  const vm = second.getViewModel({ context: 'IIT Madras BS' });
  assert.equal(vm.progress.completed, 1);
  assert.match(DailyTracker.renderTrackerHTML(vm), /width:/);
  assert.equal(vm.percentLabel, PE.dayProgress(PLAN, new S.createStorage({ backend: backend }).getAllCompletions()).percent + '%');
});
