'use strict';

/*
 * tests/renderer/app.test.js — Study-Planner Phase 4
 *
 * Validates the application shell (src/js/app.js):
 *   - plan store: fetch -> data-engine validation -> cache, 404 == "no plan"
 *   - createApp wiring: route -> render (calendar / tracker / missing / invalid)
 *   - selection + view state, and navigation between calendar and tracker
 *   - event delegation: select date, double-click opens the tracker, checkbox
 *     completion is written through storage.js
 *
 * A tiny hand-rolled DOM stub is used so the delegated handlers can be driven
 * without a browser; no external test dependency is required.
 *
 * Run with:  node --test tests/renderer/app.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const App = require(path.join(ROOT, 'src', 'js', 'app.js'));
const Router = require(path.join(ROOT, 'src', 'js', 'router.js'));
const S = require(path.join(ROOT, 'src', 'js', 'storage.js'));
const CM = require(path.join(ROOT, 'src', 'js', 'calendar-metadata.js'));
const Calendar = require(path.join(ROOT, 'src', 'js', 'calendar.js'));

const DAY1 = '2026-10-02';
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schedule', 'daily', DAY1 + '.json'), 'utf8'));
const MATH_L1_1 = 'mathematics-i:1:L1.1';
const CANONICAL_CALENDAR = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'calendar', 'calendar-2026.json'), 'utf8'));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// U2: the app loads the canonical calendar through an injectable calendarStore.
// Tests supply the REAL canonical file so the Calendar still renders genuine
// study-cycle metadata (and the assertions below are unchanged).
function stubCalendarStore() {
  return App.createCalendarStore({
    url: 'test/calendar-2026.json',
    loadJson: () => Promise.resolve(CANONICAL_CALENDAR)
  });
}

// Mimics fetch() of the local data directory: the Day-1 file exists, every
// other date 404s (which the plan store maps to a "no plan" state).
function notFound(url) {
  const err = new Error('HTTP 404 for ' + url);
  err.code = 'fetch_failed';
  return Promise.reject(err);
}
function stubLoadJson(url) {
  return url.indexOf(DAY1) !== -1 ? Promise.resolve(PLAN) : notFound(url);
}

// ---------------------------------------------------------------------------
// Minimal DOM / transport stubs
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
    removeEventListener(type, fn) {
      const list = this._listeners[type] || [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
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

function buildApp(overrides) {
  const root = fakeRoot();
  const toast = fakeElement({});
  const transport = fakeTransport('#/calendar');
  const router = Router.createRouter({ getHash: transport.getHash, setHash: transport.setHash, subscribe: transport.subscribe });
  const options = Object.assign({
    document: { getElementById: (id) => (id === 'view' ? root : null) },
    rootElement: root,
    toastElement: toast,
    storage: S.createStorage({ backend: S.createMemoryBackend() }),
    planStore: App.createPlanStore({ baseUrl: 'test/', loadJson: stubLoadJson }),
    calendarStore: stubCalendarStore(),
    calendarMetadata: CM.createCalendarMetadata({ backend: CM.createMemoryBackend() }),
    router: router,
    now: () => new Date(2026, 9, 2), // U2.2-002: mock "today" for deterministic startup
    config: { initialDate: DAY1, calendarView: 'month', context: 'IIT Madras BS' }
  }, overrides || {});
  const app = App.createApp(options);
  app.start();
  return { app: app, root: root, toast: toast, router: router, transport: transport };
}

// ---------------------------------------------------------------------------
// Plan store
// ---------------------------------------------------------------------------

test('planStore loads, validates and caches a daily plan', async () => {
  let calls = 0;
  const store = App.createPlanStore({
    baseUrl: 'base/',
    loadJson: () => { calls += 1; return Promise.resolve(PLAN); }
  });
  const first = await store.getPlan(DAY1);
  const second = await store.getPlan(DAY1);
  assert.equal(store.urlFor(DAY1), 'base/2026-10-02.json');
  assert.equal(first, second); // cached object identity
  assert.equal(calls, 1);
  assert.equal(store.isCached(DAY1), true);
});

test('planStore rejects a plan that fails data-engine validation', async () => {
  const store = App.createPlanStore({ baseUrl: 'base/', loadJson: () => Promise.resolve({ nope: true }) });
  await assert.rejects(() => store.getPlan(DAY1), /Invalid study plan/);
});

test('planStore treats HTTP 404 as a stable "no plan" state', async () => {
  const notFound = new Error('HTTP 404 for base/2026-10-15.json');
  notFound.code = 'fetch_failed';
  let calls = 0;
  const store = App.createPlanStore({
    baseUrl: 'base/',
    loadJson: () => { calls += 1; return Promise.reject(notFound); }
  });
  assert.equal(await store.getPlan('2026-10-15'), null);
  assert.equal(await store.getPlan('2026-10-15'), null); // cached missing state
  assert.equal(calls, 1);
});

test('planStore surfaces non-404 load failures', async () => {
  const boom = new Error('HTTP 500 for base/2026-10-16.json');
  boom.code = 'fetch_failed';
  const store = App.createPlanStore({ baseUrl: 'base/', loadJson: () => Promise.reject(boom) });
  await assert.rejects(() => store.getPlan('2026-10-16'), /HTTP 500/);
});

// ---------------------------------------------------------------------------
// App wiring
// ---------------------------------------------------------------------------

test('start() renders the calendar for the initial route', async () => {
  const { app, root } = buildApp();
  await tick();
  assert.equal(app.getState().currentRoute.view, 'calendar');
  // U2.1: the reference Calendar card replaces the U2 wrapper markup.
  assert.match(root.innerHTML, /class="calendar-view-root"/);
  assert.match(root.innerHTML, /class="calendar-card/);
  assert.match(root.innerHTML, /October 2026/);
  assert.match(root.innerHTML, /data-date="2026-10-02"/);
  assert.match(root.innerHTML, /data-action="view-month"/);
});

test('getState reports selected date, view and cursor', () => {
  const { app } = buildApp();
  const state = app.getState();
  assert.equal(state.selectedDate, DAY1);
  assert.equal(state.calendarView, 'month');
  assert.deepEqual(state.cursor, { year: 2026, month: 10 });
  assert.equal(state.hasTrackerController, false);
});

test('setSelectedDate validates and moves selection without navigating', async () => {
  const { app } = buildApp();
  await tick();
  assert.equal(app.setSelectedDate('2026-10-05'), true);
  assert.equal(app.getState().selectedDate, '2026-10-05');
  assert.equal(app.getState().currentRoute.view, 'calendar'); // still on the calendar
  assert.equal(app.setSelectedDate('not-a-date'), false);
  assert.equal(app.getState().selectedDate, '2026-10-05');
});

test('setCalendarView switches month <-> week and re-renders', async () => {
  const { app, root } = buildApp();
  await tick();
  app.setCalendarView('week');
  await tick();
  assert.equal(app.getState().calendarView, 'week');
  // U2.1: Weekly renders the reference date-wheel; Monthly the reference grid.
  assert.match(root.innerHTML, /class="week-viewport"/);
  assert.match(root.innerHTML, /class="week-day/);
  app.setCalendarView('month');
  await tick();
  assert.match(root.innerHTML, /class="month-grid"/);
  assert.match(root.innerHTML, /class="grid-cell/);
});

test('double-clicking a date opens that day\'s tracker', async () => {
  const { app, root } = buildApp();
  await tick();
  root.dispatch('dblclick', fakeElement({ 'data-date': DAY1 }));
  await tick();
  assert.equal(app.getState().currentRoute.view, 'day');
  assert.equal(app.getState().hasTrackerController, true);
  assert.match(root.innerHTML, /Day 1 — Study Tracker/);
  assert.match(root.innerHTML, /data-action="back"/);
});

test('checkbox change persists completion through storage.js', async () => {
  const { app, root } = buildApp();
  await tick();
  root.dispatch('dblclick', fakeElement({ 'data-date': DAY1 }));
  await tick();

  const checkbox = fakeElement({ 'data-action': 'toggle-task', 'data-task-id': MATH_L1_1 });
  checkbox.checked = true;
  root.dispatch('change', checkbox);

  assert.equal(app.storage.isCompleted(MATH_L1_1), true);
  assert.ok(app.storage.getCompletion(MATH_L1_1).completedAt);

  // unchecking removes the record again
  checkbox.checked = false;
  root.dispatch('change', checkbox);
  assert.equal(app.storage.getCompletion(MATH_L1_1), null);
});

test('back control navigates to the calendar', async () => {
  const { app, root } = buildApp();
  await tick();
  root.dispatch('dblclick', fakeElement({ 'data-date': DAY1 }));
  await tick();
  assert.equal(app.getState().currentRoute.view, 'day');

  root.dispatch('click', fakeElement({ 'data-action': 'back' }));
  await tick();
  assert.equal(app.getState().currentRoute.view, 'calendar');
  // U2.1: back from the tracker returns to the reference Calendar card.
  assert.match(root.innerHTML, /class="calendar-card/);
});

test('day route without a plan shows the missing-plan state', async () => {
  const { app, root } = buildApp();
  await tick();
  app.router.navigate(Router.routeForDay('2026-10-15'));
  await tick();
  assert.match(root.innerHTML, /No study plan for this date/);
  assert.equal(app.getState().hasTrackerController, false);
});

test('day route with an invalid date shows the invalid-date state', async () => {
  const { app, root } = buildApp();
  await tick();
  app.router.navigate('#/day/2026-13-40');
  await tick();
  assert.match(root.innerHTML, /Invalid date/);
});

test('corrupt stored state is reported at startup and never silently overwritten', async () => {
  const backend = S.createMemoryBackend();
  backend.setItem(S.STORAGE_KEY, '{ this is not json');
  const storage = S.createStorage({ backend: backend });
  const { app, root, toast } = buildApp({ storage: storage });

  assert.equal(storage.diagnostics().status, 'corrupt');
  assert.match(toast.textContent, /could not be read/);

  await tick();
  root.dispatch('dblclick', fakeElement({ 'data-date': DAY1 }));
  await tick();
  assert.equal(app.getState().hasTrackerController, true); // the day is still usable

  const checkbox = fakeElement({ 'data-action': 'toggle-task', 'data-task-id': MATH_L1_1 });
  checkbox.checked = true;
  root.dispatch('change', checkbox); // must not throw

  assert.equal(backend.getItem(S.STORAGE_KEY), '{ this is not json'); // no silent overwrite
  assert.equal(app.storage.getCompletion(MATH_L1_1), null);
});

test('refresh at #/day/<date> reopens that tracker (URL is the source of truth)', async () => {
  const root = fakeRoot();
  const transport = fakeTransport('#/day/2026-10-02');
  const router = Router.createRouter({ getHash: transport.getHash, setHash: transport.setHash, subscribe: transport.subscribe });
  const app = App.createApp({
    document: { getElementById: (id) => (id === 'view' ? root : null) },
    rootElement: root,
    toastElement: fakeElement({}),
    storage: S.createStorage({ backend: S.createMemoryBackend() }),
    planStore: App.createPlanStore({ baseUrl: 'test/', loadJson: stubLoadJson }),
    calendarStore: stubCalendarStore(),
    calendarMetadata: CM.createCalendarMetadata({ backend: CM.createMemoryBackend() }),
    router: router,
    config: { initialDate: DAY1, calendarView: 'month', context: 'IIT Madras BS' },
    now: () => new Date(2026, 9, 2) // U2.2-002: mock "today" for deterministic startup
  });
  app.start();
  await tick();
  assert.equal(app.getState().currentRoute.view, 'day');
  assert.equal(app.getState().selectedDate, DAY1);
  assert.match(root.innerHTML, /Day 1 — Study Tracker/);
});