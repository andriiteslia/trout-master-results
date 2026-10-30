(function () {
  'use strict';

  // ---------- Config ----------
  var CFG = Object.assign({ API_URL: '', SITE_NAME: 'Trout Master', REFRESH_SECONDS: 20 }, window.RESULTS_CONFIG || {});
  var API = String(CFG.API_URL || '').trim();
  var DEMO = !API;
  var SOURCE = DEMO ? 'demo.json' : API;
  var REFRESH_MS = Math.max(10, Number(CFG.REFRESH_SECONDS) || 20) * 1000;
  var FETCH_TIMEOUT_MS = 15000;

  var LS = {
    data: 'tm:data:' + SOURCE,
    follow: 'tm:follow',
    tab: 'tm:tab',
    group: 'tm:group',
    hintSeen: 'tm:hint'
  };

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    }
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    brand: $('brand'), status: $('status'), statusText: $('statusText'),
    title: $('title'), subtitle: $('subtitle'), notice: $('notice'),
    tabs: $('tabs'), q: $('q'), groups: $('groups'), hint: $('hint'),
    board: $('board'), notes: $('notes')
  };
  var mq = window.matchMedia('(max-width: 899px)');

  // ---------- State ----------
  var state = {
    payload: null,
    models: [],
    fromCache: false,
    tab: store.get(LS.tab, null),
    group: store.get(LS.group, {}),
    query: '',
    follow: new Set(store.get(LS.follow, [])),
    moves: {},      // sheet -> key -> delta (позитивне = піднявся)
    changed: {},    // sheet -> key -> [col]
    changeTime: 0,
    error: null,
    lastTry: 0,
    loading: false,
    timer: null
  };

  // ---------- Helpers ----------
  var NUM_RE = /^[-+−]?\d+(?:[.,]\d+)?\s*%?$/;
  function isNum(v) { return NUM_RE.test(String(v).trim()); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[’ʼ'`]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }
  // "Remesh Team (ВОФРС)" -> ["Remesh Team", "ВОФРС"]
  function splitParen(s) {
    var m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(s || ''));
    return m ? [m[1], m[2]] : [String(s || ''), ''];
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var t = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return t;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }) + ', ' + t;
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ---------- Parse a sheet into a table model ----------
  function parseSheet(sheet) {
    var raw = Array.isArray(sheet.values) ? sheet.values : [];
    var merges = Array.isArray(sheet.merges) ? sheet.merges : [];
    var hidden = new Set(sheet.hiddenCols || []);

    var W = 0;
    raw.forEach(function (row) {
      (row || []).forEach(function (v, c) { if (String(v == null ? '' : v).trim() !== '') W = Math.max(W, c + 1); });
    });
    var grid = raw.map(function (row) {
      var out = [];
      for (var c = 0; c < W; c++) out.push(row && row[c] != null ? String(row[c]).trim() : '');
      return out;
    });
    var filled = function (r) { return grid[r].filter(function (v) { return v !== ''; }).length; };

    var owner = {};
    merges.forEach(function (m) {
      for (var r = m.r; r < m.r + m.rs; r++) for (var c = m.c; c < m.c + m.cs; c++) owner[r + ',' + c] = m;
    });
    var hv = function (r, c) {
      var m = owner[r + ',' + c];
      if (m) return (grid[m.r] && grid[m.r][m.c]) || '';
      return (grid[r] && grid[r][c]) || '';
    };
    var spanW = function (r, c) { var m = owner[r + ',' + c]; return m ? m.cs : 1; };

    // Рядки-заголовки зверху (назва турніру тощо): не більше однієї заповненої клітинки
    var r = 0, titles = [];
    while (r < grid.length && filled(r) <= 1) {
      var t = grid[r].find(function (v) { return v !== ''; });
      if (t) titles.push(t);
      r++;
    }
    var hs = r;

    // Початок даних: перший рядок, де в першій колонці число
    var ds = -1;
    for (var i = hs + 1; i < grid.length; i++) {
      if (isNum(grid[i][0]) && filled(i) >= 2) { ds = i; break; }
    }
    var mergeEnd = hs + 1;
    merges.forEach(function (m) { if (m.r >= hs && m.r < hs + 4) mergeEnd = Math.max(mergeEnd, m.r + m.rs); });
    if (ds === -1) ds = Math.min(grid.length, mergeEnd);
    var he = ds;
    var multi = he - hs >= 2;

    // Колонки: група (напр. «1 день») + підпис (напр. «Бали»)
    var cols = [];
    var prevGroup = null;
    for (var c = 0; c < W; c++) {
      var labels = [];
      for (var h = hs; h < he; h++) {
        var v = hv(h, c);
        if (v && labels[labels.length - 1] !== v) labels.push(v);
      }
      var group = null;
      var label = labels[labels.length - 1] || '';
      if (multi) {
        var top = hv(hs, c);
        if (top && (spanW(hs, c) > 1 || labels.length > 1)) group = top;
        else if (!top && prevGroup && labels.length) group = prevGroup;
        if (group) {
          var rest = labels.filter(function (x) { return x !== group; });
          label = rest.join(' ') || label;
        }
      }
      prevGroup = group;
      if (hidden.has(c)) continue;
      cols.push({ c: c, label: label, group: group });
    }

    // Дані та примітки під таблицею
    var rows = [], notes = [];
    for (var d = he; d < grid.length; d++) {
      var f = filled(d);
      if (!f) continue;
      if (f === 1 && grid[d][0] !== '' && !isNum(grid[d][0]) && (spanW(d, 0) >= 3 || grid[d][0].length > 30)) {
        notes.push(grid[d][0]);
        continue;
      }
      rows.push(grid[d]);
    }

    var numRatio = function (ci) {
      var n = 0, tot = 0;
      rows.forEach(function (row) { var v = row[ci]; if (v !== '') { tot++; if (isNum(v)) n++; } });
      return tot ? n / tot : 0;
    };
    cols.forEach(function (k) { k.numeric = numRatio(k.c) >= 0.6; });

    var placeCol = cols.length && cols[0].c === 0 && !cols[0].group &&
      (cols[0].numeric || /^(#|№|місце|м\.)/i.test(cols[0].label)) ? cols[0] : null;
    var nameCol = cols.find(function (k) { return k !== placeCol && !k.group && !k.numeric; }) ||
      cols.find(function (k) { return k !== placeCol; }) || null;
    if (placeCol) placeCol.role = 'place';
    if (nameCol) nameCol.role = 'name';

    var groups = [];
    cols.forEach(function (k, idx) {
      if (!k.group) return;
      var g = groups[groups.length - 1];
      if (g && g.name === k.group && cols[idx - 1] && cols[idx - 1].group === k.group) g.cols.push(k);
      else groups.push({ name: k.group, cols: [k] });
    });
    var total = groups.length ? groups[groups.length - 1] : null;
    if (total && groups.length > 1) {
      total.cols.forEach(function (k) { k.total = true; });
      total.cols[0].key = true;
    }
    groups.forEach(function (g) { g.cols[0].gstart = true; });

    var seen = {};
    var items = rows.map(function (cells, idx) {
      var name = nameCol ? cells[nameCol.c] : '';
      var key = name || ('#' + idx);
      if (seen[key]) key = key + ' #' + (++seen[key]); else seen[key] = 1;
      var place = placeCol ? parseInt(cells[placeCol.c], 10) : NaN;
      return { cells: cells, key: key, name: name, place: isNaN(place) ? null : place, search: norm(cells.join(' ')) };
    });

    var titleText = titles.join(' ');
    return {
      name: sheet.name || 'Аркуш',
      title: titleText,
      cols: cols,
      groups: groups,
      total: total,
      placeCol: placeCol,
      nameCol: nameCol,
      rows: items,
      notes: notes
    };
  }

  // ---------- Diff between updates ----------
  function diff(oldModels, newModels) {
    var moves = {}, changed = {}, any = false;
    newModels.forEach(function (m) {
      var old = oldModels.find(function (o) { return o.name === m.name; });
      if (!old) return;
      var byKey = {};
      old.rows.forEach(function (row) { byKey[row.key] = row; });
      var mv = {}, ch = {};
      m.rows.forEach(function (row) {
        var prev = byKey[row.key];
        if (!prev) return;
        if (row.place != null && prev.place != null && row.place !== prev.place) {
          mv[row.key] = prev.place - row.place;
        }
        var cc = [];
        m.cols.forEach(function (k) { if ((prev.cells[k.c] || '') !== (row.cells[k.c] || '')) cc.push(k.c); });
        if (cc.length) { ch[row.key] = cc; any = true; }
      });
      moves[m.name] = mv;
      changed[m.name] = ch;
    });
    return { moves: moves, changed: changed, any: any };
  }

  // ---------- Rendering ----------
  function currentModel() {
    if (!state.models.length) return null;
    var m = state.models.find(function (x) { return x.name === state.tab; });
    return m || state.models[0];
  }

  function shortTabNames(models) {
    var names = models.map(function (m) { return m.name; });
    if (names.length < 2) return names;
    var last = names.map(function (n) { var p = n.trim().split(/\s+/); return p.length > 1 ? p[p.length - 1].toLowerCase() : null; });
    var same = last[0] && last.every(function (x) { return x === last[0]; });
    if (!same) return names;
    return names.map(function (n) { return n.trim().split(/\s+/).slice(0, -1).join(' '); });
  }

  function renderHeader() {
    var m = currentModel();
    var p = state.payload;
    var full = (m && m.title) || (p && p.title) || 'Результати';
    var parts = splitParen(full);
    el.title.textContent = parts[0];
    el.subtitle.textContent = parts[1];
    el.subtitle.hidden = !parts[1];
    el.brand.textContent = CFG.SITE_NAME || '';
    document.title = parts[0] + (CFG.SITE_NAME ? ' | ' + CFG.SITE_NAME : '');
  }

  function renderTabs() {
    var models = state.models;
    if (models.length < 2) { el.tabs.innerHTML = ''; return; }
    var cur = currentModel();
    var labels = shortTabNames(models);
    el.tabs.innerHTML = models.map(function (m, i) {
      var sel = m === cur;
      return '<button type="button" class="tab" role="tab" id="tab-' + i + '" data-tab="' + esc(m.name) + '" aria-selected="' + sel + '" tabindex="' + (sel ? 0 : -1) + '">' + esc(labels[i]) + '</button>';
    }).join('');
  }

  function selectedGroup(m) {
    if (!m.groups.length) return null;
    var saved = state.group[m.name];
    if (saved === '*') return '*';
    if (saved && m.groups.some(function (g) { return g.name === saved; })) return saved;
    return m.groups[m.groups.length - 1].name;
  }

  function renderGroups() {
    var m = currentModel();
    if (!m || !mq.matches || m.groups.length < 2) { el.groups.hidden = true; el.groups.innerHTML = ''; return; }
    var sel = selectedGroup(m);
    var opts = m.groups.map(function (g) { return g.name; });
    var html = opts.map(function (name) {
      return '<button type="button" class="chip" data-group="' + esc(name) + '" aria-pressed="' + (sel === name) + '">' + esc(name) + '</button>';
    }).join('');
    html += '<button type="button" class="chip" data-group="*" aria-pressed="' + (sel === '*') + '">Усе</button>';
    el.groups.innerHTML = html;
    el.groups.hidden = false;
  }

  function visibleCols(m) {
    if (!mq.matches || m.groups.length < 2) return m.cols;
    var sel = selectedGroup(m);
    if (sel === '*') return m.cols;
    return m.cols.filter(function (k) { return !k.group || k.group === sel; });
  }

  function cellHtml(m, k, row, opts) {
    var v = row.cells[k.c] || '';
    var cls = [];
    if (k.gstart) cls.push('gstart');
    if (k.total) cls.push('is-total');
    if (k.key) cls.push('is-key');
    if (opts.flash && opts.flash.indexOf(k.c) !== -1) cls.push('flash');

    if (k.role === 'place') {
      var pc = row.place === 1 ? 'p1' : row.place === 2 ? 'p2' : row.place === 3 ? 'p3' : '';
      var mv = opts.move;
      var mvHtml = '';
      if (mv) {
        var n = Math.abs(mv);
        var word = plural(n, 'позицію', 'позиції', 'позицій');
        mvHtml = mv > 0
          ? '<span class="mv up" title="Піднявся на ' + n + ' ' + word + '"><span aria-hidden="true">▲</span>' + n + '<span class="visually-hidden"> вгору</span></span>'
          : '<span class="mv down" title="Опустився на ' + n + ' ' + word + '"><span aria-hidden="true">▼</span>' + n + '<span class="visually-hidden"> вниз</span></span>';
      }
      return '<td class="place ' + cls.join(' ') + '">' + (v ? '<span class="pl ' + pc + '">' + esc(v) + '</span>' : '') + mvHtml + '</td>';
    }
    if (k.role === 'name') {
      var parts = splitParen(v);
      var on = opts.follow;
      return '<td class="name ' + cls.join(' ') + '"><button type="button" class="nm" data-key="' + esc(row.key) + '" aria-pressed="' + on + '">' +
        '<span class="nm__main">' + (on ? '<span class="nm__star" aria-hidden="true">★</span>' : '') + esc(parts[0]) + '</span>' +
        (parts[1] ? '<span class="nm__sub">' + esc(parts[1]) + '</span>' : '') +
        '</button></td>';
    }
    if (k.numeric) cls.push('num');
    return '<td class="' + cls.join(' ') + '">' + esc(v) + '</td>';
  }

  function followId(m, row) { return m.name + '::' + row.key; }

  function rowHtml(m, vis, row, extraClass) {
    var fid = followId(m, row);
    var on = state.follow.has(fid);
    var flashOn = Date.now() - state.changeTime < 3500;
    var ch = (state.changed[m.name] || {})[row.key];
    var opts = {
      follow: on,
      move: (state.moves[m.name] || {})[row.key] || 0,
      flash: flashOn && ch ? ch : null
    };
    var cls = (on ? 'is-follow ' : '') + (extraClass || '');
    return '<tr class="' + cls.trim() + '">' + vis.map(function (k) { return cellHtml(m, k, row, opts); }).join('') + '</tr>';
  }

  function renderBoard() {
    var m = currentModel();
    var scrollX = el.board.scrollLeft;
    if (!m) {
      el.board.classList.remove('is-wide');
      el.board.innerHTML = state.error
        ? '<div class="empty"><strong>Не вдалося завантажити результати</strong>Спробуємо ще раз за кілька секунд.</div>'
        : '<div class="empty"><strong>Завантаження результатів…</strong></div>';
      el.notes.innerHTML = '';
      return;
    }
    if (!m.cols.length) {
      el.board.classList.remove('is-wide');
      el.board.innerHTML = '<div class="empty"><strong>Результатів ще немає</strong>Таблиця з’явиться тут, щойно судді внесуть перші дані.</div>';
      el.notes.innerHTML = '';
      return;
    }

    var vis = visibleCols(m);
    var hasGroups = vis.some(function (k) { return k.group; });

    // Header
    var h1 = '', h2 = '';
    for (var i = 0; i < vis.length;) {
      var k = vis[i];
      if (!k.group) {
        var cls = k.role === 'place' ? 'lead-place' : k.role === 'name' ? 'lead-name' : '';
        var lbl = k.role === 'place' && (k.label === '#' || !k.label) ? '<span aria-hidden="true">#</span><span class="visually-hidden">Місце</span>' : esc(k.label);
        h1 += '<th scope="col" class="' + cls + '"' + (hasGroups ? ' rowspan="2"' : '') + '>' + lbl + '</th>';
        i++;
        continue;
      }
      var j = i;
      while (j < vis.length && vis[j].group === k.group) j++;
      h1 += '<th scope="colgroup" colspan="' + (j - i) + '" class="grp gstart' + (k.total ? ' is-total' : '') + '">' + esc(k.group) + '</th>';
      for (var x = i; x < j; x++) {
        var s = vis[x];
        h2 += '<th scope="col" class="' + (x === i ? 'gstart ' : '') + (s.total ? 'is-total' : '') + '">' + esc(s.label) + '</th>';
      }
      i = j;
    }
    var thead = '<thead><tr class="h1">' + h1 + '</tr>' + (hasGroups ? '<tr class="h2">' + h2 + '</tr>' : '') + '</thead>';

    // Body
    var q = norm(state.query);
    var rows = q ? m.rows.filter(function (row) { return row.search.indexOf(q) !== -1; }) : m.rows;
    var body = '';
    if (!q) {
      var pinned = m.rows.filter(function (row) { return state.follow.has(followId(m, row)); });
      if (pinned.length) {
        body += '<tr class="sep"><td colspan="' + vis.length + '"><span>Ви стежите</span></td></tr>';
        body += pinned.map(function (row) { return rowHtml(m, vis, row, 'is-pinned'); }).join('');
        body += '<tr class="sep"><td colspan="' + vis.length + '"><span>Уся таблиця</span></td></tr>';
      }
    }
    body += rows.map(function (row) { return rowHtml(m, vis, row); }).join('');
    if (!rows.length) {
      body += '<tr><td colspan="' + vis.length + '"><div class="empty"><strong>Нікого не знайдено</strong>За запитом «' + esc(state.query) + '» збігів немає. Перевірте написання або очистьте пошук.</div></td></tr>';
    }

    el.board.innerHTML = '<table>' + thead + '<tbody>' + body + '</tbody></table>';

    // Широка таблиця не вміщається: вмикаємо горизонтальну прокрутку
    var wideWanted = mq.matches && selectedGroup(m) === '*';
    el.board.classList.toggle('is-wide', wideWanted);
    if (!wideWanted) {
      var table = el.board.firstChild;
      if (table && table.scrollWidth > el.board.clientWidth + 1) el.board.classList.add('is-wide');
    }
    if (el.board.classList.contains('is-wide')) el.board.scrollLeft = scrollX;

    var placeTh = el.board.querySelector('th.lead-place');
    if (placeTh) el.board.style.setProperty('--pw', placeTh.getBoundingClientRect().width + 'px');
    var firstRow = el.board.querySelector('thead tr.h1');
    if (firstRow) el.board.style.setProperty('--h1', firstRow.getBoundingClientRect().height + 'px');

    el.notes.innerHTML = m.notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('');
  }

  function renderHint() {
    var m = currentModel();
    el.hint.hidden = !m || !m.nameCol || state.follow.size > 0 || store.get(LS.hintSeen, false);
  }

  function renderStatus(pulse) {
    var p = state.payload;
    var s, text;
    if (DEMO) { s = 'demo'; text = 'Демо-дані'; }
    else if (state.error && p) { s = 'stale'; text = 'Немає зв’язку'; }
    else if (state.error) { s = 'error'; text = 'Немає зв’язку'; }
    else if (!p || state.fromCache) { s = 'load'; text = 'Завантаження…'; }
    else { s = 'live'; text = 'Оновлено о ' + fmtTime(p.changedAt || p.generatedAt); }
    el.status.dataset.state = s;
    el.statusText.textContent = text;
    if (pulse && s === 'live') {
      el.status.classList.remove('is-pulse');
      void el.status.offsetWidth;
      el.status.classList.add('is-pulse');
    }

    var notice = '';
    if (DEMO) {
      notice = 'Зараз показано демо-дані з минулого турніру. Щоб сторінка показувала живі результати, вставте адресу Apps Script у файл <code>config.js</code>.';
    } else if (state.error && p) {
      notice = 'Не вдається отримати свіжі дані (' + esc(state.error) + '). Показано результати станом на ' + esc(fmtTime(p.changedAt || p.generatedAt)) + '. Сторінка повторить спробу автоматично.';
    } else if (state.error) {
      notice = 'Не вдалося завантажити результати: ' + esc(state.error) + '. Сторінка повторить спробу автоматично.';
    }
    el.notice.innerHTML = notice;
    el.notice.hidden = !notice;
  }

  function renderAll() {
    renderHeader();
    renderTabs();
    renderGroups();
    renderHint();
    renderBoard();
  }

  // ---------- Data ----------
  function applyPayload(p, opts) {
    opts = opts || {};
    var models = (p.sheets || []).map(parseSheet);
    var same = state.payload && p.hash && state.payload.hash === p.hash;
    if (same && !state.fromCache) {
      state.payload.generatedAt = p.generatedAt;
      return false;
    }
    if (state.models.length && !state.fromCache && !opts.cached) {
      var d = diff(state.models, models);
      state.moves = d.moves;
      state.changed = d.changed;
      state.changeTime = d.any ? Date.now() : 0;
    }
    state.payload = p;
    state.models = models;
    state.fromCache = !!opts.cached;
    if (!opts.cached) store.set(LS.data, p);
    return true;
  }

  function fetchJson(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : null;
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return fetch(url + sep + '_=' + Date.now(), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('сервер відповів ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw new Error('сервер не відповідає');
        if (err instanceof SyntaxError) throw new Error('неправильна відповідь сервера');
        if (err && /fetch|network|load failed/i.test(err.message)) throw new Error('немає інтернету або сервер недоступний');
        throw err;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function load() {
    if (state.loading) return;
    state.loading = true;
    state.lastTry = Date.now();
    clearTimeout(state.timer);
    fetchJson(SOURCE)
      .then(function (p) {
        if (!p || p.ok === false) throw new Error((p && p.error) || 'порожня відповідь');
        var changed = applyPayload(p);
        state.error = null;
        if (changed) renderAll();
        renderStatus(true);
      })
      .catch(function (err) {
        state.error = (err && err.message) || 'невідома помилка';
        renderStatus(false);
        if (!state.models.length) renderBoard();
      })
      .finally(function () {
        state.loading = false;
        schedule();
      });
  }

  function schedule() {
    clearTimeout(state.timer);
    if (DEMO || document.hidden) return;
    state.timer = setTimeout(load, REFRESH_MS);
  }

  // ---------- Events ----------
  el.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    store.set(LS.tab, state.tab);
    renderAll();
    var cur = el.tabs.querySelector('[aria-selected="true"]');
    if (cur) cur.focus();
  });
  el.tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = Array.prototype.slice.call(el.tabs.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.click();
    e.preventDefault();
  });

  el.groups.addEventListener('click', function (e) {
    var b = e.target.closest('[data-group]');
    var m = currentModel();
    if (!b || !m) return;
    state.group[m.name] = b.getAttribute('data-group');
    store.set(LS.group, state.group);
    renderGroups();
    renderBoard();
  });

  el.q.addEventListener('input', function () {
    state.query = el.q.value;
    renderBoard();
  });
  el.q.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { el.q.value = ''; state.query = ''; renderBoard(); }
  });

  el.board.addEventListener('click', function (e) {
    var b = e.target.closest('.nm');
    var m = currentModel();
    if (!b || !m) return;
    var fid = m.name + '::' + b.getAttribute('data-key');
    if (state.follow.has(fid)) state.follow.delete(fid); else state.follow.add(fid);
    store.set(LS.follow, Array.from(state.follow));
    store.set(LS.hintSeen, true);
    renderHint();
    renderBoard();
  });

  var onMq = function () { renderGroups(); renderBoard(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderBoard, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(state.timer); return; }
    if (Date.now() - state.lastTry > 5000) load(); else schedule();
  });
  window.addEventListener('online', function () { load(); });

  // ---------- Start ----------
  var cached = store.get(LS.data, null);
  if (cached && cached.sheets) {
    applyPayload(cached, { cached: true });
    renderAll();
  } else {
    renderHeader();
    renderBoard();
  }
  renderStatus(false);
  load();
})();
