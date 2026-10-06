#!/usr/bin/env node
'use strict';

/*
 * tools/generate-plans.js — Study-Planner Phase 3 plan materialization.
 *
 * Runs the deterministic planner engine over the canonical syllabus and writes
 * one JSON document per day into data/schedule/daily/ (2026-10-02 .. 2026-10-29).
 *
 * Usage:
 *   node tools/generate-plans.js           regenerate + write all 28 plan files
 *   node tools/generate-plans.js --check   verify the files on disk match regeneration
 *
 * The output is deterministic: same syllabus + same config + same start date
 * always produce byte-identical files. No completion state is written (plan
 * is not state — completion lives in storage.js).
 */

const fs = require('fs');
const path = require('path');

const DE = require(path.resolve(__dirname, '..', 'src', 'js', 'data-engine.js'));
const PL = require(path.resolve(__dirname, '..', 'src', 'js', 'planner-engine.js'));

const REPO_ROOT = path.resolve(__dirname, '..');
const SYLLABUS_DIR = path.join(REPO_ROOT, 'data', 'syllabus');
const DAILY_DIR = path.join(REPO_ROOT, 'data', 'schedule', 'daily');
const CYCLE_START = '2026-10-02';

function buildAll() {
  const courses = DE.loadCoursesFromDirectory(SYLLABUS_DIR);
  return PL.buildDailyDocuments({ courses: courses, startDate: CYCLE_START });
}

function blockLoad(doc, subjectId) {
  let total = 0;
  for (const task of doc.tasks) {
    if (task.subjectId === subjectId) total += task.planning.estimatedMinutes;
  }
  return Math.round(total * 10) / 10;
}

function printSummary(documents) {
  console.log('Study-Planner plan generation (Phase 3, deterministic)');
  console.log('');
  for (const doc of documents) {
    const loads = ['mathematics-i', 'statistics-i', 'computational-thinking', 'english-i']
      .map((subjectId) => subjectId.split('-')[0] + ' ' + blockLoad(doc, subjectId))
      .join(' | ');
    console.log('  ' + doc.date + '  day ' + String(doc.dayNumber).padStart(2, '0') +
      '  week ' + doc.weekNumber + '  tasks ' + String(doc.tasks.length).padStart(2, '0') +
      '  [' + loads + ']');
  }
  console.log('');
}

function main(argv) {
  const checkOnly = argv.indexOf('--check') !== -1;
  const documents = buildAll();

  if (checkOnly) {
    let problems = 0;
    for (const doc of documents) {
      const target = path.join(DAILY_DIR, doc.date + '.json');
      if (!fs.existsSync(target)) {
        problems += 1;
        console.log('MISSING  ' + doc.date);
        continue;
      }
      const onDisk = fs.readFileSync(target, 'utf8');
      if (onDisk !== PL.serializePlan(doc)) {
        problems += 1;
        console.log('DIFFERS  ' + doc.date);
      }
    }
    if (problems > 0) {
      console.error('Plan check FAILED: ' + problems + ' file(s) do not match regeneration.');
      process.exitCode = 1;
      return;
    }
    console.log('Plan check OK: all 28 files match deterministic regeneration.');
    return;
  }

  fs.mkdirSync(DAILY_DIR, { recursive: true });
  for (const doc of documents) {
    fs.writeFileSync(path.join(DAILY_DIR, doc.date + '.json'), PL.serializePlan(doc), 'utf8');
  }
  printSummary(documents);
  console.log('Wrote ' + documents.length + ' plan files to data/schedule/daily/');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error('Plan generation FAILED: ' + err.message);
    process.exitCode = 1;
  }
}

module.exports = { buildAll: buildAll, CYCLE_START: CYCLE_START };
