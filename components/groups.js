/**
 * Group stage + final, fed from a Google Sheet — used by the Двојки Про draw,
 * where six pairs play a round robin in two groups and the group winners meet.
 *
 * Sheet layout (row 1 is a header, one row per match, read top to bottom):
 *   A  Фаза        "Група А" / "Група Б" / "Финале" — anything that is not a
 *                  group is rendered as a knockout card under the groups
 *   B  Тим 1       team name, spelled the same way in every row it appears in
 *   C  Тим 2       same
 *   D  Резултат    score seen from Тим 1: "6-3 6-4" means Тим 1 won,
 *                  "3-6 4-6" means Тим 2 did. Tie-break sets may be bracketed
 *                  ("[10-8]"), and "W.O." / "RET" are understood
 *   E  Победник    optional, and only needed when the score cannot decide it
 *                  (a walkover) or to overrule the table
 *
 * Standings are computed from the results, never typed: wins first, then set
 * difference, then game difference. A final left without team names picks up
 * the group winners as soon as every group match has a result.
 *
 *   new GroupStage({ containerId: 'draw-dvojki', sheetName: 'Draw26 Doubles Pro' });
 */
(function (window, document) {
  'use strict';

  var DEFAULT_SHEET_ID = '1fykfBEQdx_th9MOd4zlGfAuTl5IWizt-Ln-BBDhhosM';
  var REQUEST_TIMEOUT = 10000;
  var RE_SET = /\[?(\d{1,2})\s*[-–—]\s*(\d{1,2})\]?/g;
  var RE_WALKOVER = /w\.?\s*o\.?|walkover|ret(?:\.|ired)?/i;

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

  // A word-boundary marker is ASCII-only, so it never matches after Cyrillic.
  function isGroup(phase) {
    return /^\s*(група|grupa|group)/i.test(phase);
  }

  function sameName(a, b) {
    return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  /**
   * Reads a score written from Тим 1's side into sets and games for both teams.
   * A walkover carries no sets, so it only counts as a win.
   */
  function readScore(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;

    var sets = [];
    var m;
    RE_SET.lastIndex = 0;
    while ((m = RE_SET.exec(text)) !== null) {
      sets.push([Number(m[1]), Number(m[2])]);
    }

    var walkover = RE_WALKOVER.test(text);
    if (!sets.length && !walkover) return null;

    var won1 = 0, won2 = 0, games1 = 0, games2 = 0;
    sets.forEach(function (s) {
      games1 += s[0];
      games2 += s[1];
      if (s[0] > s[1]) won1++;
      else if (s[1] > s[0]) won2++;
    });

    return {
      text: text,
      sets1: won1, sets2: won2,
      games1: games1, games2: games2,
      // A retirement leaves the score as played; the leader still takes the win.
      winner: won1 === won2 ? 0 : (won1 > won2 ? 1 : 2),
      walkover: walkover
    };
  }

  function GroupStage(config) {
    config = config || {};
    this.containerId = config.containerId;
    this.sheetId = config.sheetId || DEFAULT_SHEET_ID;
    this.sheetName = config.sheetName || '';
    this.gid = config.gid || '';
    this.title = config.title || '';
    this.subtitle = config.subtitle || '';
    this.emptyTitle = config.emptyTitle || 'Наскоро';
    this.emptyIcon = config.emptyIcon || '&#127934;';
    this.emptyHtml = config.emptyHtml || '';
    this.emptyText = config.emptyText || 'Групите ќе бидат објавени наскоро.';
    this.uid = 'grpCb_' + (++seq) + '_' + Date.now();

    this._build();
    if (this.el) this._load();
  }

  GroupStage.prototype._build = function () {
    var container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML =
      (this.title || this.subtitle
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
      + '<div class="grp-content" style="display:none"></div>';

    this.el = {
      loading: container.querySelector('.draw-loading'),
      empty: container.querySelector('.draw-empty'),
      error: container.querySelector('.draw-error'),
      content: container.querySelector('.grp-content')
    };
  };

  GroupStage.prototype._hideAll = function () {
    this.el.loading.style.display = 'none';
    this.el.empty.style.display = 'none';
    this.el.error.style.display = 'none';
    this.el.content.style.display = 'none';
  };

  GroupStage.prototype._showEmpty = function () { this._hideAll(); this.el.empty.style.display = 'block'; };
  GroupStage.prototype._showError = function () { this._hideAll(); this.el.error.style.display = 'block'; };

  /** Re-measures nothing, but keeps the same API as the bracket component. */
  GroupStage.prototype.refresh = function () {};

  GroupStage.prototype._load = function () {
    var self = this;
    var uid = this.uid;
    var scriptId = 'grp-jsonp-' + uid;
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
      self._render(data);
    };

    var source = this.gid
      ? 'gid=' + encodeURIComponent(this.gid)
      : 'sheet=' + encodeURIComponent(this.sheetName);
    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(this.sheetId)
      + '/gviz/tq?' + source
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
      self._showError();
    };
    document.body.appendChild(script);

    setTimeout(function () {
      if (settled) return;
      settled = true;
      cleanup();
      self._showError();
    }, REQUEST_TIMEOUT);
  };

  /* ---- standings ------------------------------------------------------ */

  function emptyRow(name) {
    return {
      name: name, played: 0, wins: 0, losses: 0,
      setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0
    };
  }

  function standingsOf(matches) {
    var order = [];
    var table = {};

    function seat(name) {
      var key = name.toLowerCase();
      if (!table[key]) { table[key] = emptyRow(name); order.push(key); }
      return table[key];
    }

    matches.forEach(function (m) {
      if (m.team1) seat(m.team1);
      if (m.team2) seat(m.team2);
      if (!m.score || !m.winner) return;

      var a = seat(m.team1), b = seat(m.team2);
      a.played++; b.played++;
      a.setsFor += m.score.sets1; a.setsAgainst += m.score.sets2;
      b.setsFor += m.score.sets2; b.setsAgainst += m.score.sets1;
      a.gamesFor += m.score.games1; a.gamesAgainst += m.score.games2;
      b.gamesFor += m.score.games2; b.gamesAgainst += m.score.games1;

      if (m.winner === m.team1) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    });

    var rows = order.map(function (k) { return table[k]; });
    // Wins first, then the usual tennis tie-breaks.
    return rows.slice().sort(function (x, y) {
      if (y.wins !== x.wins) return y.wins - x.wins;
      var sx = x.setsFor - x.setsAgainst, sy = y.setsFor - y.setsAgainst;
      if (sy !== sx) return sy - sx;
      var gx = x.gamesFor - x.gamesAgainst, gy = y.gamesFor - y.gamesAgainst;
      if (gy !== gx) return gy - gx;
      return rows.indexOf(x) - rows.indexOf(y);
    });
  }

  /** The group is decided once every match in it has a result. */
  function groupWinner(group) {
    var played = group.matches.every(function (m) { return !!m.winner; });
    if (!played || !group.standings.length) return '';
    var top = group.standings[0];
    if (group.standings.length > 1 && group.standings[1].wins === top.wins) {
      var a = top.setsFor - top.setsAgainst;
      var b = group.standings[1].setsFor - group.standings[1].setsAgainst;
      if (a === b) return '';   // a real tie: the organisers name the finalist
    }
    return top.name;
  }

  /* ---- markup --------------------------------------------------------- */

  function standingsHtml(group) {
    var rows = group.standings.map(function (r, i) {
      var qualifies = i === 0 && r.played > 0;
      return '<tr class="' + (qualifies ? 'is-first' : '') + '">'
        + '<td class="grp-pos">' + (i + 1) + '</td>'
        + '<td class="grp-team">' + escapeHtml(r.name) + '</td>'
        + '<td>' + r.played + '</td>'
        + '<td class="grp-wins">' + r.wins + '</td>'
        + '<td>' + r.setsFor + ':' + r.setsAgainst + '</td>'
        + '<td>' + r.gamesFor + ':' + r.gamesAgainst + '</td>'
        + '</tr>';
    }).join('');

    return '<table class="grp-table">'
      + '<thead><tr>'
      + '<th></th><th>Тим</th><th title="Одиграни">М</th><th title="Победи">П</th>'
      + '<th>Сетови</th><th>Гемови</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody></table>';
  }

  function matchHtml(m) {
    var w1 = m.winner && sameName(m.winner, m.team1);
    var w2 = m.winner && sameName(m.winner, m.team2);
    return '<div class="grp-match">'
      + '<div class="grp-side' + (w1 ? ' is-winner' : '') + '">'
      + escapeHtml(m.team1 || '—') + '</div>'
      + '<div class="grp-score">' + (m.score ? escapeHtml(m.score.text) : 'vs') + '</div>'
      + '<div class="grp-side' + (w2 ? ' is-winner' : '') + '">'
      + escapeHtml(m.team2 || '—') + '</div>'
      + '</div>';
  }

  function groupHtml(group) {
    return '<section class="grp-card">'
      + '<h4 class="grp-card-title">' + escapeHtml(group.label) + '</h4>'
      + standingsHtml(group)
      + '<div class="grp-matches">' + group.matches.map(matchHtml).join('') + '</div>'
      + '</section>';
  }

  function finalHtml(m) {
    var w1 = m.winner && sameName(m.winner, m.team1);
    var w2 = m.winner && sameName(m.winner, m.team2);
    return '<section class="grp-final">'
      + '<div class="grp-final-tag">' + escapeHtml(m.phase) + '</div>'
      + '<div class="grp-final-body">'
      + '<div class="grp-final-side' + (w1 ? ' is-winner' : '') + '">'
      + '<span class="grp-final-name">' + escapeHtml(m.team1 || 'Победник Група А') + '</span>'
      + (w1 ? '<span class="grp-final-crown">&#127942;</span>' : '')
      + '</div>'
      + '<div class="grp-final-score">' + (m.score ? escapeHtml(m.score.text) : 'vs') + '</div>'
      + '<div class="grp-final-side' + (w2 ? ' is-winner' : '') + '">'
      + '<span class="grp-final-name">' + escapeHtml(m.team2 || 'Победник Група Б') + '</span>'
      + (w2 ? '<span class="grp-final-crown">&#127942;</span>' : '')
      + '</div>'
      + '</div>'
      + '</section>';
  }

  /* ---- render --------------------------------------------------------- */

  GroupStage.prototype._render = function (data) {
    if (!data || data.status === 'error' || !data.table || !data.table.rows) {
      this._showError();
      return;
    }

    var matches = (data.table.rows || []).map(function (r) {
      var score = readScore(cell(r, 3));
      var team1 = cell(r, 1), team2 = cell(r, 2);
      var stated = cell(r, 4);
      var winner = stated
        || (score && score.winner === 1 ? team1 : '')
        || (score && score.winner === 2 ? team2 : '');
      return {
        phase: cell(r, 0), team1: team1, team2: team2,
        score: score, winner: winner
      };
    }).filter(function (m) {
      return m.phase !== '' || m.team1 !== '' || m.team2 !== '';
    });

    if (!matches.length) { this._showEmpty(); return; }

    var groups = [], byLabel = {}, playoffs = [];
    matches.forEach(function (m) {
      if (!isGroup(m.phase)) { playoffs.push(m); return; }
      if (!byLabel[m.phase]) {
        byLabel[m.phase] = { label: m.phase, matches: [] };
        groups.push(byLabel[m.phase]);
      }
      byLabel[m.phase].matches.push(m);
    });

    groups.forEach(function (g) { g.standings = standingsOf(g.matches); });

    // A final with no names yet inherits the group winners, in group order.
    playoffs.forEach(function (m) {
      if (!m.team1 && groups[0]) m.team1 = groupWinner(groups[0]);
      if (!m.team2 && groups[1]) m.team2 = groupWinner(groups[1]);
      // Its winner could not be named while the finalists were still unknown.
      if (!m.winner && m.score) {
        if (m.score.winner === 1) m.winner = m.team1;
        else if (m.score.winner === 2) m.winner = m.team2;
      }
    });

    this.el.content.innerHTML =
      (groups.length
        ? '<div class="grp-groups">' + groups.map(groupHtml).join('') + '</div>'
        : '')
      + playoffs.map(finalHtml).join('');

    this._hideAll();
    this.el.content.style.display = 'block';
  };

  window.GroupStage = GroupStage;
})(window, document);
