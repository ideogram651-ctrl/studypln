'use strict';

/*
 * tests/renderer/calendar-u21.test.js — Study-Planner U2.1
 *
 * Reference-Calendar integration regression coverage.
 *
 *   - Weekly is the DEFAULT mode; toggle order is Weekly | Monthly
 *   - reference card/wheel/grid/control structure is present
 *   - the date-wheel is CONTINUOUS (not locked to a Study Week)
 *   - cross-week movement: Oct 8->9, Oct 15->16, Oct 22->23
 *   - Study Week header is DERIVED context and updates automatically
 *   - Oct 1 is a normal non-cycle date (no Week 0 / W0 / D0 / study label)
 *   - U2 information overload is GONE (W/D, badges, cycle day, plan, footer)
 *   - notes/events render above their controls with delete-only affordances
 *   - canonical data + completion storage stay untouched
 *
 * Run with:  node --test tests/renderer/calendar-u21.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src', 'js', 'calendar.js'));
const CM = require(path.join(ROOT, 'src', 'js', 'calendar-metadata.js'));
const S = require(path.join(ROOT, 'src', 'js', 'storage.js'));
const Card = require(path.join(ROOT, 'src', 'components', 'calendar', 'calendar-card.js'));
const Wheel = require(path.join(ROOT, 'src', 'components', 'calendar', 'calendar-wheel.js'));

const ACCESS = C.createCalendarAccess(JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'calendar', 'calendar-2026.json'), 'utf8')));

function render(date, mode) {
  return Card.renderCardHTML({
    access: ACCESS,
    mode: mode || 'week',
    selectedDate: date,
    year: 2026, month: 10,
    notes: [], events: [], notesByDate: {}, eventsByDate: {}
  });
}

function reader() {
  return CM.createCalendarMetadata({ backend: CM.createMemoryBackend() });
}

// ---------------------------------------------------------------------------
// Default mode + toggle order
// ---------------------------------------------------------------------------

test('U2.1-1: Weekly is the default Calendar mode', () => {
  const App = require(path.join(ROOT, 'src', 'js', 'app.js'));
  assert.equal(App.DEFAULT_CONFIG.calendarView, 'week');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  assert.match(html, /calendarView: 'week'/);
});

test('U2.1-2: toggle order is Weekly then Monthly, with Weekly active by default', () => {
  const html = render('2026-10-02', 'week');
  const weekly = html.indexOf('data-action="view-week"');
  const monthly = html.indexOf('data-action="view-month"');
  assert.ok(weekly > 0 && monthly > weekly, 'Weekly must come before Monthly');
  assert.match(html, /data-action="view-week" aria-pressed="true"[^>]*>Weekly</);
  assert.match(html, /data-action="view-month" aria-pressed="false"[^>]*>Monthly</);
});

test('U2.1-3: Monthly mode marks Monthly active and hides the wheel', () => {
  const html = render('2026-10-02', 'month');
  assert.match(html, /data-action="view-month" aria-pressed="true"[^>]*>Monthly</);
  assert.equal(html.includes('week-viewport'), false, 'wheel hidden in Monthly');
  assert.match(html, /class="month-grid"/);
});

// ---------------------------------------------------------------------------
// Reference structure
// ---------------------------------------------------------------------------

test('U2.1-4: the reference card structure is rendered', () => {
  const html = render('2026-10-02', 'week');
  ['calendar-card', 'dummy-month-nav', 'dummy-nav-btn', 'dummy-month-label',
    'segmented', 'hero-date', 'month-name', 'day-number', 'weekly-area', 'curve',
    'week-viewport', 'week-track', 'week-day', 'weekday', 'date-circle',
    'bottom-row', 'note-icon', 'event-pill'].forEach((token) => {
    assert.ok(html.includes(token), 'missing reference element: ' + token);
  });
});

test('U2.1-5: hero date reflects the selected date', () => {
  const oct8 = render('2026-10-08', 'week');
  assert.match(oct8, /<div class="month-name">October<\/div>/);
  assert.match(oct8, /<div class="day-number" id="heroDay">8<\/div>/);
  const nov1 = render('2026-11-01', 'week');
  assert.match(nov1, /<div class="month-name">November<\/div>/);
  assert.match(nov1, /id="heroDay">1</);
});

test('U2.1-6: the reference font stack is used verbatim', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'css', 'calendar-u21.css'), 'utf8');
  assert.ok(css.includes('"SF Pro Display"'), 'reference font stack must be preserved');
  assert.ok(css.includes('"Helvetica Neue"'));
  assert.ok(css.includes('Inter'));
  assert.equal(/@import|fonts\.googleapis|@font-face/i.test(css), false,
    'no external font dependency allowed');
});

test('U2.1-7: the reference theme values are preserved', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'css', 'calendar-u21.css'), 'utf8');
  assert.ok(css.includes('#7755e8'), 'reference selected purple');
  assert.ok(css.includes('--u21-radius: 36px'), 'reference card radius');
  assert.ok(css.includes('radial-gradient(48% 34% at 50% 96%'), 'reference card gradient');
  assert.ok(css.includes('perspective(240px) rotateX(3deg)'), 'reference curve');
  assert.ok(css.includes('backdrop-filter'), 'glass surfaces');
});

// ---------------------------------------------------------------------------
// Continuous date wheel (NOT locked to a Study Week)
// ---------------------------------------------------------------------------

test('U2.1-8: the wheel spans dates beyond the current study week', () => {
  const dates = Card.wheelDates(ACCESS, '2026-10-08');
  assert.ok(dates.length > 7, 'wheel must be wider than one week');
  assert.ok(dates.includes('2026-10-02') && dates.includes('2026-10-15'),
    'wheel covers dates outside study week 1');
});

test('U2.1-9: cross-week movement Oct 8 -> Oct 9 works directly', () => {
  const dates = Card.wheelDates(ACCESS, '2026-10-08');
  const i = dates.indexOf('2026-10-08');
  assert.equal(dates[i + 1], '2026-10-09', 'the day after Oct 8 must be reachable');
  const after = render('2026-10-09', 'week');
  assert.ok(after.includes('data-date="2026-10-09"'), 'Oct 9 is selectable on the wheel');
});

test('U2.1-10: cross-week movement Oct 15 -> 16 and Oct 22 -> 23 work directly', () => {
  [['2026-10-15', '2026-10-16'], ['2026-10-22', '2026-10-23']].forEach(([from, to]) => {
    const dates = Card.wheelDates(ACCESS, from);
    const i = dates.indexOf(from);
    assert.ok(i >= 0, from + ' must be on its own wheel');
    assert.equal(dates[i + 1], to, from + ' -> ' + to + ' must be adjacent on the wheel');
    assert.ok(render(to, 'week').includes('data-date="' + to + '"'), to + ' is selectable');
  });
});

test('U2.1-11: the wheel renders a full continuous run around the selected date', () => {
  const html = render('2026-10-15', 'week');
  ['2026-10-09', '2026-10-15', '2026-10-16', '2026-10-23'].forEach((date) => {
    assert.ok(html.includes('data-date="' + date + '"'), date + ' must be on the wheel');
  });
  // Exactly one active circle follows the selected date.
  assert.equal((html.match(/class="week-day active"/g) || []).length, 1);
  assert.match(html, /class="week-day active" data-date="2026-10-15"/);
});

test('U2.1-12: wheel geometry helpers clamp and fade like the reference', () => {
  // Centering is clamped so the track never scrolls past its own ends.
  assert.equal(Wheel.centerTransform(0, 76, 1000, 800), 0, 'left edge clamps to 0');
  assert.equal(Wheel.centerTransform(0, 76, 1000, 400), 0, 'over-wide track clamps to 0');
  assert.ok(Wheel.centerTransform(900, 76, 1000, 400) < 0, 'right side uses a negative offset');
  assert.equal(Wheel.opacityClassFor(0), '');
  assert.equal(Wheel.opacityClassFor(150), 'near');
  assert.equal(Wheel.opacityClassFor(300), 'edge');
  assert.equal(Wheel.EDGE_DISTANCE, 220);
  assert.equal(Wheel.NEAR_DISTANCE, 110);
  assert.equal(Wheel.DRAG_THRESHOLD, 35);
});

// ---------------------------------------------------------------------------
// Derived Study Week context
// ---------------------------------------------------------------------------

test('U2.1-13: the period label is the derived Study Week', () => {
  const cases = [
    ['2026-10-02', 'Oct Week 1 - 2026'],
    ['2026-10-08', 'Oct Week 1 - 2026'],
    ['2026-10-09', 'Oct Week 2 - 2026'],
    ['2026-10-15', 'Oct Week 2 - 2026'],
    ['2026-10-16', 'Oct Week 3 - 2026'],
    ['2026-10-22', 'Oct Week 3 - 2026'],
    ['2026-10-23', 'Oct Week 4 - 2026'],
    ['2026-10-29', 'Oct Week 4 - 2026']
  ];
  cases.forEach(([date, label]) => {
    assert.equal(Card.periodLabel(ACCESS, { mode: 'week', selectedDate: date }), label, date);
    assert.ok(render(date, 'week').includes(label), date + ' header must show ' + label);
  });
});

test('U2.1-14: the Study Week header updates automatically across boundaries', () => {
  // No manual week navigation required: selecting the next date re-derives it.
  const before = render('2026-10-08', 'week');
  const after = render('2026-10-09', 'week');
  assert.ok(before.includes('Oct Week 1 - 2026'));
  assert.ok(after.includes('Oct Week 2 - 2026'));
  assert.equal(after.includes('Oct Week 1 - 2026'), false);
});

// ---------------------------------------------------------------------------
// October 1 — normal non-cycle date
// ---------------------------------------------------------------------------

test('U2.1-15: Oct 1 is selectable and shows normal month context', () => {
  const html = render('2026-10-01', 'week');
  assert.ok(html.includes('data-date="2026-10-01"'), 'Oct 1 remains selectable');
  assert.match(html, /class="week-day active" data-date="2026-10-01"/);
  assert.equal(Card.periodLabel(ACCESS, { mode: 'week', selectedDate: '2026-10-01' }), 'October 2026');
});

test('U2.1-16: Oct 1 shows NO fake study-week metadata', () => {
  const html = render('2026-10-01', 'week');
  ['Week 0', 'W0', 'D0', 'Day 0', 'Oct Week 0', 'Cycle Day 0'].forEach((fake) => {
    assert.equal(html.includes(fake), false, 'Oct 1 must not show "' + fake + '"');
  });
  assert.equal(/W\d/.test(html.replace(/week-day|weekday|week-viewport|week-track|weekly-area|week-weekday/g, '')), false,
    'no W<number> label on the wheel');
  // Oct 1 carries no study-cycle dot (that dot is data-driven, not fabricated).
  const oct1 = html.split('<div class="week-day active"').find(Boolean);
  assert.equal(oct1.includes('wheel-cycle-dot'), false, 'Oct 1 is not in the study cycle');
});

test('U2.1-17: Oct 1 -> Oct 2 automatically enters Week 1', () => {
  const dates = Card.wheelDates(ACCESS, '2026-10-01');
  assert.equal(dates[dates.indexOf('2026-10-01') + 1], '2026-10-02');
  assert.equal(Card.periodLabel(ACCESS, { mode: 'week', selectedDate: '2026-10-02' }),
    'Oct Week 1 - 2026');
});

// ---------------------------------------------------------------------------
// U2 information overload REMOVED (hidden, not deleted)
// ---------------------------------------------------------------------------

test('U2.1-18: no W/D labels, badges, cycle day or plan text in Calendar cells', () => {
  ['2026-10-02', '2026-10-07', '2026-10-08', '2026-10-29'].forEach((date) => {
    const html = render(date, 'week');
    // NOTE (U2.2): `is-week-start` / `is-practice` / `is-graded` are no longer
    // forbidden — they are now the invisible CLASSES of the U2.2-008 primary
    // status dot (colour only, no visible label). All visible text stays out.
    ['day-meta', 'day-badge',
      'Graded', 'Practice', 'Week start', 'Cycle', 'Daily plan'].forEach((token) => {
      assert.equal(html.includes(token), false, date + ' must not show "' + token + '"');
    });
    // The forbidden W1 / D1 style labels are gone too.
    assert.equal(/>W\d</.test(html), false, date + ' must not render a W<number> label');
    assert.equal(/>D\d</.test(html), false, date + ' must not render a D<number> label');
  });
});

test('U2.1-19: the selected-date information panel and footer hint are gone', () => {
  const html = render('2026-10-08', 'week');
  ['cal-context', 'Open daily tracker', 'calendar-hint', 'Click a date',
    'Double-click a date', 'Press Enter', 'Selected date'].forEach((token) => {
    assert.equal(html.includes(token), false, 'removed element still present: ' + token);
  });
});

test('U2.1-20: the underlying metadata still exists in the canonical data', () => {
  // HIDE != DELETE: the canonical calendar still carries every study-cycle fact.
  ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'].forEach((date) => {
    const record = ACCESS.getDate(date);
    assert.equal(record.isGradedDay, true, date + ' is still graded in the data');
    assert.equal(record.special, 'graded');
  });
  assert.equal(ACCESS.getDate('2026-10-02').studyDay, 1);
  assert.equal(ACCESS.getDate('2026-10-29').studyWeek, 4);
});

// ---------------------------------------------------------------------------
// Notes / events presentation
// ---------------------------------------------------------------------------

test('U2.1-21: saved notes render above the Add a note control with delete only', () => {
  const meta = reader();
  const note = meta.addNote('2026-10-08', 'Bring the graded solutions');
  const html = Card.renderCardHTML({
    access: ACCESS, mode: 'week', selectedDate: '2026-10-08', year: 2026, month: 10,
    notes: meta.getNotes('2026-10-08'), events: [],
    notesByDate: { '2026-10-08': meta.getNotes('2026-10-08') }, eventsByDate: {}
  });
  const noteIdx = html.indexOf('Bring the graded solutions');
  const controlIdx = html.indexOf('Add a note...');
  assert.ok(noteIdx > 0 && controlIdx > noteIdx, 'note must appear ABOVE the Add a note control');
  assert.ok(html.includes('data-action="remove-note"'), 'a delete control must exist');
  assert.equal(/Edit/i.test(html), false, 'no Edit button allowed');
  assert.ok(html.includes('aria-label="Delete note"'));
  assert.equal(meta.removeNote('2026-10-08', note.id), true, 'delete removes stored metadata');
  assert.deepEqual(meta.getNotes('2026-10-08'), []);
});

test('U2.1-22: saved events render above the New Event control with delete only', () => {
  const meta = reader();
  const event = meta.addEvent('2026-10-09', 'Study group', { time: '18:30' });
  const html = Card.renderCardHTML({
    access: ACCESS, mode: 'week', selectedDate: '2026-10-09', year: 2026, month: 10,
    notes: [], events: meta.getEvents('2026-10-09'),
    notesByDate: {}, eventsByDate: { '2026-10-09': meta.getEvents('2026-10-09') }
  });
  assert.ok(html.indexOf('Study group') > 0 &&
    html.indexOf('Study group') < html.indexOf('New Event'), 'event above the control');
  assert.ok(html.includes('data-action="remove-event"'));
  assert.ok(html.includes('18:30'), 'event time is shown');
  assert.equal(/Edit/i.test(html), false, 'no Edit button allowed');
  assert.equal(meta.removeEvent('2026-10-09', event.id), true);
});

test('U2.1-23: notes/events are date-scoped and never leak to another date', () => {
  const meta = reader();
  meta.addNote('2026-10-08', 'only the 8th');
  const html = Card.renderCardHTML({
    access: ACCESS, mode: 'week', selectedDate: '2026-10-15', year: 2026, month: 10,
    notes: meta.getNotes('2026-10-15'), events: [],
    notesByDate: {}, eventsByDate: {}
  });
  assert.equal(html.includes('only the 8th'), false, 'Oct 15 must not show the Oct 8 note');
});

test('U2.1-24: notes/events persist across a reload (fresh store, same backend)', () => {
  const backend = CM.createMemoryBackend();
  CM.createCalendarMetadata({ backend }).addNote('2026-10-08', 'persists');
  const reloaded = CM.createCalendarMetadata({ backend });
  assert.equal(reloaded.getNotes('2026-10-08')[0].text, 'persists');
  assert.deepEqual(reloaded.getNotes('2026-10-15'), []);
});

// ---------------------------------------------------------------------------
// Storage / completion isolation
// ---------------------------------------------------------------------------

test('U2.1-25: calendar metadata and completion state remain separate', () => {
  assert.notEqual(CM.STORAGE_KEY, S.STORAGE_KEY);
  const shared = CM.createMemoryBackend();
  const completion = S.createStorage({ backend: shared });
  const meta = CM.createCalendarMetadata({ backend: shared });

  meta.addNote('2026-10-08', 'a note');
  meta.addEvent('2026-10-08', 'an event');
  assert.equal(shared.getItem(S.STORAGE_KEY), null, 'completion store untouched');

  completion.setCompletion('mathematics-i:1:L1.1', true);
  assert.equal(meta.getNotes('2026-10-08').length, 1, 'notes survive a completion write');
  assert.equal(meta.getDiagnostics().ok, true);
});

test('U2.1-26: unrelated localStorage keys are preserved', () => {
  const shared = CM.createMemoryBackend();
  shared.setItem('other-app', 'keep');
  CM.createCalendarMetadata({ backend: shared }).addNote('2026-10-08', 'x').id;
  CM.createCalendarMetadata({ backend: shared }).reset();
  assert.equal(shared.getItem('other-app'), 'keep');
});

// ---------------------------------------------------------------------------
// Monthly minimal grid
// ---------------------------------------------------------------------------

test('U2.1-27: Monthly renders a plain 7-column grid with weekday headings', () => {
  const html = render('2026-10-02', 'month');
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
    assert.ok(html.includes('>' + d + '</div>'), 'heading ' + d);
  });
  assert.equal((html.match(/class="grid-head"/g) || []).length, 7);
  assert.equal((html.match(/class="grid-cell selected"/g) || []).length, 1);
  assert.match(html, /class="grid-cell selected" data-date="2026-10-02"/);
  assert.ok(html.includes('data-date="2026-10-31"'), '31 October present');
  assert.ok(html.includes('class="grid-cell empty"'), 'leading empties present');
});
