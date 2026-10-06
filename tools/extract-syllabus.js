#!/usr/bin/env node
'use strict';

/*
 * tools/extract-syllabus.js — Study-Planner Phase 1 (syllabus data foundation)
 *
 * Deterministic converter:
 *   reference/syllabus/*.html (IITM CourseXtract exports)
 *     ->
 *   data/syllabus/*.json (canonical syllabus layer)
 *
 * Node built-ins only. No dependencies. No network access. Read-only on reference files.
 *
 * ---------------------------------------------------------------------------
 * Canonical syllabus JSON — documented extension of data/syllabus/course-template.json
 * (core keys courseId / courseName / subjectId / weeks are preserved):
 *
 * {
 *   "schemaVersion": "1.0",
 *   "courseId":   "BSMA1001",               // from the source header (verified, never assumed)
 *   "courseName": "Mathematics I",          // from the source header
 *   "subjectId":  "mathematics-i",          // stable app-level subject id (matches data/progress/progress.json)
 *   "weekCount":  4,
 *   "source": {
 *     "type": "iitm-coursextract",
 *     "file": "reference/syllabus/<original source file name>",
 *     "generatedAt": "<timestamp printed by the source tool>",
 *     "status": "EXTRACTION COMPLETE",
 *     "summary": { "videos": 109, "assignments": 57, "graded": 4, "questions": 537, "videoDuration": "9h 10m" }
 *   },
 *   "weeks": [{
 *     "weekId": "mathematics-i-w1",
 *     "weekNumber": 1,
 *     "title": "Week 1",
 *     "source": { "status": "SUCCESS", "itemCount": 30 },
 *     "items": [{
 *       "sourceId": "L1.1",                 // source identity: short id when the source has one,
 *                                           // otherwise the full source label
 *       "type": "lecture",                  // lecture | tutorial | solution | extra | orientation |
 *                                           // summary | activity | practice | graded | other
 *       "title": "L1.1: Natural Numbers and their operations",  // exact source display text
 *       "weekNumber": 1,
 *       "duration": "20:49",                // raw source duration string, or null when absent
 *       "durationSeconds": 1249,            // faithful conversion of duration, or null
 *       "questionCount": null,              // source question count, or null when absent
 *       "graded": false,                    // true only for graded assignment rows
 *       "links": [ { "type": "hindi|english|seek", "url": "..." } ],
 *       "warnings": [],                     // subset of the documented warning vocabulary
 *       "source": { "rowNumber": 1, "rowClass": "video", "details": "20:49" }
 *     }]
 *   }]
 * }
 *
 * Rules enforced by this tool:
 * - No invention: missing durations / question counts stay null. No estimation, no zero-filling.
 * - Source identity preserved: L#.#, AQ#.#, Lecture N when present; otherwise the full source label.
 *   (weekNumber, sourceId) is unique within a course (some source labels repeat across weeks).
 * - Source order preserved everywhere (course weeks 1-4, rows in table order).
 * - Determinism: same reference input -> byte-identical output. No timestamps of "now", no randomness.
 * - Warning vocabulary (canonical order):
 *     duration_unavailable | hindi_link_unavailable | question_count_unavailable |
 *     open_failed | open_link_missing
 * - Warnings are recorded only from conditions actually present in the source
 *   (e.g. the details cell says "Hindi link unavailable" or "Duration unavailable"),
 *   never invented. A video row without a duration always carries "duration_unavailable".
 * - The extractor fails loudly (throws) if source structure and summary cards disagree,
 *   if a row/cell cannot be parsed, or if a details value matches no known source pattern.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REF_DIR = path.join(REPO_ROOT, 'reference', 'syllabus');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'data', 'syllabus');

// Source course code -> canonical output target. Order defines deterministic processing/output order.
const COURSE_TARGETS = {
  BSMA1001: { fileName: 'mathematics-i.json', subjectId: 'mathematics-i' },
  BSMA1002: { fileName: 'statistics.json', subjectId: 'statistics-i' },
  BSCS1001: { fileName: 'computational-thinking.json', subjectId: 'computational-thinking' },
  BSHS1001: { fileName: 'english.json', subjectId: 'english-i' }
};

const ROW_CLASSES = ['video', 'video warn', 'assign', 'assign warn', 'graded'];

const TYPE_VOCABULARY = [
  'lecture', 'tutorial', 'solution', 'extra', 'orientation',
  'summary', 'activity', 'practice', 'graded', 'other'
];

const WARNING_ORDER = [
  'duration_unavailable',
  'hindi_link_unavailable',
  'question_count_unavailable',
  'open_failed',
  'open_link_missing'
];

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(text) {
  return String(text).replace(/<[^>]*>/g, '');
}

// Source text cell -> display text (entities decoded, whitespace collapsed).
function cleanText(raw) {
  return decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
}

// Strict duration parse: "mm:ss" or "h:mm:ss" only. Anything else -> null.
// Never estimates: a value that is not literally a duration stays null.
function strictDuration(text) {
  let m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (m) return { duration: text, durationSeconds: (+m[1]) * 60 + (+m[2]) };
  m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text);
  if (m) return { duration: text, durationSeconds: (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) };
  return { duration: null, durationSeconds: null };
}

// Strict question count parse: "N Question" / "N Questions..." only. Anything else -> null.
function questionCountFromText(text) {
  const m = /^(\d+)\s+Questions?\b/i.exec(text);
  return m ? +m[1] : null;
}

// Canonical, deduplicated warning order.
function sortWarnings(list) {
  const unique = [...new Set(list)];
  unique.forEach((w) => {
    if (WARNING_ORDER.indexOf(w) === -1) throw new Error('Unknown warning id: ' + w);
  });
  return WARNING_ORDER.filter((w) => unique.indexOf(w) !== -1);
}

// ---------------------------------------------------------------------------
// Classification (deterministic, documented rules; preserves source truth)
//
// Video rows:
//   "L#.#: ..." / "Lecture N..."                  -> lecture
//   title contains "Tutorial"                     -> tutorial
//   title contains "Solution" (non L#.# rows)     -> solution
//   title contains "Extra"                        -> extra
//   "Course Overview"                             -> orientation
//   title contains "Additional Lecture"           -> lecture
//   "Week NN - Summary"                           -> summary
//   anything else                                 -> other
// Assign rows:
//   "AQ#.#: ..."                                  -> activity
//   title contains "Practice"                     -> practice
//   title contains "Extra"                        -> extra
//   anything else                                 -> other
// Graded rows                                     -> graded
// ---------------------------------------------------------------------------

function classifyRow(rowClass, title) {
  if (rowClass === 'graded') {
    return { type: 'graded', sourceId: title, graded: true };
  }
  if (rowClass === 'video' || rowClass === 'video warn') {
    let m = /^(L\d+\.\d+)\s*:/.exec(title);
    if (m) return { type: 'lecture', sourceId: m[1], graded: false };
    m = /^(Lecture\s+\d+)\s*:/.exec(title);
    if (m) return { type: 'lecture', sourceId: 'Lecture ' + /(\d+)/.exec(m[1])[1], graded: false };
    if (/tutorial/i.test(title)) return { type: 'tutorial', sourceId: title, graded: false };
    if (/solution/i.test(title)) return { type: 'solution', sourceId: title, graded: false };
    if (/extra/i.test(title)) return { type: 'extra', sourceId: title, graded: false };
    if (/^course overview$/i.test(title)) return { type: 'orientation', sourceId: title, graded: false };
    if (/additional lecture/i.test(title)) return { type: 'lecture', sourceId: title, graded: false };
    if (/^week\s+\d+\s*[-\u2013\u2014]\s*summary$/i.test(title)) {
      return { type: 'summary', sourceId: title, graded: false };
    }
    return { type: 'other', sourceId: title, graded: false };
  }
  // assign / assign warn
  let m = /^(AQ\d+\.\d+)\s*:/.exec(title);
  if (m) return { type: 'activity', sourceId: m[1], graded: false };
  if (/practice/i.test(title)) return { type: 'practice', sourceId: title, graded: false };
  if (/extra/i.test(title)) return { type: 'extra', sourceId: title, graded: false };
  return { type: 'other', sourceId: title, graded: false };
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

// Returns { item, detailsKnown } — detailsKnown is false when the details cell
// matches no known source pattern (caller fails loudly, never guesses).
function parseItemRow(rowHtml, rowClass, weekNumber) {
  const numMatch = /<td class=num>(\d+)/.exec(rowHtml);
  const contentMatch = /<td class=content>([\s\S]*?)<td class=details>/.exec(rowHtml);
  const detailsMatch = /<td class=details>([\s\S]*?)<td class=open>/.exec(rowHtml);
  const openMatch = /<td class=open>([\s\S]*)$/.exec(rowHtml);
  if (!numMatch || !contentMatch || !detailsMatch || !openMatch) {
    throw new Error('Unparseable table row (week ' + weekNumber + '): ' + rowHtml.slice(0, 160));
  }

  const contentHtml = contentMatch[1];
  const openHtml = openMatch[1];

  const titleMatch = /<span class=title>([\s\S]*?)<\/span>/.exec(contentHtml);
  if (!titleMatch) throw new Error('Row without title span (week ' + weekNumber + ')');
  const title = cleanText(titleMatch[1]);
  if (!title) throw new Error('Empty title (week ' + weekNumber + ')');

  const detailsRaw = cleanText(detailsMatch[1]);

  const langLinkMatch = /<a class=(hindi|lang)[^>]*href="?([^"\s>]+)"?/.exec(contentHtml);
  const seekMatch = /<a class=open[^>]*href="?([^"\s>]+)"?/.exec(openHtml);

  const warnings = [];
  let duration = null;
  let durationSeconds = null;
  let questionCount = null;
  let detailsKnown = false;

  const isVideoRow = rowClass === 'video' || rowClass === 'video warn';

  if (isVideoRow) {
    const parsed = strictDuration(detailsRaw);
    duration = parsed.duration;
    durationSeconds = parsed.durationSeconds;
    if (duration !== null) detailsKnown = true;
    if (/hindi link unavailable/i.test(detailsRaw)) {
      warnings.push('hindi_link_unavailable');
      detailsKnown = true;
    }
    if (/duration unavailable/i.test(detailsRaw)) {
      detailsKnown = true;
    }
    if (duration === null) warnings.push('duration_unavailable');
  } else {
    questionCount = questionCountFromText(detailsRaw);
    if (questionCount !== null) detailsKnown = true;
    if (/question count unavailable/i.test(detailsRaw)) {
      warnings.push('question_count_unavailable');
      detailsKnown = true;
    }
  }
  if (/open failed/i.test(detailsRaw)) {
    warnings.push('open_failed');
    detailsKnown = true;
  }
  if (!seekMatch) warnings.push('open_link_missing');

  const links = [];
  if (langLinkMatch) {
    links.push({
      type: langLinkMatch[1] === 'hindi' ? 'hindi' : 'english',
      url: decodeEntities(langLinkMatch[2])
    });
  }
  if (seekMatch) links.push({ type: 'seek', url: decodeEntities(seekMatch[1]) });

  const classified = classifyRow(rowClass, title);
  if (TYPE_VOCABULARY.indexOf(classified.type) === -1) {
    throw new Error('Unknown item type: ' + classified.type);
  }

  const item = {
    sourceId: classified.sourceId,
    type: classified.type,
    title: title,
    weekNumber: weekNumber,
    duration: duration,
    durationSeconds: durationSeconds,
    questionCount: questionCount,
    graded: classified.graded,
    links: links,
    warnings: sortWarnings(warnings),
    source: {
      rowNumber: +numMatch[1],
      rowClass: rowClass,
      details: detailsRaw
    }
  };
  return { item: item, detailsKnown: detailsKnown };
}

// ---------------------------------------------------------------------------
// Week + course parsing
// ---------------------------------------------------------------------------

function parseWeek(segmentHtml, weekNumber, subjectId) {
  const headMatch = /<h2>Week\s+(\d+)\s*<span class="wk-status \w+">(\w+)<\/span>\s*<span class=wk-count>(\d+) items<\/span>/.exec(segmentHtml);
  if (!headMatch) throw new Error('Week ' + weekNumber + ': unparseable week header');
  if (+headMatch[1] !== weekNumber) {
    throw new Error('Week header mismatch: expected ' + weekNumber + ', found ' + headMatch[1]);
  }
  const sourceStatus = headMatch[2];
  const sourceItemCount = +headMatch[3];

  const items = [];
  const unexpectedDetails = [];
  const rowRegex = /<tr class="?([^">]+)"?>([\s\S]*?)<\/tr>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(segmentHtml)) !== null) {
    const rowClass = rowMatch[1];
    if (ROW_CLASSES.indexOf(rowClass) === -1) {
      throw new Error('Week ' + weekNumber + ': unknown row class "' + rowClass + '"');
    }
    const parsed = parseItemRow(rowMatch[0], rowClass, weekNumber);
    items.push(parsed.item);
    if (!parsed.detailsKnown) {
      unexpectedDetails.push(
        'week ' + weekNumber + ' row ' + parsed.item.source.rowNumber +
        ' (' + rowClass + '): details "' + parsed.item.source.details + '" matches no known pattern'
      );
    }
  }

  if (items.length !== sourceItemCount) {
    throw new Error(
      'Week ' + weekNumber + ': parsed ' + items.length + ' rows but the source declares ' +
      sourceItemCount + ' items'
    );
  }

  // (weekNumber, sourceId) must be unique inside the week.
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.sourceId)) {
      throw new Error('Week ' + weekNumber + ': duplicate sourceId "' + item.sourceId + '" inside one week');
    }
    seen.add(item.sourceId);
  }

  const week = {
    weekId: subjectId + '-w' + weekNumber,
    weekNumber: weekNumber,
    title: 'Week ' + weekNumber,
    source: {
      status: sourceStatus,
      itemCount: sourceItemCount
    },
    items: items
  };
  return { week: week, unexpectedDetails: unexpectedDetails };
}

function parseCourse(html, fileName, courseId, target) {
  const h1Match = /<h1>([\s\S]*?)<\/h1>/.exec(html);
  if (!h1Match) throw new Error(fileName + ': no course title (<h1>) found');
  const courseName = cleanText(h1Match[1]);

  const codeMatch = /Course Code:\s*<b>([^<]+)<\/b>/.exec(html);
  if (!codeMatch) throw new Error(fileName + ': no course code found');
  if (codeMatch[1] !== courseId) {
    throw new Error(fileName + ': course code mismatch (expected ' + courseId + ', found ' + codeMatch[1] + ')');
  }

  const genMatch = /Generated\s+(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(html);
  if (!genMatch) throw new Error(fileName + ': no generated timestamp found');

  const statusMatch = /<span class="badge ok">([^<]+)<\/span>/.exec(html);
  if (!statusMatch) throw new Error(fileName + ': no extraction status badge found');

  const cardRegex = /<div class=card><b>([^<]+)<\/b><span>([^<]+)<\/span><\/div>/g;
  const cardLabels = {
    Videos: 'videos',
    Assignments: 'assignments',
    Graded: 'graded',
    Questions: 'questions',
    'Video Duration': 'videoDuration'
  };
  const summary = {};
  let cardMatch;
  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const key = cardLabels[cardMatch[2]];
    if (!key) throw new Error(fileName + ': unknown summary card label "' + cardMatch[2] + '"');
    summary[key] = key === 'videoDuration' ? cardMatch[1] : +cardMatch[1];
  }
  ['videos', 'assignments', 'graded', 'questions', 'videoDuration'].forEach((key) => {
    if (!(key in summary)) throw new Error(fileName + ': missing summary card "' + key + '"');
  });

  // Slice per-week segments (deterministic: document order).
  const weekStarts = [];
  const weekStartRegex = /<section class=week id=week-(\d+)>/g;
  let ws;
  while ((ws = weekStartRegex.exec(html)) !== null) {
    weekStarts.push({ weekNumber: +ws[1], contentStart: ws.index + ws[0].length, index: ws.index });
  }
  if (weekStarts.length !== 4) {
    throw new Error(fileName + ': expected 4 week sections, found ' + weekStarts.length);
  }

  const weeks = [];
  const allUnexpectedDetails = [];
  for (let i = 0; i < weekStarts.length; i++) {
    const start = weekStarts[i];
    const end = i + 1 < weekStarts.length ? weekStarts[i + 1].index : html.length;
    const segment = html.slice(start.contentStart, end);
    const parsedWeek = parseWeek(segment, start.weekNumber, target.subjectId);
    weeks.push(parsedWeek.week);
    allUnexpectedDetails.push(...parsedWeek.unexpectedDetails);
  }
  if (weeks.map((w) => w.weekNumber).join(',') !== '1,2,3,4') {
    throw new Error(fileName + ': week numbers are not 1,2,3,4 in order');
  }
  if (allUnexpectedDetails.length > 0) {
    throw new Error(fileName + ': unrecognized source details:\n  ' + allUnexpectedDetails.join('\n  '));
  }

  // Every class-carrying <tr> in the whole file must have been parsed inside a week.
  const totalClassRows = (html.match(/<tr class="?[^">]+"?>/g) || []).length;
  const parsedRows = weeks.reduce((n, w) => n + w.items.length, 0);
  if (totalClassRows !== parsedRows) {
    throw new Error(
      fileName + ': ' + totalClassRows + ' class-carrying <tr> rows in file but ' +
      parsedRows + ' parsed inside week sections'
    );
  }

  const items = weeks.reduce((list, w) => list.concat(w.items), []);
  const videos = items.filter((i) => i.source.rowClass.indexOf('video') === 0);
  const assignRows = items.filter((i) => i.source.rowClass.indexOf('assign') === 0);
  const gradedRows = items.filter((i) => i.source.rowClass === 'graded');

  // Hard checks: extraction must agree with the source's own summary cards.
  if (videos.length !== summary.videos) {
    throw new Error(fileName + ': extracted ' + videos.length + ' videos but summary card says ' + summary.videos);
  }
  if (assignRows.length + gradedRows.length !== summary.assignments) {
    throw new Error(
      fileName + ': extracted ' + (assignRows.length + gradedRows.length) +
      ' assignments (incl. graded) but summary card says ' + summary.assignments
    );
  }
  if (gradedRows.length !== summary.graded) {
    throw new Error(fileName + ': extracted ' + gradedRows.length + ' graded rows but summary card says ' + summary.graded);
  }

  // Anomalies (reported, not thrown — source data is never silently altered).
  const anomalies = [];
  const byId = new Map();
  for (const w of weeks) {
    for (const item of w.items) {
      if (!byId.has(item.sourceId)) byId.set(item.sourceId, []);
      byId.get(item.sourceId).push(w.weekNumber);
    }
  }
  byId.forEach((weekNumbers, sourceId) => {
    if (weekNumbers.length > 1) {
      anomalies.push(
        'cross-week duplicate sourceId "' + sourceId + '" in weeks ' + weekNumbers.join(', ') +
        ' (source label repeats; identity is week-scoped)'
      );
    }
  });

  const questionSum = items.reduce((n, i) => n + (i.questionCount !== null ? i.questionCount : 0), 0);
  if (questionSum !== summary.questions) {
    anomalies.push(
      'known question counts sum to ' + questionSum + ' but the source summary card says ' + summary.questions +
      ' (some rows have no counts; nothing was invented)'
    );
  }

  const gradedPerWeek = weeks.map((w) => w.items.filter((i) => i.source.rowClass === 'graded').length);
  if (gradedPerWeek.some((n) => n !== 1)) {
    anomalies.push('graded rows per week: ' + gradedPerWeek.join(', ') + ' (expected exactly 1 per week)');
  }

  const course = {
    schemaVersion: '1.0',
    courseId: courseId,
    courseName: courseName,
    subjectId: target.subjectId,
    weekCount: weeks.length,
    source: {
      type: 'iitm-coursextract',
      file: 'reference/syllabus/' + fileName,
      generatedAt: genMatch[1],
      status: statusMatch[1],
      summary: {
        videos: summary.videos,
        assignments: summary.assignments,
        graded: summary.graded,
        questions: summary.questions,
        videoDuration: summary.videoDuration
      }
    },
    weeks: weeks
  };
  return { course: course, anomalies: anomalies };
}

// ---------------------------------------------------------------------------
// Extraction, serialization, writing
// ---------------------------------------------------------------------------

function extractCourseCode(html) {
  const m = /Course Code:\s*<b>([^<]+)<\/b>/.exec(html);
  return m ? m[1] : null;
}

// Reads every *.html in refDir, maps by verified course code, returns
// [{ fileName, course, anomalies }] in COURSE_TARGETS declaration order.
function extractAll(refDir) {
  refDir = refDir || DEFAULT_REF_DIR;
  if (!fs.existsSync(refDir)) throw new Error('Reference directory not found: ' + refDir);

  const files = fs.readdirSync(refDir).filter((f) => /\.html$/i.test(f)).sort();
  const parsed = new Map();

  for (const file of files) {
    const html = fs.readFileSync(path.join(refDir, file), 'utf8');
    const code = extractCourseCode(html);
    if (!code || !COURSE_TARGETS[code]) {
      throw new Error('Unmapped course code "' + (code || '(none)') + '" in ' + file);
    }
    if (parsed.has(code)) throw new Error('Duplicate source for course ' + code + ' in ' + file);
    const target = COURSE_TARGETS[code];
    const result = parseCourse(html, file, code, target);
    parsed.set(code, { fileName: target.fileName, course: result.course, anomalies: result.anomalies });
  }

  const missing = Object.keys(COURSE_TARGETS).filter((c) => !parsed.has(c));
  if (missing.length) throw new Error('No source file found for course(s): ' + missing.join(', '));

  return Object.keys(COURSE_TARGETS).map((code) => parsed.get(code));
}

// Deterministic serialization: fixed key order (object construction order),
// 2-space indent, trailing newline, UTF-8 preserved.
function serializeCourse(course) {
  return JSON.stringify(course, null, 2) + '\n';
}

function writeCourses(outDir, results) {
  fs.mkdirSync(outDir, { recursive: true });
  return results.map((r) => {
    const p = path.join(outDir, r.fileName);
    fs.writeFileSync(p, serializeCourse(r.course), 'utf8');
    return p;
  });
}

// ---------------------------------------------------------------------------
// Console report + CLI
// ---------------------------------------------------------------------------

function summarizeCourse(course) {
  const items = course.weeks.reduce((list, w) => list.concat(w.items), []);
  const videos = items.filter((i) => i.source.rowClass.indexOf('video') === 0);
  const assignRows = items.filter((i) => i.source.rowClass.indexOf('assign') === 0);
  const gradedRows = items.filter((i) => i.source.rowClass === 'graded');
  const types = {};
  const warnings = {};
  let durationsKnown = 0;
  let questionSum = 0;
  for (const item of items) {
    types[item.type] = (types[item.type] || 0) + 1;
    for (const w of item.warnings) warnings[w] = (warnings[w] || 0) + 1;
    if (item.durationSeconds !== null) durationsKnown += 1;
    if (item.questionCount !== null) questionSum += item.questionCount;
  }
  return { items, videos, assignRows, gradedRows, durationsKnown, questionSum, types, warnings };
}

function formatCounts(counts) {
  return Object.keys(counts).sort().map((k) => k + ' ' + counts[k]).join(' | ');
}

function printReport(results) {
  console.log('Study-Planner syllabus extraction (Phase 1, deterministic)');
  console.log('');
  for (const r of results) {
    const s = summarizeCourse(r.course);
    console.log('--- ' + r.fileName + ' - ' + r.course.courseName + ' (' + r.course.courseId + ')');
    console.log('    weeks: ' + r.course.weekCount + ' (items per week: ' +
      r.course.weeks.map((w) => w.items.length).join(', ') + ')');
    console.log('    items: ' + s.items.length + ' | videos: ' + s.videos.length +
      ' (' + s.durationsKnown + ' with duration, ' + (s.videos.length - s.durationsKnown) + ' without)');
    console.log('    assignments: ' + (s.assignRows.length + s.gradedRows.length) +
      ' (' + s.assignRows.length + ' non-graded + ' + s.gradedRows.length + ' graded)');
    console.log('    known question counts: ' + s.questionSum + ' | source card: ' + r.course.source.summary.questions);
    console.log('    types: ' + formatCounts(s.types));
    console.log('    warnings: ' + (Object.keys(s.warnings).length ? formatCounts(s.warnings) : 'none'));
    for (const a of r.anomalies) console.log('    ~ ' + a);
    console.log('');
  }
}

function main(argv) {
  const outArg = argv && argv[2] ? argv[2] : null;
  const outDir = outArg ? path.resolve(outArg) : DEFAULT_OUT_DIR;
  const results = extractAll(DEFAULT_REF_DIR);
  printReport(results);
  const written = writeCourses(outDir, results);
  console.log('Wrote ' + written.length + ' files:');
  for (const p of written) console.log('  ' + path.relative(REPO_ROOT, p).replace(/\\/g, '/'));
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (err) {
    console.error('Syllabus extraction FAILED: ' + err.message);
    process.exitCode = 1;
  }
}

module.exports = {
  COURSE_TARGETS: COURSE_TARGETS,
  ROW_CLASSES: ROW_CLASSES,
  TYPE_VOCABULARY: TYPE_VOCABULARY,
  WARNING_ORDER: WARNING_ORDER,
  DEFAULT_REF_DIR: DEFAULT_REF_DIR,
  DEFAULT_OUT_DIR: DEFAULT_OUT_DIR,
  decodeEntities: decodeEntities,
  cleanText: cleanText,
  strictDuration: strictDuration,
  questionCountFromText: questionCountFromText,
  classifyRow: classifyRow,
  parseItemRow: parseItemRow,
  parseWeek: parseWeek,
  parseCourse: parseCourse,
  extractCourseCode: extractCourseCode,
  extractAll: extractAll,
  serializeCourse: serializeCourse,
  writeCourses: writeCourses,
  summarizeCourse: summarizeCourse
};






