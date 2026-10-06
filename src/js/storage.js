/**
 * src/js/storage.js — Study-Planner Phase 2 (Core Data + Storage Architecture)
 *
 * The single persistence abstraction for mutable user state (task completion).
 *
 * Architecture (documented in docs/phase2-core-architecture.md):
 *   - repository JSON files ship canonical/plan data and are NEVER written at runtime
 *   - completion state lives in browser storage under one versioned key
 *     ("study-planner:state"), or in an in-memory fallback when localStorage
 *     is unavailable (the app keeps working; diagnostics report non-persistence)
 *   - only mutable state is stored — never syllabus content
 *
 * State shape (schemaVersion 1):
 * {
 *   "schemaVersion": 1,
 *   "completions": {
 *     "mathematics-i:1:L1.1": { "completed": true, "completedAt": "2026-10-04T12:30:00.000Z" }
 *   }
 * }
 *
 * Corruption policy:
 *   - missing state          -> healthy empty state
 *   - malformed/incompatible -> diagnostics report it; reads degrade to
 *                               "not completed"; writes refuse to overwrite
 *                               (StorageError); reset() recovers; getRawState()
 *                               exposes the raw payload for backup
 *   - invalid imports / task ids throw clear StorageError codes
 *
 * Environment: plain browser script (globalThis.StudyPlanner.Storage) or
 * CommonJS (module.exports). No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.Storage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'study-planner:state';
  var SCHEMA_VERSION = 1;
  // Keep in sync with data-engine's task id format (cross-checked by tests).
  var TASK_ID_PATTERN = /^[^:]+:\d+:[^:]+$/;

  function StorageError(code, message, details) {
    var err = Error.call(this, message);
    this.name = 'StorageError';
    this.code = code;
    this.message = message;
    if (details !== undefined) this.details = details;
    if (err.stack) this.stack = err.stack;
  }
  StorageError.prototype = Object.create(Error.prototype);
  StorageError.prototype.constructor = StorageError;

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isIsoString(value) {
    return typeof value === 'string' && !isNaN(Date.parse(value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Simple in-memory key/value backend (tests + non-persistent fallback).
  function createMemoryBackend() {
    var map = new Map();
    return {
      getItem: function (key) { return map.has(key) ? map.get(key) : null; },
      setItem: function (key, value) { map.set(key, String(value)); },
      removeItem: function (key) { map.delete(key); }
    };
  }

  function detectLocalStorage() {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return null;
      var probe = '__study_planner_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch (e) {
      return null;
    }
  }

  function createStorage(options) {
    var opts = options || {};
    var backend = opts.backend || null;
    var backendKind = opts.backend ? 'custom' : null;

    if (!backend) {
      var detected = detectLocalStorage();
      if (detected) {
        backend = detected;
        backendKind = 'localStorage';
      } else {
        backend = createMemoryBackend();
        backendKind = 'memory';
      }
    }
    if (!backend || typeof backend.getItem !== 'function' ||
        typeof backend.setItem !== 'function' || typeof backend.removeItem !== 'function') {
      throw new StorageError('invalid_backend', 'Storage backend must provide getItem/setItem/removeItem');
    }

    var state = null;   // healthy parsed state, or null when corrupt / incompatible
    var status = null;  // structured diagnostics

    function emptyState() {
      return { schemaVersion: SCHEMA_VERSION, completions: {} };
    }

    function persistent() {
      return backendKind === 'localStorage';
    }

    function readRaw() {
      try {
        var raw = backend.getItem(STORAGE_KEY);
        return raw === undefined ? null : raw;
      } catch (e) {
        throw new StorageError('backend_error', 'Could not read from the storage backend: ' + e.message);
      }
    }

    function validateRecord(record) {
      if (!isPlainObject(record)) return 'completion record must be an object';
      if (record.completed !== true) return 'completion record must have completed === true';
      if (!(record.completedAt === null || isIsoString(record.completedAt))) {
        return 'completedAt must be null or an ISO timestamp';
      }
      return null;
    }

    function adopt(raw) {
      if (raw === null || raw === '') {
        state = emptyState();
        status = { status: 'empty', backend: backendKind, persistent: persistent(), count: 0 };
        return;
      }
      var parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        state = null;
        status = {
          status: 'corrupt', backend: backendKind, persistent: persistent(),
          message: 'stored state is not valid JSON'
        };
        return;
      }
      if (!isPlainObject(parsed) || !isPlainObject(parsed.completions)) {
        state = null;
        status = {
          status: 'corrupt', backend: backendKind, persistent: persistent(),
          message: 'stored state has an unexpected shape'
        };
        return;
      }
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        state = null;
        status = {
          status: 'incompatible', backend: backendKind, persistent: persistent(),
          message: 'unsupported schemaVersion (found ' + JSON.stringify(parsed.schemaVersion) +
            ', expected ' + SCHEMA_VERSION + ')'
        };
        return;
      }
      var taskIds = Object.keys(parsed.completions);
      for (var i = 0; i < taskIds.length; i++) {
        var problem = validateRecord(parsed.completions[taskIds[i]]);
        if (problem) {
          state = null;
          status = {
            status: 'corrupt', backend: backendKind, persistent: persistent(),
            message: 'invalid completion record for "' + taskIds[i] + '": ' + problem
          };
          return;
        }
      }
      state = { schemaVersion: SCHEMA_VERSION, completions: clone(parsed.completions) };
      status = {
        status: taskIds.length > 0 ? 'ok' : 'empty',
        backend: backendKind, persistent: persistent(), count: taskIds.length
      };
    }

    function assertWritable() {
      if (state) return;
      throw new StorageError(
        status && status.status === 'incompatible' ? 'incompatible_state' : 'corrupt_state',
        'Refusing to overwrite ' + (status ? status.status : 'unavailable') +
        ' stored state. Use reset() to clear it, or getRawState() to back it up first.',
        { diagnostics: clone(status) }
      );
    }

    function assertTaskId(taskId) {
      if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
        throw new StorageError('invalid_task_id',
          'taskId must match "<subjectId>:<weekNumber>:<sourceId>": ' + String(taskId));
      }
    }

    // Deterministic serialization: task ids sorted, stable key order.
    function serialize(stateObj) {
      var ids = Object.keys(stateObj.completions).sort();
      var completions = {};
      ids.forEach(function (taskId) {
        completions[taskId] = {
          completed: stateObj.completions[taskId].completed,
          completedAt: stateObj.completions[taskId].completedAt
        };
      });
      return JSON.stringify({ schemaVersion: stateObj.schemaVersion, completions: completions }, null, 2) + '\n';
    }

    function persist() {
      try {
        backend.setItem(STORAGE_KEY, serialize(state));
      } catch (e) {
        throw new StorageError('backend_error', 'Could not write to the storage backend: ' + e.message);
      }
      var count = Object.keys(state.completions).length;
      status = {
        status: count > 0 ? 'ok' : 'empty',
        backend: backendKind, persistent: persistent(), count: count
      };
    }

    function getCompletion(taskId) {
      assertTaskId(taskId);
      if (!state) return null;
      var record = state.completions[taskId];
      return record ? { completed: true, completedAt: record.completedAt } : null;
    }

    function setCompletion(taskId, completed, options2) {
      assertTaskId(taskId);
      assertWritable();
      if (completed === true) {
        var at = options2 && options2.completedAt !== undefined ? options2.completedAt : new Date().toISOString();
        if (!(at === null || isIsoString(at))) {
          throw new StorageError('invalid_argument', 'options.completedAt must be null or an ISO timestamp');
        }
        state.completions[taskId] = { completed: true, completedAt: at };
      } else if (completed === false) {
        delete state.completions[taskId];
      } else {
        throw new StorageError('invalid_argument', 'completed must be true or false');
      }
      persist();
      return getCompletion(taskId);
    }

    function clearCompletion(taskId) {
      assertTaskId(taskId);
      assertWritable();
      delete state.completions[taskId];
      persist();
    }

    function getAllCompletions() {
      if (!state) return {};
      return clone(state.completions);
    }

    function clearAllCompletions() {
      assertWritable();
      state.completions = {};
      persist();
    }

    // Explicit recovery from ANY state (healthy, corrupt, or incompatible).
    function reset() {
      state = emptyState();
      try {
        backend.removeItem(STORAGE_KEY);
      } catch (e) {
        throw new StorageError('backend_error', 'Could not clear the storage backend: ' + e.message);
      }
      persist();
    }

    // Raw stored payload — the recovery path when state is not healthy.
    function getRawState() {
      return readRaw();
    }

    function exportState() {
      if (!state) {
        throw new StorageError('state_unavailable',
          'Stored state is not healthy (' + (status ? status.status : 'unavailable') +
          '). Use getRawState() to back it up, then reset().');
      }
      return serialize(state);
    }

    function importState(json, options2) {
      var merge = !!(options2 && options2.merge);
      if (typeof json !== 'string') {
        throw new StorageError('invalid_import', 'importState expects a JSON string');
      }
      var parsed = null;
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        throw new StorageError('invalid_import', 'Import is not valid JSON: ' + e.message);
      }
      if (!isPlainObject(parsed) || parsed.schemaVersion !== SCHEMA_VERSION || !isPlainObject(parsed.completions)) {
        throw new StorageError('invalid_import',
          'Import must be { schemaVersion: ' + SCHEMA_VERSION + ', completions: { ... } }');
      }
      var taskIds = Object.keys(parsed.completions);
      for (var i = 0; i < taskIds.length; i++) {
        if (!TASK_ID_PATTERN.test(taskIds[i])) {
          throw new StorageError('invalid_import', 'Invalid taskId in import: "' + taskIds[i] + '"');
        }
        var problem = validateRecord(parsed.completions[taskIds[i]]);
        if (problem) {
          throw new StorageError('invalid_import', 'Invalid record for "' + taskIds[i] + '": ' + problem);
        }
      }
      var wasHealthy = !!state;
      if (!merge || !wasHealthy) state = emptyState();
      taskIds.forEach(function (taskId) {
        state.completions[taskId] = {
          completed: true,
          completedAt: parsed.completions[taskId].completedAt
        };
      });
      persist();
      return { imported: taskIds.length, replaced: !(merge && wasHealthy) };
    }

    adopt(readRaw());

    return {
      key: STORAGE_KEY,
      schemaVersion: SCHEMA_VERSION,
      diagnostics: function () { return clone(status); },
      isPersistent: persistent,
      getCompletion: getCompletion,
      isCompleted: function (taskId) { return getCompletion(taskId) !== null; },
      setCompletion: setCompletion,
      clearCompletion: clearCompletion,
      getAllCompletions: getAllCompletions,
      clearAllCompletions: clearAllCompletions,
      reset: reset,
      getRawState: getRawState,
      exportState: exportState,
      importState: importState
    };
  }

  return {
    StorageError: StorageError,
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    TASK_ID_PATTERN: TASK_ID_PATTERN,
    createStorage: createStorage,
    createMemoryBackend: createMemoryBackend,
    detectLocalStorage: detectLocalStorage
  };
});




