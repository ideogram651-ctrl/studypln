/**
 * src/components/reports/report-viewer.js — Study-Planner Phase 6
 *
 * The Report Viewer: the in-app destination for the report model.
 *
 * It renders four read-only report scopes (overall, subject, week, day) plus the
 * weekly progress calendar. Every number it shows was produced by the report
 * model, which in turn delegated to progress-engine. This component performs no
 * counting and owns no report data — it is given a report and renders it.
 *
 * It is a VIEW inside the existing application (it renders into the existing
 * #view root through the existing router), not a second application.
 *
 * Environment: browser global (globalThis.StudyPlanner.ReportViewer) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Renderer: require('../../js/renderer.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ReportViewer = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Renderer = ns.Renderer;
  if (!Renderer) throw new Error('ReportViewer requires Renderer');

  var escapeHtml = Renderer.escapeHtml;

  // Report kind -> title + scope label, in one place so every entry point agrees.
  var SCOPE_TITLES = {
    overall: 'Overall progress',
    subject: 'Subject report',
    week: 'Weekly report',
    day: 'Daily report',
    calendar: 'Weekly Timetable Chart', // U3 §3.1 rename
    'calendar-select': 'Weekly Timetable Chart',
    'week-select': 'Weekly report' // U4 §4.1 four-week selection layer
  };

// ---- shared pieces ------------------------------------------------------

  function statCardHTML(node, label) {
    return '<div class="rp-stat">' +
      '<span class="rp-stat-num">' + node.percent + '%</span>' +
      '<span class="rp-stat-lbl">' + escapeHtml(label || 'Progress') + '</span>' +
      '<span class="rp-stat-meta">' + node.completed + ' / ' + node.total + ' tasks</span>' +
      '</div>';
  }

  function barHTML(node) {
    return '<div class="rp-bar" role="img" aria-label="' + node.percent + ' percent complete">' +
      '<span style="width:' + node.percent + '%"></span></div>';
  }

  function tableHTML(headers, rows) {
    var html = '<table class="rp-table"><thead><tr>';
    headers.forEach(function (head) {
      html += '<th' + (head.numeric ? ' class="rp-num"' : '') + '>' + escapeHtml(head.label) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      row.forEach(function (cell) {
        // A cell may carry an internal route link; otherwise it is plain text.
        var content = escapeHtml(cell.text);
        if (cell.link) {
          content = '<a class="rp-link" href="' + escapeHtml(cell.link) +
            '" data-action="navigate" data-hash="' + escapeHtml(cell.link) + '">' +
            escapeHtml(cell.text) + '</a>';
        }
        html += '<td' + (cell.numeric ? ' class="rp-num"' : '') + '>' + content + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function sectionHTML(title, body, extraClass) {
    return '<section class="rp-section' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<h3 class="rp-section-title">' + escapeHtml(title) + '</h3>' + body + '</section>';
  }

  function emptyHTML(message) {
    return '<div class="rp-empty">' + escapeHtml(message || 'No report data available.') + '</div>';
  }

// ---- scope renderers ---------------------------------------------------
  // Each takes the report-model output and produces HTML. None of them counts.

  function renderOverallHTML(report, options) {
    var opts = options || {};
    var links = opts.links || {};
    if (!report || !report.available) return emptyHTML();
    var html = '<div class="rp-overview">';
    html += statCardHTML(report.node, 'Overall');
    html += barHTML(report.node);
    html += '<p class="rp-note">Cycle ' + escapeHtml(report.cycleStart) + ' – ' +
      escapeHtml(report.cycleEnd) + ' · ' + report.dayCount + ' days</p>';
    html += '</div>';

    html += sectionHTML('Subjects', tableHTML([
      { label: 'Subject' }, { label: 'Completed', numeric: true },
      { label: 'Total', numeric: true }, { label: 'Progress', numeric: true }
    ], report.subjects.map(function (subject) {
      return [
        { text: subject.label, link: links.subject ? links.subject(subject.subjectId) : null },
        { text: subject.node.completed, numeric: true },
        { text: subject.node.total, numeric: true },
        { text: subject.node.percent + '%', numeric: true }
      ];
    })));

    html += sectionHTML('Weeks', tableHTML([
      { label: 'Week' }, { label: 'Dates' }, { label: 'Completed', numeric: true },
      { label: 'Total', numeric: true }, { label: 'Progress', numeric: true }
    ], report.weeks.map(function (week) {
      return [
        { text: 'Week ' + week.weekNumber, link: links.week ? links.week(week.weekNumber) : null },
        { text: week.startDate + ' – ' + week.endDate },
        { text: week.node.completed, numeric: true },
        { text: week.node.total, numeric: true },
        { text: week.node.percent + '%', numeric: true }
      ];
    })));
    return html;
  }

  function renderSubjectHTML(report, options) {
    var opts = options || {};
    var links = opts.links || {};
    if (!report || !report.available) return emptyHTML('Unknown subject.');
    var html = '<div class="rp-overview">';
    html += statCardHTML(report.node, report.label);
    html += barHTML(report.node);
    html += '</div>';
    html += sectionHTML('Weeks', tableHTML([
      { label: 'Week' }, { label: 'Completed', numeric: true },
      { label: 'Total', numeric: true }, { label: 'Progress', numeric: true }
    ], report.weeks.map(function (week) {
      return [
        { text: 'Week ' + week.weekNumber,
          link: links.subjectWeek ? links.subjectWeek(report.subjectId, week.weekNumber) : null },
        { text: week.node.completed, numeric: true },
        { text: week.node.total, numeric: true },
        { text: week.node.percent + '%', numeric: true }
      ];
    })));
    return html;
  }

function renderWeekHTML(report, options) {
    var opts = options || {};
    var links = opts.links || {};
    if (!report || !report.available) return emptyHTML();
    var html = '<div class="rp-overview">';
    html += statCardHTML(report.node, report.title);
    html += barHTML(report.node);
    html += '</div>';
    html += sectionHTML('Days', tableHTML([
      { label: 'Day' }, { label: 'Date' }, { label: 'Completed', numeric: true },
      { label: 'Total', numeric: true }, { label: 'Progress', numeric: true }
    ], report.days.map(function (day) {
      return [
        { text: day.weekdayLong },
        { text: day.date, link: links.day ? links.day(day.date) : null },
        { text: day.node.completed, numeric: true },
        { text: day.node.total, numeric: true },
        { text: day.node.percent + '%', numeric: true }
      ];
    })));
    return html;
  }

  function renderDayHTML(report, options) {
    var opts = options || {};
    if (!report || !report.available) return emptyHTML('No study plan available for this date.');
    var html = '<div class="rp-overview">';
    html += statCardHTML(report.node, 'Day ' + report.dayNumber);
    html += barHTML(report.node);
    html += '<p class="rp-note">' + escapeHtml(report.weekdayLong) + ' ' +
      escapeHtml(report.date) + ' · Week ' + report.weekNumber + '</p>';
    html += '</div>';

    // U4 §5.1: ONLY the Schedule section carries the spacing scope class
    // (.rp-sched); the Tasks section below stays on the base .rp-table rules
    // untouched (§5.2 — the Tasks table is locked).
    html += sectionHTML('Schedule', tableHTML([
      { label: 'Time' }, { label: 'Block' }, { label: 'Category' },
      { label: 'Tasks', numeric: true }, { label: 'Progress', numeric: true }
    ], report.blocks.map(function (block) {
      return [
        { text: block.startText + ' – ' + block.endText },
        { text: block.label },
        { text: block.category || '—' },
        { text: block.isTaskBearing ? block.taskCount : '—', numeric: true },
        { text: block.isTaskBearing ? block.node.percent + '%' : '—', numeric: true }
      ];
    })), 'rp-sched');

    if (opts.showTasks !== false) {
      html += sectionHTML('Tasks', tableHTML([
        { label: 'Task' }, { label: 'Type' }, { label: 'State' }
      ], report.tasks.map(function (task) {
        return [
          { text: task.title },
          { text: task.type },
          { text: task.completed ? 'Completed' : 'Pending' }
        ];
      })));
    }
    return html;
  }

  function renderForKind(kind, report, options) {
    switch (kind) {
      case 'overall': return renderOverallHTML(report, options);
      case 'subject': return renderSubjectHTML(report, options);
      case 'week': return renderWeekHTML(report, options);
      case 'day': return renderDayHTML(report, options);
      default: return emptyHTML();
    }
  }

function titleForKind(kind, report) {
    if (kind === 'day' && report && report.available) {
      return 'Daily report — ' + report.date;
    }
    return SCOPE_TITLES[kind] || 'Report';
  }

  // One entry point: given a kind + a report-model result, produce the whole
  // page section. The viewer shell (heading + body) stays uniform for all scopes.
  function renderReportHTML(kind, report, options) {
    var opts = options || {};
    var body;
    if (kind === 'calendar') {
      body = opts.calendarHTML || '';
    } else {
      body = renderForKind(kind, report, opts);
    }
    return '<div class="rp-root" data-report-kind="' + escapeHtml(kind) + '">' +
      '<h2 class="rp-heading">' + escapeHtml(titleForKind(kind, report)) + '</h2>' +
      body + '</div>';
  }

  // The reports landing page: a simple, link-based index of the scopes that
  // exist in this model. No invented statistics, no badges.
  function renderIndexHTML(available, options) {
    var opts = options || {};
    var links = opts.links || {};
    var html = '<div class="rp-index">';
    available.forEach(function (item) {
      html += '<a class="rp-index-item" href="' + escapeHtml(item.hash) +
        '" data-action="navigate" data-hash="' + escapeHtml(item.hash) + '">' +
        '<span class="rp-index-title">' + escapeHtml(item.label) + '</span>' +
        '<span class="rp-index-sub">' + escapeHtml(item.detail || '') + '</span>' +
        '</a>';
    });
    if (!available.length) html += emptyHTML(links.emptyMessage || 'No reports available.');
    html += '</div>';
    return html;
  }

  // U3 §3.2: the Weekly Timetable Chart opens on a WEEK-SELECTION view first —
  // all four study weeks, each with its canonical date range, before any chart.
  // Pure presentation: the caller supplies weeks built from the report model.
  function renderWeekSelectHTML(weeks, options) {
    var opts = options || {};
    var html = '';
    if (opts.note) {
      html += '<p class="rp-note">' + escapeHtml(opts.note) + '</p>';
    }
    html += '<div class="rp-week-select" role="list">';
    (weeks || []).forEach(function (week) {
      var hash = week.hash || ('#/reports/calendar/week/' + week.weekNumber);
      html += '<a class="rp-week-card" role="listitem" href="' + escapeHtml(hash) +
        '" data-action="navigate" data-hash="' + escapeHtml(hash) + '">' +
        '<span class="rp-week-card-title">Week ' + week.weekNumber + '</span>' +
        '<span class="rp-week-card-range">' +
        escapeHtml((week.startDate || '?') + ' – ' + (week.endDate || '?')) + '</span>' +
        '<span class="rp-week-card-meta">' +
        escapeHtml(week.available === false ? 'No plan data yet'
          // U4 §4.1: a future week shows its REAL zero progress, never hidden.
          : (week.percent != null ? week.percent + '% · ' : '') +
            (week.dayCount != null ? week.dayCount + ' study days' : 'Study week')) +
        '</span></a>';
    });
    html += '</div>';
    return html;
  }

  // ---- CHANGE-002 (U4): Reports breadcrumbs --------------------------------
  // Mirrors the working Progress pattern (ProgressDrilldown.buildNavViewModel):
  // an ordered list of {label, hash, current} crumbs. The VIEWER only builds
  // the model — the markup is emitted by ProgressDrilldown.renderNavHTML (the
  // exact renderer Progress uses), so Reports speaks the identical visual
  // language without a second breadcrumb system. Presentation only: the caller
  // supplies the hashes.
  //   index -> Calendar > Reports
  //   deep  -> Calendar > Reports > [current report]
  function buildReportNavViewModel(level, context) {
    var ctx = context || {};
    var crumbs = [];
    crumbs.push({ label: 'Calendar', hash: ctx.calendarHash || '#/calendar', current: false });
    crumbs.push({
      label: 'Reports',
      hash: level === 'index' ? null : (ctx.reportsHash || '#/reports'),
      current: level === 'index'
    });
    if (level !== 'index') {
      crumbs.push({
        label: ctx.title || SCOPE_TITLES[level] || 'Report',
        hash: null,
        current: true
      });
    }
    // U5.1 (CHANGE #004): Reports gains the shared Back control (history step;
    // cold-start fallback = the Reports index, or Calendar on the index itself).
    return {
      level: level,
      back: { label: 'Back', hash: level === 'index' ? null : (ctx.reportsHash || '#/reports') },
      crumbs: crumbs
    };
  }

  return {
    SCOPE_TITLES: SCOPE_TITLES,
    statCardHTML: statCardHTML,
    barHTML: barHTML,
    tableHTML: tableHTML,
    sectionHTML: sectionHTML,
    emptyHTML: emptyHTML,
    renderOverallHTML: renderOverallHTML,
    renderSubjectHTML: renderSubjectHTML,
    renderWeekHTML: renderWeekHTML,
    renderDayHTML: renderDayHTML,
    renderForKind: renderForKind,
    renderReportHTML: renderReportHTML,
    renderIndexHTML: renderIndexHTML,
    renderWeekSelectHTML: renderWeekSelectHTML,
    buildReportNavViewModel: buildReportNavViewModel
  };
});
