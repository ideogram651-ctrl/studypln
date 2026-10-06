/**
 * src/components/progress/week-progress.js — Study-Planner Phase 5
 *
 * Renders week-level progress: the week rows of the dashboard / subject page,
 * and the week detail page (the seven day rows inside a week).
 *
 * All nodes arrive pre-calculated from progress-engine:
 *   - week rows   <- progressForAllCourses().weeks / progressForCourse().weeks
 *                    (keys are 'week-N', exactly as the engine emits them)
 *   - week detail <- weekProgressAcrossSubjects(...) / weekProgressForCourse(...)
 *   - day rows    <- progress-engine.dayProgress(plan, completions) per date
 *
 * Presentation only. No completed/total/percent is computed here.
 *
 * Environment: browser global (globalThis.StudyPlanner.WeekProgress) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      Calendar: require('../../js/calendar.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.WeekProgress = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var Calendar = ns.Calendar;
  if (!Renderer || !Calendar) throw new Error('WeekProgress requires Renderer and Calendar');

  // Engine week keys are 'week-<n>' (progress-engine courseScope).
  function weekNumberOf(key) {
    var match = /^week-(\d+)$/.exec(String(key));
    return match ? Number(match[1]) : null;
  }

  function statsLabel(node) {
    return node.completed + ' / ' + node.total + ' tasks completed';
  }

  function buildWeekListViewModel(weeksMap, options) {
    var opts = options || {};
    var linkFor = typeof opts.linkFor === 'function' ? opts.linkFor : null;
    var entries = Object.keys(weeksMap || {}).map(function (key) {
      return { weekNumber: weekNumberOf(key), node: weeksMap[key] };
    }).filter(function (entry) {
      return entry.weekNumber !== null && entry.node;
    });
    // Numeric order (week-10 must not sort before week-2).
    entries.sort(function (a, b) { return a.weekNumber - b.weekNumber; });

    return {
      heading: opts.heading || 'Weeks',
      hasItems: entries.length > 0,
      emptyLabel: 'No weeks in this scope yet.',
      items: entries.map(function (entry) {
        var node = entry.node;
        return {
          weekNumber: entry.weekNumber,
          label: 'Week ' + entry.weekNumber,
          total: node.total,
          completed: node.completed,
          remaining: node.remaining,
          percent: node.percent,
          percentLabel: node.percent + '%',
          statsLabel: statsLabel(node),
          href: linkFor ? linkFor(entry.weekNumber) : null,
          ariaLabel: 'Week ' + entry.weekNumber + ' progress: ' + node.percent + ' percent, ' +
            node.completed + ' of ' + node.total + ' tasks completed'
        };
      })
    };
  }

  function renderWeekListHTML(viewModel) {
    var html = '<div class="progress-list">';
    viewModel.items.forEach(function (item) {
      html += '<button type="button" class="progress-row"' +
        (item.href ? ' data-action="navigate" data-hash="' + Renderer.escapeHtml(item.href) + '"' : '') +
        ' aria-label="' + Renderer.escapeHtml(item.ariaLabel) + '">';
      html += '<span class="progress-row-main">';
      html += '<span class="progress-row-label">' + Renderer.escapeHtml(item.label) + '</span>';
      html += '<span class="progress-row-stats">' + Renderer.escapeHtml(item.statsLabel) + '</span>';
      html += '</span>';
      html += '<span class="progress-row-side">';
      html += '<span class="progress-row-percent">' + item.percentLabel + '</span>';
      html += '<span class="progress-track progress-track-sm" aria-hidden="true"><span class="progress-fill" style="width:' +
        item.percent + '%"></span></span>';
      html += '</span>';
      html += '</button>';
    });
    if (!viewModel.hasItems) {
      html += '<p class="progress-empty">' + Renderer.escapeHtml(viewModel.emptyLabel) + '</p>';
    }
    html += '</div>';
    return html;
  }

  // One day row inside a week: date identity, day type, engine numbers.
  function dayRowViewModel(day, opts) {
    var linkFor = typeof opts.linkFor === 'function' ? opts.linkFor : null;
    var parts = Calendar.formatDateParts(day.date);
    var shortMonth = parts.monthName.slice(0, 3);
    var dayLabel = (day.dayNumber ? 'Day ' + day.dayNumber + ' • ' : '') +
      parts.weekdayShort + ' ' + parts.day + ' ' + shortMonth;
    var node = day.node;
    return {
      date: day.date,
      label: dayLabel,
      dayTypeLabel: day.dayTypeLabel || '',
      hasPlan: !!node,
      percent: node ? node.percent : null,
      percentLabel: node ? node.percent + '%' : '—',
      statsLabel: !node ? 'No study plan available.'
        : (node.total === 0 ? 'No tasks for this scope on this day.' : statsLabel(node)),
      href: linkFor ? linkFor(day.date) : null,
      ariaLabel: !node
        ? dayLabel + ': no study plan available'
        : (node.total === 0
          ? dayLabel + ': no tasks for this scope'
          : dayLabel + ' progress: ' + node.percent + ' percent, ' +
            node.completed + ' of ' + node.total + ' tasks completed')
    };
  }

  function buildWeekDetailViewModel(weekNumber, weekNode, days, options) {
    if (!weekNode) return null;
    var opts = options || {};
    var linkFor = typeof opts.linkFor === 'function' ? opts.linkFor : null;
    return {
      weekNumber: weekNumber,
      heading: 'Week ' + weekNumber,
      total: weekNode.total,
      completed: weekNode.completed,
      remaining: weekNode.remaining,
      percent: weekNode.percent,
      percentLabel: weekNode.percent + '%',
      statsLabel: statsLabel(weekNode),
      hasTasks: weekNode.total > 0,
      emptyLabel: 'No tasks planned in this week yet.',
      ariaLabel: 'Week ' + weekNumber + ' progress: ' + weekNode.percent + ' percent, ' +
        weekNode.completed + ' of ' + weekNode.total + ' tasks completed',
      scopeLabel: opts.scopeLabel || '',
      days: (days || []).map(function (day) { return dayRowViewModel(day, opts); })
    };
  }

  function renderWeekDetailHTML(viewModel) {
    var html = '<div class="progress-page-head">';
    html += '<h2 class="progress-heading">' + Renderer.escapeHtml(viewModel.heading) + '</h2>';
    if (viewModel.scopeLabel) {
      html += '<p class="progress-chips"><span class="progress-chip">' +
        Renderer.escapeHtml(viewModel.scopeLabel) + '</span></p>';
    }
    html += '<p class="progress-sub">' + Renderer.escapeHtml(viewModel.statsLabel) + ' • ' +
      viewModel.percentLabel + '</p>';
    html += '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      viewModel.percent + '" aria-valuetext="' + Renderer.escapeHtml(viewModel.ariaLabel) + '">';
    html += '<div class="progress-fill" style="width:' + viewModel.percent + '%"></div>';
    html += '</div>';
    if (!viewModel.hasTasks) {
      html += '<p class="progress-empty">' + Renderer.escapeHtml(viewModel.emptyLabel) + '</p>';
    }
    html += '</div>';

    html += '<div class="progress-list">';
    viewModel.days.forEach(function (day) {
      var classes = 'progress-row' + (day.hasPlan ? '' : ' is-empty-row');
      html += '<button type="button" class="' + classes + '"' +
        (day.href ? ' data-action="navigate" data-hash="' + Renderer.escapeHtml(day.href) + '"' : '') +
        ' aria-label="' + Renderer.escapeHtml(day.ariaLabel) + '">';
      html += '<span class="progress-row-main">';
      html += '<span class="progress-row-label">' + Renderer.escapeHtml(day.label) + '</span>';
      html += '<span class="progress-row-stats">' + Renderer.escapeHtml(day.statsLabel) + '</span>';
      html += '</span>';
      html += '<span class="progress-row-side">';
      if (day.dayTypeLabel) {
        html += '<span class="progress-chip">' + Renderer.escapeHtml(day.dayTypeLabel) + '</span>';
      }
      html += '<span class="progress-row-percent">' + day.percentLabel + '</span>';
      html += '</span>';
      html += '</button>';
    });
    html += '</div>';
    return html;
  }

  return {
    weekNumberOf: weekNumberOf,
    buildWeekListViewModel: buildWeekListViewModel,
    renderWeekListHTML: renderWeekListHTML,
    buildWeekDetailViewModel: buildWeekDetailViewModel,
    renderWeekDetailHTML: renderWeekDetailHTML
  };
});
