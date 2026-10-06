/**
 * src/js/data-engine.js — Study-Planner Phase 2 (Core Data + Storage Architecture)
 *
 * Canonical syllabus + daily plan access layer:
 *   - load / validate / normalize the canonical syllabus JSON (data/syllabus/*.json)
 *   - validate / read the daily plan JSON (data/schedule/daily/*.json)
 *   - own the stable task identity:   taskId = "<subjectId>:<weekNumber>:<sourceId>"
 *   - build the reusable task model used by planner / tracker / progress (Phase 3+)
 *
 * Boundaries:
 *   - no UI logic
 *   - no progress calculations (see progress-engine.js)
 *   - no persistence (see storage.js)
 *   - source values are never mutated, never invented; nulls stay null
 *
 * Environment: plain browser script (attaches to globalThis.StudyPlanner.DataEngine)
 * or CommonJS (module.exports). The Node-only directory loaders are exported
 * separately and throw a clear error in non-Node environments.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.DataEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COURSE_SCHEMA_VERSION = '1.0';
  var DAILY_SCHEMA_VERSION = '1.0';

  var ROW_CLASSES = ['video', 'video warn', 'assign', 'assign warn', 'graded'];

  // Types present in the canonical syllabus layer (Phase 1 vocabulary).
  var SYLLABUS_ITEM_TYPES = [
    'lecture', 'tutorial', 'solution', 'extra', 'orientation',
    'summary', 'activity', 'practice', 'graded', 'other'
  ];

  // Types reserved for planner-generated tasks (Phase 3+); never invented here.
  var PLANNER_TASK_TYPES = ['revision', 'review', 'break', 'free', 'fixed'];

  var TASK_TYPES = SYLLABUS_ITEM_TYPES.concat(PLANNER_TASK_TYPES);

  var WARNING_VOCABULARY = [
    'duration_unavailable', 'hindi_link_unavailable', 'question_count_unavailable',
    'open_failed', 'open_link_missing'
  ];

  var LINK_TYPES = ['hindi', 'english', 'seek'];

  var DAILY_STATUSES = ['not_started', 'in_progress', 'completed'];

  // Canonical display order of the four subjects (PROJECT_SPECIFICATION sections 1 / 13).
  var SUBJECT_ORDER = ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i'];

  var TASK_ID_PATTERN = /^([^:]+):(\d+):([^:]+)$/;

  function DataEngineError(code, message) {
    var err = Error.call(this, message);
    this.name = 'DataEngineError';
    this.code = code;
    this.message = message;
    if (err.stack) this.stack = err.stack;
  }
  DataEngineError.prototype = Object.create(Error.prototype);
  DataEngineError.prototype.constructor = DataEngineError;

  function fail(code, message) {
    throw new DataEngineError(code, message);
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isInt(value) {
    return typeof value === 'number' && Number.isInteger(value);
  }

  function isIsoString(value) {
    return typeof value === 'string' && !isNaN(Date.parse(value));
  }

  // Deep structural copy. Used so callers can never mutate engine state.
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // -------------------------------------------------------------------------
  // Course validation (canonical syllabus documents)
  // -------------------------------------------------------------------------

  function validateCourse(doc) {
    var errors = [];
    function add(path, message) { errors.push(path + ': ' + message); }

    if (!isPlainObject(doc)) {
      return { valid: false, errors: ['document: must be a plain object'] };
    }
    if (doc.schemaVersion !== COURSE_SCHEMA_VERSION) add('schemaVersion', 'expected "' + COURSE_SCHEMA_VERSION + '"');
    if (!isNonEmptyString(doc.courseId)) add('courseId', 'must be a non-empty string');
    if (!isNonEmptyString(doc.courseName)) add('courseName', 'must be a non-empty string');
    if (!isNonEmptyString(doc.subjectId)) {
      add('subjectId', 'must be a non-empty string');
    } else if (doc.subjectId.indexOf(':') !== -1) {
      add('subjectId', 'must not contain ":" (task id separator)');
    }

    if (!isPlainObject(doc.source)) {
      add('source', 'must be an object');
    } else {
      if (doc.source.type !== 'iitm-coursextract') add('source.type', 'expected "iitm-coursextract"');
      if (!isNonEmptyString(doc.source.file)) add('source.file', 'must be a non-empty string');
      if (!isNonEmptyString(doc.source.generatedAt)) add('source.generatedAt', 'must be a non-empty string');
      if (!isNonEmptyString(doc.source.status)) add('source.status', 'must be a non-empty string');
      if (!isPlainObject(doc.source.summary)) {
        add('source.summary', 'must be an object');
      } else {
        ['videos', 'assignments', 'graded', 'questions'].forEach(function (key) {
          if (!isInt(doc.source.summary[key]) || doc.source.summary[key] < 0) {
            add('source.summary.' + key, 'must be a non-negative integer');
          }
        });
        if (!isNonEmptyString(doc.source.summary.videoDuration)) {
          add('source.summary.videoDuration', 'must be a non-empty string');
        }
      }
    }

    if (!Array.isArray(doc.weeks)) {
      add('weeks', 'must be an array');
      return { valid: false, errors: errors };
    }
    if (doc.weekCount !== doc.weeks.length) add('weekCount', 'must equal weeks.length');
    if (doc.weeks.length !== 4) add('weeks', 'must contain exactly 4 weeks');

    doc.weeks.forEach(function (week, index) {
      validateCourseWeek(week, index, doc, errors);
    });

    return { valid: errors.length === 0, errors: errors };
  }

  function validateCourseWeek(week, index, doc, errors) {
    var path = 'weeks[' + index + ']';
    function add(p, message) { errors.push(path + (p ? '.' + p : '') + ': ' + message); }
    if (!isPlainObject(week)) { add('', 'must be an object'); return; }
    if (week.weekNumber !== index + 1) add('weekNumber', 'expected ' + (index + 1));
    if (isNonEmptyString(doc.subjectId)) {
      var expectedWeekId = doc.subjectId + '-w' + (index + 1);
      if (week.weekId !== expectedWeekId) add('weekId', 'expected "' + expectedWeekId + '"');
    }
    if (week.title !== 'Week ' + (index + 1)) add('title', 'expected "Week ' + (index + 1) + '"');
    if (!isPlainObject(week.source)) {
      add('source', 'must be an object');
    } else if (!isNonEmptyString(week.source.status)) {
      add('source.status', 'must be a non-empty string');
    }
    if (!Array.isArray(week.items)) { add('items', 'must be an array'); return; }
    if (isPlainObject(week.source) && week.source.itemCount !== week.items.length) {
      add('source.itemCount', 'must equal items.length');
    }
    var seen = {};
    week.items.forEach(function (item, itemIndex) {
      validateCourseItem(item, path + '.items[' + itemIndex + ']', week.weekNumber, errors, seen);
    });
  }

  function validateCourseItem(item, path, weekNumber, errors, seen) {
    function add(p, message) { errors.push(path + (p ? '.' + p : '') + ': ' + message); }
    if (!isPlainObject(item)) { add('', 'must be an object'); return; }

    if (!isNonEmptyString(item.sourceId)) {
      add('sourceId', 'must be a non-empty string');
    } else {
      if (item.sourceId.indexOf(':') !== -1) add('sourceId', 'must not contain ":" (task id separator)');
      if (Object.prototype.hasOwnProperty.call(seen, item.sourceId)) add('sourceId', 'duplicate inside its week');
      seen[item.sourceId] = true;
    }
    if (SYLLABUS_ITEM_TYPES.indexOf(item.type) === -1) add('type', 'unknown syllabus item type "' + item.type + '"');
    if (!isNonEmptyString(item.title)) add('title', 'must be a non-empty string');
    if (item.weekNumber !== weekNumber) add('weekNumber', 'must match the containing week (' + weekNumber + ')');

    if (item.duration === null) {
      if (item.durationSeconds !== null) add('durationSeconds', 'must be null when duration is null');
    } else if (!isNonEmptyString(item.duration)) {
      add('duration', 'must be null or a non-empty string');
    } else if (!isInt(item.durationSeconds) || item.durationSeconds <= 0) {
      add('durationSeconds', 'must be a positive integer when duration is set');
    }

    if (item.questionCount !== null && (!isInt(item.questionCount) || item.questionCount <= 0)) {
      add('questionCount', 'must be null or a positive integer');
    }
    if (typeof item.graded !== 'boolean') add('graded', 'must be a boolean');

    if (!Array.isArray(item.links)) {
      add('links', 'must be an array');
    } else {
      item.links.forEach(function (link, i) {
        if (!isPlainObject(link) || LINK_TYPES.indexOf(link.type) === -1 || !isNonEmptyString(link.url)) {
          add('links[' + i + ']', 'must be {type: ' + LINK_TYPES.join('|') + ', url: non-empty string}');
        }
      });
    }
    if (!Array.isArray(item.warnings)) {
      add('warnings', 'must be an array');
    } else {
      item.warnings.forEach(function (warning) {
        if (WARNING_VOCABULARY.indexOf(warning) === -1) add('warnings', 'unknown warning "' + warning + '"');
      });
    }
    if (!isPlainObject(item.source)) {
      add('source', 'must be an object');
    } else {
      if (!isInt(item.source.rowNumber) || item.source.rowNumber < 1) add('source.rowNumber', 'must be a positive integer');
      if (ROW_CLASSES.indexOf(item.source.rowClass) === -1) add('source.rowClass', 'unknown row class "' + item.source.rowClass + '"');
      if (!isNonEmptyString(item.source.details)) add('source.details', 'must be a non-empty string');
    }
  }

  // Validate + deep-copy. Source values are preserved verbatim; nothing is
  // defaulted, fabricated, or dropped.
  function normalizeCourse(doc) {
    var result = validateCourse(doc);
    if (!result.valid) {
      fail('invalid_course', 'Course document failed validation: ' + result.errors.slice(0, 5).join(' | '));
    }
    return clone(doc);
  }

  // -------------------------------------------------------------------------
  // Daily plan validation (data/schedule/daily/YYYY-MM-DD.json)
  // -------------------------------------------------------------------------

  function validateDailyPlan(doc) {
    var errors = [];
    function add(path, message) { errors.push(path + ': ' + message); }
    if (!isPlainObject(doc)) {
      return { valid: false, errors: ['document: must be a plain object'] };
    }

    if (doc.schemaVersion !== DAILY_SCHEMA_VERSION) add('schemaVersion', 'expected "' + DAILY_SCHEMA_VERSION + '"');
    if (doc.planType !== 'daily-study-plan') add('planType', 'expected "daily-study-plan"');
    if (!isNonEmptyString(doc.date) || !/^\d{4}-\d{2}-\d{2}$/.test(doc.date)) add('date', 'must be YYYY-MM-DD');
    if (!isInt(doc.dayNumber) || doc.dayNumber < 1) add('dayNumber', 'must be a positive integer');
    if (!isInt(doc.weekNumber) || doc.weekNumber < 1) {
      add('weekNumber', 'must be a positive integer');
    } else if (isInt(doc.dayNumber) && doc.dayNumber >= 1 && doc.weekNumber !== Math.ceil(doc.dayNumber / 7)) {
      add('weekNumber', 'must equal ceil(dayNumber / 7)');
    }
    if (DAILY_STATUSES.indexOf(doc.status) === -1) add('status', 'unknown status "' + doc.status + '"');

    var knownTaskIds = {};
    if (Array.isArray(doc.tasks)) {
      doc.tasks.forEach(function (t) {
        if (isPlainObject(t) && isNonEmptyString(t.taskId)) knownTaskIds[t.taskId] = true;
      });
    }
    if (!Array.isArray(doc.schedule)) {
      add('schedule', 'must be an array');
    } else {
      doc.schedule.forEach(function (block, i) {
        if (!isPlainObject(block) || !isNonEmptyString(block.start) ||
            !isNonEmptyString(block.end) || !isNonEmptyString(block.label)) {
          add('schedule[' + i + ']', 'must be {start, end, label} strings');
          return;
        }
        if (block.blockId !== undefined && !isNonEmptyString(block.blockId)) add('schedule[' + i + '].blockId', 'must be a non-empty string');
        if (block.focus !== undefined && !isNonEmptyString(block.focus)) add('schedule[' + i + '].focus', 'must be a non-empty string');
        if (block.subjectId !== undefined && block.subjectId !== null && !isNonEmptyString(block.subjectId)) {
          add('schedule[' + i + '].subjectId', 'must be null or a non-empty string');
        }
        if (block.category !== undefined && !isNonEmptyString(block.category)) add('schedule[' + i + '].category', 'must be a non-empty string');
        if (block.taskIds !== undefined) {
          if (!Array.isArray(block.taskIds)) {
            add('schedule[' + i + '].taskIds', 'must be an array');
            return;
          }
          var seenBlockTaskIds = {};
          block.taskIds.forEach(function (taskId, j) {
            if (!isNonEmptyString(taskId)) {
              add('schedule[' + i + '].taskIds[' + j + ']', 'must be a non-empty string');
            } else if (!knownTaskIds[taskId]) {
              add('schedule[' + i + '].taskIds[' + j + ']', 'references an unknown task "' + taskId + '"');
            } else if (seenBlockTaskIds[taskId]) {
              add('schedule[' + i + '].taskIds[' + j + ']', 'duplicate reference "' + taskId + '"');
            }
            seenBlockTaskIds[taskId] = true;
          });
        }
      });
    }

    if (!Array.isArray(doc.tasks)) {
      add('tasks', 'must be an array');
    } else {
      var seen = {};
      doc.tasks.forEach(function (task, i) {
        validateDailyTask(task, 'tasks[' + i + ']', errors, seen);
      });
    }

    // When the schedule declares task membership (Phase 3 plan format), every
    // task must be referenced by exactly one block.
    if (Array.isArray(doc.schedule) && Array.isArray(doc.tasks)) {
      var anyBlockDeclaresTaskIds = doc.schedule.some(function (b) {
        return isPlainObject(b) && Array.isArray(b.taskIds);
      });
      if (anyBlockDeclaresTaskIds) {
        var referenceCount = {};
        doc.schedule.forEach(function (b) {
          if (isPlainObject(b) && Array.isArray(b.taskIds)) {
            b.taskIds.forEach(function (taskId) {
              if (isNonEmptyString(taskId)) referenceCount[taskId] = (referenceCount[taskId] || 0) + 1;
            });
          }
        });
        doc.tasks.forEach(function (task, i) {
          if (!isPlainObject(task) || !isNonEmptyString(task.taskId)) return;
          if (!referenceCount[task.taskId]) {
            add('tasks[' + i + ']', 'must be referenced by exactly one schedule block');
          } else if (referenceCount[task.taskId] > 1) {
            add('tasks[' + i + ']', 'is referenced by more than one schedule block');
          }
        });
      }
    }

    if (!isPlainObject(doc.completion)) {
      add('completion', 'must be an object');
    } else if (Array.isArray(doc.tasks)) {
      var total = doc.tasks.length;
      var completed = doc.tasks.filter(function (t) { return isPlainObject(t) && t.completed === true; }).length;
      var expectedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
      if (!isInt(doc.completion.totalTasks) || doc.completion.totalTasks !== total) {
        add('completion.totalTasks', 'must equal tasks.length');
      }
      if (!isInt(doc.completion.completedTasks) || doc.completion.completedTasks !== completed) {
        add('completion.completedTasks', 'must equal the number of completed tasks');
      }
      if (!isInt(doc.completion.percent) || doc.completion.percent !== expectedPercent) {
        add('completion.percent', 'must be round(completed / total * 100), or 0 for an empty task list');
      }
    }

    if (!isPlainObject(doc.meta)) {
      add('meta', 'must be an object');
    } else {
      ['createdAt', 'updatedAt'].forEach(function (key) {
        if (!(doc.meta[key] === null || isIsoString(doc.meta[key]))) add('meta.' + key, 'must be null or an ISO timestamp');
      });
      if (typeof doc.meta.notes !== 'string') add('meta.notes', 'must be a string');
      if (doc.meta.generator !== undefined && !isNonEmptyString(doc.meta.generator)) {
        add('meta.generator', 'must be a non-empty string when present');
      }
    }

    return { valid: errors.length === 0, errors: errors };
  }

  function validateDailyTask(task, path, errors, seen) {
    function add(p, message) { errors.push(path + (p ? '.' + p : '') + ': ' + message); }
    if (!isPlainObject(task)) { add('', 'must be an object'); return; }

    if (!isNonEmptyString(task.taskId)) {
      add('taskId', 'must be a non-empty string');
    } else {
      var parsed = null;
      try { parsed = parseTaskId(task.taskId); } catch (e) { add('taskId', e.message); }
      if (parsed) {
        if (!isNonEmptyString(task.subjectId) || task.subjectId !== parsed.subjectId) add('subjectId', 'must match the subjectId inside taskId');
        if (!isInt(task.weekNumber) || task.weekNumber !== parsed.weekNumber) add('weekNumber', 'must match the weekNumber inside taskId');
        if (!isNonEmptyString(task.sourceId) || task.sourceId !== parsed.sourceId) add('sourceId', 'must match the sourceId inside taskId');
      }
      if (Object.prototype.hasOwnProperty.call(seen, task.taskId)) add('taskId', 'duplicate inside one day');
      seen[task.taskId] = true;
    }
    if (!isNonEmptyString(task.courseId)) add('courseId', 'must be a non-empty string');
    if (TASK_TYPES.indexOf(task.type) === -1) add('type', 'unknown task type "' + task.type + '"');
    if (!isNonEmptyString(task.title)) add('title', 'must be a non-empty string');
    if (typeof task.planned !== 'boolean') add('planned', 'must be a boolean');
    // Phase 3: canonical plan files omit completion state (plan is not state).
    // When present (export workflows), the fields must still be well-formed.
    if (task.completed !== undefined && typeof task.completed !== 'boolean') {
      add('completed', 'must be a boolean when present');
    }
    if (task.completedAt !== undefined && !(task.completedAt === null || isIsoString(task.completedAt))) {
      add('completedAt', 'must be null or an ISO timestamp when present');
    }
    if (task.durationSeconds !== undefined && task.durationSeconds !== null &&
        (!isInt(task.durationSeconds) || task.durationSeconds <= 0)) {
      add('durationSeconds', 'must be null or a positive integer when present');
    }
    if (task.questionCount !== undefined && task.questionCount !== null &&
        (!isInt(task.questionCount) || task.questionCount <= 0)) {
      add('questionCount', 'must be null or a positive integer when present');
    }
    if (task.planning !== undefined) {
      if (!isPlainObject(task.planning)) {
        add('planning', 'must be an object when present');
      } else {
        var planning = task.planning;
        ['videoMinutes', 'noteMinutes', 'questionMinutes'].forEach(function (key) {
          if (planning[key] !== null && planning[key] !== undefined &&
              (typeof planning[key] !== 'number' || planning[key] < 0)) {
            add('planning.' + key, 'must be null or a non-negative number');
          }
        });
        if (typeof planning.estimatedMinutes !== 'number' || planning.estimatedMinutes < 0) {
          add('planning.estimatedMinutes', 'must be a non-negative number');
        }
        if (!isNonEmptyString(planning.unitId)) add('planning.unitId', 'must be a non-empty string');
        if (typeof planning.sourceDurationMissing !== 'boolean') add('planning.sourceDurationMissing', 'must be a boolean');
        if (typeof planning.sourceQuestionsMissing !== 'boolean') add('planning.sourceQuestionsMissing', 'must be a boolean');
      }
    }
  }

  function normalizeDailyPlan(doc) {
    var result = validateDailyPlan(doc);
    if (!result.valid) {
      fail('invalid_daily_plan', 'Daily plan failed validation: ' + result.errors.slice(0, 5).join(' | '));
    }
    return clone(doc);
  }

  // -------------------------------------------------------------------------
  // Task identity + task model (Phase 2 decision: date-independent identity)
  //
  //   taskId = "<subjectId>:<weekNumber>:<sourceId>"
  //
  //   - weekNumber is required because some source labels repeat across weeks
  //     (e.g. english-i "Lecture 1" in weeks 1-3, mathematics-i extra practice)
  //   - the planned date is NOT part of the identity; it lives on the task as
  //     mutable planning state (plannedDate), so a task can move between days
  //     without becoming a different task.
  // -------------------------------------------------------------------------

  function buildTaskId(subjectId, weekNumber, sourceId) {
    if (!isNonEmptyString(subjectId) || subjectId.indexOf(':') !== -1) {
      fail('invalid_argument', 'subjectId must be a non-empty string without ":"');
    }
    if (!isInt(weekNumber) || weekNumber < 1) {
      fail('invalid_argument', 'weekNumber must be a positive integer');
    }
    if (!isNonEmptyString(sourceId) || sourceId.indexOf(':') !== -1) {
      fail('invalid_argument', 'sourceId must be a non-empty string without ":"');
    }
    return subjectId + ':' + weekNumber + ':' + sourceId;
  }

  function parseTaskId(taskId) {
    var m = TASK_ID_PATTERN.exec(isNonEmptyString(taskId) ? taskId : '');
    if (!m) {
      fail('invalid_task_id', 'taskId must match "<subjectId>:<weekNumber>:<sourceId>": ' + String(taskId));
    }
    return { subjectId: m[1], weekNumber: +m[2], sourceId: m[3] };
  }

  // The task model references canonical content by identity and carries only
  // planning/state fields. Content (type/title/duration/...) is NOT duplicated
  // beyond the title, which is a documented rendering convenience.
  function buildTaskForItem(course, week, item) {
    return {
      taskId: buildTaskId(course.subjectId, week.weekNumber, item.sourceId),
      subjectId: course.subjectId,
      courseId: course.courseId,
      weekNumber: week.weekNumber,
      sourceId: item.sourceId,
      type: item.type,
      title: item.title,
      plannedDate: null,
      completed: false,
      completedAt: null
    };
  }

  function buildTasksForWeek(course, weekNumber) {
    var week = course.weeks.find(function (w) { return w.weekNumber === weekNumber; });
    if (!week) fail('unknown_week', 'course "' + course.courseId + '" has no week ' + weekNumber);
    return week.items.map(function (item) {
      return buildTaskForItem(course, week, item);
    });
  }

  function buildTasksForCourse(course) {
    var tasks = [];
    course.weeks.forEach(function (week) {
      week.items.forEach(function (item) {
        tasks.push(buildTaskForItem(course, week, item));
      });
    });
    return tasks;
  }

  function courseRank(course) {
    var index = SUBJECT_ORDER.indexOf(course.subjectId);
    return index === -1 ? SUBJECT_ORDER.length : index;
  }

  // Deterministic course ordering: canonical subject order first, then by subjectId/courseId.
  function sortCourses(courses) {
    return courses.slice().sort(function (a, b) {
      var rankDiff = courseRank(a) - courseRank(b);
      if (rankDiff !== 0) return rankDiff;
      return compareStrings(String(a.subjectId), String(b.subjectId)) ||
        compareStrings(String(a.courseId), String(b.courseId));
    });
  }

  function buildAllTasks(courses) {
    return sortCourses(courses).reduce(function (list, course) {
      return list.concat(buildTasksForCourse(course));
    }, []);
  }

  // Merge a persisted completion record (or null) into a task copy.
  function applyCompletion(task, completion) {
    var completed = !!(completion && completion.completed === true);
    return {
      taskId: task.taskId,
      subjectId: task.subjectId,
      courseId: task.courseId,
      weekNumber: task.weekNumber,
      sourceId: task.sourceId,
      type: task.type,
      title: task.title,
      plannedDate: task.plannedDate === undefined ? null : task.plannedDate,
      completed: completed,
      completedAt: completed ? completion.completedAt : null
    };
  }

  // Normalize a daily plan task entry into the task model. The plan's own
  // completed/completedAt values are seed values; runtime completion truth
  // lives in storage.js (documented in docs/phase2-core-architecture.md).
  function taskFromDailyEntry(entry, date) {
    return {
      taskId: entry.taskId,
      subjectId: entry.subjectId,
      courseId: entry.courseId,
      weekNumber: entry.weekNumber,
      sourceId: entry.sourceId,
      type: entry.type,
      title: entry.title,
      plannedDate: date,
      completed: entry.completed === true,
      completedAt: entry.completedAt === null || entry.completedAt === undefined ? null : entry.completedAt
    };
  }

  // -------------------------------------------------------------------------
  // Engine factory — loaded documents in, query API out
  // -------------------------------------------------------------------------

  function createDataEngine(options) {
    var opts = options || {};
    if (!Array.isArray(opts.courses)) fail('invalid_argument', 'options.courses must be an array');
    if (opts.dailyPlans !== undefined && !Array.isArray(opts.dailyPlans)) {
      fail('invalid_argument', 'options.dailyPlans must be an array');
    }

    var courses = sortCourses(opts.courses.map(normalizeCourse));
    var byCourseId = {};
    var bySubjectId = {};
    courses.forEach(function (course) {
      if (Object.prototype.hasOwnProperty.call(byCourseId, course.courseId)) {
        fail('duplicate_course', 'duplicate courseId "' + course.courseId + '"');
      }
      if (Object.prototype.hasOwnProperty.call(bySubjectId, course.subjectId)) {
        fail('duplicate_course', 'duplicate subjectId "' + course.subjectId + '"');
      }
      byCourseId[course.courseId] = course;
      bySubjectId[course.subjectId] = course;
    });

    var plansByDate = {};
    (opts.dailyPlans || []).forEach(function (planDoc) {
      var plan = normalizeDailyPlan(planDoc);
      if (Object.prototype.hasOwnProperty.call(plansByDate, plan.date)) {
        fail('duplicate_daily_plan', 'duplicate daily plan for ' + plan.date);
      }
      plansByDate[plan.date] = plan;
    });

    function requireCourse(courseId) {
      var course = byCourseId[courseId];
      if (!course) fail('unknown_course', 'no course with courseId "' + courseId + '"');
      return course;
    }
    function requireWeek(course, weekNumber) {
      if (!isInt(weekNumber)) fail('invalid_argument', 'weekNumber must be an integer');
      var week = course.weeks.find(function (w) { return w.weekNumber === weekNumber; });
      if (!week) fail('unknown_week', 'course "' + course.courseId + '" has no week ' + weekNumber);
      return week;
    }
    function requireItem(course, week, sourceId) {
      var item = week.items.find(function (i) { return i.sourceId === sourceId; });
      if (!item) fail('unknown_item', 'week ' + week.weekNumber + ' of "' + course.courseId + '" has no item "' + sourceId + '"');
      return item;
    }

    return {
      // --- syllabus queries (all return deep copies) ---
      loadCourse: function (courseId) {
        return clone(requireCourse(courseId));
      },
      loadAllCourses: function () {
        return clone(courses);
      },
      getCourseBySubject: function (subjectId) {
        var course = bySubjectId[subjectId];
        if (!course) fail('unknown_course', 'no course with subjectId "' + subjectId + '"');
        return clone(course);
      },
      getWeek: function (courseId, weekNumber) {
        return clone(requireWeek(requireCourse(courseId), weekNumber));
      },
      getItem: function (courseId, weekNumber, sourceId) {
        var course = requireCourse(courseId);
        return clone(requireItem(course, requireWeek(course, weekNumber), sourceId));
      },
      getAllItems: function (courseId) {
        var course = requireCourse(courseId);
        return clone(course.weeks.reduce(function (list, week) {
          return list.concat(week.items);
        }, []));
      },
      getItemsByType: function (courseId, type) {
        return this.getAllItems(courseId).filter(function (item) { return item.type === type; });
      },
      getGradedItems: function (courseId) {
        return this.getAllItems(courseId).filter(function (item) { return item.graded === true; });
      },
      getNonGradedItems: function (courseId) {
        return this.getAllItems(courseId).filter(function (item) { return item.graded !== true; });
      },

      // --- task identity + task model ---
      buildTaskId: buildTaskId,
      parseTaskId: parseTaskId,
      getTask: function (taskId) {
        var parsed = parseTaskId(taskId);
        var course = bySubjectId[parsed.subjectId];
        if (!course) fail('unknown_task', 'no course for taskId "' + taskId + '"');
        var week = course.weeks.find(function (w) { return w.weekNumber === parsed.weekNumber; });
        if (!week) fail('unknown_task', 'no week ' + parsed.weekNumber + ' for taskId "' + taskId + '"');
        var item = week.items.find(function (i) { return i.sourceId === parsed.sourceId; });
        if (!item) fail('unknown_task', 'no syllabus item for taskId "' + taskId + '"');
        return buildTaskForItem(course, week, item);
      },
      buildTasksForCourse: function (courseId) {
        return buildTasksForCourse(requireCourse(courseId));
      },
      buildTasksForWeek: function (courseId, weekNumber) {
        return buildTasksForWeek(requireCourse(courseId), weekNumber);
      },
      buildAllTasks: function () {
        return buildAllTasks(courses);
      },

      // --- daily plans (Phase 3 populates them; the engine only reads) ---
      getDailyPlan: function (date) {
        var plan = plansByDate[date];
        return plan ? clone(plan) : null;
      },
      getPlannedTasks: function (date) {
        var plan = plansByDate[date];
        if (!plan) return [];
        return plan.tasks.map(function (entry) { return taskFromDailyEntry(entry, plan.date); });
      },
      getAllDailyPlans: function () {
        return Object.keys(plansByDate).sort().map(function (date) { return clone(plansByDate[date]); });
      }
    };
  }

  // -------------------------------------------------------------------------
  // Node-only file loaders (browser builds will load JSON via fetch in a
  // later phase; the engine core itself is environment-agnostic).
  // -------------------------------------------------------------------------

  function requireNodeModule(name) {
    if (typeof require !== 'function') {
      fail('environment', 'File loading is only available in Node: cannot require "' + name + '"');
    }
    return require(name);
  }

  function loadJsonFile(filePath) {
    var fs = requireNodeModule('fs');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  // Reads every course document (*.json except the empty course-template.json)
  // from data/syllabus, sorted by file name. Validation happens when the
  // documents reach the engine.
  function loadCoursesFromDirectory(dir) {
    var fs = requireNodeModule('fs');
    var path = requireNodeModule('path');
    var files = fs.readdirSync(dir).filter(function (file) {
      return /\.json$/i.test(file) && file !== 'course-template.json';
    }).sort();
    return files.map(function (file) {
      return loadJsonFile(path.join(dir, file));
    });
  }

  function loadDailyPlansFromDirectory(dir) {
    var fs = requireNodeModule('fs');
    var path = requireNodeModule('path');
    var files = fs.readdirSync(dir).filter(function (file) {
      return /\.json$/i.test(file);
    }).sort();
    return files.map(function (file) {
      return loadJsonFile(path.join(dir, file));
    });
  }

  // Browser loader (Phase 4): fetch a JSON document by URL. Rejects with a
  // clear DataEngineError when fetch is unavailable or the request fails, so
  // the UI can distinguish "no plan at this URL" (HTTP 404) from real errors.
  function loadJsonFromUrl(url, options) {
    var opts = options || {};
    var fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) {
      return Promise.reject(new DataEngineError('environment', 'fetch is not available in this environment'));
    }
    return Promise.resolve()
      .then(function () { return fetchImpl(url, { cache: 'no-store' }); })
      .then(function (response) {
        if (!response.ok) {
          throw new DataEngineError('fetch_failed', 'HTTP ' + response.status + ' for ' + url);
        }
        return response.json();
      })
      .catch(function (err) {
        if (err instanceof DataEngineError) throw err;
        throw new DataEngineError('fetch_failed',
          'Could not load ' + url + ': ' + (err && err.message ? err.message : String(err)));
      });
  }

  // Browser counterpart of loadCoursesFromDirectory (Phase 5): fetch the
  // canonical course documents by URL. Order follows the given list; the
  // engine's sortCourses applies canonical subject order afterwards.
  // Validation happens when the documents reach the engine (normalizeCourse).
  function loadCoursesFromUrls(urls, options) {
    if (!Array.isArray(urls) || urls.length === 0) {
      return Promise.reject(new DataEngineError('invalid_argument', 'loadCoursesFromUrls expects a non-empty array of URLs'));
    }
    return Promise.all(urls.map(function (url) {
      return loadJsonFromUrl(url, options);
    }));
  }

  return {
    DataEngineError: DataEngineError,
    COURSE_SCHEMA_VERSION: COURSE_SCHEMA_VERSION,
    DAILY_SCHEMA_VERSION: DAILY_SCHEMA_VERSION,
    ROW_CLASSES: ROW_CLASSES,
    SYLLABUS_ITEM_TYPES: SYLLABUS_ITEM_TYPES,
    PLANNER_TASK_TYPES: PLANNER_TASK_TYPES,
    TASK_TYPES: TASK_TYPES,
    WARNING_VOCABULARY: WARNING_VOCABULARY,
    LINK_TYPES: LINK_TYPES,
    DAILY_STATUSES: DAILY_STATUSES,
    SUBJECT_ORDER: SUBJECT_ORDER,
    TASK_ID_PATTERN: TASK_ID_PATTERN,

    validateCourse: validateCourse,
    normalizeCourse: normalizeCourse,
    validateDailyPlan: validateDailyPlan,
    normalizeDailyPlan: normalizeDailyPlan,

    buildTaskId: buildTaskId,
    parseTaskId: parseTaskId,
    buildTaskForItem: buildTaskForItem,
    buildTasksForWeek: buildTasksForWeek,
    buildTasksForCourse: buildTasksForCourse,
    buildAllTasks: buildAllTasks,
    applyCompletion: applyCompletion,
    taskFromDailyEntry: taskFromDailyEntry,
    sortCourses: sortCourses,

    createDataEngine: createDataEngine,

    loadJsonFile: loadJsonFile,
    loadJsonFromUrl: loadJsonFromUrl,
    loadCoursesFromUrls: loadCoursesFromUrls,
    loadCoursesFromDirectory: loadCoursesFromDirectory,
    loadDailyPlansFromDirectory: loadDailyPlansFromDirectory
  };
});







