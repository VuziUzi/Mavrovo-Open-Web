/**
 * "Телеком × Маврово Опен" stream banner — the #stream section every page owns.
 *
 * Injected directly above the donation banner (so above the footer) on every page
 * that loads this script, which keeps the artwork and the wording in one place.
 * The section carries id="stream", so <page>.html#stream scrolls straight to it
 * and the "Гледај во Живо" nav button has somewhere to send people.
 *
 * The button on top of the artwork is wired by components/live-button.js: it
 * opens whatever stream link sits in the sheet, and stays disabled while there is
 * none — the section itself is always on the page either way.
 *
 * A page can override the artwork before this script runs:
 *   window.STREAM_BANNER = { wide: '...jpg', tall: '...jpg', alt: '...' };
 */
(function (window, document) {
  'use strict';

  var DEFAULTS = {
    wide: 'telekom-banner.jpg',
    tall: 'telekom-banner-mobile.jpg',
    alt: 'Телеком × Маврово Опен — следи ги натпреварите во живо, каде и да си',
    button: 'ГЛЕДАЈ ВО ЖИВО'
  };

  function options() {
    var opts = {};
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) opts[k] = DEFAULTS[k];
    }
    var custom = window.STREAM_BANNER || {};
    for (var c in custom) {
      if (Object.prototype.hasOwnProperty.call(custom, c)) opts[c] = custom[c];
    }
    return opts;
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function build(opts) {
    var section = document.createElement('section');
    section.className = 'stream-banner';
    section.id = 'stream';
    section.innerHTML = ''
      + '<div class="stream-banner-inner">'
      +   '<picture class="stream-banner-art">'
      +     '<source media="(max-width: 767px)" srcset="' + escapeHtml(opts.tall) + '">'
      +     '<img src="' + escapeHtml(opts.wide) + '" alt="' + escapeHtml(opts.alt) + '">'
      +   '</picture>'
      +   '<a class="stream-cta is-disabled" data-live-cta aria-disabled="true"'
      +     ' title="Преносот во живо сè уште не е достапен">'
      +     '<span class="stream-cta-dot" aria-hidden="true"></span>'
      +     escapeHtml(opts.button)
      +   '</a>'
      + '</div>';
    return section;
  }

  function place(section) {
    // Above the donation strip when it is already there, above the footer otherwise
    // (the donation banner then inserts itself between this section and the footer).
    var donate = document.querySelector('.donate-banner');
    if (donate && donate.parentNode) {
      donate.parentNode.insertBefore(section, donate);
      return;
    }
    var footer = document.querySelector('footer.footer') || document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(section, footer);
    else document.body.appendChild(section);
  }

  function init() {
    if (document.getElementById('stream')) return;

    var opts = options();
    var section = build(opts);
    place(section);

    // Let the live button pick up the freshly injected CTA.
    if (window.MavrovoLive) window.MavrovoLive.apply();

    // The hash was already handled before this section existed.
    if ((window.location.hash || '') === '#stream' && window.TabRouter) {
      window.TabRouter.scrollToEl(section, false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
