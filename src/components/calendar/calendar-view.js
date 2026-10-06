/**
 * src/components/calendar/calendar-view.js — Study-Planner Phase 4
 *
 * Calendar coordinator: combines the toolbar (month/week toggle, previous /
 * next navigation) with the active grid (Month View or Week View). Pure
 * functions producing an HTML string view model — the app owns state, actions
 * and event wiring; this component only renders what it is given.
 *
 * Environment: browser global (globalThis.StudyPlanner.CalendarView) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      MonthView: require('./month-view.js'),
      WeekView: require('./week-view.js'),
      CalendarContext: require('./calendar-context.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.CalendarView = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var MonthView = ns.MonthView;
  var WeekView = ns.WeekView;
  var CalendarContext = ns.CalendarContext;
  if (!Renderer || !MonthView || !WeekView || !CalendarContext) {
    throw new Error('CalendarView requires Renderer, MonthView, WeekView and CalendarContext');
  }
  var escapeHtml = Renderer.escapeHtml;

  function buildCalendarViewModel(options) {
    var opts = options || {};
    var isWeek = opts.view === 'week';
    var model = isWeek
      ? WeekView.buildWeekModel(opts)
      : MonthView.buildMonthModel(opts);
    return {
      view: isWeek ? 'week' : 'month',
      isMonth: !isWeek,
      isWeek: isWeek,
      title: model.title,
      selectedDate: opts.selectedDate,
      body: isWeek ? WeekView.renderWeekHTML(model) : MonthView.renderMonthHTML(model)
    };
  }

  function renderCalendarHTML(viewModel) {
    var navLabel = viewModel.isWeek ? 'week' : 'month';
    var html = '<div class="calendar">';
    html += '<div class="calendar-toolbar">';
    html += '<div class="calendar-nav">';
    html += '<button type="button" class="icon-button" data-action="previous" aria-label="Previous ' + navLabel + '">&#8249;</button>';
    html += '<h2 class="calendar-title">' + Renderer.escapeHtml(viewModel.title) + '</h2>';
    html += '<button type="button" class="icon-button" data-action="next" aria-label="Next ' + navLabel + '">&#8250;</button>';
    html += '</div>';
    html += '<div class="segmented" role="group" aria-label="Calendar view">';
    html += '<button type="button" class="segmented-button' + (viewModel.isMonth ? ' is-active' : '') +
      '" data-action="view-month" aria-pressed="' + viewModel.isMonth + '">Monthly</button>';
    html += '<button type="button" class="segmented-button' + (viewModel.isWeek ? ' is-active' : '') +
      '" data-action="view-week" aria-pressed="' + viewModel.isWeek + '">Weekly</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="calendar-body">' + viewModel.body + '</div>';
    html += '<p class="calendar-hint">Click a date to select it. Double-click a date — or select it and press Enter — to open its daily tracker.</p>';
    html += '</div>';
    return html;
  }

  // U2: mode-aware view model (canonical calendar)
  // ---------------------------------------------------------------------------

  // Chooses the study-week strip in Weekly mode and the normal month grid in
  // Monthly mode. Weekly NEVER falls back to buildWeekDates().
  function buildModeViewModel(options) {
    var opts = options || {};
    var isWeek = opts.view === 'week';
    var header = CalendarContext.buildHeader(opts.access, isWeek ? 'week' : 'month', {
      selectedDate: opts.selectedDate,
      year: opts.year,
      month: opts.month
    });
    var body;
    if (isWeek) {
      var weekModel = WeekView.buildStudyWeekModel(opts);
      body = WeekView.renderStudyWeekHTML(weekModel);
      header.bodyModel = weekModel;
    } else {
      var monthModel = MonthView.buildMonthModelWithMeta(opts);
      body = MonthView.renderMonthHTMLWithMeta(monthModel);
      header.bodyModel = monthModel;
    }
    return {
      view: isWeek ? 'week' : 'month',
      isMonth: !isWeek,
      isWeek: isWeek,
      title: header.title,
      subtitle: header.subtitle,
      header: header,
      selectedDate: opts.selectedDate,
      body: body
    };
  }

  // The selected-date context panel: full date, study-week/day, graded/practice
  // meaning, notes and events, plus the two lightweight actions.
  function renderDateContextHTML(context, options2) {
    if (!context) return '';
    var opts = options2 || {};
    var html = '<section class="cal-context" aria-label="Selected date details" data-context-date="' +
      escapeHtml(context.date) + '">';
    html += '<header class="cal-context-head">';
    html += '<h3 class="cal-context-date">' + escapeHtml(context.heading) + '</h3>';
    html += '<p class="cal-context-weekday">' + escapeHtml(context.weekday) + '</p>';
    html += '</header>';

    html += '<dl class="cal-context-meta">';
    if (context.isActive) {
      html += '<div class="cal-context-row"><dt>Study week</dt><dd>Week ' +
        escapeHtml(context.studyWeek) + '</dd></div>';
      html += '<div class="cal-context-row"><dt>Study day</dt><dd>Day ' +
        escapeHtml(context.studyDay) + '</dd></div>';
      if (context.cycleDay !== null) {
        html += '<div class="cal-context-row"><dt>Cycle day</dt><dd>' +
          escapeHtml(context.cycleDay) + ' of 28</dd></div>';
      }
      if (context.specialLabel) {
        var cls = context.isGradedDay ? 'is-graded' : (context.isPracticeDay ? 'is-practice' : 'is-week-start');
        html += '<div class="cal-context-row"><dt>Special</dt><dd><span class="day-badge ' +
          cls + '">' + escapeHtml(context.specialLabel) + '</span></dd></div>';
      }
    } else {
      html += '<div class="cal-context-row"><dt>Study cycle</dt><dd>Not part of the active cycle</dd></div>';
    }
    html += '<div class="cal-context-row"><dt>Daily plan</dt><dd>' +
      (context.hasPlan ? 'Available' : 'No plan for this date') + '</dd></div>';
    html += '</dl>';

    html += '<div class="cal-context-actions">';
    html += '<button type="button" class="ghost-button cal-action" data-action="add-note" data-date="' +
      escapeHtml(context.date) + '">Add a note</button>';
    html += '<button type="button" class="ghost-button cal-action" data-action="add-event" data-date="' +
      escapeHtml(context.date) + '">New event</button>';
    if (opts.openTrackerHref) {
      html += '<button type="button" class="ghost-button cal-action" data-action="navigate" data-hash="' +
        escapeHtml(opts.openTrackerHref) + '">Open daily tracker</button>';
    }
    html += '</div>';
    html += renderContextListsHTML(context);
    html += '</section>';
    return html;
  }

  // Notes / events lists rendered inside the selected-date context panel.
  function renderContextListsHTML(context) {
    var html = '';
    if (context.notes.length) {
      html += '<div class="cal-context-list"><h4 class="cal-context-subhead">Notes</h4><ul>';
      context.notes.forEach(function (note) {
        html += '<li class="cal-note-item"><span>' + escapeHtml(note.text) + '</span>' +
          '<button type="button" class="cal-remove" data-action="remove-note" data-date="' +
          escapeHtml(note.date) + '" data-entry-id="' + escapeHtml(note.id) +
          '" aria-label="Remove note">&times;</button></li>';
      });
      html += '</ul></div>';
    }
    if (context.events.length) {
      html += '<div class="cal-context-list"><h4 class="cal-context-subhead">Events</h4><ul>';
      context.events.forEach(function (event) {
        html += '<li class="cal-event-item"><span class="cal-event-time">' +
          (event.time ? escapeHtml(event.time) + ' ' : '') + escapeHtml(event.text) + '</span>' +
          '<button type="button" class="cal-remove" data-action="remove-event" data-date="' +
          escapeHtml(event.date) + '" data-entry-id="' + escapeHtml(event.id) +
          '" aria-label="Remove event">&times;</button></li>';
      });
      html += '</ul></div>';
    }
    html += '</section>';
    return html;
  }

  // U2 renderer: mode-specific header + toggle + body + selected-date context.
  function renderCalendarHTMLWithMeta(viewModel, options2) {
    var opts = options2 || {};
    var navLabel = viewModel.isWeek ? 'study week' : 'month';
    var html = '<div class="calendar">';
    html += '<div class="calendar-toolbar">';
    html += '<div class="calendar-nav">';
    html += '<button type="button" class="icon-button" data-action="previous" aria-label="Previous ' +
      navLabel + '">&lsaquo;</button>';
    html += '<div class="calendar-heading">';
    html += '<h2 class="calendar-title">' + escapeHtml(viewModel.title) + '</h2>';
    if (viewModel.subtitle) {
      html += '<p class="calendar-subtitle">' + escapeHtml(viewModel.subtitle) + '</p>';
    }
    html += '</div>';
    html += '<button type="button" class="icon-button" data-action="next" aria-label="Next ' +
      navLabel + '">&rsaquo;</button>';
    html += '</div>';
    html += '<div class="segmented" role="group" aria-label="Calendar view">';
    html += '<button type="button" class="segmented-button' + (viewModel.isMonth ? ' is-active' : '') +
      '" data-action="view-month" aria-pressed="' + (viewModel.isMonth ? 'true' : 'false') + '">Monthly</button>';
    html += '<button type="button" class="segmented-button' + (viewModel.isWeek ? ' is-active' : '') +
      '" data-action="view-week" aria-pressed="' + (viewModel.isWeek ? 'true' : 'false') + '">Weekly</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="calendar-body">' + viewModel.body + '</div>';
    if (opts.contextHtml) {
      html += '<div class="calendar-context-wrap">' + opts.contextHtml + '</div>';
    }
    html += '<p class="calendar-hint">Click a date to select it. Double-click a date — or select it and press Enter — to open its daily tracker.</p>';
    html += '</div>';
    return html;
  }

  // Non-destructive failure state: the app keeps working if canonical data is
  // missing, and no dates are fabricated.
  function renderCalendarUnavailableHTML(message) {
    return '<div class="calendar is-unavailable">' +
      '<div class="empty-state">' +
      '<h1>Calendar data unavailable</h1>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<p class="empty-state-date">The planner, tracker, progress and reports are unaffected.</p>' +
      '</div></div>';
  }

  return {
    buildCalendarViewModel: buildCalendarViewModel,
    renderCalendarHTML: renderCalendarHTML,
    // U2 canonical-calendar additions
    buildModeViewModel: buildModeViewModel,
    renderDateContextHTML: renderDateContextHTML,
    renderCalendarHTMLWithMeta: renderCalendarHTMLWithMeta,
    renderCalendarUnavailableHTML: renderCalendarUnavailableHTML
  };
});