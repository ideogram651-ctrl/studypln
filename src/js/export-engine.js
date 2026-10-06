/**
 * src/js/export-engine.js — Study-Planner Phase 6 (Export Engine)
 *
 * Converts a Report Model into deterministic, standalone HTML.
 *
 * Rules:
 *   - consumes the report model only. It never recalculates progress, never
 *     reads storage, never touches a plan document.
 *   - deterministic: the same report model always produces byte-identical HTML
 *     (no Date.now(), no Math.random(), no iteration-order dependence).
 *   - standalone: the output embeds its own CSS, references no asset, needs no
 *     network, no localStorage and no Study-Planner runtime.
 *   - read-only: building HTML cannot alter application progress.
 *
 * The export surface is HTML only, as specified. The report model stays
 * format-neutral so a future PDF/CSV writer can consume the same input.
 *
 * Environment: browser global (globalThis.StudyPlanner.ExportEngine) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ExportEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Fixed export stamp. Deliberately NOT a clock read: determinism outranks
  // "generated at" freshness, and the report's own dates are inside the body.
  var EXPORT_GENERATOR = 'Study Planner — report model v1';

// ---- standalone stylesheet ---------------------------------------------
  // Embedded verbatim in the exported file. It reproduces the application theme
  // (near-black background, soft surfaces, purple accent) and the SAME block
  // colour tokens as reports.css, so an exported calendar is visually identical
  // to the one on screen. Colour lives here for the export, in reports.css for
  // the app; the tokens themselves are the shared contract.

  function reportStylesheet() {
    return [
      ':root{--bg:#050507;--surface:rgba(255,255,255,.075);--surface-2:rgba(255,255,255,.10);',
      '--border:rgba(255,255,255,.085);--border-strong:rgba(255,255,255,.16);',
      '--text:#f7f8fa;--muted:#b9b6c9;--faint:#8d8aa0;--accent:#7755e8;--accent-soft:#b9a6ff;',
      '--complete:#5fe0b0;--partial:#a58bff;',
      '--tok-math:#e8a317;--tok-stats:#1fb59a;--tok-ct:#7c6cf0;--tok-english:#3d8ce0;',
      '--tok-revision:#4fbf5a;--tok-review:#8a6fd4;--tok-practice:#d98324;--tok-rest:#4a4a5c;',
      '--tok-subject-other:#6b6b80;--radius:28px;--radius-sm:16px;',
      '--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
      '*{box-sizing:border-box;}',
      'body{margin:0;padding:28px 20px 56px;background-color:var(--bg);color:var(--text);',
      'font-family:var(--font);line-height:1.5;-webkit-font-smoothing:antialiased;}',
      '.wrap{max-width:1080px;margin:0 auto;}',
      'header.rp-head{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:baseline;',
      'justify-content:space-between;margin-bottom:22px;}',
      'h1{font-size:24px;margin:0;letter-spacing:-.02em;}',
      '.rp-meta{font-size:12px;color:var(--faint);letter-spacing:.04em;text-transform:uppercase;}',
      '.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);',
      'padding:20px 22px;margin-bottom:18px;backdrop-filter:blur(8px);}',
      'h2{font-size:15px;margin:0 0 14px;color:var(--muted);font-weight:600;',
      'letter-spacing:.06em;text-transform:uppercase;}',
      '.stat-row{display:flex;flex-wrap:wrap;gap:22px;align-items:center;}',
      '.stat-num{font-size:30px;font-weight:650;letter-spacing:-.02em;}',
      '.stat-lbl{font-size:12px;color:var(--faint);text-transform:uppercase;letter-spacing:.05em;}',
      '.bar{position:relative;height:8px;border-radius:999px;background:var(--surface-2);',
      'overflow:hidden;margin-top:14px;}',
      '.bar > span{position:absolute;inset:0 auto 0 0;border-radius:999px;',
      'background:linear-gradient(90deg,var(--accent),var(--accent-soft));display:block;}',
      'table{width:100%;border-collapse:collapse;font-size:14px;}',
      'th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;',
      'color:var(--faint);font-weight:600;padding:0 10px 9px 0;border-bottom:1px solid var(--border);}',
      'td{padding:9px 10px 9px 0;border-bottom:1px solid var(--border);vertical-align:top;}',
      'tr:last-child td{border-bottom:0;}',
      '.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.muted{color:var(--muted);}.faint{color:var(--faint);}',
      'a{color:var(--accent-soft);}',
      'footer.rp-foot{margin-top:26px;font-size:12px;color:var(--faint);text-align:center;}'
    ].join('');
  }

// Calendar-specific export styles. Positioning is proportional to real
  // minutes: the renderer writes --top / --height percentages of the day
  // window, so 120 minutes is exactly twice 60 minutes by construction.
  function calendarStylesheet() {
    return [
      '.cal{border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;',
      'background:var(--surface);}',
      '.cal-head{display:grid;grid-template-columns:64px repeat(7,1fr);border-bottom:1px solid var(--border-strong);}',
      '.cal-head .gut{background:transparent;}',
      '.cal-day-head{padding:10px 6px;text-align:center;font-size:12px;letter-spacing:.08em;',
      'text-transform:uppercase;color:var(--muted);border-left:1px solid var(--border);}',
      '.cal-day-head b{display:block;font-size:16px;color:var(--text);letter-spacing:0;margin-top:2px;}',
      '.cal-body{display:grid;grid-template-columns:64px repeat(7,1fr);position:relative;}',
      '.cal-axis{position:relative;border-right:1px solid var(--border-strong);}',
      '.cal-axis>span{position:absolute;left:0;right:0;transform:translateY(-50%);',
      'font-size:10px;color:var(--faint);text-align:center;font-variant-numeric:tabular-nums;}',
      '.cal-axis>span.is-first{transform:translateY(0);}',
      '.cal-axis>span.is-last{transform:translateY(-100%);}',
      /* U4 §3.4: the hour and the meridiem stack, with AM cool / PM warm — */
      /* the same treatment the on-screen chart uses. */
      '.cal-axis .cal-tick-hour{display:block;}',
      '.cal-axis .cal-tick-meridiem{display:block;font-size:11px;font-weight:700;',
      'letter-spacing:.04em;margin-top:1px;}',
      '.cal-axis .cal-tick-meridiem.is-am{color:#4aa8ff;}',
      '.cal-axis .cal-tick-meridiem.is-pm{color:#f7c541;}',
      '.cal-col{position:relative;border-left:1px solid var(--border);min-height:640px;}',
      '.cal-gridline{position:absolute;left:0;right:0;height:0;border-top:1px dashed rgba(255,255,255,.07);}',
      '.blk{position:absolute;left:3px;right:3px;border-radius:9px;padding:5px 7px;overflow:hidden;',
      'font-size:11px;line-height:1.25;border-left:3px solid rgba(0,0,0,.35);',
      'background:var(--tok-rest);color:#0b0b12;}',
      '.blk .t{font-weight:650;display:block;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;}',
      '.blk.is-short{padding:2px 6px;}',
      '.blk.is-short .h{display:none;}',
      '.blk.is-tiny{padding:1px 6px;border-radius:6px;}',
      '.blk .h{opacity:.75;display:block;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;font-variant-numeric:tabular-nums;}',
      '.blk.is-rest{background:var(--tok-rest);color:#cfcfe0;}',
      '.blk.is-math{background:var(--tok-math);}',
      '.blk.is-stats{background:var(--tok-stats);}',
      '.blk.is-ct{background:var(--tok-ct);color:#fff;}',
      '.blk.is-english{background:var(--tok-english);color:#fff;}',
      '.blk.is-revision{background:var(--tok-revision);}',
      '.blk.is-review{background:var(--tok-review);color:#fff;}',
      '.blk.is-practice{background:var(--tok-practice);}',
      '.blk.is-subject-other{background:var(--tok-subject-other);color:#fff;}',
      '.blk[data-state="partial"]{opacity:.82;}',
      '.blk[data-state="complete"]{opacity:.55;}',
      '.blk[data-state="complete"] .t{text-decoration:line-through;}',
      '.blk[data-state="none"]{opacity:.9;}',
      '@media (max-width:900px){body{padding:18px 12px 40px;}.cal-body,.cal-head{grid-template-columns:48px repeat(7,minmax(96px,1fr));}}'
    ].join('');
  }

// ---- shared calendar geometry -----------------------------------------
  // Position is a pure function of real minutes, so it is identical in the app
  // and in the export (and directly unit-testable):
  //
  //   top    = (startMinutes - windowStart) / span * 100   (percent)
  //   height = durationMinutes / span * 100               (percent)
  //
  // Because both are ratios of the same span, an 11:00-13:00 block is exactly
  // twice the height of 11:00-12:00 by construction. Times are never rounded.

  function geometry(entry, window) {
    var span = window && window.spanMinutes > 0 ? window.spanMinutes : 720;
    var top = ((entry.startMinutes - window.startMinutes) / span) * 100;
    var height = (entry.durationMinutes / span) * 100;
    return {
      topPercent: top,
      heightPercent: height,
      // also expose raw minutes so tests can assert exact arithmetic
      startMinutes: entry.startMinutes,
      durationMinutes: entry.durationMinutes
    };
  }

  // Progress state for a block: 'complete' | 'partial' | 'none'.
  // Derived from the block's engine node; a non-task block is 'none' unless it
  // is an actionable (revision / review) block with a U5 completion record —
  // U5.1 (CHANGE #001). Identical rule to progress-calendar.js blockState, and
  // both consume the SAME report model, so the exported chart and the on-screen
  // chart can never disagree.
  function blockState(block) {
    if (block.actionableId) return block.actionCompleted ? 'complete' : 'none';
    if (!block.isTaskBearing || !block.node) return 'none';
    if (block.node.percent >= 100) return 'complete';
    if (block.node.completed > 0) return 'partial';
    return 'none';
  }

  // Absolute minutes -> "HH:MM" for the axis and block captions.
  // The 24-hour formatClock stays as-is: the DAILY export's schedule table is a
  // locked, separate scope and keeps its original rendering.
  function formatClock(minutes) {
    var total = ((minutes % 1440) + 1440) % 1440;
    var hh = Math.floor(total / 60);
    var mm = total % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  // U4 §3.4: the exported chart must match the on-screen chart's human 12-hour
  // axis (mirror of progress-calendar.js formatClock): 660 -> "11:00 AM",
  // 780 -> "1:00 PM", 1380 -> "11:00 PM" — never a raw 13:00/14:00 sequence.
  // Pure display; block geometry and windows still use raw minutes.
  function clockParts(minutes) {
    var total = ((minutes % 1440) + 1440) % 1440;
    var hh = Math.floor(total / 60);
    var mm = total % 60;
    var meridiem = hh >= 12 ? 'PM' : 'AM';
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    var hour = h12 + ':' + (mm < 10 ? '0' : '') + mm;
    return { label: hour + ' ' + meridiem, hour: hour, meridiem: meridiem };
  }

  function formatClock12(minutes) {
    return clockParts(minutes).label;
  }

  // Axis labels every 60 minutes across the day window, in the 12-hour form
  // with the meridiem split out so CSS can colour AM/PM differently.
  function axisTicks(window) {
    var start = window.startMinutes;
    var end = window.endMinutes;
    var span = window.spanMinutes;
    var ticks = [];
    // Align to the hour on the dial, then step by 60 minutes.
    var first = Math.ceil(start / 60) * 60;
    for (var m = first; m <= end; m += 60) {
      var parts = clockParts(m);
      ticks.push({
        minutes: m,
        topPercent: ((m - start) / span) * 100,
        label: parts.label,
        hour: parts.hour,
        meridiem: parts.meridiem
      });
    }
    return ticks;
  }

  function fileStamp(report) {
    var base = report && report.date ? report.date
      : (report && report.kind === 'overall' ? 'overall' : 'report');
    return String(base);
  }

// ---- calendar render ----------------------------------------------------

  // Axis labels are centred on their hour; the first and last are inset instead,
// so neither is clipped against the container edges. U4 §3.4: the hour and
// the meridiem are stacked, with AM/PM on their own span so the stylesheet can
// colour them differently — same visual language as the on-screen chart.
function renderAxisHTML(ticks) {
  var html = '<div class="cal-axis">';
  ticks.forEach(function (tick, index) {
    var edge = '';
    if (index === 0) edge = ' is-first';
    if (index === ticks.length - 1) edge = ' is-last';
    var meridiem = tick.meridiem || '';
    var meridiemClass = meridiem === 'AM' ? ' is-am' : (meridiem === 'PM' ? ' is-pm' : '');
    html += '<span class="' + edge + '" style="top:' + tick.topPercent + '%">' +
      '<span class="cal-tick-hour">' +
      escapeHtml(tick.hour != null ? tick.hour : tick.label) + '</span>' +
      (meridiem ? '<span class="cal-tick-meridiem' + meridiemClass + '">' +
        escapeHtml(meridiem) + '</span>' : '') +
      '</span>';
  });
  html += '</div>';
  return html;
}

  // U4 §3.5: break-only categories are a PRESENTATION filter for the exported
  // chart, mirroring ProgressCalendar.isBreakOnlyBlock (break / free / fixed =
  // zero-capacity, non-academic grey blocks). The export is standalone, so it
  // carries its own copy of the predicate rather than importing a component.
  // The report model still carries every block, and the other export scopes
  // (daily schedule table etc.) still render break rows as they always did.
  var BREAK_ONLY_CATEGORIES = { break: true, free: true, fixed: true };

  function isBreakOnlyBlock(block) {
    return !!(block && BREAK_ONLY_CATEGORIES[block.category]);
  }

function renderCalendarHTML(report) {
    var window = report.window;
    var html = '<div class="cal">';
    html += '<div class="cal-head"><div class="gut"></div>';
    // Day header number is the cycle's day number (same as the app viewer), not
    // the day-of-month, so both renderers label the columns identically.
    report.days.forEach(function (day) {
      var dayNum = day.dayNumber || (day.date ? Number(day.date.slice(8)) : '');
      html += '<div class="cal-day-head">' + escapeHtml(day.weekdayShort) +
        '<b>' + (dayNum || escapeHtml(day.date)) + '</b></div>';
    });
    html += '</div>';

    html += '<div class="cal-body">';
    html += renderAxisHTML(axisTicks(window));

    report.days.forEach(function (day) {
      html += '<div class="cal-col">';
      axisTicks(window).forEach(function (tick) {
        html += '<div class="cal-gridline" style="top:' + tick.topPercent + '%"></div>';
      });
      day.blocks.forEach(function (block) {
        // U4 §3.5: break-only blocks are not drawn in the exported chart —
        // the on-screen chart already hides them, and the export must match.
        if (isBreakOnlyBlock(block)) return;
        var geo = geometry(block, window);
        var state = blockState(block);
        // Size class from the real duration, so a short block drops the optional
        // caption rather than letting it spill outside the block.
        var size = block.durationMinutes < 45 ? ' is-short' : '';
        if (block.durationMinutes <= 25) size = ' is-short is-tiny';
        var timeText = formatClock12(block.startMinutes) + ' – ' +
          formatClock12(block.endMinutes);
        html += '<div class="blk is-' + escapeHtml(block.colorToken) + size +
          '" data-state="' + escapeHtml(state) + '"' +
          ' style="top:' + geo.topPercent + '%;height:' + geo.heightPercent + '%"' +
          ' title="' + escapeHtml(block.label + ' · ' + timeText) + '">' +
          '<span class="t">' + escapeHtml(block.label) + '</span>' +
          '<span class="h">' + escapeHtml(timeText) + '</span>' +
          '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderCalendarReport(report) {
    var html = '';
    if (!report.available || !report.days.length) {
      html += '<div class="card"><p class="muted">No study plan is available for this week.</p></div>';
      return html;
    }
    html += '<div class="card">';
    html += '<h2>Weekly timetable</h2>';
    html += '<p class="muted">' + escapeHtml(report.startDate + ' – ' + report.endDate) +
      ' · ' + report.days.length + ' days</p>';
    html += renderCalendarHTML(report);
    html += '</div>';

    html += '<div class="card"><h2>Week progress</h2>';
    html += statRow(report.node);
    html += '<table><thead><tr><th>Day</th><th>Date</th><th class="num">Completed</th>' +
      '<th class="num">Total</th><th class="num">Progress</th></tr></thead><tbody>';
    report.days.forEach(function (day) {
      html += '<tr><td>' + escapeHtml(day.weekdayLong) + '</td><td class="muted">' +
        escapeHtml(day.date) + '</td><td class="num">' + day.node.completed + '</td>' +
        '<td class="num">' + day.node.total + '</td><td class="num">' + day.node.percent + '%</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function statRow(node) {
    return '<div class="stat-row">' +
      '<div><div class="stat-num">' + node.percent + '%</div><div class="stat-lbl">Progress</div></div>' +
      '<div><div class="stat-num">' + node.completed + '</div><div class="stat-lbl">Completed</div></div>' +
      '<div><div class="stat-num">' + node.total + '</div><div class="stat-lbl">Total tasks</div></div>' +
      '<div><div class="stat-num">' + node.remaining + '</div><div class="stat-lbl">Remaining</div></div>' +
      '</div><div class="bar"><span style="width:' + node.percent + '%"></span></div>';
  }

// ---- daily / weekly / subject / overall render ---------------------------

  // The document <title>/<h1> already carries the report title, so a scope
  // renderer must not repeat it as a second heading.
  function renderDayReport(report) {
    var html = '';
    if (!report.available) {
      html += '<div class="card"><p class="muted">No study plan is available for this date.</p></div>';
      return html;
    }
    html += '<div class="card"><h2>Day progress</h2>' + statRow(report.node) + '</div>';
    html += '<div class="card"><h2>Schedule</h2><table><thead><tr><th>Time</th><th>Block</th>' +
      '<th>Category</th><th class="num">Tasks</th><th class="num">Progress</th></tr></thead><tbody>';
    report.blocks.forEach(function (block) {
      html += '<tr><td class="muted">' +
        escapeHtml(formatClock(block.startMinutes) + ' – ' + formatClock(block.endMinutes)) + '</td>' +
        '<td>' + escapeHtml(block.label) + '</td>' +
        '<td class="faint">' + escapeHtml(block.category || '—') + '</td>' +
        '<td class="num">' + (block.isTaskBearing ? block.taskCount : '—') + '</td>' +
        '<td class="num">' + (block.isTaskBearing ? block.node.percent + '%' : '—') + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="card"><h2>Tasks</h2><table><thead><tr><th>Task</th><th>Type</th>' +
      '<th>State</th></tr></thead><tbody>';
    report.tasks.forEach(function (task) {
      html += '<tr><td>' + escapeHtml(task.title) + '</td><td class="faint">' +
        escapeHtml(task.type) + '</td><td>' + (task.completed ? 'Completed' : 'Pending') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderWeekReport(report) {
    var html = '';
    if (!report.available) {
      html += '<div class="card"><p class="muted">No study plan is available for this week.</p></div>';
      return html;
    }
    html += '<div class="card"><h2>Week progress</h2>' + statRow(report.node) + '</div>';
    html += '<div class="card"><h2>Days</h2><table><thead><tr><th>Day</th><th>Date</th>' +
      '<th class="num">Completed</th><th class="num">Total</th><th class="num">Progress</th>' +
      '</tr></thead><tbody>';
    report.days.forEach(function (day) {
      html += '<tr><td>' + escapeHtml(day.weekdayLong) + '</td><td class="muted">' +
        escapeHtml(day.date) + '</td><td class="num">' + day.node.completed + '</td>' +
        '<td class="num">' + day.node.total + '</td><td class="num">' + day.node.percent + '%</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

function renderSubjectReport(report) {
    var html = '';
    if (!report.available) {
      html += '<div class="card"><p class="muted">Unknown subject.</p></div>';
      return html;
    }
    html += '<div class="card"><h2>' + escapeHtml(report.label) + '</h2>' +
      statRow(report.node) + '</div>';
    html += '<div class="card"><h2>Weeks</h2><table><thead><tr><th>Week</th>' +
      '<th class="num">Completed</th><th class="num">Total</th><th class="num">Progress</th>' +
      '</tr></thead><tbody>';
    report.weeks.forEach(function (week) {
      html += '<tr><td>Week ' + week.weekNumber + '</td><td class="num">' + week.node.completed +
        '</td><td class="num">' + week.node.total + '</td><td class="num">' + week.node.percent +
        '%</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderOverallReport(report) {
    var html = '';
    html += '<div class="card"><h2>Cycle ' + escapeHtml(report.cycleStart || '') + ' – ' +
      escapeHtml(report.cycleEnd || '') + '</h2>' + statRow(report.node) + '</div>';
    html += '<div class="card"><h2>Subjects</h2><table><thead><tr><th>Subject</th>' +
      '<th class="num">Completed</th><th class="num">Total</th><th class="num">Progress</th>' +
      '</tr></thead><tbody>';
    report.subjects.forEach(function (subject) {
      html += '<tr><td>' + escapeHtml(subject.label) + '</td><td class="num">' +
        subject.node.completed + '</td><td class="num">' + subject.node.total + '</td>' +
        '<td class="num">' + subject.node.percent + '%</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="card"><h2>Weeks</h2><table><thead><tr><th>Week</th><th>Dates</th>' +
      '<th class="num">Completed</th><th class="num">Total</th><th class="num">Progress</th>' +
      '</tr></thead><tbody>';
    report.weeks.forEach(function (week) {
      html += '<tr><td>Week ' + week.weekNumber + '</td><td class="muted">' +
        escapeHtml(week.startDate + ' – ' + week.endDate) + '</td><td class="num">' +
        week.node.completed + '</td><td class="num">' + week.node.total + '</td><td class="num">' +
        week.node.percent + '%</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

// ---- public API --------------------------------------------------------

  // Document assembly. The output has no external reference of any kind: no
  // <link>, no <script src>, no fetch, no image. Everything it needs is inline.
  function renderStandaloneHTML(report, options) {
    if (!report || typeof report !== 'object') {
      throw new Error('renderStandaloneHTML requires a report model object');
    }
    var opts = options || {};
    var body;
    switch (report.kind) {
      case 'day': body = renderDayReport(report); break;
      case 'week': body = renderWeekReport(report); break;
      case 'subject': body = renderSubjectReport(report); break;
      case 'calendar': body = renderCalendarReport(report); break;
      case 'overall': body = renderOverallReport(report); break;
      default: throw new Error('unknown report kind: ' + String(report.kind));
    }
    var title = opts.title || report.title || report.kind || 'Study Planner report';
    var scope = opts.scope || report.kind;
    return [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>' + escapeHtml(title) + '</title>',
      '<style>' + reportStylesheet() + calendarStylesheet() + '</style>',
      '</head><body><div class="wrap">',
      '<header class="rp-head"><h1>' + escapeHtml(title) + '</h1>',
      '<div class="rp-meta">' + escapeHtml(scope) + ' report</div></header>',
      body,
      '<footer class="rp-foot">' + escapeHtml(EXPORT_GENERATOR) + ' · read-only export</footer>',
      '</div></body></html>'
    ].join('\n');
  }

  // One call per scope. Each consumes the model and returns a finished document.
  function exportDaily(model, date, options) {
    return renderStandaloneHTML(model.buildDayReport(date), options);
  }

  function exportWeek(model, weekNumber, options) {
    return renderStandaloneHTML(model.buildWeekReport(weekNumber), options);
  }

  function exportSubject(model, subjectId, options) {
    return renderStandaloneHTML(model.buildSubjectReport(subjectId), options);
  }

  function exportOverall(model, options) {
    return renderStandaloneHTML(model.buildOverallReport(), options);
  }

  // The weekly progress calendar travels the SAME pipeline:
  // daily plans -> report model -> calendar report -> export engine -> HTML.
  function exportCalendar(model, weekNumber, options) {
    return renderStandaloneHTML(model.buildCalendarReport(weekNumber), options);
  }

  // Suggested file names, following docs/export-system.md section 3.
  function suggestFileName(kind, discriminator) {
    var slug = String(discriminator == null ? '' : discriminator)
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (kind === 'day') return 'reports/daily/' + slug + '.html';
    if (kind === 'week') return 'reports/weekly/Week-' + slug + '.html';
    if (kind === 'subject') return 'reports/subjects/' + slug + '.Progress.html';
    if (kind === 'overall') return 'reports/overall/IITM-Overall-Progress.html';
    if (kind === 'calendar') return 'reports/weekly/Week-' + slug + '-Timetable.html';
    return 'reports/report.html';
  }

  return {
    EXPORT_GENERATOR: EXPORT_GENERATOR,
    escapeHtml: escapeHtml,
    geometry: geometry,
    blockState: blockState,
    formatClock: formatClock,
    formatClock12: formatClock12,
    clockParts: clockParts,
    isBreakOnlyBlock: isBreakOnlyBlock,
    axisTicks: axisTicks,
    renderCalendarHTML: renderCalendarHTML,
    renderStandaloneHTML: renderStandaloneHTML,
    exportDaily: exportDaily,
    exportWeek: exportWeek,
    exportSubject: exportSubject,
    exportOverall: exportOverall,
    exportCalendar: exportCalendar,
    suggestFileName: suggestFileName
  };
});
