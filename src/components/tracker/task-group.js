/**
 * src/components/tracker/task-group.js — Study-Planner Phase 4 / Update U5
 *
 * Renders one schedule block (academic or break / fixed / revision / review)
 * and the tasks it references. Tasks are resolved through the plan's flat task
 * list by taskId, preserving the plan's exact ordering.
 *
 * Academic blocks (category "study") carry plan tasks. Exactly two non-academic
 * categories — "revision" and "review" (CHANGE-004) — are *actionable*: each
 * renders ONE block-completion control through the same TaskCard checkbox
 * mechanism, keyed by the stable per-day id "<blockId>:<weekNumber>:<date>".
 * That control persists through storage.js like any course task, but it is
 * deliberately NOT a plan task: it never enters plan.tasks, so every progress
 * denominator (day 19 / overall 413) is unchanged.
 *
 * Every other category is a non-academic block: it is rendered distinctly,
 * keeps zero tasks and never receives generated placeholder tasks
 * (specification section 21).
 *
 * Environment: browser global (globalThis.StudyPlanner.TaskGroup) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      TaskCard: require('./task-card.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.TaskGroup = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var TaskCard = ns.TaskCard;
  if (!Renderer || !TaskCard) throw new Error('TaskGroup requires Renderer and TaskCard');

  var CATEGORY_NOTES = {
    break: 'Break — no study target.',
    free: 'Free time — no study target.',
    fixed: 'Fixed personal time — protected.',
    revision: 'Reserved for weak topics, recall and the error log.',
    review: 'Daily review — completed work, pending items, tomorrow’s plan.'
  };

  // CHANGE-004 (U5): the ONLY non-academic blocks that are actionable. Every
  // other non-academic category (break / free / fixed) stays informational.
  var ACTIONABLE_CATEGORIES = { revision: true, review: true };

  // Stable completion identity for one day's instance of an actionable block:
  //
  //   "<blockId>:<weekNumber>:<date>"   e.g. "revision:1:2026-10-02"
  //
  // The shape mirrors the plan's "<subjectId>:<weekNumber>:<sourceId>" scheme
  // and satisfies storage.js TASK_ID_PATTERN, so the record is written and read
  // through exactly the same setCompletion -> progress-engine pipeline as a
  // course task. The date segment is required: course task ids are
  // date-independent only because every course task is planned exactly once,
  // whereas these blocks recur on all 28 days and each day must complete
  // independently. Returns null when the caller supplies no usable day context
  // (the block then renders as the informational card it was before U5).
  function actionableTaskId(block, context) {
    if (!ACTIONABLE_CATEGORIES[block.category]) return null;
    if (!context) return null;
    var date = context.date;
    var week = context.weekNumber;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (typeof week !== 'number' || week % 1 !== 0 || week < 1) return null;
    if (typeof block.blockId !== 'string' || block.blockId.indexOf(':') !== -1) return null;
    return block.blockId + ':' + week + ':' + date;
  }

  function buildBlockViewModel(block, tasksById, completions, context) {
    var isAcademic = block.category === 'study';
    var isActionable = ACTIONABLE_CATEGORIES[block.category] === true;
    var taskIds = Array.isArray(block.taskIds) ? block.taskIds.slice() : [];
    var cards = isAcademic
      ? taskIds.map(function (taskId) { return tasksById[taskId]; })
        .filter(Boolean)
        .map(function (task) {
          return TaskCard.buildTaskCardViewModel(task, completions ? completions[task.taskId] : null);
        })
      : [];
    // U5/CHANGE-004: one block-completion control per actionable block, built
    // by the SAME TaskCard view model the course rows use (identical markup,
    // styling and data-action wiring).
    var completionTaskId = actionableTaskId(block, context);
    if (completionTaskId) {
      var actionCard = TaskCard.buildTaskCardViewModel({
        taskId: completionTaskId,
        sourceId: context.date,
        type: block.category, // 'revision' | 'review' -> typeLabel
        title: block.label,
        planning: {},
        durationSeconds: null,
        questionCount: null
      }, completions ? completions[completionTaskId] : null);
      // The block header already carries label + time; the row's meta line
      // shows the plan's focus text instead of repeating the type label.
      if (block.focus) actionCard.meta = block.focus;
      cards.push(actionCard);
    }
    var completedCount = cards.filter(function (card) { return card.checked; }).length;
    var timeLabel = block.start + ' – ' + block.end;
    return {
      blockId: block.blockId,
      label: block.label,
      focus: block.focus,
      category: block.category,
      subjectId: block.subjectId || null,
      isAcademic: isAcademic,
      isActionable: isActionable,
      completionTaskId: completionTaskId,
      timeLabel: timeLabel,
      taskIds: taskIds,
      tasks: cards,
      total: cards.length,
      completed: completedCount,
      note: CATEGORY_NOTES[block.category] || '',
      ariaLabel: block.label + ', ' + timeLabel + (cards.length > 0
        ? ', ' + completedCount + ' of ' + cards.length + ' tasks completed'
        : (isAcademic ? ', no tasks planned' : ''))
    };
  }

  function renderBlockHTML(viewModel) {
    var classes = 'study-block ' + (viewModel.isAcademic ? 'is-academic' : 'is-break') +
      ' category-' + viewModel.category;
    var html = '<section class="' + classes + '" data-block-id="' + Renderer.escapeHtml(viewModel.blockId) + '"' +
      ' aria-label="' + Renderer.escapeHtml(viewModel.ariaLabel) + '">';
    html += '<header class="block-head">';
    html += '<div class="block-title">';
    html += '<h3>' + Renderer.escapeHtml(viewModel.label) + '</h3>';
    html += '<span class="block-focus">' + Renderer.escapeHtml(viewModel.focus) + '</span>';
    html += '</div>';
    html += '<div class="block-meta">';
    if ((viewModel.isAcademic || viewModel.isActionable) && viewModel.total > 0) {
      html += '<span class="block-count">' + viewModel.completed + ' / ' + viewModel.total + '</span>';
    }
    html += '<span class="block-time">' + Renderer.escapeHtml(viewModel.timeLabel) + '</span>';
    html += '</div>';
    html += '</header>';
    if (viewModel.tasks.length > 0) {
      // Academic plan tasks and (since U5) the single completion control of an
      // actionable revision/review block share the established task-row markup.
      html += '<div class="block-tasks">';
      viewModel.tasks.forEach(function (card) {
        html += TaskCard.renderTaskCardHTML(card);
      });
      html += '</div>';
    } else if (viewModel.isAcademic) {
      html += '<div class="block-tasks">';
      html += '<p class="block-empty">No tasks planned for this block.</p>';
      html += '</div>';
    }
    if (!viewModel.isAcademic && viewModel.note) {
      html += '<p class="block-note">' + Renderer.escapeHtml(viewModel.note) + '</p>';
    }
    html += '</section>';
    return html;
  }

  return {
    CATEGORY_NOTES: CATEGORY_NOTES,
    ACTIONABLE_CATEGORIES: ACTIONABLE_CATEGORIES,
    actionableTaskId: actionableTaskId,
    buildBlockViewModel: buildBlockViewModel,
    renderBlockHTML: renderBlockHTML
  };
});
