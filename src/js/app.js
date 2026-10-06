/**
 * src/js/app.js — Study-Planner Phase 4 (application shell)
 *
 * Orchestrates the existing architecture for the UI:
 *
 *   Router (hash) → view
 *     calendar: app -> planStore (data-engine via fetch) -> progress-engine day progress
 *     tracker:  app -> planStore -> DailyTracker controller -> storage.js (writes)
 *                                                          -> progress-engine (reads)
 *
 * The app owns UI state only (selected date, calendar cursor/view, tracker
 * controller). It never plans, never mutates plan documents, and never touches
 * localStorage directly — completion state always flows through storage.js.
 *
 * Environment: browser global (globalThis.StudyPlanner.App) or CommonJS.
 * Config is injected through window.STUDY_PLANNER_CONFIG (see src/index.html).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      DataEngine: require('./data-engine.js'),
      Storage: require('./storage.js'),
      ProgressEngine: require('./progress-engine.js'),
      Calendar: require('./calendar.js'),
      Router: require('./router.js'),
      Renderer: require('./renderer.js'),
      CalendarView: require('../components/calendar/calendar-view.js'),
      CalendarContext: require('../components/calendar/calendar-context.js'),
      CalendarCard: require('../components/calendar/calendar-card.js'),
      CalendarWheel: require('../components/calendar/calendar-wheel.js'),
      CalendarMetadata: require('./calendar-metadata.js'),
      DailyTracker: require('../components/tracker/daily-tracker.js'),
      SubjectProgress: require('../components/progress/subject-progress.js'),
      WeekProgress: require('../components/progress/week-progress.js'),
      DayProgress: require('../components/progress/day-progress.js'),
      ProgressDashboard: require('../components/progress/progress-dashboard.js'),
      ProgressDrilldown: require('../components/progress/progress-drilldown.js'),
      ReportModel: require('./report-model.js'),
      ExportEngine: require('./export-engine.js'),
      ReportViewer: require('../components/reports/report-viewer.js'),
      ProgressCalendar: require('../components/reports/progress-calendar.js'),
      ReportTree: require('../components/reports/report-tree.js'),
      ExportControls: require('../components/reports/export-controls.js')
    });
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.App = factory(root.StudyPlanner);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ns) {
  'use strict';

  var DataEngine = ns.DataEngine;
  var Storage = ns.Storage;
  var ProgressEngine = ns.ProgressEngine;
  var Calendar = ns.Calendar;
  var RouterModule = ns.Router;
  var Renderer = ns.Renderer;
  var CalendarView = ns.CalendarView;
  var CalendarContext = ns.CalendarContext;
  var CalendarCard = ns.CalendarCard;
  var CalendarWheel = ns.CalendarWheel;
  var CalendarMetadata = ns.CalendarMetadata;
  var DailyTracker = ns.DailyTracker;
  var SubjectProgress = ns.SubjectProgress;
  var WeekProgress = ns.WeekProgress;
  var DayProgress = ns.DayProgress;
  var ProgressDashboard = ns.ProgressDashboard;
  var ProgressDrilldown = ns.ProgressDrilldown;
  var ReportModel = ns.ReportModel;
  var ExportEngine = ns.ExportEngine;
  var ReportViewer = ns.ReportViewer;
  var ProgressCalendar = ns.ProgressCalendar;
  var ReportTree = ns.ReportTree;
  var ExportControls = ns.ExportControls;

  ['DataEngine', 'Storage', 'ProgressEngine', 'Calendar', 'Router', 'Renderer',
    'CalendarView', 'CalendarContext', 'CalendarCard', 'CalendarWheel', 'CalendarMetadata', 'DailyTracker', 'SubjectProgress', 'WeekProgress', 'DayProgress',
    'ProgressDashboard', 'ProgressDrilldown', 'ReportModel', 'ExportEngine',
    'ReportViewer', 'ProgressCalendar', 'ReportTree', 'ExportControls'].forEach(function (name) {
    if (!ns[name]) throw new Error('App requires ' + name + ' to be loaded first');
  });

  var DEFAULT_CONFIG = {
    dataBase: '../data/schedule/daily/',
    syllabusBase: '../data/syllabus/',
    // Canonical course documents, located explicitly (their file names differ
    // from the subjectIds). Canonical ORDER always comes from the data engine.
    syllabusFiles: [
      'mathematics-i.json',
      'statistics.json',
      'computational-thinking.json',
      'english.json'
    ],
    context: 'IIT Madras BS',
    initialDate: '2026-10-02',
    // First date of the materialized 28-day cycle (see docs/planning-rules.md).
    cycleStart: '2026-10-02',
    cycleWeeks: 4,
    daysPerWeek: 7,
    // U2.1: Weekly is the DEFAULT Calendar mode (reference shows the wheel first).
    calendarView: 'week',
    // U2: canonical full-year calendar (see docs/calendar-data-schema.md).
    calendarFile: '../data/calendar/calendar-2026.json'
  };

  // ---------------------------------------------------------------------------
  // Plan store: the single data-access path for daily plans (spec section 31).
  // Loads through data-engine (fetch + schema validation), caches results, and
  // treats HTTP 404 as a stable "no plan for this date" state.
  // ---------------------------------------------------------------------------

  function createPlanStore(options) {
    var opts = options || {};
    var baseUrl = typeof opts.baseUrl === 'string' ? opts.baseUrl : DEFAULT_CONFIG.dataBase;
    var loadJson = opts.loadJson || function (url) { return DataEngine.loadJsonFromUrl(url); };
    var validate = opts.validate || function (doc) { return DataEngine.validateDailyPlan(doc); };
    var cache = new Map();

    function urlFor(date) {
      return baseUrl + date + '.json';
    }

    function getPlan(date) {
      if (cache.has(date)) return Promise.resolve(cache.get(date));
      return loadJson(urlFor(date)).then(function (doc) {
        var result = validate(doc);
        if (!result.valid) {
          throw new Error('Invalid study plan for ' + date + ': ' + result.errors.slice(0, 3).join(' | '));
        }
        cache.set(date, doc);
        return doc;
      }, function (error) {
        if (error && error.code === 'fetch_failed' && /HTTP 404/.test(error.message)) {
          cache.set(date, null); // stable missing-plan state (spec section 39)
          return null;
        }
        throw error;
      });
    }

    return {
      urlFor: urlFor,
      getPlan: getPlan,
      isCached: function (date) { return cache.has(date); }
    };
  }

  // ---------------------------------------------------------------------------
  // Calendar data store (U2): loads the canonical full-year calendar ONCE per
  // lifecycle and hands back a Calendar access layer. Read-only: the canonical
  // JSON is never written at runtime.
  // ---------------------------------------------------------------------------

  function createCalendarStore(options) {
    var opts = options || {};
    var url = opts.url || DEFAULT_CONFIG.calendarFile;
    var loadJson = opts.loadJson || function (target) { return DataEngine.loadJsonFromUrl(target); };
    var pending = null;

    function load() {
      // Parse once: repeated renders reuse the same access layer.
      if (pending) return pending;
      pending = loadJson(url).then(function (doc) {
        return Calendar.createCalendarAccess(doc);
      }, function (error) {
        // Non-destructive: the app keeps working, the Calendar shows an error.
        pending = null;
        throw error;
      });
      return pending;
    }

    return {
      url: url,
      load: load,
      reset: function () { pending = null; }
    };
  }

  // ---------------------------------------------------------------------------
  // U2.2-002: local "today" + session-scoped selected date.
  // The selected date is NOT a permanent user preference: only sessionStorage
  // (or an injected store in tests) remembers it, so a browser refresh keeps a
  // manual selection while a full application restart resolves the real local
  // date again. Nothing here writes to localStorage.
  // ---------------------------------------------------------------------------
  var SELECTED_DATE_KEY = 'study-planner:selected-date';

  function pad2(value) { return (value < 10 ? '0' : '') + value; }

  // The ACTUAL local calendar date — never a hardcoded day.
  function formatLocalDate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  // Accepts sessionStorage (getItem/setItem), a {get,set} store, or nothing at
  // all (Node / private-mode browsers degrade to "no memory" = always today).
  function normalizeSessionStore(raw) {
    if (raw && typeof raw.getItem === 'function' && typeof raw.setItem === 'function') {
      return {
        get: function (key) { try { return raw.getItem(key); } catch (error) { return null; } },
        set: function (key, value) { try { raw.setItem(key, value); } catch (error) { /* private mode: ignore */ } }
      };
    }
    if (raw && typeof raw.get === 'function') {
      return { get: raw.get, set: typeof raw.set === 'function' ? raw.set : function () {} };
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      return normalizeSessionStore(sessionStorage);
    }
    return { get: function () { return null; }, set: function () {} };
  }

  // ---------------------------------------------------------------------------
  // Application shell
  // ---------------------------------------------------------------------------

  function createApp(options) {
    var opts = options || {};
    var config = Object.assign({}, DEFAULT_CONFIG, opts.config || {});
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('createApp requires a document (or options.document)');
    var rootElement = opts.rootElement || (doc.getElementById ? doc.getElementById('view') : null);
    var toastElement = opts.toastElement || (doc.getElementById ? doc.getElementById('toast') : null);
    var headerElement = opts.headerElement || (doc.getElementById ? doc.getElementById('app-header') : null);
    var storage = opts.storage || Storage.createStorage();
    var planStore = opts.planStore || createPlanStore({
      baseUrl: config.dataBase,
      loadJson: opts.loadJson,
      validate: opts.validate
    });
    var router = opts.router || RouterModule.createRouter();
    // U2: canonical calendar (read-only, loaded once) + user notes/events.
    // calendarMetadata is SEPARATE from `storage`, which stays the sole
    // completion authority.
    var calendarStore = opts.calendarStore || createCalendarStore({
      url: config.calendarFile,
      loadJson: opts.loadJson
    });
    var calendarMetadata = opts.calendarMetadata || CalendarMetadata.createCalendarMetadata(
      opts.calendarMetadataBackend ? { backend: opts.calendarMetadataBackend } : {});

    // A malformed config must not crash the shell: fall back to the cycle start.
    var initialDate = Calendar.isValidIsoDate(config.initialDate) ? config.initialDate : DEFAULT_CONFIG.initialDate;
    // U2.2-002: resolve the startup selection. Priority:
    //   1. a manually selected date restored from the SESSION (browser refresh)
    //   2. TODAY'S actual local date (fresh start / brand new session)
    //   3. the configured cycle start (only if today is outside canonical data)
    // `opts.now` is injectable for tests; production uses the real local clock.
    var nowFn = typeof opts.now === 'function' ? opts.now : function () { return new Date(); };
    var session = normalizeSessionStore(opts.sessionStore);
    var restoredDate = session.get(SELECTED_DATE_KEY);
    var startupDate = Calendar.isValidIsoDate(restoredDate) ? restoredDate
      : (function () {
        var today = formatLocalDate(nowFn());
        return Calendar.isValidIsoDate(today) ? today : initialDate;
      }());
    var initialParts = Calendar.parseIso(startupDate);
    var state = {
      selectedDate: startupDate,
      calendarView: config.calendarView === 'week' ? 'week' : 'month',
      cursor: { year: initialParts.year, month: initialParts.month },
      currentRoute: router.getCurrent(),
      trackerController: null,
      requestToken: 0,
      // U2: cached canonical calendar access layer (null until loaded).
      calendarAccess: null,
      // U2.1: the reference date-wheel controller (created on first calendar render).
      wheel: null
    };

    // ---- UI state helpers --------------------------------------------------

    function getState() {
      return {
        selectedDate: state.selectedDate,
        calendarView: state.calendarView,
        cursor: { year: state.cursor.year, month: state.cursor.month },
        currentRoute: state.currentRoute,
        hasTrackerController: state.trackerController !== null
      };
    }

    function visibleDates() {
      var access = state.calendarAccess;
      if (state.calendarView === 'week') {
        // The date-wheel is CONTINUOUS over canonical dates (U2.1) - it is not
        // limited to the current study week, so Oct 8 -> Oct 9 works directly.
        if (access) return CalendarCard.wheelDates(access, state.selectedDate);
        return [];
      }
      var grid = Calendar.buildMonthGrid(state.cursor.year, state.cursor.month);
      var dates = [];
      grid.weeks.forEach(function (row) {
        row.forEach(function (cell) { if (cell) dates.push(cell.date); });
      });
      return dates;
    }

    // Canonical metadata for every visible date, plus the selected date (so the
    // context panel works even when it is outside the current grid).
    function buildMetaMap(access, dates) {
      var meta = {};
      var seen = {};
      var all = dates.slice();
      all.push(state.selectedDate);
      all.forEach(function (date) {
        if (!date || seen[date]) return;
        seen[date] = true;
        meta[date] = CalendarContext.cellMetadata(access, date, calendarMetadata);
      });
      return meta;
    }

    // The calendar-scoped app-view class enables the reference gutter rules in
    // calendar-u21.css (U2.2-005) without affecting any other route's layout.
    function setCalendarRootClass(on) {
      if (!rootElement || !rootElement.classList) return;
      if (on) rootElement.classList.add('calendar-view-active');
      else rootElement.classList.remove('calendar-view-active');
    }

    // Move only the selected-date indicator (no full re-render, no refetch).
    function applySelectionInDom() {
      if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return;
      var nodes = rootElement.querySelectorAll('[data-date]');
      Array.prototype.forEach.call(nodes, function (node) {
        var isSelected = node.getAttribute('data-date') === state.selectedDate;
        if (node.classList) node.classList.toggle('is-selected', isSelected);
        node.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
    }

    function persistSelectedDate(date) {
      session.set(SELECTED_DATE_KEY, date);
    }

    // U2.2-001: move the selection WITHOUT rebuilding the wheel.
    // The selected date keeps its own DOM item, its purple circle travels with
    // that item, and the track is re-centred with the reference animation —
    // never a fixed circle with dates sliding underneath it. Full re-renders
    // stay reserved for month/mode changes and dates outside the rendered run.
    // `deferCenter` (pointer-origin selections only) waits out the double-click
    // window so the track is still when the second click lands; the circle then
    // glides with its date as usual.
    var POINTER_CENTER_DELAY_MS = 350;
    var wheelCenterTimer = null;

    function centerWheel(date, animate) {
      if (state.calendarView !== 'week' || !state.wheel) return;
      state.wheel.setSelected(date, animate);
    }

    function updateSelectionInPlace(date, deferCenter) {
      if (!rootElement || typeof rootElement.querySelector !== 'function') return false;
      var item = rootElement.querySelector('[data-date="' + date + '"]');
      if (!item) return false;
      if (!rootElement.querySelector('#calendarCard')) return false;

      state.selectedDate = date;
      var parts = Calendar.parseIso(date);

      // Hero date (month name + day number).
      var monthName = rootElement.querySelector('.month-name');
      if (monthName) monthName.textContent = Calendar.monthName(parts.month);
      var heroDay = rootElement.querySelector('#heroDay');
      if (heroDay) heroDay.textContent = String(parts.day);

      // Period label: Study Week context inside the cycle, plain month context
      // outside it — never a fake "Week 0".
      var label = rootElement.querySelector('#periodLabel');
      if (label) {
        label.textContent = CalendarCard.periodLabel(state.calendarAccess, {
          mode: state.calendarView,
          selectedDate: date,
          year: parts.year,
          month: parts.month
        });
      }

      // Selection state on the date cells only (one owner, one class). The
      // bottom-row chips also carry data-date but are not selectable dates.
      var nodes = rootElement.querySelectorAll('#calendarCard .week-day[data-date], #calendarCard .grid-cell[data-date]');
      Array.prototype.forEach.call(nodes, function (node) {
        var isSelected = node.getAttribute('data-date') === date;
        if (node.classList) {
          node.classList.toggle('active', isSelected && state.calendarView === 'week');
          node.classList.toggle('selected', isSelected && state.calendarView === 'month');
        }
        node.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      // Bottom row shows the notes/events of the SELECTED date.
      var bottom = rootElement.querySelector('.bottom-row');
      if (bottom && bottom.parentNode) {
        bottom.outerHTML = CalendarCard.renderBottomRowHTML(
          date,
          calendarMetadata.getNotes(date),
          calendarMetadata.getEvents(date)
        );
      }

      // Re-centre the moving track so the circle glides with its date.
      if (deferCenter) {
        if (wheelCenterTimer) clearTimeout(wheelCenterTimer);
        wheelCenterTimer = setTimeout(function () {
          wheelCenterTimer = null;
          if (rootElement.querySelector && rootElement.querySelector('#calendarCard')) {
            centerWheel(state.selectedDate, true);
          }
        }, POINTER_CENTER_DELAY_MS);
      } else {
        if (wheelCenterTimer) { clearTimeout(wheelCenterTimer); wheelCenterTimer = null; }
        centerWheel(date, true);
      }
      return true;
    }

    // Single entry point for every selection change (click, wheel, drag,
    // arrows, top navigation). Keeps session persistence in one place.
    function commitSelection(date, origin) {
      if (!Calendar.isValidIsoDate(date)) return false;
      if (date === state.selectedDate) return true;
      if (updateSelectionInPlace(date, origin === 'pointer')) {
        persistSelectedDate(date);
        return true;
      }
      renderCalendar(date); // full render also persists the selection
      return true;
    }

    function setSelectedDate(date) {
      return commitSelection(date);
    }

    function setCalendarView(view) {
      if (view !== 'month' && view !== 'week') return;
      if (state.calendarView === view) return;
      state.calendarView = view;
      if (state.currentRoute && state.currentRoute.view === 'calendar') renderCalendar();
    }

    // U2.1: the study week currently shown, derived from canonical data.
    // Weekly mode no longer locks the wheel to it - the week is CONTEXT only.
    function currentStudyWeekNumber(access) {
      var week = access ? access.getStudyWeekForDate(state.selectedDate) : null;
      return week ? week.weekNumber : null;
    }

    // Move the selected date by whole days (continuous wheel movement).
    // The date-wheel is NOT limited to a single study week — Oct 8 -> Oct 9 and
    // Oct 29 -> Oct 30 both work directly (U2.2-003: Study Week is context,
    // never a movement lock). Movement clamps to the canonical calendar year.
    function moveSelectedByDays(delta) {
      var next = Calendar.addDays(state.selectedDate, delta);
      if (state.calendarAccess && !state.calendarAccess.hasDate(next)) return;
      commitSelection(next);
    }

    // U2.2 navigation:
    //   Monthly mode -> move the SELECTION by a calendar month, so the cursor,
    //   the grid and Weekly all share one selected date (U2.2-004).
    //   Weekly mode  -> STUDY WEEK context via the top arrows (moving to the
    //   adjacent week's contextual start date); at a cycle edge or outside the
    //   cycle the movement continues by 7 days so navigation is never trapped
    //   inside the 28-day cycle (U2.2-003).
    function shiftPeriod(delta) {
      if (state.calendarView === 'week') {
        var access = state.calendarAccess;
        var weekNumber = currentStudyWeekNumber(access);
        if (access && weekNumber) {
          var adjacent = access.getAdjacentStudyWeek(weekNumber, delta);
          if (adjacent) {
            commitSelection(adjacent.startDate);
            return;
          }
        }
        // Outside the cycle (Oct 1, Sep 30, Nov 1…) or at a W1/W4 edge:
        // keep moving by whole weeks. Canonical-year clamping lives in
        // moveSelectedByDays(), so no date outside the data is ever invented.
        moveSelectedByDays(delta * 7);
        return;
      }
      // Monthly: derive the target month from the SELECTED date (not a
      // free-running cursor), clamp the day to the target month's length and
      // refuse to leave the canonical year.
      var parts = Calendar.parseIso(state.selectedDate);
      var target = Calendar.addMonths(parts.year, parts.month, delta);
      var day = Math.min(parts.day, Calendar.daysInMonth(target.year, target.month));
      var next = Calendar.isoDate(target.year, target.month, day);
      if (state.calendarAccess && !state.calendarAccess.hasDate(next)) return;
      // The target cell is in a different grid → this falls back to a full
      // render, which rebuilds the month and keeps the cursor in sync.
      commitSelection(next);
    }

    function openTracker(date) {
      if (!Calendar.isValidIsoDate(date)) {
        showToast('That date is not available in this planner.');
        return;
      }
      router.navigate(RouterModule.routeForDay(date));
    }

    function backToCalendar() {
      router.navigate(RouterModule.routeForCalendar());
    }

    // Only internal hash routes are followed (drill-down links/breadcrumbs).
    function navigateTo(hash) {
      if (typeof hash !== 'string' || hash.indexOf('#/') !== 0) return;
      router.navigate(hash);
    }

    // U5.1 (CHANGE #002): route-aware header navigation. Home hides on the
    // Calendar (it IS the home screen); the button for the current SECTION
    // carries aria-current — persistent and independent of hover — until the
    // route changes. Icon and text live on the same button, so they always
    // share one state.
    function setNavCurrent(button, isCurrent) {
      if (!button) return;
      if (isCurrent) {
        if (button.classList && button.classList.add) button.classList.add('is-active');
        if (button.setAttribute) button.setAttribute('aria-current', 'page');
      } else {
        if (button.classList && button.classList.remove) button.classList.remove('is-active');
        if (button.removeAttribute) button.removeAttribute('aria-current');
      }
    }

    function updateHeaderNav(route) {
      if (!headerElement || typeof headerElement.querySelector !== 'function') return;
      var view = route ? route.view : null;
      var home = headerElement.querySelector('[data-action="open-home"]');
      var progress = headerElement.querySelector('[data-action="open-progress"]');
      var reports = headerElement.querySelector('[data-action="open-reports"]');
      if (home) home.hidden = view === 'calendar';
      // Only the SECTION the route belongs to is active: Progress detail routes
      // stay Progress, Reports detail stays Reports, and any other non-home
      // page (e.g. the Daily Tracker) leaves BOTH normal.
      setNavCurrent(progress, view === 'progress');
      setNavCurrent(reports, view === 'reports');
    }

    // U5.1 (CHANGE #004): the shared Back control takes ONE actual step back
    // through the browser's own history when this session has navigated — no
    // separate history system is built. On a cold deep link (no in-app step
    // yet) it falls back to the control's semantic parent (data-hash, e.g.
    // "Back to Week 1" -> that week) and, with neither, to the Calendar.
    function goBack(element) {
      var canStepBack = (state.routeSteps || 0) > 0 &&
        typeof window !== 'undefined' && window.history &&
        typeof window.history.back === 'function';
      if (canStepBack) {
        window.history.back();
        return;
      }
      var hash = element && typeof element.getAttribute === 'function'
        ? element.getAttribute('data-hash') : null;
      if (hash) { navigateTo(hash); return; }
      backToCalendar();
    }

    // ---- route dispatch ----------------------------------------------------

    function handleRouteChange(route) {
      state.currentRoute = route;
      // U5.1 (CHANGE #002 + active state): Home visibility and the current
      // SECTION are derived from the route itself — never a hand-maintained
      // flag. Also count genuine in-app route CHANGES (a same-hash re-render
      // does not count) so Back knows whether a real history step exists.
      updateHeaderNav(route);
      if (!state.lastRouteHash) {
        state.lastRouteHash = route.hash || '';
      } else if ((route.hash || '') !== state.lastRouteHash) {
        state.lastRouteHash = route.hash || '';
        state.routeSteps = (state.routeSteps || 0) + 1;
      }
      if (route.view === 'day') {
        if (route.dateValid) state.selectedDate = route.date;
        renderTracker(route.date, route.dateValid);
        return;
      }
      if (route.view === 'progress') {
        renderProgress(route);
        return;
      }
      if (route.view === 'reports') {
        renderReports(route);
        return;
      }
      var parts = Calendar.parseIso(state.selectedDate);
      state.cursor = { year: parts.year, month: parts.month };
      renderCalendar();
    }

    // ---- rendering ---------------------------------------------------------

    // U2.1: render the reference Calendar card.
    // `selectDate` optionally moves the selected date (wheel / click / nav), which
    // also keeps the month cursor in sync so Monthly shows the right month.
    function renderCalendar(selectDate) {
      if (selectDate && Calendar.isValidIsoDate(selectDate)) {
        state.selectedDate = selectDate;
        persistSelectedDate(selectDate); // U2.2-002: survives a browser refresh
      }
      setCalendarRootClass(true);
      var token = ++state.requestToken;
      var access = state.calendarAccess;

      // Load the canonical calendar once; a failure shows a clear, non-destructive
      // error and never fabricates dates or crashes the app.
      if (!access) {
        calendarStore.load().then(function (loaded) {
          if (token !== state.requestToken) return;
          state.calendarAccess = loaded;
          // U2.2-002 guard: a restored session date (or "today") can fall
          // outside the canonical year — fall back to the configured cycle
          // start rather than inventing dates.
          if (!loaded.hasDate(state.selectedDate)) {
            state.selectedDate = initialDate;
            persistSelectedDate(initialDate);
          }
          renderCalendar();
        }, function (error) {
          console.error('Calendar: canonical calendar data unavailable', error);
          if (token !== state.requestToken) return;
          Renderer.setHtml(rootElement, CalendarView.renderCalendarUnavailableHTML(
            'The canonical calendar file could not be loaded. Study plans, progress and reports are unaffected.'));
        });
        return;
      }

      // U2.1: keep the monthly cursor aligned with the selected date so the
      // Monthly grid always shows the month that contains it.
      var selectedParts = Calendar.parseIso(state.selectedDate);
      state.cursor = { year: selectedParts.year, month: selectedParts.month };

      var isMonth = state.calendarView === 'month';
      var dates = visibleDates();

      // Only fetch a plan when one can plausibly exist. The canonical calendar
      // knows which dates belong to the active cycle, so browsing other months
      // does not generate a request per day (and no 404 noise in the console).
      function isActiveStudyDate(accessRef, date) {
        return !!(accessRef && accessRef.isActiveStudyDate(date));
      }

      Promise.all(dates.map(function (date) {
        if (!isActiveStudyDate(access, date)) {
          return Promise.resolve(null); // outside the cycle: no plan is fetched
        }
        return planStore.getPlan(date).then(function (plan) { return plan; }, function (error) {
          console.warn('Calendar: could not load plan for ' + date, error);
          return null;
        });
      })).then(function (plans) {
        if (token !== state.requestToken) return; // a newer render superseded this one
        var completions = storage.getAllCompletions();
        var planStatus = {};
        var hasPlanByDate = {};
        dates.forEach(function (date, index) {
          var plan = plans[index];
          hasPlanByDate[date] = !!plan;
          planStatus[date] = plan
            ? { hasPlan: true, percent: ProgressEngine.dayProgress(plan, completions).percent }
            : { hasPlan: false, percent: null };
        });

        // User notes/events for the dates the card displays.
        var shownDates = isMonth
          ? (access.getMonth(state.cursor.month)
            ? access.getMonth(state.cursor.month).dates.map(function (d) { return d.date; })
            : [])
          : CalendarCard.wheelDates(access, state.selectedDate);
        var notesByDate = {};
        var eventsByDate = {};
        shownDates.forEach(function (date) {
          var n = calendarMetadata.getNotes(date);
          var e = calendarMetadata.getEvents(date);
          if (n.length) notesByDate[date] = n;
          if (e.length) eventsByDate[date] = e;
        });

        var html = '<div class="calendar-view-root">' + CalendarCard.renderCardHTML({
          access: access,
          mode: isMonth ? 'month' : 'week',
          selectedDate: state.selectedDate,
          year: state.cursor.year,
          month: state.cursor.month,
          planStatus: planStatus,
          notes: calendarMetadata.getNotes(state.selectedDate),
          events: calendarMetadata.getEvents(state.selectedDate),
          notesByDate: notesByDate,
          eventsByDate: eventsByDate
        }) + '</div>';

        Renderer.setHtml(rootElement, html);
        mountWheel();
      });
    }

    // Mount / refresh the reference date-wheel controller after each render.
    function mountWheel() {
      if (state.calendarView === 'month') {
        if (state.wheel) state.wheel.detach();
        return;
      }
      if (!state.wheel) {
        state.wheel = CalendarWheel.createController({
          rootElement: rootElement,
          selectedDate: state.selectedDate,
          onMove: function (delta) { moveSelectedByDays(delta); },
          // 'pointer' origin => commitSelection defers track centering until
          // the double-click window has passed (U2.2-001 + tracker entry).
          onSelect: function (date, origin) { commitSelection(date, origin); }
        });
      }
      state.wheel.attach();
      state.wheel.setSelected(state.selectedDate, false);
      state.wheel.ensureGlobalListeners();
    }

    function renderTracker(date, dateValid) {
      setCalendarRootClass(false); // U2.2-005: non-calendar routes drop the gutter
      if (!dateValid) {
        state.trackerController = null;
        Renderer.setHtml(rootElement, DailyTracker.renderInvalidDateHTML(date));
        return;
      }
      var token = ++state.requestToken;
      planStore.getPlan(date).then(function (plan) {
        if (token !== state.requestToken) return;
        if (!plan) {
          state.trackerController = null;
          Renderer.setHtml(rootElement, DailyTracker.renderMissingPlanHTML(date));
          return;
        }
        var controller = DailyTracker.createTrackerController({ plan: plan, storage: storage });
        state.trackerController = controller;
        Renderer.setHtml(rootElement, DailyTracker.renderTrackerHTML(controller.getViewModel({ context: config.context })));
      }).catch(function (error) {
        if (token !== state.requestToken) return;
        console.error('Tracker: failed to load plan for ' + date, error);
        state.trackerController = null;
        Renderer.setHtml(rootElement, DailyTracker.renderUnavailableHTML({
          heading: 'Unable to load study plan',
          message: 'Something went wrong while loading this day. Please try again.',
          date: date
        }));
      });
    }

    // Targeted update after a checkbox change: no full re-render, so focus and
    // scroll position on the toggled row are preserved.
    function attrSelector(name, value) {
      return '[' + name + '="' + String(value).replace(/["\\]/g, '\\$&') + '"]';
    }

    function updateTrackerUI() {
      var controller = state.trackerController;
      if (!controller || !rootElement) return;
      var viewModel = controller.getViewModel({ context: config.context });

      var fill = rootElement.querySelector ? rootElement.querySelector('.progress-fill') : null;
      if (fill && fill.style) fill.style.width = viewModel.progress.percent + '%';
      var stats = rootElement.querySelectorAll ? rootElement.querySelectorAll('.tracker-stats span') : [];
      if (stats[0]) stats[0].textContent = viewModel.progressLabel;
      if (stats[1]) stats[1].textContent = viewModel.percentLabel;

      viewModel.blocks.forEach(function (block) {
        var blockEl = rootElement.querySelector ? rootElement.querySelector(attrSelector('data-block-id', block.blockId)) : null;
        if (!blockEl) return;
        var countEl = blockEl.querySelector ? blockEl.querySelector('.block-count') : null;
        if (countEl) countEl.textContent = block.completed + ' / ' + block.total;
        block.tasks.forEach(function (card) {
          var row = blockEl.querySelector ? blockEl.querySelector(attrSelector('data-task-id', card.taskId)) : null;
          if (row && row.classList) row.classList.toggle('is-completed', card.checked);
        });
      });
    }

    function showToast(message) {
      if (toastElement) {
        toastElement.textContent = message;
        if (toastElement.classList) toastElement.classList.add('is-visible');
        if (typeof setTimeout === 'function') {
          setTimeout(function () {
            if (toastElement.classList) toastElement.classList.remove('is-visible');
          }, 4000);
        }
        return;
      }
      if (typeof console !== 'undefined') console.warn(message);
    }

    // Fail visibly and safely: a corrupt/incompatible payload is reported once
    // at startup instead of silently hiding the user's previous ticks, and a
    // browser without working localStorage is called out explicitly.
    function reportStorageDiagnostics() {
      if (typeof storage.diagnostics !== 'function') return;
      var diagnostics = storage.diagnostics();
      if (!diagnostics) return;
      if (diagnostics.status === 'corrupt' || diagnostics.status === 'incompatible') {
        console.warn('Storage: ' + (diagnostics.message || diagnostics.status));
        showToast('Saved progress could not be read (' + diagnostics.status +
          '). Existing ticks are hidden and new ones cannot be saved until the saved data is repaired or reset.');
      } else if (typeof storage.isPersistent === 'function' && storage.isPersistent() === false) {
        showToast('This browser cannot persist progress — ticks will be lost when you leave the page.');
      }
    }

    // ---- progress dashboard (Phase 5) ---------------------------------------
    //
    // Orchestration only. The syllabus comes from the data engine, completion
    // state from storage.js, and EVERY number from progress-engine. This file
    // never computes completed/total/percent and never caches progress values:
    // each render re-reads storage and re-asks the engine, so the dashboard can
    // never show a stale percentage (spec sections 2, 20, 23, 24, 55).

    var cycleStart = Calendar.isValidIsoDate(config.cycleStart) ? config.cycleStart
      : (Calendar.isValidIsoDate(config.initialDate) ? config.initialDate : DEFAULT_CONFIG.cycleStart);
    var coursesPromise = null;

    function syllabusUrls() {
      var base = config.syllabusBase || '';
      var files = Array.isArray(config.syllabusFiles) ? config.syllabusFiles : [];
      return files.map(function (file) { return base + file; });
    }

    function loadCoursesFromConfig() {
      var urls = syllabusUrls();
      if (urls.length === 0) {
        return Promise.reject(new Error('No canonical syllabus files configured (config.syllabusFiles)'));
      }
      var load = opts.loadCourses || function (list) { return DataEngine.loadCoursesFromUrls(list); };
      return load(urls).then(function (docs) {
        var courses = (docs || []).map(function (doc) {
          var result = DataEngine.validateCourse(doc);
          if (!result.valid) {
            throw new Error('Invalid course document: ' + result.errors.slice(0, 2).join(' | '));
          }
          return DataEngine.normalizeCourse(doc);
        });
        // Canonical subject order is the data engine's, never the UI's.
        return DataEngine.sortCourses(courses);
      });
    }

    // Loaded once per session, retried on the next attempt if it failed.
    function loadCourses() {
      if (!coursesPromise) {
        coursesPromise = loadCoursesFromConfig();
        coursesPromise.catch(function () { coursesPromise = null; });
      }
      return coursesPromise;
    }

    // Phase 6: the courses and the report model of the current visit. Kept so the
    // export handler can reuse the SAME model the viewer rendered, rather than
    // rebuilding (and risking a second, divergent calculation).
    var courseList = null;
    var currentModel = null;
    function subjectIdOrder(courses) {
      return courses.map(function (course) { return course.subjectId; });
    }

    function subjectLabels(courses) {
      var labels = {};
      courses.forEach(function (course) {
        labels[course.subjectId] = course.courseName || course.subjectId;
      });
      return labels;
    }

    function findCourse(courses, subjectId) {
      return courses.find(function (course) { return course.subjectId === subjectId; }) || null;
    }

    // The materialized cycle grid: weeks (from the canonical documents' own
    // weekCount) × days, anchored at the configured cycle start. Which dates the
    // grid contains is schedule structure; the day's identity, week number and
    // progress still come from the plan document and the engine.
    function cycleDateList(courses) {
      var weeks = config.cycleWeeks;
      courses.forEach(function (course) {
        var declared = Number(course.weekCount);
        if (isFinite(declared) && declared > weeks) weeks = declared;
      });
      var total = weeks * config.daysPerWeek;
      var dates = [];
      for (var i = 0; i < total; i++) dates.push(Calendar.addDays(cycleStart, i));
      return dates;
    }

    function weekDateList(weekNumber) {
      var perWeek = config.daysPerWeek;
      var offset = (weekNumber - 1) * perWeek;
      var dates = [];
      for (var i = 0; i < perWeek; i++) dates.push(Calendar.addDays(cycleStart, offset + i));
      return dates;
    }

    function loadCyclePlans(courses) {
      var dates = cycleDateList(courses);
      return Promise.all(dates.map(function (date) {
        return planStore.getPlan(date).then(function (plan) { return plan; }, function (error) {
          console.warn('Progress: could not load plan for ' + date, error);
          return null;
        });
      })).then(function (plans) {
        var byDate = {};
        dates.forEach(function (date, index) { byDate[date] = plans[index]; });
        return byDate;
      });
    }

    // Tasks of one subject inside a day's plan — used so a subject-scoped
    // drill-down stays subject-scoped. The counting is still the engine's.
    function subjectTasksOfPlan(plan, subjectId) {
      return (plan.tasks || []).filter(function (task) {
        return task.subjectId === subjectId;
      }).map(function (task) {
        return { taskId: task.taskId, type: task.type };
      });
    }

    // Day rows for a week: the date grid supplies the rows, the plan supplies the
    // day identity, and the engine supplies every number. When a subjectId is
    // given, each day is scoped to that subject (week rows then sum exactly to
    // that subject's week total).
    function weekDayRows(weekNumber, plansByDate, completions, subjectId) {
      return weekDateList(weekNumber).map(function (date) {
        var plan = plansByDate ? plansByDate[date] : null;
        var node = null;
        if (plan) {
          node = subjectId
            ? ProgressEngine.progressForTasks(subjectTasksOfPlan(plan, subjectId), completions)
            : ProgressEngine.dayProgress(plan, completions);
        }
        return {
          date: date,
          dayNumber: plan ? plan.dayNumber : null,
          dayTypeLabel: plan ? DayProgress.inferDayTypeLabel(plan) : '',
          node: node
        };
      });
    }

    function progressNav(level, context) {
      var ctx = Object.assign({
        calendarHash: RouterModule.routeForCalendar(),
        progressHash: RouterModule.routeForProgress()
      }, context || {});
      return ProgressDrilldown.buildNavViewModel(level, ctx);
    }

    function progressPage(nav, heading, body) {
      return { nav: nav, heading: heading || '', body: body };
    }

    function progressNotice(nav, options) {
      return progressPage(nav, '', ProgressDashboard.renderNoticeHTML(options));
    }

    function renderProgressLoading() {
      Renderer.setHtml(rootElement, ProgressDashboard.renderNoticeHTML({
        heading: 'Loading progress…',
        message: 'Reading the canonical syllabus and the materialised daily plans.'
      }));
    }

    function renderProgressFailure(error, label) {
      console.error('Progress (' + label + '):', error);
      Renderer.setHtml(rootElement, ProgressDashboard.renderNoticeHTML({
        heading: 'Unable to load progress data',
        message: 'Please refresh and try again.',
        href: RouterModule.routeForCalendar(),
        linkLabel: 'Back to Calendar'
      }));
    }

    // Loads the syllabus (once per session) then renders the requested level.
    // Only the newest request may paint, so fast clicking cannot show stale
    // output, and a failure never leaves a half-built page on screen.
    function runProgressLevel(label, build) {
      var token = ++state.requestToken;
      state.trackerController = null;
      renderProgressLoading();
      Promise.resolve()
        .then(function () { return loadCourses(); })
        .then(function (courses) {
          if (token !== state.requestToken) return null;
          return build(courses);
        })
        .then(function (page) {
          if (token !== state.requestToken || !page) return;
          Renderer.setHtml(rootElement, ProgressDrilldown.renderProgressPageHTML(page));
        })
        .catch(function (error) {
          if (token !== state.requestToken) return;
          renderProgressFailure(error, label);
        });
    }

    function unknownSubjectNotice(subjectId) {
      return progressNotice(progressNav('subject', {
        subjectLabel: subjectId,
        subjectHash: RouterModule.routeForProgressSubject(subjectId)
      }), {
        heading: 'Unknown subject',
        message: '"' + subjectId + '" is not part of the canonical syllabus.',
        href: RouterModule.routeForProgress(),
        linkLabel: 'Back to Progress'
      });
    }

    function renderProgressOverall() {
      runProgressLevel('overall', function (courses) {
        var completions = storage.getAllCompletions();
        var progressData = ProgressEngine.progressForAllCourses(courses, completions);
        var viewModel = ProgressDashboard.buildDashboardViewModel(progressData, {
          heading: 'Progress',
          subjectOrder: subjectIdOrder(courses),
          labels: subjectLabels(courses),
          subjectLinkFor: RouterModule.routeForProgressSubject,
          weekLinkFor: RouterModule.routeForProgressWeek
        });
        return progressPage(progressNav('overall', null),
          viewModel.heading, ProgressDashboard.renderDashboardHTML(viewModel));
      });
    }

    function renderProgressSubject(route) {
      runProgressLevel('subject', function (courses) {
        var course = findCourse(courses, route.subjectId);
        if (!course) return unknownSubjectNotice(route.subjectId);
        var completions = storage.getAllCompletions();
        var labels = subjectLabels(courses);
        var subjectResult = ProgressEngine.progressForCourse(course, completions);
        var viewModel = SubjectProgress.buildSubjectDetailViewModel(subjectResult, {
          labels: labels,
          weekLinkFor: function (weekNumber) {
            return RouterModule.routeForProgressSubjectWeek(course.subjectId, weekNumber);
          }
        });
        return progressPage(progressNav('subject', {
          subjectLabel: labels[course.subjectId],
          subjectHash: RouterModule.routeForProgressSubject(course.subjectId)
        }), viewModel.heading, SubjectProgress.renderSubjectDetailHTML(viewModel));
      });
    }

    function renderProgressSubjectWeek(route) {
      runProgressLevel('subjectWeek', function (courses) {
        var course = findCourse(courses, route.subjectId);
        if (!course) return unknownSubjectNotice(route.subjectId);
        var labels = subjectLabels(courses);
        var label = labels[course.subjectId];
        var known = (course.weeks || []).some(function (week) { return week.weekNumber === route.weekNumber; });
        if (!known) {
          return progressNotice(progressNav('subjectWeek', {
            subjectLabel: label,
            subjectHash: RouterModule.routeForProgressSubject(course.subjectId),
            weekNumber: route.weekNumber
          }), {
            heading: 'Week ' + route.weekNumber + ' is not part of this cycle',
            message: label + ' has ' + (course.weeks || []).length + ' planned weeks.',
            href: RouterModule.routeForProgressSubject(course.subjectId),
            linkLabel: 'Back to ' + label
          });
        }
        var completions = storage.getAllCompletions();
        var weekNode = ProgressEngine.weekProgressForCourse(course, route.weekNumber, completions);
        return loadCyclePlans(courses).then(function (plansByDate) {
          var days = weekDayRows(route.weekNumber, plansByDate, completions, course.subjectId);
          var viewModel = WeekProgress.buildWeekDetailViewModel(route.weekNumber, weekNode, days, {
            linkFor: RouterModule.routeForProgressDay,
            scopeLabel: label
          });
          return progressPage(progressNav('subjectWeek', {
            subjectLabel: label,
            subjectHash: RouterModule.routeForProgressSubject(course.subjectId),
            weekNumber: route.weekNumber
          }), label + ' • Week ' + route.weekNumber, WeekProgress.renderWeekDetailHTML(viewModel));
        });
      });
    }

    function renderProgressWeek(route) {
      runProgressLevel('week', function (courses) {
        var maxWeek = cycleDateList(courses).length / config.daysPerWeek;
        if (route.weekNumber > maxWeek) {
          return progressNotice(progressNav('overall', null), {
            heading: 'Week ' + route.weekNumber + ' is not part of this cycle',
            message: 'This cycle has ' + maxWeek + ' weeks.',
            href: RouterModule.routeForProgress(),
            linkLabel: 'Back to Progress'
          });
        }
        var completions = storage.getAllCompletions();
        var weekNode = ProgressEngine.weekProgressAcrossSubjects(courses, route.weekNumber, completions);
        return loadCyclePlans(courses).then(function (plansByDate) {
          var days = weekDayRows(route.weekNumber, plansByDate, completions);
          var viewModel = WeekProgress.buildWeekDetailViewModel(route.weekNumber, weekNode, days, {
            linkFor: RouterModule.routeForProgressDay,
            scopeLabel: 'All subjects'
          });
          return progressPage(progressNav('week', { weekNumber: route.weekNumber }),
            'Week ' + route.weekNumber + ' • all subjects', WeekProgress.renderWeekDetailHTML(viewModel));
        });
      });
    }

    function renderProgressDay(route) {
      runProgressLevel('day', function (courses) {
        if (!route.dateValid) {
          return progressNotice(progressNav('overall', null), {
            heading: 'Invalid date',
            message: '"' + route.date + '" is not a valid date in this planner.',
            href: RouterModule.routeForProgress(),
            linkLabel: 'Back to Progress'
          });
        }
        return planStore.getPlan(route.date).then(function (plan) {
          if (!plan) {
            return progressNotice(progressNav('day', { dayLabel: route.date }), {
              heading: 'No study plan available',
              message: 'No study plan available for this date.',
              href: RouterModule.routeForProgress(),
              linkLabel: 'Back to Progress'
            });
          }
          var completions = storage.getAllCompletions();
          var dayNode = ProgressEngine.dayProgress(plan, completions);
          var viewModel = DayProgress.buildDayViewModel(plan, dayNode, completions, {
            trackerLinkFor: RouterModule.routeForDay
          });
          return progressPage(progressNav('day', {
            dayLabel: 'Day ' + plan.dayNumber,
            weekNumber: plan.weekNumber,
            weekHash: RouterModule.routeForProgressWeek(plan.weekNumber)
          }), viewModel.heading, DayProgress.renderDayHTML(viewModel));
        });
      });
    }

    function renderProgress(route) {
      setCalendarRootClass(false);
      if (route.level === 'subject') return renderProgressSubject(route);
      if (route.level === 'subjectWeek') return renderProgressSubjectWeek(route);
      if (route.level === 'week') return renderProgressWeek(route);
      if (route.level === 'day') return renderProgressDay(route);
      return renderProgressOverall();
    }

    // ---- Phase 6: report viewer ------------------------------------------
    //
    // Reports are READ-ONLY views of the report model. The app builds ONE model
    // per visit from the same plans + completion map the dashboard uses, and the
    // viewer renders it. Nothing in this section writes to storage or mutates a
    // plan document; exporting only serialises the model to a string.

    function reportLinkFor() {
      return {
        subject: RouterModule.routeForReportSubject,
        week: RouterModule.routeForReportWeek,
        day: RouterModule.routeForReportDay,
        subjectWeek: function (subjectId, weekNumber) {
          return RouterModule.routeForReportCalendar(weekNumber, subjectId);
        }
      };
    }

    // CHANGE-002 (U4): the shell now leads with the SAME breadcrumb hierarchy
    // Progress uses — Calendar > Reports > [current report] — instead of the
    // flat "← Reports" link. The viewer BUILDS the crumb model and the working
    // Progress renderer (ProgressDrilldown.renderNavHTML) draws it, so both
    // sections share one breadcrumb system. opts.kind selects the crumb title
    // from the viewer's scope table; 'index' renders Calendar > Reports.
    // Contextual links (Timetable / Progress) stay after the crumbs.
    function reportShell(title, body, options) {
      var opts = options || {};
      var kind = opts.kind || 'deep';
      var nav = ProgressDrilldown.renderNavHTML(ReportViewer.buildReportNavViewModel(
        kind === 'index' ? 'index' : kind, {
          calendarHash: RouterModule.routeForCalendar(),
          reportsHash: RouterModule.routeForReports(),
          title: opts.crumbTitle
        }));
      return '<div class="rp-page">' +
        '<div class="rp-page-nav">' + nav +
        (opts.calHref ? '<a class="rp-link" href="' + opts.calHref +
          '" data-action="navigate" data-hash="' + opts.calHref + '">Timetable</a>' : '') +
        (opts.progressHref ? '<a class="rp-link" href="' + opts.progressHref +
          '" data-action="navigate" data-hash="' + opts.progressHref + '">Progress</a>' : '') +
        '</div>' + title + body + '</div>';
    }

    function reportExportButton(reportKind, discriminator) {
      var fileName = ExportEngine.suggestFileName(reportKind, discriminator);
      return ExportControls.renderControlsHTML(ExportControls.buildControlsViewModel({
        scope: reportKind,
        fileName: fileName.split('/').pop()
      }));
    }

    // ---- report scope renderers ------------------------------------------

    // The index is static, so it paints synchronously — unlike the data-backed
    // scopes, which go through runReportLevel.
    function renderReportsIndex() {
      var routes = [
        { label: 'Overall progress', detail: 'The whole cycle', hash: RouterModule.routeForReportOverall() },
        // U3 §3.1/§3.2: renamed, and it opens the WEEK-SELECTION view (no
        // silent jump straight into Week 1).
        { label: 'Weekly Timetable Chart', detail: 'Week 1–4 · 7-day schedule with real times',
          hash: RouterModule.routeForReportCalendar() },
        // U4 §4.1: the card opens the FOUR-WEEK SELECTION layer, not Week 1.
        { label: 'Weekly report', detail: 'Week 1–4 tasks and progress',
          hash: RouterModule.routeForReportWeekSelect() },
        { label: 'Daily report', detail: 'One day, blocks and tasks',
          hash: RouterModule.routeForReportDay(state.selectedDate) }
      ];
      Renderer.setHtml(rootElement, reportShell(
        '<h2 class="rp-heading">Reports</h2>',
        ReportViewer.renderIndexHTML(routes),
        { kind: 'index' }
      ));
    }

    // U3 §3.2: the Weekly Timetable Chart first shows all four study weeks.
    // The ranges come from the SAME report model the chart uses (canonical
    // plan weekNumber -> first/last plan dates), so selector and chart can
    // never disagree — no second week/date mapping.
    function renderCalendarWeekSelector() {
      return runReportLevel('calendar-select', function (model) {
        var weeks = [1, 2, 3, 4].map(function (n) {
          var week = model.buildWeekReport(n);
          return {
            weekNumber: n,
            startDate: week.startDate,
            endDate: week.endDate,
            dayCount: week.days.length,
            available: week.available
          };
        });
        return reportShell(
          '<h2 class="rp-heading">Weekly Timetable Chart</h2>',
          ReportViewer.renderWeekSelectHTML(weeks, {
            note: 'All four study weeks of the cycle — pick one to open its timetable chart.'
          }),
          { kind: 'calendar-select' }
        );
      });
    }

    // U4 §4.1: the Weekly Report first shows all four study weeks, built from
    // the SAME report model (canonical ranges, real per-week progress — a
    // future week shows its true 0%, never hidden). Picking a week opens
    // #/reports/week/<n>, the specific week's report.
    function renderReportWeekSelector() {
      return runReportLevel('week-select', function (model) {
        var weeks = [1, 2, 3, 4].map(function (n) {
          var week = model.buildWeekReport(n);
          return {
            weekNumber: n,
            startDate: week.startDate,
            endDate: week.endDate,
            dayCount: week.days.length,
            available: week.available,
            percent: week.node ? week.node.percent : 0,
            hash: RouterModule.routeForReportWeek(n)
          };
        });
        return reportShell(
          '<h2 class="rp-heading">Weekly report</h2>',
          ReportViewer.renderWeekSelectHTML(weeks, {
            note: 'All four study weeks of the cycle — pick one to open its weekly report.'
          }),
          { kind: 'week-select' }
        );
      });
    }

    function renderReportOverall() {
      return runReportLevel('overall', function (model) {
        var report = model.buildOverallReport();
        return reportShell(
          ReportViewer.renderReportHTML('overall', report, { links: reportLinkFor() }),
          reportExportButton('overall'),
          { kind: 'overall', progressHref: RouterModule.routeForProgress() }
        );
      });
    }

    function renderReportSubject(route) {
      return runReportLevel('subject', function (model) {
        var report = model.buildSubjectReport(route.subjectId);
        return reportShell(
          ReportViewer.renderReportHTML('subject', report, { links: reportLinkFor() }),
          reportExportButton('subject', report.label),
          { kind: 'subject', calHref: RouterModule.routeForReportCalendar(1, route.subjectId) }
        );
      });
    }

    function renderReportWeek(route) {
      return runReportLevel('week', function (model) {
        var report = model.buildWeekReport(route.weekNumber);
        return reportShell(
          ReportViewer.renderReportHTML('week', report, { links: reportLinkFor() }),
          reportExportButton('week', route.weekNumber),
          { kind: 'week', calHref: RouterModule.routeForReportCalendar(route.weekNumber) }
        );
      });
    }

    function renderReportDay(route) {
      return runReportLevel('day', function (model) {
        var report = model.buildDayReport(route.date);
        return reportShell(
          ReportViewer.renderReportHTML('day', report, { links: reportLinkFor() }),
          reportExportButton('day', route.date),
          { kind: 'day' }
        );
      });
    }

    // The weekly progress calendar: report model -> calendar view model -> DOM.
    // Exported through the same model via ExportEngine.exportCalendar.
    function renderReportCalendar(route) {
      return runReportLevel('calendar', function (model) {
        var weekNumber = route.weekNumber || 1;
        var report = model.buildCalendarReport(weekNumber, { subjectId: route.subjectId });
        var viewModel = ProgressCalendar.buildCalendarViewModel(report);
        // U3 §3.1: the on-screen chart is titled "Weekly Timetable Chart".
        // The report MODEL (and therefore the locked, working HTML export)
        // keeps its existing title untouched.
        if (viewModel && !route.subjectId) {
          viewModel.title = 'Weekly Timetable Chart — Week ' + weekNumber;
        }
        // renderHeadHTML already prints the title, so no extra heading here.
        var body = ProgressCalendar.renderHeadHTML(viewModel) +
          ProgressCalendar.renderCalendarHTML(viewModel);
        return reportShell('', body + reportExportButton('calendar', weekNumber),
          { kind: 'calendar' });
      });
    }

    function renderReports(route) {
      setCalendarRootClass(false);
      if (route.level === 'overall') return renderReportOverall();
      if (route.level === 'subject') return renderReportSubject(route);
      if (route.level === 'week-select') return renderReportWeekSelector();
      if (route.level === 'week') return renderReportWeek(route);
      if (route.level === 'day') return renderReportDay(route);
      if (route.level === 'calendar-select') return renderCalendarWeekSelector();
      if (route.level === 'calendar') return renderReportCalendar(route);
      return renderReportsIndex();
    }

    // Export is READ-ONLY: it serialises the report model that is already on
    // screen into a standalone document and offers it as a download. It never
    // writes storage and never touches a plan document.
    function exportCurrentReport(element) {
      var route = state.currentRoute;
      if (!currentModel || !route || route.view !== 'reports') {
        showToast('Open a report first, then export it.');
        return;
      }
      var fileName = (element && element.getAttribute('data-file')) || 'report.html';
      var html;
      try {
        if (route.level === 'calendar') {
          html = ExportEngine.exportCalendar(currentModel, route.weekNumber || 1);
        } else if (route.level === 'overall') {
          html = ExportEngine.exportOverall(currentModel);
        } else if (route.level === 'subject') {
          html = ExportEngine.exportSubject(currentModel, route.subjectId);
        } else if (route.level === 'week') {
          html = ExportEngine.exportWeek(currentModel, route.weekNumber);
        } else if (route.level === 'day') {
          html = ExportEngine.exportDaily(currentModel, route.date);
        } else {
          showToast('There is no report on this page to export.');
          return;
        }
      } catch (error) {
        console.error('Export:', error);
        showToast('The report could not be exported.');
        return;
      }
      var result = ExportControls.downloadHTML(ExportEngine, html, fileName, doc);
      if (!result.ok) {
        showToast('Export is not available in this browser.');
      }
    }

    // Loads syllabus + cycle plans once, then renders whichever report scope the
    // route asked for. Same stale-response guard as the progress renderer.
    function runReportLevel(label, build) {
      var token = ++state.requestToken;
      state.trackerController = null;
      renderProgressLoading();
      Promise.resolve()
        .then(function () { return loadCourses(); })
        .then(function (courses) {
          if (token !== state.requestToken) return null;
          courseList = courses;
          return loadCyclePlans(courses);
        })
        .then(function (plansByDate) {
          if (token !== state.requestToken) return null;
          // One model, shared by the viewer and (on demand) the exporter.
          var model = ReportModel.createReportModel({
            courses: courseList,
            completions: storage.getAllCompletions(),
            plans: Object.keys(plansByDate).map(function (date) { return plansByDate[date]; })
              .filter(Boolean)
          });
          currentModel = model;
          return build(model);
        })
        .then(function (html) {
          if (token !== state.requestToken || !html) return;
          Renderer.setHtml(rootElement, html);
        })
        .catch(function (error) {
          if (token !== state.requestToken) return;
          renderProgressFailure(error, label);
        });
    }

    // ---- calendar notes / events (U2) -------------------------------------
    //
    // User-created calendar metadata only. These write to calendarMetadata's own
    // storage key; they never touch `storage` (completion) or any planner data.

    // ---- U2.3: in-app entry modal (replaces the native prompt) -----------
    //
    // ONE modal system serves both flows (note / event), styled to the
    // Calendar's dark-violet glass theme so it reads as part of the app —
    // never a browser-native "localhost says" prompt/alert/confirm. Only the
    // TEXT CAPTURE changed: the persistence below is exactly the U2 mechanism.

    var entryModalState = null;

    function closeEntryModal() {
      if (!entryModalState) return;
      var modal = entryModalState;
      entryModalState = null;
      if (modal.keyHandler && doc.removeEventListener) {
        doc.removeEventListener('keydown', modal.keyHandler);
      }
      if (modal.backdrop && modal.backdrop.parentNode) {
        modal.backdrop.parentNode.removeChild(modal.backdrop);
      }
      if (modal.restoreFocus && typeof modal.restoreFocus.focus === 'function') {
        try { modal.restoreFocus.focus(); } catch (e) { /* trigger node may be gone */ }
      }
    }

    function openEntryModal(opts) {
      // Non-browser contexts (unit-test fakes) never open a modal: no-op.
      if (!doc || typeof doc.createElement !== 'function' || !doc.body) return;
      closeEntryModal(); // one modal at a time
      var isEvent = opts.kind === 'event';
      var dateText = Renderer.escapeHtml(String(Calendar.formatLongDate(opts.date)));
      var backdrop = doc.createElement('div');
      backdrop.className = 'entry-modal-backdrop';
      backdrop.innerHTML =
        '<div class="entry-modal" role="dialog" aria-modal="true" aria-labelledby="entryModalTitle">' +
          '<div class="entry-modal-head">' +
            '<span class="entry-modal-dot" aria-hidden="true"></span>' +
            '<div class="entry-modal-titles">' +
              '<h3 class="entry-modal-title" id="entryModalTitle">' +
                (isEvent ? 'New event' : 'Add a note') + '</h3>' +
              '<p class="entry-modal-context">' + dateText + '</p>' +
            '</div>' +
          '</div>' +
          '<label class="entry-modal-label" for="entryModalInput">' +
            (isEvent ? 'Event title' : 'Note') + '</label>' +
          '<input class="entry-modal-input" id="entryModalInput" type="text" autocomplete="off" ' +
            'placeholder="' + (isEvent ? 'What is happening?' : 'Write a note...') + '">' +
          (isEvent
            ? '<label class="entry-modal-label" for="entryModalTime">Start time ' +
                '<span>(optional, HH:MM)</span></label>' +
              '<input class="entry-modal-input entry-modal-time" id="entryModalTime" ' +
                'type="text" autocomplete="off" placeholder="HH:MM">'
            : '') +
          '<div class="entry-modal-actions">' +
            '<button type="button" class="entry-modal-cancel" data-modal-action="cancel">Cancel</button>' +
            '<button type="button" class="entry-modal-confirm" data-modal-action="confirm">Save</button>' +
          '</div>' +
        '</div>';
      doc.body.appendChild(backdrop);

      var input = backdrop.querySelector('#entryModalInput');
      var timeInput = backdrop.querySelector('#entryModalTime');
      var previousFocus = doc.activeElement || null;

      function confirmModal() {
        var values = { text: input ? input.value : '' };
        if (isEvent) {
          values.time = timeInput && String(timeInput.value).trim()
            ? String(timeInput.value).trim()
            : undefined;
        }
        closeEntryModal();
        if (opts.onConfirm) opts.onConfirm(values);
      }
      function cancelModal() { closeEntryModal(); } // closes and saves nothing

      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) { cancelModal(); return; } // backdrop click = Cancel
        var actionTarget = event.target.closest ? event.target.closest('[data-modal-action]') : null;
        var action = actionTarget ? actionTarget.getAttribute('data-modal-action') : null;
        if (action === 'confirm') confirmModal();
        else if (action === 'cancel') cancelModal();
      });
      backdrop.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); confirmModal(); }
      });
      entryModalState = {
        backdrop: backdrop,
        restoreFocus: previousFocus,
        keyHandler: function (event) {
          if (event.key === 'Escape') { event.preventDefault(); cancelModal(); }
        }
      };
      if (doc.addEventListener) doc.addEventListener('keydown', entryModalState.keyHandler);
      if (input && input.focus) input.focus();
    }

    function addNoteFor(date) {
      if (!calendarMetadata.isIsoDate(date)) return;
      openEntryModal({
        kind: 'note',
        date: date,
        onConfirm: function (values) {
          var text = values.text;
          if (text === null || text === undefined) return; // cancelled
          try {
            calendarMetadata.addNote(date, text);
            showToast('Note added to ' + Calendar.formatLongDate(date) + '.');
          } catch (error) {
            console.error('Calendar: could not add note', error);
            showToast('That note could not be saved.');
            return;
          }
          renderCalendar();
        }
      });
    }

    function addEventFor(date) {
      if (!calendarMetadata.isIsoDate(date)) return;
      openEntryModal({
        kind: 'event',
        date: date,
        onConfirm: function (values) {
          var title = values.text;
          if (title === null || title === undefined) return; // cancelled
          if (!String(title).trim()) return;
          var time = values.time; // optional; captured in the same modal
          try {
            calendarMetadata.addEvent(date, title, time ? { time: time } : undefined);
            showToast('Event added to ' + Calendar.formatLongDate(date) + '.');
          } catch (error) {
            console.error('Calendar: could not add event', error);
            showToast('That event could not be saved.');
            return;
          }
          renderCalendar();
        }
      });
    }

    function removeCalendarEntry(kind, date, id) {
      try {
        var removed = kind === 'note'
          ? calendarMetadata.removeNote(date, id)
          : calendarMetadata.removeEvent(date, id);
        if (removed) showToast((kind === 'note' ? 'Note' : 'Event') + ' removed.');
      } catch (error) {
        console.error('Calendar: could not remove entry', error);
        showToast('That item could not be removed.');
        return;
      }
      renderCalendar();
    }

    // ---- event wiring ------------------------------------------------------

    function onActionClick(event, element) {
      var action = element.getAttribute('data-action');
      switch (action) {
        case 'select-date': setSelectedDate(element.getAttribute('data-date')); break;
        case 'previous': shiftPeriod(-1); break;
        case 'next': shiftPeriod(1); break;
        case 'view-month': setCalendarView('month'); break;
        case 'view-week': setCalendarView('week'); break;
        // U5.1 (CHANGE #004): one actual step back — browser history when the
        // session has navigated, otherwise the control's semantic parent, then
        // the Calendar (see goBack).
        case 'back': goBack(element); break;
        // U5.1 (CHANGE #002): Home appears on every non-home screen and always
        // resolves to #/calendar. router.navigate de-duplicates an identical
        // destination, so single- and double-click converge safely.
        case 'open-home': router.navigate(RouterModule.routeForCalendar()); break;
        case 'open-progress': router.navigate(RouterModule.routeForProgress()); break;
        case 'open-reports': router.navigate(RouterModule.routeForReports()); break;
        case 'navigate': navigateTo(element.getAttribute('data-hash')); break;
        case 'export-html': exportCurrentReport(element); break;
        case 'add-note': addNoteFor(element.getAttribute('data-date')); break;
        case 'add-event': addEventFor(element.getAttribute('data-date')); break;
        case 'remove-note': removeCalendarEntry('note', element.getAttribute('data-date'), element.getAttribute('data-entry-id')); break;
        case 'remove-event': removeCalendarEntry('event', element.getAttribute('data-date'), element.getAttribute('data-entry-id')); break;
        default: break; // toggle-task is handled on 'change'
      }
    }

    function onTaskToggle(taskId, completed) {
      var controller = state.trackerController;
      if (!controller) return;
      try {
        controller.setTaskCompleted(taskId, completed);
      } catch (error) {
        console.error('Tracker: could not save completion', error);
        showToast('Your progress could not be saved. Please try again.');
        return;
      }
      updateTrackerUI();
    }

    function wireEvents() {
      if (headerElement && typeof headerElement.addEventListener === 'function') {
        Renderer.delegate(headerElement, 'click', '[data-action]', onActionClick);
      }
      if (!rootElement || typeof rootElement.addEventListener !== 'function') return;
      Renderer.delegate(rootElement, 'click', '[data-action]', onActionClick);
      // U2.1 direct Daily Tracker entry: double-click a date opens THAT EXACT
      // date's tracker, in both Weekly and Monthly. No intermediate panel.
      Renderer.delegate(rootElement, 'dblclick', '[data-date]', function (event, element) {
        openTracker(element.getAttribute('data-date'));
      });
      // Right-click also opens the exact date's tracker (native menu suppressed).
      Renderer.delegate(rootElement, 'contextmenu', '[data-date]', function (event, element) {
        event.preventDefault();
        openTracker(element.getAttribute('data-date'));
      });
      Renderer.delegate(rootElement, 'keydown', '[data-date]', function (event, element) {
        if (event.key === 'Enter') {
          event.preventDefault();
          openTracker(element.getAttribute('data-date'));
        }
      });
      Renderer.delegate(rootElement, 'change', 'input[data-action="toggle-task"]', function (event, element) {
        onTaskToggle(element.getAttribute('data-task-id'), element.checked === true);
      });
    }

    // ---- lifecycle ---------------------------------------------------------

    function start() {
      reportStorageDiagnostics();
      wireEvents();
      router.onChange(handleRouteChange);
      router.start(); // emits the initial route
      return api;
    }

    function stop() {
      if (router.stop) router.stop();
    }

    var api = {
      getState: getState,
      render: function () { handleRouteChange(state.currentRoute); return api; },
      setSelectedDate: setSelectedDate,
      setCalendarView: setCalendarView,
      openTracker: openTracker,
      backToCalendar: backToCalendar,
      start: start,
      stop: stop,
      storage: storage,
      planStore: planStore,
      calendarStore: calendarStore,
      calendarMetadata: calendarMetadata,
      getCalendarAccess: function () { return state.calendarAccess; },
      router: router
    };
    return api;
  }

  // Boot helper used by index.html: reads window.STUDY_PLANNER_CONFIG (if any),
  // creates the app and starts it. Kept tiny; all logic lives in createApp.
  function bootstrap(options) {
    var opts = options || {};
    var globalConfig = (typeof globalThis !== 'undefined' && globalThis.STUDY_PLANNER_CONFIG) || {};
    var app = createApp({
      config: Object.assign({}, globalConfig, opts.config || {}),
      document: opts.document,
      rootElement: opts.rootElement,
      toastElement: opts.toastElement
    });
    return app.start();
  }

  return {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    createPlanStore: createPlanStore,
    createCalendarStore: createCalendarStore,
    createApp: createApp,
    bootstrap: bootstrap
  };
});
