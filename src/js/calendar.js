/**
 * src/js/calendar.js — Study-Planner Phase 4 (calendar date model)
 *
 * Pure, DOM-free date + grid helpers shared by Month View, Week View and the
 * Daily Tracker. There is exactly one date identity in the application:
 * the ISO string "YYYY-MM-DD". Month View and Week View both resolve to it.
 *
 * U1 ADDITION - canonical calendar access. createCalendarAccess(doc) indexes a
 * parsed data/calendar/calendar-2026.json document and exposes study-cycle
 * metadata (study week, study day, graded/practice markers, notes/events slots).
 * It adds NO planning logic and NO completion state: it only answers
 * "what date is this?" and "what study-cycle metadata does the canonical data
 * give it?". Study weeks are Friday -> Thursday, taken from the document, not
 * computed here. buildWeekDates() below remains ordinary Sunday -> Saturday
 * calendar-week logic, unchanged, for ordinary calendar display.
 *
 * Environment: browser global (globalThis.StudyPlanner.Calendar) or CommonJS.
 * No dependencies. No DOM access. Fully deterministic (UTC-only math).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.Calendar = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad2(value) {
    return (value < 10 ? '0' : '') + value;
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function isValidIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var day = parts[2];
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= daysInMonth(year, month);
  }

  function parseIso(date) {
    if (!isValidIsoDate(date)) throw new Error('Not a valid ISO date: ' + String(date));
    var parts = date.split('-').map(Number);
    return { year: parts[0], month: parts[1], day: parts[2] };
  }

  function isoDate(year, month, day) {
    return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day);
  }

  function timestamp(iso) {
    return Date.parse(iso + 'T00:00:00Z');
  }

  function addDays(date, offset) {
    parseIso(date);
    return new Date(timestamp(date) + offset * 86400000).toISOString().slice(0, 10);
  }

  function addWeeks(date, offset) {
    return addDays(date, offset * 7);
  }

  function weekdayIndex(date) {
    return new Date(timestamp(date)).getUTCDay();
  }

  function weekdayShort(date) {
    return WEEKDAY_SHORT[weekdayIndex(date)];
  }

  function weekdayLong(date) {
    return WEEKDAY_LONG[weekdayIndex(date)];
  }

  function monthName(month) {
    if (month < 1 || month > 12) throw new Error('Month must be 1-12: ' + month);
    return MONTH_NAMES[month - 1];
  }

  function monthTitle(year, month) {
    return monthName(month) + ' ' + year;
  }

  // { year, month, title, weekdays, weeks: [[cell|null x7] ...] }
  // Weeks run Sunday -> Saturday (matching the month-grid header row).
  function buildMonthGrid(year, month) {
    var firstDayIndex = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    var total = daysInMonth(year, month);
    var weeks = [];
    var row = [];
    var i;
    for (i = 0; i < firstDayIndex; i++) row.push(null);
    for (var day = 1; day <= total; day++) {
      var date = isoDate(year, month, day);
      row.push({ date: date, day: day, weekday: weekdayIndex(date) });
      if (row.length === 7) { weeks.push(row); row = []; }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push(null);
      weeks.push(row);
    }
    return {
      year: year,
      month: month,
      title: monthTitle(year, month),
      weekdays: WEEKDAY_SHORT.slice(),
      weeks: weeks
    };
  }

  function addMonths(year, month, delta) {
    var zeroBased = (year * 12) + (month - 1) + delta;
    return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
  }

  // The Sunday->Saturday week containing the anchor date.
  function buildWeekDates(anchorDate) {
    var start = addDays(anchorDate, -weekdayIndex(anchorDate));
    var dates = [];
    for (var i = 0; i < 7; i++) dates.push(addDays(start, i));
    return dates;
  }

  function formatDateParts(date) {
    var parts = parseIso(date);
    return {
      weekdayLong: weekdayLong(date),
      weekdayShort: weekdayShort(date),
      day: parts.day,
      monthName: monthName(parts.month),
      year: parts.year,
      month: parts.month,
      text: parts.day + ' ' + monthName(parts.month) + ' ' + parts.year
    };
  }

  function formatLongDate(date) {
    return formatDateParts(date).text;
  }

  function formatWeekRangeLabel(anchorDate) {
    var dates = buildWeekDates(anchorDate);
    var start = formatDateParts(dates[0]);
    var end = formatDateParts(dates[6]);
    if (start.month === end.month && start.year === end.year) {
      return start.day + ' – ' + end.day + ' ' + end.monthName + ' ' + end.year;
    }
    if (start.year === end.year) {
      return start.day + ' ' + start.monthName + ' – ' + end.day + ' ' + end.monthName + ' ' + end.year;
    }
    return start.text + ' – ' + end.text;
  }

  function CalendarDataError(code, message) {
    var err = Error.call(this, message);
    this.name = 'CalendarDataError';
    this.code = code;
    this.message = message;
    if (err.stack) this.stack = err.stack;
  }
  CalendarDataError.prototype = Object.create(Error.prototype);
  CalendarDataError.prototype.constructor = CalendarDataError;

// --- Study-week semantics (U1, additive) ---------------------------------
  //
  // buildWeekDates() above is ORDINARY calendar-week logic (Sunday -> Saturday)
  // and is deliberately left unchanged: existing Month/Week view callers depend
  // on it and it stays correct for ordinary calendar display.
  //
  // The Study Planner runs on a DIFFERENT canonical cycle: study weeks run
  // Friday -> Thursday. That definition lives in the canonical calendar data
  // (data/calendar/calendar-2026.json), never as arithmetic in this file.
  //
  // The access layer below lets Calendar/Reports code ask the canonical data for
  // study-week dates. It reimplements no planning rule, loads no file by itself,
  // and touches no DOM - the caller hands in the parsed document.

  function createCalendarAccess(doc) {
    if (!doc || !Array.isArray(doc.months) || doc.months.length === 0) {
      throw new CalendarDataError('invalid_document',
        'Calendar document must contain a non-empty "months" array');
    }
    var byDate = {};
    var monthByNumber = {};
    var order = [];
    doc.months.forEach(function (month) {
      if (!month || typeof month.month !== 'number' || !Array.isArray(month.dates)) {
        throw new CalendarDataError('invalid_month',
          'Each month must have a numeric "month" and a "dates" array');
      }
      monthByNumber[month.month] = month;
      month.dates.forEach(function (record) {
        if (!record || !isValidIsoDate(record.date)) {
          throw new CalendarDataError('invalid_date',
            'Invalid or missing date in month ' + month.month);
        }
        if (byDate[record.date]) {
          throw new CalendarDataError('duplicate_date',
            'Duplicate date in calendar document: ' + record.date);
        }
        byDate[record.date] = record;
        order.push(record.date);
      });
    });

    var cycle = doc.studyCycle || {};
    var weeksByNumber = {};
    (Array.isArray(cycle.weeks) ? cycle.weeks : []).forEach(function (week) {
      if (week && typeof week.weekNumber === 'number') weeksByNumber[week.weekNumber] = week;
    });

    return {
      document: doc,
      year: doc.year,
      byDate: byDate,
      monthByNumber: monthByNumber,
      orderedDates: order,
      weeksByNumber: weeksByNumber,

      getDate: function (date) {
        return Object.prototype.hasOwnProperty.call(byDate, date) ? byDate[date] : null;
      },
      hasDate: function (date) {
        return Object.prototype.hasOwnProperty.call(byDate, date);
      },
      getMonth: function (month) {
        return monthByNumber[month] || null;
      },
      getMonthDates: function (month) {
        var found = monthByNumber[month];
        return found ? found.dates.slice() : [];
      },

      isActiveStudyDate: function (date) {
        var record = this.getDate(date);
        return !!(record && record.isStudyCycleActive === true);
      },
      getStudyMetadata: function (date) {
        var record = this.getDate(date);
        if (!record || record.isStudyCycleActive !== true) return null;
        return {
          date: record.date,
          studyWeek: record.studyWeek,
          studyDay: record.studyDay,
          cycleDay: record.cycleDay,
          isStudyWeekStart: record.isStudyWeekStart === true,
          isStudyWeekEnd: record.isStudyWeekEnd === true,
          isGradedDay: record.isGradedDay === true,
          isPracticeDay: record.isPracticeDay === true,
          special: record.special === undefined ? null : record.special,
          specialLabel: record.specialLabel === undefined ? null : record.specialLabel
        };
      },
      getStudyWeekDates: function (weekNumber) {
        var week = weeksByNumber[weekNumber];
        if (!week) return [];
        return order.filter(function (date) {
          var record = byDate[date];
          return record && record.isStudyCycleActive === true &&
            record.studyWeek === weekNumber;
        });
      },
      getStudyWeek: function (weekNumber) {
        return weeksByNumber[weekNumber] || null;
      },
      getStudyWeeks: function () {
        return Object.keys(weeksByNumber).map(Number)
          .sort(function (a, b) { return a - b; })
          .map(function (n) { return weeksByNumber[n]; });
      },
      getStudyWeekForDate: function (date) {
        var record = this.getDate(date);
        if (!record || record.isStudyCycleActive !== true) return null;
        return weeksByNumber[record.studyWeek] || null;
      },
      getAdjacentStudyWeek: function (weekNumber, delta) {
        var weeks = this.getStudyWeeks();
        if (!weeks.length) return null;
        var index = -1;
        weeks.forEach(function (w, i) { if (w.weekNumber === weekNumber) index = i; });
        if (index === -1) return null;
        var target = index + (delta || 0);
        if (target < 0 || target >= weeks.length) return null;
        return weeks[target];
      },
      getActiveStudyDates: function () {
        return order.filter(function (date) {
          return byDate[date].isStudyCycleActive === true;
        });
      },
      getGradedDates: function () {
        return order.filter(function (date) {
          return byDate[date].isGradedDay === true;
        });
      },
      isGradedDate: function (date) {
        var record = this.getDate(date);
        return !!(record && record.isGradedDay === true);
      }
    };
  }

  return {
    MONTH_NAMES: MONTH_NAMES,
    WEEKDAY_SHORT: WEEKDAY_SHORT,
    WEEKDAY_LONG: WEEKDAY_LONG,
    // Canonical calendar data source (U1). Relative to the repository root;
    // data-engine/app resolve it against the configured data base.
    CALENDAR_FILE: 'data/calendar/calendar-2026.json',
    isValidIsoDate: isValidIsoDate,
    parseIso: parseIso,
    isoDate: isoDate,
    daysInMonth: daysInMonth,
    addDays: addDays,
    addWeeks: addWeeks,
    weekdayIndex: weekdayIndex,
    weekdayShort: weekdayShort,
    weekdayLong: weekdayLong,
    monthName: monthName,
    monthTitle: monthTitle,
    buildMonthGrid: buildMonthGrid,
    addMonths: addMonths,
    buildWeekDates: buildWeekDates,
    formatDateParts: formatDateParts,
    formatLongDate: formatLongDate,
    formatWeekRangeLabel: formatWeekRangeLabel,
    // U1 canonical-calendar access layer.
    CalendarDataError: CalendarDataError,
    createCalendarAccess: createCalendarAccess
  };
});
