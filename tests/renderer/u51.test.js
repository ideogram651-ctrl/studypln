'use strict';

/*
 * tests/renderer/u51.test.js — Study-Planner U5.1
 *
 * FINAL CALENDAR FINISHING PASS coverage:
 *   CHANGE #001  Daily Tracker completion (revision / review) reflected in the
 *                Weekly Timetable — on screen AND in the export — without
 *                entering any course-progress calculation.
 *   CHANGE #002  Global Home button (hidden on #/calendar) + route-derived
 *                Normal / Hover / Active navigation states.
 *   CHANGE #003  Supplied SVG navigation icons (home / progress / report /
 *                back-arrow) wired into the shell, rendered white by CSS.
 *   CHANGE #004  Shared Back control (one actual history step with semantic
 *                fallback) + right-aligned breadcrumbs on Progress AND Reports.
 *   CHANGE #005  Thin dark/purple glass scrollbars (visual only, no hiding).
 *   CHANGE #006  Supplied white Study-Planner logo replacing the SP monogram.
 *
 * Uses the real repository data (canonical syllabus + materialised plans).
 * Run with:  node --test tests/renderer/u51.test.js
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
const App = require(path.join(ROOT, 'src', 'js', 'app.js'));
const CM = require(path.join(ROOT, 'src', 'js', 'calendar-metadata.js'));
const ReportModel = require(path.join(ROOT, 'src', 'js', 'report-model.js'));
const ExportEngine = require(path.join(ROOT, 'src', 'js', 'export-engine.js'));
const TaskGroup = require(path.join(ROOT, 'src', 'components', 'tracker', 'task-group.js'));
const ProgressCalendar = require(path.join(ROOT, 'src', 'components', 'reports', 'progress-calendar.js'));
const ProgressDrilldown = require(path.join(ROOT, 'src', 'components', 'progress', 'progress-drilldown.js'));
const ReportViewer = require(path.join(ROOT, 'src', 'components', 'reports', 'report-viewer.js'));

const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(ROOT, 'src', 'css', 'base.css'), 'utf8');
const COMPONENTS_CSS = fs.readFileSync(path.join(ROOT, 'src', 'css', 'components.css'), 'utf8');
const REPORTS_CSS = fs.readFileSync(path.join(ROOT, 'src', 'css', 'reports.css'), 'utf8');
const DRILLDOWN_SRC = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'progress', 'progress-drilldown.js'), 'utf8');
const DASHBOARD_SRC = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'progress', 'progress-dashboard.js'), 'utf8');
const TRACKER_SRC = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'tracker', 'daily-tracker.js'), 'utf8');

// Real repository data.
const COURSE_DOCS = DE.loadCoursesFromDirectory(path.join(ROOT, 'data', 'syllabus'));
const COURSES = DE.sortCourses(COURSE_DOCS.map((course) => DE.normalizeCourse(course)));
const PLAN_DIR = path.join(ROOT, 'data', 'schedule', 'daily');
const PLANS = {};
fs.readdirSync(PLAN_DIR).filter((file) => /\.json$/i.test(file)).forEach((file) => {
  const doc = JSON.parse(fs.readFileSync(path.join(PLAN_DIR, file), 'utf8'));
  PLANS[doc.date] = doc;
});
const DAY1 = '2026-10-02';
const CANONICAL_CALENDAR = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'calendar', 'calendar-2026.json'), 'utf8'));

const AT = '2026-10-02T10:00:00.000Z';

function makeModel(completions) {
  return ReportModel.createReportModel({
    courses: COURSES, completions: completions || {}, plans: Object.values(PLANS)
  });
}

// The two actionable Day-1 blocks and their canonical U5 completion ids.
const DAY1_DOC = PLANS[DAY1];
const REV_BLOCK = DAY1_DOC.schedule.find((b) => b.category === 'revision');
const REVIEW_BLOCK = DAY1_DOC.schedule.find((b) => b.category === 'review');
const DAY1_CTX = { date: DAY1, weekNumber: DAY1_DOC.weekNumber };
const REV_ID = TaskGroup.actionableTaskId(REV_BLOCK, DAY1_CTX);
const REVIEW_ID = TaskGroup.actionableTaskId(REVIEW_BLOCK, DAY1_CTX);
const COMPLETION = { [REV_ID]: { completed: true, completedAt: AT } };

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(rounds) {
  for (let i = 0; i < (rounds || 5); i++) await tick();
}

// ---------------------------------------------------------------------------
// Minimal DOM / transport stubs (same approach as app.test.js / progress.test.js)
// ---------------------------------------------------------------------------

function fakeElement(attrs) {
  const el = {
    _attrs: Object.assign({}, attrs),
    _listeners: {},
    innerHTML: '',
    textContent: '',
    style: {},
    checked: false,
    hidden: false,
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    contains() { return true; },
    getAttribute(name) { return this._attrs[name] != null ? this._attrs[name] : null; },
    setAttribute(name, value) { this._attrs[name] = String(value); },
    removeAttribute(name) { delete this._attrs[name]; },
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  el.closest = (selector) => {
    if (selector === '[data-action]') return el._attrs['data-action'] ? el : null;
    if (selector === '[data-date]') return el._attrs['data-date'] ? el : null;
    return null;
  };
  return el;
}

function fakeRoot() {
  const root = fakeElement({});
  root.dispatch = (type, target) => {
    (root._listeners[type] || []).forEach((fn) =>
      fn({ type, target, key: target && target.key, preventDefault() {} }));
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

function fakeStubLoadJson(url) {
  const match = /(\d{4}-\d{2}-\d{2})\.json$/.exec(url);
  if (match && PLANS[match[1]]) return Promise.resolve(PLANS[match[1]]);
  const err = new Error('HTTP 404 for ' + url);
  err.code = 'fetch_failed';
  return Promise.reject(err);
}

// Header stub: three nav buttons whose visibility/state the app derives from
// the route (CHANGE #002). classList keeps a real Set so assertions can read it.
function fakeHeaderButton(action) {
  const attrs = { 'data-action': action };
  const classes = new Set();
  const btn = fakeElement({});
  btn._attrs = attrs;
  btn.classList = {
    add(c) { classes.add(c); },
    remove(c) { classes.delete(c); },
    contains(c) { return classes.has(c); },
    toggle() {}
  };
  return btn;
}

function fakeHeader() {
  const buttons = {
    'open-home': fakeHeaderButton('open-home'),
    'open-progress': fakeHeaderButton('open-progress'),
    'open-reports': fakeHeaderButton('open-reports')
  };
  const listeners = {};
  return {
    buttons: listeners && buttons,
    querySelector(selector) {
      const match = /\[data-action="([^"]+)"\]/.exec(selector);
      return (match && buttons[match[1]]) || null;
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    contains() { return true; },
    dispatch(type, target) {
      (listeners[type] || []).forEach((fn) =>
        fn({ type, target, preventDefault() {} }));
    }
  };
}

function buildApp(overrides) {
  const requested = overrides || {};
  const root = fakeRoot();
  const header = requested.header || fakeHeader();
  const transport = fakeTransport(requested.initialHash || '#/calendar');
  const router = Router.createRouter({
    getHash: transport.getHash, setHash: transport.setHash, subscribe: transport.subscribe
  });
  const storageBackend = S.createMemoryBackend();
  const options = Object.assign({
    document: { getElementById: (id) => (id === 'view' ? root : null) },
    rootElement: root,
    headerElement: header,
    toastElement: fakeElement({}),
    storage: S.createStorage({ backend: storageBackend }),
    planStore: App.createPlanStore({ baseUrl: 'test/daily/', loadJson: fakeStubLoadJson }),
    calendarStore: App.createCalendarStore({
      url: 'test/calendar-2026.json',
      loadJson: () => Promise.resolve(CANONICAL_CALENDAR)
    }),
    calendarMetadata: CM.createCalendarMetadata({ backend: CM.createMemoryBackend() }),
    router: router,
    loadCourses: () => Promise.resolve(COURSE_DOCS),
    now: () => new Date(2026, 9, 2),
    config: { initialDate: DAY1, cycleStart: DAY1, calendarView: 'month', context: 'IIT Madras BS' }
  }, requested);
  const app = App.createApp(options);
  app.start();
  return { app: app, root: root, header: header, router: router, transport: transport };
}

// ---------------------------------------------------------------------------
// CHANGE #001 — timetable reflects the Daily Tracker's revision/review state
// ---------------------------------------------------------------------------

test('U5.1-01: report model exposes the U5 completion on the actionable block only', function () {
  const model = makeModel(COMPLETION);
  const day = model.buildDayReport(DAY1);

  const rev = day.blocks.find((b) => b.blockId === REV_BLOCK.blockId);
  assert.equal(rev.actionableId, REV_ID, 'id minted by the ONE authority (TaskGroup)');
  assert.equal(rev.actionCompleted, true, 'checked revision reads as completed');

  const review = day.blocks.find((b) => b.blockId === REVIEW_BLOCK.blockId);
  assert.equal(review.actionableId, REVIEW_ID);
  assert.equal(review.actionCompleted, false, 'unchecked review stays uncompleted');

  // The action task is NOT a plan task: the day scope is unchanged (19/0).
  assert.equal(day.node.total, 19, 'day denominator untouched');
  assert.equal(day.node.completed, 0, 'no course task completed by this record');
});

test('U5.1-02: on-screen timetable renders complete/none with the course-block treatment', function () {
  const model = makeModel(COMPLETION);
  const vm = ProgressCalendar.buildCalendarViewModel(model.buildCalendarReport(1), {});
  const day = vm.days.find((d) => d.date === DAY1);
  assert.ok(day, 'day 1 present');

  const rev = day.blocks.find((b) => b.blockId === REV_BLOCK.blockId);
  assert.equal(rev.state, 'complete', 'checked revision -> complete');
  const review = day.blocks.find((b) => b.blockId === REVIEW_BLOCK.blockId);
  assert.equal(review.state, 'none', 'unchecked review -> none');

  // Rendered markup uses the SAME state classes/data-state as course blocks.
  const html = ProgressCalendar.renderCalendarHTML(vm);
  assert.match(html, /pc-tok-revision is-complete/);
  assert.match(html, new RegExp(
    'data-block-id="' + REV_BLOCK.blockId + '"[^>]*data-state="complete"'));
  assert.match(html, new RegExp(
    'data-block-id="' + REVIEW_BLOCK.blockId + '"[^>]*data-state="none"'));
});

test('U5.1-03: the export reflects it too, with all U4 behaviour preserved', function () {
  const model = makeModel(COMPLETION);
  const html = ExportEngine.exportCalendar(model, 1);

  // The export draws its own standalone markup (no data-block-id); the
  // deterministic subject-token class + data-state identify each element.
  assert.match(html, /<div class="blk is-revision"[^>]*data-state="complete"/,
    'completed revision exported as complete');
  assert.match(html, /<div class="blk is-review[^"]*"[^>]*data-state="none"/,
    'unchecked review exported as none');

  // U4 preservation: 12-hour axis, Weekly Progress section, break-only hidden.
  assert.match(html, /11:00 AM/);
  assert.match(html, /Week progress/);
  assert.equal(html.includes('Lunch / Rest'), false, 'break-only still hidden');
  assert.equal(/\b13:00\b/.test(html), false, 'no 24-hour labels on the chart');
});

test('U5.1-04: actionable completion never enters course/overall progress', function () {
  const model = makeModel(COMPLETION);
  const overall = model.buildOverallReport({});
  assert.equal(overall.node.total, 413, 'syllabus denominator untouched');
  assert.equal(overall.node.completed, 0, 'action record adds nothing');

  // The authority itself agrees: progress-engine ignores the id entirely.
  const node = PE.progressForAllCourses(COURSES, COMPLETION).overall;
  assert.equal(node.total, 413);
  assert.equal(node.completed, 0);
});

// ---------------------------------------------------------------------------
// CHANGE #002 + active state — route-derived Home visibility & section states
// ---------------------------------------------------------------------------

test('U5.1-05: header Home/Progress/Reports states are derived from the route', async function () {
  const { app, header } = buildApp({ initialHash: '#/calendar' });
  await settle();

  // Calendar = home screen: Home HIDDEN, no active section.
  assert.equal(header.buttons['open-home'].hidden, true, 'Home hidden on Calendar');
  assert.equal(header.buttons['open-progress'].getAttribute('aria-current'), null);
  assert.equal(header.buttons['open-reports'].getAttribute('aria-current'), null);

  // Progress: Home visible, Progress ACTIVE (persistent class + aria-current).
  app.router.navigate('#/progress');
  await settle();
  assert.equal(header.buttons['open-home'].hidden, false, 'Home shown off-calendar');
  assert.equal(header.buttons['open-progress'].getAttribute('aria-current'), 'page');
  assert.equal(header.buttons['open-progress'].classList.contains('is-active'), true);
  assert.equal(header.buttons['open-reports'].getAttribute('aria-current'), null);

  // Reports: Reports ACTIVE, Progress cleared (never both, never cross-marked).
  app.router.navigate('#/reports');
  await settle();
  assert.equal(header.buttons['open-reports'].getAttribute('aria-current'), 'page');
  assert.equal(header.buttons['open-progress'].getAttribute('aria-current'), null);
  assert.equal(header.buttons['open-home'].hidden, false);

  // Progress DETAIL stays inside the Progress section.
  app.router.navigate('#/progress/subject/mathematics-i');
  await settle();
  assert.equal(header.buttons['open-progress'].getAttribute('aria-current'), 'page');
  assert.equal(header.buttons['open-reports'].getAttribute('aria-current'), null);

  // A non-home, non-Progress/Reports page (Daily Tracker): ALL normal.
  app.router.navigate('#/day/2026-10-02');
  await settle();
  assert.equal(header.buttons['open-home'].hidden, false, 'Home shown on the tracker');
  assert.equal(header.buttons['open-progress'].getAttribute('aria-current'), null);
  assert.equal(header.buttons['open-reports'].getAttribute('aria-current'), null);

  // Back home: Home hidden again, everything normal.
  app.router.navigate('#/calendar');
  await settle();
  assert.equal(header.buttons['open-home'].hidden, true);
});

test('U5.1-06: Home navigates to #/calendar; repeated clicks converge on one destination', async function () {
  const { app, header, transport } = buildApp({ initialHash: '#/progress' });
  await settle();
  assert.equal(header.buttons['open-home'].hidden, false, 'Home visible off-calendar');

  const press = () => header.dispatch('click', header.buttons['open-home']);
  press(); // single click
  await settle();
  assert.equal(transport.getHash(), '#/calendar');
  press(); // double click -> identical destination, de-duplicated by the router
  await settle();
  assert.equal(transport.getHash(), '#/calendar');
  assert.equal(app.getState().currentRoute.view, 'calendar');
  assert.equal(header.buttons['open-home'].hidden, true, 'Home disappears on arrival');
});

// ---------------------------------------------------------------------------
// CHANGE #004 — shared Back control (history step with semantic fallback)
// ---------------------------------------------------------------------------

test('U5.1-07: Back falls back to the semantic parent, then the Calendar', async function () {
  // Cold deep link: no in-app route step yet (and no window in Node), so the
  // control uses its data-hash parent — exactly the truth-telling label case.
  const { app, root } = buildApp({ initialHash: '#/progress/day/2026-10-02' });
  await settle();

  root.dispatch('click', fakeElement({ 'data-action': 'back', 'data-hash': '#/progress/week/1' }));
  await settle();
  assert.equal(app.getState().currentRoute.hash, '#/progress/week/1',
    'semantic parent used when no history step exists');

  // With neither a history step nor a parent hash: the Calendar (app home).
  root.dispatch('click', fakeElement({ 'data-action': 'back' }));
  await settle();
  assert.equal(app.getState().currentRoute.view, 'calendar');
});

// ---------------------------------------------------------------------------
// CHANGE #003/#004 — shared Back markup on Progress AND Reports
// ---------------------------------------------------------------------------

test('U5.1-08: shared Back renders supplied back-arrow.svg on every Progress level', function () {
  const overall = ProgressDrilldown.buildNavViewModel('overall', {
    calendarHash: '#/calendar', progressHash: '#/progress'
  });
  const html = ProgressDrilldown.renderNavHTML(overall);
  assert.match(html, /class="back-button" data-action="back"/, 'history-step Back');
  assert.match(html, /assets\/svg\/back-arrow\.svg/, 'supplied icon');
  assert.match(html, /data-hash="#\/calendar"/, 'cold-start fallback parent');
  assert.match(html, />Back<\/button>/, 'label');
  // Layout order: Back LEFT, breadcrumbs RIGHT.
  assert.ok(html.indexOf('back-button') < html.indexOf('progress-crumbs'),
    'Back precedes the crumbs');

  // Deep level keeps its semantic label + parent hash (cold-start truth).
  const day = ProgressDrilldown.buildNavViewModel('day', {
    calendarHash: '#/calendar', progressHash: '#/progress',
    weekNumber: 1, weekHash: '#/progress/week/1', dayLabel: 'Day 1'
  });
  const dayHtml = ProgressDrilldown.renderNavHTML(day);
  assert.match(dayHtml, /Back to Week 1/);
  assert.match(dayHtml, /data-hash="#\/progress\/week\/1"/);
  assert.match(dayHtml, /assets\/svg\/back-arrow\.svg/);

  // The legacy text-arrow entity is gone from every Back renderer.
  [DRILLDOWN_SRC, DASHBOARD_SRC, TRACKER_SRC].forEach((src, index) => {
    assert.equal(src.includes('&#8592;'), false,
      'no text arrow in renderer ' + index);
  });
});

test('U5.1-09: Reports index and deep pages carry the shared Back control', function () {
  const ctx = { calendarHash: '#/calendar', reportsHash: '#/reports' };

  const index = ReportViewer.buildReportNavViewModel('index', ctx);
  assert.deepEqual(index.back, { label: 'Back', hash: null },
    'index cold-fallback is the Calendar (no history step)');

  const deep = ReportViewer.buildReportNavViewModel('week', ctx);
  assert.deepEqual(deep.back, { label: 'Back', hash: '#/reports' },
    'deep cold-fallback is the Reports index');

  const html = ProgressDrilldown.renderNavHTML(deep);
  assert.match(html, /class="back-button" data-action="back" data-hash="#\/reports"/);
  assert.match(html, /assets\/svg\/back-arrow\.svg/);
  // The shared breadcrumb renderer still marks the current page.
  assert.match(html, /aria-current="page"/);
});

// ---------------------------------------------------------------------------
// CHANGE #003/#005/#006 — supplied assets, white logo, glass scrollbars
// ---------------------------------------------------------------------------

test('U5.1-10: supplied SVGs and the white logo are wired into the shell', function () {
  assert.match(INDEX_HTML, /data-action="open-home" hidden/, 'Home exists and starts hidden');
  assert.match(INDEX_HTML, /assets\/svg\/home\.svg/);
  assert.match(INDEX_HTML, /assets\/svg\/progress\.svg/);
  assert.match(INDEX_HTML, /assets\/svg\/report\.svg/);
  assert.match(INDEX_HTML, /assets\/logo\/Study-Planner-Logo\.svg/);
  assert.equal(INDEX_HTML.includes('>SP<'), false, 'legacy SP monogram gone');
  // Title/subtitle/nav labels unchanged.
  assert.match(INDEX_HTML, /Study-Planner<\/h1>/);
  assert.match(INDEX_HTML, /IIT Madras BS — 28-day cycle/);
  assert.match(INDEX_HTML, />Progress<\/button>/);
  assert.match(INDEX_HTML, />Reports<\/button>/);
  // Every referenced asset exists on disk (no redrawn/replaced icons).
  ['home', 'progress', 'report', 'back-arrow'].forEach((name) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'svg', name + '.svg')),
      name + '.svg present');
  });
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'logo', 'Study-Planner-Logo.svg')));
});

test('U5.1-11: white logo rendering + glass scrollbars live in base.css', function () {
  assert.match(BASE_CSS, /\.app-logo-img\s*\{[^}]*filter:\s*brightness\(0\)\s*invert\(1\)/s,
    'logo rendered white, asset untouched');
  assert.match(BASE_CSS, /scrollbar-width:\s*thin/, 'thin scrollbars (Firefox)');
  assert.match(BASE_CSS, /::-webkit-scrollbar-thumb/, 'glass thumb (WebKit)');
  assert.match(BASE_CSS, /scrollbar-color:\s*rgba\(151,\s*119,\s*255/, 'purple tint');
  // Visual only: no cosmetic overflow hiding (U2.2-007 rule stays intact).
  assert.doesNotMatch(BASE_CSS, /html\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(BASE_CSS, /body\s*\{[^}]*overflow:\s*hidden/s);
});

test('U5.1-12: nav icons, hidden-override and route-active/hover CSS coexist', function () {
  assert.match(COMPONENTS_CSS, /\.nav-icon/);
  assert.match(COMPONENTS_CSS, /\.back-icon/);
  // hidden must beat the display rules or Home can never disappear.
  assert.match(COMPONENTS_CSS, /\.app-nav \.ghost-button\[hidden\]\s*\{\s*display:\s*none/);
  // ACTIVE is attribute-driven and persists; HOVER combines with it.
  assert.match(COMPONENTS_CSS, /\.app-nav \.ghost-button\[aria-current="page"\]\s*\{/);
  assert.match(COMPONENTS_CSS, /\.app-nav \.ghost-button\[aria-current="page"\]:hover\s*\{/);
  // Reports crumbs right-align within the nav row (CHANGE #004 layout).
  assert.match(REPORTS_CSS, /\.rp-page-nav \.progress-nav\s*\{[^}]*flex:\s*1 1 auto/);
});

// ---------------------------------------------------------------------------
// Architecture guard — no duplicate persistence / progress authority in UI
// ---------------------------------------------------------------------------

test('U5.1-13: no second persistence authority appears in shared UI modules', function () {
  const files = [
    'components/calendar/calendar-card.js',
    'components/calendar/calendar-wheel.js',
    'components/progress/progress-drilldown.js',
    'components/reports/report-viewer.js',
    'components/reports/progress-calendar.js'
  ];
  files.forEach((file) => {
    const src = fs.readFileSync(path.join(ROOT, 'src', file.split('/').join(path.sep)), 'utf8');
    assert.equal(src.includes('localStorage'), false, file + ' must not touch localStorage');
    assert.equal(src.includes('.setItem('), false, file + ' must not write state');
    assert.equal(src.includes('.getItem('), false, file + ' must not read raw state');
  });
  // The shared Back still goes through app.js routing (one navigation system).
  assert.equal(DRILLDOWN_SRC.includes('window.history'), false,
    'components never touch history directly');
});
