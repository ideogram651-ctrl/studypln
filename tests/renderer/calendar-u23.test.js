'use strict';
/* U2.3 — calendar finishing patch.
 *
 * Focused assertions for the two allowed changes:
 *   #1  Monthly card extends downward (min-height, Monthly only, >=721px)
 *   #2  ONE custom in-app modal replaces every native prompt/alert/confirm
 * Browser-driven verification (save/cancel/persistence/responsive) is
 * recorded in reports/update-u2.3-calendar-finishing-patch.md. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src', 'css', 'calendar-u21.css'), 'utf8');

test('U2.3-01: no browser-native prompt/alert/confirm remains in app.js', () => {
  assert.equal(/window\.(prompt|alert|confirm)\b/.test(appSrc), false,
    'window.prompt/alert/confirm must never be used');
  assert.equal(/\breadPromptText\b/.test(appSrc), false,
    'the prompt helper must be fully removed');
  assert.ok(appSrc.includes('openEntryModal'), 'one shared modal opener exists');
  assert.ok(appSrc.includes('closeEntryModal'), 'one shared modal closer exists');
});

test('U2.3-02: note and event flows share the same modal component', () => {
  const noteFn = appSrc.slice(appSrc.indexOf('function addNoteFor'), appSrc.indexOf('function addEventFor'));
  const eventFn = appSrc.slice(appSrc.indexOf('function addEventFor'), appSrc.indexOf('function removeCalendarEntry'));
  assert.ok(noteFn.includes("openEntryModal({") && noteFn.includes("kind: 'note'"),
    'addNoteFor opens the shared modal');
  assert.ok(eventFn.includes("openEntryModal({") && eventFn.includes("kind: 'event'"),
    'addEventFor opens the shared modal');
  // persistence mechanism untouched:
  assert.ok(noteFn.includes('calendarMetadata.addNote(date, text)'));
  assert.ok(eventFn.includes('calendarMetadata.addEvent(date, title, time ? { time: time } : undefined)'));
  assert.ok(noteFn.includes('renderCalendar()') && eventFn.includes('renderCalendar()'));
});

test('U2.3-03: modal is themed dark-violet glassmorphism, rounded, layered', () => {
  assert.match(css, /\.entry-modal-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.entry-modal-backdrop\s*\{[^}]*z-index:\s*(6[1-9]|[7-9][0-9]|\d{3,})/s,
    'modal layers above toast (60) and header (20)');
  assert.match(css, /\.entry-modal\s*\{[^}]*border-radius:\s*(2[0-9]|[3-9][0-9])px/s,
    'rounded corners (>=20px)');
  assert.match(css, /backdrop-filter:\s*blur\(/, 'glassmorphism blur present');
  assert.match(css, /\.entry-modal\s*\{[^}]*linear-gradient\(/s, 'violet gradient surface');
  // OK/Confirm = purple accent from the locked palette (#7755e8):
  assert.match(css, /\.entry-modal-confirm\s*\{[^}]*#7755e8/s);
  // Cancel = visually secondary:
  assert.match(css, /\.entry-modal-cancel\s*\{[^}]*rgba\(255,\s*255,\s*255,\s*\.07\)/s);
  // responsive <=460:
  assert.match(css, /@media \(max-width:\s*460px\)\s*\{[\s\S]*?\.entry-modal\s*\{/s);
});

test('U2.3-04: monthly card extends downward only; base/weekly untouched', () => {
  // Change #1: min-height on Monthly, scoped to >=721px:
  assert.match(css, /@media \(min-width:\s*721px\)\s*\{\s*\.calendar-card\.monthly\s*\{\s*min-height:\s*701px/s);
  // base card proportion, width, radius unchanged:
  assert.match(css, /\.calendar-card\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css, /\.calendar-card\s*\{[^}]*width:\s*min\(100%,\s*1040px\)/s);
  assert.match(css, /\.calendar-card\s*\{[^}]*border-radius:\s*var\(--u21-radius\)/s);
  // no height/width change for weekly:
  assert.equal(/\.calendar-card\.weekly\s*\{/.test(css), false,
    'weekly must not gain its own card rule');
  // monthly grid geometry rules untouched:
  assert.match(css, /\.month-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(7,\s*1fr\);\s*gap:\s*8px 5px;/);
  // mobile card heights untouched:
  assert.match(css, /@media \(max-width:\s*720px\)\s*\{[\s\S]*?height:\s*calc\(100vh - 105px\)/);
  assert.match(css, /\.calendar-card\s*\{\s*height:\s*calc\(100vh - 100px\);\s*\}/);
});
