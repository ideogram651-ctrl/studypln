/**
 * src/js/calendar-metadata.js — Study-Planner U2 (calendar notes + events)
 *
 * A dedicated persistence layer for USER-CREATED calendar metadata: date-specific
 * notes and events. It is deliberately separate from src/js/storage.js, which
 * remains the single completion authority.
 *
 * Architectural boundaries:
 *   - Own storage key ("study-planner:calendar"). Never reads or writes the
 *     completion key ("study-planner:state").
 *   - Holds NO task completion, NO progress, NO planner data. Only notes/events.
 *   - Never mutates the canonical calendar JSON (data/calendar/calendar-2026.json):
 *     that file is static application source data, read-only at runtime.
 *   - Date-scoped: every note/event is attached to a validated ISO "YYYY-MM-DD".
 *
 * Robustness (mirrors storage.js conventions):
 *   - missing state        -> healthy empty state
 *   - malformed state      -> diagnostics reported, reads degrade to empty,
 *                            writes refuse to overwrite until reset()
 *   - unrelated localStorage keys are never touched
 *
 * Environment: browser global (globalThis.StudyPlanner.CalendarMetadata) or CommonJS.
 * No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.CalendarMetadata = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'study-planner:calendar';
  var SCHEMA_VERSION = 1;
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var MAX_TEXT = 500;

  function CalendarMetadataError(code, message, details) {
    var err = Error.call(this, message);
    this.name = 'CalendarMetadataError';
    this.code = code;
    this.message = message;
    if (details !== undefined) this.details = details;
    if (err.stack) this.stack = err.stack;
  }
  CalendarMetadataError.prototype = Object.create(Error.prototype);
  CalendarMetadataError.prototype.constructor = CalendarMetadataError;

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function isIsoDate(value) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
    var parts = value.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var day = parts[2];
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  // Deterministic id: derived from date + kind + sequence + content hash. No
  // clock read and no randomness, so identical inputs always produce identical ids.
  function stableId(prefix, date, sequence, text) {
    var hash = 0;
    var source = prefix + '|' + date + '|' + sequence + '|' + text;
    for (var i = 0; i < source.length; i++) {
      hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
    }
    return prefix + '-' + date + '-' + Math.abs(hash).toString(36);
  }
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
      var probe = '__study_planner_calendar_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch (e) {
      return null;
    }
  }

  function createCalendarMetadata(options) {
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
      throw new CalendarMetadataError('invalid_backend',
        'Calendar metadata backend must provide getItem/setItem/removeItem');
    }

    var state = null;  // healthy parsed state, or null when corrupt / incompatible
    var status = null; // structured diagnostics

    function emptyState() {
      return { schemaVersion: SCHEMA_VERSION, notes: {}, events: {} };
    }

    function persistent() {
      return backendKind === 'localStorage';
    }

    // ---- read / validate ---------------------------------------------------

    function readRaw() {
      try {
        var raw = backend.getItem(STORAGE_KEY);
        return raw === undefined ? null : raw;
      } catch (error) {
        throw new CalendarMetadataError('backend_error',
          'Could not read calendar metadata: ' + error.message);
      }
    }

    function validateDocument(doc) {
      var errors = [];
      if (!isPlainObject(doc)) {
        errors.push('state must be an object');
        return { valid: false, errors: errors };
      }
      if (doc.schemaVersion !== SCHEMA_VERSION) {
        errors.push('schemaVersion: expected ' + SCHEMA_VERSION);
      }
      // notes/events are date-keyed maps. A non-object here means corrupt state;
      // individual malformed entries are dropped instead (partial recovery).
      if (doc.notes !== undefined && !isPlainObject(doc.notes)) errors.push('notes must be an object keyed by date');
      if (doc.events !== undefined && !isPlainObject(doc.events)) errors.push('events must be an object keyed by date');
      return { valid: errors.length === 0, errors: errors };
    }

    // Keep only well-formed entries so one bad record cannot break the Calendar.
    function sanitizeEntries(map, kind) {
      var clean = {};
      if (!isPlainObject(map)) return clean;
      Object.keys(map).forEach(function (date) {
        if (!isIsoDate(date)) return;
        var list = map[date];
        if (!Array.isArray(list)) return;
        var kept = list.filter(function (item) {
          return isPlainObject(item) && typeof item.id === 'string' &&
            item.date === date && typeof item.text === 'string';
        }).map(function (item) {
          return {
            id: item.id,
            date: date,
            text: item.text,
            time: typeof item.time === 'string' ? item.time : null,
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
          };
        });
        if (kept.length) clean[date] = kept;
      });
      return clean;
    }
    function load() {
      var raw;
      try {
        raw = readRaw();
      } catch (error) {
        status = { ok: false, reason: 'unreadable', message: error.message };
        return false;
      }
      if (raw === null || raw === undefined || raw === '') {
        state = emptyState();
        status = { ok: true, reason: 'empty' };
        return true;
      }
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        status = { ok: false, reason: 'malformed_json', message: error.message };
        return false;
      }
      var result = validateDocument(parsed);
      if (!result.valid) {
        status = { ok: false, reason: 'invalid_state', errors: result.errors };
        return false;
      }
      // Partial recovery: unusable individual entries are dropped, valid ones kept.
      state = {
        schemaVersion: SCHEMA_VERSION,
        notes: sanitizeEntries(parsed.notes, 'note'),
        events: sanitizeEntries(parsed.events, 'event')
      };
      status = { ok: true, reason: 'loaded' };
      return true;
    }

    function current() {
      if (state === null) load();
      // Corrupt state degrades to empty reads rather than throwing, so the
      // Calendar still renders. Writes are refused until reset().
      if (state === null) return emptyState();
      return state;
    }

    function assertWritable() {
      if (state !== null) return;
      var raw = readRaw();
      if (raw === null || raw === undefined || raw === '') {
        state = emptyState();
        return;
      }
      throw new CalendarMetadataError('corrupt_state',
        'Calendar metadata is unreadable. Use reset() to start clean, or getRawState() to back it up.');
    }

    function write(next) {
      try {
        backend.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        throw new CalendarMetadataError('backend_error',
          'Could not save calendar metadata: ' + error.message);
      }
      state = next;
      status = { ok: true, reason: 'written' };
      return clone(next);
    }

    function requireDate(date) {
      if (!isIsoDate(date)) {
        throw new CalendarMetadataError('invalid_date', 'Not a valid ISO date: ' + String(date));
      }
      return date;
    }

    function requireText(text) {
      if (typeof text !== 'string') {
        throw new CalendarMetadataError('invalid_text', 'Text must be a string');
      }
      var trimmed = text.trim();
      if (!trimmed) {
        throw new CalendarMetadataError('empty_text', 'Text must not be empty');
      }
      return trimmed.slice(0, MAX_TEXT);
    }
    // ---- public API --------------------------------------------------------

    function listFor(date, kind) {
      requireDate(date);
      var bucket = current()[kind] || {};
      return clone(bucket[date] || []);
    }

    function getNotes(date) {
      return listFor(date, 'notes');
    }

    function getEvents(date) {
      return listFor(date, 'events');
    }

    // Optional time is validated leniently ("HH:MM" or "H:MM"); it is stored as
    // given (never silently shifted) because an event time is user-supplied.
    function normalizeTime(time) {
      if (time === null || time === undefined || time === '') return null;
      var value = String(time).trim();
      return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
    }

    function addEntry(kind, date, text, options2) {
      requireDate(date);
      var body = requireText(text);
      assertWritable();
      var next = clone(current());
      if (!isPlainObject(next[kind])) next[kind] = {};
      var list = Array.isArray(next[kind][date]) ? next[kind][date].slice() : [];
      var opts = options2 || {};
      var sequence = list.length;
      var entry = {
        id: stableId(kind === 'notes' ? 'note' : 'event', date, sequence, body),
        date: date,
        text: body,
        time: kind === 'events' ? normalizeTime(opts.time) : null,
        // createdAt is user-metadata bookkeeping, not planner/completion state.
        createdAt: typeof opts.createdAt === 'string' ? opts.createdAt : null
      };
      list.push(entry);
      next[kind][date] = list;
      write(next);
      return clone(entry);
    }

    function addNote(date, text, options2) {
      return addEntry('notes', date, text, options2);
    }

    function addEvent(date, text, options2) {
      return addEntry('events', date, text, options2);
    }

    function removeEntry(kind, date, id) {
      requireDate(date);
      assertWritable();
      var next = clone(current());
      var list = isPlainObject(next[kind]) && Array.isArray(next[kind][date])
        ? next[kind][date].slice() : [];
      var kept = list.filter(function (item) { return item.id !== id; });
      var removed = list.length - kept.length;
      if (!removed) return false;
      if (kept.length) next[kind][date] = kept;
      else delete next[kind][date];
      write(next);
      return true;
    }

    function removeNote(date, id) {
      return removeEntry('notes', date, id);
    }

    function removeEvent(date, id) {
      return removeEntry('events', date, id);
    }

    function counts() {
      var doc = current();
      var totals = { notes: 0, events: 0 };
      ['notes', 'events'].forEach(function (kind) {
        Object.keys(doc[kind] || {}).forEach(function (date) {
          totals[kind] += doc[kind][date].length;
        });
      });
      return totals;
    }

    function getDiagnostics() {
      if (status === null) load();
      return {
        ok: !!(status && status.ok),
        backend: backendKind,
        persistent: persistent(),
        key: STORAGE_KEY,
        reason: status ? status.reason : 'unknown',
        errors: status && status.errors ? status.errors.slice() : [],
        counts: counts()
      };
    }

    function getRawState() {
      return readRaw();
    }

    function reset() {
      state = emptyState();
      try {
        backend.removeItem(STORAGE_KEY);
      } catch (error) {
        throw new CalendarMetadataError('backend_error',
          'Could not clear calendar metadata: ' + error.message);
      }
      status = { ok: true, reason: 'reset' };
      return api;
    }

    var api = {
      STORAGE_KEY: STORAGE_KEY,
      SCHEMA_VERSION: SCHEMA_VERSION,
      isIsoDate: isIsoDate,
      getNotes: getNotes,
      getEvents: getEvents,
      addNote: addNote,
      addEvent: addEvent,
      removeNote: removeNote,
      removeEvent: removeEvent,
      counts: counts,
      getDiagnostics: getDiagnostics,
      getRawState: getRawState,
      persistent: persistent,
      reset: reset,
      CalendarMetadataError: CalendarMetadataError
    };
    return api;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    isIsoDate: isIsoDate,
    createCalendarMetadata: createCalendarMetadata,
    // Exposed for tests (and any non-localStorage environment), mirroring
    // storage.js which exposes its own createMemoryBackend.
    createMemoryBackend: createMemoryBackend,
    CalendarMetadataError: CalendarMetadataError
  };
});