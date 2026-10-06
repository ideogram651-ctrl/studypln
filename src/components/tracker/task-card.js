/**
 * src/components/tracker/task-card.js — Study-Planner Phase 4
 *
 * Renders one planned task row. Receives task data + its completion record and
 * returns a view model / HTML string. It knows nothing about the planner: it
 * reads only the plan task fields (type, durationSeconds, questionCount, and
 * the planner's `planning` estimates for display of missing source values).
 *
 * The checkbox identity is always the task's stable taskId — never an index.
 *
 * Environment: browser global (globalThis.StudyPlanner.TaskCard) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Renderer: require('../../js/renderer.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.TaskCard = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  if (!Renderer) throw new Error('TaskCard requires Renderer');

  var TYPE_LABELS = {
    lecture: 'Lecture',
    tutorial: 'Tutorial',
    solution: 'Solution',
    orientation: 'Overview',
    summary: 'Summary',
    other: 'Content',
    activity: 'Activity',
    practice: 'Practice',
    graded: 'Graded',
    revision: 'Revision',
    review: 'Review',
    break: 'Break',
    free: 'Free time',
    fixed: 'Fixed personal time'
  };

  function typeLabel(type) {
    return TYPE_LABELS[type] || String(type || 'Task');
  }

  function formatDurationSeconds(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds <= 0) return null;
    var total = Math.round(seconds);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    var pad = function (value) { return (value < 10 ? '0' : '') + value; };
    return hours > 0
      ? hours + ':' + pad(minutes) + ':' + pad(secs)
      : minutes + ':' + pad(secs);
  }

  function questionLabel(count) {
    return count + ' Question' + (count === 1 ? '' : 's');
  }

  // Display meta line built only from plan task data.
  function buildTaskMeta(task) {
    var planning = task.planning || {};
    var parts = [];
    var hasVideoEstimate = typeof planning.videoMinutes === 'number' && planning.videoMinutes > 0;
    var hasQuestionEstimate = typeof planning.questionMinutes === 'number' && planning.questionMinutes > 0;

    var duration = formatDurationSeconds(task.durationSeconds);
    if (duration) {
      parts.push('🎥 ' + duration);
    } else if (hasVideoEstimate) {
      parts.push('🎥 ~' + Math.round(planning.videoMinutes) + ' min (est.)');
    }

    if (typeof task.questionCount === 'number' && task.questionCount > 0) {
      parts.push('📝 ' + questionLabel(task.questionCount));
    } else if (hasQuestionEstimate && !duration) {
      parts.push('📝 questions (count unavailable)');
    }

    var meta = typeLabel(task.type);
    if (parts.length > 0) meta += ' • ' + parts.join(' • ');
    return meta;
  }

  function buildTaskCardViewModel(task, completion) {
    var checked = !!(completion && completion.completed === true);
    return {
      taskId: task.taskId,
      sourceId: task.sourceId,
      type: task.type,
      typeLabel: typeLabel(task.type),
      title: task.title,
      meta: buildTaskMeta(task),
      checked: checked,
      completedAt: checked ? completion.completedAt : null,
      ariaLabel: task.title + (checked ? ' — completed' : '')
    };
  }

  function renderTaskCardHTML(viewModel) {
    var classes = 'task-row' + (viewModel.checked ? ' is-completed' : '');
    var html = '<label class="' + classes + '" data-task-id="' + Renderer.escapeHtml(viewModel.taskId) + '">';
    html += '<input type="checkbox" class="task-checkbox"' +
      ' data-task-id="' + Renderer.escapeHtml(viewModel.taskId) + '"' +
      ' data-action="toggle-task"' +
      (viewModel.checked ? ' checked' : '') + '>';
    html += '<span class="task-text">';
    html += '<span class="task-name">' + Renderer.escapeHtml(viewModel.title) + '</span>';
    html += '<span class="task-meta">' + Renderer.escapeHtml(viewModel.meta) + '</span>';
    html += '</span>';
    html += '</label>';
    return html;
  }

  return {
    TYPE_LABELS: TYPE_LABELS,
    typeLabel: typeLabel,
    formatDurationSeconds: formatDurationSeconds,
    questionLabel: questionLabel,
    buildTaskMeta: buildTaskMeta,
    buildTaskCardViewModel: buildTaskCardViewModel,
    renderTaskCardHTML: renderTaskCardHTML
  };
});
