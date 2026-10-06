'use strict';

/*
 * tests/renderer/calendar-u2.test.js — Study-Planner U2
 *
 * Covers the canonical-data-driven Calendar experience:
 *   A. canonical calendar loading        K. practice marker rendering
 *   B. monthly navigation                L. date selection
 *   C. weekly study-week navigation      M/N. add note + persistence
 *   D-G. exact W1..W4 ranges            O/P. new event + persistence
 *   H. October 2026 month coverage       Q. malformed metadata recovery
 *   I. study metadata rendering          R. Calendar -> Daily Tracker navigation
 *   J. graded marker rendering           S. existing calendar behaviour preserved
 *                                       T. no duplicate completion/progress authority
 *
 * Run with:  node --test tests/renderer/calendar-u2.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src', 'js', 'calendar.js'));
const CM = require(path.join(ROOT, 'src', 'js', 'calendar-metadata.js'));
const S = require(path.join(ROOT, 'src', 'js', 'storage.js'));
const Context = require(path.join(ROOT, 'src', 'components', 'calendar', 'calendar-context.js'));
const MonthView = require(path.join(ROOT, 'src', 'components', 'calendar', 'month-view.js'));
const WeekView = require(path.join(ROOT, 'src', 'components', 'calendar', 'week-view.js'));
const CalendarView = require(path.join(ROOT, 'src', 'components', 'calendar', 'calendar-view.js'));

const CAL_DOC = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'calendar', 'calendar-2026.json'), 'utf8'));
const ACCESS = C.createCalendarAccess(CAL_DOC);

const OCT_2 = '2026-10-02';

function memoryMeta() {
  return CM.createCalendarMetadata({ backend: CM.createMemoryBackend() });
}

// Builds the per-date meta map the views consume, mirroring app.js.
// getMonthDates() returns date RECORDS, so map to ISO strings first.
function metaFor(dates, reader) {
  const map = {};
  dates.map((d) => (typeof d === 'string' ? d : d.date)).forEach((date) => {
    map[date] = Context.cellMetadata(ACCESS, date, reader);
  });
  return map;
}

function weekDatesOf(n) {
  return ACCESS.getStudyWeekDates(n);
}
// ---------------------------------------------------------------------------
// A. Canonical calendar loading
// ---------------------------------------------------------------------------

test('A1: the shipped canonical calendar indexes 365 dates and 4 study weeks', () => {
  assert.equal(CAL_DOC.year, 2026);
  assert.equal(ACCESS.orderedDates.length, 365);
  assert.equal(ACCESS.getStudyWeeks().length, 4);
  assert.equal(ACCESS.getActiveStudyDates().length, 28);
});

test('A2: calendar-context works without any storage reader', () => {
  const meta = Context.cellMetadata(ACCESS, OCT_2, null);
  assert.equal(meta.studyWeek, 1);
  assert.equal(meta.notesCount, 0);
  assert.equal(meta.eventsCount, 0);
});

test('A3: a throwing metadata reader degrades to empty instead of breaking the UI', () => {
  const broken = {
    getNotes() { throw new Error('boom'); },
    getEvents() { throw new Error('boom'); }
  };
  const meta = Context.cellMetadata(ACCESS, OCT_2, broken);
  assert.equal(meta.notesCount, 0);
  assert.equal(meta.eventsCount, 0);
  assert.equal(meta.studyWeek, 1, 'study metadata still resolved');
});

// ---------------------------------------------------------------------------
// B. Monthly navigation / mode
// ---------------------------------------------------------------------------

test('B1: monthly header communicates calendar month + year', () => {
  const header = Context.buildHeader(ACCESS, 'month', { year: 2026, month: 10, selectedDate: OCT_2 });
  assert.equal(header.title, 'October 2026');
  assert.equal(header.subtitle, null);
  assert.equal(header.weekNumber, null);
});

test('B2: monthly mode never applies study-week logic to the grid', () => {
  const vm = CalendarView.buildModeViewModel({
    view: 'month', access: ACCESS, year: 2026, month: 10, selectedDate: OCT_2, planStatus: {}, meta: {}
  });
  const october = ACCESS.getMonthDates(10);
  assert.ok(vm.body.includes('>31<'), '31 October exists in the month grid');
  assert.ok(vm.body.includes('>1<'), '1 October exists in the month grid');
  assert.equal(vm.body.includes('2026-09-27'), false, 'no stray September cell from week logic');
  // The full month is represented (1..31).
  for (let d = 1; d <= 31; d++) {
    assert.ok(vm.body.includes('data-date="2026-10-' + String(d).padStart(2, '0') + '"'),
      'October ' + d + ' present');
  }
  assert.equal(october.length, 31);
});

test('B3: month navigation arithmetic is calendar-month based', () => {
  assert.deepEqual(C.addMonths(2026, 10, -1), { year: 2026, month: 9 });
  assert.deepEqual(C.addMonths(2026, 10, 1), { year: 2026, month: 11 });
  assert.deepEqual(C.addMonths(2026, 12, 1), { year: 2027, month: 1 });
});

// ---------------------------------------------------------------------------
// C-G. Weekly study-week mode and exact ranges
// ---------------------------------------------------------------------------

test('C1: Weekly mode builds a STUDY week from canonical data', () => {
  const vm = CalendarView.buildModeViewModel({
    view: 'week', access: ACCESS, weekNumber: 1, anchorDate: OCT_2,
    selectedDate: OCT_2, planStatus: {}, meta: metaFor(weekDatesOf(1))
  });
  assert.equal(vm.isWeek, true);
  weekDatesOf(1).forEach((date) => {
    assert.ok(vm.body.includes('data-date="' + date + '"'), date + ' rendered');
  });
});

test('C2: Weekly mode NEVER shows a Sunday->Saturday calendar week for W1', () => {
  const vm = CalendarView.buildModeViewModel({
    view: 'week', access: ACCESS, weekNumber: 1, anchorDate: OCT_2,
    selectedDate: OCT_2, planStatus: {}, meta: metaFor(weekDatesOf(1))
  });
  assert.equal(vm.body.includes('2026-09-27'), false, 'Sep 27 must NOT appear');
  assert.equal(vm.body.includes('2026-10-03'), true, 'Oct 3 belongs to study week 1');
  // The legacy helper still returns Sun-Sat; it is simply not used here.
  assert.equal(C.buildWeekDates(OCT_2)[0], '2026-09-27');
});

test('D1: W1 is exactly 2026-10-02 -> 2026-10-08', () => {
  assert.deepEqual(weekDatesOf(1), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    '2026-10-06', '2026-10-07', '2026-10-08']);
  const w = ACCESS.getStudyWeek(1);
  assert.equal(w.startDate, '2026-10-02');
  assert.equal(w.endDate, '2026-10-08');
});

test('E1: W2 is exactly 2026-10-09 -> 2026-10-15', () => {
  assert.deepEqual(weekDatesOf(2), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
    '2026-10-13', '2026-10-14', '2026-10-15']);
});

test('F1: W3 is exactly 2026-10-16 -> 2026-10-22', () => {
  assert.deepEqual(weekDatesOf(3), ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
    '2026-10-20', '2026-10-21', '2026-10-22']);
});

test('G1: W4 is exactly 2026-10-23 -> 2026-10-29', () => {
  assert.deepEqual(weekDatesOf(4), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26',
    '2026-10-27', '2026-10-28', '2026-10-29']);
});

test('G2: every study week runs Friday -> Thursday', () => {
  ACCESS.getStudyWeeks().forEach((w) => {
    const dates = weekDatesOf(w.weekNumber);
    assert.equal(C.weekdayLong(dates[0]), 'Friday', 'W' + w.weekNumber + ' starts Friday');
    assert.equal(C.weekdayLong(dates[6]), 'Thursday', 'W' + w.weekNumber + ' ends Thursday');
  });
});

test('G3: an unknown week yields an empty strip, never a fabricated one', () => {
  const model = WeekView.buildStudyWeekModel({ access: ACCESS, weekNumber: 99, anchorDate: OCT_2 });
  assert.deepEqual(model.days, []);
  const html = WeekView.renderStudyWeekHTML(model);
  assert.ok(html.includes('outside the active study cycle'));
});
// ---------------------------------------------------------------------------
// Study-week navigation (adjacent weeks, clamped to the cycle)
// ---------------------------------------------------------------------------

test('C3: study-week navigation steps W1 -> W2 -> W3 -> W4 and stops', () => {
  assert.equal(ACCESS.getAdjacentStudyWeek(1, 1).weekNumber, 2);
  assert.equal(ACCESS.getAdjacentStudyWeek(2, 1).weekNumber, 3);
  assert.equal(ACCESS.getAdjacentStudyWeek(3, 1).weekNumber, 4);
  assert.equal(ACCESS.getAdjacentStudyWeek(4, 1), null, 'no week 5');
  assert.equal(ACCESS.getAdjacentStudyWeek(2, -1).weekNumber, 1);
  assert.equal(ACCESS.getAdjacentStudyWeek(1, -1), null, 'no week 0');
});

test('C4: all four study weeks are reachable by repeated next-navigation', () => {
  let week = 1;
  const seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(ACCESS.getStudyWeekDates(week)[0]);
    const next = ACCESS.getAdjacentStudyWeek(week, 1);
    if (!next) break;
    week = next.weekNumber;
  }
  assert.deepEqual(seen, ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23']);
  assert.equal(seen.length, 4);
});

// ---------------------------------------------------------------------------
// I/J/K. Metadata + graded + practice rendering from canonical data
// ---------------------------------------------------------------------------

test('I1: weekly header communicates study week, year and range', () => {
  const header = Context.buildHeader(ACCESS, 'week', { selectedDate: OCT_2 });
  assert.equal(header.title, 'Oct Week 1 - 2026');
  assert.equal(header.subtitle, 'Oct 2 - Oct 8');
  assert.equal(header.weekNumber, 1);
  assert.equal(header.inCycle, true);
});

test('I2: the week header is derived from data, not hardcoded', () => {
  const w3 = Context.buildHeader(ACCESS, 'week', { selectedDate: '2026-10-20' });
  assert.equal(w3.title, 'Oct Week 3 - 2026');
  assert.equal(w3.subtitle, 'Oct 16 - Oct 22');
});

test('I3: study week/day metadata is exposed per date', () => {
  const first = Context.cellMetadata(ACCESS, OCT_2);
  assert.equal(first.studyWeek, 1);
  assert.equal(first.studyDay, 1);
  assert.equal(first.isActive, true);
  const eighth = Context.cellMetadata(ACCESS, '2026-10-08');
  assert.equal(eighth.studyWeek, 1);
  assert.equal(eighth.studyDay, 7);
});

test('J1: graded days are marked from canonical metadata', () => {
  const vm = CalendarView.buildModeViewModel({
    view: 'week', access: ACCESS, weekNumber: 1, anchorDate: OCT_2,
    selectedDate: OCT_2, planStatus: {}, meta: metaFor(weekDatesOf(1))
  });
  assert.ok(vm.body.includes('is-graded-day'), 'graded cell is styled');
  assert.ok(vm.body.includes('>Graded<'), 'graded label rendered');
});

test('J2: every canonical graded date renders a graded marker', () => {
  ACCESS.getGradedDates().forEach((date) => {
    const weekNumber = ACCESS.getStudyMetadata(date).studyWeek;
    const vm = CalendarView.buildModeViewModel({
      view: 'week', access: ACCESS, weekNumber, anchorDate: date,
      selectedDate: date, planStatus: {}, meta: metaFor(weekDatesOf(weekNumber))
    });
    assert.ok(vm.body.includes('>Graded<'), date + ' renders a Graded marker');
  });
});

test('J3: no non-graded date is rendered as graded', () => {
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: {},
    meta: metaFor(ACCESS.getMonthDates(10))
  });
  const html = MonthView.renderMonthHTMLWithMeta(model);
  const gradedCells = (html.match(/is-graded-day/g) || []).length;
  assert.equal(gradedCells, 4, 'exactly the four graded days in October');
});

test('K1: practice days are marked, and stay secondary to graded', () => {
  const vm = CalendarView.buildModeViewModel({
    view: 'week', access: ACCESS, weekNumber: 1, anchorDate: OCT_2,
    selectedDate: OCT_2, planStatus: {}, meta: metaFor(weekDatesOf(1))
  });
  assert.ok(vm.body.includes('>Practice<'), 'practice label rendered');
  assert.ok(vm.body.includes('is-practice-day'), 'practice cell is styled');
  // The practice badge must not use the graded colour class.
  assert.equal(vm.body.includes('day-badge is-graded">Practice'), false);
});

test('K2: inactive dates carry no study metadata in the rendered cell', () => {
  const meta = Context.cellMetadata(ACCESS, '2026-10-01');
  assert.equal(meta.isActive, false);
  assert.equal(meta.studyWeek, null);
  assert.equal(meta.specialLabel, null);
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: '2026-10-01', planStatus: {},
    meta: metaFor(['2026-10-01'])
  });
  const cell = model.weeks.flat().find((c) => c && c.date === '2026-10-01');
  assert.equal(cell.isActive, false);
  assert.equal(cell.studyWeek, null);
});

// ---------------------------------------------------------------------------
// L. Selected date
// ---------------------------------------------------------------------------

test('L1: selected date is marked with aria-pressed and the selected class', () => {
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: {},
    meta: metaFor(ACCESS.getMonthDates(10))
  });
  const html = MonthView.renderMonthHTMLWithMeta(model);
  assert.ok(html.includes('data-date="2026-10-02" data-action="select-date" aria-pressed="true"'));
  assert.ok(html.includes('is-selected'));
});

test('L2: only the selected date is pressed', () => {
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: {},
    meta: metaFor(ACCESS.getMonthDates(10))
  });
  const html = MonthView.renderMonthHTMLWithMeta(model);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
});

test('L3: the date context panel reports the selected date', () => {
  const ctx = Context.buildDateContext(ACCESS, OCT_2, null, { hasPlan: true });
  assert.equal(ctx.heading, '2 October 2026');
  assert.equal(ctx.weekday, 'Friday');
  assert.equal(ctx.studyWeek, 1);
  assert.equal(ctx.studyDay, 1);
  assert.equal(ctx.hasPlan, true);
});

test('L4: the context panel marks the graded day from canonical data', () => {
  const ctx = Context.buildDateContext(ACCESS, '2026-10-08', null, {});
  assert.equal(ctx.isGradedDay, true);
  assert.equal(ctx.specialLabel, 'Graded');
  const html = CalendarView.renderDateContextHTML(ctx, {});
  assert.ok(html.includes('Graded'));
  assert.ok(html.includes('Week 1'));
  assert.ok(html.includes('Day 7'));
});

test('L5: an inactive selected date says so without inventing study metadata', () => {
  const ctx = Context.buildDateContext(ACCESS, '2026-10-30', null, {});
  assert.equal(ctx.isActive, false);
  const html = CalendarView.renderDateContextHTML(ctx, {});
  assert.ok(html.includes('Not part of the active cycle'));
  assert.equal(html.includes('Study week</dt>'), false);
});
// ---------------------------------------------------------------------------
// M/N. Notes
// ---------------------------------------------------------------------------

test('M1: adding a note stores it against the correct date', () => {
  const meta = memoryMeta();
  meta.addNote(OCT_2, 'Review the error log');
  assert.equal(meta.getNotes(OCT_2).length, 1);
  assert.equal(meta.getNotes(OCT_2)[0].text, 'Review the error log');
  assert.equal(meta.getNotes(OCT_2)[0].date, OCT_2);
});

test('M2: notes are date-specific and never leak to other dates', () => {
  const meta = memoryMeta();
  meta.addNote(OCT_2, 'only on the 2nd');
  assert.deepEqual(meta.getNotes('2026-10-03'), []);
  assert.deepEqual(meta.getNotes('2026-10-01'), []);
  assert.equal(meta.getNotes('2026-10-09').length, 0);
});

test('M3: multiple notes on the same date are supported', () => {
  const meta = memoryMeta();
  meta.addNote(OCT_2, 'first');
  meta.addNote(OCT_2, 'second');
  assert.equal(meta.getNotes(OCT_2).length, 2);
  assert.deepEqual(meta.getNotes(OCT_2).map((n) => n.text), ['first', 'second']);
});

test('N1: notes persist across a reload (fresh store, same backend)', () => {
  const backend = CM.createMemoryBackend();
  const first = CM.createCalendarMetadata({ backend });
  first.addNote(OCT_2, 'survives reload');
  const reloaded = CM.createCalendarMetadata({ backend });
  assert.equal(reloaded.getNotes(OCT_2).length, 1);
  assert.equal(reloaded.getNotes(OCT_2)[0].text, 'survives reload');
});

test('N2: a note can be removed', () => {
  const meta = memoryMeta();
  const note = meta.addNote(OCT_2, 'temporary');
  assert.equal(meta.removeNote(OCT_2, note.id), true);
  assert.deepEqual(meta.getNotes(OCT_2), []);
  assert.equal(meta.removeNote(OCT_2, 'nope'), false);
});

test('N3: empty or whitespace notes are rejected', () => {
  const meta = memoryMeta();
  assert.throws(() => meta.addNote(OCT_2, ''), (e) => e.code === 'empty_text');
  assert.throws(() => meta.addNote(OCT_2, '   '), (e) => e.code === 'empty_text');
  assert.throws(() => meta.addNote('not-a-date', 'x'), (e) => e.code === 'invalid_date');
});

test('N4: note counts surface on the date cell and in the context panel', () => {
  const meta = memoryMeta();
  meta.addNote(OCT_2, 'one');
  meta.addNote(OCT_2, 'two');
  const counts = Context.cellMetadata(ACCESS, OCT_2, meta);
  assert.equal(counts.notesCount, 2);

  // (a) the date cell shows a note indicator
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: {},
    meta: metaFor([OCT_2], meta)
  });
  const cellHtml = MonthView.renderMonthHTMLWithMeta(model);
  assert.ok(cellHtml.includes('is-note'), 'note dot rendered on the date cell');
  assert.ok(cellHtml.includes('is-study-day'), 'cell still carries study metadata');

  // (b) the context panel lists the actual note text
  const ctx = Context.buildDateContext(ACCESS, OCT_2, meta, {});
  assert.equal(ctx.notesCount, 2);
  const panelHtml = CalendarView.renderDateContextHTML(ctx, {});
  assert.ok(panelHtml.includes('one') && panelHtml.includes('two'));
});

// ---------------------------------------------------------------------------
// O/P. Events
// ---------------------------------------------------------------------------

test('O1: adding an event stores it against the correct date', () => {
  const meta = memoryMeta();
  meta.addEvent(OCT_2, 'Study group', { time: '18:30' });
  const events = meta.getEvents(OCT_2);
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'Study group');
  assert.equal(events[0].time, '18:30');
  assert.equal(events[0].date, OCT_2);
});

test('O2: events are date-specific', () => {
  const meta = memoryMeta();
  meta.addEvent('2026-10-09', 'Week 2 kickoff');
  assert.deepEqual(meta.getEvents('2026-10-02'), []);
  assert.equal(meta.getEvents('2026-10-09').length, 1);
});

test('P1: events persist across a reload', () => {
  const backend = CM.createMemoryBackend();
  CM.createCalendarMetadata({ backend }).addEvent('2026-10-15', 'Graded day', { time: '09:00' });
  const reloaded = CM.createCalendarMetadata({ backend });
  assert.equal(reloaded.getEvents('2026-10-15')[0].text, 'Graded day');
});

test('P2: an event time is optional and validated leniently', () => {
  const meta = memoryMeta();
  assert.equal(meta.addEvent(OCT_2, 'No time').time, null);
  assert.equal(meta.addEvent(OCT_2, 'Bad time', { time: '99:99' }).time, null);
  assert.equal(meta.addEvent(OCT_2, 'Good', { time: '7:05' }).time, '7:05');
});

test('P3: an event can be removed', () => {
  const meta = memoryMeta();
  const event = meta.addEvent(OCT_2, 'Temp');
  assert.equal(meta.removeEvent(OCT_2, event.id), true);
  assert.deepEqual(meta.getEvents(OCT_2), []);
});

test('P4: event counts surface on the date cell', () => {
  const meta = memoryMeta();
  meta.addEvent(OCT_2, 'Seminar');
  const counts = Context.cellMetadata(ACCESS, OCT_2, meta);
  assert.equal(counts.eventsCount, 1);
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: {},
    meta: metaFor(['2026-10-02'], meta)
  });
  const html = MonthView.renderMonthHTMLWithMeta(model);
  assert.ok(html.includes('is-event'), 'event indicator rendered');
});

// ---------------------------------------------------------------------------
// Q. Malformed metadata recovery
// ---------------------------------------------------------------------------

test('Q1: malformed JSON degrades to empty reads and reports diagnostics', () => {
  const backend = CM.createMemoryBackend();
  backend.setItem(CM.STORAGE_KEY, '{ not json at all');
  const meta = CM.createCalendarMetadata({ backend });
  assert.deepEqual(meta.getNotes(OCT_2), [], 'reads degrade to empty');
  const diag = meta.getDiagnostics();
  assert.equal(diag.ok, false);
  assert.equal(diag.reason, 'malformed_json');
});

test('Q2: writes are refused until reset() on corrupt state (no silent overwrite)', () => {
  const backend = CM.createMemoryBackend();
  const corrupt = '{ not json at all';
  backend.setItem(CM.STORAGE_KEY, corrupt);
  const meta = CM.createCalendarMetadata({ backend });
  assert.throws(() => meta.addNote(OCT_2, 'should not save'), (e) => e.code === 'corrupt_state');
  assert.equal(backend.getItem(CM.STORAGE_KEY), corrupt, 'corrupt payload untouched');
  meta.reset();
  assert.equal(backend.getItem(CM.STORAGE_KEY), null);
  meta.addNote(OCT_2, 'now it saves');
  assert.equal(meta.getNotes(OCT_2).length, 1);
});

test('Q3: an incompatible schema version is reported, not silently accepted', () => {
  const backend = CM.createMemoryBackend();
  backend.setItem(CM.STORAGE_KEY, JSON.stringify({ schemaVersion: 99, notes: {}, events: {} }));
  const meta = CM.createCalendarMetadata({ backend });
  assert.equal(meta.getDiagnostics().ok, false);
});

test('Q4: individual malformed entries are dropped, valid ones survive', () => {
  const backend = CM.createMemoryBackend();
  backend.setItem(CM.STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    notes: {
      '2026-10-02': [{ id: 'n1', date: '2026-10-02', text: 'keep me' }, { nonsense: true }],
      'not-a-date': [{ id: 'x', date: 'not-a-date', text: 'drop me' }]
    },
    events: {}
  }));
  const meta = CM.createCalendarMetadata({ backend });
  assert.equal(meta.getNotes(OCT_2).length, 1);
  assert.equal(meta.getNotes(OCT_2)[0].text, 'keep me');
  assert.equal(meta.getDiagnostics().ok, true);
});
// ---------------------------------------------------------------------------
// Persistence isolation (mandatory)
// ---------------------------------------------------------------------------

test('T1: adding a note does NOT modify the completion store', () => {
  const shared = CM.createMemoryBackend();
  const completion = S.createStorage({ backend: shared });
  const meta = CM.createCalendarMetadata({ backend: shared });

  meta.addNote(OCT_2, 'a note');
  assert.equal(shared.getItem(S.STORAGE_KEY), null, 'study-planner:state untouched');
  assert.deepEqual(completion.getAllCompletions(), {});
  meta.addEvent(OCT_2, 'an event');
  assert.equal(shared.getItem(S.STORAGE_KEY), null, 'still untouched after an event');
});

test('T2: the two stores use different keys', () => {
  assert.notEqual(CM.STORAGE_KEY, S.STORAGE_KEY);
  assert.equal(CM.STORAGE_KEY, 'study-planner:calendar');
  assert.equal(S.STORAGE_KEY, 'study-planner:state');
});

test('T3: completing a task does NOT modify the note/event store', () => {
  const shared = CM.createMemoryBackend();
  const completion = S.createStorage({ backend: shared });
  const meta = CM.createCalendarMetadata({ backend: shared });
  meta.addNote(OCT_2, 'unchanged by completion');

  completion.setCompletion('mathematics-i:1:L1.1', true);

  assert.equal(meta.getNotes(OCT_2).length, 1, 'note still present');
  assert.equal(meta.getNotes(OCT_2)[0].text, 'unchanged by completion');
  assert.equal(meta.getDiagnostics().ok, true);
});

test('T4: unrelated localStorage keys are preserved', () => {
  const shared = CM.createMemoryBackend();
  shared.setItem('some-other-app', 'keep me');
  const meta = CM.createCalendarMetadata({ backend: shared });
  meta.addNote(OCT_2, 'x');
  meta.reset();
  assert.equal(shared.getItem('some-other-app'), 'keep me');
});

test('T5: calendar metadata holds no completion or progress fields', () => {
  const meta = memoryMeta();
  meta.addNote(OCT_2, 'n');
  meta.addEvent(OCT_2, 'e', { time: '10:00' });
  const raw = JSON.stringify(JSON.parse(meta.getRawState()));
  ['completed', 'checked', 'isDone', 'percent', 'progress', 'taskCompletion']
    .forEach((key) => {
      assert.equal(raw.includes('"' + key + '"'), false, 'must not contain ' + key);
    });
});

// ---------------------------------------------------------------------------
// R. Calendar -> Daily Tracker navigation preserved
// ---------------------------------------------------------------------------

test('R1: date cells keep data-action="select-date" and data-date for the app', () => {
  const model = MonthView.buildMonthModelWithMeta({
    year: 2026, month: 10, selectedDate: OCT_2, planStatus: {},
    meta: metaFor(ACCESS.getMonthDates(10))
  });
  const html = MonthView.renderMonthHTMLWithMeta(model);
  assert.ok(html.includes('data-date="2026-10-02" data-action="select-date"'));
});

test('R2: the context panel links to the daily tracker route', () => {
  const ctx = Context.buildDateContext(ACCESS, OCT_2, null, { hasPlan: true });
  const html = CalendarView.renderDateContextHTML(ctx, { openTrackerHref: '#/day/2026-10-02' });
  assert.ok(html.includes('data-hash="#/day/2026-10-02"'));
  assert.ok(html.includes('Open daily tracker'));
});

test('R3: study-week boundary dates still render as date cells', () => {
  ['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09',
    '2026-10-29', '2026-10-30'].forEach((date) => {
    const model = MonthView.buildMonthModelWithMeta({
      year: 2026, month: 10, selectedDate: date, planStatus: {},
      meta: metaFor([date])
    });
    const html = MonthView.renderMonthHTMLWithMeta(model);
    assert.ok(html.includes('data-date="' + date + '"'), date + ' renders a selectable cell');
  });
});

// ---------------------------------------------------------------------------
// S. Existing calendar behaviour preserved
// ---------------------------------------------------------------------------

test('S1: legacy MonthView renderers are unchanged and still work', () => {
  const model = MonthView.buildMonthModel({ year: 2026, month: 10, selectedDate: OCT_2, planStatus: {} });
  const html = MonthView.renderMonthHTML(model);
  assert.ok(html.includes('month-view'));
  assert.ok(html.includes('data-date="2026-10-02"'));
  assert.equal(html.includes('day-badge'), false, 'legacy renderer has no U2 metadata');
});

test('S2: legacy WeekView (Sun-Sat) still behaves exactly as before', () => {
  const model = WeekView.buildWeekModel({ anchorDate: OCT_2, selectedDate: OCT_2, planStatus: {} });
  assert.equal(model.days[0].date, '2026-09-27');
  assert.equal(model.days.length, 7);
  const html = WeekView.renderWeekHTML(model);
  assert.ok(html.includes('week-view'));
});

test('S3: buildDayCell signature and output are unchanged', () => {
  const cell = MonthView.buildDayCell(OCT_2, { selectedDate: OCT_2, planStatus: {} });
  assert.equal(cell.date, OCT_2);
  assert.equal(cell.selected, true);
  assert.equal(cell.hasPlan, false);
  assert.equal(cell.progressState, 'absent');
});

test('S4: progress values are still injected, never computed by the view', () => {
  const cell = MonthView.buildDayCellWithMeta(OCT_2, {
    planStatus: { '2026-10-02': { hasPlan: true, percent: 58 } },
    meta: { '2026-10-02': Context.cellMetadata(ACCESS, OCT_2) }
  });
  assert.equal(cell.percent, 58);
  assert.equal(cell.progressState, 'partial');
});

// ---------------------------------------------------------------------------
// Mode toggle + failure handling
// ---------------------------------------------------------------------------

test('M1: the Monthly/Weekly toggle marks the active mode', () => {
  const month = CalendarView.buildModeViewModel({
    view: 'month', access: ACCESS, year: 2026, month: 10, selectedDate: OCT_2, planStatus: {}, meta: {}
  });
  const week = CalendarView.buildModeViewModel({
    view: 'week', access: ACCESS, weekNumber: 1, anchorDate: OCT_2,
    selectedDate: OCT_2, planStatus: {}, meta: {}
  });
  const monthHtml = CalendarView.renderCalendarHTMLWithMeta(month, {});
  const weekHtml = CalendarView.renderCalendarHTMLWithMeta(week, {});
  assert.ok(monthHtml.includes('data-action="view-month" aria-pressed="true"'));
  assert.ok(monthHtml.includes('data-action="view-week" aria-pressed="false"'));
  assert.ok(weekHtml.includes('data-action="view-week" aria-pressed="true"'));
  assert.ok(weekHtml.includes('data-action="view-month" aria-pressed="false"'));
});

test('M2: navigation buttons carry mode-specific accessible labels', () => {
  const week = CalendarView.buildModeViewModel({
    view: 'week', access: ACCESS, weekNumber: 1, anchorDate: OCT_2,
    selectedDate: OCT_2, planStatus: {}, meta: {}
  });
  const html = CalendarView.renderCalendarHTMLWithMeta(week, {});
  assert.ok(html.includes('aria-label="Previous study week"'));
  assert.ok(html.includes('aria-label="Next study week"'));
  const month = CalendarView.buildModeViewModel({
    view: 'month', access: ACCESS, year: 2026, month: 10, selectedDate: OCT_2, planStatus: {}, meta: {}
  });
  const monthHtml = CalendarView.renderCalendarHTMLWithMeta(month, {});
  assert.ok(monthHtml.includes('aria-label="Previous month"'));
});

test('M3: a calendar load failure renders a clear, non-destructive error', () => {
  const html = CalendarView.renderCalendarUnavailableHTML('The canonical calendar file could not be loaded.');
  assert.ok(html.includes('Calendar data unavailable'));
  assert.ok(html.includes('could not be loaded'));
  assert.ok(html.includes('unaffected'));
  assert.equal(html.includes('day-cell'), false, 'no fabricated dates are rendered');
});

test('M4: the hint keeps the documented double-click tracker interaction', () => {
  const vm = CalendarView.buildModeViewModel({
    view: 'month', access: ACCESS, year: 2026, month: 10, selectedDate: OCT_2, planStatus: {}, meta: {}
  });
  const html = CalendarView.renderCalendarHTMLWithMeta(vm, {});
  assert.ok(html.includes('Double-click a date'));
});

test('M5: HTML in a note is escaped rather than injected', () => {
  const meta = memoryMeta();
  meta.addNote(OCT_2, '<img src=x onerror=alert(1)>');
  const ctx = Context.buildDateContext(ACCESS, OCT_2, meta, {});
  const html = CalendarView.renderDateContextHTML(ctx, {});
  assert.equal(html.includes('<img src=x'), false, 'raw tag is not emitted');
  assert.ok(html.includes('&lt;img'), 'the text is escaped');
});
