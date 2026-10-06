/**
 * src/js/renderer.js — Study-Planner Phase 4 (DOM utilities)
 *
 * Small, dependency-free DOM helpers shared by the view components. No
 * business logic, no planner/progress knowledge: components build HTML string
 * view models and the app mounts them here.
 *
 * Environment: browser global (globalThis.StudyPlanner.Renderer) or CommonJS.
 * The module never touches the DOM at load time, so it is safe to require in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = root.StudyPlanner || {};
    root.StudyPlanner.Renderer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (character) { return ESCAPES[character]; });
  }

  function setHtml(element, html) {
    if (element) element.innerHTML = html;
  }

  function setText(element, text) {
    if (element) element.textContent = text;
  }

  function toggleHidden(element, hidden) {
    if (!element) return;
    if (hidden) element.setAttribute('hidden', '');
    else element.removeAttribute('hidden');
  }

  // One delegated listener per container + event type (no duplicate handlers
  // across re-renders, because the container element itself is stable).
  // Returns an unsubscribe function.
  function delegate(rootElement, eventType, selector, handler, options) {
    if (!rootElement || typeof rootElement.addEventListener !== 'function') {
      return function () {};
    }
    var listener = function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      var match = target.closest(selector);
      if (!match) return;
      if (rootElement.contains && !rootElement.contains(match)) return;
      handler(event, match);
    };
    rootElement.addEventListener(eventType, listener, options);
    return function () { rootElement.removeEventListener(eventType, listener, options); };
  }

  return {
    escapeHtml: escapeHtml,
    setHtml: setHtml,
    setText: setText,
    toggleHidden: toggleHidden,
    delegate: delegate
  };
});
