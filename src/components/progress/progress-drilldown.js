/**
 * src/components/progress/progress-drilldown.js — Study-Planner Phase 5
 *
 * Navigation chrome for the progress hierarchy: a back control, breadcrumbs and
 * the page shell every drill-down level is rendered inside.
 *
 * Every level is a real route (see router.js), so the back control is an ordinary
 * route link — the user never has to rely on the browser back button, and a
 * refresh at any level reopens that level (spec sections 13, 15, 16).
 *
 * Presentation only: the caller supplies labels and hashes.
 *
 * Environment: browser global (globalThis.StudyPlanner.ProgressDrilldown) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Renderer: require('../../js/renderer.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ProgressDrilldown = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  if (!Renderer) throw new Error('ProgressDrilldown requires Renderer');

  // context: { calendarHash, progressHash, subjectLabel, subjectHash,
  //            weekNumber, weekHash, dayLabel, dayHash }
  function buildNavViewModel(level, context) {
    var ctx = context || {};
    var calendarHash = ctx.calendarHash || null;
    var progressHash = ctx.progressHash || null;
    var crumbs = [];

    if (calendarHash) crumbs.push({ label: 'Calendar', hash: calendarHash, current: false });
    crumbs.push({ label: 'Progress', hash: level === 'overall' ? null : progressHash, current: level === 'overall' });

    // U5.1 (CHANGE #004): every level — including the overall dashboard — now
    // carries the shared Back control. Its hash is only the cold-start
    // semantic fallback; a live session steps back through browser history.
    var back = level === 'overall' ? { label: 'Back', hash: calendarHash } : null;

    if (level === 'subject' || level === 'subjectWeek') {
      crumbs.push({
        label: ctx.subjectLabel || 'Subject',
        hash: level === 'subject' ? null : ctx.subjectHash,
        current: level === 'subject'
      });
      back = { label: 'Back to Progress', hash: progressHash };
    }

    if (level === 'subjectWeek') {
      crumbs.push({ label: 'Week ' + ctx.weekNumber, hash: null, current: true });
      back = { label: 'Back to ' + (ctx.subjectLabel || 'Subject'), hash: ctx.subjectHash };
    }

    if (level === 'week') {
      crumbs.push({ label: 'Week ' + ctx.weekNumber, hash: null, current: true });
      back = { label: 'Back to Progress', hash: progressHash };
    }

    if (level === 'day') {
      // A day belongs to a week: prefer that as the parent so the user can walk
      // Day -> Week -> Overall without the browser back button.
      if (ctx.weekNumber) {
        crumbs.push({
          label: 'Week ' + ctx.weekNumber,
          hash: ctx.weekHash || null,
          current: !ctx.dayLabel
        });
      }
      crumbs.push({ label: ctx.dayLabel || 'Day', hash: null, current: true });
      back = {
        label: ctx.weekNumber ? 'Back to Week ' + ctx.weekNumber : 'Back to Progress',
        hash: ctx.weekHash || progressHash
      };
    }

    return { level: level, back: back, crumbs: crumbs };
  }

  function renderNavHTML(viewModel) {
    var html = '<div class="progress-nav">';
    if (viewModel.back) {
      html += '<button type="button" class="back-button" data-action="back"' +
        (viewModel.back.hash ? ' data-hash="' + Renderer.escapeHtml(viewModel.back.hash) + '"' : '') + '>' +
        '<img class="back-icon" src="../assets/svg/back-arrow.svg" alt="" aria-hidden="true">' +
        Renderer.escapeHtml(viewModel.back.label || 'Back') + '</button>';
    }
    html += '<nav aria-label="Breadcrumb"><ol class="progress-crumbs">';
    viewModel.crumbs.forEach(function (crumb, index) {
      if (index > 0) html += '<li class="progress-crumb-sep" aria-hidden="true">›</li>';
      if (crumb.current || !crumb.hash) {
        html += '<li class="progress-crumb is-current" aria-current="page">' + Renderer.escapeHtml(crumb.label) + '</li>';
      } else {
        html += '<li class="progress-crumb"><button type="button" class="progress-crumb-link" data-action="navigate" data-hash="' +
          Renderer.escapeHtml(crumb.hash) + '">' + Renderer.escapeHtml(crumb.label) + '</button></li>';
      }
    });
    html += '</ol></nav>';
    html += '</div>';
    return html;
  }

  function renderProgressPageHTML(options) {
    var opts = options || {};
    var html = '<div class="progress-page">';
    if (opts.nav) html += renderNavHTML(opts.nav);
    if (opts.heading) {
      html += '<h1 class="progress-title">' + Renderer.escapeHtml(opts.heading) + '</h1>';
    }
    html += '<div class="progress-body">' + (opts.body || '') + '</div>';
    html += '</div>';
    return html;
  }

  return {
    buildNavViewModel: buildNavViewModel,
    renderNavHTML: renderNavHTML,
    renderProgressPageHTML: renderProgressPageHTML
  };
});
