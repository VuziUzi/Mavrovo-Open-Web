/**
 * "Гледај во Живо" — the stream link, read once and applied to every button.
 *
 * The destination lives in cell A1 of the "Live" sheet tab, so the organisers can
 * swap or retire the stream without a deploy. While A1 is empty every button stays
 * in place but disabled; as soon as a link appears there they all wake up.
 *
 * Two kinds of button share that state:
 *
 *   [data-live-link]  the nav / mobile-menu entries — they scroll down to the
 *                     #stream banner rather than leaving the page. If the banner
 *                     is not on the page (its artwork failed to load), they fall
 *                     back to opening the stream directly.
 *   [data-live-cta]   the button on the #stream banner itself — opens the stream
 *                     in a new tab.
 *
 * components/stream-banner.js injects its CTA after this script has run, so it
 * calls MavrovoLive.apply() to have the current state applied to it.
 */
(function (window, document) {
  'use strict';

  var SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  var GID = '1438092409';
  var TIMEOUT = 10000;

  var streamUrl = '';

  function navButtons() { return document.querySelectorAll('[data-live-link]'); }
  function ctaButtons() { return document.querySelectorAll('[data-live-cta]'); }

  function enable(el, href, newTab) {
    el.href = href;
    if (newTab) {
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    } else {
      el.removeAttribute('target');
      el.removeAttribute('rel');
    }
    el.classList.remove('is-disabled');
    el.removeAttribute('aria-disabled');
    el.title = newTab ? 'Гледај го преносот во живо' : 'Оди до преносот во живо';
  }

  /** Applies the known stream state to every button currently in the page. */
  function apply() {
    if (!streamUrl) return;

    Array.prototype.forEach.call(navButtons(), function (el) {
      enable(el, '#stream', false);
      if (el.dataset.liveWired) return;
      el.dataset.liveWired = '1';
      // Without the banner on the page there is nothing to scroll to.
      el.addEventListener('click', function (e) {
        if (document.getElementById('stream')) return;
        e.preventDefault();
        window.open(streamUrl, '_blank', 'noopener');
      });
    });

    Array.prototype.forEach.call(ctaButtons(), function (el) {
      enable(el, streamUrl, true);
    });
  }

  /** A1 holds the stream link; anything that is not a URL counts as "no stream". */
  function readA1(data) {
    try {
      var v = data.table.rows[0].c[0].v;
      return /^https?:\/\//i.test(String(v).trim()) ? String(v).trim() : '';
    } catch (e) {
      return '';
    }
  }

  /** nav.html can be injected after load, so wait for the buttons to appear. */
  function load(attempt) {
    if (!navButtons().length) {
      if ((attempt || 0) < 10) setTimeout(function () { load((attempt || 0) + 1); }, 200);
      return;
    }

    var uid = 'liveLinkCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var scriptId = 'live-link-jsonp-' + uid;
    var settled = false;

    function cleanup() {
      var s = document.getElementById(scriptId);
      if (s && s.parentNode) s.parentNode.removeChild(s);
      // A late response must not throw: swap in a no-op before deleting.
      window[uid] = function () {};
      setTimeout(function () {
        try { delete window[uid]; } catch (e) { window[uid] = undefined; }
      }, TIMEOUT * 3);
    }

    window[uid] = function (data) {
      settled = true;
      cleanup();
      streamUrl = readA1(data);
      apply();
    };

    // No 'select A' here: on an empty sheet that column does not exist yet and the
    // query comes back as an error instead of an empty table.
    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID)
      + '/gviz/tq?gid=' + encodeURIComponent(GID)
      + '&headers=0'
      + '&tqx=' + encodeURIComponent('out:json;responseHandler:' + uid)
      + '&cacheBust=' + Date.now();

    var script = document.createElement('script');
    script.id = scriptId;
    script.src = url;
    script.async = true;
    // On any failure the buttons simply stay disabled.
    script.onerror = function () { if (!settled) { settled = true; cleanup(); } };
    document.body.appendChild(script);

    setTimeout(function () { if (!settled) { settled = true; cleanup(); } }, TIMEOUT);
  }

  window.MavrovoLive = {
    apply: apply,
    url: function () { return streamUrl; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { load(); });
  } else {
    load();
  }
})(window, document);
