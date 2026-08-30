/**
 * Full-screen live score board for /livescore.
 *
 * Cell A1 of the spreadsheet's "Livescore" tab holds the scoreboard link of
 * whatever match should be on screen right now, so the operator switches matches
 * by pasting a different link — no deploy, no reload. A1 is re-read every 30s.
 *
 * The scoreboard app (Seven Courts / Tennis Math) publishes each match as JSON
 * at /score/<id> but sends no CORS headers, so the browser cannot read it
 * directly. Netlify proxies it same-origin — see _redirects: /score-api/* — and
 * the score is then drawn here in the tournament's own colours, which is what
 * makes it big and legible from across a room. Where that proxy is missing (a
 * plain static host, a local preview) the board falls back to embedding the
 * scoreboard page itself, scaled up.
 *
 * Query overrides, handy for a second screen:
 *   ?match=<scoreboard url or id>   pin one match, ignoring A1
 *   ?gid=<sheet tab id>             read A1 from another tab than "Livescore"
 */
(function (window, document) {
  'use strict';

  var SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  // The "Livescore" tab. Addressed by gid so renaming the tab cannot break it —
  // a gviz query with no gid reads the first tab ("Gledaj"), which holds the
  // stream link, not a scoreboard link.
  var GID = '910596830';
  var A1_REFRESH_MS = 30000;
  var SCORE_REFRESH_MS = 5000;
  var REQUEST_TIMEOUT = 10000;

  // Scoreboard hosts we can proxy, keyed by the prefix in _redirects.
  var PROXIES = [
    { host: 'prod.server.sevencourts.com', prefix: '/score-api/sevencourts/' },
    { host: 'tableau.tennis-math.com', prefix: '/score-api/tennis-math/' }
  ];

  var params = new URLSearchParams(window.location.search);
  var el = {};
  var current = { url: '', id: '', prefix: '' };
  var scoreTimer = null;
  var frameMode = false;

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /** A scoreboard link looks like https://<host>/tableau/<id>[?simple] */
  function parseBoard(raw) {
    var value = String(raw || '').trim();
    if (!value) return null;

    var id = '', host = '';
    if (/^https?:\/\//i.test(value)) {
      var m = value.match(/^https?:\/\/([^/]+)\/tableau\/([A-Za-z0-9_.-]+)/);
      if (!m) return null;
      host = m[1];
      id = m[2];
    } else if (/^[A-Za-z0-9_.-]+$/.test(value)) {
      // A bare id from ?match= — assume the host the tournament uses now.
      id = value;
      host = PROXIES[0].host;
      value = 'https://' + host + '/tableau/' + id + '?simple';
    } else {
      return null;
    }

    var proxy = null;
    for (var i = 0; i < PROXIES.length; i++) {
      if (PROXIES[i].host === host) { proxy = PROXIES[i]; break; }
    }
    return { url: value, id: id, host: host, prefix: proxy ? proxy.prefix : '' };
  }

  /* ---- states ------------------------------------------------------- */

  function showState(kind, title, text) {
    el.state.className = 'ls-state is-' + kind;
    el.state.innerHTML = '<div class="ls-state-title">' + escapeHtml(title) + '</div>'
      + (text ? '<div class="ls-state-text">' + escapeHtml(text) + '</div>' : '');
    el.state.hidden = false;
    el.board.hidden = true;
    document.body.classList.remove('is-live');
  }

  function showBoard() {
    el.state.hidden = true;
    el.board.hidden = false;
  }

  /* ---- the match on screen ------------------------------------------ */

  function setMatch(board) {
    if (!board) {
      current = { url: '', id: '', prefix: '' };
      stopScore();
      el.board.innerHTML = '';
      showState('idle', 'Нема натпревар во живо',
        'Штом ќе започне натпревар, резултатот ќе се појави тука автоматски.');
      return;
    }
    if (board.id === current.id) return;   // same match, nothing to do

    current = board;
    stopScore();
    frameMode = false;
    el.board.innerHTML = '';
    el.link.href = board.url;

    if (!board.prefix) { mountFrame(board); return; }
    loadScore(true);
  }

  function stopScore() {
    if (scoreTimer) { clearInterval(scoreTimer); scoreTimer = null; }
  }

  function loadScore(first) {
    var board = current;
    fetch(board.prefix + encodeURIComponent(board.id), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (board.id !== current.id) return;
        if (!data || !data.team1 || !data.team2) throw new Error('unexpected payload');
        paintScore(data);
        showBoard();
        document.body.classList.add('is-live');
        if (!scoreTimer) scoreTimer = setInterval(function () { loadScore(false); }, SCORE_REFRESH_MS);
      })
      .catch(function () {
        if (board.id !== current.id) return;
        // Without the proxy the scoreboard page itself is embedded instead.
        if (first) mountFrame(board);
      });
  }

  function teamName(team) {
    if (team.name) return team.name;
    var names = [team.p1, team.p2].filter(Boolean).map(function (p) {
      return [p.firstname ? p.firstname.charAt(0) + '.' : '', p.lastname || ''].join('');
    }).filter(function (n) { return n !== ''; });
    return names.join(' / ') || '—';
  }

  function setsWon(a, b) {
    var mine = a.setScores || [], other = b.setScores || [], won = 0;
    for (var i = 0; i < mine.length; i++) {
      if (Number(mine[i]) > Number(other[i])) won++;
    }
    return won;
  }

  function paintScore(data) {
    var t1 = data.team1, t2 = data.team2;
    var finished = String(data.matchStatus || '').toUpperCase() !== 'IN_GAME';
    var serves = !data.hideServiceIndicator && !finished;
    var w1 = finished && setsWon(t1, t2) > setsWon(t2, t1);
    var w2 = finished && setsWon(t2, t1) > setsWon(t1, t2);

    el.board.innerHTML =
      '<div class="ls-card' + (finished ? ' is-final' : '') + '">'
      + rowHtml(t1, serves && t1.serves, w1, finished)
      + '<div class="ls-divider"></div>'
      + rowHtml(t2, serves && t2.serves, w2, finished)
      + '</div>';

    el.status.textContent = finished ? 'Натпреварот е завршен' : 'Во живо';
    el.status.classList.toggle('is-final', finished);
  }

  function rowHtml(team, serving, winner, finished) {
    var sets = (team.setScores || []).map(function (v) {
      return '<span class="ls-set">' + escapeHtml(v) + '</span>';
    }).join('');
    var game = finished || team.gameScore == null || team.gameScore === ''
      ? ''
      : '<div class="ls-game">' + escapeHtml(team.gameScore) + '</div>';

    return '<div class="ls-row' + (winner ? ' is-winner' : '') + '">'
      + '<div class="ls-serve' + (serving ? ' is-on' : '') + '" aria-hidden="true"></div>'
      + '<div class="ls-name">' + escapeHtml(teamName(team)) + '</div>'
      + '<div class="ls-sets">' + sets + '</div>'
      + game
      + '</div>';
  }

  /**
   * Fallback: the scoreboard page draws its board in the top-left corner, so it
   * is embedded oversized and scaled up inside a fixed window.
   */
  function mountFrame(board) {
    frameMode = true;
    el.board.innerHTML =
      '<div class="ls-frame">'
      + '<iframe src="' + escapeHtml(board.url) + '" title="Резултат во живо" scrolling="no"'
      + ' referrerpolicy="no-referrer"></iframe>'
      + '</div>';
    el.status.textContent = 'Во живо';
    el.status.classList.remove('is-final');
    showBoard();
    document.body.classList.add('is-live');
  }

  /* ---- A1 ------------------------------------------------------------ */

  function readA1(data) {
    try {
      return String(data.table.rows[0].c[0].v || '').trim();
    } catch (e) {
      return '';
    }
  }

  function pollA1() {
    var uid = 'lsA1_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var scriptId = 'ls-jsonp-' + uid;
    var settled = false;

    function cleanup() {
      var s = document.getElementById(scriptId);
      if (s && s.parentNode) s.parentNode.removeChild(s);
      window[uid] = function () {};
      setTimeout(function () {
        try { delete window[uid]; } catch (e) { window[uid] = undefined; }
      }, REQUEST_TIMEOUT * 3);
    }

    window[uid] = function (data) {
      settled = true;
      cleanup();
      var raw = readA1(data);
      var board = parseBoard(raw);
      if (raw && !board) {
        // Something is in A1, but it is not a scoreboard link.
        setMatch(null);
        return;
      }
      setMatch(board);
    };

    var gid = params.get('gid') || GID;
    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID)
      + '/gviz/tq?gid=' + encodeURIComponent(gid)
      + '&headers=0'
      + '&tqx=' + encodeURIComponent('out:json;responseHandler:' + uid)
      + '&cacheBust=' + Date.now();

    var script = document.createElement('script');
    script.id = scriptId;
    script.src = url;
    script.async = true;
    script.onerror = function () { if (!settled) { settled = true; cleanup(); } };
    document.body.appendChild(script);
    setTimeout(function () { if (!settled) { settled = true; cleanup(); } }, REQUEST_TIMEOUT);
  }

  function init() {
    el.state = document.getElementById('ls-state');
    el.board = document.getElementById('ls-board');
    el.status = document.getElementById('ls-status');
    el.link = document.getElementById('ls-link');

    showState('loading', 'Се вчитува...', '');

    var pinned = parseBoard(params.get('match'));
    if (pinned) { setMatch(pinned); return; }

    pollA1();
    setInterval(pollA1, A1_REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
