'use strict';

/*
 * tests/data/syllabus-validation.test.js — Study-Planner Phase 1 validation
 *
 * Validates the canonical syllabus layer (data/syllabus/*.json) against the
 * CourseXtract source references and the Phase 1 requirements:
 *   - course identity and four-week structure
 *   - inventory totals (videos / assignments / graded / question counts)
 *   - stable source ids, source order, week-scoped uniqueness
 *   - durations: known ones converted, missing ones stay null
 *   - question counts: known ones preserved, missing ones stay null
 *   - graded identification, warning preservation, no invented data
 *   - deterministic regeneration (stable on repeat, matches committed files)
 *
 * Run with:  node --test tests/data/syllabus-validation.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const extractor = require(path.resolve(__dirname, '..', '..', 'tools', 'extract-syllabus.js'));

const SYLLABUS_DIR = path.resolve(__dirname, '..', '..', 'data', 'syllabus');

const FILES = {
  math: 'mathematics-i.json',
  stats: 'statistics.json',
  ct: 'computational-thinking.json',
  english: 'english.json'
};

// Inventory targets derived from the supplied CourseXtract references.
const EXPECTED = {
  [FILES.math]: {
    courseId: 'BSMA1001',
    courseName: 'Mathematics I',
    subjectId: 'mathematics-i',
    weekItemCounts: [30, 51, 38, 47],
    items: 166,
    videos: 109,
    assignRows: 53,
    graded: 4,
    questions: 537,
    knownDurations: 42,
    missingDurations: 67,
    videoDuration: '9h 10m',
    typeCounts: { activity: 45, graded: 4, lecture: 54, other: 1, practice: 8, solution: 3, summary: 1, tutorial: 50 },
    warnings: { duration_unavailable: 67, hindi_link_unavailable: 66 },
    links: { hindi: 43, seek: 166 },
    itemsWithoutSeek: [],
    duplicateSourceIds: { 'Practice Assignment (Extra Practice)': [1, 2, 3] }
  },
  [FILES.stats]: {
    courseId: 'BSMA1002',
    courseName: 'Statistics I',
    subjectId: 'statistics-i',
    weekItemCounts: [17, 18, 23, 30],
    items: 88,
    videos: 49,
    assignRows: 35,
    graded: 4,
    questions: 328,
    knownDurations: 23,
    missingDurations: 26,
    videoDuration: '10h 46m',
    typeCounts: { activity: 22, extra: 3, graded: 4, lecture: 23, orientation: 1, other: 2, practice: 11, tutorial: 22 },
    warnings: { duration_unavailable: 26, hindi_link_unavailable: 26, open_failed: 1, open_link_missing: 1, question_count_unavailable: 3 },
    links: { hindi: 23, seek: 87 },
    itemsWithoutSeek: ['Programming'],
    duplicateSourceIds: {},
    // Statistics source numbering quirk: the "#" column restarts per week but
    // contains repeats and gaps. Preserved verbatim from the source (not "fixed").
    rowNumberSequences: [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 13, 16, 17],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 14, 17, 18],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 20, 23],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 23, 24, 29, 30]
    ]
  },
  [FILES.ct]: {
    courseId: 'BSCS1001',
    courseName: 'CT',
    subjectId: 'computational-thinking',
    weekItemCounts: [26, 31, 24, 20],
    items: 101,
    videos: 57,
    assignRows: 40,
    graded: 4,
    questions: 226,
    knownDurations: 35,
    missingDurations: 22,
    videoDuration: '8h 17m',
    typeCounts: { activity: 36, graded: 4, lecture: 36, practice: 4, solution: 4, tutorial: 17 },
    warnings: { duration_unavailable: 22, hindi_link_unavailable: 22 },
    links: { hindi: 35, seek: 101 },
    itemsWithoutSeek: [],
    duplicateSourceIds: {}
  },
  [FILES.english]: {
    courseId: 'BSHS1001',
    courseName: 'English I',
    subjectId: 'english-i',
    weekItemCounts: [14, 14, 16, 14],
    items: 58,
    videos: 25,
    assignRows: 29,
    graded: 4,
    questions: 176,
    knownDurations: 25,
    missingDurations: 0,
    videoDuration: '11h 42m',
    typeCounts: { activity: 25, graded: 4, lecture: 25, practice: 4 },
    warnings: {},
    links: { english: 25, seek: 58 },
    itemsWithoutSeek: [],
    duplicateSourceIds: {
      'Lecture 1': [1, 2, 3],
      'Lecture 2': [1, 2, 3],
      'Lecture 3': [1, 2, 3],
      'Lecture 4': [1, 2, 3],
      'Lecture 5': [1, 2, 3],
      'Lecture 6': [1, 2, 3]
    }
  }
};

const FILE_NAMES = Object.values(FILES);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function load(fileName) {
  return JSON.parse(fs.readFileSync(path.join(SYLLABUS_DIR, fileName), 'utf8'));
}

function allItems(course) {
  return course.weeks.reduce((list, w) => list.concat(w.items), []);
}

function isVideoItem(item) {
  return item.source.rowClass.indexOf('video') === 0;
}

function isAssignRow(item) {
  return item.source.rowClass.indexOf('assign') === 0;
}

function isGradedRow(item) {
  return item.source.rowClass === 'graded';
}

function countBy(list, keyFn) {
  const counts = {};
  for (const x of list) {
    const key = keyFn(x);
    if (key !== null) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function secondsFromDuration(duration) {
  const parts = duration.split(':').map(Number);
  return parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function findItem(course, sourceId, weekNumber) {
  for (const w of course.weeks) {
    if (weekNumber !== undefined && w.weekNumber !== weekNumber) continue;
    for (const item of w.items) {
      if (item.sourceId === sourceId) return item;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('all four courses exist, parse, and identify themselves', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const course = load(fileName);
    assert.equal(course.schemaVersion, '1.0', fileName + ': schemaVersion');
    assert.equal(course.courseId, expected.courseId, fileName + ': courseId');
    assert.equal(course.courseName, expected.courseName, fileName + ': courseName');
    assert.equal(course.subjectId, expected.subjectId, fileName + ': subjectId');
    assert.equal(course.weekCount, 4, fileName + ': weekCount');
    assert.equal(course.source.type, 'iitm-coursextract', fileName + ': source.type');
    assert.ok(/^reference\/syllabus\/.+\.html$/.test(course.source.file), fileName + ': source.file');
    assert.equal(course.source.status, 'EXTRACTION COMPLETE', fileName + ': source.status');
    assert.ok(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(course.source.generatedAt), fileName + ': source.generatedAt');
    assert.equal(course.source.summary.videos, expected.videos, fileName + ': summary videos');
    assert.equal(course.source.summary.assignments, expected.assignRows + expected.graded, fileName + ': summary assignments');
    assert.equal(course.source.summary.graded, expected.graded, fileName + ': summary graded');
    assert.equal(course.source.summary.questions, expected.questions, fileName + ': summary questions');
    assert.equal(course.source.summary.videoDuration, expected.videoDuration, fileName + ': summary videoDuration');
  }
});

test('each course has exactly four weeks in order with stable week ids', () => {
  for (const fileName of FILE_NAMES) {
    const course = load(fileName);
    assert.equal(course.weeks.length, 4, fileName + ': weeks length');
    course.weeks.forEach((week, index) => {
      const n = index + 1;
      assert.equal(week.weekNumber, n, fileName + ': weekNumber order');
      assert.equal(week.weekId, course.subjectId + '-w' + n, fileName + ': weekId');
      assert.equal(week.title, 'Week ' + n, fileName + ': week title');
      assert.equal(week.source.status, 'SUCCESS', fileName + ' week ' + n + ': source status');
    });
  }
});

test('week item counts match the source declarations and the extracted rows', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const course = load(fileName);
    const counts = course.weeks.map((w) => w.items.length);
    assert.deepEqual(counts, expected.weekItemCounts, fileName + ': items per week');
    course.weeks.forEach((week) => {
      assert.equal(week.source.itemCount, week.items.length,
        fileName + ' week ' + week.weekNumber + ': source itemCount vs extracted rows');
    });
    assert.equal(allItems(course).length, expected.items, fileName + ': total items');
  }
});

test('video / assignment / graded inventory matches the CourseXtract summary', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const items = allItems(load(fileName));
    const videos = items.filter(isVideoItem);
    const assignRows = items.filter(isAssignRow);
    const gradedRows = items.filter(isGradedRow);
    assert.equal(videos.length, expected.videos, fileName + ': videos');
    assert.equal(assignRows.length, expected.assignRows, fileName + ': non-graded assignment rows');
    assert.equal(gradedRows.length, expected.graded, fileName + ': graded rows');
    assert.equal(assignRows.length + gradedRows.length, expected.assignRows + expected.graded,
      fileName + ': assignments incl. graded');
  }
});

test('source ids are stable, present, and unique inside each week', () => {
  for (const fileName of FILE_NAMES) {
    const course = load(fileName);
    for (const week of course.weeks) {
      const seen = new Set();
      for (const item of week.items) {
        assert.equal(typeof item.sourceId, 'string', fileName + ': sourceId type');
        assert.ok(item.sourceId.trim().length > 0, fileName + ': sourceId not empty');
        assert.equal(item.sourceId, item.sourceId.trim(), fileName + ': sourceId trimmed');
        assert.ok(item.title.trim().length > 0, fileName + ': title not empty');
        assert.equal(item.weekNumber, week.weekNumber, fileName + ': item weekNumber matches week');
        assert.ok(!seen.has(item.sourceId),
          fileName + ' week ' + week.weekNumber + ': duplicate sourceId "' + item.sourceId + '"');
        seen.add(item.sourceId);
      }
    }
  }
  // Known source identity anchors must be preserved verbatim.
  const math = load(FILES.math);
  assert.ok(findItem(math, 'L1.1', 1), 'math contains L1.1 in week 1');
  assert.ok(findItem(math, 'AQ1.1', 1), 'math contains AQ1.1 in week 1');
  assert.ok(findItem(math, 'Grading Assignment - 1', 1), 'math contains "Grading Assignment - 1"');
  const stats = load(FILES.stats);
  assert.ok(findItem(stats, 'Course Overview', 1), 'stats contains "Course Overview"');
  assert.ok(findItem(stats, 'L1.1', 1), 'stats contains L1.1 in week 1');
  const ct = load(FILES.ct);
  assert.ok(findItem(ct, 'Week 1 Tutorial for Lecture 2', 1), 'ct contains "Week 1 Tutorial for Lecture 2"');
  const english = load(FILES.english);
  assert.ok(findItem(english, 'Lecture 1', 1), 'english contains "Lecture 1" in week 1');
  assert.ok(findItem(english, 'L4.1', 4), 'english contains "L4.1" in week 4');
});

test('cross-week duplicate labels match the documented week-scoped identity set', () => {
  for (const fileName of FILE_NAMES) {
    const course = load(fileName);
    const byId = {};
    for (const week of course.weeks) {
      for (const item of week.items) {
        (byId[item.sourceId] = byId[item.sourceId] || []).push(week.weekNumber);
      }
    }
    const duplicates = {};
    for (const sourceId of Object.keys(byId)) {
      if (byId[sourceId].length > 1) duplicates[sourceId] = byId[sourceId];
    }
    assert.deepEqual(duplicates, EXPECTED[fileName].duplicateSourceIds,
      fileName + ': documented cross-week duplicate labels');
  }
});

test('source ordering is preserved: lecture and activity sequences increase within weeks', () => {
  function assertIncreasing(items, pattern, label, fileName, weekNumber) {
    let previous = null;
    for (const item of items) {
      const m = pattern.exec(item.sourceId);
      if (!m) continue;
      const minor = m[2] !== undefined ? +m[2] : 0;
      const value = +m[1] * 1000 + minor;
      if (previous !== null) {
        assert.ok(value > previous,
          fileName + ' week ' + weekNumber + ': ' + label + ' order broken at "' + item.sourceId + '"');
      }
      previous = value;
    }
  }
  for (const fileName of FILE_NAMES) {
    const course = load(fileName);
    for (const week of course.weeks) {
      assertIncreasing(week.items, /^L(\d+)\.(\d+)$/, 'lecture', fileName, week.weekNumber);
      assertIncreasing(week.items, /^AQ(\d+)\.(\d+)$/, 'activity', fileName, week.weekNumber);
      if (fileName === FILES.english) {
        assertIncreasing(week.items, /^Lecture (\d+)$/, 'lecture number', fileName, week.weekNumber);
      }
    }
  }
});

test('known durations are converted correctly; missing durations remain null', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const videos = allItems(load(fileName)).filter(isVideoItem);
    const known = videos.filter((i) => i.durationSeconds !== null);
    const missing = videos.filter((i) => i.durationSeconds === null);
    assert.equal(known.length, expected.knownDurations, fileName + ': videos with duration');
    assert.equal(missing.length, expected.missingDurations, fileName + ': videos without duration');
    for (const item of videos) {
      assert.equal(item.duration === null, item.durationSeconds === null,
        fileName + ': duration/durationSeconds null agreement for "' + item.sourceId + '"');
      if (item.duration !== null) {
        assert.ok(/^\d{1,2}:\d{2}(:\d{2})?$/.test(item.duration),
          fileName + ': raw duration format "' + item.duration + '"');
        assert.equal(item.durationSeconds, secondsFromDuration(item.duration),
          fileName + ': seconds conversion for "' + item.sourceId + '"');
        assert.equal(item.duration, item.source.details,
          fileName + ': raw duration traceable to source details for "' + item.sourceId + '"');
      } else {
        assert.equal(item.duration, null, fileName + ': missing duration stays null');
      }
    }
    for (const item of allItems(load(fileName)).filter((i) => !isVideoItem(i))) {
      assert.equal(item.duration, null, fileName + ': non-video has null duration');
      assert.equal(item.durationSeconds, null, fileName + ': non-video has null durationSeconds');
    }
  }
  // Anchors verified against the source rows.
  assert.equal(findItem(load(FILES.math), 'L1.1', 1).durationSeconds, 1249);
  assert.equal(findItem(load(FILES.math), 'L1.2', 1).durationSeconds, 741);
  assert.equal(findItem(load(FILES.stats), 'L1.2', 1).durationSeconds, 2506);
  assert.equal(findItem(load(FILES.ct), 'L1.1', 1).durationSeconds, 709);
  assert.equal(findItem(load(FILES.english), 'Lecture 1', 1).durationSeconds, 1306);
  assert.equal(findItem(load(FILES.english), 'L4.1', 4).durationSeconds, 1889);
});

test('question counts: known values preserved, unknown values stay null', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const items = allItems(load(fileName));
    const sum = items.reduce((n, i) => n + (i.questionCount !== null ? i.questionCount : 0), 0);
    assert.equal(sum, expected.questions, fileName + ': known question count total');
    for (const item of items) {
      if (item.questionCount !== null) {
        assert.ok(Number.isInteger(item.questionCount) && item.questionCount > 0,
          fileName + ': questionCount positive integer for "' + item.sourceId + '"');
        assert.ok(/^\d+\s+Questions?\b/i.test(item.source.details),
          fileName + ': questionCount traceable to source details for "' + item.sourceId + '"');
      } else {
        assert.equal(item.questionCount, null, fileName + ': missing question count stays null');
      }
      if (isVideoItem(item)) {
        assert.equal(item.questionCount, null, fileName + ': videos have null questionCount');
      }
    }
  }
  assert.equal(findItem(load(FILES.math), 'AQ1.1', 1).questionCount, 5);
  assert.equal(findItem(load(FILES.english), 'AQ4.1', 4).questionCount, 1); // singular "1 Question" in source
  const stats = load(FILES.stats);
  const statsNullCounts = allItems(stats).filter(
    (i) => (isAssignRow(i) || isGradedRow(i)) && i.questionCount === null
  );
  assert.equal(statsNullCounts.length, 4, 'stats: 4 assignment rows without question counts');
  statsNullCounts.forEach((item) => {
    assert.ok(item.warnings.length > 0,
      'stats row without count carries a source warning: "' + item.sourceId + '"');
  });
});

test('graded assignments remain identifiable: one per week, marked as graded', () => {
  for (const fileName of FILE_NAMES) {
    const course = load(fileName);
    const gradedItems = allItems(course).filter(isGradedRow);
    assert.equal(gradedItems.length, EXPECTED[fileName].graded, fileName + ': graded count');
    for (const week of course.weeks) {
      const weekGraded = week.items.filter(isGradedRow);
      assert.equal(weekGraded.length, 1, fileName + ' week ' + week.weekNumber + ': exactly one graded item');
    }
    for (const item of gradedItems) {
      assert.equal(item.graded, true, fileName + ': graded flag true');
      assert.equal(item.type, 'graded', fileName + ': graded type');
      assert.equal(item.source.rowClass, 'graded', fileName + ': graded rowClass');
      assert.equal(item.questionCount !== null, true, fileName + ': graded items have question counts');
    }
    for (const item of allItems(course).filter((i) => !isGradedRow(i))) {
      assert.equal(item.graded, false, fileName + ': non-graded rows have graded=false');
    }
  }
});

test('warnings preserve source conditions and stay in the canonical vocabulary', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const items = allItems(load(fileName));
    const tally = countBy(items.reduce((list, i) => list.concat(i.warnings), []), (w) => w);
    assert.deepEqual(tally, expected.warnings, fileName + ': warning tally');
    for (const item of items) {
      assert.deepEqual(item.warnings, extractor.WARNING_ORDER.filter((w) => item.warnings.includes(w)),
        fileName + ': warnings in canonical order for "' + item.sourceId + '"');
      const details = item.source.details;
      if (item.warnings.includes('hindi_link_unavailable')) {
        assert.ok(/hindi link unavailable/i.test(details),
          fileName + ': hindi warning traceable to source for "' + item.sourceId + '"');
      }
      if (item.warnings.includes('duration_unavailable')) {
        assert.ok(/unavailable/i.test(details),
          fileName + ': duration warning traceable to source for "' + item.sourceId + '"');
      }
      if (item.warnings.includes('question_count_unavailable')) {
        assert.ok(/question count unavailable/i.test(details),
          fileName + ': question-count warning traceable to source for "' + item.sourceId + '"');
      }
      if (item.warnings.includes('open_failed')) {
        assert.ok(/open failed/i.test(details),
          fileName + ': open-failed warning traceable to source for "' + item.sourceId + '"');
      }
      if (item.warnings.includes('open_link_missing')) {
        assert.ok(!item.links.some((l) => l.type === 'seek'),
          fileName + ': open-link warning matches missing seek link for "' + item.sourceId + '"');
      }
    }
    for (const item of items.filter(isVideoItem)) {
      assert.equal(item.warnings.includes('duration_unavailable'), item.duration === null,
        fileName + ': duration warning matches null duration for "' + item.sourceId + '"');
    }
  }
});

test('links are preserved and entity-decoded', () => {
  for (const fileName of FILE_NAMES) {
    const expected = EXPECTED[fileName];
    const items = allItems(load(fileName));
    const tally = {};
    for (const item of items) {
      assert.ok(Array.isArray(item.links), fileName + ': links array for "' + item.sourceId + '"');
      for (const link of item.links) {
        assert.ok(['hindi', 'english', 'seek'].includes(link.type),
          fileName + ': link type "' + link.type + '"');
        assert.ok(typeof link.url === 'string' && link.url.length > 0,
          fileName + ': link url present for "' + item.sourceId + '"');
        assert.ok(link.url.startsWith('https://'),
          fileName + ': link url is https for "' + item.sourceId + '"');
        assert.ok(!link.url.includes('&amp;'),
          fileName + ': link url entity-decoded for "' + item.sourceId + '"');
        tally[link.type] = (tally[link.type] || 0) + 1;
      }
    }
    assert.deepEqual(tally, expected.links, fileName + ': link tally');
    const withoutSeek = items
      .filter((i) => !i.links.some((l) => l.type === 'seek'))
      .map((i) => i.sourceId);
    assert.deepEqual(withoutSeek, expected.itemsWithoutSeek, fileName + ': items without seek links');
  }
});

test('type vocabulary and per-course type counts', () => {
  for (const fileName of FILE_NAMES) {
    const items = allItems(load(fileName));
    for (const item of items) {
      assert.ok(extractor.TYPE_VOCABULARY.includes(item.type),
        fileName + ': type "' + item.type + '" in vocabulary');
    }
    const tally = countBy(items, (i) => i.type);
    assert.deepEqual(tally, EXPECTED[fileName].typeCounts, fileName + ': type counts');
  }
});

test('no data was invented: every item is traceable to its source row', () => {
  for (const fileName of FILE_NAMES) {
    const course = load(fileName);
    for (const week of course.weeks) {
      for (const item of week.items) {
        for (const key of ['sourceId', 'type', 'title', 'weekNumber', 'duration',
          'durationSeconds', 'questionCount', 'graded', 'links', 'warnings', 'source']) {
          assert.ok(Object.prototype.hasOwnProperty.call(item, key),
            fileName + ': item "' + item.sourceId + '" has key ' + key);
        }
        if (/^(L\d+\.\d+|AQ\d+\.\d+|Lecture \d+)$/.test(item.sourceId)) {
          assert.ok(item.title.startsWith(item.sourceId),
            fileName + ': title preserves source display text for "' + item.sourceId + '"');
        } else {
          assert.equal(item.title, item.sourceId,
            fileName + ': non-prefixed source label used as both id and title');
        }
        assert.ok(extractor.ROW_CLASSES.includes(item.source.rowClass),
          fileName + ': rowClass "' + item.source.rowClass + '"');
        assert.ok(typeof item.source.details === 'string' && item.source.details.length > 0,
          fileName + ': source details preserved for "' + item.sourceId + '"');
        assert.equal(typeof item.graded, 'boolean', fileName + ': graded is boolean');
      }
      const rowNumbers = week.items.map((i) => i.source.rowNumber);
      if (EXPECTED[fileName].rowNumberSequences) {
        assert.deepEqual(rowNumbers, EXPECTED[fileName].rowNumberSequences[week.weekNumber - 1],
          fileName + ' week ' + week.weekNumber + ': quirky source numbering preserved exactly');
      } else {
        rowNumbers.forEach((n, idx) => {
          assert.equal(n, idx + 1,
            fileName + ' week ' + week.weekNumber + ': source row numbers are contiguous from 1');
        });
      }
    }
  }
});

test('extraction is deterministic: repeat runs match each other and the committed files', () => {
  const runA = extractor.extractAll(extractor.DEFAULT_REF_DIR);
  const runB = extractor.extractAll(extractor.DEFAULT_REF_DIR);
  assert.equal(runA.length, 4, 'four courses extracted');
  for (let i = 0; i < runA.length; i++) {
    assert.equal(runA[i].fileName, runB[i].fileName, 'stable output file order');
    const a = extractor.serializeCourse(runA[i].course);
    const b = extractor.serializeCourse(runB[i].course);
    assert.equal(a, b, runA[i].fileName + ': two extraction runs produced different output');
    const onDisk = fs.readFileSync(path.join(SYLLABUS_DIR, runA[i].fileName), 'utf8');
    assert.equal(a, onDisk, runA[i].fileName + ': committed file differs from regenerated output');
  }
});

// ---------------------------------------------------------------------------
// Helper / classifier unit tests (rules documented in tools/extract-syllabus.js)
// ---------------------------------------------------------------------------

test('duration helper: strict conversion only, never estimation', () => {
  assert.deepEqual(extractor.strictDuration('20:49'), { duration: '20:49', durationSeconds: 1249 });
  assert.deepEqual(extractor.strictDuration('8:27'), { duration: '8:27', durationSeconds: 507 });
  assert.deepEqual(extractor.strictDuration('1:02:33'), { duration: '1:02:33', durationSeconds: 3753 });
  assert.deepEqual(extractor.strictDuration('not a duration'), { duration: null, durationSeconds: null });
  assert.deepEqual(extractor.strictDuration('⚠ Hindi link unavailable'), { duration: null, durationSeconds: null });
  assert.deepEqual(extractor.strictDuration(''), { duration: null, durationSeconds: null });
});

test('question count helper: singular and plural only, never inference', () => {
  assert.equal(extractor.questionCountFromText('5 Questions'), 5);
  assert.equal(extractor.questionCountFromText('1 Question'), 1);
  assert.equal(extractor.questionCountFromText('10 Questions · ✓ Submitted'), 10);
  assert.equal(extractor.questionCountFromText('⚠ Question count unavailable'), null);
  assert.equal(extractor.questionCountFromText('20:49'), null);
  assert.equal(extractor.questionCountFromText(''), null);
});

test('classifier rules: source-true type and identity mapping', () => {
  assert.equal(extractor.classifyRow('video', 'L1.1: Natural Numbers and their operations').type, 'lecture');
  assert.equal(extractor.classifyRow('video', 'L1.1: Natural Numbers and their operations').sourceId, 'L1.1');
  assert.equal(extractor.classifyRow('video', 'Lecture 3:Speech Sounds in English').sourceId, 'Lecture 3');
  assert.equal(extractor.classifyRow('video', 'L3.4: Solution of quadratic equation using graph').type, 'lecture');
  assert.equal(extractor.classifyRow('video warn', 'Week 02 - Additional Lecture 01').type, 'lecture');
  assert.equal(extractor.classifyRow('video warn', 'Week 1 Tutorial for Lecture 2').type, 'tutorial');
  assert.equal(extractor.classifyRow('video warn', 'Practice Assignment - 1 Solution').type, 'solution');
  assert.equal(extractor.classifyRow('video warn', 'Week 04 - Summary').type, 'summary');
  assert.equal(extractor.classifyRow('video warn', 'Course Overview').type, 'orientation');
  assert.equal(extractor.classifyRow('video warn', 'Week 03 - Surface of Revolution').type, 'other');
  assert.equal(extractor.classifyRow('video warn', 'Instructions related to Bonus Practice Assignment').type, 'other');
  assert.equal(extractor.classifyRow('assign', 'AQ2.3: Activity Question 3 - Not graded').type, 'activity');
  assert.equal(extractor.classifyRow('assign', 'AQ2.3: Activity Question 3 - Not graded').sourceId, 'AQ2.3');
  assert.equal(extractor.classifyRow('assign', 'Week 1 Practice Assignment - 1').type, 'practice');
  assert.equal(extractor.classifyRow('assign', 'Practice Assignment (Extra Practice)').type, 'practice');
  assert.equal(extractor.classifyRow('assign', 'Week 1 Extra Questions').type, 'extra');
  assert.equal(extractor.classifyRow('assign warn', 'Programming').type, 'other');
  assert.equal(extractor.classifyRow('graded', 'Grading Assignment - 1').type, 'graded');
  assert.equal(extractor.classifyRow('graded', 'Grading Assignment - 1').graded, true);
  assert.equal(extractor.classifyRow('graded', 'Week 1 - Graded Assignment 1').graded, true);
});








