/**
 * src/components/progress/day-progress.js — Study-Planner Phase 5
 *
 * Renders the deepest drill-down level: one day and its tasks.
 *
 * Inputs (all pre-calculated / authoritative):
 *   - plan       : the validated daily document from the data engine (via plan store)
 *   - dayNode    : progress-engine.dayProgress(plan, completions)
 *   - completions: storage.js completion map (read via the app, never re-parsed here)
 *   - task rows reuse the tracker's TaskCard view model for titles/types/metadata,
 *     so the dashboard and the tracker describe a task exactly the same way.
 *
 * The day type label (New content / Practice / Graded) is derived from the plan's
 * own task types — the materialized plan is the source, no planner constant is
 * duplicated here (spec sections 10, 33).
 *
 * Presentation only: no completed/total/percent is computed here, and the panel is
 * read-only, so the dashboard never becomes a second tracker (spec section 60).
 *
 * Environment: browser global (globalThis.StudyPlanner.DayProgress) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      Calendar: require('../../js/calendar.js'),
      ProgressEngine: require('../../js/progress-engine.js'),
      TaskCard: require('../tracker/task-card.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.DayProgress = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var Calendar = ns.Calendar;
  var ProgressEngine = ns.ProgressEngine;
  var TaskCard = ns.TaskCard;
  if (!Renderer || !Calendar || !ProgressEngine || !TaskCard) {
    throw new Error('DayProgress requires Renderer, Calendar, ProgressEngine and TaskCard');
  }

  // Derived from the plan's task types (graded > practice > new content).
  function inferDayTypeLabel(plan) {
    var types = (plan.tasks || []).map(function (task) { return task.type; });
    if (types.indexOf('graded') !== -1) return 'Graded';
    if (types.indexOf('practice') !== -1) return 'Practice';
    if (types.length > 0) return 'New content';
    return '';
  }

  function buildDayViewModel(plan, dayNode, completions, options) {
    if (!plan || !dayNode) return null;
    var opts = options || {};
    var parts = Calendar.formatDateParts(plan.date);
    var byId = completions || {};
    var trackerLinkFor = typeof opts.trackerLinkFor === 'function' ? opts.trackerLinkFor : null;

    var tasks = (plan.tasks || []).map(function (task) {
      var card = TaskCard.buildTaskCardViewModel(task, byId[task.taskId]);
      return {
        taskId: card.taskId,
        title: card.title,
        type: card.type,
        typeLabel: card.typeLabel,
        meta: card.meta,
        checked: card.checked,
        completedAt: card.completedAt,
        eligible: ProgressEngine.isEligibleForProgress(task.type),
        statusLabel: card.checked ? 'Completed' : 'Pending',
        ariaLabel: card.title + ' — ' + card.typeLabel + (card.checked ? ', completed' : ', not completed')
      };
    });

    return {
      date: plan.date,
      dayNumber: plan.dayNumber,
      weekNumber: plan.weekNumber,
      dayTypeLabel: inferDayTypeLabel(plan),
      heading: 'Day ' + plan.dayNumber,
      subtitle: parts.weekdayLong + ' • ' + parts.text + ' • Week ' + plan.weekNumber,
      total: dayNode.total,
      completed: dayNode.completed,
      remaining: dayNode.remaining,
      percent: dayNode.percent,
      percentLabel: dayNode.percent + '%',
      statsLabel: dayNode.completed + ' / ' + dayNode.total + ' tasks completed',
      hasTasks: dayNode.total > 0,
      emptyLabel: 'No tasks planned for this day yet.',
      trackerHref: trackerLinkFor ? trackerLinkFor(plan.date) : null,
      ariaLabel: 'Day ' + plan.dayNumber + ' ' + parts.text + ' progress: ' + dayNode.percent +
        ' percent, ' + dayNode.completed + ' of ' + dayNode.total + ' tasks completed',
      tasks: tasks
    };
  }

  function renderDayTaskHTML(task) {
    var classes = 'task-row progress-task' + (task.checked ? ' is-completed' : '') +
      (task.eligible ? '' : ' is-excluded');
    var html = '<li class="' + classes + '" data-task-id="' + Renderer.escapeHtml(task.taskId) + '"' +
      ' aria-label="' + Renderer.escapeHtml(task.ariaLabel) + '">';
    html += '<span class="task-text">';
    html += '<span class="task-name">' + Renderer.escapeHtml(task.title) + '</span>';
    html += '<span class="task-meta">' + Renderer.escapeHtml(task.meta) + '</span>';
    html += '</span>';
    html += '<span class="progress-task-side">';
    if (!task.eligible) html += '<span class="progress-chip">Not counted</span>';
    html += '<span class="progress-chip ' + (task.checked ? 'is-done' : 'is-pending') + '">' +
      Renderer.escapeHtml(task.statusLabel) + '</span>';
    html += '</span>';
    html += '</li>';
    return html;
  }

  function renderDayHTML(viewModel) {
    var html = '<div class="progress-page-head">';
    html += '<h2 class="progress-heading">' + Renderer.escapeHtml(viewModel.heading) + '</h2>';
    html += '<p class="progress-sub">' + Renderer.escapeHtml(viewModel.subtitle) + '</p>';
    html += '<p class="progress-chips">';
    html += '<span class="progress-chip">Week ' + viewModel.weekNumber + '</span>';
    if (viewModel.dayTypeLabel) {
      html += '<span class="progress-chip">' + Renderer.escapeHtml(viewModel.dayTypeLabel) + '</span>';
    }
    html += '</p>';
    html += '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      viewModel.percent + '" aria-valuetext="' + Renderer.escapeHtml(viewModel.ariaLabel) + '">';
    html += '<div class="progress-fill" style="width:' + viewModel.percent + '%"></div>';
    html += '</div>';
    html += '<p class="progress-sub">' + Renderer.escapeHtml(viewModel.statsLabel) + ' • ' +
      viewModel.percentLabel + '</p>';
    if (viewModel.trackerHref) {
      html += '<button type="button" class="ghost-button" data-action="navigate" data-hash="' +
        Renderer.escapeHtml(viewModel.trackerHref) + '">Open Daily Tracker</button>';
    }
    if (!viewModel.hasTasks) {
      html += '<p class="progress-empty">' + Renderer.escapeHtml(viewModel.emptyLabel) + '</p>';
    }
    html += '</div>';

    if (viewModel.tasks.length > 0) {
      html += '<ul class="progress-tasks">';
      viewModel.tasks.forEach(function (task) { html += renderDayTaskHTML(task); });
      html += '</ul>';
    }
    return html;
  }

  return {
    inferDayTypeLabel: inferDayTypeLabel,
    buildDayViewModel: buildDayViewModel,
    renderDayTaskHTML: renderDayTaskHTML,
    renderDayHTML: renderDayHTML
  };
});
