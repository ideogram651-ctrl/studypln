/**
 * src/components/tracker/daily-tracker.js — Study-Planner Phase 4
 *
 * The daily tracker: builds a view model from one daily plan document plus the
 * persisted completion state, renders it, and exposes a small controller that
 * writes completion through storage.js and reads progress from progress-engine.js.
 *
 * Boundaries:
 *   - plan data comes from the data engine (validated daily JSON)
 *   - completion state comes ONLY from storage.js
 *   - progress numbers come ONLY from progress-engine.js (dayProgress)
 *   - no planner logic, no direct localStorage access, no plan mutation
 *
 * Environment: browser global (globalThis.StudyPlanner.DailyTracker) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      Calendar: require('../../js/calendar.js'),
      ProgressEngine: require('../../js/progress-engine.js'),
      TaskGroup: require('./task-group.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.DailyTracker = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var Calendar = ns.Calendar;
  var ProgressEngine = ns.ProgressEngine;
  var TaskGroup = ns.TaskGroup;
  if (!Renderer || !Calendar || !ProgressEngine || !TaskGroup) {
    throw new Error('DailyTracker requires Renderer, Calendar, ProgressEngine and TaskGroup');
  }

  function tasksByIdOf(plan) {
    var byId = {};
    (plan.tasks || []).forEach(function (task) { byId[task.taskId] = task; });
    return byId;
  }

  // Day progress is computed by the progress engine from the plan + persisted
  // completion state — never inside this component.
  function dayProgressOf(plan, completions) {
    return ProgressEngine.dayProgress(plan, completions || {});
  }

  function buildTrackerViewModel(plan, completions, options) {
    if (!plan || typeof plan !== 'object') return null;
    var opts = options || {};
    var context = opts.context ? opts.context + ' — ' : '';
    var progress = dayProgressOf(plan, completions);
    var byId = tasksByIdOf(plan);
    var parts = Calendar.formatDateParts(plan.date);
    var academicBlocks = plan.schedule.filter(function (block) { return block.category === 'study'; });
    var academicMinutes = (plan.tasks || []).reduce(function (total, task) {
      var estimate = task.planning && typeof task.planning.estimatedMinutes === 'number'
        ? task.planning.estimatedMinutes : 0;
      return total + estimate;
    }, 0);

    return {
      date: plan.date,
      dayNumber: plan.dayNumber,
      weekNumber: plan.weekNumber,
      heading: 'Day ' + plan.dayNumber + ' — Study Tracker',
      subtitle: parts.weekdayLong + ' • ' + parts.text + ' • ' + context + 'Week ' + plan.weekNumber,
      blocks: plan.schedule.map(function (block) {
        // U5/CHANGE-004: the day context lets actionable revision/review blocks
        // mint their stable per-day completion id (see task-group.js).
        return TaskGroup.buildBlockViewModel(block, byId, completions, {
          date: plan.date,
          weekNumber: plan.weekNumber
        });
      }),
      subjectBlocks: academicBlocks.length,
      estimatedMinutes: Math.round(academicMinutes * 10) / 10,
      progress: progress,
      progressLabel: progress.completed + ' / ' + progress.total + ' completed',
      percentLabel: progress.percent + '%'
    };
  }

  function renderTrackerHTML(viewModel) {
    var html = '<div class="tracker">';
    html += '<div class="tracker-top">';
    html += '<button type="button" class="back-button" data-action="back">' +
      '<img class="back-icon" src="../assets/svg/back-arrow.svg" alt="" aria-hidden="true">' +
      'Back</button>';
    html += '</div>';
    html += '<section class="tracker-hero">';
    html += '<h1 class="tracker-heading">' + Renderer.escapeHtml(viewModel.heading) + '</h1>';
    html += '<p class="tracker-subtitle">' + Renderer.escapeHtml(viewModel.subtitle) + '</p>';
    html += '<div class="progress-track"><div class="progress-fill" style="width:' +
      viewModel.progress.percent + '%"></div></div>';
    html += '<div class="tracker-stats">';
    html += '<span>' + viewModel.progressLabel + '</span>';
    html += '<span>' + viewModel.percentLabel + '</span>';
    html += '</div>';
    html += '</section>';
    viewModel.blocks.forEach(function (block) {
      html += TaskGroup.renderBlockHTML(block);
    });
    html += '</div>';
    return html;
  }

  function renderUnavailableHTML(options) {
    var opts = options || {};
    var heading = opts.heading || 'Study plan unavailable';
    var message = opts.message || 'No study plan available for this date.';
    var html = '<div class="empty-state">';
    html += '<h1>' + Renderer.escapeHtml(heading) + '</h1>';
    html += '<p>' + Renderer.escapeHtml(message) + '</p>';
    if (opts.date && Calendar.isValidIsoDate(opts.date)) {
      html += '<p class="empty-state-date">' + Renderer.escapeHtml(Calendar.formatLongDate(opts.date)) + '</p>';
    }
    // U5.1 (CHANGE #004): shared Back control (supplied back-arrow.svg);
    // goBack() in app.js takes one actual history step when available and
    // falls back to the Calendar on a cold deep link.
    html += '<button type="button" class="back-button" data-action="back">' +
      '<img class="back-icon" src="../assets/svg/back-arrow.svg" alt="" aria-hidden="true">' +
      'Back</button>';
    html += '</div>';
    return html;
  }

  function renderMissingPlanHTML(date) {
    return renderUnavailableHTML({
      heading: 'No study plan for this date',
      message: 'No study plan available for this date.',
      date: date
    });
  }

  function renderInvalidDateHTML(rawDate) {
    return renderUnavailableHTML({
      heading: 'Invalid date',
      message: '“' + String(rawDate) + '” is not a valid date in this planner.'
    });
  }

  // Controller: a thin bridge between the UI (checkbox events) and the
  // existing storage + progress layers. Every write goes through storage.js.
  function createTrackerController(options) {
    var opts = options || {};
    var plan = opts.plan;
    var storage = opts.storage;
    if (!plan) throw new Error('createTrackerController needs a plan');
    if (!storage) throw new Error('createTrackerController needs a storage instance');

    function getCompletions() {
      return storage.getAllCompletions();
    }

    function isCompleted(taskId) {
      return storage.getCompletion(taskId) !== null;
    }

    function getProgress() {
      return dayProgressOf(plan, getCompletions());
    }

    function setTaskCompleted(taskId, completed) {
      storage.setCompletion(taskId, completed === true);
      return getProgress();
    }

    function toggleTask(taskId) {
      return setTaskCompleted(taskId, !isCompleted(taskId));
    }

    function getViewModel(viewOptions) {
      return buildTrackerViewModel(plan, getCompletions(), viewOptions);
    }

    return {
      plan: plan,
      getCompletions: getCompletions,
      isCompleted: isCompleted,
      setTaskCompleted: setTaskCompleted,
      toggleTask: toggleTask,
      getProgress: getProgress,
      getViewModel: getViewModel
    };
  }

  return {
    buildTrackerViewModel: buildTrackerViewModel,
    renderTrackerHTML: renderTrackerHTML,
    renderUnavailableHTML: renderUnavailableHTML,
    renderMissingPlanHTML: renderMissingPlanHTML,
    renderInvalidDateHTML: renderInvalidDateHTML,
    createTrackerController: createTrackerController
  };
});
