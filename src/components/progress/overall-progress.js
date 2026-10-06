/**
 * src/components/progress/overall-progress.js — Study-Planner Phase 5
 *
 * Renders the overall progress node produced by progress-engine
 * (progressForAllCourses().overall -> { total, completed, remaining, percent }).
 *
 * Presentation only: this component never computes completed/total/percent.
 * Every number it prints arrives pre-calculated from the engine, so there is no
 * second progress implementation in the UI (spec sections 2, 20, 58).
 *
 * Environment: browser global (globalThis.StudyPlanner.OverallProgress) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Renderer: require('../../js/renderer.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.OverallProgress = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  if (!Renderer) throw new Error('OverallProgress requires Renderer');

  // The node is already calculated: read it, never re-derive it.
  function buildOverallViewModel(node, options) {
    if (!node) return null;
    var opts = options || {};
    var percent = node.percent;
    var completed = node.completed;
    var total = node.total;
    var remaining = node.remaining;

    return {
      heading: opts.heading || 'Overall progress',
      total: total,
      completed: completed,
      remaining: remaining,
      percent: percent,
      percentLabel: percent + '%',
      statsLabel: completed + ' / ' + total + ' tasks completed',
      remainingLabel: remaining + ' remaining',
      hasTasks: total > 0,
      emptyLabel: 'No tasks in this scope yet.',
      ariaLabel: 'Overall progress: ' + percent + ' percent, ' + completed + ' of ' + total + ' tasks completed'
    };
  }

  function renderOverallHTML(viewModel) {
    if (!viewModel) return '';
    var html = '<section class="progress-hero" aria-label="' + Renderer.escapeHtml(viewModel.ariaLabel) + '">';
    html += '<div class="progress-hero-head">';
    html += '<h2 class="progress-hero-title">' + Renderer.escapeHtml(viewModel.heading) + '</h2>';
    html += '<span class="progress-hero-percent">' + viewModel.percentLabel + '</span>';
    html += '</div>';
    html += '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      viewModel.percent + '" aria-valuetext="' + Renderer.escapeHtml(viewModel.ariaLabel) + '">';
    html += '<div class="progress-fill" style="width:' + viewModel.percent + '%"></div>';
    html += '</div>';
    html += '<div class="progress-hero-stats">';
    html += '<span>' + Renderer.escapeHtml(viewModel.statsLabel) + '</span>';
    html += '<span>' + Renderer.escapeHtml(viewModel.remainingLabel) + '</span>';
    html += '</div>';
    if (!viewModel.hasTasks) {
      html += '<p class="progress-empty">' + Renderer.escapeHtml(viewModel.emptyLabel) + '</p>';
    }
    html += '</section>';
    return html;
  }

  return {
    buildOverallViewModel: buildOverallViewModel,
    renderOverallHTML: renderOverallHTML
  };
});
