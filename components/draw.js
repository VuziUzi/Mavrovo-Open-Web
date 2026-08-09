(function() {
  'use strict';

  var DEFAULT_SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  var MIN_SIZE = 4;
  var MAX_SIZE = 64;

  // Match dash separators: em-dash, en-dash, hyphen surrounded by spaces
  var SEP = '\\s+[\\u2014\\u2013\\-]\\s+';
  var RE_DEF  = new RegExp('^(.+?)\\s+def\\.?\\s+(.+?)' + SEP + '(.+)$', 'i');
  var RE_NAME = new RegExp('^(.+?)' + SEP + '(.+)$');

  var seq = 0;

  /**
   * Tournament draw bracket fed from a Google Sheet.
   *
   * Sheet layout (row 1 is a header, data starts at row 2):
   *   Column A          players, top to bottom, in bracket order
   *   Columns B..       one column per round, earliest first
   *   next column       champion
   *   next column       3rd place match
   *
   * The draw size (4/8/16/32/64) is derived from how many players sit in
   * column A, so the round columns shift automatically with it.
   *
   * Round cells accept either "Winner — score" or "Winner def. Loser — score".
   * Within a column the cells are read top-to-bottom in match order, so the
   * row spacing between them does not matter.
   */
  function DrawBracket(config) {
    config = config || {};
    this.containerId = config.containerId;
    this.sheetId     = config.sheetId || window.DRAW_SHEET_ID || DEFAULT_SHEET_ID;
    this.sheetName   = config.sheetName || 'Draw25';
    this.title       = config.title || '';
    this.subtitle    = config.subtitle || '';
    this.emptyTitle  = config.emptyTitle || 'Наскоро';
    this.emptyIcon   = config.emptyIcon || '&#127934;';
    this.emptyText   = config.emptyText || 'Резултатите од турнирот ќе бидат објавени по завршувањето.';
    // Page-authored markup for the empty state (e.g. to include a link).
    // Takes precedence over emptyText, which is escaped.
    this.emptyHtml   = config.emptyHtml || '';
    this.maxSize     = config.maxSize || MAX_SIZE;
    this._uid        = 'drawCb_' + (++seq) + '_' + Date.now();
    this._init();
  }

  // ---- helpers ----

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getCell(row, idx) {
    if (!row || !row.c || !row.c[idx]) return '';
    var c = row.c[idx];
    if (c.f != null && String(c.f).trim() !== '') return String(c.f).trim();
    if (c.v != null && String(c.v).trim() !== '') return String(c.v).trim();
    return '';
  }

  function sameName(a, b) {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // Accepts "Winner def. Loser — score" or "Winner — score"
  function parseResult(str) {
    if (!str) return null;
    var m = String(str).match(RE_DEF);
    if (m) return { winner: m[1].trim(), loser: m[2].trim(), score: m[3].trim() };
    m = String(str).match(RE_NAME);
    if (m) return { winner: m[1].trim(), loser: '', score: m[2].trim() };
    return { winner: String(str).trim(), loser: '', score: '' };
  }

  // Number of players in column A, rounded up to a power of two.
  function detectSize(rows, maxSize) {
    var last = -1;
    for (var i = 0; i < rows.length && i < maxSize; i++) {
      if (getCell(rows[i], 0) !== '') last = i;
    }
    var n = last + 1;
    if (n < 2) return 0;
    var size = MIN_SIZE;
    while (size < n && size < maxSize) size *= 2;
    return size;
  }

  /**
   * Map a round column's cells onto its matches.
   *
   * A result is normally written on the first row of the match it belongs to,
   * so the match index is the row divided by the rows that match spans. That
   * keeps gaps meaningful: in a half-played round only the played matches are
   * filled, and each result stays on its own match.
   *
   * Some sheets instead list a later round's results in consecutive rows rather
   * than aligned ones. Those collide on the same index, so a taken slot slides
   * to the next free one — which recovers the intended order for compressed and
   * fully contiguous layouts alike.
   */
  function collectRound(rows, colIdx, nMatches, rowsPerMatch) {
    var slots = new Array(nMatches);
    for (var i = 0; i < rows.length; i++) {
      var v = getCell(rows[i], colIdx);
      if (v === '') continue;
      var idx = Math.floor(i / rowsPerMatch);
      while (idx < nMatches && slots[idx] !== undefined) idx++;
      if (idx < nMatches) slots[idx] = v;
    }
    return slots;
  }

  // Last three rounds keep their tennis names; earlier ones are numbered.
  function roundLabels(nRounds) {
    var tail = ['Финале', 'Полуфинале', 'Четвртфинале'];
    var ordinals = ['1-во коло', '2-ро коло', '3-то коло', '4-то коло', '5-то коло'];
    var labels = [];
    for (var i = 0; i < nRounds; i++) {
      var fromEnd = nRounds - 1 - i;
      labels.push(fromEnd < tail.length ? tail[fromEnd] : (ordinals[i] || (i + 1) + '-то коло'));
    }
    return labels;
  }

  function isBye(name) {
    return !!name && String(name).trim().toUpperCase() === 'BYE';
  }

  function playerRow(name, score, isWinner) {
    if (!name || isBye(name)) {
      // An unfilled slot shows a dash; a sheet that spells out BYE keeps the word.
      return '<div class="draw-player bye">'
        + '<span class="dp-name">' + (isBye(name) ? 'BYE' : '&mdash;') + '</span>'
        + '<span class="dp-score"></span></div>';
    }
    return '<div class="draw-player' + (isWinner ? ' winner' : '') + '">'
      + '<span class="dp-name">' + escapeHtml(name) + '</span>'
      + '<span class="dp-score">' + escapeHtml(score || '') + '</span>'
      + '</div>';
  }

  function matchBox(p1, p2, winnerName, score) {
    var w1 = sameName(p1, winnerName);
    var w2 = sameName(p2, winnerName);
    return '<div class="draw-match">'
      + playerRow(p1, w1 ? score : '', w1)
      + playerRow(p2, w2 ? score : '', w2)
      + '</div>';
  }

  function buildRound(label, matchesHtml) {
    return '<div class="draw-round">'
      + '<div class="draw-round-label">' + escapeHtml(label) + '</div>'
      + '<div class="draw-matches">' + matchesHtml + '</div>'
      + '</div>';
  }

  // ---- instance ----

  DrawBracket.prototype._init = function() {
    var container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = ''
      + (this.title || this.subtitle
          ? '<div class="draw-header">'
            + (this.title ? '<h3 class="draw-title">' + escapeHtml(this.title) + '</h3>' : '')
            + (this.subtitle ? '<p class="draw-subtitle">' + escapeHtml(this.subtitle) + '</p>' : '')
            + '</div>'
          : '')
      + '<div class="draw-state draw-loading">Се вчитува...</div>'
      + '<div class="draw-state draw-empty" style="display:none">'
        + '<div class="draw-ph-icon">' + this.emptyIcon + '</div>'
        + '<div class="draw-ph-title">' + escapeHtml(this.emptyTitle) + '</div>'
        + '<div class="draw-ph-text">' + (this.emptyHtml || escapeHtml(this.emptyText)) + '</div>'
      + '</div>'
      + '<div class="draw-state draw-error" style="display:none">'
        + '<div class="draw-ph-icon">&#9888;&#65039;</div>'
        + '<div class="draw-ph-title">Не може да се вчита</div>'
        + '<div class="draw-ph-text">Проблем со вчитување на резултатите. Обиди се повторно.</div>'
      + '</div>'
      + '<div class="draw-content" style="display:none">'
        + '<div class="draw-mobile-hint">&#8596; Помести лево/десно за да ја видиш целата ждрепка</div>'
        + '<div class="draw-scroll"><div class="draw-bracket"></div></div>'
        + '<div class="draw-extra"></div>'
      + '</div>';

    this.el = {
      loading: container.querySelector('.draw-loading'),
      empty:   container.querySelector('.draw-empty'),
      error:   container.querySelector('.draw-error'),
      content: container.querySelector('.draw-content'),
      bracket: container.querySelector('.draw-bracket'),
      extra:   container.querySelector('.draw-extra')
    };

    var self = this;
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() { self._drawConnectors(); }, 150);
    });

    this.load();
  };

  DrawBracket.prototype._hideAll = function() {
    this.el.loading.style.display = 'none';
    this.el.empty.style.display   = 'none';
    this.el.error.style.display   = 'none';
    this.el.content.style.display = 'none';
  };
  DrawBracket.prototype._showEmpty = function() { this._hideAll(); this.el.empty.style.display = 'block'; };
  DrawBracket.prototype._showError = function() { this._hideAll(); this.el.error.style.display = 'block'; };

  DrawBracket.prototype._render = function(data) {
    if (!data || data.status === 'error' || !data.table || !data.table.rows) { this._showError(); return; }

    var rows = data.table.rows || [];
    var size = detectSize(rows, this.maxSize);
    if (!size) { this._showEmpty(); return; }

    var nRounds = Math.round(Math.log(size) / Math.log(2));
    var labels  = roundLabels(nRounds);

    // Round 0 participants come straight from column A.
    var participants = [];
    for (var i = 0; i < size; i++) participants.push(getCell(rows[i], 0));

    var html = '';
    for (var r = 0; r < nRounds; r++) {
      var nMatches = size >> (r + 1);
      var vals = collectRound(rows, r + 1, nMatches, Math.pow(2, r + 1));
      var matchesHtml = '', winners = [];

      for (var m = 0; m < nMatches; m++) {
        var p1  = participants[m * 2]     || '';
        var p2  = participants[m * 2 + 1] || '';
        var res = vals[m] ? parseResult(vals[m]) : null;

        if (res && res.loser) {
          // "X def. Y" names both players, so the sheet is authoritative about
          // who actually met. Carrying winners forward only guesses the pairing
          // and gets it wrong wherever a draw is not ordered by simple adjacency.
          // Keep the carried-forward order when it describes the same two
          // players, otherwise take the pairing from the cell.
          var agrees = (sameName(p1, res.winner) && sameName(p2, res.loser))
                    || (sameName(p1, res.loser)  && sameName(p2, res.winner));
          if (!agrees) { p1 = res.winner; p2 = res.loser; }
        } else if (res && !p1 && !p2) {
          // Name-only cell with nothing carried forward: show at least the winner.
          p1 = res.winner;
          p2 = '';
        }

        winners.push(res ? res.winner : '');
        matchesHtml += matchBox(p1, p2, res ? res.winner : '', res ? res.score : '');
      }

      html += buildRound(labels[r], matchesHtml);
      participants = winners;
    }

    this.el.bracket.setAttribute('data-rounds', nRounds);
    this.el.bracket.innerHTML = html;

    // Champion and 3rd place sit in the two columns after the last round.
    var champ = getCell(rows[0], nRounds + 1);
    if (!champ && participants.length) champ = participants[0];
    var champHtml = '<div class="draw-champion-card' + (champ ? '' : ' empty') + '">'
      + '<div class="ch-icon">&#127942;</div>'
      + '<div class="ch-label">Шампион</div>'
      + '<div class="ch-name">' + (champ ? escapeHtml(champ) : '&mdash;') + '</div>'
      + '</div>';

    var thirdRaw = getCell(rows[0], nRounds + 2);
    var third = thirdRaw ? parseResult(thirdRaw) : null;
    var thirdHtml = (third && third.loser)
      ? '<div class="draw-third-card">'
        + '<div class="dt-label"><span>&#129353;</span> 3-то место</div>'
        + matchBox(third.winner, third.loser, third.winner, third.score)
        + '</div>'
      : '';

    this.el.extra.innerHTML = champHtml + thirdHtml;

    this._hideAll();
    this.el.content.style.display = 'block';

    this._scheduleConnectors();
  };

  // rAF is throttled in background tabs, so pair it with a timeout fallback.
  DrawBracket.prototype._scheduleConnectors = function() {
    var self = this;
    requestAnimationFrame(function() { self._drawConnectors(); });
    setTimeout(function() { self._drawConnectors(); }, 60);
  };

  DrawBracket.prototype._drawConnectors = function() {
    var bracket = this.el && this.el.bracket;
    if (!bracket || !bracket.offsetParent) return;

    var old = bracket.querySelector('.bracket-svg');
    if (old) old.parentNode.removeChild(old);

    var bRect  = bracket.getBoundingClientRect();
    var rounds = Array.prototype.slice.call(bracket.querySelectorAll('.draw-round'));
    if (rounds.length < 2) return;

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg   = document.createElementNS(svgNS, 'svg');
    svg.classList.add('bracket-svg');
    var W = bracket.scrollWidth  || bracket.offsetWidth;
    var H = bracket.scrollHeight || bracket.offsetHeight;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:' + W + 'px;height:' + H
      + 'px;pointer-events:none;overflow:visible;flex:none;';

    for (var r = 0; r < rounds.length - 1; r++) {
      var srcM = Array.prototype.slice.call(rounds[r].querySelectorAll('.draw-match'));
      var dstM = Array.prototype.slice.call(rounds[r + 1].querySelectorAll('.draw-match'));

      for (var m = 0; m < dstM.length; m++) {
        var a = srcM[m * 2], b = srcM[m * 2 + 1], d = dstM[m];
        if (!a || !b || !d) continue;

        var ar = a.getBoundingClientRect();
        var br = b.getBoundingClientRect();
        var dr = d.getBoundingClientRect();

        var x1 = ar.right - bRect.left, y1 = (ar.top + ar.bottom) / 2 - bRect.top;
        var x2 = br.right - bRect.left, y2 = (br.top + br.bottom) / 2 - bRect.top;
        var xd = dr.left  - bRect.left;
        var mx = (x1 + xd) / 2;
        var my = (y1 + y2) / 2;

        var path = document.createElementNS(svgNS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#000');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        // src1 → midX, down to src2, back to src2 edge; then midpoint → dst
        path.setAttribute('d',
          'M' + x1 + ',' + y1 + ' H' + mx
          + ' V' + y2 + ' H' + x2
          + ' M' + mx + ',' + my + ' H' + xd
        );
        svg.appendChild(path);
      }
    }

    bracket.insertBefore(svg, bracket.firstChild);
  };

  DrawBracket.prototype._cleanup = function() {
    var s = document.getElementById(this._uid);
    if (s && s.parentNode) s.parentNode.removeChild(s);
    // Swap in a no-op rather than deleting: a response that lands after the
    // timeout would otherwise throw a ReferenceError from the JSONP script.
    var uid = this._uid;
    window[uid] = function() {};
    setTimeout(function() {
      try { delete window[uid]; } catch (e) { window[uid] = undefined; }
    }, 30000);
  };

  DrawBracket.prototype.load = function() {
    var self = this;
    this._hideAll();
    this.el.loading.style.display = 'block';
    this._settled = false;

    window[this._uid] = function(data) {
      self._settled = true;
      self._cleanup();
      self._render(data);
    };

    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(this.sheetId)
      + '/gviz/tq?sheet=' + encodeURIComponent(this.sheetName)
      + '&headers=1'
      + '&tqx=' + encodeURIComponent('out:json;responseHandler:' + this._uid)
      + '&cacheBust=' + Date.now();

    var s = document.createElement('script');
    s.id = this._uid;
    s.src = url;
    s.async = true;
    s.onerror = function() {
      if (self._settled) return;
      self._settled = true;
      self._cleanup();
      self._showError();
    };
    document.body.appendChild(s);

    setTimeout(function() {
      if (self._settled) return;
      self._settled = true;
      self._cleanup();
      self._showError();
    }, 10000);
  };

  // Redraw connectors when the bracket becomes visible (e.g. its tab is opened).
  DrawBracket.prototype.refresh = function() {
    this._scheduleConnectors();
  };

  window.DrawBracket = DrawBracket;
})();
