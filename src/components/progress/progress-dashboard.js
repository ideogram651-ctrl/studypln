/**
 * src/components/progress/progress-dashboard.js — Study-Planner Phase 5
 *
 * Composes the root Progress Dashboard from the three level components:
 *   Overall  <- progress-engine overall node
 *   Subjects <- progress-engine subject nodes (canonical order)
 *   Weeks    <- progress-engine week nodes
 *
 * Also provides the dashboard's own failure/empty notices. It calls no engine
 * function and performs no arithmetic: the app hands it engine output.
 *
 * Environment: browser global (globalThis.StudyPlanner.ProgressDashboard) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      OverallProgress: require('./overall-progress.js'),
      SubjectProgress: require('./subject-progress.js'),
      WeekProgress: require('./week-progress.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ProgressDashboard = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var OverallProgress = ns.OverallProgress;
  var SubjectProgress = ns.SubjectProgress;
  var WeekProgress = ns.WeekProgress;
  if (!Renderer || !OverallProgress || !SubjectProgress || !WeekProgress) {
    throw new Error('ProgressDashboard requires Renderer, OverallProgress, SubjectProgress and WeekProgress');
  }

  function buildDashboardViewModel(progressData, options) {
    if (!progressData || !progressData.overall) return null;
    var opts = options || {};
    return {
      heading: opts.heading || 'Progress',
      overall: OverallProgress.buildOverallViewModel(progressData.overall, {
        heading: opts.overallHeading || 'Overall progress'
      }),
      subjects: SubjectProgress.buildSubjectListViewModel(progressData, {
        heading: opts.subjectsHeading || 'Subjects',
        order: opts.subjectOrder,
        labels: opts.labels,
        linkFor: opts.subjectLinkFor
      }),
      weeks: WeekProgress.buildWeekListViewModel(progressData.weeks, {
        heading: opts.weeksHeading || 'Weeks',
        linkFor: opts.weekLinkFor
      })
    };
  }

  function renderSectionHTML(title, body, extraClass) {
    var html = '<section class="progress-section' + (extraClass ? ' ' + extraClass : '') + '">';
    html += '<h2 class="progress-section-title">' + Renderer.escapeHtml(title) + '</h2>';
    html += body;
    html += '</section>';
    return html;
  }

  function renderDashboardHTML(viewModel) {
    if (!viewModel) return '';
    var html = OverallProgress.renderOverallHTML(viewModel.overall);
    html += renderSectionHTML(viewModel.subjects.heading, SubjectProgress.renderSubjectListHTML(viewModel.subjects));
    html += renderSectionHTML(viewModel.weeks.heading, WeekProgress.renderWeekListHTML(viewModel.weeks));
    return html;
  }

  // Controlled failure/notice state: never expose a raw exception in the UI.
  function renderNoticeHTML(options) {
    var opts = options || {};
    var html = '<div class="empty-state">';
    html += '<h1>' + Renderer.escapeHtml(opts.heading || 'Progress unavailable') + '</h1>';
    html += '<p>' + Renderer.escapeHtml(opts.message || 'Unable to load progress data. Please refresh and try again.') + '</p>';
    if (opts.href) {
      html += '<button type="button" class="back-button" data-action="navigate" data-hash="' +
        Renderer.escapeHtml(opts.href) + '">' +
        '<img class="back-icon" src="../assets/svg/back-arrow.svg" alt="" aria-hidden="true">' +
        Renderer.escapeHtml(opts.linkLabel || 'Back to Progress') + '</button>';
    }
    html += '</div>';
    return html;
  }

  return {
    buildDashboardViewModel: buildDashboardViewModel,
    renderSectionHTML: renderSectionHTML,
    renderDashboardHTML: renderDashboardHTML,
    renderNoticeHTML: renderNoticeHTML
  };
});
