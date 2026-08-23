/**
 * "Гледај во Живо" — the nav button that points at whatever stream is running.
 *
 * The destination lives in cell A1 of the "Live" sheet tab, so the organisers can
 * swap or retire the stream without a deploy. While A1 is empty the button stays
 * in the menu but disabled; as soon as a link appears there every button on the
 * page turns into a real link that opens in a new tab.
 *
 * Markup a page provides (desktop nav and mobile menu alike):
 *
 *   <a class="nav-link nav-link-live is-disabled" data-live-link
 *      aria-disabled="true">…</a>
 */
(function (window, document) {
  'use strict';

  var SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  var GID = '1438092409';
  var TIMEOUT = 10000;

  function buttons() {
    return document.querySelectorAll('[data-live-link]');
  }

  function enable(url) {
    Array.prototype.forEach.call(buttons(), function (el) {
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.classList.remove('is-disabled');
      el.removeAttribute('aria-disabled');
      el.title = 'Гледај го преносот во живо';
    });
  }

  /** A1 holds the stream link; anything that is not a URL counts as "no stream". */
  function readA1(data) {
    try {
      var row = data.table.rows[0];
      var v = row.c[0].v;
      return /^https?:\/\//i.test(String(v).trim()) ? String(v).trim() : '';
    } catch (e) {
      return '';
    }
  }

  /** nav.html can be injected after load, so wait for the buttons to appear. */
  function load(attempt) {
    if (!buttons().length) {
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
      var url = readA1(data);
      if (url) enable(url);
    };

    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID)
      + '/gviz/tq?gid=' + encodeURIComponent(GID)
      + '&headers=0'
      + '&tq=' + encodeURIComponent('select A limit 1')
      + '&tqx=' + encodeURIComponent('out:json;responseHandler:' + uid)
      + '&cacheBust=' + Date.now();

    var script = document.createElement('script');
    script.id = scriptId;
    script.src = url;
    script.async = true;
    // On any failure the button simply stays disabled.
    script.onerror = function () { if (!settled) { settled = true; cleanup(); } };
    document.body.appendChild(script);

    setTimeout(function () { if (!settled) { settled = true; cleanup(); } }, TIMEOUT);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})(window, document);
