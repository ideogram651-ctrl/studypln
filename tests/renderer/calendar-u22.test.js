'use strict';

/*
 * tests/renderer/calendar-u22.test.js — Study-Planner U2.2
 *
 * Calendar finishing-pass regression coverage:
 *   - U2.2-001: selected circle belongs to the date (single-selection model,
 *     no fixed/second indicator; movement delegated to one entry point)
 *   - U2.2-002: fresh start selects the real local TODAY (injectable clock),
 *     refresh keeps a manual selection (session store), restart resolves today
 *     again, nothing permanent in localStorage
 *   - U2.2-003: navigation outside the 28-day Study Cycle (Oct 1, September,
 *     post-cycle) with NO fake Week 0 / W0 / D0
 *   - U2.2-004: Monthly navigation across the full canonical year + shared
 *     selected date between Weekly and Monthly
 *   - U2.2-005/007: reference gutter (36px / 18px ≤720), NO full-bleed,
 *     no 100vw math, no explanatory text below the Calendar (U2.2-006)
 *   - U2.2-008: one PRIMARY status dot per Weekly date, coloured from the
 *     canonical special-day metadata (purple / green / yellow / red)
 *   - secondary EVENT dot: present when the date has events, never replaces
 *     or recolors the primary dot, disappears when the event is deleted
 *
 * Run with:  node --test tests/renderer/calendar-u22.test.js
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
const Card = require(path.join(ROOT, 'src', 'components', 'calendar', 'calendar-card.js'));

const CANONICAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'calendar', 'calendar-2026.json'), 'utf8'));
const ACCESS = Calendar.createCalendarAccess(CANONICAL);
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'css', 'calendar-u21.css'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function notFound(url) {
  const err = new Error('HTTP 404 for ' + url);
  err.code = 'fetch_failed';
  return Promise.reject(err);
}

// ---- minimal DOM / transport stubs (same contract as app.test.js) ----------

function fakeElement(attrs) {
  const el = {
    _attrs: Object.assign({}, attrs),
    _listeners: {},
    innerHTML: '',
    textContent: '',
    style: {},
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
  el.closest = (selector) => (selector === '[data-action]' && el._attrs['data-action']) ? el : null;
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

function memorySession() {
  const map = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    _map: map
  };
}

function buildApp(overrides) {
  const root = fakeRoot();
  const toast = fakeElement({});
  const transport = fakeTransport('#/calendar');
  const router = Router.createRouter({
    getHash: transport.getHash, setHash: transport.setHash, subscribe: transport.subscribe
  });
  const completionBackend = S.createMemoryBackend();
  const sessionStore = memorySession();
  const options = Object.assign({
    document: { getElementById: (id) => (id === 'view' ? root : null) },
    rootElement: root,
    toastElement: toast,
    storage: S.createStorage({ backend: completionBackend }),
    planStore: App.createPlanStore({ baseUrl: 'test/', loadJson: notFound }),
    calendarStore: App.createCalendarStore({
      url: 'test/calendar-2026.json',
      loadJson: () => Promise.resolve(CANONICAL)
    }),
    calendarMetadata: CM.createCalendarMetadata({ backend: CM.createMemoryBackend() }),
    router: router,
    sessionStore: sessionStore,
    now: () => new Date(2026, 9, 5), // mock "today" = 2026-10-05 (overridable)
    config: { initialDate: '2026-10-02', calendarView: 'week', context: 'IIT Madras BS' }
  }, overrides || {});
  const app = App.createApp(options);
  app.start();
  return { app, root, sessionStore, completionBackend, router };
}

function action(root, name) {
  root.dispatch('click', fakeElement({ 'data-action': name }));
}

// The HTML of the ACTIVE (selected) wheel item — the item that OWNS the
// purple circle.
function activeItem(html) {
  const start = html.indexOf('class="week-day active"');
  assert.notEqual(start, -1, 'an active wheel item must exist');
  const end = html.indexOf('class="week-day"', start + 10);
  return html.slice(start, end === -1 ? html.length : end);
}

function renderCard(date, extra) {
  const opts = Object.assign({
    access: ACCESS,
    mode: 'week',
    selectedDate: date,
    year: 2026,
    month: 10,
    notes: [],
    events: [],
    notesByDate: {},
    eventsByDate: {}
  }, extra || {});
  return Card.renderCardHTML(opts);
}

// ---------------------------------------------------------------------------
// U2.2-002 — default date / session state
// ---------------------------------------------------------------------------

test('U2.2-002 A: a fresh start selects the actual local TODAY (not hardcoded)', () => {
  const a = buildApp({ now: () => new Date(2026, 9, 5) });
  assert.equal(a.app.getState().selectedDate, '2026-10-05');
  const b = buildApp({ now: () => new Date(2026, 9, 6) });
  assert.equal(b.app.getState().selectedDate, '2026-10-06');
  const c = buildApp({ now: () => new Date(2026, 10, 1) });
  assert.equal(c.app.getState().selectedDate, '2026-11-01');
});

test('U2.2-002 B: a browser REFRESH keeps the manually selected date', () => {
  // Session state left behind by the previous page load:
  const sessionStore = memorySession();
  sessionStore.setItem('study-planner:selected-date', '2026-10-09');
  const refreshed = buildApp({ sessionStore, now: () => new Date(2026, 9, 5) });
  assert.equal(refreshed.app.getState().selectedDate, '2026-10-09',
    'refresh restores the manual selection, not today');
});

test('U2.2-002 C: a FULL restart resolves today again (new session, no memory)', () => {
  const oldSession = memorySession();
  oldSession.setItem('study-planner:selected-date', '2026-10-09');
  const restarted = buildApp({ sessionStore: memorySession(), now: () => new Date(2026, 9, 12) });
  assert.equal(restarted.app.getState().selectedDate, '2026-10-12',
    'a brand-new session resolves the real local date');
});

test('U2.2-002: selection is persisted to the SESSION only, never localStorage keys', () => {
  const { app, sessionStore, completionBackend } = buildApp();
  assert.equal(app.getState().selectedDate, '2026-10-05');
  assert.equal(app.setSelectedDate('2026-10-15'), true);
  // Synchronous session write (renderCalendar persists on selection):
  assert.equal(sessionStore.getItem('study-planner:selected-date'), '2026-10-15');
  // The session store never carries completion state, and the completion
  // authority never carries the selection — no duplicate authority.
  assert.deepEqual(Object.keys(sessionStore._map), ['study-planner:selected-date']);
  assert.equal(completionBackend.getItem('study-planner:selected-date'), null);
  assert.equal(completionBackend.getItem(S.STORAGE_KEY), null);
});

test('U2.2-002: a start date outside the canonical year falls back safely', () => {
  // "Today" in 2027 is outside calendar-2026.json — never invent dates.
  const app2027 = buildApp({ now: () => new Date(2027, 0, 15) });
  assert.equal(app2027.app.getState().selectedDate, '2027-01-15');
  // ...and after the canonical calendar loads, the app clamps to config:
  return tick().then(tick).then(tick).then(() => {
    const selected = app2027.app.getState().selectedDate;
    assert.equal(selected, '2026-10-02',
      'outside-canonical startup clamps to the configured cycle start');
  });
});

// ---------------------------------------------------------------------------
// U2.2-001 — one moving selection model (no fixed/second indicator)
// ---------------------------------------------------------------------------

test('U2.2-001: the purple circle lives INSIDE the selected date item', () => {
  const html = renderCard('2026-10-08');
  const item = activeItem(html);
  assert.match(item, /class="week-day active" data-date="2026-10-08"/);
  assert.ok(item.includes('class="date-circle"'),
    'the selected item renders its OWN circle — never a viewport overlay');
  assert.equal((html.match(/class="week-day active"/g) || []).length, 1,
    'exactly one selection exists');
  // No second selection-indicator layer anywhere in the card.
  ['selected-indicator', 'viewport-circle', 'selection-overlay', 'indicator-circle']
    .forEach((token) => assert.equal(html.includes(token), false, token));
});

// ---------------------------------------------------------------------------
// U2.2-003 — navigation outside the 28-day Study Cycle
// ---------------------------------------------------------------------------

test('U2.2-003: Oct 1 shows month context only and navigates freely', async () => {
  const { app, root } = buildApp();
  await tick();
  app.setSelectedDate('2026-10-01');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-01');
  const label = Card.periodLabel(ACCESS, {
    mode: 'week', selectedDate: '2026-10-01', year: 2026, month: 10
  });
  assert.equal(label, 'October 2026');
  ['Week 0', 'W0', 'D0', 'Day 0'].forEach((fake) => assert.equal(label.includes(fake), false));

  // Top navigation continues OUTSIDE the cycle instead of trapping the user.
  action(root, 'previous');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-09-24', 'Oct 1 previous = Sep 24');
  const sep = Card.periodLabel(ACCESS, {
    mode: 'week', selectedDate: '2026-09-24', year: 2026, month: 9
  });
  assert.equal(sep, 'September 2026', 'September shows month context, no Study Week');
});

test('U2.2-003: post-cycle dates remain navigable (Oct 29 -> Nov 5)', async () => {
  const { app, root } = buildApp();
  await tick();
  app.setSelectedDate('2026-10-29');
  await tick();
  // W4 has no W5: navigation must NOT stop — it leaves the cycle cleanly.
  action(root, 'next');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-11-05');
  const label = Card.periodLabel(ACCESS, {
    mode: 'week', selectedDate: '2026-11-05', year: 2026, month: 11
  });
  assert.equal(label, 'November 2026', 'no fake "Week 5" is invented');
});

test('U2.2-003: inside the cycle the top arrows still step Study Weeks', async () => {
  const { app, root } = buildApp();
  await tick();
  app.setSelectedDate('2026-10-08');
  await tick();
  action(root, 'next'); // W1 -> W2
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-09');
  action(root, 'next'); // W2 -> W3
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-16');
  action(root, 'previous'); // W3 -> W2
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-09');
  action(root, 'previous'); // W2 -> W1
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-02');
  action(root, 'previous'); // W1 has no W0 -> leaves the cycle by 7 days
  await tick();
  assert.equal(app.getState().selectedDate, '2026-09-25');
});

test('U2.2-003: the wheel crosses Study Week boundaries without top navigation', async () => {
  const { app } = buildApp();
  await tick();
  const pairs = [
    ['2026-10-08', '2026-10-09'],
    ['2026-10-15', '2026-10-16'],
    ['2026-10-22', '2026-10-23']
  ];
  for (const [from, to] of pairs) {
    app.setSelectedDate(from);
    await tick();
    // Direct selection of the very next date — the wheel's moveBy model.
    assert.equal(app.setSelectedDate(to), true);
    await tick();
    assert.equal(app.getState().selectedDate, to);
    const label = Card.periodLabel(ACCESS, {
      mode: 'week', selectedDate: to, year: 2026, month: 10
    });
    assert.match(label, /^Oct Week \d - 2026$/, to + ' derives its own Study Week');
  }
});

// ---------------------------------------------------------------------------
// U2.2-004 — Monthly navigation across the canonical year
// ---------------------------------------------------------------------------

test('U2.2-004: Monthly moves across supported months, forward and back', async () => {
  const { app, root } = buildApp({ config: { calendarView: 'month', initialDate: '2026-10-02' } });
  await tick();
  assert.equal(app.getState().calendarView, 'month');
  app.setSelectedDate('2026-10-02'); // user picks 2 October
  await tick();
  assert.deepEqual(app.getState().cursor, { year: 2026, month: 10 });

  action(root, 'next'); // Oct -> Nov
  await tick();
  assert.equal(app.getState().selectedDate, '2026-11-02');
  assert.deepEqual(app.getState().cursor, { year: 2026, month: 11 });

  action(root, 'next'); // Nov -> Dec
  await tick();
  assert.equal(app.getState().selectedDate, '2026-12-02');
  assert.deepEqual(app.getState().cursor, { year: 2026, month: 12 });

  action(root, 'previous'); // Dec -> Nov
  await tick();
  assert.equal(app.getState().selectedDate, '2026-11-02');
  action(root, 'previous'); // Nov -> Oct
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-02');
  action(root, 'previous'); // Oct -> Sep
  await tick();
  assert.equal(app.getState().selectedDate, '2026-09-02');
  assert.deepEqual(app.getState().cursor, { year: 2026, month: 9 });
});

test('U2.2-004: Monthly navigation clamps to the canonical year (no invented months)', async () => {
  const { app, root } = buildApp({ config: { calendarView: 'month', initialDate: '2026-10-02' } });
  await tick();
  app.setSelectedDate('2026-12-31');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-12-31');
  action(root, 'next'); // December -> January 2027 (outside canonical data)
  await tick();
  assert.equal(app.getState().selectedDate, '2026-12-31', 'forward is clamped');
  assert.deepEqual(app.getState().cursor, { year: 2026, month: 12 });

  const back = buildApp({ config: { calendarView: 'month', initialDate: '2026-10-02' } });
  await tick();
  back.app.setSelectedDate('2026-01-05');
  await tick();
  action(back.root, 'previous'); // January -> December 2025 (outside data)
  await tick();
  assert.equal(back.app.getState().selectedDate, '2026-01-05', 'backward is clamped');
});

test('U2.2-004: the day-of-month is clamped when moving to a shorter month', async () => {
  const { app, root } = buildApp({ config: { calendarView: 'month', initialDate: '2026-10-02' } });
  await tick();
  app.setSelectedDate('2026-10-31');
  await tick();
  action(root, 'next'); // 31 October -> 30 November (no invented Nov 31)
  await tick();
  assert.equal(app.getState().selectedDate, '2026-11-30');
});

test('U2.2-021: Weekly and Monthly share ONE selected date', async () => {
  const { app } = buildApp();
  await tick();
  app.setSelectedDate('2026-10-16');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-16');

  app.setCalendarView('month');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-10-16', 'Monthly keeps the selection');
  assert.deepEqual(app.getState().cursor, { year: 2026, month: 10 });

  app.setSelectedDate('2026-11-04'); // select in Monthly (different grid)
  await tick();
  app.setCalendarView('week');
  await tick();
  assert.equal(app.getState().selectedDate, '2026-11-04', 'Weekly keeps the selection');
});

// ---------------------------------------------------------------------------
// U2.2-005 / U2.2-006 / U2.2-007 — gutter, text cleanup, overflow
// ---------------------------------------------------------------------------

test('U2.2-005: the calendar uses the reference gutter, never full-bleed', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, ''); // ignore comments
  // No 100vw full-bleed math anywhere in the calendar stylesheet:
  assert.equal(/100vw|-50vw/.test(css), false, 'no viewport-width full-bleed');
  // Desktop gutter = 36px (the reference .page padding):
  assert.match(CSS, /\.app-view\.calendar-view-active\s*\{[^}]*padding-left:\s*36px/s);
  assert.match(CSS, /\.app-view\.calendar-view-active\s*\{[^}]*max-width:\s*calc\(1040px \+ 72px\)/s);
  // Mobile gutter = 18px (the reference @media 720 `.page{padding:0 18px}`):
  // accepted forms: longhand `padding-left: 18px` or shorthand `padding: T 18px`
  // (the U2.2 reference frame uses `padding: 14px 18px` — horizontal = 18px).
  const mobileBlock = CSS.slice(CSS.indexOf('@media (max-width: 720px)'));
  assert.match(mobileBlock,
    /\.app-view\.calendar-view-active\s*\{[^}]*(?:padding-left:\s*18px|padding:\s*\d+px\s+18px)/s,
    'the 720px breakpoint keeps a reference gutter (no edge-to-edge card)');
  // The card itself stays a centered, rounded, reference-width card:
  assert.match(CSS, /\.calendar-card\s*\{[^}]*width:\s*min\(100%,\s*1040px\)/s);
  assert.match(CSS, /border-radius:\s*var\(--u21-radius\)/);
});

test('U2.2-005: the app enables the gutter class only for the Calendar route', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
  assert.match(appSrc, /classList\.add\('calendar-view-active'\)/);
  assert.equal((appSrc.match(/setCalendarRootClass\(false\)/g) || []).length >= 3,
    true, 'tracker/progress/reports all drop the calendar gutter');
});

test('U2.2-007: the card fits the viewport so the PAGE never scrolls for it', () => {
  assert.match(CSS, /max-height:\s*calc\(100vh - 172px\)/,
    'desktop card reserves header + app-view padding');
  // The wheel viewport is the only place allowed to clip:
  assert.match(CSS, /\.week-viewport\s*\{[^}]*overflow:\s*hidden/s);
  // No global scrollbar-hiding shortcuts:
  assert.equal(/html\s*\{[^}]*overflow:\s*hidden/s.test(CSS), false);
  assert.equal(/body\s*\{[^}]*overflow:\s*hidden/s.test(CSS), false);
});

test('U2.2-006: no explanatory/status/debug text remains below the Calendar', () => {
  assert.equal(INDEX_HTML.includes('app-footer'), false, 'footer copy removed');
  ['Selected date →', 'persisted completion', 'Click a date', 'Double-click a date',
    'Press Enter', 'Daily plan', 'debug'].forEach((token) => {
    assert.equal(INDEX_HTML.includes(token), false, 'index.html must not show: ' + token);
  });
  const html = renderCard('2026-10-08');
  ['calendar-hint', 'Click a date', 'Press Enter', 'Selected date', 'status'].forEach((token) => {
    assert.equal(html.includes(token), false, 'card must not show: ' + token);
  });
});

// ---------------------------------------------------------------------------
// U2.2-008 — primary special-day dot colours (metadata-driven)
// ---------------------------------------------------------------------------

test('U2.2-008: primary dot colour is derived from canonical metadata, all four types', () => {
  // Normal day (incl. plain cycle days) -> purple (no modifier class).
  const normal = ACCESS.getDate('2026-10-13'); // cycle day 5, special: null
  assert.equal(normal.special, null);
  assert.equal(Card.primaryDotClass(normal), 'wheel-dot wheel-primary-dot');
  // Study Week first day -> green.
  assert.equal(Card.primaryDotClass(ACCESS.getDate('2026-10-02')),
    'wheel-dot wheel-primary-dot is-week-start');
  // Practice / Day 6 -> yellow.
  assert.equal(Card.primaryDotClass(ACCESS.getDate('2026-10-07')),
    'wheel-dot wheel-primary-dot is-practice');
  // Graded / Day 7 / week end -> red.
  assert.equal(Card.primaryDotClass(ACCESS.getDate('2026-10-08')),
    'wheel-dot wheel-primary-dot is-graded');
  // Outside the cycle -> normal purple, never a fabricated status.
  assert.equal(Card.primaryDotClass(ACCESS.getDate('2026-10-01')), 'wheel-dot wheel-primary-dot');
  assert.equal(Card.primaryDotClass(ACCESS.getDate('2026-09-30')), 'wheel-dot wheel-primary-dot');
  assert.equal(Card.primaryDotClass(null), 'wheel-dot wheel-primary-dot');
});

test('U2.2-008: EVERY Weekly date renders exactly one primary dot', () => {
  ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-08',
    '2026-10-09', '2026-10-15', '2026-10-16', '2026-10-22', '2026-10-23',
    '2026-10-29', '2026-09-30', '2026-11-01'].forEach((date) => {
    const html = renderCard(date);
    const item = activeItem(html);
    assert.match(item, /class="wheel-dot wheel-primary-dot/, date + ' has a primary dot');
    const primaryCount = (item.match(/wheel-primary-dot/g) || []).length;
    assert.equal(primaryCount, 1, date + ' has exactly one primary dot');
  });
});

test('U2.2-008: colours follow the metadata on the required matrix dates', () => {
  const expected = {
    '2026-10-01': 'wheel-primary-dot"',          // outside cycle -> purple
    '2026-10-02': 'wheel-primary-dot is-week-start', // W1 first day -> green
    '2026-10-05': 'wheel-primary-dot"',          // normal -> purple
    '2026-10-08': 'wheel-primary-dot is-graded',  // graded/week end -> red
    '2026-10-09': 'wheel-primary-dot is-week-start',
    '2026-10-07': 'wheel-primary-dot is-practice', // day 6 -> yellow
    '2026-10-14': 'wheel-primary-dot is-practice',
    '2026-10-21': 'wheel-primary-dot is-practice',
    '2026-10-22': 'wheel-primary-dot is-graded',
    '2026-10-28': 'wheel-primary-dot is-practice',
    '2026-10-23': 'wheel-primary-dot is-week-start', // W4 first day -> green
    '2026-10-29': 'wheel-primary-dot is-graded',     // W4 day 7 -> red
    '2026-09-30': 'wheel-primary-dot"',
    '2026-11-01': 'wheel-primary-dot"'
  };
  Object.keys(expected).forEach((date) => {
    const item = activeItem(renderCard(date));
    const at = item.indexOf('wheel-primary-dot');
    assert.notEqual(at, -1, date + ' renders a primary dot');
    assert.ok(item.startsWith(expected[date], at),
      date + ' dot class was: ' + item.slice(at, at + 50));
  });
});

test('U2.2-008: no legend and no dot-meaning labels exist anywhere', () => {
  const html = renderCard('2026-10-08');
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, ''); // ignore comments
  assert.equal(/legend/i.test(html + css), false, 'no legend markup or CSS rule');
  ['Purple =', 'Green =', 'Yellow =', 'Red =', 'Blue = Event',
    'Normal day', 'Week Start label'].forEach((token) => {
    assert.equal(html.includes(token), false, 'no visible dot explanation: ' + token);
  });
});

// ---------------------------------------------------------------------------
// Secondary EVENT dot (U2.2 custom addition)
// ---------------------------------------------------------------------------

test('U2.2-event: an event date gains a SECONDARY dot; no event = primary only', () => {
  const without = activeItem(renderCard('2026-10-06', {
    eventsByDate: {}
  }));
  assert.match(without, /wheel-primary-dot/);
  assert.equal(without.includes('is-event'), false, 'no event -> only the primary dot');

  const withEvent = activeItem(renderCard('2026-10-06', {
    events: [{ id: 'e1', date: '2026-10-06', text: 'Study group', time: '18:30' }],
    eventsByDate: { '2026-10-06': [{ id: 'e1', date: '2026-10-06', text: 'Study group' }] }
  }));
  assert.match(withEvent, /wheel-primary-dot/, 'primary dot remains');
  assert.match(withEvent, /wheel-dot is-event/, 'secondary event dot appears');
  // Ordering: the event dot sits BELOW the primary dot inside one column.
  assert.ok(withEvent.indexOf('wheel-primary-dot') < withEvent.indexOf('is-event'));
});

test('U2.2-event: the event dot NEVER replaces or recolors the primary dot', () => {
  const cases = [
    ['2026-10-13', 'wheel-primary-dot"'],           // normal -> stays purple
    ['2026-10-02', 'wheel-primary-dot is-week-start'], // green stays green
    ['2026-10-07', 'wheel-primary-dot is-practice'],   // yellow stays yellow
    ['2026-10-08', 'wheel-primary-dot is-graded']      // red stays red
  ];
  cases.forEach(([date, expectedClass]) => {
    const bare = activeItem(renderCard(date, { eventsByDate: {} }));
    const withEvent = activeItem(renderCard(date, {
      eventsByDate: { [date]: [{ id: 'e1', date, text: 'Event' }] }
    }));
    const bareAt = bare.indexOf('wheel-primary-dot');
    const eventAt = withEvent.indexOf('wheel-primary-dot');
    assert.ok(withEvent.startsWith(expectedClass, eventAt), date + ' primary class unchanged');
    // Identical primary class with and without an event:
    assert.equal(withEvent.slice(eventAt, eventAt + expectedClass.length),
      bare.slice(bareAt, bareAt + expectedClass.length), date + ' colour identical');
    assert.ok(withEvent.includes('is-event'), date + ' gains the secondary dot');
  });
});

test('U2.2-event: the secondary dot follows the persisted event lifecycle', () => {
  const backend = CM.createMemoryBackend();
  const d = '2026-10-10';
  const dotsFor = (events) => activeItem(renderCard(d, { eventsByDate: events.length ? { [d]: events } : {} }));

  assert.equal(dotsFor([]).includes('is-event'), false, 'no event -> no secondary dot');

  const meta = CM.createCalendarMetadata({ backend });
  const created = meta.addEvent(d, 'Lab session', { time: '18:30' });

  // Survives a reload (fresh store instance, same backend):
  const reloaded = CM.createCalendarMetadata({ backend });
  const restored = reloaded.getEvents(d);
  assert.equal(restored.length, 1, 'event persisted');
  assert.ok(dotsFor(restored).includes('is-event'), 'dot persists through reload');
  assert.ok(dotsFor(restored).includes('wheel-primary-dot'), 'primary dot still present');

  // Attached to the exact date only:
  assert.equal(dotsFor(reloaded.getEvents('2026-10-11')).includes('is-event'), false,
    'unrelated dates stay dot-free');

  // Deletion removes the dot and the metadata:
  assert.equal(reloaded.removeEvent(d, created.id), true);
  const afterDelete = CM.createCalendarMetadata({ backend });
  assert.equal(afterDelete.getEvents(d).length, 0, 'event deleted');
  assert.equal(dotsFor(afterDelete.getEvents(d)).includes('is-event'), false,
    'secondary dot disappears after deletion');
  // Completion storage is untouched by event writes:
  assert.equal(afterDelete.getDiagnostics().ok, true);
});
