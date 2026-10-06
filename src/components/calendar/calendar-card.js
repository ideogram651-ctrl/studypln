/**
 * src/components/calendar/calendar-card.js — Study-Planner U2.1
 *
 * The reference Calendar (reference/Reference-Calendar-Project/) integrated with
 * the existing Study-Planner data architecture.
 *
 * Structure mirrors the reference index.html 1:1:
 *   .calendar-card
 *     .dummy-month-nav  (‹  label  ›)
 *     .card-top > .segmented  (Weekly | Monthly)
 *     .hero-date  (.month-name / .day-number)
 *     .weekly-area  (.curve + .week-viewport > .week-track > .week-day)
 *     .monthly-area (.month-grid > .grid-head / .grid-cell)
 *     .bottom-row  (.note / .event-pill)
 *
 * DATA (existing authority, nothing duplicated here):
 *   - dates + study-week context come from the U1 canonical calendar access layer
 *   - the selected date is the existing application selected date
 *   - notes/events come from the existing calendar-metadata store, passed in
 *
 * U2.1 deliberately shows NO W/D labels, no graded/practice badges, no cycle-day and
 * no daily-plan text inside cells. The data still exists in the canonical file.
 *
 * Environment: browser global (globalThis.StudyPlanner.CalendarCard) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Calendar: require('../../js/calendar.js'),
      Renderer: require('../../js/renderer.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.CalendarCard = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Calendar = ns.Calendar;
  var Renderer = ns.Renderer;
  if (!Calendar || !Renderer) throw new Error('CalendarCard requires Calendar and Renderer');
  var escapeHtml = Renderer.escapeHtml;

  // Number of dates rendered either side of the selected date on the wheel.
  // The reference renders a whole month; the wheel stays continuous either way.
  var WHEEL_RADIUS = 40;

  // ---- period label -------------------------------------------------------
  // Weekly: derived Study Week from the canonical data. A date outside the cycle
  // (e.g. 1 October) falls back to plain calendar context — never "Week 0".
  function periodLabel(access, options2) {
    var opts = options2 || {};
    var mode = opts.mode === 'month' ? 'month' : 'week';
    if (mode === 'month') {
      return Calendar.monthTitle(opts.year, opts.month);
    }
    var week = access ? access.getStudyWeekForDate(opts.selectedDate) : null;
    if (week) {
      var startParts = Calendar.parseIso(week.startDate);
      return Calendar.monthName(startParts.month).slice(0, 3) +
        ' Week ' + week.weekNumber + ' - ' + startParts.year;
    }
    // Outside the active cycle: normal calendar context, no fake study week.
    var parts = Calendar.parseIso(opts.selectedDate);
    return Calendar.monthName(parts.month) + ' ' + parts.year;
  }

  // ---- U2.2-008: primary special-day dot ----------------------------------
  // ONE primary status dot under every Weekly date, coloured from the EXISTING
  // canonical special-day metadata — never hardcoded per date, no legend, no
  // labels. Normal / outside-cycle days are purple; the canonical special
  // values map to green / yellow / red.
  function primaryDotClass(record) {
    var cls = 'wheel-dot wheel-primary-dot';
    if (record) {
      if (record.special === 'study-week-start') cls += ' is-week-start';
      else if (record.special === 'practice') cls += ' is-practice';   // Day 6
      else if (record.special === 'graded') cls += ' is-graded';       // Day 7 / week end
    }
    return cls;
  }

  function hasEntries(map, date) {
    return !!(map && map[date] && map[date].length);
  }

  // ---- weekly date wheel --------------------------------------------------
  // A continuous run of canonical dates centred on the selected date. It is NOT
  // limited to one Study Week, so Oct 8 -> Oct 9 moves naturally.
  function wheelDates(access, selectedDate) {
    var dates = [];
    if (!access) return dates;
    var ordered = access.orderedDates;
    var index = ordered.indexOf(selectedDate);
    if (index === -1) {
      // Selected date is not in the calendar year: fall back to a safe window.
      index = 0;
    }
    var start = Math.max(0, index - WHEEL_RADIUS);
    var end = Math.min(ordered.length - 1, index + WHEEL_RADIUS);
    for (var i = start; i <= end; i++) dates.push(ordered[i]);
    return dates;
  }

  function renderWheelHTML(access, selectedDate, notesByDate, eventsByDate) {
    var dates = wheelDates(access, selectedDate);
    var html = '<div class="weekly-area" data-area="weekly">';
    html += '<div class="curve"></div>';
    html += '<div class="week-viewport" id="weekViewport">';
    html += '<div class="week-track" id="weekTrack">';
    dates.forEach(function (date) {
      var record = access.getDate(date);
      var parts = Calendar.parseIso(date);
      var active = date === selectedDate;
      var cls = 'week-day' + (active ? ' active' : '');
      html += '<div class="' + cls + '" data-date="' + date + '" data-action="select-date"' +
        ' role="button" tabindex="0"' +
        ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeHtml(Calendar.formatLongDate(date)) + '">';
      html += '<div class="weekday">' + escapeHtml(Calendar.weekdayShort(date)) + '</div>';
      html += '<div class="date-circle">' + escapeHtml(String(parts.day)) + '</div>';
      // Dots: exactly ONE primary status dot (canonical metadata) for every
      // date, plus an OPTIONAL smaller secondary EVENT dot beneath it. The
      // event dot never replaces or recolors the primary dot (U2.2-008 +
      // secondary event dot). The U2.1 note marker, when present, follows.
      html += '<span class="wheel-dots">';
      html += '<span class="' + primaryDotClass(record) + '" aria-hidden="true"></span>';
      if (hasEntries(eventsByDate, date)) {
        html += '<span class="wheel-dot is-event" aria-hidden="true"></span>';
      }
      if (hasEntries(notesByDate, date)) {
        html += '<span class="wheel-dot is-note" aria-hidden="true"></span>';
      }
      html += '</span>';
      html += '</div>';
    });
    html += '</div></div></div>';
    return html;
  }

  // ---- monthly grid -------------------------------------------------------
  // Minimal 7-column grid of a real calendar month. No study metadata labels.
  function renderMonthlyHTML(access, selectedDate, options2) {
    var opts = options2 || {};
    var month = access ? access.getMonth(opts.month) : null;
    var dates = month ? month.dates : [];
    var firstWeekday = dates.length ? Calendar.weekdayIndex(dates[0].date) : 0;

    var html = '<div class="monthly-area visible" data-area="monthly">';
    html += '<div class="month-grid">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (name) {
      html += '<div class="grid-head">' + name + '</div>';
    });
    for (var i = 0; i < firstWeekday; i++) {
      html += '<div class="grid-cell empty"></div>';
    }
    dates.forEach(function (record) {
      var date = record.date;
      var selected = date === selectedDate;
      html += '<div class="grid-cell' + (selected ? ' selected' : '') + '"' +
        ' data-date="' + date + '" data-action="select-date"' +
        ' role="button" tabindex="0" aria-pressed="' + (selected ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeHtml(Calendar.formatLongDate(date)) + '">' +
        escapeHtml(String(record.day)) + '</div>';
    });
    html += '</div></div>';
    return html;
  }

  // ---- bottom row ---------------------------------------------------------
  // Reference composition: "Add a note..." left, "+ New Event" right.
  // Saved notes/events render directly ABOVE their own control, compactly.
  function renderEntryChips(items, kind) {
    if (!items.length) return '';
    var html = '<div class="entry-chips">';
    items.forEach(function (item) {
      html += '<div class="entry-chip"><span class="entry-text">' +
        (item.time ? '<span class="entry-time">' + escapeHtml(item.time) + '</span>' : '') +
        escapeHtml(item.text) + '</span>' +
        '<button type="button" class="entry-remove" data-action="remove-' + kind + '"' +
        ' data-date="' + escapeHtml(item.date) + '"' +
        ' data-entry-id="' + escapeHtml(item.id) + '"' +
        ' aria-label="Delete ' + kind + '">&times;</button></div>';
    });
    html += '</div>';
    return html;
  }

  function renderBottomRowHTML(selectedDate, notes, events) {
    var html = '<div class="bottom-row">';
    html += '<div class="bottom-item bottom-note">';
    html += renderEntryChips(notes || [], 'note');
    html += '<button type="button" class="note" data-action="add-note" data-date="' +
      escapeHtml(selectedDate) + '">';
    html += '<span class="note-icon"></span><span>Add a note...</span>';
    html += '</button>';
    html += '</div>';
    html += '<div class="bottom-item bottom-event">';
    html += renderEntryChips(events || [], 'event');
    html += '<button type="button" class="event-pill" data-action="add-event" data-date="' +
      escapeHtml(selectedDate) + '"><span class="plus">+</span><span>New Event</span></button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ---- full card ----------------------------------------------------------
  function renderCardHTML(options2) {
    var opts = options2 || {};
    var access = opts.access || null;
    var selectedDate = opts.selectedDate;
    var isMonth = opts.mode === 'month';
    var notesByDate = opts.notesByDate || {};
    var eventsByDate = opts.eventsByDate || {};

    var html = '<section class="calendar-card' + (isMonth ? ' monthly' : '') + '" id="calendarCard">';

    // Top navigation: study-week context (weekly) or month context (monthly).
    html += '<div class="dummy-month-nav">';
    html += '<button type="button" class="dummy-nav-btn" data-action="previous"' +
      ' aria-label="' + (isMonth ? 'Previous month' : 'Previous study week') + '">&#8249;</button>';
    html += '<span class="dummy-month-label" id="periodLabel">' +
      escapeHtml(periodLabel(access, { mode: opts.mode, selectedDate: selectedDate,
        year: opts.year, month: opts.month })) + '</span>';
    html += '<button type="button" class="dummy-nav-btn" data-action="next"' +
      ' aria-label="' + (isMonth ? 'Next month' : 'Next study week') + '">&#8250;</button>';
    html += '</div>';

    // Segmented control — Weekly first (reference order), Weekly default.
    html += '<div class="card-top"><div class="segmented" role="group" aria-label="Calendar view">';
    html += '<button type="button" class="segmented-button' + (!isMonth ? ' active' : '') +
      '" data-action="view-week" aria-pressed="' + (!isMonth) + '">Weekly</button>';
    html += '<button type="button" class="segmented-button' + (isMonth ? ' active' : '') +
      '" data-action="view-month" aria-pressed="' + (isMonth) + '">Monthly</button>';
    html += '</div></div>';

    // Hero date — driven by the existing selected date.
    var selectedParts = Calendar.parseIso(selectedDate);
    html += '<div class="hero-date">';
    html += '<div class="month-name">' + escapeHtml(Calendar.monthName(selectedParts.month)) + '</div>';
    html += '<div class="day-number" id="heroDay">' + escapeHtml(String(selectedParts.day)) + '</div>';
    html += '</div>';

    if (isMonth) {
      html += renderMonthlyHTML(access, selectedDate, { month: opts.month });
    } else {
      html += renderWheelHTML(access, selectedDate, notesByDate, eventsByDate);
    }

    html += renderBottomRowHTML(selectedDate, opts.notes, opts.events);
    html += '</section>';
    return html;
  }

  function renderUnavailableHTML(message) {
    return '<section class="calendar-card is-unavailable" id="calendarCard">' +
      '<div class="empty-state"><h1>Calendar data unavailable</h1>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<p class="empty-state-date">Study plans, progress and reports are unaffected.</p>' +
      '</div></section>';
  }

  return {
    WHEEL_RADIUS: WHEEL_RADIUS,
    periodLabel: periodLabel,
    primaryDotClass: primaryDotClass,
    wheelDates: wheelDates,
    renderWheelHTML: renderWheelHTML,
    renderMonthlyHTML: renderMonthlyHTML,
    renderBottomRowHTML: renderBottomRowHTML,
    renderEntryChips: renderEntryChips,
    renderCardHTML: renderCardHTML,
    renderUnavailableHTML: renderUnavailableHTML
  };
});
