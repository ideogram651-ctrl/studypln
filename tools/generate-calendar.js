#!/usr/bin/env node
'use strict';

/*
 * tools/generate-calendar.js — Study-Planner U1 canonical calendar generation.
 *
 * Writes data/calendar/calendar-2026.json: the canonical static calendar/date
 * metadata source for the full 2026 year.
 *
 * Usage:
 *   node tools/generate-calendar.js           regenerate + write the calendar file
 *   node tools/generate-calendar.js --check   verify the file on disk matches regeneration
 *
 * BOUNDARIES (see docs/calendar-data-schema.md):
 *   - This tool does NOT plan. It never allocates lectures, questions, workload,
 *     capacity or task distribution. The Planner Engine remains authoritative.
 *   - Study-cycle meaning (weekNumber, dayNumber, graded/practice markers) is
 *     PROJECTED from the authoritative daily-plan documents in data/schedule/daily/.
 *     Those files are read-only here; this tool never writes them.
 *   - No completion state is emitted. Completion is owned by src/js/storage.js.
 *   - Deterministic: identical inputs always produce a byte-identical file.
 *     No clock reads, no randomness, stable key order.
 *
 * It fails loudly (non-zero exit) when the authoritative source data is
 * inconsistent, rather than emitting a plausible-looking but wrong calendar.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DAILY_DIR = path.join(ROOT, 'data', 'schedule', 'daily');
const OUT_FILE = path.join(ROOT, 'data', 'calendar', 'calendar-2026.json');

const SCHEMA_VERSION = '1.0';
const YEAR = 2026;
const CYCLE_START = '2026-10-02';
const CYCLE_END = '2026-10-29';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// ISO-8601 weekday numbering: Monday = 0 .. Sunday = 6.
const ISO_WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Convert the Sunday-based weekdayIndex (0 = Sunday) used by the repository's
// existing WEEKDAY_* tables into the ISO-8601 index (0 = Monday).
function isoWeekdayIndex(weekdayIdx) {
  return (weekdayIdx + 6) % 7;
}// --- deterministic date helpers (UTC only, no clock reads) --------------------

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function isoDate(year, month, day) {
  return String(year) + '-' + pad2(month) + '-' + pad2(day);
}

function timestampOf(iso) {
  return Date.parse(iso + 'T00:00:00Z');
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// 0 = Sunday .. 6 = Saturday (matches the repository's existing WEEKDAY_* tables).
function weekdayIndex(iso) {
  return new Date(timestampOf(iso)).getUTCDay();
}

class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

// --- authoritative source: the 28 generated daily-plan documents -------------
//
// Cycle metadata is READ from here, never invented. A date that has no plan
// document contributes no study-cycle meaning at all.

function loadCycleFromPlans() {
  if (!fs.existsSync(DAILY_DIR)) {
    throw new SourceError('Daily plan directory not found: ' + DAILY_DIR);
  }
  const files = fs.readdirSync(DAILY_DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new SourceError('No daily plan documents found in ' + DAILY_DIR);

  const byDate = new Map();
  const seenWeeks = new Map();

  for (const file of files) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, file), 'utf8'));
    } catch (e) {
      throw new SourceError('Daily plan ' + file + ' is not valid JSON: ' + e.message);
    }
    if (doc.planType !== 'daily-study-plan') {
      throw new SourceError(file + ': expected planType "daily-study-plan", got ' + JSON.stringify(doc.planType));
    }
    // The filename must match the document date, or the file/date mapping is unsafe.
    if (file !== doc.date + '.json') {
      throw new SourceError(file + ': filename does not match its own date "' + doc.date + '"');
    }
    if (typeof doc.weekNumber !== 'number' || typeof doc.dayNumber !== 'number') {
      throw new SourceError(doc.date + ': missing numeric weekNumber/dayNumber');
    }
    // NOTE ON dayNumber SEMANTICS: in the generated plans `dayNumber` is the
    // CYCLE day (1..28 across the whole cycle), not the day within the week.
    // The specification's "Study Day 1..7" is the day WITHIN the study week,
    // so it is derived here and validated against the week number:
    //     studyDay = dayNumber - (weekNumber - 1) * 7
    const studyDay = doc.dayNumber - (doc.weekNumber - 1) * 7;
    if (studyDay < 1 || studyDay > 7) {
      throw new SourceError(doc.date + ': dayNumber ' + doc.dayNumber +
        ' is inconsistent with weekNumber ' + doc.weekNumber +
        ' (derived study day ' + studyDay + ' is outside 1..7)');
    }
    // Within one study week, study days must run 1..7 with no gaps or duplicates.
    if (seenWeeks.has(doc.weekNumber)) seenWeeks.get(doc.weekNumber).add(studyDay);
    else seenWeeks.set(doc.weekNumber, new Set([studyDay]));

    const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
    const types = new Set(tasks.map((t) => t.type));
    const gradedCount = tasks.filter((t) => t.type === 'graded').length;
    const practiceCount = tasks.filter((t) => t.type === 'practice').length;

    byDate.set(doc.date, {
      date: doc.date,
      dayNumber: doc.dayNumber,
      cycleDay: doc.dayNumber,
      studyDay: studyDay,
      weekNumber: doc.weekNumber,
      // Derived strictly from the plan's own task types.
      isGradedDay: gradedCount > 0,
      gradedTaskCount: gradedCount,
      isPracticeDay: practiceCount > 0,
      practiceTaskCount: practiceCount,
      taskTypes: Array.from(types).sort()
    });
  }// Every study week must be exactly seven consecutive study days, 1..7.
  for (const [weekNumber, days] of seenWeeks) {
    for (let d = 1; d <= 7; d++) {
      if (!days.has(d)) {
        throw new SourceError('Study week ' + weekNumber + ' is missing study day ' + d);
      }
    }
    if (days.size !== 7) {
      throw new SourceError('Study week ' + weekNumber + ' has ' + days.size + ' study days, expected 7');
    }
  }

  // The cycle must be contiguous and match the declared boundaries exactly.
  const dates = Array.from(byDate.keys()).sort();
  if (dates[0] !== CYCLE_START) {
    throw new SourceError('Cycle start mismatch: earliest plan is ' + dates[0] + ', expected ' + CYCLE_START);
  }
  if (dates[dates.length - 1] !== CYCLE_END) {
    throw new SourceError('Cycle end mismatch: latest plan is ' + dates[dates.length - 1] + ', expected ' + CYCLE_END);
  }
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(timestampOf(dates[i - 1]) + 86400000).toISOString().slice(0, 10);
    if (prev !== dates[i]) {
      throw new SourceError('Cycle has a gap between ' + dates[i - 1] + ' and ' + dates[i]);
    }
  }

  return byDate;
}

// --- study-week summary (boundaries derived, not hardcoded) ------------------

function buildStudyWeeks(cycle) {
  const weeks = new Map();
  for (const entry of cycle.values()) {
    if (!weeks.has(entry.weekNumber)) {
      weeks.set(entry.weekNumber, {
        weekNumber: entry.weekNumber,
        startDate: entry.date,
        endDate: entry.date,
        studyDayCount: 0
      });
    }
    const w = weeks.get(entry.weekNumber);
    if (entry.date < w.startDate) w.startDate = entry.date;
    if (entry.date > w.endDate) w.endDate = entry.date;
    w.studyDayCount += 1;
  }

  const ordered = Array.from(weeks.values()).sort((a, b) => a.weekNumber - b.weekNumber);
  ordered.forEach((w) => {
    if (w.studyDayCount !== 7) {
      throw new SourceError('Study week ' + w.weekNumber + ' covers ' + w.studyDayCount + ' dates, expected 7');
    }
    const span = (timestampOf(w.endDate) - timestampOf(w.startDate)) / 86400000 + 1;
    if (span !== 7) {
      throw new SourceError('Study week ' + w.weekNumber + ' spans ' + span + ' days (' +
        w.startDate + ' -> ' + w.endDate + '), expected 7 contiguous days');
    }
    // The cycle runs Friday -> Thursday: every week must start on a Friday.
    if (weekdayIndex(w.startDate) !== 5) {
      throw new SourceError('Study week ' + w.weekNumber + ' starts on ' +
        WEEKDAY_LONG[weekdayIndex(w.startDate)] + ' (' + w.startDate + '), expected a Friday');
    }
  });
  return ordered;
}// --- date records ------------------------------------------------------------

function buildDateRecord(iso, cycle) {
  const year = YEAR;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const wdIndex = weekdayIndex(iso);
  const source = cycle.get(iso) || null;
  const isStudyCycleActive = source !== null;

  const record = {
    date: iso,
    year: year,
    month: month,
    monthName: MONTH_NAMES[month - 1],
    day: day,
    weekday: WEEKDAY_LONG[wdIndex],
    weekdayShort: WEEKDAY_SHORT[wdIndex],
    weekdayIndex: wdIndex,
    isoWeekday: ISO_WEEKDAY[isoWeekdayIndex(wdIndex)],
    isoWeekdayIndex: isoWeekdayIndex(wdIndex),
    dayOfYear: (timestampOf(iso) - timestampOf(isoDate(year, 1, 1))) / 86400000 + 1,
    isStudyCycleActive: isStudyCycleActive,
    // Null (never fabricated) for dates outside the authoritative cycle.
    studyWeek: source ? source.weekNumber : null,
    studyDay: source ? source.studyDay : null,
    cycleDay: source ? source.cycleDay : null,
    isStudyWeekStart: source ? source.studyDay === 1 : false,
    isStudyWeekEnd: source ? source.studyDay === 7 : false,
    isGradedDay: source ? source.isGradedDay : false,
    isPracticeDay: source ? source.isPracticeDay : false,
    // Single "special" channel: null | 'graded' | 'practice' | 'study-week-start'.
    // Precedence is explicit so the value is never ambiguous.
    special: source
      ? (source.isGradedDay ? 'graded'
        : (source.isPracticeDay ? 'practice'
          : (source.studyDay === 1 ? 'study-week-start' : null)))
      : null,
    specialLabel: source
      ? (source.isGradedDay ? 'Graded Assignment'
        : (source.isPracticeDay ? 'Practice Day'
          : (source.studyDay === 1 ? 'Study Week Start' : null)))
      : null,
    // Placeholders for the U2 note/event features. Empty by design: this tool
    // never invents a note or an event.
    notes: [],
    events: []
  };
  return record;
}// --- document assembly -------------------------------------------------------

function buildCalendar() {
  const cycle = loadCycleFromPlans();
  const studyWeeks = buildStudyWeeks(cycle);

  const months = [];
  const allDates = [];

  for (let month = 1; month <= 12; month++) {
    const total = daysInMonth(YEAR, month);
    const dates = [];
    for (let day = 1; day <= total; day++) {
      const iso = isoDate(YEAR, month, day);
      const record = buildDateRecord(iso, cycle);
      dates.push(record);
      allDates.push(record);
    }
    months.push({
      month: month,
      monthName: MONTH_NAMES[month - 1],
      daysInMonth: total,
      firstDate: dates[0].date,
      lastDate: dates[dates.length - 1].date,
      firstWeekday: dates[0].weekday,
      studyCycleDates: dates.filter((d) => d.isStudyCycleActive).length,
      dates: dates
    });
  }

  if (allDates.length !== 365) {
    throw new SourceError('Expected 365 dates for ' + YEAR + ', built ' + allDates.length);
  }

  const activeDates = allDates.filter((d) => d.isStudyCycleActive);
  const gradedDates = allDates.filter((d) => d.isGradedDay).map((d) => d.date);

  return {
    schemaVersion: SCHEMA_VERSION,
    calendarType: 'study-planner-canonical-calendar',
    year: YEAR,
    // Static, canonical date metadata only. Never a planner, never progress,
    // never completion state.
    generatedBy: 'tools/generate-calendar.js',
    sourceOfTruth: {
      calendarStructure: 'data/calendar/calendar-2026.json',
      studyCycleMeaning: 'data/schedule/daily/*.json (generated daily plans, read-only)',
      planning: 'src/js/planner-engine.js',
      completion: 'src/js/storage.js',
      progress: 'src/js/progress-engine.js'
    },
    studyCycle: {
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      totalDays: activeDates.length,
      totalWeeks: studyWeeks.length,
      studyWeekLength: 7,
      // Documented so consumers never re-derive it by accident.
      startsOnWeekday: 'Friday',
      endsOnWeekday: 'Thursday',
      weeks: studyWeeks.map((w) => ({
        weekNumber: w.weekNumber,
        startDate: w.startDate,
        endDate: w.endDate,
        studyDayCount: w.studyDayCount
      })),
      gradedDates: gradedDates,
      practiceDates: allDates.filter((d) => d.isPracticeDay).map((d) => d.date)
    },
    months: months
  };
}

// 2-space indent + trailing newline, matching the existing data/ JSON files.
function serialize(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  let doc;
  try {
    doc = buildCalendar();
  } catch (err) {
    if (err instanceof SourceError) {
      console.error('FATAL: inconsistent authoritative source data — ' + err.message);
      process.exit(1);
    }
    throw err;
  }

  const text = serialize(doc);
  const active = doc.studyCycle.totalDays;

  if (check) {
    if (!fs.existsSync(OUT_FILE)) {
      console.error('MISSING: ' + OUT_FILE);
      process.exit(1);
    }
    const onDisk = fs.readFileSync(OUT_FILE, 'utf8');
    if (onDisk !== text) {
      console.error('DRIFT: ' + OUT_FILE + ' differs from a fresh generation.');
      process.exit(1);
    }
    console.log('OK: calendar is up to date and byte-identical to regeneration.');
    return;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, text, 'utf8');

  console.log('Study-Planner canonical calendar generation (U1, deterministic)');
  console.log('');
  console.log('  file        : data/calendar/calendar-2026.json');
  console.log('  year        : ' + doc.year);
  console.log('  months      : ' + doc.months.length);
  console.log('  dates       : ' + doc.months.reduce((n, m) => n + m.dates.length, 0));
  console.log('  cycle       : ' + doc.studyCycle.startDate + ' -> ' + doc.studyCycle.endDate +
    ' (' + active + ' study days)');
  console.log('  study weeks : ' + doc.studyCycle.weeks.map((w) => 'W' + w.weekNumber + ' ' +
    w.startDate + '->' + w.endDate).join('  '));
  console.log('  graded days : ' + doc.studyCycle.gradedDates.join(', '));
  console.log('');
}

if (require.main === module) main();

module.exports = { buildCalendar, serialize, YEAR, CYCLE_START, CYCLE_END };