/**
 * src/js/router.js — Study-Planner Phase 4 (hash router)
 *
 * Lightweight client-side routing over the URL hash. No framework.
 *
 * Routes:
 *   #/calendar              -> { view: 'calendar' }
 *   #/day/<YYYY-MM-DD>      -> { view: 'day', date, dateValid }
 *   anything else           -> calendar (fallback)
 *
 * The URL is the single source of truth for the current view + tracker date,
 * so refreshing "#/day/2026-10-05" reopens that day (spec section 37).
 * The selected calendar date itself is application state (app.js), not a route.
 *
 * Environment: browser global (globalThis.StudyPlanner.Router) or CommonJS.
 * Depends on calendar.js (date validation). Transport is injectable for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ Calendar: require('./calendar.js') });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.Router = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var Calendar = ns.Calendar;
  if (!Calendar) throw new Error('Router requires Calendar to be loaded first');

  var CALENDAR_HASH = '#/calendar';
  var PROGRESS_HASH = '#/progress';
  var REPORTS_HASH = '#/reports';

  // Phase 6 report routes. Report scopes live under #/reports so they cannot
  // collide with the Phase 4/5 routes, and each level is a real URL so a
  // refresh reopens exactly the same report.
  //   #/reports                            -> report index
  //   #/reports/overall                     -> overall report
  //   #/reports/subject/:subjectId          -> subject report
  //   #/reports/week/:weekNumber            -> weekly report
  //   #/reports/day/:date                   -> daily report
  //   #/reports/calendar                    -> Weekly Timetable Chart: week selection (W1-W4)
  //   #/reports/calendar/week/:weekNumber   -> weekly timetable chart, week n
  //   #/reports/calendar/subject/:subjectId -> timetable scoped to one subject
  function parseReportsRoute(raw) {
    if (raw === REPORTS_HASH) {
      return { view: 'reports', level: 'index', hash: REPORTS_HASH, fallback: false };
    }
    if (raw === REPORTS_HASH + '/overall') {
      return { view: 'reports', level: 'overall', hash: REPORTS_HASH + '/overall', fallback: false };
    }

    var calendarWeek = /^#\/reports\/calendar\/week\/(\d+)$/.exec(raw);
    if (calendarWeek && Number(calendarWeek[1]) > 0) {
      return {
        view: 'reports', level: 'calendar',
        weekNumber: Number(calendarWeek[1]),
        hash: REPORTS_HASH + '/calendar/week/' + Number(calendarWeek[1]),
        fallback: false
      };
    }
    var calendarSubject = /^#\/reports\/calendar\/subject\/([^\/]+)$/.exec(raw);
    if (calendarSubject) {
      return {
        view: 'reports', level: 'calendar', subjectId: calendarSubject[1],
        hash: REPORTS_HASH + '/calendar/subject/' + calendarSubject[1], fallback: false
      };
    }
    // U3 §3.2: the bare calendar route is the WEEK-SELECTION level — it no
    // longer drops the user straight into Week 1.
    if (raw === REPORTS_HASH + '/calendar') {
      return {
        view: 'reports', level: 'calendar-select',
        hash: REPORTS_HASH + '/calendar', fallback: false
      };
    }

    var subject = /^#\/reports\/subject\/([^\/]+)$/.exec(raw);
    if (subject) {
      return {
        view: 'reports', level: 'subject', subjectId: subject[1],
        hash: REPORTS_HASH + '/subject/' + subject[1], fallback: false
      };
    }

    var week = /^#\/reports\/week\/(\d+)$/.exec(raw);
    if (week && Number(week[1]) > 0) {
      return {
        view: 'reports', level: 'week', weekNumber: Number(week[1]),
        hash: REPORTS_HASH + '/week/' + Number(week[1]), fallback: false
      };
    }
    // U4 §4.1: the bare week route is the FOUR-WEEK SELECTION layer — the
    // report itself only opens once a specific week is chosen (/week/:n).
    if (raw === REPORTS_HASH + '/week') {
      return {
        view: 'reports', level: 'week-select',
        hash: REPORTS_HASH + '/week', fallback: false
      };
    }

    var day = /^#\/reports\/day\/(.+)$/.exec(raw);
    if (day) {
      var date = day[1];
      return {
        view: 'reports', level: 'day', date: date,
        dateValid: Calendar.isValidIsoDate(date),
        hash: REPORTS_HASH + '/day/' + date, fallback: false
      };
    }
    return null;
  }

  function RouterError(code, message) {
    var err = Error.call(this, message);
    this.name = 'RouterError';
    this.code = code;
    this.message = message;
    if (err.stack) this.stack = err.stack;
  }
  RouterError.prototype = Object.create(Error.prototype);
  RouterError.prototype.constructor = RouterError;

  // Phase 5 deep progress routes. Each drill-down level is a real route, so
  // refreshing any level reopens exactly that level (spec section 15/16).
  // Returns null when the hash is not a progress route, so parseRoute can fall
  // through to the calendar fallback.
  function parseProgressRoute(raw) {
    var overall = { view: 'progress', level: 'overall', hash: PROGRESS_HASH, fallback: false };
    if (raw === PROGRESS_HASH) return overall;

    var subjectWeek = /^#\/progress\/subject\/([^\/]+)\/week\/(\d+)$/.exec(raw);
    if (subjectWeek && Number(subjectWeek[2]) > 0) {
      var subjectId = subjectWeek[1];
      return {
        view: 'progress',
        level: 'subjectWeek',
        subjectId: subjectId,
        weekNumber: Number(subjectWeek[2]),
        hash: '#/progress/subject/' + subjectId + '/week/' + Number(subjectWeek[2]),
        fallback: false
      };
    }

    var subject = /^#\/progress\/subject\/([^\/]+)$/.exec(raw);
    if (subject) {
      return {
        view: 'progress',
        level: 'subject',
        subjectId: subject[1],
        hash: '#/progress/subject/' + subject[1],
        fallback: false
      };
    }

    var week = /^#\/progress\/week\/(\d+)$/.exec(raw);
    if (week && Number(week[1]) > 0) {
      return {
        view: 'progress',
        level: 'week',
        weekNumber: Number(week[1]),
        hash: '#/progress/week/' + Number(week[1]),
        fallback: false
      };
    }

    var day = /^#\/progress\/day\/(.+)$/.exec(raw);
    if (day) {
      var date = day[1];
      return {
        view: 'progress',
        level: 'day',
        date: date,
        dateValid: Calendar.isValidIsoDate(date),
        hash: '#/progress/day/' + date,
        fallback: false
      };
    }

    if (raw.indexOf('#/progress/') === 0) {
      return { view: 'progress', level: 'overall', hash: PROGRESS_HASH, fallback: true };
    }
    return null;
  }

  function parseRoute(hash) {
    var raw = typeof hash === 'string' ? hash.trim() : '';
    if (raw === '' || raw === '#' || raw === '#/') {
      return { view: 'calendar', hash: CALENDAR_HASH, fallback: false };
    }
    var dayMatch = /^#\/day\/(.+)$/.exec(raw);
    if (dayMatch) {
      var date = dayMatch[1];
      return {
        view: 'day',
        date: date,
        dateValid: Calendar.isValidIsoDate(date),
        hash: '#/day/' + date,
        fallback: false
      };
    }
    if (raw === CALENDAR_HASH) {
      return { view: 'calendar', hash: CALENDAR_HASH, fallback: false };
    }
    var progressRoute = parseProgressRoute(raw);
    if (progressRoute) return progressRoute;
    // Phase 6 report routes. Checked after the calendar/progress routes so the
    // earlier phases keep their exact existing behaviour.
    var reportsRoute = parseReportsRoute(raw);
    if (reportsRoute) return reportsRoute;
    return { view: 'calendar', hash: CALENDAR_HASH, fallback: true };
  }

  function routeForCalendar() {
    return CALENDAR_HASH;
  }

  function routeForDay(date) {
    if (!Calendar.isValidIsoDate(date)) {
      throw new RouterError('invalid_argument', 'routeForDay needs a valid YYYY-MM-DD date, got: ' + String(date));
    }
    return '#/day/' + date;
  }

  // Phase 5 progress route builders (deep links for every drill-down level).
  function routeForProgress() {
    return PROGRESS_HASH;
  }

  function assertSubjectId(subjectId) {
    if (typeof subjectId !== 'string' || !/^[^\/?#]+$/.test(subjectId)) {
      throw new RouterError('invalid_argument', 'expected a subjectId segment, got: ' + String(subjectId));
    }
    return subjectId;
  }

  function assertWeekNumber(weekNumber) {
    if (typeof weekNumber !== 'number' || !isFinite(weekNumber) || weekNumber < 1 || Math.floor(weekNumber) !== weekNumber) {
      throw new RouterError('invalid_argument', 'expected a positive integer week number, got: ' + String(weekNumber));
    }
    return weekNumber;
  }

  function routeForProgressSubject(subjectId) {
    return PROGRESS_HASH + '/subject/' + assertSubjectId(subjectId);
  }

  function routeForProgressSubjectWeek(subjectId, weekNumber) {
    return routeForProgressSubject(subjectId) + '/week/' + assertWeekNumber(weekNumber);
  }

  function routeForProgressWeek(weekNumber) {
    return PROGRESS_HASH + '/week/' + assertWeekNumber(weekNumber);
  }

  function routeForProgressDay(date) {
    if (!Calendar.isValidIsoDate(date)) {
      throw new RouterError('invalid_argument', 'routeForProgressDay needs a valid YYYY-MM-DD date, got: ' + String(date));
    }
    return PROGRESS_HASH + '/day/' + date;
  }

  function defaultGetHash() {
    return typeof location !== 'undefined' && location ? String(location.hash) : '';
  }

  function defaultSetHash(hash) {
    if (typeof location !== 'undefined' && location) location.hash = hash;
  }

  function defaultSubscribe(handler) {
    if (typeof window === 'undefined' || !window.addEventListener) return function () {};
    window.addEventListener('hashchange', handler);
    return function () { window.removeEventListener('hashchange', handler); };
  }

  // Phase 6 report route builders. Same argument discipline as the progress
  // builders: assert first, then build.
  function routeForReports() {
    return REPORTS_HASH;
  }

  function routeForReportOverall() {
    return REPORTS_HASH + '/overall';
  }

  function routeForReportSubject(subjectId) {
    return REPORTS_HASH + '/subject/' + assertSubjectId(subjectId);
  }

  function routeForReportWeek(weekNumber) {
    return REPORTS_HASH + '/week/' + assertWeekNumber(weekNumber);
  }

  // U4 §4.1: no week given -> the W1-W4 selection layer, never a silent Week 1.
  function routeForReportWeekSelect() {
    return REPORTS_HASH + '/week';
  }

  function routeForReportDay(date) {
    if (!Calendar.isValidIsoDate(date)) {
      throw new RouterError('invalid_argument',
        'routeForReportDay needs a valid YYYY-MM-DD date, got: ' + String(date));
    }
    return REPORTS_HASH + '/day/' + date;
  }

  function routeForReportCalendar(weekNumber, subjectId) {
    if (subjectId) {
      return REPORTS_HASH + '/calendar/subject/' + assertSubjectId(subjectId);
    }
    // U3 §3.2: no week given -> the week-selection view, never a silent Week 1.
    if (weekNumber == null) {
      return REPORTS_HASH + '/calendar';
    }
    return REPORTS_HASH + '/calendar/week/' + assertWeekNumber(weekNumber);
  }

  function createRouter(options) {
    var opts = options || {};
    var getHash = opts.getHash || defaultGetHash;
    var setHash = opts.setHash || defaultSetHash;
    var subscribe = opts.subscribe || defaultSubscribe;

    var current = parseRoute(getHash());
    var listeners = [];

    function notify() {
      listeners.slice().forEach(function (listener) { listener(current); });
    }

    function handleTransportChange() {
      var next = parseRoute(getHash());
      if (next.hash === current.hash) return; // dedupe navigate() + hashchange
      current = next;
      notify();
    }

    var unsubscribeTransport = subscribe(handleTransportChange);

    function start() {
      current = parseRoute(getHash());
      notify();
      return current;
    }

    function navigate(hash) {
      var next = parseRoute(hash);
      setHash(next.hash);
      if (next.hash !== current.hash) {
        current = next;
        notify();
      }
      return next;
    }

    function onChange(listener) {
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      };
    }

    function getCurrent() {
      return current;
    }

    function stop() {
      if (typeof unsubscribeTransport === 'function') unsubscribeTransport();
      listeners.length = 0;
    }

    return {
      start: start,
      navigate: navigate,
      onChange: onChange,
      getCurrent: getCurrent,
      stop: stop
    };
  }

  return {
    RouterError: RouterError,
    CALENDAR_HASH: CALENDAR_HASH,
    PROGRESS_HASH: PROGRESS_HASH,
    REPORTS_HASH: REPORTS_HASH,
    parseRoute: parseRoute,
    routeForCalendar: routeForCalendar,
    routeForDay: routeForDay,
    routeForProgress: routeForProgress,
    routeForProgressSubject: routeForProgressSubject,
    routeForProgressSubjectWeek: routeForProgressSubjectWeek,
    routeForProgressWeek: routeForProgressWeek,
    routeForProgressDay: routeForProgressDay,
    routeForReports: routeForReports,
    routeForReportOverall: routeForReportOverall,
    routeForReportSubject: routeForReportSubject,
    routeForReportWeek: routeForReportWeek,
    routeForReportWeekSelect: routeForReportWeekSelect,
    routeForReportDay: routeForReportDay,
    routeForReportCalendar: routeForReportCalendar,
    createRouter: createRouter
  };
});
