/**
 * src/components/reports/export-controls.js — Study-Planner Phase 6
 *
 * The export affordances: buttons that ask the export engine for a standalone
 * HTML document of the current report and hand it to the browser as a download.
 *
 * Read-only by construction: this module only ever calls
 * ExportEngine.renderStandaloneHTML, which reads the report model and returns a
 * string. It never writes storage, never marks a task complete, never modifies
 * a plan document.
 *
 * The download is performed with a Blob + object URL, so it needs no server and
 * leaves no temporary file on disk.
 *
 * Environment: browser global (globalThis.StudyPlanner.ExportControls) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Renderer: require('../../js/renderer.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ExportControls = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  if (!Renderer) throw new Error('ExportControls requires Renderer');

  var escapeHtml = Renderer.escapeHtml;

  // Buttons are rendered from a plain description so the markup is testable
  // without a browser.
  function buildControlsViewModel(options) {
    var opts = options || {};
    return {
      scope: opts.scope || 'overall',
      fileName: opts.fileName || 'report.html',
      actions: opts.actions || [{ action: 'export-html', label: 'Export HTML' }]
    };
  }

  function renderControlsHTML(viewModel) {
    var html = '<div class="rp-export" data-scope="' + escapeHtml(viewModel.scope) + '">';
    viewModel.actions.forEach(function (item) {
      html += '<button type="button" class="rp-btn" data-action="' +
        escapeHtml(item.action) + '" data-scope="' + escapeHtml(viewModel.scope) +
        '" data-file="' + escapeHtml(viewModel.fileName) + '">' +
        escapeHtml(item.label) + '</button>';
    });
    html += '</div>';
    return html;
  }

  // Builds the document and triggers a download. Returns the file name that was
  // suggested, so callers (and tests) can assert what was produced.
  function downloadHTML(exportEngine, html, fileName, doc) {
    var target = doc || (typeof document !== 'undefined' ? document : null);
    if (!target || typeof Blob !== 'function' || typeof URL === 'undefined') {
      return { ok: false, reason: 'environment', fileName: fileName, html: html };
    }
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = target.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    if (target.body && target.body.appendChild) target.body.appendChild(anchor);
    anchor.click();
    if (target.body && target.body.removeChild) target.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { ok: true, fileName: fileName, html: html };
  }

  return {
    buildControlsViewModel: buildControlsViewModel,
    renderControlsHTML: renderControlsHTML,
    downloadHTML: downloadHTML
  };
});
