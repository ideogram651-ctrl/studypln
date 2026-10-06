'use strict';

/*
 * tests/data/calendar-validation.test.js — Study-Planner U1
 *
 * Validates the canonical full-year calendar (data/calendar/calendar-2026.json)
 * and its access layer (Calendar.createCalendarAccess):
 *
 *   A. Year coverage      - 2026, 12 months, 365 dates, correct month lengths
 *   B. Date uniqueness    - every ISO date appears exactly once
 *   C. Date validity      - all dates parse; year/month/day fields agree
 *   D. Chronological order- Jan 1 -> Dec 31
 *   E. Study cycle        - 2026-10-02 and 10-29 active; 10-01 and 10-30 not
 *   F. Study week mapping - W1..W4 boundaries
 *   G. Study day mapping  - Days 1..7 within every week
 *   H. Graded metadata    - derived from the authoritative daily plans
 *   I. Notes/events       - present and empty on every date
 *   J. Inactive dates     - no fabricated study metadata
 *   K. Determinism        - generator output is byte-identical
 *   L. Source consistency - calendar agrees with the 28 daily-plan documents
 *
 * Run with:  node --test tests/data/calendar-validation.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CALENDAR_FILE = path.join(ROOT, 'data', 'calendar', 'calendar-2026.json');
const DAILY_DIR = path.join(ROOT, 'data', 'schedule', 'daily');

const C = require(path.join(ROOT, 'src', 'js', 'calendar.js'));
const generator = require(path.join(ROOT, 'tools', 'generate-calendar.js'));

const CAL = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
const ACCESS = C.createCalendarAccess(CAL);
const ALL_DATES = CAL.months.flatMap((m) => m.dates);

const EXPECTED_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ---------------------------------------------------------------------------
// A. Year coverage
// ---------------------------------------------------------------------------

test('A1: calendar declares year 2026 and exactly 12 months', () => {
  assert.equal(CAL.year, 2026);
  assert.equal(CAL.months.length, 12);
  assert.deepEqual(CAL.months.map((m) => m.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('A2: every month has the correct number of days for a non-leap year', () => {
  EXPECTED_MONTH_LENGTHS.forEach((expected, index) => {
    const month = CAL.months[index];
    assert.equal(month.daysInMonth, expected, month.monthName + ' length');
    assert.equal(month.dates.length, expected, month.monthName + ' date count');
  });
});

test('A3: the year contains exactly 365 dates', () => {
  assert.equal(ALL_DATES.length, 365);
  assert.equal(ACCESS.orderedDates.length, 365);
});// ---------------------------------------------------------------------------
// B. Date uniqueness
// ---------------------------------------------------------------------------

test('B1: every ISO date is unique across the whole year', () => {
  const seen = new Set();
  const duplicates = [];
  ALL_DATES.forEach((r) => {
    if (seen.has(r.date)) duplicates.push(r.date);
    seen.add(r.date);
  });
  assert.deepEqual(duplicates, []);
  assert.equal(seen.size, 365);
});

test('B2: no month overlaps another month', () => {
  const counts = new Map();
  ALL_DATES.forEach((r) => counts.set(r.month, (counts.get(r.month) || 0) + 1));
  EXPECTED_MONTH_LENGTHS.forEach((expected, i) => {
    assert.equal(counts.get(i + 1), expected);
  });
});

// ---------------------------------------------------------------------------
// C. Date validity
// ---------------------------------------------------------------------------

test('C1: every date is a valid, real calendar date', () => {
  ALL_DATES.forEach((r) => {
    assert.equal(C.isValidIsoDate(r.date), true, r.date + ' must be a valid ISO date');
  });
});

test('C2: year/month/day fields agree with the ISO date string', () => {
  ALL_DATES.forEach((r) => {
    const parts = C.parseIso(r.date);
    assert.equal(r.year, parts.year, r.date + ' year');
    assert.equal(r.month, parts.month, r.date + ' month');
    assert.equal(r.day, parts.day, r.date + ' day');
    assert.equal(r.weekday, C.weekdayLong(r.date), r.date + ' weekday');
    assert.equal(r.weekdayShort, C.weekdayShort(r.date), r.date + ' weekdayShort');
  });
});

test('C3: ISO weekday numbering is correct (Monday = 0)', () => {
  const ISO_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  ALL_DATES.forEach((r) => {
    assert.equal(r.isoWeekdayIndex, (r.weekdayIndex + 6) % 7, r.date + ' iso index');
    assert.equal(r.isoWeekday, ISO_ORDER[r.isoWeekdayIndex], r.date + ' iso weekday');
  });
  // Spot-check the cycle start.
  const first = ACCESS.getDate('2026-10-02');
  assert.equal(first.weekday, 'Friday');
  assert.equal(first.isoWeekday, 'Fri');
  assert.equal(first.isoWeekdayIndex, 4);
});

// ---------------------------------------------------------------------------
// D. Chronological ordering
// ---------------------------------------------------------------------------

test('D1: dates run strictly from 2026-01-01 to 2026-12-31', () => {
  assert.equal(ALL_DATES[0].date, '2026-01-01');
  assert.equal(ALL_DATES[ALL_DATES.length - 1].date, '2026-12-31');
  for (let i = 1; i < ALL_DATES.length; i++) {
    const previous = Date.parse(ALL_DATES[i - 1].date + 'T00:00:00Z');
    const current = Date.parse(ALL_DATES[i].date + 'T00:00:00Z');
    assert.equal(current - previous, 86400000,
      'gap between ' + ALL_DATES[i - 1].date + ' and ' + ALL_DATES[i].date);
  }
});

test('D2: dayOfYear is 1 on 1 January and 365 on 31 December', () => {
  assert.equal(ACCESS.getDate('2026-01-01').dayOfYear, 1);
  assert.equal(ACCESS.getDate('2026-12-31').dayOfYear, 365);
  assert.equal(ACCESS.getDate('2026-10-02').dayOfYear, 275);
});// ---------------------------------------------------------------------------
// E. Study cycle activation
// ---------------------------------------------------------------------------

test('E1: the cycle runs 2026-10-02 to 2026-10-29 with 28 active days', () => {
  assert.equal(CAL.studyCycle.startDate, '2026-10-02');
  assert.equal(CAL.studyCycle.endDate, '2026-10-29');
  assert.equal(CAL.studyCycle.totalDays, 28);
  assert.equal(ACCESS.getActiveStudyDates().length, 28);
});

test('E2: cycle boundaries are active; the day before/after are not', () => {
  assert.equal(ACCESS.isActiveStudyDate('2026-10-02'), true, 'cycle start is active');
  assert.equal(ACCESS.isActiveStudyDate('2026-10-29'), true, 'cycle end is active');
  assert.equal(ACCESS.isActiveStudyDate('2026-10-01'), false, 'day before is inactive');
  assert.equal(ACCESS.isActiveStudyDate('2026-10-30'), false, 'day after is inactive');
});

test('E3: exactly the 28 cycle dates are marked active', () => {
  const active = new Set(ACCESS.getActiveStudyDates());
  assert.equal(active.size, 28);
  let cursor = '2026-10-02';
  for (let i = 0; i < 28; i++) {
    assert.equal(active.has(cursor), true, cursor + ' should be active');
    cursor = C.addDays(cursor, 1);
  }
  assert.equal(active.has('2026-10-01'), false);
  assert.equal(active.has('2026-10-30'), false);
});

// ---------------------------------------------------------------------------
// F. Study week mapping (the Friday -> Thursday canonical cycle)
// ---------------------------------------------------------------------------

test('F1: the four study weeks match the specified boundaries', () => {
  const expected = [
    { weekNumber: 1, startDate: '2026-10-02', endDate: '2026-10-08' },
    { weekNumber: 2, startDate: '2026-10-09', endDate: '2026-10-15' },
    { weekNumber: 3, startDate: '2026-10-16', endDate: '2026-10-22' },
    { weekNumber: 4, startDate: '2026-10-23', endDate: '2026-10-29' }
  ];
  expected.forEach((want) => {
    const week = ACCESS.getStudyWeek(want.weekNumber);
    assert.ok(week, 'week ' + want.weekNumber + ' exists');
    assert.equal(week.startDate, want.startDate, 'W' + want.weekNumber + ' start');
    assert.equal(week.endDate, want.endDate, 'W' + want.weekNumber + ' end');
  });
  assert.equal(ACCESS.getStudyWeeks().length, 4);
});

test('F2: getStudyWeekDates(N) returns exactly the seven canonical dates', () => {
  assert.deepEqual(ACCESS.getStudyWeekDates(1),
    ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  assert.deepEqual(ACCESS.getStudyWeekDates(2),
    ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
  assert.deepEqual(ACCESS.getStudyWeekDates(3),
    ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.deepEqual(ACCESS.getStudyWeekDates(4),
    ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
});

test('F3: every study week runs Friday -> Thursday (7 contiguous days)', () => {
  ACCESS.getStudyWeeks().forEach((week) => {
    const dates = ACCESS.getStudyWeekDates(week.weekNumber);
    assert.equal(dates.length, 7, 'W' + week.weekNumber + ' length');
    assert.equal(C.weekdayLong(dates[0]), 'Friday', 'W' + week.weekNumber + ' starts Friday');
    assert.equal(C.weekdayLong(dates[6]), 'Thursday', 'W' + week.weekNumber + ' ends Thursday');
    for (let i = 1; i < 7; i++) {
      assert.equal(C.addDays(dates[i - 1], 1), dates[i], 'contiguous day ' + i);
    }
  });
});

test('F4: study-week lookup by date resolves to the containing week', () => {
  assert.equal(ACCESS.getStudyWeekForDate('2026-10-02').weekNumber, 1);
  assert.equal(ACCESS.getStudyWeekForDate('2026-10-06').weekNumber, 1);
  assert.equal(ACCESS.getStudyWeekForDate('2026-10-07').weekNumber, 1);
  assert.equal(ACCESS.getStudyWeekForDate('2026-10-09').weekNumber, 2);
  assert.equal(ACCESS.getStudyWeekForDate('2026-10-29').weekNumber, 4);
  assert.equal(ACCESS.getStudyWeekForDate('2026-10-01'), null, 'outside cycle');
  assert.equal(ACCESS.getStudyWeekForDate('2026-11-01'), null, 'outside cycle');
});test('F5: adjacent-week navigation is clamped to the canonical week set', () => {
  assert.equal(ACCESS.getAdjacentStudyWeek(1, 1).weekNumber, 2);
  assert.equal(ACCESS.getAdjacentStudyWeek(4, -1).weekNumber, 3);
  assert.equal(ACCESS.getAdjacentStudyWeek(4, 1), null, 'cannot navigate past the last week');
  assert.equal(ACCESS.getAdjacentStudyWeek(1, -1), null, 'cannot navigate before week 1');
  assert.equal(ACCESS.getAdjacentStudyWeek(99, 1), null, 'unknown week has no neighbour');
});

test('F6: an unknown week number yields no dates rather than a guessed range', () => {
  assert.deepEqual(ACCESS.getStudyWeekDates(0), []);
  assert.deepEqual(ACCESS.getStudyWeekDates(5), []);
  assert.deepEqual(ACCESS.getStudyWeekDates(99), []);
});

// ---------------------------------------------------------------------------
// G. Study day mapping
// ---------------------------------------------------------------------------

test('G1: the first study week exposes Days 1..7 exactly as specified', () => {
  const expected = [
    ['2026-10-02', 1, 'study-week-start'],
    ['2026-10-03', 2, null],
    ['2026-10-04', 3, null],
    ['2026-10-05', 4, null],
    ['2026-10-06', 5, null],
    ['2026-10-07', 6, 'practice'],
    ['2026-10-08', 7, 'graded']
  ];
  expected.forEach(([date, day, special]) => {
    const meta = ACCESS.getStudyMetadata(date);
    assert.equal(meta.studyWeek, 1, date + ' week');
    assert.equal(meta.studyDay, day, date + ' study day');
    assert.equal(meta.special, special, date + ' special');
  });
  // The specification names 2 Oct "Study-week start" and 8 Oct "Graded Assignment".
  assert.equal(ACCESS.getStudyMetadata('2026-10-02').specialLabel, 'Study Week Start');
  assert.equal(ACCESS.getStudyMetadata('2026-10-08').specialLabel, 'Graded Assignment');
});

test('G2: every study week exposes study days 1..7 without gaps', () => {
  ACCESS.getStudyWeeks().forEach((week) => {
    const days = ACCESS.getStudyWeekDates(week.weekNumber).map((d) => ACCESS.getStudyMetadata(d).studyDay);
    assert.deepEqual(days, [1, 2, 3, 4, 5, 6, 7], 'W' + week.weekNumber + ' study days');
  });
});

test('G3: study-day 1 marks the study-week start and day 7 the week end', () => {
  ACCESS.getStudyWeeks().forEach((week) => {
    const first = ACCESS.getStudyMetadata(ACCESS.getStudyWeekDates(week.weekNumber)[0]);
    const last = ACCESS.getStudyMetadata(ACCESS.getStudyWeekDates(week.weekNumber)[6]);
    assert.equal(first.isStudyWeekStart, true, 'W' + week.weekNumber + ' start flag');
    assert.equal(last.isStudyWeekEnd, true, 'W' + week.weekNumber + ' end flag');
    assert.equal(last.studyDay, 7);
  });
});

test('G4: cycle day numbering runs 1..28 across the whole cycle', () => {
  const cycleDays = ACCESS.getActiveStudyDates().map((d) => ACCESS.getStudyMetadata(d).cycleDay);
  assert.deepEqual(cycleDays, Array.from({ length: 28 }, (_, i) => i + 1));
});

test('G5: studyDay and cycleDay stay consistent with the week number', () => {
  ACCESS.getActiveStudyDates().forEach((date) => {
    const meta = ACCESS.getStudyMetadata(date);
    assert.equal(meta.cycleDay, (meta.studyWeek - 1) * 7 + meta.studyDay, date);
  });
});

// ---------------------------------------------------------------------------
// H. Graded-day metadata
// ---------------------------------------------------------------------------

test('H1: the four graded days are marked with grader metadata', () => {
  assert.deepEqual(ACCESS.getGradedDates(),
    ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  assert.deepEqual(CAL.studyCycle.gradedDates,
    ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
});

test('H2: a graded day exposes the graded special marker and label', () => {
  ACCESS.getGradedDates().forEach((date) => {
    const record = ACCESS.getDate(date);
    assert.equal(record.isGradedDay, true, date);
    assert.equal(record.special, 'graded', date + ' special');
    assert.equal(record.specialLabel, 'Graded Assignment', date + ' label');
    assert.equal(ACCESS.isGradedDate(date), true, date);
    assert.equal(record.studyDay, 7, date + ' is study day 7');
  });
});

test('H3: no non-graded date is marked graded', () => {
  const graded = new Set(ACCESS.getGradedDates());
  ALL_DATES.forEach((r) => {
    if (!graded.has(r.date)) assert.equal(r.isGradedDay, false, r.date + ' must not be graded');
  });
});

test('H4: practice days are marked separately from graded days', () => {
  assert.deepEqual(CAL.studyCycle.practiceDates,
    ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
  const practice = ACCESS.getDate('2026-10-07');
  assert.equal(practice.isPracticeDay, true);
  assert.equal(practice.isGradedDay, false);
  assert.equal(practice.special, 'practice');
  assert.equal(practice.specialLabel, 'Practice Day');
});// ---------------------------------------------------------------------------
// I. Notes / events structure
// ---------------------------------------------------------------------------

test('I1: every date exposes an empty notes array', () => {
  ALL_DATES.forEach((r) => {
    assert.ok(Array.isArray(r.notes), r.date + ' notes must be an array');
    assert.equal(r.notes.length, 0, r.date + ' notes must be empty (never invented)');
  });
});

test('I2: every date exposes an empty events array', () => {
  ALL_DATES.forEach((r) => {
    assert.ok(Array.isArray(r.events), r.date + ' events must be an array');
    assert.equal(r.events.length, 0, r.date + ' events must be empty (never invented)');
  });
});

test('I3: notes/events exist on inactive dates too', () => {
  ['2026-01-01', '2026-07-04', '2026-10-01', '2026-12-31'].forEach((date) => {
    const record = ACCESS.getDate(date);
    assert.ok(Array.isArray(record.notes), date + ' notes slot');
    assert.ok(Array.isArray(record.events), date + ' events slot');
  });
});

// ---------------------------------------------------------------------------
// J. Inactive dates must not receive fabricated study metadata
// ---------------------------------------------------------------------------

test('J1: inactive dates have null study week / study day / cycle day', () => {
  ALL_DATES.filter((r) => !r.isStudyCycleActive).forEach((r) => {
    assert.equal(r.studyWeek, null, r.date + ' studyWeek');
    assert.equal(r.studyDay, null, r.date + ' studyDay');
    assert.equal(r.cycleDay, null, r.date + ' cycleDay');
  });
});

test('J2: inactive dates carry no special markers', () => {
  ALL_DATES.filter((r) => !r.isStudyCycleActive).forEach((r) => {
    assert.equal(r.special, null, r.date + ' special');
    assert.equal(r.specialLabel, null, r.date + ' specialLabel');
    assert.equal(r.isGradedDay, false, r.date + ' isGradedDay');
    assert.equal(r.isPracticeDay, false, r.date + ' isPracticeDay');
    assert.equal(r.isStudyWeekStart, false, r.date + ' isStudyWeekStart');
    assert.equal(r.isStudyWeekEnd, false, r.date + ' isStudyWeekEnd');
  });
});

test('J3: getStudyMetadata returns null outside the cycle', () => {
  ['2026-10-01', '2026-10-30', '2026-09-30', '2026-11-05', '2026-01-01'].forEach((date) => {
    assert.equal(ACCESS.getStudyMetadata(date), null, date + ' must have no study metadata');
  });
});

test('J4: no date record carries completion-state fields', () => {
  // Checked structurally on the records themselves rather than by raw text search,
  // so the legitimate `sourceOfTruth.progress` authority pointer is not a false hit.
  const forbidden = ['completed', 'completionPercentage', 'checked', 'isDone',
    'progress', 'taskCompletion', 'percent'];
  ALL_DATES.forEach((r) => {
    forbidden.forEach((key) => {
      assert.equal(Object.prototype.hasOwnProperty.call(r, key), false,
        r.date + ' must not expose completion field "' + key + '"');
    });
  });
  // The document as a whole must not carry a completion store either.
  const topLevel = ['completions', 'completed', 'progress', 'state'];
  topLevel.forEach((key) => {
    assert.equal(Object.prototype.hasOwnProperty.call(CAL, key), false,
      'calendar document must not expose "' + key + '"');
  });
});

// ---------------------------------------------------------------------------
// K. Determinism of the generator
// ---------------------------------------------------------------------------

test('K1: regeneration is byte-identical to the committed calendar file', () => {
  const regenerated = generator.serialize(generator.buildCalendar());
  assert.equal(regenerated, fs.readFileSync(CALENDAR_FILE, 'utf8'),
    'data/calendar/calendar-2026.json must match a fresh generation');
});

test('K2: two consecutive generations produce identical bytes', () => {
  assert.equal(generator.serialize(generator.buildCalendar()),
    generator.serialize(generator.buildCalendar()));
});

test('K3: the generator is idempotent and mutates no source data', () => {
  const plansDir = path.join(ROOT, 'data', 'schedule', 'daily');
  const syllabusDir = path.join(ROOT, 'data', 'syllabus');
  const snapshot = (dir) => fs.readdirSync(dir).sort()
    .map((f) => f + ':' + fs.statSync(path.join(dir, f)).size).join('|');
  const before = snapshot(plansDir) + '#' + snapshot(syllabusDir);
  generator.buildCalendar();
  generator.buildCalendar();
  assert.equal(snapshot(plansDir) + '#' + snapshot(syllabusDir), before,
    'generator must never write to data/schedule/daily or data/syllabus');
});

// ---------------------------------------------------------------------------
// L. Source consistency with the authoritative daily plans
// ---------------------------------------------------------------------------

test('L1: every active calendar record matches its daily-plan document', () => {
  const files = fs.readdirSync(DAILY_DIR).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, 28, 'the cycle is 28 generated plan documents');
  files.forEach((file) => {
    const plan = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, file), 'utf8'));
    const record = ACCESS.getDate(plan.date);
    assert.ok(record, plan.date + ' exists in the calendar');
    assert.equal(record.isStudyCycleActive, true, plan.date + ' active');
    assert.equal(record.studyWeek, plan.weekNumber, plan.date + ' weekNumber');
    assert.equal(record.cycleDay, plan.dayNumber, plan.date + ' dayNumber');
    assert.equal(record.studyDay, plan.dayNumber - (plan.weekNumber - 1) * 7,
      plan.date + ' derived study day');
  });
});

test('L2: graded metadata matches graded tasks in the daily plans', () => {
  const files = fs.readdirSync(DAILY_DIR).filter((f) => f.endsWith('.json'));
  files.forEach((file) => {
    const plan = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, file), 'utf8'));
    const hasGraded = plan.tasks.some((t) => t.type === 'graded');
    assert.equal(ACCESS.getDate(plan.date).isGradedDay, hasGraded,
      plan.date + ' graded marker must follow the plan tasks');
  });
});

test('L3: practice metadata matches practice tasks in the daily plans', () => {
  const files = fs.readdirSync(DAILY_DIR).filter((f) => f.endsWith('.json'));
  files.forEach((file) => {
    const plan = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, file), 'utf8'));
    const hasPractice = plan.tasks.some((t) => t.type === 'practice');
    assert.equal(ACCESS.getDate(plan.date).isPracticeDay, hasPractice,
      plan.date + ' practice marker must follow the plan tasks');
  });
});

test('L4: the calendar covers 365 dates while the cycle covers 28', () => {
  assert.equal(ACCESS.orderedDates.length, 365);
  assert.equal(ACCESS.getActiveStudyDates().length, 28);
  assert.equal(ACCESS.orderedDates.length - ACCESS.getActiveStudyDates().length, 337);
});// ---------------------------------------------------------------------------
// M. Access-layer robustness (malformed documents fail loudly)
// ---------------------------------------------------------------------------

test('M1: createCalendarAccess rejects a document with no months', () => {
  assert.throws(() => C.createCalendarAccess(null), (err) => err instanceof C.CalendarDataError);
  assert.throws(() => C.createCalendarAccess({ months: [] }), (err) => err instanceof C.CalendarDataError);
});

test('M2: createCalendarAccess rejects a duplicated date', () => {
  const doc = {
    months: [{
      month: 1,
      dates: [
        { date: '2026-01-01' },
        { date: '2026-01-01' }
      ]
    }]
  };
  assert.throws(() => C.createCalendarAccess(doc), (err) =>
    err instanceof C.CalendarDataError && err.code === 'duplicate_date');
});

test('M3: createCalendarAccess rejects an invalid date', () => {
  const doc = { months: [{ month: 1, dates: [{ date: '2026-02-30' }] }] };
  assert.throws(() => C.createCalendarAccess(doc), (err) =>
    err instanceof C.CalendarDataError && err.code === 'invalid_date');
});

test('M4: a malformed month is rejected rather than silently ignored', () => {
  assert.throws(() => C.createCalendarAccess({ months: [{ month: 'one', dates: [] }] }),
    (err) => err instanceof C.CalendarDataError);
});

// ---------------------------------------------------------------------------
// N. Study weeks vs calendar months are distinct concepts
// ---------------------------------------------------------------------------

test('N1: study-week navigation does NOT reuse Sunday->Saturday weeks', () => {
  // The legacy helper is deliberately unchanged and still ordinary-calendar based.
  assert.equal(C.buildWeekDates('2026-10-02')[0], '2026-09-27');
  // The canonical study week is different: it starts Friday 2 October.
  assert.equal(ACCESS.getStudyWeekDates(1)[0], '2026-10-02');
  // So the two systems are provably distinct.
  assert.notEqual(C.buildWeekDates('2026-10-02')[0], ACCESS.getStudyWeekDates(1)[0]);
});

test('N2: month access returns calendar months, independent of study weeks', () => {
  const october = ACCESS.getMonthDates(10);
  assert.equal(october.length, 31);
  assert.equal(october[0].date, '2026-10-01');
  assert.equal(october[30].date, '2026-10-31');
  assert.equal(ACCESS.getMonth(10).monthName, 'October');
  assert.equal(ACCESS.getMonth(10).studyCycleDates, 28, 'all 28 cycle days fall in October');
  assert.deepEqual(ACCESS.getMonthDates(11).map((d) => d.date).slice(0, 1), ['2026-11-01']);
  assert.deepEqual(ACCESS.getMonthDates(13), [], 'no 13th month');
});

test('N3: a whole calendar month mixes active and inactive dates', () => {
  const october = ACCESS.getMonthDates(10);
  const active = october.filter((d) => d.isStudyCycleActive);
  assert.equal(active.length, 28);
  assert.equal(october.length - active.length, 3, '1, 30 and 31 October are inactive');
});