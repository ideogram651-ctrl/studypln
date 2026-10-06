/**
 * src/components/reports/report-tree.js — Study-Planner Phase 6
 *
 * Builds the report hierarchy described in docs/export-system.md section 6:
 *
 *   Overall
 *     +- Subject
 *        +- Week
 *           +- Day
 *
 * It is a NAVIGATION structure only: it derives links and titles from the report
 * model, and holds no numbers of its own. Progress values are not touched here.
 *
 * Environment: browser global (globalThis.StudyPlanner.ReportTree) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.ReportTree = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // linkFor(what) is supplied by the app, which owns the route strings.
  //   what = { level: 'overall'|'subject'|'week'|'day'|'calendar',
  //            subjectId?, weekNumber?, date? }
  function buildTree(model, linkFor) {
    if (!model) return null;
    var link = typeof linkFor === 'function' ? linkFor : function () { return null; };
    var courses = model.getCourses();
    var weekNumbers = model.weekNumbers();

    var overall = {
      level: 'overall',
      label: 'Overall',
      hash: link({ level: 'overall' }),
      children: courses.map(function (course) {
        return {
          level: 'subject',
          subjectId: course.subjectId,
          label: course.courseName,
          hash: link({ level: 'subject', subjectId: course.subjectId }),
          children: weekNumbers.map(function (weekNumber) {
            return {
              level: 'week',
              subjectId: course.subjectId,
              weekNumber: weekNumber,
              label: 'Week ' + weekNumber,
              hash: link({ level: 'week', subjectId: course.subjectId, weekNumber: weekNumber }),
              children: model.getPlans()
                .filter(function (plan) {
                  return plan.weekNumber === weekNumber && courseHasSubject(model, course.subjectId, plan);
                })
                .map(function (plan) {
                  return {
                    level: 'day',
                    subjectId: course.subjectId,
                    weekNumber: plan.weekNumber,
                    date: plan.date,
                    dayNumber: plan.dayNumber,
                    label: 'Day ' + plan.dayNumber,
                    hash: link({ level: 'day', subjectId: course.subjectId, weekNumber: plan.weekNumber, date: plan.date })
                  };
                })
            };
          })
        };
      })
    };
    return { level: 'root', children: [overall] };
  }

  // A day belongs to a subject when the plan actually contains that subject.
  function courseHasSubject(model, subjectId, plan) {
    return (plan.tasks || []).some(function (task) {
      return task.subjectId === subjectId;
    });
  }

  function flatten(node, out) {
    var list = out || [];
    if (!node) return list;
    if (node.level && node.level !== 'root') list.push(node);
    (node.children || []).forEach(function (child) { flatten(child, list); });
    return list;
  }

  return { buildTree: buildTree, flatten: flatten };
});
