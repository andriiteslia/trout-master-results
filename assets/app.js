(function () {
  'use strict';

  // ---------- Telegram Mini App ----------
  // Лише коли сторінку відкрито як міні-застосунок Telegram: на весь екран,
  // без закриття свайпом вниз (закривається тільки кнопкою Telegram).
  // У звичайному браузері нічого не завантажується і не змінюється.
  (function initTelegram() {
    var inTg = /tgWebApp/.test(location.hash + location.search) || !!window.TelegramWebviewProxy;
    if (!inTg) return;
    document.documentElement.classList.add('tg');
    var s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = function () {
      var tg = window.Telegram && window.Telegram.WebApp;
      if (!tg) return;
      var at = function (v) { try { return tg.isVersionAtLeast(v); } catch (e) { return false; } };
      try { tg.ready(); } catch (e) { /* */ }
      try { tg.expand(); } catch (e) { /* */ }
      try { if (at('7.7')) tg.disableVerticalSwipes(); } catch (e) { /* */ }
      try {
        if (at('8.0') && /^(ios|android)$/.test(tg.platform) && !tg.isFullscreen) tg.requestFullscreen();
      } catch (e) { /* */ }
      try {
        if (at('6.1')) { tg.setHeaderColor('#080808'); tg.setBackgroundColor('#f4f6f8'); }
        if (at('7.10')) tg.setBottomBarColor('#f4f6f8');
      } catch (e) { /* */ }
      try { document.dispatchEvent(new Event('tm-tg-ready')); } catch (e) { /* */ }
    };
    document.head.appendChild(s);

    // Чи заїхав верх «аркуша» під панель Telegram (тоді малюємо заокруглені кути зверху)
    var frame = 0;
    function updateStuck() {
      frame = 0;
      var tb = document.querySelector('.topbar');
      var main = document.querySelector('.main');
      if (!tb || !main) return;
      var top = parseFloat(getComputedStyle(tb).paddingTop) || 0;
      document.documentElement.classList.toggle('tg-stuck', main.getBoundingClientRect().top <= top + 0.5);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(updateStuck); }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    s.addEventListener('load', schedule);
    document.addEventListener('DOMContentLoaded', schedule);
  })();

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
    selected: new Set(store.get(LS.sel, []).slice(-1)),   // виділяється лише один гравець
    // Раніше можна було виділити кількох: тоді у Telegram один раз перевиділимо «себе»
    legacyMulti: store.get(LS.sel, []).length > 1,
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
    if (isToday(d)) return t;
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + t;   // «31 жов. 23:57»
  }
  var MONTHS = ['січ.', 'лют.', 'бер.', 'кві.', 'тра.', 'чер.', 'лип.', 'сер.', 'вер.', 'жов.', 'лис.', 'гру.'];
  function isToday(d) { return d.toDateString() === new Date().toDateString(); }
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
      return '<td class="' + cls.join(' ') + '"><span class="pn">' + esc(v) + '</span>' + mvHtml + '</td>';
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
        : '<div class="empty is-loading">' +
            '<picture><source srcset="assets/fish.webp" type="image/webp">' +
            '<img class="loader-fish" src="assets/fish.png" width="120" height="58" alt=""></picture>' +
            '<strong>Завантаження результатів…</strong></div>';
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

    // Призери (1–3 місце) — лише на вкладці «Результат» і коли вже є ненульові результати
    var medals = /^результат$/i.test(m.name.trim()) && m.placeCol && m.rows.some(function (row) {
      return cols.some(function (k) {
        return k.numeric && k.role !== 'place' && parseFloat(String(row.cells[k.c]).replace(',', '.')) > 0;
      });
    });
    var flashOn = Date.now() - state.changeTime < 3500;
    // Стрілки ▲▼ вмикаються/вимикаються на аркуші «Сайт» (B9)
    var moves = (state.payload && state.payload.showMoves === false) ? {} : (state.moves[m.name] || {});
    var changed = state.changed[m.name] || {};
    // Список учасників: після N місць (B10 на аркуші «Сайт») — роздільник «Резерв»
    var pl = state.payload || {};
    var seats = parseInt(pl.seats, 10);
    var isList = pl.mode === 'Список учасників' || /учасник/i.test(m.name);
    var reserveAt = isList && seats > 0 && m.rows.length > seats ? seats : -1;
    var body = m.rows.map(function (row, idx) {
      var sel = state.selected.has(row.key);
      var opts = { sel: sel, move: moves[row.key] || 0, flash: flashOn ? changed[row.key] : null };
      var rc = [];
      if (sel) rc.push('is-sel');
      if (medals && row.place >= 1 && row.place <= 3) rc.push('medal medal-' + row.place);
      var sep = idx === reserveAt
        ? '<tr class="reserve-sep"><th scope="rowgroup" colspan="' + cols.length + '"><span>Резерв</span></th></tr>' : '';
      return sep + '<tr data-key="' + esc(row.key) + '"' + (rc.length ? ' class="' + rc.join(' ') + '"' : '') + '>' +
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
    else {
      s = 'live';
      var at = p.changedAt || p.generatedAt;
      // сьогодні: «Оновлено – 14:32», раніше: «Оновлено 31 жов. 23:57»
      text = 'Оновлено ' + (isToday(new Date(at)) ? '\u2013 ' : '') + fmtTime(at);
    }
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
    renderReg();
    if (state.view === 'card') renderCard();
    revealFocusRow();
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
    var early = window.__tmEarly;
    window.__tmEarly = null;
    var req = early ? early.catch(function () { return fetchJson(SOURCE); }) : fetchJson(SOURCE);
    req
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

  // Виділено лише одного гравця (діє на всіх вкладках)
  function selectOnly(key) {
    state.selected = new Set(key ? [key] : []);
    store.set(LS.sel, Array.from(state.selected));
    if (typeof renderReg === 'function' && reg) renderReg();   // кнопка «Картка учасника»
  }

  // Тап по рядку: виділити цього гравця (інших — зняти) / повторний тап — зняти виділення
  el.board.addEventListener('click', function (e) {
    var tr = e.target.closest('tbody tr[data-key]');
    if (!tr) return;
    var key = tr.getAttribute('data-key');
    selectOnly(state.selected.has(key) ? null : key);
    Array.prototype.forEach.call(el.board.querySelectorAll('tbody tr[data-key]'), function (row) {
      var on = state.selected.has(row.getAttribute('data-key'));
      row.classList.toggle('is-sel', on);
      var btn = row.querySelector('.nm');
      if (btn) btn.setAttribute('aria-pressed', String(on));
    });
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

  // ---------- Реєстрація ----------
  // Кнопка «Зареєструватися» видно, коли на аркуші «Сайт» реєстрація «Відкрита».
  // Форма відкривається на тій самій сторінці (без перезавантаження), кнопка «Назад»
  // браузера та Telegram повертає до списку.
  var IN_TG = document.documentElement.classList.contains('tg');
  var reg = {
    root: $('reg'), back: $('regBack'), title: $('regTitle'), event: $('regEvent'),
    form: $('regForm'), name: $('fName'), phone: $('fPhone'), nameErr: $('fNameErr'), phoneErr: $('fPhoneErr'),
    alert: $('regAlert'), submit: $('regSubmit'), done: $('regDone'), doneText: $('regDoneText'),
    toList: $('regToList'), closed: $('regClosed'), closedBack: $('regClosedBack'),
    bar: $('regbar'), open: $('regOpen'), live: $('regLive'),
    timer: $('regTimer'), timerTxt: $('regTimerTxt'), timerSr: $('regTimerSr')
  };
  // ---------- Картка учасника ----------
  // Дані: жеребкування (payload.draw: сектор і суперник по турах) + аркуш «Тури»
  // (результат В/П/РН/БН і риба по турах, підсумок). Статистика рахується тут, з кожної публікації.
  var pc = {
    root: $('pcard'), body: $('pcBody'), back: $('pcBack'),
    open: $('cardOpen'), openText: $('cardOpenText')
  };
  var RES_CODES = { 'В': 'w', 'П': 'l', 'РН': 'd', 'БН': 'z' };
  var RES_TEXT = { w: 'Перемога', l: 'Поразка', d: 'Рибна нічия', z: 'Безрибна нічия' };
  function normName(v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function selectedPlayerName() {
    var k = Array.from(state.selected)[0];
    return k ? String(k).replace(/ #\d+$/, '') : null;
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; }
  function fmt1(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }
  function fishWord(n) { return plural(Math.round(n), 'риба', 'риби', 'риб'); }

  // Аркуш турів із публікації → { rounds, byName: { ім'я: {...} }, tourAvg: [...], totalFish, avgPerTour }
  var toursCache = { payload: null, data: null };
  function toursData() {
    var p = state.payload;
    if (toursCache.payload === p) return toursCache.data;
    var data = null;
    var sh = p && (p.sheets || []).find(function (x) { return (x.values || [])[0] && x.values[0].some(function (v) { return /^тур\s*1$/i.test(String(v).trim()); }); });
    if (sh) {
      var v = sh.values, top = v[0], sub = v[1] || [];
      var tourCols = [];
      top.forEach(function (h, c) { var m = String(h).trim().match(/^тур\s*(\d+)$/i); if (m) tourCols.push({ n: +m[1], c: c }); });
      var nameCol = -1;
      for (var c = 0; c < top.length; c++) if (/учасник/i.test(String(top[c]))) { nameCol = c; break; }
      if (nameCol < 0) nameCol = 1;
      var findSub = function (re) { for (var c = 0; c < sub.length; c++) if (re.test(String(sub[c]).trim())) return c; return -1; };
      var lastTour = tourCols.length ? tourCols[tourCols.length - 1].c + 1 : 0;
      var findSum = function (re) { for (var c = lastTour + 1; c < sub.length; c++) if (re.test(String(sub[c]).trim())) return c; return -1; };
      var col = { points: findSum(/^бали/i), place: findSum(/^місце/i), fish: findSum(/^риб/i) };
      var byName = {}, sums = tourCols.map(function () { return { fish: 0, n: 0 }; });
      v.slice(parseInt(sh.headerRows, 10) || 2).forEach(function (r) {
        var name = String(r[nameCol] || '').trim();
        if (!name) return;
        var tours = tourCols.map(function (tc, i) {
          var code = RES_CODES[String(r[tc.c] || '').trim().toUpperCase()] || null;
          var fish = code ? (num(r[tc.c + 1]) || 0) : null;
          if (code) { sums[i].fish += fish; sums[i].n++; }
          return { n: tc.n, code: code, fish: fish };
        });
        byName[normName(name)] = {
          name: name, tours: tours,
          points: col.points >= 0 ? num(r[col.points]) : null,
          place: col.place >= 0 ? num(r[col.place]) : null
        };
      });
      var totalFish = 0, totalN = 0;
      sums.forEach(function (x) { totalFish += x.fish; totalN += x.n; });
      data = {
        rounds: tourCols.length, byName: byName,
        tourAvg: sums.map(function (x) { return x.n ? x.fish / x.n : null; }),
        totalFish: totalFish, avgPerTour: totalN ? totalFish / totalN : null
      };
    }
    toursCache = { payload: p, data: data };
    return data;
  }
  function drawData() { var d = state.payload && state.payload.draw; return d && d.players ? d : null; }
  function drawPlayer(name) {
    var d = drawData(), key = normName(name);
    return d ? d.players.find(function (x) { return normName(x.name) === key; }) || null : null;
  }
  function hasCardData(name) {
    var t = toursData();
    return !!drawPlayer(name) || !!(t && t.byName[normName(name)]);
  }

  // Усе для картки одного гравця
  function playerStats(name) {
    var t = toursData(), d = drawData();
    var me = t ? t.byName[normName(name)] : null;
    var dp = drawPlayer(name);
    var byNum = {};
    if (d) d.players.forEach(function (x) { byNum[x.n] = x; });
    var rounds = Math.max(me ? me.tours.length : 0, dp ? dp.t.length : 0);
    var tours = [];
    for (var i = 0; i < rounds; i++) {
      var res = me && me.tours[i] ? me.tours[i] : { n: i + 1, code: null, fish: null };
      var dr = dp && dp.t[i] ? dp.t[i] : [null, null];
      var opp = dr[1] && byNum[dr[1]] ? byNum[dr[1]] : null;
      var oppRes = opp && t && t.byName[normName(opp.name)] ? t.byName[normName(opp.name)].tours[i] : null;
      tours.push({
        n: i + 1, sector: dr[0], oppNum: dr[1], oppName: opp ? opp.name : null,
        code: res.code, fish: res.fish,
        oppFish: res.code && oppRes && oppRes.code ? oppRes.fish : null,
        avg: t ? t.tourAvg[i] : null
      });
    }
    var played = tours.filter(function (x) { return x.code; });
    var cnt = { w: 0, d: 0, z: 0, l: 0 };
    played.forEach(function (x) { cnt[x.code]++; });
    var fish = played.reduce(function (a, x) { return a + x.fish; }, 0);
    var streak = 0, cur = 0;
    played.forEach(function (x) { cur = x.code === 'w' ? cur + 1 : 0; if (cur > streak) streak = cur; });
    var best = null;
    played.forEach(function (x) { if (!best || x.fish > best.fish) best = x; });
    // Сектори: середній улов у кожному секторі, де гравець уже рибалив
    var sec = {};
    played.forEach(function (x) { if (!x.sector) return; (sec[x.sector] = sec[x.sector] || []).push(x); });
    var secList = Object.keys(sec).map(function (k) {
      var arr = sec[k], sum = arr.reduce(function (a, x) { return a + x.fish; }, 0);
      return { sector: +k, avg: sum / arr.length, times: arr.length, tours: arr.map(function (x) { return x.n; }) };
    });
    secList.sort(function (a, b) { return b.avg - a.avg || a.sector - b.sector; });
    var meet = { w: [], d: [], z: [], l: [] };
    played.forEach(function (x) { if (x.oppName) meet[x.code].push(x); });
    return {
      name: me ? me.name : (dp ? dp.name : name), num: dp ? dp.n : null, side: dp ? dp.side : '',
      tours: tours, played: played.length, cnt: cnt, fish: fish,
      points: me ? me.points : null, place: me ? me.place : null,
      winRate: played.length ? cnt.w / played.length : null,
      avg: played.length ? fish / played.length : null,
      tAvg: t ? t.avgPerTour : null,
      share: t && t.totalFish ? fish / t.totalFish : null, totalFish: t ? t.totalFish : 0,
      best: best, streak: streak,
      secBest: secList.length > 1 ? secList[0] : null, secWorst: secList.length > 1 ? secList[secList.length - 1] : null,
      meet: meet, hasResults: !!me, hasDraw: !!dp,
      nextTour: tours.find(function (x) { return !x.code; }) || null
    };
  }

  function renderCard() {
    var name = selectedPlayerName();
    if (!name || !hasCardData(name)) { pc.body.innerHTML = '<div class="card empty">Виберіть учасника в таблиці.</div>'; return; }
    var st = playerStats(name);
    // Сторона з жеребкування: «лівий» → Л, «правий» → П
    var sideL = /^л/i.test(st.side) ? 'Л' : /^п/i.test(st.side) ? 'П' : '';
    var sideWord = sideL === 'Л' ? 'лівий' : sideL === 'П' ? 'правий' : '';
    var ev = (state.payload && state.payload.event) || {};
    document.title = st.name + ' | Trout Master';
    var started = st.played > 0;
    var medal = started && st.place >= 1 && st.place <= 3 ? ' medal-' + st.place : '';
    var h = '';

    // Шапка
    h += '<header class="pc-head">' +
      (started && st.place ? '<div class="pc-place' + medal + '" aria-hidden="true">' + st.place + '</div>' : '') +
      '<div class="pc-head__txt"><h1 class="title" id="pcTitle" tabindex="-1">' + esc(st.name) + '</h1>' +
      '<p class="subtitle">' + [st.num ? '№ ' + st.num : '', ev.title || ''].filter(Boolean).map(esc).join(' • ') + '</p></div></header>';

    // Плитки
    if (started) {
      h += '<div class="pc-tiles">' +
        tile('Місце', st.place != null ? st.place : '—') +
        tile('Бали', st.points != null ? st.points : '—') +
        tile('Улов', st.fish, fishWord(st.fish)) +
        '<div class="pc-tile pc-tile--wdl"><span class="pc-tile__label">В · РН · БН · П</span><span class="pc-tile__val">' +
          '<b class="c-w">' + st.cnt.w + '</b><i>·</i><b class="c-d">' + st.cnt.d + '</b><i>·</i><b class="c-z">' + st.cnt.z + '</b><i>·</i><b class="c-l">' + st.cnt.l + '</b></span></div>' +
        '</div>';
    } else {
      h += '<p class="info pc-note">Турнір ще не почався. Тут уже видно жеребкування, а статистика з’явиться після перших турів.</p>';
    }

    // Тури
    h += '<section class="card pc-block"><h2 class="pc-h2">Тури</h2>' +
      '<div class="pc-tour pc-tour--head" aria-hidden="true"><span>Тур</span><span>Сектор</span><span>Суперник</span><span class="pc-tour__res">Результат</span></div>' +
      '<ol class="pc-tours">' +
      st.tours.map(function (x) {
        var next = st.nextTour === x && started;
        var res = x.code
          ? '<span class="code ' + ({ w: 'code-w', l: 'code-l', d: 'code-d', z: 'code-z' })[x.code] + '" title="' + RES_TEXT[x.code] + '">' +
              ({ w: 'В', l: 'П', d: 'РН', z: 'БН' })[x.code] + '</span>' +
            '<span class="pc-score">' + x.fish + (x.oppFish != null ? ' : ' + x.oppFish : '') + '</span>'
          : '<span class="pc-wait">' + (next ? 'наступний' : 'очікується') + '</span>';
        return '<li class="pc-tour' + (x.code ? '' : ' is-wait') + (next ? ' is-next' : '') + '">' +
          '<span class="pc-tour__n" title="Тур ' + x.n + '">Т' + x.n + '</span>' +
          '<span class="pc-tour__sec">' + (x.sector ? '<span class="visually-hidden">сектор </span><b>' + x.sector + '</b>' +
            (sideL ? '<span class="pc-side" aria-hidden="true">' + sideL + '</span><span class="visually-hidden">, ' + sideWord + '</span>' : '') : '') + '</span>' +
          '<span class="pc-tour__opp">' + (x.oppName ? '<span class="pc-num">№' + x.oppNum + '</span> ' + esc(x.oppName) : (x.oppNum ? '№' + x.oppNum : '')) + '</span>' +
          '<span class="pc-tour__res">' + res + '</span>' +
          (x.code ? '<span class="visually-hidden">, ' + RES_TEXT[x.code] + ', ' + x.fish + ' ' + fishWord(x.fish) +
            (x.oppFish != null ? ' проти ' + x.oppFish : '') + '</span>' : '') +
          '</li>';
      }).join('') + '</ol></section>';

    if (started) {
      // Графік улову по турах
      h += '<section class="card pc-block"><h2 class="pc-h2">Улов по турах</h2>' + chartSvg(st) +
        '<p class="pc-legend"><span class="lg-bar"></span>улов учасника <span class="lg-line"></span>середній улов у турі</p></section>';

      // Статистика
      var rows = [];
      rows.push(stat('Відсоток перемог', Math.round(st.winRate * 100) + '%', st.cnt.w + ' з ' + st.played + ' ' + plural(st.played, 'туру', 'турів', 'турів')));
      rows.push(stat('Середній улов за тур', fmt1(st.avg) + ' ' + fishWord(st.avg), st.tAvg != null ? 'по турніру в середньому ' + fmt1(st.tAvg) : ''));
      if (st.share != null) rows.push(stat('Частка від усієї риби', fmt1(st.share * 100) + '%', st.fish + ' з ' + st.totalFish + ' ' + fishWord(st.totalFish) + ' турніру'));
      if (st.best) rows.push(stat('Найкращий тур', 'Тур ' + st.best.n, st.best.fish + ' ' + fishWord(st.best.fish) + (st.best.sector ? ', сектор ' + st.best.sector : '')));
      rows.push(stat('Найдовша серія перемог', st.streak ? st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + ' поспіль' : '—', ''));
      if (st.secBest) rows.push(stat('Найуловистіший сектор', 'Сектор ' + st.secBest.sector, secText(st.secBest)));
      if (st.secWorst) rows.push(stat('Найслабший сектор', 'Сектор ' + st.secWorst.sector, secText(st.secWorst)));
      h += '<section class="card pc-block"><h2 class="pc-h2">Статистика</h2><dl class="pc-stats">' + rows.join('') + '</dl></section>';

      // Особисті зустрічі
      var groups = [['w', 'Обіграв'], ['d', 'Рибна нічия'], ['z', 'Безрибна нічия'], ['l', 'Програв']].filter(function (g) { return st.meet[g[0]].length; });
      if (groups.length) {
        h += '<section class="card pc-block"><h2 class="pc-h2">Особисті зустрічі</h2>' + groups.map(function (g) {
          return '<div class="pc-meet"><span class="pc-meet__k c-' + g[0] + '">' + g[1] + ' (' + st.meet[g[0]].length + ')</span><ul class="pc-chips">' +
            st.meet[g[0]].map(function (x) { return '<li>' + esc(x.oppName) + ' <span>' + x.fish + ':' + (x.oppFish != null ? x.oppFish : '?') + '</span></li>'; }).join('') +
            '</ul></div>';
        }).join('') + '</section>';
      }
    }
    pc.body.innerHTML = h;

    function tile(label, val, unit) {
      return '<div class="pc-tile"><span class="pc-tile__label">' + label + '</span><span class="pc-tile__val">' + esc(val) +
        (unit ? ' <small>' + unit + '</small>' : '') + '</span></div>';
    }
    function stat(k, v, sub) {
      return '<div class="pc-stat"><dt>' + k + '</dt><dd><b>' + esc(v) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</dd></div>';
    }
    function secText(x) {
      return x.times > 1 ? 'в середньому ' + fmt1(x.avg) + ' ' + fishWord(x.avg) + ' (' + x.times + ' тури)' : fmt1(x.avg) + ' ' + fishWord(x.avg) + ' (тур ' + x.tours[0] + ')';
    }
  }

  // Стовпчики улову по турах + точки середнього улову в турі
  function chartSvg(st) {
    var n = st.tours.length, W = 320, H = 130, top = 14, bottom = 22, gap = 4;
    var max = 1;
    st.tours.forEach(function (x) { if (x.fish > max) max = x.fish; if (x.avg > max) max = x.avg; });
    var bw = (W - gap * (n - 1)) / n, ph = H - top - bottom;
    var y = function (v) { return top + ph - (v / max) * ph; };
    var out = '<svg class="pc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Улов по турах">';
    out += '<line x1="0" x2="' + W + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" class="ax"/>';
    st.tours.forEach(function (x, i) {
      var x0 = i * (bw + gap);
      if (x.code) {
        var hh = Math.max(x.fish > 0 ? 2 : 0, (x.fish / max) * ph);
        out += '<rect x="' + x0 + '" y="' + (top + ph - hh) + '" width="' + bw + '" height="' + hh + '" rx="2" class="bar bar-' + x.code + '"><title>Тур ' + x.n + ': ' + x.fish + '</title></rect>';
        out += '<text x="' + (x0 + bw / 2) + '" y="' + (top + ph - hh - 3) + '" class="val">' + x.fish + '</text>';
      } else {
        out += '<rect x="' + (x0 + 0.5) + '" y="' + (top + ph - 8) + '" width="' + (bw - 1) + '" height="8" rx="2" class="bar-wait"/>';
      }
      out += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 6) + '" class="lbl">' + x.n + '</text>';
    });
    // Середній улов у турі — лінія через усі зіграні тури (по центру стовпчиків)
    var pts = [];
    st.tours.forEach(function (x, i) {
      if (x.code && x.avg != null) pts.push((i * (bw + gap) + bw / 2).toFixed(1) + ',' + y(x.avg).toFixed(1));
    });
    if (pts.length > 1) out += '<polyline points="' + pts.join(' ') + '" class="avg-line"/>';
    else if (pts.length === 1) {
      var c = pts[0].split(',');
      out += '<line x1="' + (+c[0] - bw / 2) + '" x2="' + (+c[0] + bw / 2) + '" y1="' + c[1] + '" y2="' + c[1] + '" class="avg-line"/>';
    }
    return out + '</svg>';
  }

  var PREFIX = '+380 ';
  state.view = 'list';
  state.regDone = null;      // { name, number } після успішної реєстрації
  state.regTried = false;    // показувати помилки під час введення лише після першої спроби
  state.regSending = false;
  state.regPushed = false;
  state.focusKey = null;

  function regDeadline() {
    var d = state.payload && state.payload.regDeadline ? new Date(state.payload.regDeadline) : null;
    return d && !isNaN(d) ? d : null;
  }
  function regOpenNow() {
    if (!(state.payload && state.payload.registration === true)) return false;
    var d = regDeadline();
    return !d || Date.now() < d.getTime();
  }

  // ----- Зворотний відлік до завершення реєстрації -----
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtLeft(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
    return (d ? d + ' д ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
  }
  var timerId = null;
  function renderTimer() {
    var d = regDeadline();
    var on = !!d && !reg.live.hidden;
    reg.timer.hidden = !on;
    if (!on) { clearInterval(timerId); timerId = null; return; }
    var left = d.getTime() - Date.now();
    if (left <= 0) { clearInterval(timerId); timerId = null; renderReg(); return; }   // час вийшов: ховаємо кнопку
    reg.timerTxt.innerHTML = 'до кінця ' + fmtLeft(left).replace(/\d/g, '<span class="dg">$&</span>');
    var sr = 'Реєстрація триває до ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' +
      d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (reg.timerSr.textContent !== sr) reg.timerSr.textContent = sr;
    if (!timerId) timerId = setInterval(renderTimer, 1000);
  }
  // Форма відкрита, а час вийшов — показати «Реєстрацію закрито»
  setInterval(function () {
    var d = regDeadline();
    if (state.view === 'reg' && d && Date.now() >= d.getTime() && !reg.form.hidden && !state.regSending) renderReg();
  }, 1000);

  function renderReg() {
    var isReg = state.view === 'reg';
    var isList = state.view === 'list';
    var html = document.documentElement;
    html.classList.toggle('view-reg', isReg);
    html.classList.toggle('view-card', state.view === 'card');
    reg.root.hidden = !isReg;
    pc.root.hidden = state.view !== 'card';
    // Нижня панель: «Картка учасника» (коли виділено гравця) і «Зареєструватися» (коли реєстрація відкрита)
    var showReg = isList && regOpenNow();
    var player = isList ? selectedPlayerName() : null;
    var cardOn = !(state.payload && state.payload.showCard === false);   // B12 на аркуші «Сайт»
    var showCard = cardOn && !!player && hasCardData(player);
    reg.open.hidden = !showReg;
    pc.open.hidden = !showCard;
    pc.openText.textContent = showReg ? 'Картка учасника' : 'Картка учасника · ' + player;
    pc.open.classList.toggle('btn-primary', !showReg);
    pc.open.classList.toggle('btn-secondary', showReg);
    reg.bar.classList.toggle('two', showReg && showCard);
    var showBar = showReg || showCard;
    reg.bar.hidden = !showBar;
    reg.live.hidden = !showReg;   // плашка «Триває реєстрація» над таблицею
    renderTimer();
    html.classList.toggle('has-regbar', showBar);
    if (!isReg) return;

    var ev = (state.payload && state.payload.event) || {};
    var line = [ev.title, ev.subtitle].filter(Boolean).join(' • ');
    reg.event.textContent = line;
    reg.event.hidden = !line;
    document.title = 'Реєстрація | Trout Master';

    var closed = !state.regDone && !!state.payload && !regOpenNow();
    reg.form.hidden = !!state.regDone || closed;
    reg.done.hidden = !state.regDone;
    reg.closed.hidden = !closed;
    if (state.regDone) {
      reg.doneText.innerHTML = '<strong>' + esc(state.regDone.name) + '</strong>, ви в списку учасників' +
        (state.regDone.number ? ' під номером ' + esc(state.regDone.number) : '') + '.';
    }
  }

  function tgBack(show) {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.BackButton) return;
    try {
      if (!tg.isVersionAtLeast('6.1')) return;
      tg.BackButton.offClick(goList);
      if (show) { tg.BackButton.onClick(goList); tg.BackButton.show(); } else tg.BackButton.hide();
    } catch (e) { /* */ }
  }

  function setView(v) {
    if (state.view === v) return;
    state.view = v;
    renderReg();
    tgBack(v !== 'list');
    window.scrollTo(0, 0);
    if (v === 'card') {
      renderCard();
      var h = document.getElementById('pcTitle');
      if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    } else if (v === 'reg') {
      try { reg.title.focus({ preventScroll: true }); } catch (e) { reg.title.focus(); }
      if (!DEMO && state.payload) load();   // перевірити, чи реєстрація досі відкрита
    } else {
      renderHeader();
      renderBoard();
      revealFocusRow();
    }
  }

  function goReg() {
    if (state.view === 'reg') return;
    state.regDone = null;
    state.regPushed = true;
    try { history.pushState({ tmView: 'reg' }, '', IN_TG ? location.href : '#register'); } catch (e) { state.regPushed = false; }
    setView('reg');
  }

  function goCard() {
    if (state.view === 'card') return;
    state.regPushed = true;
    try { history.pushState({ tmView: 'card' }, '', IN_TG ? location.href : '#player'); } catch (e) { state.regPushed = false; }
    setView('card');
  }

  function goList() {
    if (state.view === 'list') return;
    if (state.regPushed && history.state && history.state.tmView === state.view) { history.back(); return; }
    try { history.replaceState({ tmView: 'list' }, '', IN_TG ? location.href : location.pathname + location.search); } catch (e) { /* */ }
    setView('list');
  }

  window.addEventListener('hashchange', function () {
    if (location.hash !== '#register' || state.view === 'reg') return;
    state.regDone = null;
    state.regPushed = false;
    try { history.replaceState({ tmView: 'reg' }, '', location.href); } catch (e) { /* */ }
    setView('reg');
  });
  document.addEventListener('tm-tg-ready', function () { if (state.view !== 'list') tgBack(true); });

  // ----- Telegram: автоматично виділити свій рядок -----
  // Скрипт таблиці за підписаними даними Telegram знаходить ім'я людини (колонка G → B).
  // Виділяємо кожне ім'я лише один раз: якщо людина зняла виділення, воно не повертається.
  var LS_AUTO = 'tm:autoSel';
  function applyMyNames(names) {
    var done = store.get(LS_AUTO, []);
    // Було старе виділення кількох рядків — ставимо одне: першу реєстрацію з цього акаунта (себе)
    if (state.legacyMulti && names.length) {
      state.legacyMulti = false;
      names.forEach(function (n) { if (done.indexOf(n) === -1) done.push(n); });
      store.set(LS_AUTO, done.slice(-50));
      if (!state.selected.has(names[0])) { selectOnly(names[0]); if (state.models.length) renderBoard(); }
      return;
    }
    // Перше ім'я (своя реєстрація), якого ще не виділяли автоматично
    var pick = null;
    names.forEach(function (n) {
      if (done.indexOf(n) !== -1) return;
      done.push(n);
      if (!pick) pick = n;
    });
    store.set(LS_AUTO, done.slice(-50));
    if (!pick || state.selected.has(pick)) return;
    selectOnly(pick);
    if (state.models.length) renderBoard();
  }
  function whoAmI() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (DEMO || !tg || !tg.initData) return;
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'whoami', tg: tg.initData })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (res && res.ok && res.canWrite === true) state.canWrite = true;
        if (res && res.ok && Array.isArray(res.names)) applyMyNames(res.names);
      })
      .catch(function () { /* не вийшло — нічого страшного */ });
  }
  document.addEventListener('tm-tg-ready', whoAmI);

  // ----- Telegram: дозвіл боту писати (нагадування, результати) -----
  // Пропонуємо після реєстрації: системне вікно Telegram «Дозволити боту надсилати повідомлення?»
  var LS_WRITE = 'tm:writeOk';
  function tgApp() { return window.Telegram && window.Telegram.WebApp; }
  function canOfferNotify() {
    var tg = tgApp();
    if (DEMO || !tg || !tg.initData || typeof tg.requestWriteAccess !== 'function') return false;
    try { if (!tg.isVersionAtLeast('6.9')) return false; } catch (e) { return false; }
    var u = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u && u.allows_write_to_pm) return false;
    return !state.canWrite && !store.get(LS_WRITE, false);
  }
  function renderNotify(mode) {   // 'offer' | 'ok' | 'none'
    var nb = $('regNotify'), ok = $('regNotifyOk'), toList = $('regToList');
    nb.hidden = mode !== 'offer';
    ok.hidden = mode !== 'ok';
    // Поки пропонуємо сповіщення, головна кнопка — вона, а «Переглянути список» другорядна
    toList.classList.toggle('btn-primary', mode !== 'offer');
    toList.classList.toggle('btn-secondary', mode === 'offer');
  }
  function sendWriteAccess(granted) {
    var tg = tgApp();
    if (!tg || !tg.initData) return;
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'writeAccess', tg: tg.initData, granted: granted })
    }).catch(function () { /* */ });
  }
  $('regNotifyBtn').addEventListener('click', function () {
    var tg = tgApp();
    if (!tg) return;
    try {
      tg.requestWriteAccess(function (granted) {
        if (granted) {
          state.canWrite = true;
          store.set(LS_WRITE, true);
          renderNotify('ok');
          sendWriteAccess(true);
        } else {
          renderNotify('none');
        }
      });
    } catch (e) { renderNotify('none'); }
  });

  window.addEventListener('popstate', function (e) {
    var v = e.state && (e.state.tmView === 'reg' || e.state.tmView === 'card') ? e.state.tmView : 'list';
    if (v === 'card' && !selectedPlayerName()) v = 'list';
    if (v === 'list') state.regPushed = false;
    setView(v);
  });

  // Після реєстрації: прокрутити до свого рядка у списку
  function revealFocusRow() {
    if (!state.focusKey || state.view !== 'list') return;
    var rows = el.board.querySelectorAll('tbody tr[data-key]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-key') === state.focusKey) {
        rows[i].scrollIntoView({ block: 'center' });
        state.focusKey = null;
        return;
      }
    }
  }

  // ----- Маска номера: «+380 » уже стоїть, вводяться лише 9 цифр -----
  function localDigits(raw) {
    var v = String(raw || '');
    var d = v.replace(/\D/g, '');
    if (/^\s*\+/.test(v)) {
      if (d.indexOf('380') === 0) d = d.slice(3);
      else d = d.replace(/^3?8?0?/, '');   // частину префікса стерли
    } else if (d.indexOf('380') === 0 && d.length >= 12) d = d.slice(3);
    else if (d.indexOf('80') === 0 && d.length >= 11) d = d.slice(2);
    else if (d.charAt(0) === '0' && d.length >= 10) d = d.slice(1);
    return d.slice(0, 9);
  }
  function formatLocal(d) {
    var parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    return PREFIX + parts.join(' ');
  }
  // Позиція курсора після k-ї цифри локальної частини
  function caretAfter(formatted, k) {
    if (k <= 0) return PREFIX.length;
    var seen = 0;
    for (var i = PREFIX.length; i < formatted.length; i++) {
      if (/\d/.test(formatted.charAt(i)) && ++seen === k) return i + 1;
    }
    return formatted.length;
  }
  function applyMask(keepCaret) {
    var inp = reg.phone;
    var raw = inp.value;
    var atEnd = inp.selectionStart == null || inp.selectionStart >= raw.length;
    var d = localDigits(raw);
    var before = 0;
    if (keepCaret && !atEnd) {
      // скільки цифр локальної частини стоїть до курсора
      var all = raw.replace(/\D/g, '').length;
      var head = raw.slice(0, inp.selectionStart).replace(/\D/g, '').length;
      before = Math.max(0, Math.min(d.length, head - (all - d.length)));
    }
    var out = formatLocal(d);
    if (inp.value !== out) inp.value = out;
    var pos = keepCaret && !atEnd ? caretAfter(out, before) : out.length;
    try { if (document.activeElement === inp) inp.setSelectionRange(pos, pos); } catch (e) { /* */ }
  }
  reg.phone.addEventListener('focus', function () {
    var empty = !localDigits(reg.phone.value);
    if (empty) reg.phone.value = PREFIX;
    // курсор після «+380 », щоб одразу вводити номер
    setTimeout(function () {
      var inp = reg.phone;
      if (document.activeElement !== inp) return;
      try {
        if (empty) inp.setSelectionRange(inp.value.length, inp.value.length);
        else if (inp.selectionStart < PREFIX.length && inp.selectionEnd <= PREFIX.length) inp.setSelectionRange(PREFIX.length, PREFIX.length);
      } catch (e) { /* */ }
    }, 0);
  });
  reg.phone.addEventListener('blur', function () {
    if (!localDigits(reg.phone.value)) reg.phone.value = '';
    if (state.regTried) validate(false);
  });
  reg.phone.addEventListener('keydown', function (e) {
    // не даємо стерти «+380 »
    var a = reg.phone.selectionStart, b = reg.phone.selectionEnd;
    if (e.key === 'Backspace' && a === b && a <= PREFIX.length) { e.preventDefault(); return; }
    // Backspace одразу після пробілу стирає цифру перед ним
    if (e.key === 'Backspace' && a === b && reg.phone.value.charAt(a - 1) === ' ') {
      try { reg.phone.setSelectionRange(a - 1, a - 1); } catch (x) { /* */ }
    }
    if (e.key === 'Delete' && b <= PREFIX.length - 1) e.preventDefault();
  });
  reg.phone.addEventListener('input', function () {
    applyMask(true);
    if (state.regTried) validate(false);
  });
  reg.name.addEventListener('input', function () { if (state.regTried) validate(false); });
  reg.name.addEventListener('blur', function () {
    reg.name.value = reg.name.value.replace(/\s+/g, ' ').trim();
    if (state.regTried) validate(false);
  });

  // ----- Перевірка полів (ті самі правила, що й у скрипті таблиці) -----
  var WORD_RE = /^[A-Za-zЀ-ӿ]+(?:[-'’ʼ][A-Za-zЀ-ӿ]+)*$/;
  function nameError(v) {
    var s = String(v).replace(/\s+/g, ' ').trim();
    if (!s) return 'Вкажіть прізвище та ім’я.';
    var words = s.split(' ');
    if (!words.every(function (w) { return WORD_RE.test(w); })) return 'Використовуйте лише літери, дефіс та апостроф.';
    if (words.length < 2 || words.some(function (w) { return w.length < 2; })) return 'Вкажіть і прізвище, і ім’я, наприклад: Шевченко Тарас.';
    if (words.length > 4 || s.length > 60) return 'Задовге ім’я. Вкажіть лише прізвище та ім’я.';
    return '';
  }
  function phoneError(v) {
    var d = localDigits(v);
    if (!d) return 'Вкажіть номер телефону.';
    if (d.charAt(0) === '0') return 'Перевірте номер: після +380 не може йти 0.';
    if (d.length < 9) return 'Номер неповний: після +380 потрібно ввести 9 цифр.';
    return '';
  }
  // «  шевченко   тарас » → «Шевченко Тарас» (так само робить скрипт таблиці)
  function normalizeName(v) {
    return String(v || '').replace(/[\u2018\u2019\u02BC`]/g, '\u2019').replace(/\s+/g, ' ').trim().split(' ').map(function (w) {
      if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
      return w.toLowerCase().replace(/(^|[-\u2019'])(\S)/g, function (m, x, y) { return x + y.toUpperCase(); });
    }).join(' ');
  }
  function setFieldError(inp, box, msg) {
    box.textContent = msg;
    box.hidden = !msg;
    if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
  }
  function validate(focus) {
    var ne = nameError(reg.name.value);
    var pe = phoneError(reg.phone.value);
    setFieldError(reg.name, reg.nameErr, ne);
    setFieldError(reg.phone, reg.phoneErr, pe);
    if (focus) { if (ne) reg.name.focus(); else if (pe) reg.phone.focus(); }
    return !ne && !pe;
  }
  function showAlert(msg) {
    reg.alert.textContent = msg || '';
    reg.alert.hidden = !msg;
  }
  function setSending(on) {
    state.regSending = on;
    reg.submit.disabled = on;
    reg.form.setAttribute('aria-busy', String(on));
    reg.name.readOnly = on;
    reg.phone.readOnly = on;
    reg.submit.classList.toggle('is-loading', on);
    reg.submit.querySelector('.btn__text').textContent = on ? 'Надсилаємо…' : 'Підтвердити реєстрацію';
  }

  function sendRegistration(body) {
    if (DEMO) {
      return new Promise(function (res) { setTimeout(function () { res({ ok: true, number: 0, name: body.name }); }, 600); });
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    // text/plain — щоб браузер не робив попередній CORS-запит, який Apps Script не підтримує
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  reg.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.regSending) return;
    state.regTried = true;
    showAlert('');
    reg.name.value = reg.name.value.replace(/\s+/g, ' ').trim();
    if (!validate(true)) return;
    var body = {
      action: 'register',
      name: normalizeName(reg.name.value),
      phone: '+380' + localDigits(reg.phone.value),
      website: reg.form.elements.website.value,
      // Дані Telegram (ID, @username) — лише коли форму відкрито в боті
      tg: (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || ''
    };
    setSending(true);
    sendRegistration(body)
      .then(function (res) {
        if (!res || res.ok !== true) {
          var msg = (res && res.error) || 'Не вдалося зареєструватися. Спробуйте ще раз.';
          if (res && res.code === 'name') setFieldError(reg.name, reg.nameErr, msg);
          else if (res && res.code === 'phone') setFieldError(reg.phone, reg.phoneErr, msg);
          else showAlert(msg);
          if (res && res.code === 'closed' && state.payload) { state.payload.registration = false; renderReg(); }
          return;
        }
        var name = res.name || body.name;
        state.regDone = { name: name, number: res.number };
        // Виділяємо себе у списку
        selectOnly(name);
        var auto = store.get(LS_AUTO, []);
        if (auto.indexOf(name) === -1) { auto.push(name); store.set(LS_AUTO, auto.slice(-50)); }
        state.focusKey = name;
        reg.form.reset();
        state.regTried = false;
        renderReg();
        renderNotify(canOfferNotify() ? 'offer' : 'none');
        try { reg.done.focus({ preventScroll: true }); } catch (x) { reg.done.focus(); }
        load();   // підтягнути оновлений список
      })
      .catch(function () {
        showAlert('Не вдалося надіслати заявку. Перевірте інтернет і спробуйте ще раз.');
      })
      .finally(function () { setSending(false); });
  });

  reg.open.addEventListener('click', goReg);
  pc.open.addEventListener('click', goCard);
  pc.back.addEventListener('click', goList);
  // iOS Safari вмикає стан :active (натиснута кнопка) лише якщо на сторінці є обробник дотику
  document.addEventListener('touchstart', function () {}, { passive: true });
  reg.back.addEventListener('click', goList);
  reg.toList.addEventListener('click', goList);
  reg.closedBack.addEventListener('click', goList);

  // Пряме посилання на форму: сайт#register або t.me/бот?startapp=register
  if (location.hash === '#player') {
    try { history.replaceState({ tmView: 'list' }, '', location.pathname + location.search); } catch (e) { /* */ }
  }
  var wantReg = /^#register$/.test(location.hash) || /tgWebAppStartParam=register(&|$)/.test(location.hash + location.search);

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
  if (wantReg) {
    try { history.replaceState({ tmView: 'list' }, '', IN_TG ? location.href : location.pathname + location.search); } catch (e) { /* */ }
    goReg();
  }
})();
