'use strict';

/*
 * tests/engine/storage.test.js — Study-Planner Phase 2
 *
 * Validates the completion-state persistence layer (src/js/storage.js):
 *   - empty / set / read / clear / clear-all / reset
 *   - timestamps and deterministic export
 *   - reload persistence through the same backend
 *   - malformed, incompatible, and invalid stored data (no crash, no silent overwrite)
 *   - export / import / merge and invalid imports
 *   - task id validation aligned with the data-engine identity format
 *
 * Run with:  node --test tests/engine/storage.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const S = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'storage.js'));
const DE = require(path.resolve(__dirname, '..', '..', 'src', 'js', 'data-engine.js'));

const TASK_A = 'mathematics-i:1:L1.1';
const TASK_B = 'english-i:2:Lecture 1';
const TASK_C = 'statistics-i:1:AQ1.1';
const AT = '2026-10-04T12:30:00.000Z';

function newStorage() {
  return S.createStorage({ backend: S.createMemoryBackend() });
}

function assertCode(fn, code, label) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code, label + ': code');
    return true;
  }, label);
}

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

test('fresh storage: healthy empty state, reads return null', () => {
  const st = newStorage();
  assert.deepEqual(st.diagnostics(),
    { status: 'empty', backend: 'custom', persistent: false, count: 0 });
  assert.equal(st.getCompletion(TASK_A), null);
  assert.equal(st.isCompleted(TASK_A), false);
  assert.deepEqual(st.getAllCompletions(), {});
  assert.equal(st.isPersistent(), false);
  assert.equal(st.key, S.STORAGE_KEY);
  assert.equal(st.schemaVersion, 1);
});

test('set / read / unset / clear a completion', () => {
  const st = newStorage();
  assert.deepEqual(st.setCompletion(TASK_A, true, { completedAt: AT }),
    { completed: true, completedAt: AT });
  assert.deepEqual(st.getCompletion(TASK_A), { completed: true, completedAt: AT });
  assert.equal(st.isCompleted(TASK_A), true);
  assert.equal(st.diagnostics().status, 'ok');
  assert.equal(st.diagnostics().count, 1);

  st.setCompletion(TASK_A, false);
  assert.equal(st.getCompletion(TASK_A), null);
  assert.equal(st.diagnostics().count, 0);
  assert.equal(st.diagnostics().status, 'empty');

  st.setCompletion(TASK_A, true, { completedAt: AT });
  st.clearCompletion(TASK_A);
  assert.equal(st.getCompletion(TASK_A), null);
  assert.deepEqual(st.getAllCompletions(), {});
});

test('completedAt defaults to an ISO timestamp; explicit null is allowed', () => {
  const st = newStorage();
  const record = st.setCompletion(TASK_A, true);
  assert.ok(!isNaN(Date.parse(record.completedAt)), 'default completedAt parses as a date');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(record.completedAt), 'ISO shape');
  st.setCompletion(TASK_B, true, { completedAt: null });
  assert.deepEqual(st.getCompletion(TASK_B), { completed: true, completedAt: null });
});

test('multiple completions; getAllCompletions returns a copy', () => {
  const st = newStorage();
  st.setCompletion(TASK_A, true, { completedAt: AT });
  st.setCompletion(TASK_B, true, { completedAt: AT });
  st.setCompletion(TASK_C, true, { completedAt: AT });
  assert.equal(st.diagnostics().count, 3);

  const all = st.getAllCompletions();
  assert.deepEqual(Object.keys(all).sort(), [TASK_A, TASK_B, TASK_C].sort());
  all[TASK_A].completed = false;
  delete all[TASK_B];
  assert.equal(st.getCompletion(TASK_A).completed, true, 'mutation of the copy has no effect');
  assert.ok(st.getCompletion(TASK_B), 'deletion from the copy has no effect');

  st.clearAllCompletions();
  assert.deepEqual(st.getAllCompletions(), {});
});

test('persistence across storage instances + deterministic export', () => {
  const backend = S.createMemoryBackend();
  const first = S.createStorage({ backend: backend });
  first.setCompletion(TASK_B, true, { completedAt: AT });
  first.setCompletion(TASK_A, true, { completedAt: AT });
  const exported = first.exportState();

  const second = S.createStorage({ backend: backend });
  assert.deepEqual(second.getAllCompletions(), first.getAllCompletions(),
    'a new instance on the same backend sees the same state (reload simulation)');
  assert.equal(second.exportState(), exported, 'export is deterministic');
  const sortedIds = [TASK_A, TASK_B].sort();
  assert.ok(exported.indexOf(sortedIds[0]) < exported.indexOf(sortedIds[1]), 'export sorts task ids');
  assert.ok(exported.endsWith('\n'));
  assert.ok(exported.indexOf('"schemaVersion": 1') !== -1);
});

// ---------------------------------------------------------------------------
// Corruption and incompatibility (fail safely, never silently overwrite)
// ---------------------------------------------------------------------------

test('malformed stored JSON: safe reads, blocked writes, explicit recovery', () => {
  const backend = S.createMemoryBackend();
  backend.setItem(S.STORAGE_KEY, '{not json');

  const st = S.createStorage({ backend: backend });
  const diag = st.diagnostics();
  assert.equal(diag.status, 'corrupt');
  assert.ok(/not valid JSON/.test(diag.message));
  assert.equal(st.getCompletion(TASK_A), null, 'reads degrade to not-completed');
  assert.deepEqual(st.getAllCompletions(), {});

  assertCode(() => st.setCompletion(TASK_A, true), 'corrupt_state', 'write blocked');
  assertCode(() => st.clearAllCompletions(), 'corrupt_state', 'clear-all blocked');
  assertCode(() => st.exportState(), 'state_unavailable', 'export blocked');
  assert.equal(st.getRawState(), '{not json', 'raw payload preserved for backup');

  st.reset();
  assert.equal(st.diagnostics().status, 'empty');
  st.setCompletion(TASK_A, true, { completedAt: AT });
  assert.deepEqual(st.getCompletion(TASK_A), { completed: true, completedAt: AT }, 'healthy after reset');
});

test('incompatible schemaVersion: detected and protected', () => {
  const backend = S.createMemoryBackend();
  backend.setItem(S.STORAGE_KEY, JSON.stringify({ schemaVersion: 99, completions: {} }));
  const st = S.createStorage({ backend: backend });
  const diag = st.diagnostics();
  assert.equal(diag.status, 'incompatible');
  assert.ok(/99/.test(diag.message));
  assertCode(() => st.setCompletion(TASK_A, true), 'incompatible_state', 'write blocked');
  st.reset();
  assert.equal(st.diagnostics().status, 'empty');
  st.setCompletion(TASK_A, true, { completedAt: AT });
  assert.equal(st.isCompleted(TASK_A), true);
});

test('invalid completion records mark the state corrupt; missing version is incompatible', () => {
  const cases = [
    [{ schemaVersion: 1, completions: { 'mathematics-i:1:L1.1': { completed: 'yes' } } }, 'corrupt'],
    [{ schemaVersion: 1, completions: { 'mathematics-i:1:L1.1': { completed: true, completedAt: 'not-a-date' } } }, 'corrupt'],
    [{ schemaVersion: 1, completions: { 'mathematics-i:1:L1.1': 'nope' } }, 'corrupt'],
    [{ schemaVersion: 1, completions: [] }, 'corrupt'],
    [{ completions: {} }, 'incompatible'],
    [{ schemaVersion: 'one', completions: {} }, 'incompatible']
  ];
  for (const [payload, expected] of cases) {
    const backend = S.createMemoryBackend();
    backend.setItem(S.STORAGE_KEY, JSON.stringify(payload));
    const st = S.createStorage({ backend: backend });
    assert.equal(st.diagnostics().status, expected,
      'payload must be rejected as ' + expected + ': ' + JSON.stringify(payload));
    assert.equal(st.getCompletion(TASK_A), null);
    assertCode(() => st.setCompletion(TASK_A, true),
      expected === 'incompatible' ? 'incompatible_state' : 'corrupt_state',
      'write blocked for ' + JSON.stringify(payload));
  }
});

test('task id validation: malformed ids throw invalid_task_id', () => {
  const st = newStorage();
  for (const bad of ['nope', '', 'a:1', 'a:1:b:c', 'a:x:b', null, undefined, 42]) {
    assertCode(() => st.getCompletion(bad), 'invalid_task_id', 'get ' + String(bad));
    assertCode(() => st.setCompletion(bad, true), 'invalid_task_id', 'set ' + String(bad));
    assertCode(() => st.clearCompletion(bad), 'invalid_task_id', 'clear ' + String(bad));
  }
  // Well-formed but unknown id is a normal null, not an error.
  assert.equal(st.getCompletion('mathematics-i:1:DOES-NOT-EXIST'), null);
});

test('completed flag must be boolean', () => {
  const st = newStorage();
  assertCode(() => st.setCompletion(TASK_A, 'yes'), 'invalid_argument', 'string flag');
  assertCode(() => st.setCompletion(TASK_A, undefined), 'invalid_argument', 'undefined flag');
  assertCode(() => st.setCompletion(TASK_A, true, { completedAt: 'garbage' }), 'invalid_argument', 'bad timestamp');
});

// ---------------------------------------------------------------------------
// Export / import / merge + backend validation
// ---------------------------------------------------------------------------

test('export -> import round trip; merge unions with existing state', () => {
  const source = newStorage();
  source.setCompletion(TASK_A, true, { completedAt: AT });
  source.setCompletion(TASK_B, true, { completedAt: AT });
  const exported = source.exportState();

  const replaced = newStorage();
  replaced.setCompletion(TASK_C, true, { completedAt: AT });
  const result = replaced.importState(exported);
  assert.deepEqual(result, { imported: 2, replaced: true });
  assert.deepEqual(replaced.getAllCompletions(), source.getAllCompletions(),
    'replace import matches the exported state exactly');

  const merged = newStorage();
  merged.setCompletion(TASK_C, true, { completedAt: AT });
  const mergeResult = merged.importState(exported, { merge: true });
  assert.deepEqual(mergeResult, { imported: 2, replaced: false });
  assert.deepEqual(Object.keys(merged.getAllCompletions()).sort(), [TASK_A, TASK_B, TASK_C].sort());

  // Merge into a corrupt state cannot merge: it replaces and recovers.
  const backend = S.createMemoryBackend();
  backend.setItem(S.STORAGE_KEY, 'garbage');
  const corrupt = S.createStorage({ backend: backend });
  const recovery = corrupt.importState(exported, { merge: true });
  assert.deepEqual(recovery, { imported: 2, replaced: true });
  assert.equal(corrupt.diagnostics().status, 'ok');
  assert.equal(corrupt.isCompleted(TASK_A), true);
});

test('invalid imports are rejected', () => {
  const st = newStorage();
  assertCode(() => st.importState(42), 'invalid_import', 'non-string');
  assertCode(() => st.importState('{nope'), 'invalid_import', 'invalid JSON');
  assertCode(() => st.importState(JSON.stringify({ schemaVersion: 2, completions: {} })),
    'invalid_import', 'wrong version');
  assertCode(() => st.importState(JSON.stringify({ schemaVersion: 1, completions: 'x' })),
    'invalid_import', 'bad completions container');
  assertCode(() => st.importState(JSON.stringify({
    schemaVersion: 1, completions: { 'not a task id': { completed: true, completedAt: AT } }
  })), 'invalid_import', 'bad task id');
  assertCode(() => st.importState(JSON.stringify({
    schemaVersion: 1, completions: { 'mathematics-i:1:L1.1': { completed: false } }
  })), 'invalid_import', 'record not completed');
  // Failed imports leave the existing state untouched.
  st.setCompletion(TASK_A, true, { completedAt: AT });
  assertCode(() => st.importState('{nope'), 'invalid_import', 'still rejects');
  assert.deepEqual(st.getAllCompletions(), { [TASK_A]: { completed: true, completedAt: AT } });
});

test('invalid storage backends are rejected', () => {
  assertCode(() => S.createStorage({ backend: {} }), 'invalid_backend', 'missing methods');
  assertCode(() => S.createStorage({ backend: { getItem: 1, setItem: 1, removeItem: 1 } }),
    'invalid_backend', 'non-function members');
  assert.ok(S.createMemoryBackend());
});

test('storage task-id pattern matches the data-engine identity format', () => {
  const tricky = [
    DE.buildTaskId('english-i', 2, 'Lecture 1'),
    DE.buildTaskId('statistics-i', 4, 'Practice Assignment (EMQ) 1 - Not Graded Programming'),
    DE.buildTaskId('mathematics-i', 1, 'Grading Assignment - 1'),
    DE.buildTaskId('computational-thinking', 3, 'Week 3 - Practice Assignment 3')
  ];
  for (const id of tricky) {
    assert.ok(S.TASK_ID_PATTERN.test(id), id + ' matches storage pattern');
    assert.deepEqual(
      DE.buildTaskId(DE.parseTaskId(id).subjectId, DE.parseTaskId(id).weekNumber, DE.parseTaskId(id).sourceId),
      id, id + ' round-trips through data-engine parse/build');
  }
  assert.ok(!S.TASK_ID_PATTERN.test('mathematics-i:1:'));
  assert.ok(!S.TASK_ID_PATTERN.test('mathematics-i:x:L1.1'));
  assert.ok(!S.TASK_ID_PATTERN.test('mathematics-i:1:a:b'));
});



