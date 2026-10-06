/**
 * src/components/progress/subject-progress.js — Study-Planner Phase 5
 *
 * Renders subject-level progress:
 *   - the subject rows of the dashboard  <- progressForAllCourses().subjects
 *   - the subject detail page (weeks)    <- progressForCourse(course, completions)
 *
 * Subject order is caller-supplied (data-engine's canonical SUBJECT_ORDER through
 * sortCourses) and never re-sorted by progress. Subjects missing from the order
 * list are appended rather than dropped, so a scope is never hidden (spec 27).
 *
 * Presentation only. No completed/total/percent is computed here.
 *
 * Environment: browser global (globalThis.StudyPlanner.SubjectProgress) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      Renderer: require('../../js/renderer.js'),
      WeekProgress: require('./week-progress.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.SubjectProgress = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  var WeekProgress = ns.WeekProgress;
  if (!Renderer || !WeekProgress) throw new Error('SubjectProgress requires Renderer and WeekProgress');

  function statsLabel(node) {
    return node.completed + ' / ' + node.total + ' tasks completed';
  }

  // Canonical order first; anything the caller did not list is appended.
  function orderedSubjectIds(subjects, order) {
    var keys = Object.keys(subjects || {});
    var ordered = [];
    (order || []).forEach(function (subjectId) {
      if (keys.indexOf(subjectId) !== -1 && ordered.indexOf(subjectId) === -1) ordered.push(subjectId);
    });
    keys.slice().sort().forEach(function (subjectId) {
      if (ordered.indexOf(subjectId) === -1) ordered.push(subjectId);
    });
    return ordered;
  }

  function buildSubjectListViewModel(progressData, options) {
    var opts = options || {};
    var subjects = (progressData && progressData.subjects) || {};
    var labels = opts.labels || {};
    var linkFor = typeof opts.linkFor === 'function' ? opts.linkFor : null;
    var ids = orderedSubjectIds(subjects, opts.order);

    return {
      heading: opts.heading || 'Subjects',
      hasItems: ids.length > 0,
      emptyLabel: 'No subjects available.',
      items: ids.map(function (subjectId) {
        var node = subjects[subjectId];
        var label = labels[subjectId] || subjectId;
        return {
          subjectId: subjectId,
          courseId: node.courseId,
          label: label,
          total: node.total,
          completed: node.completed,
          remaining: node.remaining,
          percent: node.percent,
          percentLabel: node.percent + '%',
          statsLabel: statsLabel(node),
          hasTasks: node.total > 0,
          href: linkFor ? linkFor(subjectId) : null,
          ariaLabel: label + ' progress: ' + node.percent + ' percent, ' +
            node.completed + ' of ' + node.total + ' tasks completed'
        };
      })
    };
  }

  function renderSubjectListHTML(viewModel) {
    var html = '<div class="progress-list">';
    viewModel.items.forEach(function (item) {
      html += '<button type="button" class="progress-row progress-row-subject"' +
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

  function buildSubjectDetailViewModel(subjectResult, options) {
    if (!subjectResult) return null;
    var opts = options || {};
    var label = (opts.labels && opts.labels[subjectResult.subjectId]) || subjectResult.subjectId;
    return {
      subjectId: subjectResult.subjectId,
      courseId: subjectResult.courseId,
      label: label,
      heading: label + ' progress',
      total: subjectResult.total,
      completed: subjectResult.completed,
      remaining: subjectResult.remaining,
      percent: subjectResult.percent,
      percentLabel: subjectResult.percent + '%',
      statsLabel: statsLabel(subjectResult),
      hasTasks: subjectResult.total > 0,
      emptyLabel: 'No tasks available for this subject yet.',
      ariaLabel: label + ' progress: ' + subjectResult.percent + ' percent, ' +
        subjectResult.completed + ' of ' + subjectResult.total + ' tasks completed',
      weeks: WeekProgress.buildWeekListViewModel(subjectResult.weeks, {
        heading: 'Weeks',
        linkFor: opts.weekLinkFor
      })
    };
  }

  function renderSubjectDetailHTML(viewModel) {
    var html = '<div class="progress-page-head">';
    html += '<h2 class="progress-heading">' + Renderer.escapeHtml(viewModel.heading) + '</h2>';
    html += '<p class="progress-sub">' + Renderer.escapeHtml(viewModel.statsLabel) + ' • ' +
      viewModel.percentLabel + '</p>';
    html += '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      viewModel.percent + '" aria-valuetext="' + Renderer.escapeHtml(viewModel.ariaLabel) + '">';
    html += '<div class="progress-fill" style="width:' + viewModel.percent + '%"></div>';
    html += '</div>';
    html += '</div>';
    html += '<h3 class="progress-section-title">' + Renderer.escapeHtml(viewModel.weeks.heading) + '</h3>';
    html += WeekProgress.renderWeekListHTML(viewModel.weeks);
    return html;
  }

  return {
    orderedSubjectIds: orderedSubjectIds,
    buildSubjectListViewModel: buildSubjectListViewModel,
    renderSubjectListHTML: renderSubjectListHTML,
    buildSubjectDetailViewModel: buildSubjectDetailViewModel,
    renderSubjectDetailHTML: renderSubjectDetailHTML
  };
});
