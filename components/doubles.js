/**
 * "Двојки Про Турнир" — the doubles teams, read from the "PRO Doubles" sheet tab.
 *
 * Sheet layout (row 1 is a header, one row per team, shown in sheet order):
 *   A  Player 1        name
 *   B  Player 1 Info   free text; blank lines separate paragraphs
 *   C  Player 1 Image  Google Drive share link
 *   D  Player 2        name
 *   E  Player 2 Info   same
 *   F  Player 2 Image  same
 *
 * A card shows both players with their photo; opening it reveals the full
 * profiles side by side. Every team owns a URL hash built from both surnames
 * (#tim-jotovski-andonovski), so a single team can be linked to and promoted —
 * the modal opens straight away when the page is loaded on that hash.
 *
 *   new DoublesTeams({ containerId: 'mo26-doubles', sectionId: 'dvojki-pro' });
 */
(function (window, document) {
  'use strict';

  var DEFAULT_SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  var DEFAULT_GID = '268369060';
  var REQUEST_TIMEOUT = 10000;
  var CARD_IMG = 'w400';
  var MODAL_IMG = 'w900';

  var seq = 0;

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function cell(row, idx) {
    if (!row || !row.c || !row.c[idx]) return '';
    var c = row.c[idx];
    var v = (c.f != null && String(c.f).trim() !== '') ? c.f : c.v;
    return String(v == null ? '' : v).trim();
  }

  /** Drive share links only serve an <img> through their thumbnail endpoint. */
  function imageUrl(raw, size) {
    var url = String(raw || '').trim();
    if (!url) return '';
    var m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
         || url.match(/drive\.google\.com\/open\?id=([^&]+)/)
         || url.match(/[?&]id=([^&]+)/);
    if (m && m[1]) {
      return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=' + size;
    }
    return /^https?:\/\//i.test(url) ? url : '';
  }

  /** First sentences of a profile, cut at a word so a card stays two lines. */
  function excerpt(text, limit) {
    var flat = String(text || '').replace(/\s+/g, ' ').trim();
    if (!flat) return '';
    if (flat.length <= limit) return flat;
    var cut = flat.slice(0, limit);
    var space = cut.lastIndexOf(' ');
    if (space > limit * 0.6) cut = cut.slice(0, space);
    return cut.replace(/[\s,;:.-]+$/, '') + '…';
  }

  /** Blank lines in the sheet cell are the paragraph breaks. */
  function paragraphs(text) {
    return String(text || '').split(/\n\s*\n/)
      .map(function (p) { return p.replace(/\s*\n\s*/g, ' ').trim(); })
      .filter(function (p) { return p !== ''; });
  }

  var TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ѓ': 'gj', 'е': 'e', 'ж': 'zh',
    'з': 'z', 'ѕ': 'dz', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm',
    'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ќ': 'kj',
    'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'џ': 'dj', 'ш': 'sh'
  };

  /** Latin slug of a name, so the hash stays readable and typeable. */
  function slug(name) {
    var out = String(name || '').toLowerCase().split('').map(function (ch) {
      return Object.prototype.hasOwnProperty.call(TRANSLIT, ch) ? TRANSLIT[ch] : ch;
    }).join('');
    return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /** Surname carries the identity; a one-word name is used whole. */
  function surname(name) {
    var parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '');
  }

  function DoublesTeams(config) {
    config = config || {};
    this.container = document.getElementById(config.containerId);
    if (!this.container) return;

    this.sheetId = config.sheetId || DEFAULT_SHEET_ID;
    this.gid = config.gid || DEFAULT_GID;
    this.sectionId = config.sectionId || 'dvojki-pro';
    this.teams = [];
    this.openId = '';
    this.uid = 'doublesCb_' + (++seq) + '_' + Date.now();

    this._build();
    this._load();
  }

  DoublesTeams.prototype._build = function () {
    this.container.innerHTML =
      '<div class="dbl-state" data-state="loading">Се вчитуваат тимовите...</div>'
      + '<div class="dbl-list" hidden></div>';
    this.stateEl = this.container.querySelector('.dbl-state');
    this.listEl = this.container.querySelector('.dbl-list');

    var self = this;
    this.listEl.addEventListener('click', function (e) {
      // A click on a photo belongs to the lightbox, not to the card.
      if (e.target.closest && e.target.closest('[data-photo-zoom]')) return;
      var card = e.target.closest ? e.target.closest('.dbl-card') : null;
      if (card) self.open(card.getAttribute('data-team'));
    });
    // The card is a button to a screen reader, so it answers the keyboard too.
    this.listEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('.dbl-card') : null;
      if (!card) return;
      e.preventDefault();
      self.open(card.getAttribute('data-team'));
    });

    window.addEventListener('hashchange', function () { self._syncHash(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.openId) self.close();
    });
  };

  DoublesTeams.prototype._showState = function (kind, text) {
    this.stateEl.setAttribute('data-state', kind);
    this.stateEl.textContent = text;
    this.stateEl.hidden = false;
    this.listEl.hidden = true;
  };

  DoublesTeams.prototype._load = function () {
    var self = this;
    var uid = this.uid;
    var scriptId = 'dbl-jsonp-' + uid;
    var settled = false;

    function cleanup() {
      var s = document.getElementById(scriptId);
      if (s && s.parentNode) s.parentNode.removeChild(s);
      // A late response must not throw: swap in a no-op before deleting.
      window[uid] = function () {};
      setTimeout(function () {
        try { delete window[uid]; } catch (e) { window[uid] = undefined; }
      }, REQUEST_TIMEOUT * 3);
    }

    window[uid] = function (data) {
      settled = true;
      cleanup();
      self._receive(data);
    };

    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(this.sheetId)
      + '/gviz/tq?gid=' + encodeURIComponent(this.gid)
      + '&headers=1'
      + '&tqx=' + encodeURIComponent('out:json;responseHandler:' + uid)
      + '&cacheBust=' + Date.now();

    var script = document.createElement('script');
    script.id = scriptId;
    script.src = url;
    script.async = true;
    script.onerror = function () {
      if (settled) return;
      settled = true;
      cleanup();
      self._showState('error', 'Проблем со вчитување на тимовите. Обиди се повторно подоцна.');
    };
    document.body.appendChild(script);

    setTimeout(function () {
      if (settled) return;
      settled = true;
      cleanup();
      self._showState('error', 'Проблем со вчитување на тимовите. Обиди се повторно подоцна.');
    }, REQUEST_TIMEOUT);
  };

  DoublesTeams.prototype._receive = function (data) {
    if (!data || data.status === 'error' || !data.table) {
      this._showState('error', 'Проблем со вчитување на тимовите. Обиди се повторно подоцна.');
      return;
    }

    var used = {};
    this.teams = (data.table.rows || []).map(function (r) {
      return [
        { name: cell(r, 0), info: cell(r, 1), image: cell(r, 2) },
        { name: cell(r, 3), info: cell(r, 4), image: cell(r, 5) }
      ];
    }).filter(function (t) {
      return t[0].name !== '' || t[1].name !== '';
    }).map(function (players) {
      var id = 'tim-' + [slug(surname(players[0].name)), slug(surname(players[1].name))]
        .filter(function (s) { return s !== ''; }).join('-');
      // Two teams could slug the same; a suffix keeps every hash unique.
      if (used[id]) { used[id]++; id += '-' + used[id]; } else { used[id] = 1; }
      return { id: id, players: players };
    });

    if (!this.teams.length) {
      this._showState('empty', 'Тимовите за двојки ќе бидат објавени наскоро.');
      return;
    }

    this._render();
    this._syncHash();
  };

  DoublesTeams.prototype._render = function () {
    this.listEl.innerHTML = this.teams.map(cardHtml).join('');
    this.listEl.hidden = false;
    this.stateEl.hidden = true;
  };

  function photoHtml(player, size, cls) {
    var src = imageUrl(player.image, size);
    if (!src) {
      return '<div class="' + cls + ' is-empty" aria-hidden="true">'
        + escapeHtml(initials(player.name)) + '</div>';
    }
    // data-photo-zoom hands the click to the page's shared photo lightbox.
    return '<img class="' + cls + '" src="' + escapeHtml(src) + '"'
      + ' alt="' + escapeHtml(player.name) + '" loading="lazy" referrerpolicy="no-referrer"'
      + ' data-photo-zoom title="Кликни за поголема слика">';
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
  }

  function cardHtml(team, index) {
    var players = team.players.map(function (p) {
      var short = excerpt(p.info, 190);
      return '<div class="dbl-player">'
        + photoHtml(p, CARD_IMG, 'dbl-photo')
        + '<div class="dbl-player-text">'
        + '<div class="dbl-name">' + escapeHtml(p.name || 'Се очекува') + '</div>'
        + (short
            ? '<p class="dbl-excerpt">' + escapeHtml(short) + '</p>'
            : '<p class="dbl-excerpt is-empty">Биографијата ќе биде објавена наскоро.</p>')
        + '</div>'
        + '</div>';
    }).join('<div class="dbl-amp" aria-hidden="true">&amp;</div>');

    return '<article class="dbl-card" id="' + escapeHtml(team.id) + '"'
      + ' data-team="' + escapeHtml(team.id) + '" tabindex="0" role="button"'
      + ' aria-label="Отвори го тимот">'
      + '<div class="dbl-card-index">' + ('0' + (index + 1)).slice(-2) + '</div>'
      + '<div class="dbl-card-players">' + players + '</div>'
      + '<button type="button" class="dbl-more">Детали</button>'
      + '</article>';
  }

  function profileHtml(player) {
    var paras = paragraphs(player.info);
    return '<div class="dbl-profile">'
      + photoHtml(player, MODAL_IMG, 'dbl-profile-photo')
      + '<h4 class="dbl-profile-name">' + escapeHtml(player.name || 'Се очекува') + '</h4>'
      + (paras.length
          ? '<div class="dbl-profile-info">'
            + paras.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('')
            + '</div>'
          : '<p class="dbl-profile-info is-empty">Биографијата ќе биде објавена наскоро.</p>')
      + '</div>';
  }

  /* ---- modal --------------------------------------------------------- */

  DoublesTeams.prototype._modal = function () {
    if (this.modalEl) return this.modalEl;

    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'dbl-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="dbl-modal-box">'
      + '<button type="button" class="dbl-modal-close" aria-label="Затвори">&times;</button>'
      + '<div class="dbl-modal-head">'
      + '<div class="dbl-modal-tag">Двојки Про</div>'
      + '<h3 class="dbl-modal-title"></h3>'
      + '</div>'
      + '<div class="dbl-modal-body"></div>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('.dbl-modal-close')) self.close();
    });

    this.modalEl = overlay;
    return overlay;
  };

  DoublesTeams.prototype._teamById = function (id) {
    for (var i = 0; i < this.teams.length; i++) {
      if (this.teams[i].id === id) return this.teams[i];
    }
    return null;
  };

  DoublesTeams.prototype.open = function (id, silent) {
    var team = this._teamById(id);
    if (!team) return;

    var overlay = this._modal();
    var names = team.players.map(function (p) { return p.name; })
      .filter(function (n) { return n !== ''; }).join(' & ');
    overlay.querySelector('.dbl-modal-title').textContent = names;
    overlay.querySelector('.dbl-modal-body').innerHTML =
      team.players.map(profileHtml).join('');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    this.openId = id;

    // The hash makes a team shareable, and Back closes the modal again.
    if (!silent && (window.location.hash || '').slice(1) !== id) {
      window.location.hash = id;
    }
  };

  DoublesTeams.prototype.close = function (silent) {
    if (this.modalEl) this.modalEl.classList.remove('is-open');
    document.body.style.overflow = '';
    var wasOpen = this.openId;
    this.openId = '';
    if (!silent && wasOpen && (window.location.hash || '').slice(1) === wasOpen) {
      window.location.hash = this.sectionId;
    }
  };

  /** Opens or closes to match whatever the address bar says. */
  DoublesTeams.prototype._syncHash = function () {
    var hash = (window.location.hash || '').replace(/^#/, '');
    try { hash = decodeURIComponent(hash); } catch (e) { /* keep raw */ }

    if (hash && this._teamById(hash)) {
      if (this.openId !== hash) this.open(hash, true);
      return;
    }
    if (this.openId) this.close(true);
  };

  window.DoublesTeams = DoublesTeams;
})(window, document);
