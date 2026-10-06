'use strict';

/*
 * tests/renderer/tracker-u5.test.js — Update U5 (CHANGE-004)
 *
 * Minimal, focused coverage for making the two actionable non-course blocks —
 * "Math + Statistics Revision" (revision) and "Daily Review" (review) — carry
 * the established Daily Tracker completion control:
 *   - stable per-day task id minted by TaskGroup.actionableTaskId
 *   - id conforms to storage.js / data-engine TASK_ID_PATTERN
 *   - block view model + HTML reuse the TaskCard checkbox markup
 *   - completion persists through storage.js (same controller flow)
 *   - progress denominators are untouched (day 19 / overall 413)
 *   - break / free / fixed blocks remain non-actionable
 *
 * Run with:  node --test tests/renderer/tracker-u5.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DE = require(path.join(ROOT, 'src', 'js', 'data-engine.js'));
const PE = require(path.join(ROOT, 'src', 'js', 'progress-engine.js'));
const S = require(path.join(ROOT, 'src', 'js', 'storage.js'));
const TaskGroup = require(path.join(ROOT, 'src', 'components', 'tracker', 'task-group.js'));
const DailyTracker = require(path.join(ROOT, 'src', 'components', 'tracker', 'daily-tracker.js'));

const DAY1 = '2026-10-02';
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schedule', 'daily', DAY1 + '.json'), 'utf8'));
const AT = '2026-10-04T12:30:00.000Z';
const CONTEXT = { date: PLAN.date, weekNumber: PLAN.weekNumber };

const REVISION_BLOCK = PLAN.schedule.find((b) => b.blockId === 'revision');
const REVIEW_BLOCK = PLAN.schedule.find((b) => b.blockId === 'daily-review');
const TASKS_BY_ID = PLAN.tasks.reduce((map, t) => { map[t.taskId] = t; return map; }, {});

const REV_ID = 'revision:1:2026-10-02';
const REVIEW_ID = 'daily-review:1:2026-10-02';

function newStorage() {
  return S.createStorage({ backend: S.createMemoryBackend() });
}

function build(block, completions) {
  return TaskGroup.buildBlockViewModel(block, TASKS_BY_ID, completions || {}, CONTEXT);
}

// ---------------------------------------------------------------------------
// 1. Task id scheme
// ---------------------------------------------------------------------------

test('U5-01: actionable ids are stable, date-scoped and match both TASK_ID_PATTERNs', () => {
  assert.equal(TaskGroup.actionableTaskId(REVISION_BLOCK, CONTEXT), REV_ID);
  assert.equal(TaskGroup.actionableTaskId(REVIEW_BLOCK, CONTEXT), REVIEW_ID);

  // no caller context -> no id (the block degrades to its pre-U5 card)
  assert.equal(TaskGroup.actionableTaskId(REVISION_BLOCK, null), null);
  assert.equal(TaskGroup.actionableTaskId(REVISION_BLOCK, {}), null);
  assert.equal(
    TaskGroup.actionableTaskId(REVISION_BLOCK, { date: 'not-a-date', weekNumber: 1 }),
    null
  );
  assert.equal(
    TaskGroup.actionableTaskId(REVISION_BLOCK, { date: DAY1, weekNumber: 0 }),
    null
  );

  // non-actionable categories never mint an id, even with full context
  const breakBlock = PLAN.schedule.find((b) => b.blockId === 'lunch-rest');
  const freeBlock = PLAN.schedule.find((b) => b.blockId === 'free-refresh');
  const fixedBlock = PLAN.schedule.find((b) => b.blockId === 'fixed-time');
  [breakBlock, freeBlock, fixedBlock].forEach((block) => {
    assert.equal(TaskGroup.actionableTaskId(block, CONTEXT), null, block.blockId);
  });

  // storage gate + data-engine gate both accept the minted ids
  [REV_ID, REVIEW_ID].forEach((id) => {
    assert.ok(S.TASK_ID_PATTERN.test(id), id + ' matches storage TASK_ID_PATTERN');
    assert.ok(DE.TASK_ID_PATTERN.test(id), id + ' matches data-engine TASK_ID_PATTERN');
    const parsed = DE.parseTaskId(id);
    assert.equal(parsed.weekNumber, 1);
    assert.equal(parsed.sourceId, DAY1);
  });
});

test('U5-02: ids are unique per block and per day (no cross-day bleed)', () => {
  const nextDay = { date: '2026-10-03', weekNumber: 1 };
  assert.notEqual(
    TaskGroup.actionableTaskId(REVISION_BLOCK, CONTEXT),
    TaskGroup.actionableTaskId(REVISION_BLOCK, nextDay)
  );
  assert.notEqual(
    TaskGroup.actionableTaskId(REVISION_BLOCK, CONTEXT),
    TaskGroup.actionableTaskId(REVIEW_BLOCK, CONTEXT)
  );
});

// ---------------------------------------------------------------------------
// 2. Block view model + HTML
// ---------------------------------------------------------------------------

test('U5-03: revision/review blocks expose exactly one TaskCard control each', () => {
  [REV_ID, REVIEW_ID].forEach((id) => {
    const block = id.startsWith('revision:') ? REVISION_BLOCK : REVIEW_BLOCK;
    const vm = build(block);
    assert.equal(vm.isAcademic, false, id + ' stays non-academic');
    assert.equal(vm.isActionable, true, id + ' is actionable');
    assert.equal(vm.completionTaskId, id);
    assert.equal(vm.tasks.length, 1, id + ' carries exactly one control');
    assert.equal(vm.total, 1);
    assert.equal(vm.completed, 0);
    assert.equal(vm.tasks[0].taskId, id);
    assert.equal(vm.tasks[0].checked, false);
    assert.equal(vm.tasks[0].title, block.label);
    assert.equal(vm.tasks[0].meta, block.focus);
    assert.equal(vm.taskIds.length, 0, 'plan taskIds stay empty (no data edit)');
    assert.ok(vm.note, 'existing block note is preserved');
  });
});

test('U5-04: HTML reuses the established checkbox markup, break blocks do not', () => {
  const revisionHTML = TaskGroup.renderBlockHTML(build(REVISION_BLOCK));
  assert.match(revisionHTML, /data-block-id="revision"/);
  assert.match(revisionHTML, /class="task-row" data-task-id="revision:1:2026-10-02"/);
  assert.match(revisionHTML, /class="task-checkbox"[^>]*data-task-id="revision:1:2026-10-02"/);
  assert.match(revisionHTML, /data-action="toggle-task"/);
  assert.match(revisionHTML, /0 \/ 1/, 'actionable block shows a live count');
  assert.match(revisionHTML, /block-note/, 'existing note preserved');
  assert.doesNotMatch(revisionHTML, / checked>/);

  const reviewHTML = TaskGroup.renderBlockHTML(build(REVIEW_BLOCK));
  assert.match(reviewHTML, /data-task-id="daily-review:1:2026-10-02"/);
  assert.match(reviewHTML, /data-action="toggle-task"/);

  // every break/free/fixed block on Day 1 keeps zero controls
  PLAN.schedule.forEach((block) => {
    if (['revision', 'review', 'study'].indexOf(block.category) !== -1) return;
    const html = TaskGroup.renderBlockHTML(build(block));
    assert.doesNotMatch(html, /task-checkbox/, block.blockId + ' has no checkbox');
    assert.doesNotMatch(html, /block-count/, block.blockId + ' has no count');
    assert.equal(build(block).tasks.length, 0, block.blockId + ' has no tasks');
  });
});

test('U5-05: persisted completion renders checked; unchecking clears it', () => {
  const checked = build(REVISION_BLOCK, { [REV_ID]: { completed: true, completedAt: AT } });
  assert.equal(checked.completed, 1);
  assert.equal(checked.tasks[0].checked, true);
  const html = TaskGroup.renderBlockHTML(checked);
  assert.match(html, / checked>/);
  assert.match(html, /is-completed/);
  assert.match(html, /1 \/ 1/);

  // a completion record for one block never bleeds into the sibling block
  const sibling = build(REVIEW_BLOCK, { [REV_ID]: { completed: true, completedAt: AT } });
  assert.equal(sibling.completed, 0);
  assert.equal(sibling.tasks[0].checked, false);
});

// ---------------------------------------------------------------------------
// 3. Persistence through the existing controller/storage flow
// ---------------------------------------------------------------------------

test('U5-06: controller writes both controls through storage.js and they survive reload', () => {
  const backend = S.createMemoryBackend();
  const controller = DailyTracker.createTrackerController({
    plan: PLAN,
    storage: S.createStorage({ backend: backend })
  });

  assert.equal(controller.setTaskCompleted(REV_ID, true).total, 19,
    'day progress total unchanged by the block control');
  controller.setTaskCompleted(REVIEW_ID, true);

  const stored = S.createStorage({ backend: backend }).getAllCompletions();
  assert.deepEqual(Object.keys(stored).sort(), [REVIEW_ID, REV_ID].sort());
  assert.ok(stored[REV_ID].completedAt);
  assert.ok(S.TASK_ID_PATTERN.test(REV_ID));

  // re-render picks the checked state up from storage alone
  const vm = controller.getViewModel();
  const revVM = vm.blocks.find((b) => b.blockId === 'revision');
  const reviewVM = vm.blocks.find((b) => b.blockId === 'daily-review');
  assert.equal(revVM.completed, 1);
  assert.equal(reviewVM.completed, 1);

  // uncheck removes the record again (same behaviour as course tasks)
  controller.setTaskCompleted(REV_ID, false);
  assert.equal(S.createStorage({ backend: backend }).getCompletion(REV_ID), null);
  assert.equal(controller.getViewModel().blocks.find((b) => b.blockId === 'revision').completed, 0);
});

// ---------------------------------------------------------------------------
// 4. Progress isolation (locked denominators)
// ---------------------------------------------------------------------------

test('U5-07: block completions never move day or overall progress numbers', () => {
  const before = PE.dayProgress(PLAN, {});
  const after = PE.dayProgress(PLAN, {
    [REV_ID]: { completed: true, completedAt: AT },
    [REVIEW_ID]: { completed: true, completedAt: AT }
  });
  assert.deepEqual(after, before, 'dayProgress ignores ids outside plan.tasks');
  assert.equal(after.total, 19);

  const vm = DailyTracker.buildTrackerViewModel(PLAN, {
    [REV_ID]: { completed: true, completedAt: AT },
    [REVIEW_ID]: { completed: true, completedAt: AT }
  }, { context: 'IIT Madras BS' });
  assert.equal(vm.progress.total, 19);
  assert.equal(vm.progress.completed, 0);
  assert.equal(vm.progressLabel, '0 / 19 completed');
  assert.equal(vm.subjectBlocks, 4, 'actionable blocks do not become subject blocks');
});

test('U5-08: full Day-1 tracker renders 19 course checkboxes + 2 block controls', () => {
  const vm = DailyTracker.buildTrackerViewModel(PLAN, {}, { context: 'IIT Madras BS' });
  const html = DailyTracker.renderTrackerHTML(vm);
  assert.equal((html.match(/class="task-checkbox"/g) || []).length, 21);
  assert.equal((html.match(/data-action="toggle-task"/g) || []).length, 21);
  assert.match(html, /data-task-id="revision:1:2026-10-02"/);
  assert.match(html, /data-task-id="daily-review:1:2026-10-02"/);
  // course-task rendering is byte-for-byte the same set of ids as before
  PLAN.schedule.filter((b) => b.category === 'study').forEach((block) => {
    block.taskIds.forEach((id) => {
      assert.ok(html.includes('data-task-id="' + id + '"'), id + ' still rendered');
    });
  });
});
