/**
 * Deep links for tabs and sections.
 *
 * The URL hash is the source of truth: mo26.html#zdrepka-mazi opens that tab and
 * scrolls it into view, and clicking a tab rewrites the hash so the address bar is
 * always a shareable link. Pages without tabs still get offset-aware smooth
 * scrolling to any #section-id, so the fixed navbar never covers the heading.
 *
 * Pages with tabs register them once:
 *
 *   TabRouter.init({
 *     anchor: '.tabs',            // scrolled into view when a tab opens
 *     activate: showTab,          // fn(name) that switches the tab
 *     tabs: [{ hash: 'raspored', name: 'raspored', alt: ['schedule'] }, ...]
 *   });
 *
 * and call TabRouter.syncHash(name) from their own tab-switching function.
 */
(function (window, document) {
  'use strict';

  var GAP = 16;
  var instance = null;
  var suppress = false;

  function navOffset() {
    var nav = document.getElementById('navbar');
    return (nav ? nav.offsetHeight : 0) + GAP;
  }

  function scrollToEl(el, smooth) {
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.pageYOffset - navOffset();
    if (top < 0) top = 0;
    if (smooth === false || !('scrollBehavior' in document.documentElement.style)) {
      window.scrollTo(0, top);
    } else {
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  function readHash() {
    var h = (window.location.hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
    return h;
  }

  function writeHash(hash) {
    var next = '#' + hash;
    if (window.location.hash === next) return;
    suppress = true;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', next);
    } else {
      window.location.hash = next;
    }
    setTimeout(function () { suppress = false; }, 0);
  }

  function Router(config) {
    var self = this;
    this.activate = config.activate;
    this.anchor = config.anchor;
    this.byHash = {};
    this.hashByName = {};
    (config.tabs || []).forEach(function (tab) {
      self.byHash[tab.hash.toLowerCase()] = tab.name;
      self.hashByName[tab.name] = tab.hash;
      (tab.alt || []).forEach(function (alias) { self.byHash[alias.toLowerCase()] = tab.name; });
    });
  }

  Router.prototype.anchorEl = function () {
    return this.anchor ? document.querySelector(this.anchor) : null;
  };

  /** Switches to a tab. */
  Router.prototype.open = function (name) {
    this.activate(name);
  };

  /** Tab name for a hash, or null when the hash is a plain section id. */
  Router.prototype.tabFor = function (hash) {
    if (!hash) return null;
    return this.byHash[String(hash).toLowerCase()] || null;
  };

  /** Canonical hash for a tab, without the leading '#'. */
  Router.prototype.hashFor = function (name) {
    return this.hashByName[name] || null;
  };

  /** Opens whatever the current hash points at. */
  Router.prototype.applyHash = function (smooth) {
    var hash = readHash();
    if (!hash) return false;
    var name = this.tabFor(hash);
    if (name) {
      this.open(name);
      scrollToEl(this.anchorEl() || document.getElementById(hash), smooth);
      return true;
    }
    var el = document.getElementById(hash);
    if (el) { scrollToEl(el, smooth); return true; }
    return false;
  };

  function onHashChange() {
    if (suppress) return;
    applyCurrentHash(true);
  }

  /** Opens the current hash, with or without a registered tab set. */
  function applyCurrentHash(smooth) {
    if (instance) return instance.applyHash(smooth);
    var el = document.getElementById(readHash());
    if (!el) return false;
    scrollToEl(el, smooth);
    return true;
  }

  /* Images and fonts settle after DOMContentLoaded and move the target, so the
     landing scroll is repeated on load — unless the reader has taken over. */
  function repeatLandingScroll() {
    if (!readHash()) return;
    var taken = false;
    function claim() { taken = true; }
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
      window.addEventListener(ev, claim, { passive: true, once: true });
    });
    window.addEventListener('load', function () {
      if (!taken) applyCurrentHash(false);
    });
  }

  /** In-page links scroll smoothly and clear the navbar, tab links open the tab. */
  function wireInPageLinks() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var link = target.closest('a[href^="#"]');
      if (!link) return;
      // Links that already own their click (e.g. the registration modal) opt out.
      if (link.hasAttribute('data-open-register-modal') || link.hasAttribute('data-no-router')) return;

      var hash = link.getAttribute('href').slice(1);
      if (!hash) return;

      var name = instance ? instance.tabFor(hash) : null;
      var el = document.getElementById(hash);
      if (!name && !el) return;

      e.preventDefault();
      var menu = document.getElementById('mobileMenu');
      if (menu) menu.classList.remove('open');

      if (name) {
        instance.open(name);
        writeHash(instance.hashFor(name));
        scrollToEl(instance.anchorEl() || el, true);
      } else {
        writeHash(hash);
        scrollToEl(el, true);
      }
    });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  window.TabRouter = {
    init: function (config) {
      instance = new Router(config);
      onReady(function () { instance.applyHash(false); });
      return instance;
    },
    /** Called by a page's tab switcher so the address bar stays shareable. */
    syncHash: function (name) {
      if (!instance) return;
      var hash = instance.hashFor(name);
      if (hash) writeHash(hash);
    },
    /** Hash a page can read before its own first render. */
    hashName: function (fallback) {
      var hash = readHash();
      if (!hash) return fallback;
      var name = instance ? instance.tabFor(hash) : null;
      return name || fallback;
    },
    currentHash: readHash,
    scrollToEl: scrollToEl
  };

  window.addEventListener('hashchange', onHashChange);
  onReady(function () {
    wireInPageLinks();
    // Pages that never call init() still deep-link to their sections.
    if (!instance) applyCurrentHash(false);
  });
  repeatLandingScroll();
})(window, document);
