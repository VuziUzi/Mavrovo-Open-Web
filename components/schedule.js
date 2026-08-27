/**
 * Match schedule fed from a Google Sheet — one sheet tab (gid) per playing day.
 *
 * Sheet layout (row 1 is a header, data starts at row 2):
 *   A  Start      match time, e.g. 9:00
 *   B  Player 1   one name, or "A / B" for doubles
 *   C  Player 2   same
 *   D  Status     Завршен | Во тек | Не започнат
 *   E  Livescore  link to the live scoreboard page — ignored while D says
 *                 "Не започнат", so a link filled in early shows nothing yet
 *   F  Stream     link opened by the "Гледај" button
 *   G  Statistic  link opened by the "Статистика" button
 *
 * Buttons stay disabled while their cell is empty, so the sheet alone decides
 * what a visitor can click. Days are grouped into weekends and each day owns a
 * URL hash (#raspored-28-avgust), so a single day is shareable.
 *
 * Scores: Tennis Math publishes a match as JSON at /score/<id>, but without CORS
 * headers, so the browser cannot read it directly. Netlify proxies it same-origin
 * (see _redirects: /livescore/*), which lets the score render as a native card in
 * the site's own styling. Where that proxy is missing — a plain static host, a
 * local preview — the card falls back to the scoreboard page itself, embedded in
 * an iframe cropped to the board in its top-left corner.
 *
 *   new MatchSchedule({
 *     containerId: 'mo26-schedule',
 *     groups: [{ label: 'Викенд 1', days: [{ id, label, date, gid }, ...] }],
 *     initialDay: '29-avgust',                // optional, e.g. read from the hash
 *     onDayChange: function (dayId) { ... }   // e.g. to sync the URL hash
 *   });
 */
(function (window, document) {
  'use strict';

  var DEFAULT_SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  var REQUEST_TIMEOUT = 10000;
  // While a day still has unfinished matches its sheet is re-read on this beat.
  var REFRESH_MS = 60000;
  // Live scores move faster than the sheet does, so they get their own beat.
  var SCORE_REFRESH_MS = 20000;
  // Netlify rewrite that fronts https://tableau.tennis-math.com/score/<id>
  var SCORE_PROXY = '/livescore/';

  var STATUS = {
    'завршен': { key: 'done', label: 'Завршен' },
    'во тек': { key: 'live', label: 'Во тек' },
    'не започнат': { key: 'soon', label: 'Не започнат' }
  };

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
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  /** Only http(s) links are turned into buttons; anything else stays inert. */
  function link(row, idx) {
    var raw = cell(row, idx);
    return /^https?:\/\//i.test(raw) ? raw : '';
  }

  function statusOf(raw) {
    var found = STATUS[String(raw || '').toLowerCase()];
    if (found) return found;
    return { key: 'soon', label: raw || 'Не започнат' };
  }

  /** "9:00" reads better as "09:00" once the times sit in a column. */
  function padTime(t) {
    return /^\d:/.test(t) ? '0' + t : t;
  }

  /** Doubles arrive as "A / B" and get one line per partner. */
  function sideHtml(name) {
    var parts = String(name).split('/').map(function (p) { return p.trim(); })
      .filter(function (p) { return p !== ''; });
    if (parts.length === 0) return '<span class="sched-name sched-name-tbd">—</span>';
    return parts.map(function (p) {
      return '<span class="sched-name">' + escapeHtml(p) + '</span>';
    }).join('');
  }

  function MatchSchedule(config) {
    config = config || {};
    this.container = document.getElementById(config.containerId);
    if (!this.container) return;

    this.sheetId = config.sheetId || DEFAULT_SHEET_ID;
    this.groups = config.groups || [];
    this.onDayChange = config.onDayChange || function () {};

    this.days = [];
    var self = this;
    this.groups.forEach(function (g) {
      (g.days || []).forEach(function (d) { self.days.push(d); });
    });

    this.dayId = null;
    this.cache = {};        // dayId -> { rows: [], signature: '' }
    this.timer = null;
    this.scoreTimer = null;
    this.scoreBoxes = [];   // mounted score cards, polled while a match is live
    this.uid = 'schedCb_' + (++seq) + '_' + Date.now();

    this._build();
    var start = config.initialDay && this._dayById(config.initialDay)
      ? config.initialDay
      : this._defaultDay();
    this.select(start, true);
  }

  MatchSchedule.prototype._dayById = function (id) {
    for (var i = 0; i < this.days.length; i++) {
      if (this.days[i].id === id) return this.days[i];
    }
    return null;
  };

  /** Today's play day when the tournament is running, otherwise the first one. */
  MatchSchedule.prototype._defaultDay = function () {
    var now = new Date();
    var today = now.getFullYear() + '-'
      + ('0' + (now.getMonth() + 1)).slice(-2) + '-'
      + ('0' + now.getDate()).slice(-2);
    for (var i = 0; i < this.days.length; i++) {
      if (this.days[i].date === today) return this.days[i].id;
    }
    return this.days.length ? this.days[0].id : null;
  };

  MatchSchedule.prototype._build = function () {
    var groupsHtml = this.groups.map(function (g) {
      var btns = (g.days || []).map(function (d) {
        return '<button type="button" class="sched-day" data-day="' + escapeHtml(d.id) + '">'
          + escapeHtml(d.label) + '</button>';
      }).join('');
      return '<div class="sched-group">'
        + '<div class="sched-group-label">' + escapeHtml(g.label) + '</div>'
        + '<div class="sched-group-days">' + btns + '</div>'
        + '</div>';
    }).join('');

    this.container.innerHTML =
      '<div class="sched">'
      + '<div class="sched-groups">' + groupsHtml + '</div>'
      + '<div class="sched-body">'
      + '<div class="sched-state" data-state="loading">Се вчитува распоредот...</div>'
      + '<div class="sched-list" hidden></div>'
      + '</div>'
      + '</div>';

    this.stateEl = this.container.querySelector('.sched-state');
    this.listEl = this.container.querySelector('.sched-list');

    var self = this;
    this.container.addEventListener('click', function (e) {
      var dayBtn = e.target.closest ? e.target.closest('.sched-day') : null;
      if (dayBtn) { self.select(dayBtn.getAttribute('data-day')); return; }
      var scoreBtn = e.target.closest ? e.target.closest('.sched-live-open') : null;
      if (scoreBtn) self._mountScore(scoreBtn.parentNode);
    });
  };

  /** Opens a day; `silent` skips the hash sync used for the first render. */
  MatchSchedule.prototype.select = function (dayId, silent) {
    var day = this._dayById(dayId);
    if (!day || day.id === this.dayId) return;
    this.dayId = day.id;

    var btns = this.container.querySelectorAll('.sched-day');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('active', b.getAttribute('data-day') === day.id);
    });

    var cached = this.cache[day.id];
    if (cached) this._render(cached.rows);
    else this._showState('loading', 'Се вчитува распоредот...');

    this._load(day);
    if (!silent) this.onDayChange(day.id);
  };

  /** Called when the schedule tab becomes visible again. */
  MatchSchedule.prototype.onShow = function () {
    var day = this._dayById(this.dayId);
    if (!day) return;
    this._load(day);
    this._wireScores();
    // The address bar names the day on screen, not just the tab.
    this.onDayChange(day.id);
  };

  MatchSchedule.prototype._showState = function (kind, text, html) {
    this.stateEl.setAttribute('data-state', kind);
    this.stateEl.innerHTML = html || escapeHtml(text);
    this.stateEl.hidden = false;
    this.listEl.hidden = true;
    // Drop the previous day's cards so their scoreboard iframes stop loading.
    this.listEl.innerHTML = '';
    this.scoreBoxes = [];
  };

  MatchSchedule.prototype._load = function (day) {
    var self = this;
    var uid = this.uid + '_' + day.id.replace(/[^a-z0-9]/gi, '');
    var scriptId = 'sched-jsonp-' + uid;
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
      if (self.dayId !== day.id) return;
      self._receive(day, data);
    };

    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(this.sheetId)
      + '/gviz/tq?gid=' + encodeURIComponent(day.gid)
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
      if (self.dayId === day.id && !self.cache[day.id]) self._showError();
    };
    document.body.appendChild(script);

    setTimeout(function () {
      if (settled) return;
      settled = true;
      cleanup();
      if (self.dayId === day.id && !self.cache[day.id]) self._showError();
    }, REQUEST_TIMEOUT);
  };

  MatchSchedule.prototype._receive = function (day, data) {
    if (!data || data.status === 'error' || !data.table) {
      if (!this.cache[day.id]) this._showError();
      return;
    }

    var rows = (data.table.rows || []).map(function (r) {
      var status = statusOf(cell(r, 3));
      return {
        time: padTime(cell(r, 0)),
        p1: cell(r, 1),
        p2: cell(r, 2),
        status: status,
        // A match that has not started has no score to show, so its scoreboard
        // link is ignored until the sheet moves it on — the link is often filled
        // in ahead of time.
        live: status.key === 'soon' ? '' : link(r, 4),
        stream: link(r, 5),
        stats: link(r, 6)
      };
    }).filter(function (m) {
      return m.p1 !== '' || m.p2 !== '' || m.time !== '';
    });

    var signature = JSON.stringify(rows);
    var previous = this.cache[day.id];
    this.cache[day.id] = { rows: rows, signature: signature };

    // Re-rendering tears down the embedded scoreboards, so only do it on change.
    if (!previous || previous.signature !== signature) this._render(rows);
    this._scheduleRefresh(day, rows);
  };

  /** Keeps polling while a day still has matches that are not finished. */
  MatchSchedule.prototype._scheduleRefresh = function (day, rows) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    var pending = rows.some(function (m) { return m.status.key !== 'done'; });
    if (!pending) return;

    var self = this;
    this.timer = setTimeout(function () {
      if (self.dayId !== day.id) return;
      if (!self.container.offsetParent) return;   // schedule tab is hidden
      self._load(day);
    }, REFRESH_MS);
  };

  MatchSchedule.prototype._showError = function () {
    this._showState('error',
      'Проблем со вчитување на распоредот. Обиди се повторно подоцна.');
  };

  MatchSchedule.prototype._render = function (rows) {
    if (!rows.length) {
      this._showState('empty', '', '<div class="sched-empty-icon">📅</div>'
        + '<div class="sched-empty-title">Наскоро</div>'
        + '<div class="sched-empty-text">Распоредот за овој ден сè уште не е објавен.</div>');
      return;
    }

    this.scoreBoxes = [];
    this.listEl.innerHTML = rows.map(matchHtml).join('');
    this.listEl.hidden = false;
    this.stateEl.hidden = true;
    this._wireScores();
  };

  function matchHtml(m) {
    var live = m.status.key === 'live';

    var scoreHtml = '';
    if (m.live) {
      scoreHtml = '<div class="sched-live" data-src="' + escapeHtml(m.live) + '"'
        + (live ? ' data-auto="1"' : '')
        + '><button type="button" class="sched-live-open">Прикажи резултат</button></div>';
    } else {
      scoreHtml = '<div class="sched-live sched-live-none"><span>—</span></div>';
    }

    return '<article class="sched-match is-' + m.status.key + '">'
      + '<div class="sched-time">' + escapeHtml(m.time || '—') + '</div>'
      + '<div class="sched-players">'
      + '<div class="sched-side">' + sideHtml(m.p1) + '</div>'
      + '<div class="sched-vs">vs</div>'
      + '<div class="sched-side">' + sideHtml(m.p2) + '</div>'
      + '</div>'
      + scoreHtml
      + '<div class="sched-meta">'
      + '<span class="sched-badge sched-badge-' + m.status.key + '">'
      + (live ? '<span class="sched-dot"></span>' : '') + escapeHtml(m.status.label)
      + '</span>'
      + '<div class="sched-actions">'
      + actionHtml(m.stream, 'Гледај', 'sched-btn-watch')
      + actionHtml(m.stats, 'Статистика', 'sched-btn-stats')
      + '</div>'
      + '</div>'
      + '</article>';
  }

  function actionHtml(href, label, cls) {
    if (!href) {
      return '<span class="sched-btn ' + cls + ' is-disabled" aria-disabled="true">'
        + escapeHtml(label) + '</span>';
    }
    return '<a class="sched-btn ' + cls + '" href="' + escapeHtml(href) + '"'
      + ' target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
  }

  /**
   * Live matches show their score straight away; the rest keep a button, so a
   * day of finished matches costs nothing until someone asks for a score.
   * Nothing is mounted while the schedule tab is hidden — onShow() retries.
   */
  MatchSchedule.prototype._wireScores = function () {
    if (!this.container.offsetParent) return;
    var self = this;
    var autos = this.listEl.querySelectorAll('.sched-live[data-auto]');
    Array.prototype.forEach.call(autos, function (el) { self._mountScore(el); });
  };

  /** The board id is the last path segment of the scoreboard link. */
  function scoreId(url) {
    var m = String(url || '').match(/\/tableau\/([A-Za-z0-9_.-]+)/);
    return m ? m[1] : '';
  }

  /**
   * Shows one match score: the proxied JSON when it is reachable, otherwise the
   * scoreboard page in a cropped iframe.
   */
  MatchSchedule.prototype._mountScore = function (box) {
    if (!box || box.classList.contains('is-on')) return;
    var src = box.getAttribute('data-src');
    if (!src) return;
    box.classList.add('is-on');

    var id = scoreId(src);
    if (!id) { mountFrame(box, src); return; }

    var self = this;
    box.innerHTML = '<div class="sched-score-card is-loading"><span></span></div>';

    var live = box.hasAttribute('data-auto');
    fetchScore(id).then(function (data) {
      self._paintScore(box, src, data);
      // Only a running match keeps changing, so only those are polled.
      if (live) {
        self.scoreBoxes.push({ box: box, src: src, id: id });
        self._pollScores();
      }
    }, function () {
      mountFrame(box, src);
    });
  };

  function fetchScore(id) {
    if (!window.fetch) return Promise.reject(new Error('no fetch'));
    return fetch(SCORE_PROXY + encodeURIComponent(id), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.team1 || !data.team2) throw new Error('unexpected payload');
        return data;
      });
  }

  MatchSchedule.prototype._paintScore = function (box, src, data) {
    box.innerHTML = scoreCardHtml(data)
      + '<a class="sched-live-link" href="' + escapeHtml(src) + '" target="_blank"'
      + ' rel="noopener noreferrer" title="Отвори го резултатот во живо">'
      + '<span>Отвори</span></a>';
  };

  /** Re-reads the running matches' scores while the schedule is on screen. */
  MatchSchedule.prototype._pollScores = function () {
    if (this.scoreTimer) return;
    var self = this;
    this.scoreTimer = setInterval(function () {
      if (!self.scoreBoxes.length || !self.container.offsetParent) return;
      self.scoreBoxes.forEach(function (entry) {
        if (!entry.box.isConnected) return;
        fetchScore(entry.id).then(function (data) {
          if (!entry.box.isConnected) return;
          self._paintScore(entry.box, entry.src, data);
        }, function () { /* keep the last good score on screen */ });
      });
    }, SCORE_REFRESH_MS);
  };

  function teamName(team) {
    if (team.name) return team.name;
    var names = [team.p1, team.p2].filter(Boolean).map(function (p) {
      return [p.firstname ? p.firstname.charAt(0) + '.' : '', p.lastname || ''].join('');
    }).filter(function (n) { return n !== ''; });
    return names.join(' / ') || '—';
  }

  function setsWon(a, b) {
    var scores = a.setScores || [];
    var other = b.setScores || [];
    var won = 0;
    for (var i = 0; i < scores.length; i++) {
      if (Number(scores[i]) > Number(other[i])) won++;
    }
    return won;
  }

  function scoreCardHtml(data) {
    var t1 = data.team1, t2 = data.team2;
    var finished = String(data.matchStatus || '').toUpperCase() !== 'IN_GAME';
    var w1 = finished && setsWon(t1, t2) > setsWon(t2, t1);
    var w2 = finished && setsWon(t2, t1) > setsWon(t1, t2);
    var serves = !data.hideServiceIndicator && !finished;

    return '<div class="sched-score-card' + (finished ? ' is-final' : '') + '">'
      + scoreRowHtml(t1, serves && t1.serves, w1, finished)
      + scoreRowHtml(t2, serves && t2.serves, w2, finished)
      + '</div>';
  }

  function scoreRowHtml(team, serving, winner, finished) {
    var sets = (team.setScores || []).map(function (v) {
      return '<b>' + escapeHtml(v) + '</b>';
    }).join('');
    var game = finished || team.gameScore == null || team.gameScore === ''
      ? ''
      : '<span class="sched-score-game">' + escapeHtml(team.gameScore) + '</span>';

    return '<div class="sched-score-row' + (winner ? ' is-winner' : '') + '">'
      + '<span class="sched-serve' + (serving ? ' is-on' : '') + '"></span>'
      + '<span class="sched-score-name">' + escapeHtml(teamName(team)) + '</span>'
      + '<span class="sched-score-sets">' + sets + '</span>'
      + game
      + '</div>';
  }

  /**
   * Fallback: the scoreboard page paints its board in the top-left corner, so the
   * iframe is oversized and the wrapper crops and scales it down to a tile.
   */
  function mountFrame(box, src) {
    box.classList.add('is-on', 'is-frame');
    box.innerHTML =
      '<div class="sched-live-frame">'
      + '<iframe src="' + escapeHtml(src) + '" title="Резултат во живо" loading="lazy"'
      + ' scrolling="no" referrerpolicy="no-referrer"></iframe>'
      + '</div>'
      + '<a class="sched-live-link" href="' + escapeHtml(src) + '" target="_blank"'
      + ' rel="noopener noreferrer" title="Отвори го резултатот"><span>Отвори</span></a>';
  }

  window.MatchSchedule = MatchSchedule;
})(window, document);
