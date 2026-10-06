/**
 * src/components/calendar/calendar-wheel.js — Study-Planner U2.1
 *
 * The reference date-wheel INTERACTION model, connected to the existing app.
 * Ported from reference/Reference-Calendar-Project/script.js:
 *   - centre the selected date in the viewport (translate3d, clamped)
 *   - distance-based edge / near opacity fade
 *   - mouse-wheel + trackpad day-by-day movement (throttled)
 *   - pointer drag / swipe
 *   - ArrowLeft / ArrowRight keyboard movement
 *
 * Differences from the reference (adaptation to the real application):
 *   - the demo's hardcoded month/day constants are replaced by the existing
 *     selected-date state and the canonical calendar access layer
 *   - movement is delegated back to the app through injected callbacks, so the
 *     app remains the only owner of the selected date
 *
 * This module holds NO date data of its own: it only measures and animates.
 *
 * Environment: browser global (globalThis.StudyPlanner.CalendarWheel) or CommonJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.CalendarWheel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Reference thresholds (style.css/.week-day opacity rules + script.js).
  var NEAR_DISTANCE = 110;
  var EDGE_DISTANCE = 220;
  var DRAG_THRESHOLD = 35;
  var WHEEL_LOCK_MS = 240;

  // Pure geometry helper, exported so it can be unit tested without a DOM.
  function centerTransform(itemCenter, itemWidth, trackWidth, viewportWidth) {
    var min = -(trackWidth - viewportWidth);
    var max = 0;
    var target = viewportWidth / 2 - (itemCenter + itemWidth / 2);
    return Math.min(max, Math.max(min, target));
  }

  function opacityClassFor(distance) {
    if (distance > EDGE_DISTANCE) return 'edge';
    if (distance > NEAR_DISTANCE) return 'near';
    return '';
  }

  function createController(options) {
    var opts = options || {};
    var rootElement = opts.rootElement || null;
    var selectedDate = opts.selectedDate || null;
    // Injected app callbacks: this controller never mutates app state directly.
    var onMove = typeof opts.onMove === 'function' ? opts.onMove : function () {};
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : function () {};

    var viewport = null;
    var track = null;
    var dragging = false;
    var dragStartX = null;
    var wheelLocked = false;
    var wheelTimer = null;
    var detachFns = [];

    function elements() {
      if (!rootElement || typeof rootElement.querySelector !== 'function') return null;
      viewport = rootElement.querySelector('#weekViewport');
      track = rootElement.querySelector('#weekTrack');
      if (!viewport || !track) return null;
      return { viewport: viewport, track: track };
    }

    // Apply the edge/near fade exactly as the reference does (rect-based).
    function updateOpacity() {
      if (!viewport || !track) return;
      var center = viewport.clientWidth / 2;
      var parentRect = viewport.getBoundingClientRect();
      Array.prototype.forEach.call(track.children, function (item) {
        var rect = item.getBoundingClientRect();
        var itemCenter = rect.left - parentRect.left + rect.width / 2;
        var distance = Math.abs(itemCenter - center);
        item.classList.toggle('edge', distance > EDGE_DISTANCE);
        item.classList.toggle('near', distance > NEAR_DISTANCE && distance <= EDGE_DISTANCE);
      });
    }

    // Centre the selected date; `animate` mirrors the reference transition.
    function centerSelected(animate) {
      if (!viewport || !track) return;
      var item = track.querySelector('[data-date="' + selectedDate + '"]');
      if (!item) return;
      var target = centerTransform(item.offsetLeft, item.offsetWidth,
        track.scrollWidth, viewport.clientWidth);
      track.style.transition = animate
        ? 'transform .46s cubic-bezier(.22,.75,.2,1)'
        : 'none';
      track.style.transform = 'translate3d(' + target + 'px,0,0)';
      updateOpacity();
    }

    function setSelected(date, animate) {
      selectedDate = date;
      centerSelected(animate !== false);
    }

    function moveBy(delta) {
      onMove(delta);
    }

    // ---- listeners --------------------------------------------------------

    function onWheel(event) {
      var card = rootElement.querySelector('#calendarCard');
      if (card && card.classList.contains('monthly')) return;
      event.preventDefault();
      if (wheelLocked) return;
      var direction = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? Math.sign(event.deltaX)
        : Math.sign(event.deltaY);
      if (!direction) return;
      wheelLocked = true;
      moveBy(direction);
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelLocked = false; }, WHEEL_LOCK_MS);
    }

    function onPointerDown(event) {
      dragging = true;
      dragStartX = event.clientX;
      viewport.classList.add('dragging');
      if (track) track.style.transition = 'none';
      // NOTE (U2.2): pointer capture is deliberately NOT taken here. Capturing
      // on pointerdown would retarget mouseup/click/dblclick to the viewport,
      // breaking click selection and the double-click -> Daily Tracker entry.
      // Capture happens in onPointerMove once the drag threshold is crossed.
    }

    function onPointerMove(event) {
      if (!dragging || dragStartX === null) return;
      var dx = event.clientX - dragStartX;
      if (Math.abs(dx) > DRAG_THRESHOLD) {
        // Real drag/swipe: capture now so the pointer keeps feeding us even
        // if it leaves the viewport (releasing on pointerup automatically).
        if (viewport.setPointerCapture && event.pointerId !== undefined) {
          try { viewport.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
        }
        var direction = dx < 0 ? 1 : -1;
        endDrag();
        moveBy(direction);
      }
    }

    function endDrag() {
      dragging = false;
      dragStartX = null;
      if (viewport) viewport.classList.remove('dragging');
    }

    function onClick(event) {
      var target = event.target.closest ? event.target.closest('[data-date]') : null;
      if (!target) return;
      var date = target.getAttribute('data-date');
      // Origin 'pointer' lets the app defer track centering for the duration
      // of a double-click window, so a second click still lands on the SAME
      // item (the app's double-click -> Daily Tracker entry requires it).
      if (date) onSelect(date, 'pointer');
    }

    function onKeyDownInWheel(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var target = event.target.closest ? event.target.closest('[data-date]') : null;
      if (!target) return;
      event.preventDefault();
      var date = target.getAttribute('data-date');
      if (date) onSelect(date);
    }

    function onWindowKeyDown(event) {
      var card = rootElement.querySelector('#calendarCard');
      if (card && card.classList.contains('monthly')) return;
      var tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowRight') { event.preventDefault(); moveBy(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveBy(-1); }
    }

    function onResize() {
      centerSelected(false);
    }

    // ---- lifecycle --------------------------------------------------------

    function attach() {
      detach();
      if (!elements()) return false;
      viewport.addEventListener('wheel', onWheel, { passive: false });
      viewport.addEventListener('pointerdown', onPointerDown);
      viewport.addEventListener('pointermove', onPointerMove);
      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);
      viewport.addEventListener('pointerleave', function () { if (dragging) endDrag(); });
      viewport.addEventListener('click', onClick);
      viewport.addEventListener('keydown', onKeyDownInWheel);
      detachFns.push(function () {
        viewport.removeEventListener('wheel', onWheel);
        viewport.removeEventListener('pointerdown', onPointerDown);
        viewport.removeEventListener('pointermove', onPointerMove);
        viewport.removeEventListener('pointerup', endDrag);
        viewport.removeEventListener('pointercancel', endDrag);
        viewport.removeEventListener('click', onClick);
        viewport.removeEventListener('keydown', onKeyDownInWheel);
      });
      return true;
    }

    function detach() {
      detachFns.forEach(function (fn) { fn(); });
      detachFns = [];
      if (wheelTimer) clearTimeout(wheelTimer);
    }

    function ensureGlobalListeners() {
      if (typeof window === 'undefined') return;
      if (window.__studyPlannerWheelKeyBound) return;
      window.__studyPlannerWheelKeyBound = true;
      window.addEventListener('keydown', function (event) {
        var card = document.querySelector('#calendarCard');
        if (!card || card.classList.contains('monthly')) return;
        var tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (event.key === 'ArrowRight') { event.preventDefault(); moveBy(1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); moveBy(-1); }
      });
      window.addEventListener('resize', onResize);
    }

    return {
      attach: attach,
      detach: detach,
      setSelected: setSelected,
      centerSelected: centerSelected,
      updateOpacity: updateOpacity,
      moveBy: moveBy,
      endDrag: endDrag,
      ensureGlobalListeners: ensureGlobalListeners,
      isDragging: function () { return dragging; }
    };
  }

  return {
    NEAR_DISTANCE: NEAR_DISTANCE,
    EDGE_DISTANCE: EDGE_DISTANCE,
    DRAG_THRESHOLD: DRAG_THRESHOLD,
    WHEEL_LOCK_MS: WHEEL_LOCK_MS,
    centerTransform: centerTransform,
    opacityClassFor: opacityClassFor,
    createController: createController
  };
});
