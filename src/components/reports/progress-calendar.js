/**
 * src/components/reports/progress-calendar.js — Study-Planner Phase 6
 *
 * The weekly progress calendar: a 7-day timetable of the real schedule.
 *
 * Strictly presentational. It receives an already-built calendar report from the
 * report model and renders it. It computes NO progress (the block's state comes
 * from the engine-built node) and it invents NO schedule data (every block comes
 * from the plan's own schedule[] array).
 *
 * Layout mirrors the reference design:
 *   - a left-hand time axis
 *   - seven day columns with weekday + date headers
 *   - absolutely positioned blocks, placed by real start/end minutes
 *   - horizontal gridlines on the hour
 *   - deterministic per-subject colour, with a subtle completion treatment
 *
 * It deliberately contains no badges, streaks, timers or analytics.
 *
 * Environment: browser global (globalThis.StudyPlanner.ProgressCalendar) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Renderer: require('../../js/renderer.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ProgressCalendar = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  if (!Renderer) throw new Error('ProgressCalendar requires Renderer');

  var escapeHtml = Renderer.escapeHtml;

// ---- geometry (pure, shared with the export engine's rule) -------------
  //
  //   top    = (startMinutes - windowStart) / span
  //   height =  durationMinutes / span
  //
  // Both are ratios of the same window, so a 120-minute block is exactly twice
  // the height of a 60-minute one. Times are never rounded to the hour.

  // U3 §3.4: the visible axis speaks a human 12-hour clock with a meridiem —
  // 11:00 -> "11:00 AM", 13:00 -> "1:00 PM" — never a raw 13:00/14:00
  // sequence. Pure formatting; the underlying minutes are untouched.
  function formatClock(minutes) {
    var total = ((minutes % 1440) + 1440) % 1440;
    var hh = Math.floor(total / 60);
    var mm = total % 60;
    var meridiem = hh >= 12 ? 'PM' : 'AM';
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + meridiem;
  }

  // The meridiem split the renderer needs to colour AM/PM differently
  // (reference design: AM cool, PM warm). No arithmetic — just destructure.
  function clockParts(minutes) {
    var label = formatClock(minutes);
    var spaceIndex = label.lastIndexOf(' ');
    return {
      label: label,
      hour: label.slice(0, spaceIndex),
      meridiem: label.slice(spaceIndex + 1)
    };
  }

  // U3 §3.5: break-only categories are a PRESENTATION filter for the on-screen
  // chart (break / free / fixed = zero-capacity, non-academic grey blocks).
  // The underlying schedule data is never altered — the report model still
  // carries every block, and the export renders them as it always did.
  // revision / review / practice / study are study activities and are NOT
  // filtered.
  var BREAK_ONLY_CATEGORIES = { break: true, free: true, fixed: true };

  function isBreakOnlyBlock(block) {
    return !!(block && BREAK_ONLY_CATEGORIES[block.category]);
  }

  function blockGeometry(block, window) {
    var span = window && window.spanMinutes > 0 ? window.spanMinutes : 720;
    return {
      top: ((block.startMinutes - window.startMinutes) / span) * 100,
      height: (block.durationMinutes / span) * 100,
      startMinutes: block.startMinutes,
      endMinutes: block.endMinutes,
      durationMinutes: block.durationMinutes
    };
  }

  function blockState(block) {
    // U5.1 (CHANGE #001): an actionable block (revision / review) takes its
    // state from the U5 completion record, resolved once by the report model.
    // It carries exactly ONE checkbox, so the state is complete | none —
    // never an invented "partial".
    if (block.actionableId) return block.actionCompleted ? 'complete' : 'none';
    if (!block.isTaskBearing || !block.node) return 'none';
    if (block.node.percent >= 100) return 'complete';
    if (block.node.completed > 0) return 'partial';
    return 'none';
  }

  // Hour ticks across the shared window; the gridlines use the same list, so the
  // axis and the grid can never drift apart.
  function axisTicks(window) {
    var ticks = [];
    var start = window.startMinutes;
    var end = window.endMinutes;
    var span = window.spanMinutes;
    var first = Math.ceil(start / 60) * 60;
    for (var m = first; m <= end; m += 60) {
      var parts = clockParts(m);
      ticks.push({
        minutes: m,
        top: ((m - start) / span) * 100,
        label: parts.label,
        hour: parts.hour,
        meridiem: parts.meridiem
      });
    }
    return ticks;
  }

// ---- view model ---------------------------------------------------------
  // Turns the report model's calendar report into render-ready rows. Still no
  // arithmetic on progress: only geometry on times.

  function buildCalendarViewModel(report, options) {
    if (!report) return null;
    var opts = options || {};
    var window = report.window;
    var ticks = axisTicks(window);

    var days = report.days.map(function (day) {
      return {
        date: day.date,
        dayNumber: day.dayNumber,
        // U3 §3.3 / FIG-004: the column header shows the canonical DATE
        // ("Fri 2" = Friday, October 2), never the cycle day number that
        // reads like "October 1". Derived from the plan's own ISO date.
        dayNum: day.date ? Number(day.date.slice(8, 10)) : (day.dayNumber || ''),
        weekdayShort: day.weekdayShort,
        weekdayLong: day.weekdayLong,
        percent: day.node.percent,
        completed: day.node.completed,
        total: day.node.total,
        // U3 §3.5 presentation filter: break-only blocks are not drawn in the
        // on-screen chart. The model's day.blocks still carries all of them.
        blocks: day.blocks.filter(function (block) {
          return !isBreakOnlyBlock(block);
        }).map(function (block) {
          var geo = blockGeometry(block, window);
          return {
            blockId: block.blockId,
            label: block.label,
            focus: block.focus,
            category: block.category,
            colorToken: block.colorToken,
            isTaskBearing: block.isTaskBearing,
            taskCount: block.taskCount,
            percent: block.isTaskBearing ? block.node.percent : null,
            state: blockState(block),
            top: geo.top,
            height: geo.height,
            startMinutes: geo.startMinutes,
            endMinutes: geo.endMinutes,
            durationMinutes: geo.durationMinutes,
            timeLabel: formatClock(block.startMinutes) + ' – ' + formatClock(block.endMinutes),
            // blocks are read-only in the viewer; the tracker owns completion
            detailHref: opts.dayLinkFor ? opts.dayLinkFor(day.date) : null
          };
        })
      };
    });

    return {
      title: report.title,
      weekNumber: report.weekNumber,
      subjectId: report.subjectId,
      startDate: report.startDate,
      endDate: report.endDate,
      available: report.available && days.length > 0,
      dayCount: days.length,
      window: window,
      ticks: ticks,
      days: days,
      percent: report.node.percent,
      completed: report.node.completed,
      total: report.node.total,
      emptyLabel: 'No study plan is available for this week.'
    };
  }

// ---- rendering ---------------------------------------------------------

  function renderHeadHTML(viewModel) {
    var html = '<div class="pc-head">';
    html += '<div class="pc-head-text">';
    html += '<h2 class="pc-title">' + escapeHtml(viewModel.title) + '</h2>';
    html += '<p class="pc-sub">' + escapeHtml(viewModel.startDate + ' – ' + viewModel.endDate) +
      ' · ' + viewModel.dayCount + ' days</p>';
    html += '</div>';
    html += '<div class="pc-summary">';
    html += '<span class="pc-summary-num">' + viewModel.percent + '%</span>';
    html += '<span class="pc-summary-lbl">week complete · ' +
      viewModel.completed + '/' + viewModel.total + ' tasks</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderBlockHTML(block) {
    var classes = 'pc-block pc-tok-' + escapeHtml(block.colorToken) + ' is-' + escapeHtml(block.state);
    // Size class from the REAL duration, so a 15-minute block and a 2-hour block
    // carry the amount of text they can actually show.
    if (block.durationMinutes < 45) classes += ' is-short';
    if (block.durationMinutes <= 25) classes += ' is-tiny';
    var html = '<div class="' + classes + '" data-block-id="' + escapeHtml(block.blockId) + '"' +
      ' data-state="' + escapeHtml(block.state) + '"' +
      ' style="top:' + block.top + '%;height:' + block.height + '%"' +
      ' title="' + escapeHtml(block.label + ' · ' + block.timeLabel) + '">';
    html += '<span class="pc-block-title">' + escapeHtml(block.label) + '</span>';
    html += '<span class="pc-block-time">' + escapeHtml(block.timeLabel) + '</span>';
    if (block.isTaskBearing) {
      html += '<span class="pc-block-tasks">' + block.taskCount + ' task' +
        (block.taskCount === 1 ? '' : 's') + ' · ' + block.percent + '%</span>';
    }
    html += '</div>';
    return html;
  }

  // Axis labels are centred on their hour, which would clip the first and last
// labels against the container edges; those two are inset instead, so every
// label stays fully visible. U3 §3.4: the hour and the meridiem are stacked,
// with AM/PM carried on their own span so CSS can colour them differently
// (the desirable reference's treatment).
function renderAxisHTML(ticks) {
  var html = '<div class="pc-axis" aria-hidden="true">';
  ticks.forEach(function (tick, index) {
    var edge = '';
    if (index === 0) edge = ' is-first';
    if (index === ticks.length - 1) edge = ' is-last';
    var meridiem = tick.meridiem || '';
    var meridiemClass = meridiem === 'AM' ? ' is-am' : (meridiem === 'PM' ? ' is-pm' : '');
    html += '<span class="pc-tick' + edge + '" style="top:' + tick.top + '%">' +
      '<span class="pc-tick-hour">' + escapeHtml(tick.hour != null ? tick.hour : tick.label) + '</span>' +
      (meridiem ? '<span class="pc-tick-meridiem' + meridiemClass + '">' +
        escapeHtml(meridiem) + '</span>' : '') +
      '</span>';
  });
  html += '</div>';
  return html;
}

function renderColumnHTML(day, ticks) {
    var html = '<div class="pc-col" data-date="' + escapeHtml(day.date) + '">';
    ticks.forEach(function (tick) {
      html += '<div class="pc-gridline" style="top:' + tick.top + '%"></div>';
    });
    day.blocks.forEach(function (block) {
      html += renderBlockHTML(block);
    });
    html += '</div>';
    return html;
  }

function renderCalendarHTML(viewModel) {
    if (!viewModel || !viewModel.available) {
      return '<div class="pc-empty">' +
        escapeHtml(viewModel ? viewModel.emptyLabel : 'No report available.') + '</div>';
    }
    var ticks = viewModel.ticks;
    var html = '<div class="pc-calendar" role="group" aria-label="' +
      escapeHtml(viewModel.title) + '">';

    // Header row: an empty gutter, then one header per day.
    html += '<div class="pc-head-row"><div class="pc-gutter-head"></div>';
    viewModel.days.forEach(function (day) {
      html += '<div class="pc-day-head">';
      html += '<span class="pc-weekday">' + escapeHtml(day.weekdayShort) + '</span>';
      html += '<span class="pc-daynum">' + escapeHtml(String(day.dayNum != null && day.dayNum !== '' ? day.dayNum : (day.dayNumber || ''))) + '</span>';
      html += '</div>';
    });
    html += '</div>';

    // Body: time axis + one positioned column per day.
    // The row height IS the day window in pixels (1px per minute), so block
    // heights stay visually proportional to their real durations.
    var bodyHeight = viewModel.window.spanMinutes;
    html += '<div class="pc-body" style="height:' + bodyHeight + 'px">';
    html += renderAxisHTML(ticks);

    viewModel.days.forEach(function (day) {
      html += renderColumnHTML(day, ticks);
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  return {
    formatClock: formatClock,
    clockParts: clockParts,
    blockGeometry: blockGeometry,
    blockState: blockState,
    axisTicks: axisTicks,
    isBreakOnlyBlock: isBreakOnlyBlock,
    buildCalendarViewModel: buildCalendarViewModel,
    renderHeadHTML: renderHeadHTML,
    renderCalendarHTML: renderCalendarHTML
  };
});
