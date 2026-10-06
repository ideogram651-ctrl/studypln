'use strict';

/*
 * tests/renderer/progress.test.js — Study-Planner Phase 5
 *
 * Validates the Progress Dashboard and its drill-down:
 *   - router: #/progress deep routes (overall / subject / subject+week / week / day)
 *   - overall, subject, week and day rendering, with every number coming from
 *     progress-engine (never recomputed in the UI)
 *   - drill-down navigation and back/breadcrumb behaviour
 *   - live updates: tracker completion -> storage -> engine -> dashboard
 *   - empty / missing-plan / error states (no NaN, no invented data)
 *   - cross-level consistency: one task moves day, week, subject and overall
 *
 * The app is driven through a tiny hand-rolled DOM stub, so the full route ->
 * render path is exercised without a browser or an extra dependency.
 *
 * Run with:  node --test tests/renderer/progress.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DE = require(path.join(ROOT, 'src', 'js', 'data-engine.js'));
const PE = require(path.join(ROOT, 'src', 'js', 'progress-engine.js'));
const S = require(path.join(ROOT, 'src', 'js', 'storage.js'));
const Router = require(path.join(ROOT, 'src', 'js', 'router.js'));
const Calendar = require(path.join(ROOT, 'src', 'js', 'calendar.js'));
const App = require(path.join(ROOT, 'src', 'js', 'app.js'));
const CM = require(path.join(ROOT, 'src', 'js', 'calendar-metadata.js'));
const OverallProgress = require(path.join(ROOT, 'src', 'components', 'progress', 'overall-progress.js'));
const SubjectProgress = require(path.join(ROOT, 'src', 'components', 'progress', 'subject-progress.js'));
const WeekProgress = require(path.join(ROOT, 'src', 'components', 'progress', 'week-progress.js'));
const DayProgress = require(path.join(ROOT, 'src', 'components', 'progress', 'day-progress.js'));
const ProgressDashboard = require(path.join(ROOT, 'src', 'components', 'progress', 'progress-dashboard.js'));
const ProgressDrilldown = require(path.join(ROOT, 'src', 'components', 'progress', 'progress-drilldown.js'));

const COURSE_DOCS = DE.loadCoursesFromDirectory(path.join(ROOT, 'data', 'syllabus'));
const COURSES = DE.sortCourses(COURSE_DOCS.map((course) => DE.normalizeCourse(course)));
const SUBJECT_ORDER = COURSES.map((course) => course.subjectId);
const LABELS = COURSES.reduce((map, course) => { map[course.subjectId] = course.courseName; return map; }, {});

const DAY1 = '2026-10-02';
// U2: the canonical full-year calendar, used by the app's injectable calendarStore.
const CANONICAL_CALENDAR = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'calendar', 'calendar-2026.json'), 'utf8'));
const WEEK1_DATES = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
const MATH_L1_1 = 'mathematics-i:1:L1.1';
const MATH_L1_2 = 'mathematics-i:1:L1.2';
const AT = '2026-10-04T12:30:00.000Z';

// Every materialised plan, keyed by date (real repository data).
const PLAN_DIR = path.join(ROOT, 'data', 'schedule', 'daily');
const PLANS = {};
fs.readdirSync(PLAN_DIR).filter((file) => /\.json$/i.test(file)).forEach((file) => {
  const doc = JSON.parse(fs.readFileSync(path.join(PLAN_DIR, file), 'utf8'));
  PLANS[doc.date] = doc;
});
const PLAN_DATES = Object.keys(PLANS).sort();

function completion() {
  return { completed: true, completedAt: AT };
}

function completionsWith(taskIds) {
  const map = {};
  (taskIds || []).forEach((taskId) => { map[taskId] = completion(); });
  return map;
}

function storageWith(completions) {
  const backend = S.createMemoryBackend();
  if (completions && Object.keys(completions).length > 0) {
    backend.setItem(S.STORAGE_KEY, JSON.stringify({ schemaVersion: 1, completions: completions }));
  }
  return S.createStorage({ backend: backend });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(rounds) {
  for (let i = 0; i < (rounds || 4); i++) await tick();
}

function percentOf(html) {
  const match = /aria-valuenow="(\d+)"/.exec(html);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Minimal DOM / transport stubs (same approach as tests/renderer/app.test.js)
// ---------------------------------------------------------------------------

function fakeElement(attrs) {
  const el = {
    _attrs: Object.assign({}, attrs),
    _listeners: {},
    innerHTML: '',
    textContent: '',
    style: {},
    checked: false,
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    contains() { return true; },
    getAttribute(name) { return this._attrs[name] != null ? this._attrs[name] : null; },
    setAttribute(name, value) { this._attrs[name] = String(value); },
    removeAttribute(name) { delete this._attrs[name]; },
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  el.closest = (selector) => {
    if (selector === '[data-action]') return el._attrs['data-action'] ? el : null;
    if (selector === '[data-date]') return el._attrs['data-date'] ? el : null;
    if (selector === 'input[data-action="toggle-task"]') {
      return el._attrs['data-action'] === 'toggle-task' ? el : null;
    }
    return null;
  };
  return el;
}

function fakeRoot() {
  const root = fakeElement({});
  root.dispatch = (type, target) => {
    (root._listeners[type] || []).forEach((fn) => fn({ type, target, key: target && target.key, preventDefault() {} }));
  };
  return root;
}

function fakeTransport(initial) {
  let currentHash = initial || '#/calendar';
  const subscribers = [];
  return {
    getHash: () => currentHash,
    setHash: (hash) => {
      if (hash === currentHash) return;
      currentHash = hash;
      subscribers.slice().forEach((fn) => fn());
    },
    subscribe: (fn) => { subscribers.push(fn); return () => {}; }
  };
}

function stubLoadJson(url) {
  const match = /(\d{4}-\d{2}-\d{2})\.json$/.exec(url);
  const date = match ? match[1] : null;
  if (date && PLANS[date]) return Promise.resolve(PLANS[date]);
  const err = new Error('HTTP 404 for ' + url);
  err.code = 'fetch_failed';
  return Promise.reject(err);
}

function buildApp(overrides) {
  const requested = overrides || {};
  const root = fakeRoot();
  const transport = fakeTransport(requested.initialHash || '#/calendar');
  const router = requested.router || Router.createRouter({
    getHash: transport.getHash, setHash: transport.setHash, subscribe: transport.subscribe
  });
  const options = Object.assign({
    document: { getElementById: (id) => (id === 'view' ? root : null) },
    rootElement: root,
    toastElement: fakeElement({}),
    storage: storageWith(null),
    planStore: App.createPlanStore({ baseUrl: 'test/daily/', loadJson: stubLoadJson }),
    // U2: the app loads canonical calendar data through an injectable store; the
    // real file keeps the Calendar rendering genuine study-cycle metadata.
    calendarStore: App.createCalendarStore({
      url: 'test/calendar-2026.json',
      loadJson: () => Promise.resolve(CANONICAL_CALENDAR)
    }),
    calendarMetadata: CM.createCalendarMetadata({ backend: CM.createMemoryBackend() }),
    router: router,
    loadCourses: () => Promise.resolve(COURSE_DOCS),
    now: () => new Date(2026, 9, 2), // U2.2-002: mock "today" for deterministic startup
    config: { initialDate: DAY1, cycleStart: DAY1, calendarView: 'month', context: 'IIT Madras BS' }
  }, requested);
  const app = App.createApp(options);
  app.start();
  return { app: app, root: root, router: router, transport: transport, storage: options.storage };
}

// ---------------------------------------------------------------------------
// Router: progress routes
// ---------------------------------------------------------------------------

test('parseRoute understands every progress drill-down level', () => {
  assert.deepEqual(Router.parseRoute('#/progress'), { view: 'progress', level: 'overall', hash: '#/progress', fallback: false });

  const subject = Router.parseRoute('#/progress/subject/mathematics-i');
  assert.equal(subject.view, 'progress');
  assert.equal(subject.level, 'subject');
  assert.equal(subject.subjectId, 'mathematics-i');

  const subjectWeek = Router.parseRoute('#/progress/subject/mathematics-i/week/2');
  assert.equal(subjectWeek.level, 'subjectWeek');
  assert.equal(subjectWeek.subjectId, 'mathematics-i');
  assert.equal(subjectWeek.weekNumber, 2);

  const week = Router.parseRoute('#/progress/week/3');
  assert.equal(week.level, 'week');
  assert.equal(week.weekNumber, 3);

  const day = Router.parseRoute('#/progress/day/2026-10-02');
  assert.equal(day.level, 'day');
  assert.equal(day.date, '2026-10-02');
  assert.equal(day.dateValid, true);

  const badDay = Router.parseRoute('#/progress/day/2026-13-40');
  assert.equal(badDay.level, 'day');
  assert.equal(badDay.dateValid, false);
});

test('unknown progress hashes fall back to the dashboard; other routes are untouched', () => {
  assert.deepEqual(Router.parseRoute('#/progress/junk'), { view: 'progress', level: 'overall', hash: '#/progress', fallback: true });
  assert.deepEqual(Router.parseRoute('#/progress/subject/x/week/0'), { view: 'progress', level: 'overall', hash: '#/progress', fallback: true });
  // Phase 4 routes keep their exact shape (no regressions).
  assert.deepEqual(Router.parseRoute(''), { view: 'calendar', hash: '#/calendar', fallback: false });
  assert.deepEqual(Router.parseRoute('#/nonsense'), { view: 'calendar', hash: '#/calendar', fallback: true });
  assert.equal(Router.parseRoute('#/day/2026-10-05').view, 'day');
});

test('progress route builders round-trip through the parser (refresh-safe)', () => {
  const hashes = [
    Router.routeForProgress(),
    Router.routeForProgressSubject('statistics-i'),
    Router.routeForProgressSubjectWeek('english-i', 4),
    Router.routeForProgressWeek(2),
    Router.routeForProgressDay('2026-10-08')
  ];
  assert.deepEqual(hashes, [
    '#/progress', '#/progress/subject/statistics-i', '#/progress/subject/english-i/week/4',
    '#/progress/week/2', '#/progress/day/2026-10-08'
  ]);
  hashes.forEach((hash) => {
    const route = Router.parseRoute(hash);
    assert.equal(route.fallback, false);
    assert.equal(route.hash, hash);
    // Deterministic: a refresh re-parses to exactly the same level.
    assert.deepEqual(Router.parseRoute(hash), route);
  });
  assert.throws(() => Router.routeForProgressSubject(''), (err) => err.code === 'invalid_argument');
  assert.throws(() => Router.routeForProgressWeek(0), (err) => err.code === 'invalid_argument');
  assert.throws(() => Router.routeForProgressDay('nope'), (err) => err.code === 'invalid_argument');
});

// ---------------------------------------------------------------------------
// Overall progress
// ---------------------------------------------------------------------------

test('overall progress renders engine values verbatim', () => {
  const overall = PE.progressForAllCourses(COURSES, {}).overall;
  const vm = OverallProgress.buildOverallViewModel(overall, {});
  assert.equal(vm.total, overall.total);
  assert.equal(vm.completed, overall.completed);
  assert.equal(vm.remaining, overall.remaining);
  assert.equal(vm.percent, overall.percent);
  assert.equal(vm.total, 413);
  assert.equal(vm.statsLabel, '0 / 413 tasks completed');
  assert.equal(vm.percentLabel, '0%');
  assert.match(vm.ariaLabel, /0 percent, 0 of 413 tasks completed/);

  const html = OverallProgress.renderOverallHTML(vm);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /width:0%/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('overall progress follows real completions and the bar tracks the percentage', () => {
  const completions = completionsWith([MATH_L1_1, MATH_L1_2]);
  const overall = PE.progressForAllCourses(COURSES, completions).overall;
  const vm = OverallProgress.buildOverallViewModel(overall, {});

  assert.equal(vm.completed, 2);
  assert.equal(vm.percent, PE.percentFor(2, overall.total));
  assert.equal(vm.remaining, overall.total - 2);

  const html = OverallProgress.renderOverallHTML(vm);
  assert.match(html, new RegExp('width:' + vm.percent + '%'));
  assert.match(html, new RegExp('aria-valuenow="' + vm.percent + '"'));
  assert.match(html, /2 \/ 413 tasks completed/);
});

test('progress bar width always equals the percentage (0 / 50 / 100)', () => {
  [0, 50, 100].forEach((percent) => {
    const completed = percent / 10;
    const node = { total: 10, completed: completed, remaining: 10 - completed, percent: percent };
    const html = OverallProgress.renderOverallHTML(OverallProgress.buildOverallViewModel(node, {}));
    assert.match(html, new RegExp('style="width:' + percent + '%"'));
    assert.match(html, new RegExp('>' + percent + '%<'));
  });
});

test('an empty scope is 0%, never NaN / Infinity / undefined', () => {
  const node = PE.progressForTasks([], {});
  assert.deepEqual(node, { total: 0, completed: 0, remaining: 0, percent: 0 });

  const html = OverallProgress.renderOverallHTML(OverallProgress.buildOverallViewModel(node, {}));
  assert.match(html, /width:0%/);
  assert.match(html, /No tasks in this scope yet\./);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('overall progress refuses to invent a node', () => {
  assert.equal(OverallProgress.buildOverallViewModel(null, {}), null);
  assert.equal(OverallProgress.renderOverallHTML(null), '');
});

// ---------------------------------------------------------------------------
// Dashboard composition (Overall + Subjects + Weeks)
// ---------------------------------------------------------------------------

test('dashboard lists every subject in canonical order with engine values', () => {
  const completions = completionsWith([MATH_L1_1]);
  const progressData = PE.progressForAllCourses(COURSES, completions);
  const vm = ProgressDashboard.buildDashboardViewModel(progressData, {
    subjectOrder: SUBJECT_ORDER, labels: LABELS
  });

  assert.deepEqual(vm.subjects.items.map((item) => item.subjectId), SUBJECT_ORDER);
  assert.deepEqual(vm.subjects.items.map((item) => item.subjectId),
    ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i']);

  vm.subjects.items.forEach((item) => {
    const engineNode = progressData.subjects[item.subjectId];
    assert.equal(item.percent, engineNode.percent);
    assert.equal(item.total, engineNode.total);
    assert.equal(item.completed, engineNode.completed);
    assert.equal(item.label, LABELS[item.subjectId]);
  });

  const math = vm.subjects.items[0];
  assert.equal(math.completed, 1);
  assert.match(math.ariaLabel, /Mathematics I progress: \d+ percent, 1 of \d+ tasks completed/);

  assert.deepEqual(vm.weeks.items.map((item) => item.weekNumber), [1, 2, 3, 4]);
  assert.deepEqual(vm.weeks.items.map((item) => item.percent),
    [1, 2, 3, 4].map((n) => progressData.weeks['week-' + n].percent));
});

test('renderDashboardHTML shows overall, subjects and weeks with no undefined values', () => {
  const progressData = PE.progressForAllCourses(COURSES, {});
  const html = ProgressDashboard.renderDashboardHTML(
    ProgressDashboard.buildDashboardViewModel(progressData, { subjectOrder: SUBJECT_ORDER, labels: LABELS })
  );
  assert.match(html, /Overall progress/);
  assert.match(html, /Subjects/);
  assert.match(html, /Weeks/);
  assert.equal((html.match(/progress-row-subject/g) || []).length, 4);
  assert.equal((html.match(/class="progress-row"/g) || []).length, 4);
  assert.match(html, /0 \/ 413 tasks completed/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

// ---------------------------------------------------------------------------
// Subject progress
// ---------------------------------------------------------------------------

test('subject detail lists the four weeks straight from the engine', () => {
  const completions = completionsWith([MATH_L1_1]);
  const course = COURSES.find((c) => c.subjectId === 'mathematics-i');
  const subjectResult = PE.progressForCourse(course, completions);
  const vm = SubjectProgress.buildSubjectDetailViewModel(subjectResult, {
    labels: LABELS,
    weekLinkFor: (weekNumber) => '#/progress/subject/mathematics-i/week/' + weekNumber
  });

  assert.equal(vm.heading, 'Mathematics I progress');
  assert.equal(vm.percent, subjectResult.percent);
  assert.equal(vm.completed, 1);
  assert.deepEqual(vm.weeks.items.map((item) => item.weekNumber), [1, 2, 3, 4]);
  vm.weeks.items.forEach((item) => {
    const weekNode = subjectResult.weeks['week-' + item.weekNumber];
    assert.equal(item.percent, weekNode.percent);
    assert.equal(item.total, weekNode.total);
    assert.equal(item.href, '#/progress/subject/mathematics-i/week/' + item.weekNumber);
  });

  const html = SubjectProgress.renderSubjectDetailHTML(vm);
  assert.match(html, /data-hash="#\/progress\/subject\/mathematics-i\/week\/1"/);
  assert.equal((html.match(/class="progress-row"/g) || []).length, 4);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('subject list is canonical-ordered, never progress-ranked, and never drops a scope', () => {
  const progressData = PE.progressForAllCourses(COURSES, {});
  const items = SubjectProgress.buildSubjectListViewModel(progressData, {
    order: SUBJECT_ORDER, labels: LABELS
  }).items;
  assert.deepEqual(items.map((item) => item.subjectId), SUBJECT_ORDER);

  // A subject the caller did not list is appended rather than hidden.
  const withExtra = Object.assign({}, progressData.subjects, {
    'zzz-extra': { subjectId: 'zzz-extra', courseId: 'X', total: 5, completed: 0, remaining: 5, percent: 0 }
  });
  const vm = SubjectProgress.buildSubjectListViewModel({ subjects: withExtra }, {
    order: SUBJECT_ORDER, labels: LABELS
  });
  assert.equal(vm.items.length, 5);
  assert.deepEqual(vm.items.map((item) => item.subjectId).slice(0, 4), SUBJECT_ORDER);
  assert.equal(vm.items[4].subjectId, 'zzz-extra');
});

test('subject detail refuses an unknown subject result', () => {
  assert.equal(SubjectProgress.buildSubjectDetailViewModel(null), null);
});

// ---------------------------------------------------------------------------
// Week progress
// ---------------------------------------------------------------------------

function mkNode(total, completed) {
  return PE.makeNode(total, completed);
}

test('week rows carry engine values and links to each week', () => {
  const progressData = PE.progressForAllCourses(COURSES, {});
  const vm = WeekProgress.buildWeekListViewModel(progressData.weeks, {
    linkFor: (weekNumber) => '#/progress/week/' + weekNumber
  });
  assert.deepEqual(vm.items.map((item) => item.weekNumber), [1, 2, 3, 4]);
  vm.items.forEach((item) => {
    const engineWeek = progressData.weeks['week-' + item.weekNumber];
    assert.equal(item.percent, engineWeek.percent);
    assert.equal(item.total, engineWeek.total);
    assert.equal(item.completed, engineWeek.completed);
    assert.equal(item.href, '#/progress/week/' + item.weekNumber);
    assert.match(item.ariaLabel, /Week \d progress: \d+ percent/);
  });
});

test('week rows sort numerically, not lexicographically (week-10 after week-2)', () => {
  const vm = WeekProgress.buildWeekListViewModel({
    'week-2': mkNode(10, 1), 'week-10': mkNode(10, 5), 'week-1': mkNode(10, 0)
  });
  assert.deepEqual(vm.items.map((item) => item.weekNumber), [1, 2, 10]);
  assert.equal(WeekProgress.weekNumberOf('week-7'), 7);
  assert.equal(WeekProgress.weekNumberOf('nonsense'), null);
});

test('week detail renders exactly the seven cycle days with engine numbers', () => {
  const completions = completionsWith([MATH_L1_1]);
  const course = COURSES.find((c) => c.subjectId === 'mathematics-i');
  const weekNode = PE.weekProgressForCourse(course, 1, completions);
  const days = WEEK1_DATES.map((date) => ({
    date: date,
    dayNumber: PLANS[date].dayNumber,
    dayTypeLabel: DayProgress.inferDayTypeLabel(PLANS[date]),
    node: PE.dayProgress(PLANS[date], completions)
  }));

  const vm = WeekProgress.buildWeekDetailViewModel(1, weekNode, days, {
    linkFor: (date) => '#/progress/day/' + date
  });
  assert.equal(vm.days.length, 7);
  assert.deepEqual(vm.days.map((day) => day.date), WEEK1_DATES);
  assert.deepEqual(vm.days.map((day) => day.label.slice(0, 5)),
    ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']);
  assert.equal(vm.days[0].percent, PE.dayProgress(PLANS[DAY1], completions).percent);
  assert.equal(vm.percent, weekNode.percent);

  const html = WeekProgress.renderWeekDetailHTML(vm);
  assert.equal((html.match(/class="progress-row"/g) || []).length, 7);
  assert.match(html, /data-hash="#\/progress\/day\/2026-10-02"/);
  assert.match(html, /Practice/);
  assert.match(html, /Graded/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('week detail flags a day without a plan instead of inventing 0/0', () => {
  const vm = WeekProgress.buildWeekDetailViewModel(4, mkNode(10, 5), [
    { date: '2026-10-30', dayNumber: null, dayTypeLabel: '', node: null },
    { date: '2026-10-23', dayNumber: 22, dayTypeLabel: 'New content', node: mkNode(9, 0) }
  ], { linkFor: (date) => '#/progress/day/' + date });

  assert.equal(vm.days[0].hasPlan, false);
  assert.equal(vm.days[0].statsLabel, 'No study plan available.');
  assert.equal(vm.days[0].percentLabel, '—');
  assert.match(vm.days[0].ariaLabel, /no study plan available/i);
  assert.equal(vm.days[1].hasPlan, true);

  const html = WeekProgress.renderWeekDetailHTML(vm);
  assert.match(html, /is-empty-row/);
  assert.match(html, /No study plan available\./);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('week detail refuses an unknown week node', () => {
  assert.equal(WeekProgress.buildWeekDetailViewModel(9, null, []), null);
});

test('a day with no tasks for the scope is labelled, never shown as 0 / 0', () => {
  const vm = WeekProgress.buildWeekDetailViewModel(1, mkNode(10, 0), [
    { date: DAY1, dayNumber: 1, dayTypeLabel: 'New content', node: mkNode(0, 0) }
  ], { linkFor: (date) => '#/progress/day/' + date });

  assert.equal(vm.days[0].hasPlan, true);
  assert.equal(vm.days[0].statsLabel, 'No tasks for this scope on this day.');
  assert.match(vm.days[0].ariaLabel, /no tasks for this scope/);
  assert.doesNotMatch(WeekProgress.renderWeekDetailHTML(vm), /0 \/ 0/);
});

test('subject-scoped day rows sum exactly to that subject week total (no drift)', () => {
  const completions = completionsWith([MATH_L1_1]);
  const math = COURSES.find((course) => course.subjectId === 'mathematics-i');
  const weekNode = PE.weekProgressForCourse(math, 1, completions);

  const scopedDays = WEEK1_DATES.map((date) => ({
    date: date,
    dayNumber: PLANS[date].dayNumber,
    dayTypeLabel: '',
    node: PE.progressForTasks(
      PLANS[date].tasks.filter((task) => task.subjectId === math.subjectId)
        .map((task) => ({ taskId: task.taskId, type: task.type })),
      completions
    )
  }));

  const sumTotal = scopedDays.reduce((sum, day) => sum + day.node.total, 0);
  const sumCompleted = scopedDays.reduce((sum, day) => sum + day.node.completed, 0);
  assert.equal(sumTotal, weekNode.total);
  assert.equal(sumCompleted, weekNode.completed);
  assert.equal(weekNode.total, 30);
  assert.deepEqual(scopedDays.map((day) => day.node.total), [8, 6, 4, 6, 3, 2, 1]);

  // …and the whole-day rows sum to the all-subjects week total.
  const wholeDays = WEEK1_DATES.map((date) => PE.dayProgress(PLANS[date], completions));
  assert.equal(wholeDays.reduce((sum, n) => sum + n.total, 0),
    PE.weekProgressAcrossSubjects(COURSES, 1, completions).total);
});

// ---------------------------------------------------------------------------
// Day / task progress
// ---------------------------------------------------------------------------


test('day detail renders the plan tasks with engine numbers and taskId identity', () => {
  const completions = completionsWith([MATH_L1_1]);
  const plan = PLANS[DAY1];
  const dayNode = PE.dayProgress(plan, completions);
  const vm = DayProgress.buildDayViewModel(plan, dayNode, completions, {
    trackerLinkFor: (date) => '#/day/' + date
  });

  assert.equal(vm.date, DAY1);
  assert.equal(vm.dayNumber, 1);
  assert.equal(vm.weekNumber, 1);
  assert.equal(vm.dayTypeLabel, 'New content');
  assert.equal(vm.total, dayNode.total);
  assert.equal(vm.completed, 1);
  assert.equal(vm.total, 19);
  assert.equal(vm.percent, PE.percentFor(1, dayNode.total));
  assert.equal(vm.trackerHref, '#/day/2026-10-02');
  assert.match(vm.subtitle, /Friday • 2 October 2026 • Week 1/);

  // Identity + order come from the plan document, never from array position.
  assert.equal(vm.tasks.length, plan.tasks.length);
  assert.deepEqual(vm.tasks.map((task) => task.taskId), plan.tasks.map((task) => task.taskId));
  assert.equal(vm.tasks[0].taskId, MATH_L1_1);
  assert.equal(vm.tasks[0].checked, true);
  assert.equal(vm.tasks[0].statusLabel, 'Completed');
  assert.equal(vm.tasks[1].checked, false);
  assert.equal(vm.tasks[1].statusLabel, 'Pending');
  assert.match(vm.tasks[0].meta, /Lecture/);   // metadata only where the data has it
  assert.match(vm.tasks[0].meta, /20:49/);

  const html = DayProgress.renderDayHTML(vm);
  assert.match(html, /data-task-id="mathematics-i:1:L1\.1"/);
  assert.match(html, /Open Daily Tracker/);
  assert.match(html, /data-hash="#\/day\/2026-10-02"/);
  assert.equal((html.match(/<li class="task-row/g) || []).length, 19);
  assert.equal((html.match(/is-completed/g) || []).length, 1);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('day type labels are derived from the plan task types', () => {
  assert.equal(DayProgress.inferDayTypeLabel(PLANS[DAY1]), 'New content');
  assert.equal(DayProgress.inferDayTypeLabel(PLANS['2026-10-07']), 'Practice');
  assert.equal(DayProgress.inferDayTypeLabel(PLANS['2026-10-08']), 'Graded');
  assert.equal(DayProgress.inferDayTypeLabel({ tasks: [] }), '');
});

test('non-academic tasks stay visible but are excluded from the day count', () => {
  const plan = {
    date: DAY1, dayNumber: 1, weekNumber: 1,
    tasks: [
      { taskId: 'mathematics-i:1:L1.1', type: 'lecture', title: 'L1.1' },
      { taskId: 'mathematics-i:1:BREAK', type: 'break', title: 'Break' }
    ]
  };
  const dayNode = PE.dayProgress(plan, {});
  assert.equal(dayNode.total, 1);              // engine excludes the break
  assert.equal(dayNode.completed, 0);

  const vm = DayProgress.buildDayViewModel(plan, dayNode, {});
  assert.equal(vm.total, 1);
  assert.equal(vm.tasks.length, 2);            // representation stays complete
  assert.equal(vm.tasks[1].eligible, false);
  assert.match(DayProgress.renderDayHTML(vm), /Not counted/);
});

test('day detail refuses to fabricate a plan or a node', () => {
  assert.equal(DayProgress.buildDayViewModel(null, mkNode(0, 0), {}), null);
  assert.equal(DayProgress.buildDayViewModel(undefined, mkNode(0, 0), {}), null);
  assert.equal(DayProgress.buildDayViewModel(PLANS[DAY1], null, {}), null);
});

// ---------------------------------------------------------------------------
// App integration: the Progress route renders the real dashboard
// ---------------------------------------------------------------------------

test('the cycle grid matches the materialised plans exactly (no invented dates)', () => {
  const expected = [];
  for (let i = 0; i < 28; i++) expected.push(Calendar.addDays(DAY1, i));
  assert.deepEqual(PLAN_DATES, expected);
  assert.equal(expected.length, 28);
  assert.deepEqual(expected.slice(0, 7), WEEK1_DATES);
});

test('the Progress route renders the real dashboard from the engine', async () => {
  const { app, root } = buildApp();
  await tick();
  app.router.navigate(Router.routeForProgress());
  await settle();

  assert.equal(app.getState().currentRoute.view, 'progress');
  const html = root.innerHTML;

  assert.match(html, /class="progress-title">Progress</);
  assert.match(html, /Overall progress/);
  assert.match(html, /0 \/ 413 tasks completed/);
  assert.match(html, /aria-valuenow="0"/);

  // All four subjects, in canonical order, each with its own row.
  assert.equal((html.match(/progress-row-subject/g) || []).length, 4);
  const positions = SUBJECT_ORDER.map((subjectId) => html.indexOf(LABELS[subjectId]));
  positions.forEach((position) => assert.ok(position > -1, 'subject label missing'));
  assert.deepEqual(positions.slice().sort((a, b) => a - b), positions);

  // Four weeks + drill-down hashes for every level.
  assert.equal((html.match(/class="progress-row"/g) || []).length, 4);
  assert.match(html, /data-hash="#\/progress\/subject\/mathematics-i"/);
  assert.match(html, /data-hash="#\/progress\/week\/1"/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('refreshing a deep progress link reopens exactly that level', async () => {
  const { root } = buildApp({ initialHash: '#/progress/subject/mathematics-i/week/1' });
  await settle();
  assert.match(root.innerHTML, /Mathematics I • Week 1/);
  assert.equal((root.innerHTML.match(/class="progress-row"/g) || []).length, 7);

  const day = buildApp({ initialHash: '#/progress/day/2026-10-02' });
  await settle();
  assert.match(day.root.innerHTML, /Day 1/);
  assert.equal((day.root.innerHTML.match(/<li class="task-row/g) || []).length, 19);
});

test('drill-down walks Overall → Subject → Subject+Week → Day → Daily Tracker', async () => {
  const { app, root } = buildApp();
  await tick();

  app.router.navigate(Router.routeForProgressSubject('mathematics-i'));
  await settle();
  assert.match(root.innerHTML, /Mathematics I progress/);
  assert.match(root.innerHTML, /data-hash="#\/progress\/subject\/mathematics-i\/week\/1"/);

  app.router.navigate(Router.routeForProgressSubjectWeek('mathematics-i', 1));
  await settle();
  assert.match(root.innerHTML, /Mathematics I • Week 1/);
  assert.equal((root.innerHTML.match(/class="progress-row"/g) || []).length, 7);
  assert.match(root.innerHTML, /data-hash="#\/progress\/day\/2026-10-02"/);

  app.router.navigate(Router.routeForProgressDay(DAY1));
  await settle();
  assert.match(root.innerHTML, /data-task-id="mathematics-i:1:L1\.1"/);
  assert.match(root.innerHTML, /Open Daily Tracker/);

  // Day → the Phase 4 tracker route (no duplicate tracker).
  app.router.navigate(Router.routeForDay(DAY1));
  await settle();
  assert.equal(app.getState().currentRoute.view, 'day');
  assert.match(root.innerHTML, /Day 1 — Study Tracker/);
});

test('back control and breadcrumbs navigate every level without the browser button', async () => {
  const { app, root } = buildApp({ initialHash: '#/progress/subject/mathematics-i/week/1' });
  await settle();

  // breadcrumbs expose the whole path
  assert.match(root.innerHTML, />Calendar</);
  assert.match(root.innerHTML, />Progress</);
  assert.match(root.innerHTML, /Mathematics I/);
  assert.match(root.innerHTML, /Back to Mathematics I/);

  root.dispatch('click', fakeElement({ 'data-action': 'navigate', 'data-hash': '#/progress/subject/mathematics-i' }));
  await settle();
  assert.match(root.innerHTML, /Mathematics I progress/);

  root.dispatch('click', fakeElement({ 'data-action': 'navigate', 'data-hash': '#/progress' }));
  await settle();
  assert.match(root.innerHTML, /Overall progress/);

  root.dispatch('click', fakeElement({ 'data-action': 'navigate', 'data-hash': '#/calendar' }));
  await settle();
  assert.equal(app.getState().currentRoute.view, 'calendar');
  // U2.1: the Calendar breadcrumb target renders the reference Calendar card.
  assert.match(root.innerHTML, /class="calendar-card/);
});

test('a day page walks back up to its week, then to Progress', async () => {
  const { root } = buildApp({ initialHash: '#/progress/day/2026-10-02' });
  await settle();

  // The parent of a day is its week, so the hierarchy is walkable both ways.
  assert.match(root.innerHTML, /Back to Week 1/);
  assert.match(root.innerHTML, /Week 1/);
  assert.match(root.innerHTML, /Day 1/);

  root.dispatch('click', fakeElement({ 'data-action': 'navigate', 'data-hash': '#/progress/week/1' }));
  await settle();
  assert.match(root.innerHTML, /All subjects/);

  root.dispatch('click', fakeElement({ 'data-action': 'navigate', 'data-hash': '#/progress' }));
  await settle();
  assert.match(root.innerHTML, /Overall progress/);
});

test('the header Progress control opens the dashboard (Phase 4 entry point)', async () => {
  const { app, root } = buildApp();
  await tick();
  assert.equal(app.getState().currentRoute.view, 'calendar');

  root.dispatch('click', fakeElement({ 'data-action': 'open-progress' }));
  await settle();
  assert.equal(app.getState().currentRoute.view, 'progress');
  assert.match(root.innerHTML, /Overall progress/);
});

test('a subject+week page keeps every row inside that subject scope', async () => {
  const { root } = buildApp({ initialHash: '#/progress/subject/mathematics-i/week/1' });
  await settle();
  const html = root.innerHTML;

  assert.match(html, /Mathematics I/);              // scope chip
  assert.equal((html.match(/class="progress-row"/g) || []).length, 7);
  assert.match(html, /0 \/ 30 tasks completed/);    // Mathematics I, week 1

  const dayTotals = Array.from(html.matchAll(/class="progress-row-stats">\d+ \/ (\d+) tasks completed</g))
    .map((match) => Number(match[1]));
  assert.deepEqual(dayTotals, [8, 6, 4, 6, 3, 2, 1]);
  assert.equal(dayTotals.reduce((sum, value) => sum + value, 0), 30);
});

test('the all-subjects week page keeps whole-day scope (all four subjects)', async () => {
  const { root } = buildApp({ initialHash: '#/progress/week/1' });
  await settle();
  const html = root.innerHTML;

  assert.match(html, /All subjects/);
  assert.match(html, /0 \/ 87 tasks completed/);

  const dayTotals = Array.from(html.matchAll(/class="progress-row-stats">\d+ \/ (\d+) tasks completed</g))
    .map((match) => Number(match[1]));
  assert.deepEqual(dayTotals, [19, 13, 13, 17, 15, 6, 4]);
  assert.equal(dayTotals.reduce((sum, value) => sum + value, 0), 87);
});

// ---------------------------------------------------------------------------
// Live updates + cross-level consistency
// ---------------------------------------------------------------------------

test('tracker completion flows into the dashboard (live, never stale)', async () => {
  const storage = storageWith(null);
  const { app, root } = buildApp({ storage: storage });

  app.router.navigate(Router.routeForProgress());
  await settle();
  assert.match(root.innerHTML, /0 \/ 413 tasks completed/);
  assert.equal(percentOf(root.innerHTML), 0);

  // Complete a task through the real Phase 4 tracker interaction.
  app.router.navigate(Router.routeForDay(DAY1));
  await settle();
  const checkbox = fakeElement({ 'data-action': 'toggle-task', 'data-task-id': MATH_L1_1 });
  checkbox.checked = true;
  root.dispatch('change', checkbox);
  assert.equal(storage.isCompleted(MATH_L1_1), true);

  // …and the dashboard shows the engine's new numbers.
  app.router.navigate(Router.routeForProgress());
  await settle();
  const expectedOverall = PE.progressForAllCourses(COURSES, storage.getAllCompletions()).overall;
  assert.equal(percentOf(root.innerHTML), expectedOverall.percent);
  assert.match(root.innerHTML, new RegExp('1 / ' + expectedOverall.total + ' tasks completed'));

  app.router.navigate(Router.routeForProgressDay(DAY1));
  await settle();
  assert.match(root.innerHTML, /1 \/ 19 tasks completed/);

  // Unchecking returns every level to its previous value.
  app.router.navigate(Router.routeForDay(DAY1));
  await settle();
  checkbox.checked = false;
  root.dispatch('change', checkbox);
  assert.equal(storage.getCompletion(MATH_L1_1), null);

  app.router.navigate(Router.routeForProgressDay(DAY1));
  await settle();
  assert.match(root.innerHTML, /0 \/ 19 tasks completed/);

  app.router.navigate(Router.routeForProgress());
  await settle();
  assert.match(root.innerHTML, /0 \/ 413 tasks completed/);
  assert.equal(percentOf(root.innerHTML), 0);
});

test('one task moves day, week, subject and overall consistently with the engine', async () => {
  const storage = storageWith(null);
  const { app, root } = buildApp({ storage: storage });

  app.router.navigate(Router.routeForDay(DAY1));
  await settle();
  const checkbox = fakeElement({ 'data-action': 'toggle-task', 'data-task-id': MATH_L1_1 });
  checkbox.checked = true;
  root.dispatch('change', checkbox);

  const completions = storage.getAllCompletions();
  const math = COURSES.find((course) => course.subjectId === 'mathematics-i');
  const expected = {
    day: PE.dayProgress(PLANS[DAY1], completions),
    week: PE.weekProgressForCourse(math, 1, completions),
    subject: PE.progressForCourse(math, completions),
    overall: PE.progressForAllCourses(COURSES, completions).overall
  };
  assert.equal(expected.day.completed, 1);
  assert.equal(expected.week.completed, 1);
  assert.equal(expected.subject.completed, 1);
  assert.equal(expected.overall.completed, 1);

  app.router.navigate(Router.routeForProgressDay(DAY1));
  await settle();
  assert.equal(percentOf(root.innerHTML), expected.day.percent);
  assert.match(root.innerHTML, new RegExp(expected.day.completed + ' / ' + expected.day.total + ' tasks completed'));

  app.router.navigate(Router.routeForProgressSubjectWeek('mathematics-i', 1));
  await settle();
  assert.equal(percentOf(root.innerHTML), expected.week.percent);

  app.router.navigate(Router.routeForProgressSubject('mathematics-i'));
  await settle();
  assert.equal(percentOf(root.innerHTML), expected.subject.percent);

  app.router.navigate(Router.routeForProgress());
  await settle();
  assert.equal(percentOf(root.innerHTML), expected.overall.percent);
  // One completion, one increment — never double counted across levels.
  assert.match(root.innerHTML, /1 \/ 413 tasks completed/);
});

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

test('missing plan, invalid date and unknown scopes fail visibly and safely', async () => {
  const { app, root } = buildApp();

  app.router.navigate(Router.routeForProgressDay('2026-10-30')); // no plan materialised for this date
  await settle();
  assert.match(root.innerHTML, /No study plan available/);

  app.router.navigate('#/progress/day/2026-13-40');
  await settle();
  assert.match(root.innerHTML, /Invalid date/);

  app.router.navigate(Router.routeForProgressSubject('nope-subject'));
  await settle();
  assert.match(root.innerHTML, /Unknown subject/);
  assert.match(root.innerHTML, /Back to Progress/);

  app.router.navigate(Router.routeForProgressSubjectWeek('mathematics-i', 9));
  await settle();
  assert.match(root.innerHTML, /Week 9 is not part of this cycle/);

  app.router.navigate(Router.routeForProgressWeek(9));
  await settle();
  assert.match(root.innerHTML, /Week 9 is not part of this cycle/);

  // An unknown #/progress/... hash falls back to the dashboard.
  app.router.navigate('#/progress/junk');
  await settle();
  assert.match(root.innerHTML, /Overall progress/);
});

test('a syllabus load failure shows a controlled error state, not an exception', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { app, root } = buildApp({ loadCourses: () => Promise.reject(new Error('syllabus offline')) });
    app.router.navigate(Router.routeForProgress());
    await settle();
    assert.match(root.innerHTML, /Unable to load progress data/);
    assert.match(root.innerHTML, /Please refresh and try again\./);
    assert.doesNotMatch(root.innerHTML, /syllabus offline/); // no raw exception in the UI
    assert.match(root.innerHTML, /Back to Calendar/);
  } finally {
    console.error = originalError;
  }
});

test('an unknown subject in a subject+week link is reported, not silently emptied', async () => {
  const { root } = buildApp({ initialHash: '#/progress/subject/ghost/week/1' });
  await settle();
  assert.match(root.innerHTML, /Unknown subject/);
  assert.doesNotMatch(root.innerHTML, /NaN|Infinity|undefined/);
});
