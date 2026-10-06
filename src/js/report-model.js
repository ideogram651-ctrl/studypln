/**
 * src/js/report-model.js — Study-Planner Phase 6 (Report Model)
 *
 * Read-only interpretation of the materialised daily plans plus the canonical
 * syllabus, for four report scopes: overall, subject, week, day (and the weekly
 * progress calendar, which is the week scope plus positioned blocks).
 *
 * Boundaries:
 *   - every total / completed / remaining / percent value is produced by
 *     progress-engine.js. This file never counts, rounds or re-derives progress.
 *   - no storage access: the app passes the completion map in, read-only.
 *   - no UI, no DOM, no formatting decisions beyond the numbers themselves.
 *   - plans and completions are never mutated.
 *
 * All four scopes are built from the same three shared helpers (scopeTasks,
 * scopeNode, scopeTitle), so report types share one implementation instead of
 * repeating business logic.
 *
 * Environment: browser global (globalThis.StudyPlanner.ReportModel) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      ProgressEngine: require('./progress-engine.js'),
      Calendar: require('./calendar.js'),
      // U5.1 (CHANGE #001): the ONE authority that mints actionable block
      // completion ids — the model only READS records through it.
      TaskGroup: require('../components/tracker/task-group.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ReportModel = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var ProgressEngine = ns.ProgressEngine;
  var Calendar = ns.Calendar;
  // U5.1 (CHANGE #001): TaskGroup mints the actionable block id
  // ("<blockId>:<weekNumber>:<date>") in exactly one place. The model calls
  // that same pure function to RESOLVE records, so the tracker's write key
  // and the report's read key can never drift apart. TaskGroup is DOM-free at
  // load; no UI is involved here (browser: loaded before this module in
  // index.html, CommonJS: resolved through the require above).
  var TaskGroup = ns.TaskGroup;
  if (!ProgressEngine || !Calendar || !TaskGroup) {
    throw new Error('ReportModel requires ProgressEngine, Calendar and TaskGroup');
  }

  var SCHEMA = 'study-planner/report-model@1';

// ---- time handling -------------------------------------------------------
  //
  // The plan format stores 12-hour clock strings WITHOUT a meridiem, exactly as
  // the planner emits them ("11:00", "1:00", "10:30"). Read naively the sequence
  // decreases (660 -> 60), because the study day runs 11:00 -> 23:00.
  //
  // The meridiem is therefore recovered from the day's own ordering: the day is
  // known to run forward from its first block, so each time a clock value moves
  // backwards relative to the previous block we add one 12-hour cycle. This is
  // deterministic, uses only the data, and is exact for :15 / :30 boundaries —
  // no rounding, no invented times.

  var CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;

  // "11:00" -> 660 (minutes on the 12-hour dial). Null when unparseable.
  function clockToDialMinutes(value) {
    var match = CLOCK_PATTERN.exec(String(value == null ? '' : value).trim());
    if (!match) return null;
    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  // Monotonic minute offset from the day's first block start, per block.
  // Each entry: { block, startMinutes, endMinutes, durationMinutes }.
  function resolveSchedule(blocks) {
    var resolved = [];
    var previousStart = null;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var dialStart = clockToDialMinutes(block.start);
      var dialEnd = clockToDialMinutes(block.end);
      if (dialStart === null || dialEnd === null) continue; // unpositionable block
      var startMinutes = dialStart;
      if (previousStart !== null && startMinutes < previousStart) startMinutes += 720;
      var endMinutes = dialEnd;
      // The end sits after the start on the same forward-running clock.
      while (endMinutes < startMinutes) endMinutes += 720;
      if (endMinutes === startMinutes) endMinutes = startMinutes + 720;
      previousStart = startMinutes;
      resolved.push({
        block: block,
        startMinutes: startMinutes,
        endMinutes: endMinutes,
        durationMinutes: endMinutes - startMinutes
      });
    }
    return resolved;
  }

  // The visible window of a set of resolved blocks: earliest start to latest end.
  function resolveWindow(resolved) {
    if (!resolved.length) return { startMinutes: 0, endMinutes: 720, spanMinutes: 720 };
    var start = resolved[0].startMinutes;
    var end = resolved[0].endMinutes;
    for (var i = 1; i < resolved.length; i++) {
      if (resolved[i].startMinutes < start) start = resolved[i].startMinutes;
      if (resolved[i].endMinutes > end) end = resolved[i].endMinutes;
    }
    return { startMinutes: start, endMinutes: end, spanMinutes: end - start };
  }

// ---- deterministic colour keys -------------------------------------------
  //
  // Colour is a pure function of the data: a schedule block's subject (or its
  // non-academic category). The same subject is always the same colour, in the
  // viewer and in the exported HTML alike. No randomness, no generated hues.
  //
  // Tokens are names, not colours: the actual palette lives in CSS (the app) and
  // in the export stylesheet (standalone HTML), so both renderers stay in sync
  // while the model stays format-neutral.

  // Canonical subject colour tokens. Keyed by subjectId, in canonical order.
  var SUBJECT_COLOR_TOKENS = {
    'mathematics-i': 'math',
    'statistics-i': 'stats',
    'computational-thinking': 'ct',
    'english-i': 'english'
  };

  // Non-academic / planner-generated categories.
  var CATEGORY_COLOR_TOKENS = {
    revision: 'revision',
    review: 'review',
    practice: 'practice',
    break: 'rest',
    free: 'rest',
    fixed: 'rest'
  };

  function colorTokenFor(block) {
    if (!block) return 'rest';
    if (block.subjectId && SUBJECT_COLOR_TOKENS[block.subjectId]) {
      return SUBJECT_COLOR_TOKENS[block.subjectId];
    }
    if (block.category && CATEGORY_COLOR_TOKENS[block.category]) {
      return CATEGORY_COLOR_TOKENS[block.category];
    }
    if (block.subjectId) return 'subject-other'; // a subject not in the palette
    return 'rest';
  }

  // A block is academic work when it carries subject tasks; non-academic blocks
  // (break / free / fixed) are displayed but never counted.
  function isTaskBearing(block) {
    return !!(block && Array.isArray(block.taskIds) && block.taskIds.length > 0);
  }

// ---- shared scope helpers -------------------------------------------------
  //
  // Every report scope is assembled from these three primitives, which is what
  // keeps daily / weekly / subject / overall from duplicating business logic.

  function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function planTasks(plan, subjectId) {
    if (!plan) return [];
    var tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    if (!subjectId) return tasks;
    return tasks.filter(function (task) { return task.subjectId === subjectId; });
  }

  // The single place a scope's progress node is produced: progress-engine.
  function scopeNode(tasks, completions) {
    return ProgressEngine.progressForTasks(tasks, completions);
  }

  function sortByDate(plans) {
    return plans.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function tasksToSummary(tasks, completions) {
    return tasks.map(function (task) {
      var record = completions ? completions[task.taskId] : null;
      return {
        taskId: task.taskId,
        subjectId: task.subjectId,
        type: task.type,
        title: task.title,
        weekNumber: task.weekNumber,
        eligible: ProgressEngine.isEligibleForProgress(task.type),
        completed: !!(record && record.completed === true)
      };
    });
  }

// ---- the report model --------------------------------------------------
  //
  // createReportModel(context) binds, ONCE:
  //   courses     : canonical syllabus courses (data-engine order preserved)
  //   completions : the storage.js completion map (read-only)
  //   plans       : the materialised daily plans for the cycle
  //
  // and then exposes the four report scopes as pure accessors over that fixed
  // context. Because the context is bound once, the viewer and the export engine
  // consume *the same* model instance — there is no second calculation path.

  function indexPlans(plans) {
    var byDate = {};
    var list = [];
    (plans || []).forEach(function (plan) {
      if (!plan || typeof plan.date !== 'string') return;
      byDate[plan.date] = plan;
      list.push(plan);
    });
    return { byDate: byDate, list: sortByDate(list) };
  }

  function createReportModel(context) {
    var ctx = context || {};
    if (!Array.isArray(ctx.courses)) {
      throw new Error('createReportModel requires a courses array');
    }
    var courses = ctx.courses;
    var completions = ctx.completions || {};
    var indexed = indexPlans(ctx.plans);
    var plansByDate = indexed.byDate;
    var planList = indexed.list;

    function courseById(subjectId) {
      return courses.filter(function (course) {
        return course.subjectId === subjectId;
      })[0] || null;
    }

    // -- Day -------------------------------------------------------------
    // Day report: date identity, the resolved schedule blocks, the day's tasks
    // and the day's progress node (engine-produced).
    function buildDayReport(date) {
      var plan = plansByDate[date] || null;
      if (!plan) {
        return {
          kind: 'day', date: date, available: false,
          title: 'Daily report — ' + date,
          node: scopeNode([], completions), blocks: [], tasks: []
        };
      }
      var resolved = resolveSchedule(plan.schedule || []);
      var window = resolveWindow(resolved);
      var tasks = planTasks(plan, null);
      var blocks = resolved.map(function (entry) {
        var block = entry.block;
        var blockTasks = planTasks(plan, block.subjectId).filter(function (task) {
          return Array.isArray(block.taskIds) && block.taskIds.indexOf(task.taskId) !== -1;
        });
        var taskBearing = isTaskBearing(block);
        // U5.1 (CHANGE #001): actionable blocks (revision / review) carry their
        // U5 completion identity + resolved state so the weekly timetable —
        // on screen AND in the standalone export — reflects the Daily
        // Tracker's checkbox. The key is minted by the ONE authority
        // (TaskGroup.actionableTaskId) and resolved against the same bound
        // completion map every other scope reads; no progress arithmetic and
        // no second completion system lives here.
        var actionableId = TaskGroup.actionableTaskId(block, {
          date: plan.date,
          weekNumber: plan.weekNumber
        });
        var actionRecord = actionableId ? completions[actionableId] : null;
        return {
          blockId: block.blockId,
          label: block.label,
          focus: block.focus || '',
          category: block.category || null,
          subjectId: block.subjectId || null,
          startText: block.start,
          endText: block.end,
          startMinutes: entry.startMinutes,
          endMinutes: entry.endMinutes,
          durationMinutes: entry.durationMinutes,
          colorToken: colorTokenFor(block),
          isTaskBearing: taskBearing,
          taskCount: taskBearing ? blockTasks.length : 0,
          node: taskBearing ? scopeNode(blockTasks, completions) : null,
          actionableId: actionableId,
          actionCompleted: !!(actionRecord && actionRecord.completed === true)
        };
      });
      return {
        kind: 'day',
        available: true,
        date: plan.date,
        dayNumber: plan.dayNumber,
        weekNumber: plan.weekNumber,
        weekdayLong: Calendar.weekdayLong(plan.date),
        weekdayShort: Calendar.weekdayShort(plan.date),
        // Human title for the viewer heading and the exported document title.
        title: 'Daily report — ' + plan.date,
        window: window,
        node: scopeNode(tasks, completions),
        blocks: blocks,
        tasks: tasksToSummary(tasks, completions)
      };
    }

// -- Week ------------------------------------------------------------
    // Week report: the week's dates (from the plans themselves), each day's
    // node, and the week total. When subjectId is given the week is scoped to
    // that subject, reusing the same day/subject helpers — no second counting
    // path.
    function buildWeekReport(weekNumber, subjectId) {
      var weekPlans = planList.filter(function (plan) {
        return plan.weekNumber === weekNumber;
      });
      var days = weekPlans.map(function (plan) {
        var tasks = planTasks(plan, subjectId);
        var dayNode = scopeNode(tasks, completions);
        return {
          date: plan.date,
          dayNumber: plan.dayNumber,
          weekdayShort: Calendar.weekdayShort(plan.date),
          weekdayLong: Calendar.weekdayLong(plan.date),
          isToday: false, // presentation-neutral; the app owns "today"
          node: dayNode
        };
      });
      var subject = subjectId ? courseById(subjectId) : null;
      var allTasks = weekPlans.reduce(function (acc, plan) {
        return acc.concat(planTasks(plan, subjectId));
      }, []);
      var label = subject ? subject.courseName : 'All subjects';
      return {
        kind: 'week',
        weekNumber: weekNumber,
        subjectId: subjectId || null,
        subjectLabel: subject ? subject.courseName : 'All subjects',
        title: subject ? subject.courseName + ' — Week ' + weekNumber
          : 'Week ' + weekNumber,
        label: label,
        available: days.length > 0,
        startDate: days.length ? days[0].date : null,
        endDate: days.length ? days[days.length - 1].date : null,
        days: days,
        node: scopeNode(allTasks, completions)
      };
    }

    // -- Weekly progress calendar (the visual week report) ---------------
    // Same week scope, plus time-positioned blocks for each of the seven days.
    // This is the report the viewer renders as a timetable AND the report the
    // export engine renders standalone — one model, two renderers.
    function buildCalendarReport(weekNumber, options) {
      var opts = options || {};
      var subjectId = opts.subjectId || null;
      var week = buildWeekReport(weekNumber, subjectId);
      var weekPlans = planList.filter(function (plan) { return plan.weekNumber === weekNumber; });

      // One shared visible window across the whole week, so every column is
      // aligned to the same time axis (a day missing its first block must not
      // shift the grid).
      var allResolved = [];
      weekPlans.forEach(function (plan) {
        resolveSchedule(plan.schedule || []).forEach(function (entry) {
          allResolved.push(entry);
        });
      });
      var window = resolveWindow(allResolved);

      var days = weekPlans.map(function (plan) {
        var dayReport = buildDayReport(plan.date);
        return {
          date: plan.date,
          dayNumber: plan.dayNumber,
          weekdayShort: Calendar.weekdayShort(plan.date),
          weekdayLong: Calendar.weekdayLong(plan.date),
          node: dayReport.node,
          blocks: subjectId ? dayReport.blocks.filter(function (block) {
            return block.subjectId === subjectId;
          }) : dayReport.blocks
        };
      });

      return {
        kind: 'calendar',
        weekNumber: weekNumber,
        subjectId: subjectId,
        title: subjectId ? week.title : 'Weekly timetable — Week ' + weekNumber,
        available: days.length > 0,
        startDate: week.startDate,
        endDate: week.endDate,
        window: window,
        days: days,
        node: week.node
      };
    }

// -- Subject ----------------------------------------------------------
    // Subject report: identity from the canonical course document, per-week
    // nodes, the subject's tasks and the subject node (engine-produced).
    function buildSubjectReport(subjectId) {
      var course = courseById(subjectId);
      if (!course) {
        return { kind: 'subject', subjectId: subjectId, available: false,
          label: subjectId, title: 'Subject report — ' + subjectId,
          node: scopeNode([], completions), weeks: [], tasks: [] };
      }
      var weekNumbers = [];
      (course.weeks || []).forEach(function (week) {
        weekNumbers.push(week.weekNumber);
      });
      var tasks = (course.weeks || []).reduce(function (acc, week) {
        (week.items || []).forEach(function (item) {
          acc.push({ taskId: course.subjectId + ':' + week.weekNumber + ':' + item.sourceId,
            subjectId: course.subjectId, weekNumber: week.weekNumber,
            sourceId: item.sourceId, type: item.type, title: item.title });
        });
        return acc;
      }, []);
      var weeks = weekNumbers.map(function (weekNumber) {
        var weekTasks = tasks.filter(function (task) { return task.weekNumber === weekNumber; });
        return { weekNumber: weekNumber, node: scopeNode(weekTasks, completions) };
      });
      return {
        kind: 'subject',
        subjectId: course.subjectId,
        courseId: course.courseId,
        label: course.courseName,
        available: true,
        title: 'Subject report — ' + course.courseName,
        weekCount: course.weekCount,
        node: scopeNode(tasks, completions),
        weeks: weeks,
        tasks: tasksToSummary(tasks, completions)
      };
    }

    // -- Overall --------------------------------------------------------
    // Overall report: the whole cycle. Subject rows come from each subject's
    // own report; week rows from each week's own report. The overall node is the
    // engine's whole-course node, not a sum of the rows.
    function buildOverallReport(options) {
      var opts = options || {};
      var weeks = [];
      var weekNumbers = {};
      planList.forEach(function (plan) { weekNumbers[plan.weekNumber] = true; });
      Object.keys(weekNumbers).map(Number).sort(function (a, b) { return a - b; })
        .forEach(function (weekNumber) {
          var week = buildWeekReport(weekNumber, null);
          weeks.push({ weekNumber: weekNumber,
            startDate: week.startDate, endDate: week.endDate, node: week.node });
        });
      var subjects = courses.map(function (course) {
        var report = buildSubjectReport(course.subjectId);
        return {
          subjectId: report.subjectId, courseId: report.courseId,
          label: report.label, node: report.node
        };
      });
      var overallTasks = courses.reduce(function (acc, course) {
        return acc.concat(buildSubjectReport(course.subjectId).tasks);
      }, []);
      return {
        kind: 'overall',
        schemaVersion: SCHEMA,
        available: true,
        cycleStart: planList.length ? planList[0].date : null,
        cycleEnd: planList.length ? planList[planList.length - 1].date : null,
        dayCount: planList.length,
        heading: opts.heading || 'Overall progress',
        title: opts.heading || 'Overall progress',
        // progressForAllCourses nests the cycle node under `overall`; the report
        // exposes that node directly so a report and an engine week/day node
        // have the same shape.
        node: ProgressEngine.progressForAllCourses(courses, completions).overall,
        subjects: subjects,
        weeks: weeks,
        tasks: tasksToSummary(overallTasks, completions)
      };
    }

return {
      schemaVersion: SCHEMA,
      // time helpers (exported for the calendar renderer and its tests)
      clockToDialMinutes: clockToDialMinutes,
      resolveSchedule: resolveSchedule,
      resolveWindow: resolveWindow,
      colorTokenFor: colorTokenFor,
      isTaskBearing: isTaskBearing,
      // the four report scopes + the weekly calendar scope
      buildDayReport: buildDayReport,
      buildWeekReport: buildWeekReport,
      buildSubjectReport: buildSubjectReport,
      buildOverallReport: buildOverallReport,
      buildCalendarReport: buildCalendarReport,
      // fixed context accessors
      getCourses: function () { return clone(courses); },
      getPlans: function () { return clone(planList); },
      hasPlan: function (date) { return !!plansByDate[date]; },
      weekNumbers: function () {
        var seen = {};
        planList.forEach(function (plan) { seen[plan.weekNumber] = true; });
        return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
      }
    };
  }

  return {
    SCHEMA: SCHEMA,
    SUBJECT_COLOR_TOKENS: SUBJECT_COLOR_TOKENS,
    CATEGORY_COLOR_TOKENS: CATEGORY_COLOR_TOKENS,
    CLOCK_PATTERN: CLOCK_PATTERN,
    clockToDialMinutes: clockToDialMinutes,
    resolveSchedule: resolveSchedule,
    resolveWindow: resolveWindow,
    colorTokenFor: colorTokenFor,
    isTaskBearing: isTaskBearing,
    createReportModel: createReportModel
  };
});
