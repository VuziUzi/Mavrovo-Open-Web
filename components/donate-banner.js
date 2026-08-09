(function() {
  'use strict';

  var DONATE_URL = 'https://whydonate.com/fundraising/mavrovo-open-help-us-give-6-children-a-better-place-to-learn-in-vmavrovo';

  var DEFAULTS = {
    icon: '💚',
    message: 'Поддржи ја реконструкцијата на училишното игралиште во Маврово',
    sub: 'Секоја донација, колку и да е мала, нè доближува до целта.',
    button: 'Донирај',
    url: DONATE_URL
  };

  /**
   * Slim donation banner injected directly above the page footer.
   *
   * Included on every page via a single script tag, so the wording and the
   * fundraiser link live in one place. Pages that should not show it can set
   * `data-no-donate-banner` on <body>; a page that already contains a
   * `.donate-banner` is left alone.
   */
  function buildBanner(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'donate-banner';
    wrap.innerHTML = ''
      + '<div class="donate-banner-inner">'
      +   '<div class="donate-banner-text">'
      +     '<span class="donate-banner-ico" aria-hidden="true">' + opts.icon + '</span>'
      +     '<span class="donate-banner-copy">'
      +       '<span class="donate-banner-msg">' + opts.message + '</span>'
      +       '<span class="donate-banner-sub">' + opts.sub + '</span>'
      +     '</span>'
      +   '</div>'
      +   '<a class="donate-banner-btn" href="' + opts.url + '" target="_blank" rel="noopener noreferrer">'
      +     opts.button + ' <span aria-hidden="true">&rarr;</span>'
      +   '</a>'
      + '</div>';
    return wrap;
  }

  function init() {
    if (document.body.hasAttribute('data-no-donate-banner')) return;
    if (document.querySelector('.donate-banner')) return;

    var opts = {};
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) opts[k] = DEFAULTS[k];
    }
    var custom = window.DONATE_BANNER || {};
    for (var c in custom) {
      if (Object.prototype.hasOwnProperty.call(custom, c)) opts[c] = custom[c];
    }

    var footer = document.querySelector('footer.footer') || document.querySelector('footer');
    var banner = buildBanner(opts);
    if (footer && footer.parentNode) footer.parentNode.insertBefore(banner, footer);
    else document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DONATE_URL = DONATE_URL;
})();
