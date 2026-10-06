/**
 * src/components/calendar/calendar-context.js — Study-Planner U2
 *
 * Calendar view-model layer. Sits between the canonical calendar data (U1) and the
 * rendered Calendar, and owns NO storage and NO DOM:
 *
 *   canonical calendar JSON  ──►  CalendarContext  ──►  month-view / week-view /
 *                                       ▲              calendar-view  (rendering)
 *                          user notes/events ──────────┘  (read through an injected
 *                                                            metadata reader)
 *
 * Responsibilities:
 *   - resolve the Month or Week mode from the selected date, using canonical data
 *   - build the mode-specific header (month + year, or study week + year + range)
 *   - attach study-cycle metadata (week/day/graded/practice) to each day cell
 *   - attach lightweight user metadata counts (notes/events) per date
 *
 * Boundaries:
 *   - NO planner logic, NO progress calculation, NO completion state.
 *   - Every study-cycle fact comes from the canonical access layer; nothing about
 *     "which week is 8 October" is hardcoded here.
 *   - Notes/events arrive through an injected reader so this module never touches
 *     localStorage directly (calendar-metadata.js owns that).
 *
 * Environment: browser global (globalThis.StudyPlanner.CalendarContext) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Calendar: require('../../js/calendar.js'),
      Renderer: require('../../js/renderer.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.CalendarContext = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Calendar = ns.Calendar;
  var Renderer = ns.Renderer;
  if (!Calendar || !Renderer) throw new Error('CalendarContext requires Calendar and Renderer');

  var escapeHtml = Renderer.escapeHtml;

  // Concise, data-driven label for a special day. Derived from the canonical
  // record, never from a hardcoded date.
  function specialLabelFor(record) {
    if (!record) return null;
    if (record.special === 'graded') return 'Graded';
    if (record.special === 'practice') return 'Practice';
    if (record.special === 'study-week-start') return 'Week start';
    return null;
  }

  function escapeHtmlSafe(value) {
    return escapeHtml(value === null || value === undefined ? '' : value);
  }

  // Count of user notes/events for a date, via the injected reader.
  function metaCountsFor(reader, date) {
    if (!reader) return { notes: 0, events: 0 };
    var notes = 0;
    var events = 0;
    try {
      notes = reader.getNotes(date).length;
      events = reader.getEvents(date).length;
    } catch (e) {
      // A metadata failure must never break the Calendar; degrade to empty.
      notes = 0;
      events = 0;
    }
    return { notes: notes, events: events };
  }
  // -------------------------------------------------------------------------
  // Month mode
  // -------------------------------------------------------------------------

  // Month header: calendar month + year, e.g. "October 2026".
  function monthHeader(year, month) {
    return {
      primary: Calendar.monthTitle(year, month),
      secondary: null
    };
  }

  // -------------------------------------------------------------------------
  // Week mode (Study Planner study weeks, Friday -> Thursday)
  // -------------------------------------------------------------------------

  // The study week containing a date, per canonical data.
  function studyWeekFor(access, date) {
    return access ? access.getStudyWeekForDate(date) : null;
  }

  // Week header from canonical data, e.g. "Oct Week 1 - 2026" + "Oct 2 - Oct 8".
  function weekHeader(access, date) {
    var week = studyWeekFor(access, date);
    if (!week) {
      // Outside the active cycle: neutral wording that does NOT invent a study week.
      var parts = Calendar.parseIso(date);
      var record = access ? access.getDate(date) : null;
      var label = record ? 'Outside study cycle' : 'Study week unavailable';
      return {
        primary: Calendar.monthName(parts.month).slice(0, 3) + ' ' + parts.year,
        secondary: label,
        weekNumber: null,
        startDate: null,
        endDate: null,
        inCycle: false
      };
    }
    var startParts = Calendar.parseIso(week.startDate);
    var endParts = Calendar.parseIso(week.endDate);
    var range = Calendar.monthName(startParts.month).slice(0, 3) + ' ' + startParts.day +
      ' - ' + Calendar.monthName(endParts.month).slice(0, 3) + ' ' + endParts.day;
    return {
      primary: Calendar.monthName(startParts.month).slice(0, 3) + ' Week ' + week.weekNumber + ' - ' + startParts.year,
      secondary: range,
      weekNumber: week.weekNumber,
      startDate: week.startDate,
      endDate: week.endDate,
      inCycle: true
    };
  }

  // -------------------------------------------------------------------------
  // Header dispatch
  // -------------------------------------------------------------------------

  function buildHeader(access, mode, options2) {
    var opts = options2 || {};
    var date = opts.selectedDate;
    if (mode === 'week') {
      var week = weekHeader(access, date);
      return {
        mode: 'week',
        title: week.primary,
        subtitle: week.secondary,
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
        inCycle: week.inCycle
      };
    }
    var month = monthHeader(opts.year, opts.month);
    return {
      mode: 'month',
      title: month.primary,
      subtitle: month.secondary,
      weekNumber: null,
      startDate: null,
      endDate: null,
      inCycle: null
    };
  }

  // -------------------------------------------------------------------------
  // Cell metadata (study-cycle + user meta, all data-driven)
  // -------------------------------------------------------------------------

  // Build a metadata descriptor for one date, purely from canonical data + the
  // injected user-metadata reader.
  function cellMetadata(access, date, reader) {
    var record = access ? access.getDate(date) : null;
    var active = !!(record && record.isStudyCycleActive === true);
    var counts = metaCountsFor(reader, date);
    return {
      date: date,
      isActive: active,
      studyWeek: active ? record.studyWeek : null,
      studyDay: active ? record.studyDay : null,
      cycleDay: active ? record.cycleDay : null,
      isGradedDay: active ? record.isGradedDay === true : false,
      isPracticeDay: active ? record.isPracticeDay === true : false,
      isStudyWeekStart: active ? record.isStudyWeekStart === true : false,
      specialLabel: active ? specialLabelFor(record) : null,
      notesCount: counts.notes,
      eventsCount: counts.events
    };
  }

  // The selected-date detail panel model.
  function buildDateContext(access, date, reader, options2) {
    var opts = options2 || {};
    var record = access ? access.getDate(date) : null;
    var meta = cellMetadata(access, date, reader);
    var weekday = Calendar.weekdayLong(date);
    var notes = [];
    var events = [];
    if (reader) {
      try {
        notes = reader.getNotes(date);
        events = reader.getEvents(date);
      } catch (e) {
        notes = [];
        events = [];
      }
    }
    return {
      date: date,
      heading: Calendar.formatLongDate(date),
      weekday: weekday,
      isActive: meta.isActive,
      studyWeek: meta.studyWeek,
      studyDay: meta.studyDay,
      cycleDay: meta.cycleDay,
      specialLabel: meta.specialLabel,
      isGradedDay: meta.isGradedDay,
      isPracticeDay: meta.isPracticeDay,
      notes: notes,
      events: events,
      notesCount: notes.length,
      eventsCount: events.length,
      hasPlan: opts.hasPlan === true
    };
  }

  return {
    specialLabelFor: specialLabelFor,
    monthHeader: monthHeader,
    weekHeader: weekHeader,
    buildHeader: buildHeader,
    cellMetadata: cellMetadata,
    buildDateContext: buildDateContext,
    studyWeekFor: studyWeekFor
  };
});