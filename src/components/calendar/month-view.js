/**
 * src/components/calendar/month-view.js — Study-Planner Phase 4
 *
 * Month grid view model + HTML. Also owns the shared "day cell" model used by
 * Week View (one date identity, one selection/plan-state semantics).
 *
 * U2 (canonical calendar): additive metadata-aware builders render study-cycle
 * metadata (week/day, graded/practice markers) and user note/event indicators on
 * each cell. Every study-cycle fact is supplied by the caller from the canonical
 * calendar data (U1) via calendar-context — nothing is hardcoded here, and the
 * original buildDayCell/renderMonthHTML remain unchanged for existing callers.
 *
 * Pure functions: no DOM access, no planner logic. Progress values arrive
 * pre-computed (progress engine) through the planStatus map provided by the app:
 *   planStatus = { 'YYYY-MM-DD': { hasPlan: true, percent: 0..100 } }
 *
 * Environment: browser global (globalThis.StudyPlanner.MonthView) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Calendar: require('../../js/calendar.js'),
      Renderer: require('../../js/renderer.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.MonthView = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Calendar = ns.Calendar;
  var Renderer = ns.Renderer;
  if (!Calendar || !Renderer) throw new Error('MonthView requires Calendar and Renderer');
  var escapeHtml = Renderer.escapeHtml;
  function escapeHtmlSafe(value) {
    return escapeHtml(value === null || value === undefined ? '' : value);
  }

  function normalizeStatus(status) {
    if (!status || status.hasPlan !== true) return { hasPlan: false, percent: null };
    var percent = typeof status.percent === 'number' && isFinite(status.percent)
      ? Math.min(100, Math.max(0, Math.round(status.percent)))
      : 0;
    return { hasPlan: true, percent: percent };
  }

  function progressState(percent) {
    if (percent >= 100) return 'complete';
    if (percent > 0) return 'partial';
    return 'none';
  }

  function buildDayCell(date, options) {
    var opts = options || {};
    var status = normalizeStatus(opts.planStatus ? opts.planStatus[date] : null);
    var parts = Calendar.formatDateParts(date);
    var aria = parts.text;
    aria += status.hasPlan ? ', study plan, ' + status.percent + '% complete' : ', no study plan';
    return {
      date: date,
      day: parts.day,
      weekdayShort: parts.weekdayShort,
      weekdayLong: parts.weekdayLong,
      selected: date === opts.selectedDate,
      hasPlan: status.hasPlan,
      percent: status.percent,
      progressState: status.hasPlan ? progressState(status.percent) : 'absent',
      ariaLabel: aria
    };
  }

  function renderDayProgress(percent) {
    return '<span class="day-progress" aria-hidden="true"><span class="day-progress-fill" style="width:' +
      percent + '%"></span></span>';
  }

  function renderDayCell(cell, baseClass) {
    var classes = [baseClass || 'day-cell'];
    if (!cell.hasPlan) classes.push('no-plan');
    if (cell.selected) classes.push('is-selected');
    if (cell.hasPlan) classes.push('plan-' + cell.progressState);
    var html = '<button type="button" class="' + classes.join(' ') + '"' +
      ' data-date="' + cell.date + '" data-action="select-date"' +
      ' aria-pressed="' + (cell.selected ? 'true' : 'false') + '"' +
      ' aria-label="' + Renderer.escapeHtml(cell.ariaLabel) + '">';
    html += '<span class="day-number">' + cell.day + '</span>';
    if (cell.hasPlan) html += renderDayProgress(cell.percent);
    html += '</button>';
    return html;
  }

  function renderEmptyCell() {
    return '<span class="day-cell is-empty" aria-hidden="true"></span>';
  }

  function buildMonthModel(options) {
    var opts = options || {};
    var grid = Calendar.buildMonthGrid(opts.year, opts.month);
    return {
      year: grid.year,
      month: grid.month,
      title: grid.title,
      weekdays: grid.weekdays,
      weeks: grid.weeks.map(function (row) {
        return row.map(function (cell) { return cell ? buildDayCell(cell.date, opts) : null; });
      })
    };
  }

  function renderMonthHTML(model) {
    var html = '<div class="month-view" role="group" aria-label="' +
      Renderer.escapeHtml(model.title) + '">';
    html += '<div class="month-weekdays" aria-hidden="true">';
    model.weekdays.forEach(function (name) { html += '<span class="month-weekday">' + name + '</span>'; });
    html += '</div>';
    model.weeks.forEach(function (row) {
      html += '<div class="month-week">';
      row.forEach(function (cell) {
        html += cell ? renderDayCell(cell, 'day-cell') : renderEmptyCell();
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // U2: enrich a day cell with canonical study-cycle metadata + user meta counts.
  // Purely additive: `buildDayCell` keeps its existing signature and output, so
  // every current caller and test keeps working. All study-cycle facts come from
  // the canonical record supplied by the caller (via calendar-context), never
  // from hardcoded dates.
  function buildDayCellWithMeta(date, options) {
    var opts = options || {};
    var cell = buildDayCell(date, opts);
    // `opts.meta` may be the whole date->meta map or a single pre-resolved entry
    // for this date (the month model resolves it per cell). Accept both shapes.
    var meta = null;
    if (opts.meta && typeof opts.meta === 'object') {
      meta = Object.prototype.hasOwnProperty.call(opts.meta, 'date')
        ? opts.meta
        : (opts.meta[date] || null);
    }
    if (!meta) return cell;
    cell.isActive = meta.isActive === true;
    cell.studyWeek = meta.studyWeek === undefined ? null : meta.studyWeek;
    cell.studyDay = meta.studyDay === undefined ? null : meta.studyDay;
    cell.specialLabel = meta.specialLabel === undefined ? null : meta.specialLabel;
    cell.isGradedDay = meta.isGradedDay === true;
    cell.isPracticeDay = meta.isPracticeDay === true;
    cell.isStudyWeekStart = meta.isStudyWeekStart === true;
    cell.notesCount = meta.notesCount || 0;
    cell.eventsCount = meta.eventsCount || 0;
    return cell;
  }

  function renderCellMeta(cell) {
    // Only render what canonical data supports; never fabricate labels.
    var html = '';
    if (cell.isActive) {
      html += '<span class="day-meta">' + escapeHtmlSafe(cell.studyWeek === null ? '' : 'W' + cell.studyWeek) +
        (cell.studyDay === null ? '' : ' &middot; D' + cell.studyDay) + '</span>';
    }
    if (cell.specialLabel) {
      var cls = cell.isGradedDay ? 'is-graded' : (cell.isPracticeDay ? 'is-practice' : 'is-week-start');
      html += '<span class="day-badge ' + cls + '">' + escapeHtml(cell.specialLabel) + '</span>';
    }
    var indicators = '';
    if (cell.notesCount > 0) indicators += '<span class="day-dot is-note" title="' + escapeHtml(cell.notesCount + ' note(s)') + '"></span>';
    if (cell.eventsCount > 0) indicators += '<span class="day-dot is-event" title="' + escapeHtml(cell.eventsCount + ' event(s)') + '"></span>';
    if (indicators) html += '<span class="day-dots">' + indicators + '</span>';
    return html;
  }

  // U2 renderer: month cell including metadata. Falls back cleanly when no
  // metadata map is supplied (same output as the legacy renderer).
  function renderDayCellWithMeta(cell, baseClass) {
    if (!cell.studyWeek && !cell.specialLabel && !cell.isActive) {
      return renderDayCell(cell, baseClass);
    }
    var classes = [baseClass || 'day-cell'];
    if (!cell.hasPlan) classes.push('no-plan');
    if (cell.selected) classes.push('is-selected');
    if (cell.hasPlan) classes.push('plan-' + cell.progressState);
    if (cell.isActive) classes.push('is-study-day');
    if (cell.isGradedDay) classes.push('is-graded-day');
    if (cell.isPracticeDay) classes.push('is-practice-day');
    var html = '<button type="button" class="' + classes.join(' ') + '"' +
      ' data-date="' + cell.date + '" data-action="select-date"' +
      ' aria-pressed="' + (cell.selected ? 'true' : 'false') + '"' +
      ' aria-label="' + escapeHtml(cell.ariaLabel) + '">';
    html += '<span class="day-number">' + cell.day + '</span>';
    if (cell.hasPlan) html += renderDayProgress(cell.percent);
    html += renderCellMeta(cell);
    html += '</button>';
    return html;
  }

  function buildMonthModelWithMeta(options) {
    var opts = options || {};
    var grid = Calendar.buildMonthGrid(opts.year, opts.month);
    return {
      year: grid.year,
      month: grid.month,
      title: grid.title,
      weekdays: grid.weekdays,
      weeks: grid.weeks.map(function (row) {
        return row.map(function (cell) {
          if (!cell) return null;
          // Pass the per-date meta entry (not the whole map) so buildDayCellWithMeta
          // always resolves it, regardless of how the caller supplied metadata.
          var meta = opts.meta && opts.meta[cell.date] ? opts.meta[cell.date] : null;
          return buildDayCellWithMeta(cell.date, Object.assign({}, opts, { meta: meta }));
        });
      })
    };
  }

  function renderMonthHTMLWithMeta(model) {
    var html = '<div class="month-view" role="group" aria-label="' +
      escapeHtml(model.title) + '">';
    html += '<div class="month-weekdays" aria-hidden="true">';
    model.weekdays.forEach(function (name) { html += '<span class="month-weekday">' + name + '</span>'; });
    html += '</div>';
    model.weeks.forEach(function (row) {
      html += '<div class="month-week">';
      row.forEach(function (cell) {
        html += cell ? renderDayCellWithMeta(cell, 'day-cell') : renderEmptyCell();
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  return {
    normalizeStatus: normalizeStatus,
    progressState: progressState,
    buildDayCell: buildDayCell,
    renderDayProgress: renderDayProgress,
    renderDayCell: renderDayCell,
    renderEmptyCell: renderEmptyCell,
    buildMonthModel: buildMonthModel,
    renderMonthHTML: renderMonthHTML,
    // U2 canonical-data additions
    buildDayCellWithMeta: buildDayCellWithMeta,
    renderDayCellWithMeta: renderDayCellWithMeta,
    buildMonthModelWithMeta: buildMonthModelWithMeta,
    renderMonthHTMLWithMeta: renderMonthHTMLWithMeta
  };
});
