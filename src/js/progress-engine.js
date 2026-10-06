/**
 * src/js/progress-engine.js — Study-Planner Phase 2 (Core Data + Storage Architecture)
 *
 * Derived progress calculations from:
 *   canonical syllabus (via data-engine) + persisted completion state (+ optional daily plans)
 *
 * Output nodes: { total, completed, remaining, percent }
 *   - percent = Math.round(completed / total * 100)
 *   - empty scope (0 eligible tasks) -> 0% (never NaN / Infinity / 100)
 *   - task types break / free / fixed are excluded from academic progress
 *   - graded assignments count like any other academic task
 *   - nothing is hard-coded; every number derives from task completion state
 *
 * Boundaries: no storage access, no UI logic, no planner logic.
 * Environment: browser global (globalThis.StudyPlanner.ProgressEngine) or
 * CommonJS (module.exports). Depends on data-engine (loaded first in browsers).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data-engine.js'));
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ProgressEngine = factory(root.StudyPlanner.DataEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DataEngine) {
  'use strict';

  if (!DataEngine) {
    throw new Error('ProgressEngine requires DataEngine to be loaded first');
  }

  var NON_ACADEMIC_TYPES = ['break', 'free', 'fixed'];

  function ProgressError(code, message) {
    var err = Error.call(this, message);
    this.name = 'ProgressError';
    this.code = code;
    this.message = message;
    if (err.stack) this.stack = err.stack;
  }
  ProgressError.prototype = Object.create(Error.prototype);
  ProgressError.prototype.constructor = ProgressError;

  function isEligibleForProgress(type) {
    return NON_ACADEMIC_TYPES.indexOf(type) === -1;
  }

  function percentFor(completed, total) {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  function makeNode(total, completed) {
    return {
      total: total,
      completed: completed,
      remaining: total - completed,
      percent: percentFor(completed, total)
    };
  }

  function isCompleted(taskId, completions) {
    var record = completions ? completions[taskId] : null;
    return !!(record && record.completed === true);
  }

  // Core primitive: progress over an arbitrary task list [{ taskId, type }].
  function progressForTasks(tasks, completions) {
    var total = 0;
    var completed = 0;
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (!isEligibleForProgress(task.type)) continue;
      total += 1;
      if (isCompleted(task.taskId, completions)) completed += 1;
    }
    return makeNode(total, completed);
  }

  function categoryProgress(tasks, completions) {
    var groups = {};
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (!isEligibleForProgress(task.type)) continue;
      if (!groups[task.type]) groups[task.type] = [];
      groups[task.type].push(task);
    }
    var result = {};
    Object.keys(groups).sort().forEach(function (type) {
      result[type] = progressForTasks(groups[type], completions);
    });
    return result;
  }

  // Internal: per-course scope pieces (tasks, byType, per-week nodes, overall).
  function courseScope(course, completions) {
    var weeks = {};
    var allTasks = [];
    var total = 0;
    var completed = 0;
    course.weeks.forEach(function (week) {
      var tasks = DataEngine.buildTasksForWeek(course, week.weekNumber);
      allTasks = allTasks.concat(tasks);
      var node = progressForTasks(tasks, completions);
      weeks['week-' + week.weekNumber] = node;
      total += node.total;
      completed += node.completed;
    });
    return {
      tasks: allTasks,
      byType: categoryProgress(allTasks, completions),
      weeks: weeks,
      overall: makeNode(total, completed)
    };
  }

  function progressForCourse(course, completions) {
    var scope = courseScope(course, completions);
    return {
      courseId: course.courseId,
      subjectId: course.subjectId,
      total: scope.overall.total,
      completed: scope.overall.completed,
      remaining: scope.overall.remaining,
      percent: scope.overall.percent,
      byType: scope.byType,
      weeks: scope.weeks
    };
  }

  function weekProgressForCourse(course, weekNumber, completions) {
    var week = course.weeks.find(function (w) { return w.weekNumber === weekNumber; });
    if (!week) throw new ProgressError('unknown_week', 'course "' + course.courseId + '" has no week ' + weekNumber);
    var tasks = DataEngine.buildTasksForWeek(course, weekNumber);
    var node = progressForTasks(tasks, completions);
    return {
      courseId: course.courseId,
      subjectId: course.subjectId,
      weekNumber: weekNumber,
      total: node.total,
      completed: node.completed,
      remaining: node.remaining,
      percent: node.percent,
      byType: categoryProgress(tasks, completions)
    };
  }

  function weekProgressAcrossSubjects(courses, weekNumber, completions) {
    var sorted = DataEngine.sortCourses(courses);
    var subjects = {};
    var total = 0;
    var completed = 0;
    sorted.forEach(function (course) {
      var week = course.weeks.find(function (w) { return w.weekNumber === weekNumber; });
      var node = week
        ? progressForTasks(DataEngine.buildTasksForWeek(course, weekNumber), completions)
        : makeNode(0, 0);
      subjects[course.subjectId] = node;
      total += node.total;
      completed += node.completed;
    });
    return {
      weekNumber: weekNumber,
      total: total,
      completed: completed,
      remaining: total - completed,
      percent: percentFor(completed, total),
      subjects: subjects
    };
  }

  function progressForAllCourses(courses, completions) {
    var sorted = DataEngine.sortCourses(courses);
    var subjects = {};
    var weekAccum = {};
    var allTasks = [];
    var total = 0;
    var completed = 0;
    sorted.forEach(function (course) {
      var scope = courseScope(course, completions);
      subjects[course.subjectId] = {
        subjectId: course.subjectId,
        courseId: course.courseId,
        total: scope.overall.total,
        completed: scope.overall.completed,
        remaining: scope.overall.remaining,
        percent: scope.overall.percent
      };
      allTasks = allTasks.concat(scope.tasks);
      total += scope.overall.total;
      completed += scope.overall.completed;
      Object.keys(scope.weeks).forEach(function (key) {
        if (!weekAccum[key]) weekAccum[key] = { total: 0, completed: 0 };
        weekAccum[key].total += scope.weeks[key].total;
        weekAccum[key].completed += scope.weeks[key].completed;
      });
    });
    var weeks = {};
    Object.keys(weekAccum).sort().forEach(function (key) {
      weeks[key] = makeNode(weekAccum[key].total, weekAccum[key].completed);
    });
    return {
      overall: makeNode(total, completed),
      byType: categoryProgress(allTasks, completions),
      subjects: subjects,
      weeks: weeks
    };
  }

  // Day progress requires a daily plan (Phase 3 materializes them). The plan's
  // own completed flags are seed values; eligibility filtering still applies.
  function dayProgress(plan, completions) {
    if (!plan || !Array.isArray(plan.tasks)) {
      throw new ProgressError('invalid_argument', 'dayProgress expects a daily plan document with a tasks array');
    }
    var tasks = plan.tasks.map(function (entry) {
      return { taskId: entry.taskId, type: entry.type };
    });
    var node = progressForTasks(tasks, completions);
    return {
      date: plan.date,
      total: node.total,
      completed: node.completed,
      remaining: node.remaining,
      percent: node.percent,
      byType: categoryProgress(tasks, completions)
    };
  }

  // progress.json node shape (3 fields — the shipped derived-cache schema).
  function toStoreNode(node) {
    return { total: node.total, completed: node.completed, percent: node.percent };
  }

  // Build a document shaped like data/progress/progress.json (derived cache).
  // The period comes from the caller — this engine never invents cycle dates.
  function buildProgressStore(courses, completions, options) {
    var opts = options || {};
    if (typeof opts.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(opts.startDate)) {
      throw new ProgressError('invalid_argument', 'options.startDate must be YYYY-MM-DD');
    }
    if (typeof opts.endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(opts.endDate)) {
      throw new ProgressError('invalid_argument', 'options.endDate must be YYYY-MM-DD');
    }
    var start = new Date(opts.startDate + 'T00:00:00Z');
    var end = new Date(opts.endDate + 'T00:00:00Z');
    var totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (totalDays < 1) {
      throw new ProgressError('invalid_argument', 'options.endDate must be on or after options.startDate');
    }
    var totalWeeks = Math.ceil(totalDays / 7);

    var sorted = DataEngine.sortCourses(courses);
    var subjects = {};
    var weekAccum = {};
    for (var w = 1; w <= totalWeeks; w++) {
      weekAccum['week-' + w] = { total: 0, completed: 0, subjects: {} };
    }

    var overallTotal = 0;
    var overallCompleted = 0;
    sorted.forEach(function (course) {
      var scope = courseScope(course, completions);
      var subjectDoc = {
        subjectId: course.subjectId,
        courseId: course.courseId,
        overall: toStoreNode(scope.overall),
        weeks: {}
      };
      course.weeks.forEach(function (week) {
        var key = 'week-' + week.weekNumber;
        var node = scope.weeks[key];
        if (!node) return;
        subjectDoc.weeks[key] = toStoreNode(node);
        if (weekAccum[key]) {
          weekAccum[key].total += node.total;
          weekAccum[key].completed += node.completed;
          weekAccum[key].subjects[course.subjectId] = toStoreNode(node);
        }
      });
      subjects[course.subjectId] = subjectDoc;
      overallTotal += scope.overall.total;
      overallCompleted += scope.overall.completed;
    });

    var weeks = {};
    Object.keys(weekAccum).sort().forEach(function (key) {
      weeks[key] = {
        overall: toStoreNode(makeNode(weekAccum[key].total, weekAccum[key].completed)),
        subjects: weekAccum[key].subjects
      };
    });

    return {
      schemaVersion: '1.0',
      progressType: 'month-progress-store',
      period: {
        startDate: opts.startDate,
        endDate: opts.endDate,
        totalDays: totalDays,
        totalWeeks: totalWeeks
      },
      subjects: subjects,
      weeks: weeks,
      overall: toStoreNode(makeNode(overallTotal, overallCompleted)),
      lastUpdated: opts.lastUpdated === undefined ? null : opts.lastUpdated
    };
  }

  // Convenience wrapper: bind courses + completions + optional daily plans once,
  // then query scopes. All calculations delegate to the pure functions above.
  function createProgressEngine(options) {
    var opts = options || {};
    if (!Array.isArray(opts.courses)) {
      throw new ProgressError('invalid_argument', 'options.courses must be an array');
    }
    var courses = DataEngine.sortCourses(opts.courses.map(function (course) {
      return DataEngine.normalizeCourse(course);
    }));
    var completions = opts.completions || {};
    var plansByDate = {};
    (opts.dailyPlans || []).forEach(function (plan) {
      if (plan && typeof plan.date === 'string') plansByDate[plan.date] = plan;
    });

    function requireSubject(subjectId) {
      var course = courses.find(function (c) { return c.subjectId === subjectId; });
      if (!course) throw new ProgressError('unknown_subject', 'no subject "' + subjectId + '"');
      return course;
    }

    return {
      getTaskCompletion: function (taskId) {
        return isCompleted(taskId, completions);
      },
      getOverallProgress: function () {
        return progressForAllCourses(courses, completions);
      },
      getSubjectProgress: function (subjectId) {
        return progressForCourse(requireSubject(subjectId), completions);
      },
      getWeekProgress: function (weekNumber, subjectId) {
        if (subjectId !== undefined) {
          return weekProgressForCourse(requireSubject(subjectId), weekNumber, completions);
        }
        return weekProgressAcrossSubjects(courses, weekNumber, completions);
      },
      getDayProgress: function (date) {
        var plan = plansByDate[date];
        return plan ? dayProgress(plan, completions) : null;
      },
      getCategoryProgress: function (scope) {
        var s = scope || {};
        if (s.subjectId !== undefined) {
          var course = requireSubject(s.subjectId);
          if (s.weekNumber !== undefined) {
            return categoryProgress(DataEngine.buildTasksForWeek(course, s.weekNumber), completions);
          }
          return categoryProgress(DataEngine.buildTasksForCourse(course), completions);
        }
        if (s.weekNumber !== undefined) {
          var tasks = [];
          courses.forEach(function (course) {
            var week = course.weeks.find(function (w) { return w.weekNumber === s.weekNumber; });
            if (week) tasks = tasks.concat(DataEngine.buildTasksForWeek(course, s.weekNumber));
          });
          return categoryProgress(tasks, completions);
        }
        return progressForAllCourses(courses, completions).byType;
      },
      buildProgressStore: function (storeOptions) {
        return buildProgressStore(courses, completions, storeOptions);
      }
    };
  }

  return {
    ProgressError: ProgressError,
    NON_ACADEMIC_TYPES: NON_ACADEMIC_TYPES,
    isEligibleForProgress: isEligibleForProgress,
    percentFor: percentFor,
    makeNode: makeNode,
    progressForTasks: progressForTasks,
    categoryProgress: categoryProgress,
    progressForCourse: progressForCourse,
    weekProgressForCourse: weekProgressForCourse,
    weekProgressAcrossSubjects: weekProgressAcrossSubjects,
    progressForAllCourses: progressForAllCourses,
    dayProgress: dayProgress,
    buildProgressStore: buildProgressStore,
    createProgressEngine: createProgressEngine
  };
});




