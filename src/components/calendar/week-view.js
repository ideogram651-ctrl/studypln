/**
 * src/components/calendar/week-view.js — Study-Planner Phase 4
 *
 * Sunday->Saturday week strip sharing the exact same date identity, selection
 * state and plan status as Month View (day cells come from MonthView so the
 * semantics cannot drift). Pure functions, no DOM access.
 *
 * U2 (canonical calendar): buildStudyWeekModel()/renderStudyWeekHTML() add the
 * Study Planner STUDY-WEEK strip (Friday -> Thursday) sourced from the canonical
 * calendar access layer. The original buildWeekModel()/buildWeekDates() are
 * retained unchanged for ordinary calendar-week callers.
 *
 * Environment: browser global (globalThis.StudyPlanner.WeekView) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Calendar: require('../../js/calendar.js'),
      Renderer: require('../../js/renderer.js'),
      MonthView: require('./month-view.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.WeekView = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Calendar = ns.Calendar;
  var Renderer = ns.Renderer;
  var MonthView = ns.MonthView;
  if (!Calendar || !Renderer || !MonthView) {
    throw new Error('WeekView requires Calendar, Renderer and MonthView');
  }

  function buildWeekModel(options) {
    var opts = options || {};
    var dates = Calendar.buildWeekDates(opts.anchorDate);
    return {
      anchorDate: opts.anchorDate,
      title: Calendar.formatWeekRangeLabel(opts.anchorDate),
      days: dates.map(function (date) { return MonthView.buildDayCell(date, opts); })
    };
  }

  function renderWeekHTML(model) {
    var html = '<div class="week-view" role="group" aria-label="Week of ' +
      Renderer.escapeHtml(model.title) + '">';
    model.days.forEach(function (cell) {
      var classes = ['week-day-card'];
      if (!cell.hasPlan) classes.push('no-plan');
      if (cell.selected) classes.push('is-selected');
      if (cell.hasPlan) classes.push('plan-' + cell.progressState);
      html += '<button type="button" class="' + classes.join(' ') + '"' +
        ' data-date="' + cell.date + '" data-action="select-date"' +
        ' aria-pressed="' + (cell.selected ? 'true' : 'false') + '"' +
        ' aria-label="' + Renderer.escapeHtml(cell.ariaLabel) + '">';
      html += '<span class="week-weekday">' + cell.weekdayShort + '</span>';
      html += '<span class="day-number">' + cell.day + '</span>';
      if (cell.hasPlan) {
        html += MonthView.renderDayProgress(cell.percent);
        html += '<span class="week-status">' + cell.percent + '%</span>';
      } else {
        html += '<span class="week-status">No plan</span>';
      }
      html += '</button>';
    });
    html += '</div>';
    return html;
  }

  // U2: STUDY-WEEK strip (Friday -> Thursday) built from the CANONICAL calendar.
  //
  // This is the core U2 behaviour change: the Study Planner Weekly mode must NOT
  // use Calendar.buildWeekDates() (ordinary Sunday->Saturday). The dates come from
  // the canonical access layer's getStudyWeekDates(), so W1 is Oct 2 - Oct 8 and
  // never Sep 27 - Oct 3. buildWeekModel()/buildWeekDates() below are retained for
  // ordinary calendar-week callers and are untouched.
  function buildStudyWeekModel(options) {
    var opts = options || {};
    var access = opts.access || null;
    var weekNumber = opts.weekNumber;
    var dates = [];
    if (access && weekNumber) dates = access.getStudyWeekDates(weekNumber);
    // Never fabricate a week: an unknown week yields an empty strip.
    var week = access ? access.getStudyWeek(weekNumber) : null;
    var title = week
      ? (opts.title || (week.startDate + ' – ' + week.endDate))
      : (opts.title || 'No study week');
    return {
      anchorDate: opts.anchorDate,
      weekNumber: weekNumber || null,
      startDate: week ? week.startDate : null,
      endDate: week ? week.endDate : null,
      inCycle: !!week,
      title: title,
      days: dates.map(function (date) { return MonthView.buildDayCellWithMeta(date, opts); })
    };
  }

  function renderStudyWeekHTML(model) {
    var html = '<div class="week-view" role="group" aria-label="Study week ' +
      Renderer.escapeHtml(model.weekNumber === null ? 'unavailable' : model.weekNumber) +
      ' of the Study Planner cycle">';
    if (!model.days.length) {
      html += '<p class="week-empty">This date is outside the active study cycle. ' +
        'Switch to Monthly to browse the calendar year.</p></div>';
      return html;
    }
    model.days.forEach(function (cell) {
      var classes = ['week-day-card'];
      if (!cell.hasPlan) classes.push('no-plan');
      if (cell.selected) classes.push('is-selected');
      if (cell.hasPlan) classes.push('plan-' + cell.progressState);
      if (cell.isActive) classes.push('is-study-day');
      if (cell.isGradedDay) classes.push('is-graded-day');
      if (cell.isPracticeDay) classes.push('is-practice-day');
      html += '<button type="button" class="' + classes.join(' ') + '"' +
        ' data-date="' + cell.date + '" data-action="select-date"' +
        ' aria-pressed="' + (cell.selected ? 'true' : 'false') + '"' +
        ' aria-label="' + Renderer.escapeHtml(cell.ariaLabel) + '">';
      html += '<span class="week-weekday">' + cell.weekdayShort + '</span>';
      html += '<span class="day-number">' + cell.day + '</span>';
      if (cell.isActive) {
        html += '<span class="day-meta">D' + (cell.studyDay === null ? '' : cell.studyDay) + '</span>';
      }
      if (cell.specialLabel) {
        var cls = cell.isGradedDay ? 'is-graded' : (cell.isPracticeDay ? 'is-practice' : 'is-week-start');
        html += '<span class="day-badge ' + cls + '">' + Renderer.escapeHtml(cell.specialLabel) + '</span>';
      }
      if (cell.hasPlan) {
        html += MonthView.renderDayProgress(cell.percent);
        html += '<span class="week-status">' + cell.percent + '%</span>';
      } else {
        html += '<span class="week-status">No plan</span>';
      }
      html += '</button>';
    });
    html += '</div>';
    return html;
  }

  return {
    buildWeekModel: buildWeekModel,
    renderWeekHTML: renderWeekHTML,
    // U2 canonical study-week additions
    buildStudyWeekModel: buildStudyWeekModel,
    renderStudyWeekHTML: renderStudyWeekHTML
  };
});
