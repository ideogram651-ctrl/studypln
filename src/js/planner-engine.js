/**
 * src/js/planner-engine.js — Study-Planner Phase 3 (Planner Engine)
 *
 * Deterministic planning engine implementing the Phase 3 specification:
 *   canonical syllabus + planner configuration + start date
 *     -> 28-day study plan -> one document per day (materialized by tools/generate-plans.js)
 *
 * Fixed formulas (from the specification — not configurable by preference):
 *   video workload   = V minutes            (source durationSeconds / 60)
 *   note workload    = V x noteMultiplier   (0.67)          -> lecture workload = V x 1.67
 *   question load    = Q x questionMinutes  (1.5)           -> per question
 *   learning unit    = lecture workload + question workload (lecture + its activities)
 *   days 1-5         = new content (balanced around weekly/5, learning units never split)
 *   day 6            = practice          day 7 = graded assignment
 *
 * Documented planning fallbacks (planner estimates, never source data):
 *   - a video row with no source duration uses fallbackVideoMinutes (20) and is
 *     flagged in planning metadata (sourceDurationMissing: true)
 *   - a question row with no source count uses fallbackQuestionCount (5) and is
 *     flagged (sourceQuestionsMissing: true)
 *
 * The golden Day-1 reference (2026-10-02) is encoded in config.goldenFirstDay and
 * anchored exactly; weeks 2-4 and the remaining days are balanced deterministically.
 *
 * Environment: browser global (globalThis.StudyPlanner.PlannerEngine) or CommonJS.
 * Depends on data-engine (loaded first in browsers). No UI, no storage access.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data-engine.js'));
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.PlannerEngine = factory(root.StudyPlanner.DataEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DataEngine) {
  'use strict';

  if (!DataEngine) {
    throw new Error('PlannerEngine requires DataEngine to be loaded first');
  }

  function PlannerError(code, message) {
    var err = Error.call(this, message);
    this.name = 'PlannerError';
    this.code = code;
    this.message = message;
    if (err.stack) this.stack = err.stack;
  }
  PlannerError.prototype = Object.create(Error.prototype);
  PlannerError.prototype.constructor = PlannerError;

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Display-friendly rounding (stored planning minutes only — computations stay full precision).
  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function isValidDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !isNaN(Date.parse(value + 'T00:00:00Z'));
  }

  function addDaysToDateString(dateString, offset) {
    if (!isValidDateString(dateString)) throw new PlannerError('invalid_argument', 'date must be YYYY-MM-DD');
    var base = Date.parse(dateString + 'T00:00:00Z');
    return new Date(base + offset * 86400000).toISOString().slice(0, 10);
  }

    // -------------------------------------------------------------------------
  // Fixed daily timetable (Phase 3 specification section 19 — do not redesign)
  // Times are 12-hour clock strings without AM/PM, exactly as specified.
  // Only `study` blocks carry academic capacity; every other block has 0.
  // -------------------------------------------------------------------------

  var DEFAULT_TIMETABLE = [
    { blockId: 'mathematics', start: '11:00', end: '1:00', label: 'Mathematics', focus: 'New Lectures + Questions', category: 'study', subjectId: 'mathematics-i', capacityMinutes: 120 },
    { blockId: 'lunch-rest', start: '1:00', end: '1:30', label: 'Lunch / Rest', focus: 'Lunch / Rest', category: 'break', subjectId: null, capacityMinutes: 0 },
    { blockId: 'statistics', start: '1:30', end: '3:00', label: 'Statistics', focus: 'New Lectures + Questions', category: 'study', subjectId: 'statistics-i', capacityMinutes: 90 },
    { blockId: 'walk-refresh', start: '3:00', end: '3:30', label: 'Walk / Refresh', focus: 'Walk / Refresh', category: 'break', subjectId: null, capacityMinutes: 0 },
    { blockId: 'computational-thinking', start: '3:30', end: '5:00', label: 'Computational Thinking', focus: 'New Content + Practice', category: 'study', subjectId: 'computational-thinking', capacityMinutes: 90 },
    { blockId: 'free-refresh', start: '5:00', end: '6:00', label: 'Free / Refresh', focus: 'Free / Refresh', category: 'free', subjectId: null, capacityMinutes: 0 },
    { blockId: 'fixed-time', start: '6:00', end: '8:00', label: 'FIXED TIME', focus: 'Temple + Food + Personal', category: 'fixed', subjectId: null, capacityMinutes: 0 },
    { blockId: 'relax', start: '8:00', end: '8:30', label: 'Relax', focus: 'Relax', category: 'break', subjectId: null, capacityMinutes: 0 },
    { blockId: 'english', start: '8:30', end: '9:15', label: 'English', focus: 'Lecture + Activity', category: 'study', subjectId: 'english-i', capacityMinutes: 45 },
    { blockId: 'refresh', start: '9:15', end: '9:30', label: 'Refresh', focus: 'Refresh', category: 'break', subjectId: null, capacityMinutes: 0 },
    { blockId: 'revision', start: '9:30', end: '10:30', label: 'Math + Statistics Revision', focus: 'Weak Topics + Error Log', category: 'revision', subjectId: null, capacityMinutes: 0 },
    { blockId: 'daily-review', start: '10:30', end: '11:00', label: 'Daily Review', focus: "Today's learning + Tomorrow Plan", category: 'review', subjectId: null, capacityMinutes: 0 }
  ];

  // -------------------------------------------------------------------------
  // Centralized planner configuration (Phase 3 specification section 31)
  // -------------------------------------------------------------------------

  var DEFAULT_PLANNER_CONFIG = {
    // workload formulas
    noteMultiplier: 0.67,
    questionMinutes: 1.5,
    // weekly cycle
    newContentDays: 5,
    practiceDay: 6,
    gradedDay: 7,
    daysPerWeek: 7,
    weeks: 4,
    // documented planning estimates (used only when source data is missing)
    fallbackVideoMinutes: 20,
    fallbackQuestionCount: 5,
    // day-6 / day-7 study-block focus labels
    practiceFocus: 'Practice + Consolidation',
    gradedFocus: 'Graded Assignment',
    // fixed structure
    timetable: DEFAULT_TIMETABLE,
    // Golden Day-1 reference (2026-10-02) — exact sourceId sequences from
    // reference/daily-tracker Day-1, applied to week 1 / day 1 only.
    goldenFirstDay: {
      'mathematics-i': ['L1.1', 'AQ1.1', 'L1.2', 'AQ1.2', 'L1.3', 'AQ1.3', 'L1.4', 'AQ1.4'],
      'statistics-i': ['Course Overview', 'L1.1', 'AQ1.1', 'L1.2', 'AQ1.2'],
      'computational-thinking': ['L1.1', 'AQ1.1', 'L1.2', 'AQ1.2'],
      'english-i': ['Lecture 1', 'AQ1.1']
    }
  };

    function createPlannerConfig(overrides) {
    if (overrides !== undefined && !isPlainObject(overrides)) {
      throw new PlannerError('invalid_config', 'config overrides must be an object');
    }
    overrides = overrides || {};
    Object.keys(overrides).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_PLANNER_CONFIG, key)) {
        throw new PlannerError('invalid_config', 'unknown config key "' + key + '"');
      }
    });

    var config = JSON.parse(JSON.stringify(DEFAULT_PLANNER_CONFIG));
    Object.keys(overrides).forEach(function (key) {
      config[key] = JSON.parse(JSON.stringify(overrides[key]));
    });

    ['noteMultiplier', 'questionMinutes', 'fallbackVideoMinutes', 'fallbackQuestionCount'].forEach(function (key) {
      if (typeof config[key] !== 'number' || config[key] < 0) {
        throw new PlannerError('invalid_config', key + ' must be a non-negative number');
      }
    });
    ['newContentDays', 'practiceDay', 'gradedDay', 'daysPerWeek', 'weeks'].forEach(function (key) {
      if (typeof config[key] !== 'number' || !Number.isInteger(config[key]) || config[key] < 1) {
        throw new PlannerError('invalid_config', key + ' must be a positive integer');
      }
    });
    if (config.practiceDay !== config.newContentDays + 1) {
      throw new PlannerError('invalid_config', 'practiceDay must be newContentDays + 1');
    }
    if (config.gradedDay !== config.practiceDay + 1) {
      throw new PlannerError('invalid_config', 'gradedDay must be practiceDay + 1');
    }
    if (config.daysPerWeek < config.gradedDay) {
      throw new PlannerError('invalid_config', 'daysPerWeek must cover the graded day');
    }

    if (!Array.isArray(config.timetable) || config.timetable.length === 0) {
      throw new PlannerError('invalid_config', 'timetable must be a non-empty array');
    }
    var seenBlockIds = {};
    config.timetable.forEach(function (block) {
      if (!isPlainObject(block)) throw new PlannerError('invalid_config', 'timetable blocks must be objects');
      ['blockId', 'start', 'end', 'label', 'focus', 'category'].forEach(function (key) {
        if (typeof block[key] !== 'string' || block[key].length === 0) {
          throw new PlannerError('invalid_config', 'timetable block "' + block.blockId + '" is missing ' + key);
        }
      });
      if (block.subjectId !== null && (typeof block.subjectId !== 'string' || block.subjectId.length === 0)) {
        throw new PlannerError('invalid_config', 'timetable block "' + block.blockId + '" has an invalid subjectId');
      }
      if (typeof block.capacityMinutes !== 'number' || block.capacityMinutes < 0) {
        throw new PlannerError('invalid_config', 'timetable block "' + block.blockId + '" has an invalid capacityMinutes');
      }
      if (seenBlockIds[block.blockId]) throw new PlannerError('invalid_config', 'duplicate blockId "' + block.blockId + '"');
      seenBlockIds[block.blockId] = true;
    });

    if (!isPlainObject(config.goldenFirstDay)) {
      throw new PlannerError('invalid_config', 'goldenFirstDay must be an object');
    }
    Object.keys(config.goldenFirstDay).forEach(function (subjectId) {
      if (!Array.isArray(config.goldenFirstDay[subjectId]) || config.goldenFirstDay[subjectId].length === 0) {
        throw new PlannerError('invalid_config', 'goldenFirstDay["' + subjectId + '"] must be a non-empty array');
      }
      config.goldenFirstDay[subjectId].forEach(function (sourceId) {
        if (typeof sourceId !== 'string' || sourceId.length === 0) {
          throw new PlannerError('invalid_config', 'goldenFirstDay["' + subjectId + '"] entries must be non-empty strings');
        }
      });
    });

    return config;
  }

  // Academic capacity for a subject = sum of its study-block capacities.
  function capacityForSubject(config, subjectId) {
    var capacity = 0;
    var found = false;
    config.timetable.forEach(function (block) {
      if (block.category === 'study' && block.subjectId === subjectId) {
        capacity += block.capacityMinutes;
        found = true;
      }
    });
    if (!found) {
      throw new PlannerError('invalid_config', 'no study block for subject "' + subjectId + '"');
    }
    return capacity;
  }

    // -------------------------------------------------------------------------
  // Workload formulas (specification sections 6-11)
  //
  //   lecture workload = V + V x noteMultiplier        (V x 1.67 at default config)
  //   question load    = Q x questionMinutes           (1.5 min per question)
  //   learning unit    = lecture workload + question workload
  //
  // Workload class derives from the source row class (video vs assign), not the
  // app-level type: e.g. "Programming" is an assign row even though its type is
  // "other". Null source values never become source data — fallback estimates
  // are configuration values and are flagged in planning metadata.
  // -------------------------------------------------------------------------

  function isVideoRow(item) {
    var rowClass = item.source ? item.source.rowClass : undefined;
    if (typeof rowClass === 'string') return rowClass.indexOf('video') === 0;
    return item.type !== 'activity' && item.type !== 'practice' && item.type !== 'graded';
  }

  function isQuestionRow(item) {
    var rowClass = item.source ? item.source.rowClass : undefined;
    if (typeof rowClass === 'string') {
      return rowClass.indexOf('assign') === 0 || rowClass === 'graded';
    }
    return item.type === 'activity' || item.type === 'practice' || item.type === 'graded';
  }

  function computeVideoMinutes(item, config) {
    if (typeof item.durationSeconds === 'number' && item.durationSeconds > 0) {
      return { minutes: item.durationSeconds / 60, missing: false };
    }
    return { minutes: config.fallbackVideoMinutes, missing: true };
  }

  function computeQuestionMinutes(item, config) {
    if (typeof item.questionCount === 'number' && item.questionCount > 0) {
      return { minutes: item.questionCount * config.questionMinutes, missing: false };
    }
    return { minutes: config.fallbackQuestionCount * config.questionMinutes, missing: true };
  }

  // Planning metadata for one source item (full precision; storage rounds).
  function computeItemPlanning(item, config) {
    var planning = {
      videoMinutes: null,
      noteMinutes: null,
      questionMinutes: null,
      estimatedMinutes: 0,
      sourceDurationMissing: false,
      sourceQuestionsMissing: false
    };
    if (isVideoRow(item)) {
      var video = computeVideoMinutes(item, config);
      planning.videoMinutes = video.minutes;
      planning.noteMinutes = video.minutes * config.noteMultiplier;
      planning.sourceDurationMissing = video.missing;
      planning.estimatedMinutes += video.minutes + planning.noteMinutes;
    }
    if (isQuestionRow(item)) {
      var questions = computeQuestionMinutes(item, config);
      planning.questionMinutes = questions.minutes;
      planning.sourceQuestionsMissing = questions.missing;
      planning.estimatedMinutes += questions.minutes;
    }
    return planning;
  }

  // Planning category: new content (days 1-5), practice (day 6), graded (day 7).
  function classifyItem(item) {
    if (item.type === 'practice') return 'practice';
    if (item.type === 'graded') return 'graded';
    return 'new-content';
  }

  function createUnit(items, subjectId, weekNumber, config) {
    var unit = {
      unitId: DataEngine.buildTaskId(subjectId, weekNumber, items[0].sourceId),
      items: items,
      videoMinutes: 0,
      noteMinutes: 0,
      questionMinutes: 0,
      estimatedMinutes: 0,
      sourceDurationMissing: false,
      sourceQuestionsMissing: false
    };
    items.forEach(function (item) {
      var planning = computeItemPlanning(item, config);
      unit.videoMinutes += planning.videoMinutes === null ? 0 : planning.videoMinutes;
      unit.noteMinutes += planning.noteMinutes === null ? 0 : planning.noteMinutes;
      unit.questionMinutes += planning.questionMinutes === null ? 0 : planning.questionMinutes;
      if (planning.sourceDurationMissing) unit.sourceDurationMissing = true;
      if (planning.sourceQuestionsMissing) unit.sourceQuestionsMissing = true;
    });
    unit.estimatedMinutes = unit.videoMinutes + unit.noteMinutes + unit.questionMinutes;
    return unit;
  }

  // A lecture (or any video item) and the activity questions that follow it in
  // source order form one logical learning unit. An activity with no preceding
  // video becomes its own standalone unit. Units are never split by the planner.
  function buildLearningUnits(items, subjectId, weekNumber, config) {
    var units = [];
    var currentVideoUnit = null;
    items.forEach(function (item) {
      if (classifyItem(item) !== 'new-content') return;
      if (item.type === 'activity') {
        if (currentVideoUnit) {
          currentVideoUnit.items.push(item);
          var planning = computeItemPlanning(item, config);
          currentVideoUnit.questionMinutes += planning.questionMinutes === null ? 0 : planning.questionMinutes;
          if (planning.sourceQuestionsMissing) currentVideoUnit.sourceQuestionsMissing = true;
          currentVideoUnit.estimatedMinutes = currentVideoUnit.videoMinutes +
            currentVideoUnit.noteMinutes + currentVideoUnit.questionMinutes;
        } else {
          units.push(createUnit([item], subjectId, weekNumber, config));
        }
      } else {
        currentVideoUnit = createUnit([item], subjectId, weekNumber, config);
        units.push(currentVideoUnit);
      }
    });
    return units;
  }

  // Practice and graded items are single-item units (they never pair).
  function makeStandaloneUnit(item, subjectId, weekNumber, config) {
    return createUnit([item], subjectId, weekNumber, config);
  }

  function sumWorkload(units) {
    return units.reduce(function (total, unit) { return total + unit.estimatedMinutes; }, 0);
  }

    // -------------------------------------------------------------------------
  // Day distribution (specification sections 12-17, 32)
  //
  // Learning units are partitioned into 5 contiguous, source-ordered buckets:
  //   - the golden Day-1 anchor (when provided) fills bucket 1 with an exact
  //     prefix of units;
  //   - each day takes units while the running load stays no farther from the
  //     fair-share target (want = remainingWork / remainingDays) than before;
  //     learning units are never split;
  //   - the final day drains all remaining units (complete weekly content by
  //     Day 5 — a higher priority than perfect equality);
  //   - an empty day always takes at least one unit.
  //
  // Capacity note: block capacity is a soft guideline ("do not exceed it when
  // avoidable" — specification section 16). When a week's fair share exceeds
  // its block capacity the overflow is unavoidable, and this rule spreads it
  // evenly across days 1-5 instead of dumping it on the final day.
  // -------------------------------------------------------------------------

  function validateAnchorPrefix(units, anchor) {
    var flat = [];
    units.forEach(function (unit) {
      unit.items.forEach(function (item) { flat.push(item.sourceId); });
    });
    if (anchor.length > flat.length) {
      throw new PlannerError('invalid_anchor', 'golden anchor is longer than the week content');
    }
    for (var i = 0; i < anchor.length; i++) {
      if (flat[i] !== anchor[i]) {
        throw new PlannerError('invalid_anchor',
          'golden anchor mismatch at position ' + i + ': expected "' + anchor[i] + '" but found "' + flat[i] + '"');
      }
    }
    var consumedItems = 0;
    var consumedUnits = 0;
    while (consumedUnits < units.length && consumedItems + units[consumedUnits].items.length <= anchor.length) {
      consumedItems += units[consumedUnits].items.length;
      consumedUnits += 1;
    }
    if (consumedItems !== anchor.length) {
      throw new PlannerError('invalid_anchor', 'golden anchor boundary splits a learning unit');
    }
    return consumedUnits;
  }

  function distributeUnits(units, config, anchor) {
    var dayCount = config.newContentDays;
    var buckets = [];
    for (var d = 0; d < dayCount; d++) buckets.push([]);
    var loads = [];
    for (var l = 0; l < dayCount; l++) loads.push(0);

    var remaining = units.slice();
    var firstBalancedDay = 0;

    if (anchor && anchor.length > 0) {
      var anchoredUnits = validateAnchorPrefix(units, anchor);
      buckets[0] = units.slice(0, anchoredUnits);
      loads[0] = sumWorkload(buckets[0]);
      remaining = units.slice(anchoredUnits);
      firstBalancedDay = 1;
    }

    for (var day = firstBalancedDay; day < dayCount; day++) {
      var daysLeft = dayCount - day;
      var isLast = day === dayCount - 1;
      var want = sumWorkload(remaining) / daysLeft;

      while (remaining.length > 0) {
        var next = remaining[0];
        if (isLast) {
          buckets[day].push(remaining.shift());
          loads[day] += next.estimatedMinutes;
          continue;
        }
        if (loads[day] >= want) break;
        var withNext = loads[day] + next.estimatedMinutes;
        var overshoot = withNext - want;
        var gap = want - loads[day];
        // Take the unit when the day ends no farther from the fair-share
        // target than it started (ties inclusive); otherwise push it down.
        if (overshoot <= 0 || overshoot <= gap) {
          buckets[day].push(remaining.shift());
          loads[day] = withNext;
          continue;
        }
        break;
      }

      if (buckets[day].length === 0 && remaining.length > 0) {
        buckets[day].push(remaining.shift());
        loads[day] += buckets[day][0].estimatedMinutes;
      }
    }

    if (remaining.length > 0) {
      throw new PlannerError('planning_failed', 'unable to distribute all learning units across the new-content days');
    }
    return { days: buckets, loads: loads };
  }

    // -------------------------------------------------------------------------
  // Daily document generation (specification sections 27-29)
  // -------------------------------------------------------------------------

  // One planned task entry. Source values (durationSeconds, questionCount) stay
  // exactly as extracted (null stays null); planner estimates live under
  // `planning` and are display-rounded to 1 decimal.
  function buildTaskEntry(item, course, weekNumber, unit, config) {
    var planning = computeItemPlanning(item, config);
    return {
      taskId: DataEngine.buildTaskId(course.subjectId, weekNumber, item.sourceId),
      subjectId: course.subjectId,
      courseId: course.courseId,
      weekNumber: weekNumber,
      sourceId: item.sourceId,
      type: item.type,
      title: item.title,
      planned: true,
      durationSeconds: item.durationSeconds,
      questionCount: item.questionCount,
      planning: {
        unitId: unit.unitId,
        videoMinutes: planning.videoMinutes === null ? null : round1(planning.videoMinutes),
        noteMinutes: planning.noteMinutes === null ? null : round1(planning.noteMinutes),
        questionMinutes: planning.questionMinutes === null ? null : round1(planning.questionMinutes),
        estimatedMinutes: round1(planning.estimatedMinutes),
        sourceDurationMissing: planning.sourceDurationMissing,
        sourceQuestionsMissing: planning.sourceQuestionsMissing
      }
    };
  }

  function buildDailyDocuments(options) {
    var opts = options || {};
    if (!Array.isArray(opts.courses)) {
      throw new PlannerError('invalid_argument', 'options.courses must be an array');
    }
    if (!isValidDateString(opts.startDate)) {
      throw new PlannerError('invalid_argument', 'options.startDate must be YYYY-MM-DD');
    }
    var config = createPlannerConfig(opts.config || {});
    var courses = DataEngine.sortCourses(opts.courses.map(function (course) {
      return DataEngine.normalizeCourse(course);
    }));

    // Precompute, per course and week: learning units, golden anchor,
    // day distribution, and the day-6/day-7 bundles.
    var coursePlans = courses.map(function (course) {
      capacityForSubject(config, course.subjectId); // validates a study block exists
      var weeks = course.weeks.map(function (week) {
        var units = buildLearningUnits(week.items, course.subjectId, week.weekNumber, config);
        var anchor = null;
        if (week.weekNumber === 1 && config.goldenFirstDay && config.goldenFirstDay[course.subjectId]) {
          anchor = config.goldenFirstDay[course.subjectId];
        }
        return {
          weekNumber: week.weekNumber,
          units: units,
          distribution: distributeUnits(units, config, anchor),
          practiceItems: week.items.filter(function (item) { return classifyItem(item) === 'practice'; }),
          gradedItems: week.items.filter(function (item) { return classifyItem(item) === 'graded'; })
        };
      });
      return { course: course, capacity: capacityForSubject(config, course.subjectId), weeks: weeks };
    });

    var totalDays = config.weeks * config.daysPerWeek;
    var documents = [];

    for (var index = 0; index < totalDays; index++) {
      var dayNumber = index + 1;
      var weekNumber = Math.floor(index / config.daysPerWeek) + 1;
      var dayIndex = (index % config.daysPerWeek) + 1;
      var date = addDaysToDateString(opts.startDate, index);

      var entriesBySubject = {};
      coursePlans.forEach(function (coursePlan) {
        var weekPlan = coursePlan.weeks[weekNumber - 1];
        var entries = [];
        if (dayIndex <= config.newContentDays) {
          weekPlan.distribution.days[dayIndex - 1].forEach(function (unit) {
            unit.items.forEach(function (item) {
              entries.push(buildTaskEntry(item, coursePlan.course, weekNumber, unit, config));
            });
          });
        } else if (dayIndex === config.practiceDay) {
          weekPlan.practiceItems.forEach(function (item) {
            entries.push(buildTaskEntry(
              item, coursePlan.course, weekNumber,
              makeStandaloneUnit(item, coursePlan.course.subjectId, weekNumber, config), config));
          });
        } else if (dayIndex === config.gradedDay) {
          weekPlan.gradedItems.forEach(function (item) {
            entries.push(buildTaskEntry(
              item, coursePlan.course, weekNumber,
              makeStandaloneUnit(item, coursePlan.course.subjectId, weekNumber, config), config));
          });
        }
        entriesBySubject[coursePlan.course.subjectId] = entries;
      });

      var schedule = config.timetable.map(function (slot) {
        var block = {
          blockId: slot.blockId,
          start: slot.start,
          end: slot.end,
          label: slot.label,
          focus: slot.focus,
          category: slot.category,
          subjectId: slot.subjectId,
          taskIds: []
        };
        if (slot.category === 'study' && slot.subjectId) {
          block.taskIds = (entriesBySubject[slot.subjectId] || []).map(function (entry) {
            return entry.taskId;
          });
          if (dayIndex === config.practiceDay) block.focus = config.practiceFocus;
          else if (dayIndex === config.gradedDay) block.focus = config.gradedFocus;
        }
        return block;
      });

      var tasks = [];
      config.timetable.forEach(function (slot) {
        if (slot.category === 'study' && slot.subjectId) {
          (entriesBySubject[slot.subjectId] || []).forEach(function (entry) {
            tasks.push(entry);
          });
        }
      });

      var doc = {
        schemaVersion: '1.0',
        planType: 'daily-study-plan',
        date: date,
        dayNumber: dayNumber,
        weekNumber: weekNumber,
        status: 'not_started',
        schedule: schedule,
        tasks: tasks,
        completion: { totalTasks: tasks.length, completedTasks: 0, percent: 0 },
        meta: { createdAt: null, updatedAt: null, notes: '', generator: 'planner-engine' }
      };

      var validation = DataEngine.validateDailyPlan(doc);
      if (!validation.valid) {
        throw new PlannerError('invalid_plan',
          date + ': generated plan failed validation: ' + validation.errors.slice(0, 5).join(' | '));
      }
      documents.push(doc);
    }

    return documents;
  }

    // Deterministic serialization (fixed key order from construction, 2-space indent).
  function serializePlan(doc) {
    return JSON.stringify(doc, null, 2) + '\n';
  }

  return {
    PlannerError: PlannerError,
    DEFAULT_TIMETABLE: DEFAULT_TIMETABLE,
    DEFAULT_PLANNER_CONFIG: DEFAULT_PLANNER_CONFIG,
    createPlannerConfig: createPlannerConfig,
    capacityForSubject: capacityForSubject,
    round1: round1,
    addDaysToDateString: addDaysToDateString,
    isValidDateString: isValidDateString,
    classifyItem: classifyItem,
    isVideoRow: isVideoRow,
    isQuestionRow: isQuestionRow,
    computeVideoMinutes: computeVideoMinutes,
    computeQuestionMinutes: computeQuestionMinutes,
    computeItemPlanning: computeItemPlanning,
    buildLearningUnits: buildLearningUnits,
    makeStandaloneUnit: makeStandaloneUnit,
    sumWorkload: sumWorkload,
    validateAnchorPrefix: validateAnchorPrefix,
    distributeUnits: distributeUnits,
    buildTaskEntry: buildTaskEntry,
    buildDailyDocuments: buildDailyDocuments,
    serializePlan: serializePlan
  };
});







