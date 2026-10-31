(function () {
  'use strict';

  // ---------- Config ----------
  var CFG = Object.assign({ API_URL: '', HEADER_ROWS: 2, REFRESH_SECONDS: 20 }, window.RESULTS_CONFIG || {});
  var API = String(CFG.API_URL || '').trim();
  var DEMO = !API;
  var SOURCE = DEMO ? 'demo.json' : API;
  var HEADER_ROWS = Math.max(1, parseInt(CFG.HEADER_ROWS, 10) || 2);
  var REFRESH_MS = Math.max(10, Number(CFG.REFRESH_SECONDS) || 20) * 1000;
  var FETCH_TIMEOUT_MS = 15000;

  // Коди результату туру → стиль бейджа
  var CODES = { 'В': 'code-w', 'П': 'code-l', 'РН': 'code-d', 'БН': 'code-z' };

  var LS = { data: 'tm2:data:' + SOURCE, sel: 'tm:selected', tab: 'tm:tab' };
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
    status: $('status'), statusText: $('statusText'),
    title: $('title'), subtitle: $('subtitle'), notice: $('notice'),
    tabs: $('tabs'), board: $('board'), info: $('info')
  };

  // ---------- State ----------
  var state = {
    payload: null,
    models: [],
    fromCache: false,
    tab: null,   // при відкритті сторінки завжди перша вкладка
    selected: new Set(store.get(LS.sel, [])),
    moves: {},
    changed: {},
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
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var t = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return t;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }) + ', ' + t;
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ---------- Sheet → table model ----------
  // Перші HEADER_ROWS рядків — заголовки, далі — дані.
  function parseSheet(sheet) {
    var raw = Array.isArray(sheet.values) ? sheet.values : [];
    var merges = Array.isArray(sheet.merges) ? sheet.merges : [];
    var hidden = new Set(sheet.hiddenCols || []);

    var W = 0;
    raw.forEach(function (row) { if (row && row.length > W) W = row.length; });
    var grid = raw.map(function (row) {
      var out = [];
      for (var c = 0; c < W; c++) out.push(row && row[c] != null ? String(row[c]).trim() : '');
      return out;
    });

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

    var hr = parseInt(sheet.headerRows, 10) > 0 ? parseInt(sheet.headerRows, 10) : HEADER_ROWS;
    var he = Math.min(hr, grid.length);
    var body = grid.slice(he);

    // Колонки: група (рядок 1, об'єднана клітинка) + підпис (рядок 2)
    var cols = [];
    var prevGroup = null;
    for (var c = 0; c < W; c++) {
      var labels = [];
      for (var h = 0; h < he; h++) {
        var v = hv(h, c);
        if (v && labels[labels.length - 1] !== v) labels.push(v);
      }
      var group = null;
      var label = labels[labels.length - 1] || '';
      if (he >= 2) {
        var top = hv(0, c);
        if (top && (spanW(0, c) > 1 || labels.length > 1)) group = top;
        else if (!top && prevGroup && labels.length) group = prevGroup;
        if (group) label = labels.filter(function (x) { return x !== group; }).join(' ') || '';
      }
      prevGroup = group;
      var hasData = labels.length > 0 || body.some(function (row) { return row[c] !== ''; });
      if (hidden.has(c) || !hasData) continue;
      cols.push({ c: c, label: label, group: group });
    }

    // Колонка місця (#) і колонка імені
    var numRatio = function (ci) {
      var n = 0, tot = 0;
      body.forEach(function (row) { var v = row[ci]; if (v !== '') { tot++; if (isNum(v)) n++; } });
      return tot ? n / tot : 0;
    };
    cols.forEach(function (k) { k.numeric = numRatio(k.c) >= 0.6; });
    var placeCol = cols.length && !cols[0].group && (cols[0].numeric || /^(#|№|місце)/i.test(cols[0].label)) ? cols[0] : null;
    var nameCol = cols.find(function (k) { return k !== placeCol && !k.group && !k.numeric; }) || null;
    if (placeCol) placeCol.role = 'place';
    if (nameCol) nameCol.role = 'name';

    var prev = null;
    cols.forEach(function (k) {
      if (k.group && (!prev || prev.group !== k.group)) k.gstart = true;
      prev = k;
    });
    // Додаткові розділювачі всередині групи: перед «Бали» та «Місце» (напр. у «Підсумку»)
    cols.forEach(function (k) {
      if (k.group && !k.gstart && /^(бали|місце)/i.test(k.label)) k.sep = true;
    });

    // Рядки даних: беремо лише ті, де є ім'я учасника
    var seen = {};
    var rows = [];
    body.forEach(function (cells) {
      var name = nameCol ? cells[nameCol.c] : cells.filter(Boolean).join(' ');
      if (!name) return;
      var key = name;
      if (seen[key]) key = key + ' #' + (++seen[key]); else seen[key] = 1;
      var place = placeCol ? parseInt(cells[placeCol.c], 10) : NaN;
      rows.push({ cells: cells, key: key, place: isNaN(place) ? null : place });
    });

    return { name: sheet.name || 'Аркуш', cols: cols, rows: rows, placeCol: placeCol, nameCol: nameCol };
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
        var p = byKey[row.key];
        if (!p) return;
        if (row.place != null && p.place != null && row.place !== p.place) mv[row.key] = p.place - row.place;
        var cc = [];
        m.cols.forEach(function (k) { if ((p.cells[k.c] || '') !== (row.cells[k.c] || '')) cc.push(k.c); });
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
    return state.models.find(function (x) { return x.name === state.tab; }) || state.models[0];
  }

  function renderHeader() {
    var p = state.payload;
    var ev = (p && p.event) || {};
    var title = ev.title || (p && p.title) || 'Результати';
    el.title.textContent = title;
    el.subtitle.textContent = ev.subtitle || '';
    el.subtitle.hidden = !ev.subtitle;
    document.title = title + ' | Trout Master';
  }

  function renderTabs() {
    if (state.models.length < 2) { el.tabs.innerHTML = ''; return; }
    var cur = currentModel();
    el.tabs.innerHTML = state.models.map(function (m, i) {
      var sel = m === cur;
      return '<button type="button" class="tab" role="tab" id="tab-' + i + '" data-tab="' + esc(m.name) +
        '" aria-selected="' + sel + '" tabindex="' + (sel ? 0 : -1) + '">' + esc(m.name) + '</button>';
    }).join('');
    var i = state.models.indexOf(cur);
    el.board.setAttribute('aria-labelledby', 'tab-' + i);
  }

  function cellHtml(k, row, opts) {
    var v = row.cells[k.c] || '';
    var cls = [];
    if (k.gstart || k.sep) cls.push('gstart');
    if (opts.flash && opts.flash.indexOf(k.c) !== -1) cls.push('flash');

    if (k.role === 'place') {
      cls.push('c-place');
      var mvHtml = '';
      if (opts.move) {
        var n = Math.abs(opts.move);
        var dir = opts.move > 0 ? 'up' : 'down';
        var txt = (opts.move > 0 ? 'піднявся на ' : 'опустився на ') + n + ' ' + plural(n, 'місце', 'місця', 'місць');
        mvHtml = '<span class="mv ' + dir + '" title="' + txt + '"><span aria-hidden="true">' + (opts.move > 0 ? '▲' : '▼') + n + '</span><span class="visually-hidden">, ' + txt + '</span></span>';
      }
      return '<td class="' + cls.join(' ') + '">' + esc(v) + mvHtml + '</td>';
    }
    if (k.role === 'name') {
      cls.push('c-name');
      return '<td class="' + cls.join(' ') + '"><button type="button" class="nm" data-key="' + esc(row.key) +
        '" aria-pressed="' + opts.sel + '">' + esc(v) + '</button></td>';
    }
    var code = CODES[v.toUpperCase()];
    var inner = code ? '<span class="code ' + code + '">' + esc(v) + '</span>' : esc(v);
    return '<td class="' + cls.join(' ') + '">' + inner + '</td>';
  }

  function renderBoard() {
    var m = currentModel();
    var prevScroller = el.board.querySelector('.bs');
    var scrollX = prevScroller ? prevScroller.scrollLeft : 0;
    el.board.classList.remove('is-wide', 'is-compact');

    if (!m) {
      el.board.innerHTML = state.error
        ? '<div class="empty"><strong>Не вдалося завантажити результати</strong>Сторінка повторить спробу автоматично.</div>'
        : '<div class="empty"><strong>Завантаження результатів…</strong></div>';
      return;
    }
    if (!m.rows.length) {
      el.board.innerHTML = '<div class="empty"><strong>Результатів ще немає</strong>Таблиця з’явиться тут, щойно судді внесуть перші дані.</div>';
      return;
    }

    var cols = m.cols;
    var hasGroups = cols.some(function (k) { return k.group; });

    var h1 = '', h2 = '';
    for (var i = 0; i < cols.length;) {
      var k = cols[i];
      if (!k.group) {
        var cls = k.role === 'place' ? 'c-place' : k.role === 'name' ? 'c-name' : '';
        var lbl = k.role === 'place' && (!k.label || k.label === '#')
          ? '<span aria-hidden="true">#</span><span class="visually-hidden">Номер</span>' : esc(k.label);
        h1 += '<th scope="col" class="' + cls + '"' + (hasGroups ? ' rowspan="2"' : '') + '>' + lbl + '</th>';
        i++;
        continue;
      }
      var j = i;
      while (j < cols.length && cols[j].group === k.group && (j === i || !cols[j].gstart)) j++;
      h1 += '<th scope="colgroup" colspan="' + (j - i) + '" class="grp gstart">' + esc(k.group) + '</th>';
      for (var x = i; x < j; x++) {
        h2 += '<th scope="col"' + (x === i || cols[x].sep ? ' class="gstart"' : '') + '>' + esc(cols[x].label) + '</th>';
      }
      i = j;
    }
    var thead = '<thead><tr class="h1">' + h1 + '</tr>' + (hasGroups ? '<tr class="h2">' + h2 + '</tr>' : '') + '</thead>';

    var flashOn = Date.now() - state.changeTime < 3500;
    var moves = state.moves[m.name] || {};
    var changed = state.changed[m.name] || {};
    var body = m.rows.map(function (row) {
      var sel = state.selected.has(row.key);
      var opts = { sel: sel, move: moves[row.key] || 0, flash: flashOn ? changed[row.key] : null };
      return '<tr data-key="' + esc(row.key) + '"' + (sel ? ' class="is-sel"' : '') + '>' +
        cols.map(function (k) { return cellHtml(k, row, opts); }).join('') + '</tr>';
    }).join('');

    // Шапка й тіло — окремі таблиці: шапка прилипає до верху екрана,
    // тіло гортається вбік, ширини колонок однакові.
    el.board.innerHTML =
      '<div class="bh"><table class="t-head"></table></div>' +
      '<div class="bs"><table class="t-body">' + thead + '<tbody>' + body + '</tbody></table></div>';
    var headBox = el.board.querySelector('.bh');
    var scroller = el.board.querySelector('.bs');
    var tHead = headBox.firstChild;
    var tBody = scroller.firstChild;

    var cells = tBody.tBodies[0].rows[0].cells;
    var widths = Array.prototype.map.call(cells, function (c) { return c.getBoundingClientRect().width; });
    var total = widths.reduce(function (a, w) { return a + w; }, 0);
    var colgroup = '<colgroup>' + widths.map(function (w) { return '<col style="width:' + w + 'px">'; }).join('') + '</colgroup>';
    var theadEl = tBody.tHead;
    tBody.insertAdjacentHTML('afterbegin', colgroup);
    tHead.innerHTML = colgroup;
    tHead.appendChild(theadEl);
    [tHead, tBody].forEach(function (t) { t.style.tableLayout = 'fixed'; t.style.width = total + 'px'; });

    el.board.classList.toggle('is-wide', total > scroller.clientWidth + 1);
    el.board.style.setProperty('--pw', widths[0] + 'px');
    scroller.scrollLeft = scrollX;
    headBox.scrollLeft = scroller.scrollLeft;
  }

  function renderStatus(pulse) {
    var p = state.payload;
    var s, text;
    el.status.hidden = DEMO;
    if (DEMO) { s = 'demo'; text = ''; }
    else if (state.error) { s = p ? 'stale' : 'error'; text = 'Немає зв’язку'; }
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
      notice = '';
    } else if (state.error && p) {
      notice = 'Не вдається отримати свіжі дані (' + esc(state.error) + '). Показано результати станом на ' +
        esc(fmtTime(p.changedAt || p.generatedAt)) + '. Сторінка повторить спробу автоматично.';
    } else if (state.error) {
      notice = 'Не вдалося завантажити результати: ' + esc(state.error) + '. Сторінка повторить спробу автоматично.';
    }
    el.notice.innerHTML = notice;
    el.notice.hidden = !notice;
  }

  // Підказка про виділення рядка потрібна лише для результатів, не для списку учасників
  function renderInfo() {
    if (!el.info) return;
    var p = state.payload;
    var isReg = !!p && (p.mode === 'Список учасників' ||
      (!p.mode && (p.sheets || []).length === 1 && /учасник/i.test(p.sheets[0].name || '')));
    el.info.hidden = !p || isReg;
  }

  function renderAll() {
    renderInfo();
    renderHeader();
    renderTabs();
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
    var sc = el.board.querySelector('.bs');
    if (sc) sc.scrollLeft = 0;
    renderTabs();
    renderBoard();
    var cur = el.tabs.querySelector('[aria-selected="true"]');
    if (cur) cur.focus();
  });
  el.tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = Array.prototype.slice.call(el.tabs.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].click();
    e.preventDefault();
  });

  // Тап по рядку: виділити / зняти виділення (працює на всіх вкладках)
  el.board.addEventListener('click', function (e) {
    var tr = e.target.closest('tbody tr[data-key]');
    if (!tr) return;
    var key = tr.getAttribute('data-key');
    if (state.selected.has(key)) state.selected.delete(key); else state.selected.add(key);
    store.set(LS.sel, Array.from(state.selected));
    var on = state.selected.has(key);
    tr.classList.toggle('is-sel', on);
    var btn = tr.querySelector('.nm');
    if (btn) btn.setAttribute('aria-pressed', String(on));
  });

  // Шапка лише повторює горизонтальну прокрутку тіла таблиці (в один бік,
  // щоб не збивати інерцію свайпу на телефоні).
  var syncFrame = 0;
  el.board.addEventListener('scroll', function (e) {
    if (!e.target.classList || !e.target.classList.contains('bs')) return;
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(function () {
      syncFrame = 0;
      var bs = el.board.querySelector('.bs'), bh = el.board.querySelector('.bh');
      if (bs && bh) bh.scrollLeft = bs.scrollLeft;
    });
  }, { capture: true, passive: true });
  // Горизонтальний свайп тачпадом над шапкою гортає таблицю
  el.board.addEventListener('wheel', function (e) {
    if (!e.target.closest || !e.target.closest('.bh') || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    var bs = el.board.querySelector('.bs');
    if (bs) { bs.scrollLeft += e.deltaX; e.preventDefault(); }
  }, { passive: false });

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
