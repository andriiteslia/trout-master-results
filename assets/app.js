(function () {
  'use strict';

  // ---------- Telegram Mini App ----------
  // Лише коли сторінку відкрито як міні-застосунок Telegram: на весь екран,
  // без закриття свайпом вниз (закривається тільки кнопкою Telegram).
  // У звичайному браузері нічого не завантажується і не змінюється.
  var IN_TG = /tgWebApp/.test(location.hash + location.search) || !!window.TelegramWebviewProxy;
  (function initTelegram() {
    if (!IN_TG) return;
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

  function renderTable() {
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

  function renderAll() {
    renderInfo();
    renderHeader();
    renderTabs();
    renderBoard();
    renderReg();
    if (state.view === 'card') renderCard();
    if (state.view === 'stats') renderStats();
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
        openWantedPlayer();
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
    var tr = e.target.closest('.r[data-key], tbody tr[data-key]');
    if (!tr) return;
    var key = tr.getAttribute('data-key');
    selectOnly(state.selected.has(key) ? null : key);
    Array.prototype.forEach.call(el.board.querySelectorAll('[data-key]'), function (row) {
      var on = state.selected.has(row.getAttribute('data-key'));
      row.classList.toggle('is-sel', on);
      if (row.hasAttribute('aria-selected')) row.setAttribute('aria-selected', String(on));
      var btn = row.querySelector('button.nm');
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

  // Сектори по всьому турніру: середній улов на одного учасника за тур у кожному секторі
  var secCache = { payload: null, data: null };
  function tournamentSectors() {
    if (secCache.payload === state.payload) return secCache.data;
    var t = toursData(), d = drawData(), list = null;
    if (t && d) {
      var acc = {};
      d.players.forEach(function (pl) {
        var me = t.byName[normName(pl.name)];
        if (!me) return;
        pl.t.forEach(function (x, i) {
          var r = me.tours[i];
          if (!x[0] || !r || !r.code) return;
          var a = acc[x[0]] || (acc[x[0]] = { sector: x[0], fish: 0, n: 0 });
          a.fish += r.fish; a.n++;
        });
      });
      list = Object.keys(acc).map(function (k) { var a = acc[k]; return { sector: a.sector, avg: a.fish / a.n, fish: a.fish, n: a.n }; });
      list.sort(function (a, b) { return b.avg - a.avg || a.sector - b.sector; });
      if (list.length < 2) list = null;
    }
    secCache = { payload: state.payload, data: list };
    return list;
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
      vsOpp: (function () {
        var mine = 0, theirs = 0, n = 0;
        played.forEach(function (x) { if (x.oppFish != null) { mine += x.fish; theirs += x.oppFish; n++; } });
        return n ? { mine: mine, theirs: theirs, n: n } : null;
      })(),
      nextTour: tours.find(function (x) { return !x.code; }) || null
    };
  }

  // Сусіди в заліку для кнопок «‹ ›» у картці
  function cardOrder() {
    var s = standingsRows();
    var list = s ? s.rows.map(function (r) { return { key: r.key, name: r.name }; }) : [];
    if (!list.length) { var t = toursData(); if (t) list = Object.keys(t.byName).map(function (k) { return { key: t.byName[k].name, name: t.byName[k].name }; }); }
    return list.filter(function (x) { return hasCardData(x.name); });
  }
  function cardNav(name) {
    var list = cardOrder(), i = -1;
    list.forEach(function (x, j) { if (normName(x.name) === normName(name)) i = j; });
    return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
  }
  function cardPlayersCount() {
    var s = standingsRows();
    if (s) return s.rows.length;
    var t = toursData();
    return t ? Object.keys(t.byName).length : 0;
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

    // Шапка: на телефоні темна, на комп'ютері світла
    var nav = cardNav(name);
    var total = cardPlayersCount();
    var placeTxt = started && st.place ? st.place + ' місце' + (total ? ' з ' + total : '') : '';
    var chips = [st.num ? '№ ' + st.num : '', sideWord ? sideWord.charAt(0).toUpperCase() + sideWord.slice(1) + ' берег' : ''].filter(Boolean);
    var I_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    var I_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    var I_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
    h += '<header class="pc-hero"><div class="pc-hero__bar">' +
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span class="l-m">Назад</span><span class="l-d">До заліку</span></button>' +
      '<span class="pc-hero__acts">' +
        (nav.prev ? '<button type="button" class="pc-ibtn d-only" data-act="prev" aria-label="Попередній учасник: ' + esc(nav.prev.name) + '">' + I_BACK + '</button>' : '') +
        (nav.next ? '<button type="button" class="pc-ibtn d-only" data-act="next" aria-label="Наступний учасник: ' + esc(nav.next.name) + '">' + I_NEXT + '</button>' : '') +
        '<button type="button" class="pc-share" data-act="share" aria-label="Поділитися карткою">' + I_SHARE + '<span class="d-only">Поділитися карткою</span></button>' +
      '</span></div>' +
      '<div class="pc-hero__main">' +
      (started && st.place ? '<div class="pc-place' + medal + '" aria-hidden="true">' + st.place + '</div>' : '') +
      '<div class="pc-head__txt"><h1 class="title" id="pcTitle" tabindex="-1">' + esc(st.name) + '</h1>' +
      '<p class="pc-sub m-only">' + esc([st.num ? '№ ' + st.num : '', sideWord ? sideWord + ' берег' : '', placeTxt].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="pc-chips d-only">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') +
        (placeTxt ? '<span class="chip chip-place' + medal + '">' + esc(placeTxt) + '</span>' : '') +
        (ev.title ? '<span class="chip chip-plain">' + esc(ev.title) + '</span>' : '') + '</p>' +
      '</div></div></header><div class="pc-sheet">';

    // Плитки
    if (started) {
      var diff = st.vsOpp ? st.vsOpp.mine - st.vsOpp.theirs : null;
      h += '<div class="pc-k">' +
        '<div class="pk"><span class="pk__l">Бали</span><span class="pk__v">' + (st.points != null ? st.points : '—') + '</span>' +
          '<span class="pk__wdl" role="img" aria-label="' + st.cnt.w + ' перемог, ' + st.cnt.d + ' рибних нічиїх, ' + st.cnt.z + ' безрибних, ' + st.cnt.l + ' поразок">' +
          ['w', 'd', 'z', 'l'].map(function (c) { return st.cnt[c] ? '<i class="fl-' + c + '" style="flex:' + st.cnt[c] + '"></i>' : ''; }).join('') + '</span>' +
          '<span class="pk__s d-only">' + st.cnt.w + ' В · ' + st.cnt.d + ' РН · ' + st.cnt.z + ' БН · ' + st.cnt.l + ' П</span></div>' +
        '<div class="pk"><span class="pk__l">Улов</span><span class="pk__v">' + st.fish + ' <small>' + fishWord(st.fish) + '</small></span>' +
          '<span class="pk__s">' + (st.avg != null ? fmt1(st.avg) + ' за тур' : '') + '<span class="d-only">' + (st.tAvg != null ? ' · в середньому по турніру ' + fmt1(st.tAvg) : '') + '</span></span></div>' +
        (st.vsOpp ? '<div class="pk"><span class="pk__l">Проти суперників</span><span class="pk__v pk__v--sm">' + st.vsOpp.mine + ' : ' + st.vsOpp.theirs + '</span>' +
          '<span class="pk__badge ' + (diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : '') + '">' + (diff > 0 ? '+' : '') + diff + '<span class="d-only"> ' + fishWord(Math.abs(diff)) + '</span></span></div>' : '') +
        '<div class="pk"><span class="pk__l">Перемоги</span><span class="pk__v pk__v--sm">' + Math.round(st.winRate * 100) + '%</span>' +
          '<span class="pk__s">' + (st.streak ? '<span class="l-m">серія — ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + '</span><span class="l-d">найдовша серія — ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + ' поспіль</span>' : st.cnt.w + ' з ' + st.played) + '</span></div>' +
        '</div>';
    } else {
      h += '<p class="info pc-note">Турнір ще не почався. Тут уже видно жеребкування, а статистика з’явиться після перших турів.</p>';
    }

    // Тури (ліва колонка); на широкому екрані праворуч графіки й статистика
    var L = [], R = [];
    L.push([1, '<section class="card pc-block"><h2 class="pc-h2">Тури</h2>' +
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
          '<span class="pc-tour__n"><span class="visually-hidden">Тур </span><span class="hm-sec__b">' + x.n + '</span></span>' +
          '<span class="pc-tour__sec">' + (x.sector ? '<span class="visually-hidden">сектор </span><b>' + x.sector + '</b>' +
            (sideL ? '<span class="pc-side" aria-hidden="true">' + sideL + '</span><span class="visually-hidden">, ' + sideWord + '</span>' : '') : '') + '</span>' +
          '<span class="pc-tour__opp">' + (x.oppName ? '<span class="pc-num">№' + x.oppNum + '</span> ' + esc(x.oppName) : (x.oppNum ? '№' + x.oppNum : '')) + '</span>' +
          '<span class="pc-tour__res">' + res + '</span>' +
          (x.code ? '<span class="visually-hidden">, ' + RES_TEXT[x.code] + ', ' + x.fish + ' ' + fishWord(x.fish) +
            (x.oppFish != null ? ' проти ' + x.oppFish : '') + '</span>' : '') +
          '</li>';
      }).join('') + '</ol></section>']);

    if (started) {
      // Графік улову по турах
      R.push([2, '<section class="card pc-block"><h2 class="pc-h2">Улов по турах</h2>' + chartSvg(st) +
        '<p class="pc-legend"><span class="lg-bar"></span>улов учасника <span class="lg-line"></span>середній улов у турі</p></section>']);

      // Місце по турах
      var stand = standings(), myPlaces = stand && stand.byName[normName(st.name)];
      if (myPlaces && myPlaces.length > 1) {
        var tCount = Object.keys(toursData().byName).length;
        R.push([3, '<section class="card pc-block"><h2 class="pc-h2">Місце по турах</h2>' + placeSvg(myPlaces, tCount) +
          '<p class="pc-legend">Місце після кожного туру: бали (В 3, РН 2, БН 1, П 0), при рівних — більше перемог, далі більше риби</p></section>']);
      }

      // Статистика
      var rows = [];
      rows.push(stat('Відсоток перемог', Math.round(st.winRate * 100) + '%', st.cnt.w + ' з ' + st.played + ' ' + plural(st.played, 'туру', 'турів', 'турів')));
      if (st.vsOpp) rows.push(stat('Сумарно проти суперників', st.vsOpp.mine + ' : ' + st.vsOpp.theirs,
        'різниця ' + (st.vsOpp.mine - st.vsOpp.theirs > 0 ? '+' : '') + (st.vsOpp.mine - st.vsOpp.theirs) + ' ' + fishWord(Math.abs(st.vsOpp.mine - st.vsOpp.theirs))));
      rows.push(stat('Середній улов за тур', fmt1(st.avg) + ' ' + fishWord(st.avg), st.tAvg != null ? 'по турніру в середньому ' + fmt1(st.tAvg) : ''));
      if (st.share != null) rows.push(stat('Частка від усієї риби', fmt1(st.share * 100) + '%', st.fish + ' з ' + st.totalFish + ' ' + fishWord(st.totalFish) + ' турніру'));
      if (st.best) rows.push(stat('Найкращий тур', 'Тур ' + st.best.n, st.best.fish + ' ' + fishWord(st.best.fish) + (st.best.sector ? ', сектор ' + st.best.sector : '')));
      rows.push(stat('Найдовша серія перемог', st.streak ? st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + ' поспіль' : '—', ''));
      if (st.secBest) rows.push(stat('Найуловистіший сектор', 'Сектор ' + st.secBest.sector, secText(st.secBest)));
      if (st.secWorst) rows.push(stat('Найслабший сектор', 'Сектор ' + st.secWorst.sector, secText(st.secWorst)));
      var ts = tournamentSectors(), tRows = [];
      if (ts) {
        var tb = ts[0], tw = ts[ts.length - 1];
        tRows.push(stat('Найуловистіший сектор турніру', 'Сектор ' + tb.sector, [tSecText(tb), mySecText(tb.sector)]));
        tRows.push(stat('Найслабший сектор турніру', 'Сектор ' + tw.sector, [tSecText(tw), mySecText(tw.sector)]));
      }
      R.push([4, '<section class="card pc-block"><h2 class="pc-h2">Статистика</h2><dl class="pc-stats">' + rows.join('') + '</dl>' +
        (tRows.length ? '<h3 class="pc-h3">По турніру</h3><dl class="pc-stats">' + tRows.join('') + '</dl>' : '') + '</section>']);

      // Особисті зустрічі
      var groups = [['w', 'Обіграно'], ['d', 'Рибна нічия'], ['z', 'Безрибна нічия'], ['l', 'Програно']].filter(function (g) { return st.meet[g[0]].length; });
      if (groups.length) {
        L.push([5, '<section class="card pc-block"><h2 class="pc-h2">Особисті зустрічі</h2>' + groups.map(function (g) {
          return '<div class="pc-meet"><span class="pc-meet__k c-' + g[0] + '">' + g[1] + ' (' + st.meet[g[0]].length + ')</span><ul class="pc-chips">' +
            st.meet[g[0]].map(function (x) { return '<li>' + esc(x.oppName) + ' <span>' + x.fish + ':' + (x.oppFish != null ? x.oppFish : '?') + '</span></li>'; }).join('') +
            '</ul></div>';
        }).join('') + '</section>']);
      }
    }
    pc.body.innerHTML = h + twoCols(L, R) + '</div>';

    function tile(label, val, unit) {
      return '<div class="pc-tile"><span class="pc-tile__label">' + label + '</span><span class="pc-tile__val">' + esc(val) +
        (unit ? ' <small>' + unit + '</small>' : '') + '</span></div>';
    }
    function stat(k, v, sub) {
      var subs = (Array.isArray(sub) ? sub : [sub]).filter(Boolean);
      return '<div class="pc-stat"><dt>' + k + '</dt><dd><b>' + esc(v) + '</b>' +
        subs.map(function (x, i) { return '<span' + (i ? ' class="pc-stat__me"' : '') + '>' + esc(x) + '</span>'; }).join('') + '</dd></div>';
    }
    // Улов цього учасника в секторі (для блоку «По турніру»)
    function mySecText(sector) {
      var mine = st.tours.filter(function (x) { return x.code && x.sector === sector; });
      if (!mine.length) return st.nextTour ? 'Учасник у цьому секторі ще не рибалив' : 'Учасник у цьому секторі не рибалив';
      var f = mine.reduce(function (a, x) { return a + x.fish; }, 0);
      return 'Улов учасника тут: ' + f + ' ' + fishWord(f) + ' (' + (mine.length > 1 ? 'тури ' : 'тур ') +
        mine.map(function (x) { return x.n; }).join(', ') + ')';
    }
    function tSecText(x) {
      return 'в середньому ' + fmt1(x.avg) + ' ' + fishWord(x.avg) + ' на учасника за тур (' + x.fish + ' ' + fishWord(x.fish) + ' усього)';
    }
    function secText(x) {
      return x.times > 1 ? 'в середньому ' + fmt1(x.avg) + ' ' + fishWord(x.avg) + ' (' + x.times + ' тури)' : fmt1(x.avg) + ' ' + fishWord(x.avg) + ' (тур ' + x.tours[0] + ')';
    }
  }

  // ---------- Таблиця по ходу турніру й статистика турніру ----------
  var POINTS = { w: 3, d: 2, z: 1, l: 0 };   // В — 3, РН — 2, БН — 1, П — 0

  // Місце кожного учасника після кожного туру: бали (3/2/1/0), далі кількість перемог, далі улов; повна рівність — одне місце
  var standCache = { payload: null, data: null };
  function standings() {
    if (standCache.payload === state.payload) return standCache.data;
    var t = toursData(), out = null;
    if (t) {
      var names = Object.keys(t.byName);
      var acc = {};
      names.forEach(function (k) { acc[k] = { p: 0, w: 0, f: 0 }; });
      out = { byName: {}, rounds: t.rounds };
      names.forEach(function (k) { out.byName[k] = []; });
      for (var i = 0; i < t.rounds; i++) {
        var anyPlayed = false;
        names.forEach(function (k) {
          var r = t.byName[k].tours[i];
          if (r && r.code) { acc[k].p += POINTS[r.code]; acc[k].f += r.fish; if (r.code === 'w') acc[k].w++; anyPlayed = true; }
        });
        if (!anyPlayed) break;
        var order = names.slice().sort(function (a, b) { return acc[b].p - acc[a].p || acc[b].w - acc[a].w || acc[b].f - acc[a].f; });
        var place = 0, prev = null;
        order.forEach(function (k, idx) {
          if (!prev || acc[k].p !== acc[prev].p || acc[k].w !== acc[prev].w || acc[k].f !== acc[prev].f) place = idx + 1;
          out.byName[k].push(place);
          prev = k;
        });
      }
    }
    // Остання точка — офіційне місце з таблиці (там можуть бути додаткові правила для повної рівності)
    if (out) Object.keys(out.byName).forEach(function (k) {
      var arr = out.byName[k], official = t.byName[k].place;
      if (arr.length && official > 0) arr[arr.length - 1] = official;
    });
    standCache = { payload: state.payload, data: out };
    return out;
  }

  // Статистика всього турніру
  var tsCache = { payload: null, data: null };
  function tournamentStats() {
    if (tsCache.payload === state.payload) return tsCache.data;
    var t = toursData(), d = drawData(), data = null;
    if (t) {
      var names = Object.keys(t.byName);
      var played = [], totals = [], cnt = { w: 0, l: 0, d: 0, z: 0 }, entries = 0;
      for (var i = 0; i < t.rounds; i++) {
        var f = 0, n = 0;
        names.forEach(function (k) { var r = t.byName[k].tours[i]; if (r && r.code) { f += r.fish; n++; cnt[r.code]++; entries++; } });
        totals.push(n ? { fish: f, n: n, avg: f / n } : null);
        if (n) played.push(i);
      }
      if (played.length) {
        // Рекорди
        var bestCatch = null, streak = null, dry = null, fishTop = [];
        var byNum = {};
        if (d) d.players.forEach(function (x) { byNum[normName(x.name)] = x; });
        names.forEach(function (k) {
          var me = t.byName[k], dp = byNum[k];
          var cur = 0, best = 0, dryN = 0, fishSum = 0;
          me.tours.forEach(function (r, i) {
            if (!r.code) { cur = 0; return; }
            fishSum += r.fish;
            var hit = { name: me.name, tour: i + 1, sector: dp && dp.t[i] ? dp.t[i][0] : null };
            if (!bestCatch || r.fish > bestCatch.fish) bestCatch = { fish: r.fish, who: [hit] };
            else if (r.fish === bestCatch.fish) bestCatch.who.push(hit);
            cur = r.code === 'w' ? cur + 1 : 0;
            if (cur > best) best = cur;
            // «Суха» перемога: суперник не спіймав нічого
            if (r.code === 'w' && dp && dp.t[i] && dp.t[i][1]) {
              var opp = d.players.find(function (x) { return x.n === dp.t[i][1]; });
              var orow = opp && t.byName[normName(opp.name)];
              var or = orow && orow.tours[i];
              if (or && or.code && or.fish === 0) dryN++;
            }
          });
          if (best && (!streak || best > streak.n)) streak = { n: best, who: [me.name] };
          else if (best && streak && best === streak.n) streak.who.push(me.name);
          if (dryN && (!dry || dryN > dry.n)) dry = { n: dryN, who: [me.name] };
          else if (dryN && dry && dryN === dry.n) dry.who.push(me.name);
          fishTop.push({ name: me.name, fish: fishSum, place: me.place });
        });
        fishTop.sort(function (a, b) { return b.fish - a.fish || (a.place || 99) - (b.place || 99); });
        // Карта секторів: улов у кожному секторі в кожному турі (обидва береги разом)
        var heat = null;
        if (d) {
          var sectors = {};
          d.players.forEach(function (pl) {
            var me = t.byName[normName(pl.name)];
            pl.t.forEach(function (x, i) {
              if (!x[0]) return;
              var row = sectors[x[0]] || (sectors[x[0]] = { sector: x[0], cells: [], fish: 0, n: 0 });
              var r = me && me.tours[i];
              if (r && r.code) {
                row.cells[i] = (row.cells[i] || 0) + r.fish;
                row.fish += r.fish; row.n++;
              }
            });
          });
          var list = Object.keys(sectors).map(function (k) { var r = sectors[k]; r.avg = r.n ? r.fish / r.n : null; return r; });
          list.sort(function (a, b) { return a.sector - b.sector; });
          var max = 0;
          list.forEach(function (r) { r.cells.forEach(function (v) { if (v > max) max = v; }); });
          heat = { rows: list, max: max };
        }
        data = {
          rounds: t.rounds, played: played.length, players: names.length,
          totals: totals, totalFish: t.totalFish, avg: t.avgPerTour,
          cnt: cnt, entries: entries,
          battles: Math.round(entries / 2), battlesPlanned: Math.floor(names.length / 2) * t.rounds,
          bestCatch: bestCatch, streak: streak, dry: dry, fishTop: fishTop.slice(0, 5), heat: heat
        };
      }
    }
    tsCache = { payload: state.payload, data: data };
    return data;
  }
  // Дві колонки (ліва L, права R) — на широкому екрані; на вузькому одна, порядок за номером o
  function twoCols(L, R) {
    function col(items) {
      return '<div class="pc-col">' + items.map(function (x) { return '<div class="pc-cell" style="order:' + x[0] + '">' + x[1] + '</div>'; }).join('') + '</div>';
    }
    return '<div class="pc-cols' + (R.length ? '' : ' is-single') + '">' + col(L) + col(R) + '</div>';
  }

  function statsReady() { return !!tournamentStats(); }

  var ts = { root: $('tstats'), body: $('tsBody'), back: $('tsBack'), open: $('statsOpen') };

  function renderStats() {
    var S = tournamentStats();
    var ev = (state.payload && state.payload.event) || {};
    document.title = 'Статистика | Trout Master';
    if (!S) { ts.body.innerHTML = '<div class="card empty">Статистика з’явиться після перших турів.</div>'; return; }
    var sub = [S.players + ' ' + plural(S.players, 'учасник', 'учасники', 'учасників'),
      S.played < S.rounds ? 'після ' + S.played + ' з ' + S.rounds + ' турів' : 'усі ' + S.rounds + ' турів'];
    var best = null;
    (S.totals || []).forEach(function (x, i) { if (x && (!best || x.fish > best.fish)) best = { n: i + 1, fish: x.fish }; });
    var I_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    var I_TABLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 14.5h18M9 9.5V20"/></svg>';
    var h = '<header class="pc-hero ts-hero"><div class="pc-hero__bar m-only">' +
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span>' + (isListMode() ? 'Учасники' : 'Залік') + '</span></button></div>' +
      '<div class="ts-hero__main"><div class="pc-head__txt"><h1 class="title" id="tsTitle" tabindex="-1">Статистика</h1>' +
      '<p class="pc-sub">' + esc([ev.title].concat(sub).filter(Boolean).join(' · ')) + '</p></div>' +
      '<button type="button" class="btn2 btn2-dark d-only" data-act="back">' + I_TABLE + '<span>Результати</span></button></div>' +
      '<div class="kpis kpis--2">' +
        kpi('d-only', 'Турів зіграно', 'Турів', S.played + ' <small>/ ' + S.rounds + '</small>') +
        kpi('', 'Батлів зіграно', 'Батлів', S.battles + ' <small>/ ' + S.battlesPlanned + '</small>') +
        kpi('', 'Усього риби', 'Усього риби', fmtInt(S.totalFish)) +
        kpi('', 'Середній улов', 'Середній улов', fmt1(S.avg) + ' <small class="l-d">на учасника за тур</small>') +
        (best ? kpi('m-only', 'Найкращий тур', 'Найкращий тур', best.n + ' <small>· ' + best.fish + ' ' + fishWord(best.fish) + '</small>') : '') +
      '</div></header><div class="pc-sheet">';

    // На широкому екрані — дві колонки; на телефоні — одна, у порядку o (CSS order)
    var L = [], R = [];

    // Улов по турах
    L.push([2, '<section class="card pc-block"><h2 class="pc-h2">Улов по турах</h2>' + tourBars(S) +
      '<p class="pc-legend">Скільки риби спіймали всі учасники за тур</p></section>']);

    // Карта водойми і карта секторів
    if (S.heat && S.heat.rows.length) {
      L.push([3, '<div id="pondWrap">' + pondHtml(S) + '</div>']);
      R.push([4, heatHtml(S)]);
    }

    // Рекорди
    var rec = [];
    if (S.bestCatch) rec.push(recRow('Найбільший улов за тур', S.bestCatch.fish + ' ' + fishWord(S.bestCatch.fish),
      S.bestCatch.who.map(function (x) { return [x.name, 'тур ' + x.tour + (x.sector ? ', сектор ' + x.sector : '')]; })));
    if (S.streak) rec.push(recRow('Найдовша серія перемог', S.streak.n + ' ' + plural(S.streak.n, 'тур', 'тури', 'турів') + ' поспіль',
      S.streak.who.map(function (n) { return [n, '']; })));
    if (S.dry) rec.push(recRow('Найбільше «сухих» перемог', S.dry.n + ' ' + plural(S.dry.n, 'перемога', 'перемоги', 'перемог'),
      S.dry.who.map(function (n) { return [n, '']; }), 'суперник не спіймав жодної риби'));
    if (rec.length) R.push([5, '<section class="card pc-block"><h2 class="pc-h2">Рекорди</h2><dl class="pc-stats">' + rec.join('') + '</dl></section>']);

    // Топ за уловом
    L.push([6, '<section class="card pc-block"><h2 class="pc-h2">Топ за уловом</h2><ol class="ts-top">' +
      S.fishTop.map(function (x, i) {
        return '<li><span class="ts-top__n">' + (i + 1) + '</span><span class="ts-top__name">' + esc(x.name) + '</span>' +
          '<span class="ts-top__fish">' + x.fish + ' <small>' + fishWord(x.fish) + '</small></span>' +
          (x.place ? '<span class="ts-top__place">' + x.place + ' місце</span>' : '') + '</li>';
      }).join('') + '</ol><p class="pc-legend">Поруч — місце за балами</p></section>']);

    // Частки результатів
    var parts = [['w', 'Перемоги'], ['l', 'Поразки'], ['d', 'Рибні нічиї'], ['z', 'Безрибні нічиї']];
    R.push([7, '<section class="card pc-block"><h2 class="pc-h2">Результати турів</h2>' +
      '<p class="pc-legend ts-share__note">' + S.battles + ' ' + plural(S.battles, 'батл', 'батли', 'батлів') + ': у кожному один учасник виграє, а другий програє, або обидва грають унічию</p>' +
      '<div class="ts-share" role="img" aria-label="' +
      parts.map(function (p) { return p[1] + ' ' + pct(S.cnt[p[0]]); }).join(', ') + '">' +
      parts.map(function (p) { return S.cnt[p[0]] ? '<span class="ts-share__seg seg-' + p[0] + '" style="flex:' + S.cnt[p[0]] + '"></span>' : ''; }).join('') +
      '</div><ul class="ts-share__legend">' +
      parts.map(function (p) { return '<li><span class="sw seg-' + p[0] + '"></span>' + p[1] + ' <b>' + pct(S.cnt[p[0]]) + '</b> <small>(' + S.cnt[p[0]] + ')</small></li>'; }).join('') +
      '</ul></section>']);

    ts.body.innerHTML = h + twoCols(L, R) + '</div>';

    function pct(n) { return S.entries ? Math.round(n / S.entries * 100) + '%' : '—'; }
    function tsTile(label, valHtml) {
      return '<div class="pc-tile"><span class="pc-tile__label">' + label + '</span><span class="pc-tile__val">' + valHtml + '</span></div>';
    }
    // Рекорд: значення і всі, хто його має
    function recRow(k, v, who, note) {
      return '<div class="pc-stat ts-rec"><dt>' + k + '</dt><dd><b>' + esc(v) + '</b>' +
        (note ? '<span>' + esc(note) + '</span>' : '') +
        '<ul class="ts-who">' + who.map(function (w) {
          return '<li><span class="ts-who__n">' + esc(w[0]) + '</span>' + (w[1] ? '<span class="ts-who__m">' + esc(w[1]) + '</span>' : '') + '</li>';
        }).join('') + '</ul></dd></div>';
    }
  }

  function tourBars(S) {
    var n = S.rounds, W = 320, H = 130, top = 14, bottom = 22, gap = 4, max = 1;
    S.totals.forEach(function (x) { if (x && x.fish > max) max = x.fish; });
    var bw = (W - gap * (n - 1)) / n, ph = H - top - bottom;
    var out = '<svg class="pc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Улов по турах">' +
      '<line x1="0" x2="' + W + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" class="ax"/>';
    S.totals.forEach(function (x, i) {
      var x0 = i * (bw + gap);
      if (x) {
        var hh = Math.max(x.fish > 0 ? 2 : 0, x.fish / max * ph);
        out += '<rect x="' + x0 + '" y="' + (top + ph - hh) + '" width="' + bw + '" height="' + hh + '" rx="2" class="bar-t"><title>Тур ' + (i + 1) + ': ' + x.fish + '</title></rect>' +
          '<text x="' + (x0 + bw / 2) + '" y="' + (top + ph - hh - 3) + '" class="val">' + x.fish + '</text>';
      } else {
        out += '<rect x="' + (x0 + 0.5) + '" y="' + (top + ph - 8) + '" width="' + (bw - 1) + '" height="8" rx="2" class="bar-wait"/>';
      }
      out += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 6) + '" class="lbl">' + (i + 1) + '</text>';
    });
    return out + '</svg>';
  }

  // Карта секторів: рядок — сектор, колонка — тур; колір — скільки риби спіймали в секторі за тур
  function heatHtml(S) {
    var max = S.heat.max || 1;
    var bestAvg = -1, worstAvg = Infinity;
    S.heat.rows.forEach(function (r) { if (r.avg != null) { if (r.avg > bestAvg) bestAvg = r.avg; if (r.avg < worstAvg) worstAvg = r.avg; } });
    var head = '<div class="hm-row hm-axis"><span></span><span class="hm-axis__t" style="grid-column: 2 / span ' + S.rounds + '">Тури →</span><span></span></div>' +
      '<div class="hm-row hm-head"><span class="hm-sec hm-sec--h" title="Сектор">Сек.</span>';
    for (var i = 0; i < S.rounds; i++) head += '<span class="hm-cell hm-th">' + (i + 1) + '</span>';
    head += '<span class="hm-avg">Сер.</span></div>';
    var rows = S.heat.rows.map(function (r) {
      var cells = '';
      for (var i = 0; i < S.rounds; i++) {
        var v = r.cells[i];
        if (v == null) { cells += '<span class="hm-cell hm-empty"></span>'; continue; }
        var k = v / max;
        var bg = heatColor(k);
        cells += '<span class="hm-cell" style="background:' + bg + ';color:' + (k > 0.55 ? '#fff' : 'var(--text)') + '" title="Сектор ' + r.sector + ', тур ' + (i + 1) + ': ' + v + '">' + v + '</span>';
      }
      var mark = r.avg === bestAvg ? ' hm-best' : r.avg === worstAvg ? ' hm-worst' : '';
      return '<div class="hm-row"><span class="hm-sec"><span class="hm-sec__b">' + r.sector + '</span></span>' + cells +
        '<span class="hm-avg' + mark + '">' + (r.avg != null ? r.avg.toFixed(1).replace('.', ',') : '—') + '</span></div>';
    }).join('');
    return '<section class="card pc-block"><h2 class="pc-h2">Карта секторів</h2>' +
      '<p class="pc-legend hm-note"><b>Рядок — сектор, колонка — тур.</b> У клітинці — скільки риби спіймали в цьому секторі за тур (обидва береги разом). «Сер.» — середній улов на учасника за тур у секторі.</p>' +
      '<div class="hm" style="--hm-n:' + S.rounds + '" role="img" aria-label="Карта секторів: улов по секторах і турах">' + head + rows + '</div>' +
      '<div class="hm-scale"><span>мало</span><i style="background:linear-gradient(90deg,' + heatColor(0) + ',' + heatColor(0.5) + ',' + heatColor(1) + ')"></i><span>багато</span></div></section>';
  }
  // Карта водойми: сектори по колу — 1…N/2 нижнім берегом зліва направо, далі верхнім справа наліво.
  // Колір — середній улов на учасника за тур (або улов у вибраному турі).
  state.pondTour = 'all';
  function pondHtml(S) {
    var rows = S.heat.rows, bySec = {};
    rows.forEach(function (r) { bySec[r.sector] = r; });
    var N = rows.reduce(function (m, r) { return Math.max(m, r.sector); }, 0);
    var half = Math.ceil(N / 2);
    var tour = state.pondTour;
    if (tour !== 'all' && !S.totals[tour]) tour = state.pondTour = 'all';
    var val = function (r) {
      if (!r) return null;
      if (tour === 'all') return r.avg;
      var v = r.cells[tour];
      return v == null ? null : v;
    };
    var max = 0, min = Infinity;
    for (var s1 = 1; s1 <= N; s1++) { var v1 = val(bySec[s1]); if (v1 != null) { max = Math.max(max, v1); min = Math.min(min, v1); } }
    var fmtV = function (v) { return tour === 'all' ? v.toFixed(1).replace('.', ',') : String(v); };
    var tile = function (sec) {
      var r = bySec[sec], v = val(r);
      if (v == null) return '<div class="pond-sec is-empty"><b>' + sec + '</b><span>—</span></div>';
      var k = max > min ? (v - min) / (max - min) : 0.5;
      var light = k > 0.55;
      var tag = v === max && max > min ? ' is-top' : v === min && max > min ? ' is-low' : '';
      return '<div class="pond-sec' + tag + '" style="background:' + heatColor(k) + ';color:' + (light ? '#fff' : 'var(--text)') + '" title="Сектор ' + sec + ': ' + fmtV(v) + '">' +
        '<b>' + sec + '</b><span>' + fmtV(v) + '</span></div>';
    };
    var top = '', bottom = '';
    for (var i = N; i > half; i--) top += tile(i);         // верхній берег: N … half+1 зліва направо
    for (var j = 1; j <= half; j++) bottom += tile(j);     // нижній берег: 1 … half
    var chips = '<button type="button" class="pond-chip" data-pond="all" aria-pressed="' + (tour === 'all') + '">Усі тури</button>' +
      S.totals.map(function (x, i) {
        return '<button type="button" class="pond-chip" data-pond="' + i + '" aria-pressed="' + (tour === i) + '"' + (x ? '' : ' disabled') + '>' + (i + 1) + '</button>';
      }).join('');
    var caption = tour === 'all'
      ? 'Колір і число — середній улов на учасника за тур у секторі за весь турнір.'
      : 'Тур ' + (tour + 1) + ': скільки риби спіймали в секторі (обидва учасники разом).';
    return '<section class="card pc-block"><h2 class="pc-h2">Карта водойми</h2>' +
      '<div class="pond-chips" role="group" aria-label="Тур для карти">' + chips + '</div>' +
      '<div class="pond" style="--pond-n:' + half + '" role="img" aria-label="Карта водойми: ' + caption + '">' +
        '<div class="pond-row pond-row--top">' + top + '</div>' +
        '<div class="pond-water"><span>водойма</span></div>' +
        '<div class="pond-row">' + bottom + '</div>' +
      '</div><p class="pc-legend">' + caption + ' <span class="pond-key"><i class="is-top"></i>найкращий <i class="is-low"></i>найслабший</span></p></section>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-pond]');
    if (!b || b.disabled) return;
    var v = b.getAttribute('data-pond');
    state.pondTour = v === 'all' ? 'all' : +v;
    var wrap = document.getElementById('pondWrap'), S = tournamentStats();
    if (wrap && S && S.heat) {
      wrap.innerHTML = pondHtml(S);
      var cur = wrap.querySelector('[data-pond="' + v + '"]');
      if (cur) cur.focus();
    }
  });

  // Від світло-блакитного до насиченого синього
  function heatColor(k) {
    k = Math.max(0, Math.min(1, k));
    var a = [238, 246, 252], b = [111, 168, 220], c = [13, 63, 107];
    var from = k < 0.5 ? a : b, to = k < 0.5 ? b : c, t = k < 0.5 ? k * 2 : (k - 0.5) * 2;
    return 'rgb(' + from.map(function (v, i) { return Math.round(v + (to[i] - v) * t); }).join(',') + ')';
  }

  // Графік місця по турах (1 — угорі)
  function placeSvg(places, players) {
    var n = places.length, W = 320, H = 130, top = 12, bottom = 22, left = 22, right = 8, pad = 10;
    var maxP = Math.max(players, 2);
    var x = function (i) { return left + pad + (n > 1 ? i * (W - left - right - pad) / (n - 1) : (W - left - right - pad) / 2); };
    var y = function (p) { return top + (p - 1) / (maxP - 1) * (H - top - bottom); };
    var out = '<svg class="pc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Місце після кожного туру: ' + places.join(', ') + '">';
    [1, Math.ceil(maxP / 2), maxP].forEach(function (p) {
      out += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(p) + '" y2="' + y(p) + '" class="grid"/>' +
        '<text x="' + (left - 6) + '" y="' + (y(p) + 3) + '" class="lbl lbl-y">' + p + '</text>';
    });
    out += '<polyline points="' + places.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p).toFixed(1); }).join(' ') + '" class="place-line"/>';
    places.forEach(function (p, i) {
      out += '<circle cx="' + x(i) + '" cy="' + y(p) + '" r="3" class="place-dot"><title>Після туру ' + (i + 1) + ': ' + p + ' місце</title></circle>' +
        '<text x="' + x(i) + '" y="' + (y(p) - 7) + '" class="val' + (i === n - 1 ? ' val-last' : '') + '">' + p + '</text>' +
        '<text x="' + x(i) + '" y="' + (H - 6) + '" class="lbl">' + (i + 1) + '</text>';
    });
    return out + '</svg>';
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
  function kTimerHtml(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
    var parts = d ? [[d, 'д', 'д'], [h, 'год', 'г'], [pad2(m), 'хв', 'хв']] : [[h, 'год', 'г'], [pad2(m), 'хв', 'хв'], [pad2(sec), 'с', 'с']];
    return '<span class="visually-hidden">' + (d ? d + ' д ' : '') + h + ' год ' + m + ' хв</span>' + parts.map(function (x, i) {
      return '<span class="tt' + (i === 2 ? ' tt-3' : '') + '" aria-hidden="true"><b>' + x[0] + '</b><span class="l-d">' + x[1] + '</span><span class="l-m">' + x[2] + '</span></span>';
    }).join('');
  }
  function renderTimer() {
    var d = regDeadline();
    var on = !!d && regOpenNow() && (state.view === 'list' || state.view === 'reg');
    reg.timer.hidden = !on;
    if (!on) { clearInterval(timerId); timerId = null; return; }
    var left = d.getTime() - Date.now();
    if (left <= 0) { clearInterval(timerId); timerId = null; renderReg(); return; }   // час вийшов: ховаємо кнопку
    reg.timerTxt.innerHTML = 'до кінця ' + fmtLeft(left).replace(/\d/g, '<span class="dg">$&</span>');
    ['kTimer', 'rTimer'].forEach(function (id) { var kt = document.getElementById(id); if (kt) kt.innerHTML = kTimerHtml(left); });
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
    html.classList.toggle('view-stats', state.view === 'stats');
    ts.root.hidden = state.view !== 'stats';
    reg.root.hidden = !isReg;
    pc.root.hidden = state.view !== 'card';
    // Нижня панель: «Картка учасника» (коли виділено гравця) і «Зареєструватися» (коли реєстрація відкрита)
    var showReg = isList && regOpenNow();
    // «Статистика» — на місці «Зареєструватися», коли реєстрація закрита і вже є зіграні тури
    var showStats = isList && !showReg && statsReady();
    var player = isList ? selectedPlayerName() : null;
    var cardOn = !(state.payload && state.payload.showCard === false);   // B12 на аркуші «Сайт»
    var showCard = cardOn && !!player && hasCardData(player);
    var other = showReg || showStats;
    reg.open.hidden = !showReg;
    ts.open.hidden = !showStats;
    pc.open.hidden = !showCard;
    pc.openText.textContent = other ? 'Картка учасника' : 'Картка учасника · ' + player;
    pc.open.classList.toggle('btn-primary', !other);
    pc.open.classList.toggle('btn-secondary', other);
    reg.bar.classList.toggle('two', other && showCard);
    var showBar = other || showCard;
    reg.bar.hidden = !showBar;
    reg.live.hidden = !showReg;   // плашка «Триває реєстрація» над таблицею
    renderTimer();
    html.classList.toggle('has-regbar', showBar);
    if (typeof v2 !== 'undefined' && v2) renderChrome();
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
    if (v === 'stats') {
      renderStats();
      var hs = document.getElementById('tsTitle');
      if (hs) { try { hs.focus({ preventScroll: true }); } catch (e) { hs.focus(); } }
    } else if (v === 'card') {
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

  function goStats() {
    if (state.view === 'stats') return;
    state.regPushed = true;
    try { history.pushState({ tmView: 'stats' }, '', IN_TG ? location.href : '#stats'); } catch (e) { state.regPushed = false; }
    setView('stats');
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

  // ----- Відвідування в звичайному браузері (для статистики на аркуші «Відвідування») -----
  // Анонімно: лише випадковий ID пристрою, без імен. У Telegram візит рахує «Хто я?».
  function webVisit() {
    if (DEMO || IN_TG) return;
    var id = store.get('tm:vid', null);
    if (typeof id !== 'string' || !/^[a-z0-9]{8,40}$/.test(id)) {
      id = '';
      try {
        var b = new Uint8Array(12);
        crypto.getRandomValues(b);
        for (var i = 0; i < b.length; i++) id += ('0' + b[i].toString(16)).slice(-2);
      } catch (e) {
        while (id.length < 24) id += Math.random().toString(36).slice(2);
        id = id.slice(0, 24);
      }
      store.set('tm:vid', id);
    }
    try {
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'visit', vid: id }),
        keepalive: true
      }).catch(function () { /* статистика — не критично */ });
    } catch (e) { /* */ }
  }
  // Трохи згодом, щоб не заважати першому завантаженню результатів
  setTimeout(webVisit, 2500);

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
    var v = e.state && /^(reg|card|stats)$/.test(e.state.tmView) ? e.state.tmView : 'list';
    if (v === 'card' && !selectedPlayerName()) v = 'list';
    if (v === 'list') state.regPushed = false;
    setView(v);
  });

  // Після реєстрації: прокрутити до свого рядка у списку
  function revealFocusRow() {
    if (!state.focusKey || state.view !== 'list') return;
    var rows = el.board.querySelectorAll('[data-key]');
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
  pc.body.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'back') { goList(); return; }
    if (act === 'prev' || act === 'next') {
      var nav = cardNav(selectedPlayerName() || ''), to = nav[act];
      if (!to) return;
      selectOnly(to.key);
      renderCard();
      var h = document.getElementById('pcTitle');
      if (h) { try { h.focus({ preventScroll: true }); } catch (x) { h.focus(); } }
      return;
    }
    if (act === 'share') {
      var nm = selectedPlayerName(), dp = nm ? drawPlayer(nm) : null;
      shareLink(dp ? SHARE_URL + '=p' + dp.n : SHARE_URL, (nm || 'Учасник') + ': картка учасника TROUT MASTER');
    }
  });
  ts.open.addEventListener('click', goStats);
  ts.back.addEventListener('click', goList);
  ts.body.addEventListener('click', function (e) { if (e.target.closest('[data-act="back"]')) goList(); });
  // iOS Safari вмикає стан :active (натиснута кнопка) лише якщо на сторінці є обробник дотику
  document.addEventListener('touchstart', function () {}, { passive: true });
  reg.back.addEventListener('click', goList);
  reg.toList.addEventListener('click', goList);
  reg.closedBack.addEventListener('click', goList);

  // Пряме посилання на форму: сайт#register або t.me/бот?startapp=register
  if (location.hash === '#player' || location.hash === '#stats') {
    try { history.replaceState({ tmView: 'list' }, '', location.pathname + location.search); } catch (e) { /* */ }
  }
  var wantReg = /^#register$/.test(location.hash) || /tgWebAppStartParam=register(&|$)/.test(location.hash + location.search);

  // ================= Новий дизайн: шапка, плитки, таблиці =================
  var v2 = {
    hero: $('hero'), pill: $('heroPill'), kpis: $('kpis'), share: $('shareBtn'),
    heroStats: $('heroStats'), heroReg: $('heroReg'), topnav: $('topnav'), navList: $('navList'), navStats: $('navStats'),
    bcard: $('bcard'), bTitle: $('boardTitle'), bSub: $('boardSub'), legend: $('legend'), search: $('search'), searchBox: $('searchBox'),
    selbar: $('selbar'), selPlace: $('selPlace'), selName: $('selName'), selCard: $('selCard'), selClear: $('selClear'),
    side: $('side'), toast: $('toast')
  };
  var SHARE_URL = 'https://t.me/troutmasterua_bot?startapp';
  var ZEBRA = true;
  var RC = { w: ['В', 'Перемога'], d: ['РН', 'Рибна нічия'], z: ['БН', 'Безрибна нічия'], l: ['П', 'Поразка'] };
  state.query = '';

  function isListMode() {
    var p = state.payload;
    return !!p && (p.mode === 'Список учасників' ||
      (!p.mode && (p.sheets || []).length === 1 && /учасник/i.test(p.sheets[0].name || '')));
  }
  function tabLabel(name) { return /результат/i.test(name) ? 'Залік' : /^тур/i.test(String(name).trim()) ? 'По турах' : name; }
  function initials(n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0); }).join('').toUpperCase(); }
  function colBy(m, re) { return m.cols.find(function (k) { return k.role !== 'name' && k.role !== 'place' && re.test(k.label); }) || null; }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function matchQuery(name) { var q = state.query.trim().toLowerCase(); return !q || String(name).toLowerCase().indexOf(q) !== -1; }
  function resultsModel() { return state.models.find(function (m) { return /результат/i.test(m.name); }) || null; }
  function placeByName() {
    var m = resultsModel(), map = {};
    if (m) m.rows.forEach(function (r) { map[normName(r.cells[m.nameCol ? m.nameCol.c : 1])] = r; });
    return map;
  }
  function playedTours(t) { return t ? t.tourAvg.filter(function (x) { return x != null; }).length : 0; }
  function tourTotals(t) {
    var s = [];
    if (!t) return s;
    for (var i = 0; i < t.rounds; i++) s.push(null);
    Object.keys(t.byName).forEach(function (k) {
      t.byName[k].tours.forEach(function (x, i) { if (x.code) s[i] = (s[i] || 0) + x.fish; });
    });
    return s;
  }
  // Підсумки заліку з аркуша «Результат» (+ «Тури» для форми й В·РН·БН·П)
  function standingsRows() {
    var m = resultsModel();
    if (!m || !m.nameCol) return null;
    var cPts = colBy(m, /^бали/i), cWin = colBy(m, /^(виграш|перемог)/i), cFish = colBy(m, /^риб/i);
    if (!cPts) return null;
    var t = toursData();
    var moves = (state.payload && state.payload.showMoves === false) ? {} : (state.moves[m.name] || {});
    return {
      model: m, fishLabel: cFish ? cFish.label : '',
      rows: m.rows.map(function (row) {
        var name = row.cells[m.nameCol.c];
        var me = t ? t.byName[normName(name)] : null;
        var cnt = { w: 0, d: 0, z: 0, l: 0 }, form = [];
        if (me) me.tours.forEach(function (x) { if (x.code) { cnt[x.code]++; form.push(x.code); } });
        var dp = drawPlayer(name);
        return {
          key: row.key, name: name, place: row.place, move: moves[row.key] || 0,
          pts: num(row.cells[cPts.c]), wins: cWin ? num(row.cells[cWin.c]) : (me ? cnt.w : null),
          fish: cFish ? num(row.cells[cFish.c]) : null, cnt: me ? cnt : null, form: form.slice(-5), num: dp ? dp.n : null
        };
      })
    };
  }
  function totalFish() {
    var t = toursData();
    if (t && t.totalFish) return t.totalFish;
    var s = standingsRows();
    if (s && s.fishLabel) { var n = num(s.fishLabel); if (n) return n; }
    return null;
  }

  // ----- Шапка турніру -----
  var ICON_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  var ICON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  function renderHeader() {
    var p = state.payload;
    var ev = (p && p.event) || {};
    var title = ev.title || (p && p.title) || 'Результати';
    el.title.textContent = title;
    var parts = String(ev.subtitle || '').split(/\s*[•·]\s*/).filter(Boolean);
    el.subtitle.innerHTML = parts.map(function (s, i) {
      return '<span>' + (i === 0 ? ICON_CAL : i === 1 ? ICON_PIN : '') + esc(s) + '</span>';
    }).join('');
    el.subtitle.hidden = !parts.length;
    if (state.view === 'list' || !state.view) document.title = title + ' | Trout Master';
    renderChrome();
  }

  var MONTHS_FULL = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  function deadlineText(d) {
    return d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }
  // Скільки зареєстровано і скільки місць (список учасників)
  function seatsInfo() {
    var p = state.payload || {}, m = isListMode() ? state.models[0] : null;
    if (!m) return null;
    return { n: m.rows.length, seats: parseInt(p.seats, 10) || 0 };
  }
  function seatsBar(si) {
    var pct = si.seats ? Math.min(100, Math.round(si.n / si.seats * 100)) : 0;
    return '<span class="sbar" role="img" aria-label="' + si.n + ' з ' + si.seats + ' місць зайнято"><span style="width:' + pct + '%"></span></span>';
  }
  function renderFill() {
    var box = document.getElementById('fillCard'), si = seatsInfo(), d = regDeadline();
    var on = !!si && si.seats > 0 && state.view === 'list';
    box.hidden = !on;
    if (!on) return;
    box.innerHTML = '<div class="fillcard__row"><b>Заповнено ' + Math.min(si.n, si.seats) + ' з ' + si.seats + ' ' + plural(si.seats, 'місця', 'місць', 'місць') + '</b>' +
      (d && regOpenNow() ? '<span>до ' + esc(deadlineText(d)) + '</span>' : '') + '</div>' + seatsBar(si);
  }
  function renderRegExtras() {
    var box = document.getElementById('regSeats'), si = seatsInfo(), d = regDeadline(), open = regOpenNow();
    var on = state.view === 'reg' && !!si && open && !state.regDone;
    box.hidden = !on;
    var note = document.getElementById('regBotNote');
    if (note) note.hidden = !(state.view === 'reg' && IN_TG && open && !state.regDone);
    if (!on) return;
    var free = si.seats ? si.seats - si.n : 0;
    var h = '<div class="seats__row"><b>Зареєстровано ' + si.n + (si.seats ? ' з ' + si.seats : '') + '</b>' +
      (si.seats ? (free > 0 ? '<span class="ok">ще ' + free + ' ' + plural(free, 'місце', 'місця', 'місць') + '</span>' : '<span class="warn">далі — резерв</span>') : '') + '</div>' +
      (si.seats ? seatsBar(si) : '');
    if (d) h += '<div class="seats__timer"><span>До закриття</span><span class="ttiles" id="rTimer"></span></div>';
    box.innerHTML = h;
    renderTimer();
  }

  // Плашка статусу, плитки, кнопки шапки, меню, бічна панель, смужка вибору
  function renderChrome() {
    var p = state.payload;
    var list = isListMode();
    var t = toursData();
    // Плашка над заголовком
    var pill = '', pillOn = false;
    if (p && list) {
      var open = regOpenNow(), d = regDeadline();
      pill = open ? 'Триває реєстрація' + (d ? ' · до ' + deadlineText(d) : '') : 'Реєстрацію закрито';
      pillOn = open;
    } else if (t) {
      var pl = playedTours(t);
      pill = pl >= t.rounds ? 'Тур ' + t.rounds + ' з ' + t.rounds + ' · завершено' : pl ? 'Зіграно ' + pl + ' з ' + t.rounds + ' турів' : '';
      pillOn = pl > 0 && pl < t.rounds;
    }
    v2.pill.innerHTML = pill ? '<i aria-hidden="true"></i>' + esc(pill) : '';
    v2.pill.hidden = !pill;
    v2.pill.classList.toggle('is-live', pillOn);

    renderKpis();
    renderFill();
    renderRegExtras();

    // Кнопки шапки (комп'ютер)
    var stats = statsReady();
    v2.heroStats.hidden = !stats || list;
    v2.heroReg.hidden = !(list && regOpenNow());
    // Меню
    v2.topnav.hidden = !p;
    v2.navList.textContent = list ? 'Учасники' : 'Результати';
    v2.navStats.hidden = !stats;
    v2.navList.setAttribute('aria-current', state.view === 'list' ? 'page' : 'false');
    v2.navStats.setAttribute('aria-current', state.view === 'stats' ? 'page' : 'false');

    renderSide();
    renderSelbar();
  }

  function kpi(cls, label, labelM, valHtml, extra) {
    return '<div class="kpi ' + cls + '"><span class="kpi__l"><span class="l-d">' + label + '</span><span class="l-m">' + (labelM || label) + '</span></span>' +
      '<span class="kpi__v">' + valHtml + '</span>' + (extra || '') + '</div>';
  }
  function renderKpis() {
    var p = state.payload, h = '';
    if (!p) { v2.kpis.innerHTML = ''; return; }
    if (isListMode()) {
      var m = state.models[0], n = m ? m.rows.length : 0, seats = parseInt(p.seats, 10) || 0;
      var pct = seats ? Math.min(100, Math.round(n / seats * 100)) : 0;
      h += kpi('', 'Зареєстровано', 'Учасників', n + (seats ? ' <small>/ ' + seats + '</small>' : ''),
        seats ? '<span class="kpi__bar" role="img" aria-label="' + n + ' з ' + seats + ' місць зайнято"><span style="width:' + pct + '%"></span></span>' : '');
      if (seats) {
        h += n < seats
          ? kpi('k-green', 'Вільних місць', 'Вільно', (seats - n) + ' <small class="l-m">' + plural(seats - n, 'місце', 'місця', 'місць') + '</small>', '<span class="kpi__s l-d">далі — резерв</span>')
          : kpi('', 'Резерв', 'Резерв', (n - seats) + ' <small>' + plural(n - seats, 'учасник', 'учасники', 'учасників') + '</small>', '<span class="kpi__s l-d">усі місця зайняті</span>');
      }
      if (regOpenNow() && regDeadline()) h += kpi('k-dark', 'До закриття реєстрації', 'До закриття', '<span id="kTimer"></span>');
      v2.kpis.innerHTML = h;
      v2.kpis.hidden = false;
      renderTimer();
      return;
    }
    var s = standingsRows(), t = toursData();
    var lead = s && s.rows.find(function (r) { return r.place === 1; });
    var started = s && s.rows.some(function (r) { return r.pts > 0; });
    if (lead && started) {
      var finished = t && playedTours(t) >= t.rounds;
      h += kpi('k-dark d-only', finished ? 'Переможець' : 'Лідер', finished ? 'Переможець' : 'Лідер', esc(lead.name), '<span class="kpi__s">' + [
        lead.pts != null ? lead.pts + ' ' + plural(lead.pts, 'бал', 'бали', 'балів') : '',
        lead.wins != null ? lead.wins + ' ' + plural(lead.wins, 'перемога', 'перемоги', 'перемог') : '',
        lead.fish != null ? lead.fish + ' ' + fishWord(lead.fish) : ''].filter(Boolean).join(' · ') + '</span>');
    }
    if (t) {
      var pl = playedTours(t);
      h += kpi('', 'Турів зіграно', 'Тур', pl + ' <small>/ ' + t.rounds + '</small>',
        '<span class="kpi__bar d-only"><span style="width:' + Math.round(pl / t.rounds * 100) + '%"></span></span>');
    }
    var tf = totalFish();
    if (tf != null) {
      var tot = tourTotals(t), mx = Math.max.apply(null, tot.map(function (x) { return x || 0; }).concat([1]));
      var spark = t && playedTours(t) > 1 ? '<span class="spark d-only" aria-hidden="true">' + tot.map(function (x) {
        return '<i style="height:' + (x ? Math.max(2, Math.round(x / mx * 36)) : 0) + 'px"></i>';
      }).join('') + '</span>' : '';
      h += kpi('k-spark', 'Усього риби', 'Риби', fmtInt(tf), spark);
    }
    if (t && t.avgPerTour != null) h += kpi('d-only', 'Середній улов', 'Середній', fmt1(t.avgPerTour), '<span class="kpi__s">риби на учасника за тур</span>');
    var m0 = resultsModel() || state.models[0];
    if (m0) h += kpi('m-only', 'Учасників', 'Учасників', String(m0.rows.length));
    v2.kpis.innerHTML = h;
    v2.kpis.hidden = !h;
  }

  // ----- Бічна панель (комп'ютер, залік) -----
  function renderSide() {
    var s = !isListMode() && state.view === 'list' ? standingsRows() : null;
    var m = currentModel();
    var on = !!s && !!m && /результат/i.test(m.name) && s.rows.some(function (r) { return r.pts > 0; });
    v2.side.hidden = !on;
    document.documentElement.classList.toggle('has-side', on);
    if (!on) { v2.side.innerHTML = ''; return; }
    var top3 = [2, 1, 3].map(function (pl) { return s.rows.find(function (r) { return r.place === pl; }); });
    var h = '';
    if (top3.every(Boolean)) {
      h += '<div class="scard"><h3>Подіум</h3><div class="podium">' + top3.map(function (r) {
        return '<div class="podium__col p' + r.place + '"><span class="podium__name">' + esc(r.name) + '</span>' +
          '<span class="podium__bar">' + r.place + '</span><span class="podium__pts">' + r.pts + ' ' + plural(r.pts, 'бал', 'бали', 'балів') + '</span></div>';
      }).join('') + '</div></div>';
    }
    var byFish = s.rows.filter(function (r) { return r.fish != null; }).slice().sort(function (a, b) { return b.fish - a.fish; }).slice(0, 3);
    if (byFish.length) {
      var mx = byFish[0].fish || 1;
      h += '<div class="scard"><h3>Найбільше риби</h3>' + byFish.map(function (r) {
        return '<div class="ftop"><span class="ftop__row"><b>' + esc(r.name) + '</b><span>' + r.fish + ' <small>' + fishWord(r.fish) + '</small></span></span>' +
          '<span class="ftop__bar"><span style="width:' + Math.round(r.fish / mx * 100) + '%"></span></span></div>';
      }).join('') + '</div>';
    }
    h += '<div class="scard"><h3>Як рахуються бали</h3><ul class="pts-legend">' +
      '<li><span class="code code-w">В</span>перемога — 3</li><li><span class="code code-d">РН</span>рибна нічия — 2</li>' +
      '<li><span class="code code-z">БН</span>безрибна нічия — 1</li><li><span class="code code-l">П</span>поразка — 0</li></ul></div>';
    v2.side.innerHTML = h;
  }

  // ----- Смужка «Вибрано в таблиці» (комп'ютер) -----
  function renderSelbar() {
    var name = state.view === 'list' && !isListMode() ? selectedPlayerName() : null;
    var cardOn = !(state.payload && state.payload.showCard === false);
    var on = !!name && cardOn && hasCardData(name);
    v2.selbar.hidden = !on;
    if (!on) return;
    var s = standingsRows(), r = s && s.rows.find(function (x) { return normName(x.name) === normName(name); });
    v2.selPlace.hidden = !(r && r.place);
    if (r && r.place) {
      v2.selPlace.textContent = r.place;
      v2.selPlace.className = 'selbar__place' + (r.place <= 3 ? ' medal-' + r.place : '');
    }
    v2.selName.textContent = name + (r && r.pts != null ? ' · ' + r.pts + ' ' + plural(r.pts, 'бал', 'бали', 'балів') : '');
  }

  // ----- Вкладки «Залік / По турах» -----
  function renderTabs() {
    var list = isListMode();
    if (state.models.length < 2) el.tabs.innerHTML = '';
    else {
      var cur = currentModel();
      el.tabs.innerHTML = state.models.map(function (m, i) {
        var sel = m === cur;
        return '<button type="button" class="tab" role="tab" id="tab-' + i + '" data-tab="' + esc(m.name) +
          '" aria-selected="' + sel + '" tabindex="' + (sel ? 0 : -1) + '">' + esc(tabLabel(m.name)) + '</button>';
      }).join('');
      el.board.setAttribute('aria-labelledby', 'tab-' + state.models.indexOf(cur));
    }
    renderSide();
    var m = currentModel();
    var tours = !!m && /^тур/i.test(m.name.trim()) && !!toursData();
    v2.legend.hidden = !tours;
    if (list) {
      v2.bTitle.textContent = 'Список учасників';
      v2.bSub.textContent = 'У порядку реєстрації';
    } else if (tours) {
      v2.bTitle.textContent = 'Результати по турах';
      v2.bSub.textContent = 'У клітинці — результат і улов учасника в турі';
    } else {
      v2.bTitle.textContent = m ? (/результат/i.test(m.name) ? 'Загальний залік' : m.name) : 'Результати';
      v2.bSub.textContent = m && /результат/i.test(m.name) ? 'Бали → перемоги → риба' : '';
    }
  }

  // ----- Таблиця: вибір вигляду -----
  function renderBoard() {
    var m = currentModel();
    el.board.classList.remove('is-wide', 'is-compact', 'v2');
    if (!m || !m.rows.length) { renderTable(); return; }
    var html = null;
    if (isListMode()) html = participantsHtml(m);
    else if (/результат/i.test(m.name)) html = standingsHtml();
    else if (/^тур/i.test(m.name.trim())) html = toursHtml();
    if (html == null) { renderTable(); return; }
    var sc = el.board.querySelector('.tgrid');
    var x = sc ? sc.scrollLeft : 0;
    el.board.classList.add('v2');
    el.board.innerHTML = html;
    var sc2 = el.board.querySelector('.tgrid');
    if (sc2) sc2.scrollLeft = x;
  }

  function medalCls(place, started) { return started && place >= 1 && place <= 3 ? ' medal-' + place : ''; }
  function moveHtml(mv) {
    if (!mv) return '';
    var n = Math.abs(mv), txt = (mv > 0 ? 'піднявся на ' : 'опустився на ') + n + ' ' + plural(n, 'місце', 'місця', 'місць');
    return '<span class="mv ' + (mv > 0 ? 'up' : 'down') + '" title="' + txt + '"><span aria-hidden="true">' + (mv > 0 ? '▲' : '▼') + n +
      '</span><span class="visually-hidden">, ' + txt + '</span></span>';
  }

  // Залік
  function standingsHtml() {
    var s = standingsRows();
    if (!s) return null;
    var started = s.rows.some(function (r) { return r.pts > 0; });
    var hasT = s.rows.some(function (r) { return r.cnt; });
    var fishTotal = totalFish();
    var flashOn = Date.now() - state.changeTime < 3500;
    var changed = state.changed[s.model.name] || {};
    var rows = s.rows.filter(function (r) { return matchQuery(r.name); });
    var head = '<div class="rk-row rk-head" role="row">' +
      '<span class="c-pl" role="columnheader">Місце</span><span class="c-nm" role="columnheader">Учасник</span>' +
      (hasT ? '<span class="c-form d-only" role="columnheader">Останні 5</span><span class="c-wdl d-only" role="columnheader">В · РН · БН · П</span>' : '') +
      '<span class="c-pts" role="columnheader"><span class="d-only">Бали</span><span class="m-only">Бали · риби' + (fishTotal ? ' (' + fmtInt(fishTotal) + ')' : '') + '</span></span>' +
      '<span class="c-win d-only" role="columnheader">Перемоги</span>' +
      '<span class="c-fish d-only" role="columnheader">Риби' + (fishTotal ? ' (' + fmtInt(fishTotal) + ')' : '') + '</span></div>';
    var body = rows.map(function (r, i) {
      var sel = state.selected.has(r.key);
      var cls = 'rk-row r' + (ZEBRA && i % 2 ? ' z' : '') + (sel ? ' is-sel' : '') + medalCls(r.place, started) +
        (flashOn && changed[r.key] ? ' flash' : '') + (hasT ? '' : ' no-t');
      var form = r.form.map(function (c) { return '<span class="fb fb-' + c + '" title="' + RC[c][1] + '">' + RC[c][0] + '</span>'; }).join('');
      var bars = r.form.map(function (c) { return '<i class="fl fl-' + c + '"></i>'; }).join('');
      var wdl = r.cnt ? '<b class="c-w">' + r.cnt.w + '</b> · <b class="c-d">' + r.cnt.d + '</b> · <b class="c-z">' + r.cnt.z + '</b> · <b class="c-l">' + r.cnt.l + '</b>' : '';
      var wdlM = r.cnt ? r.cnt.w + 'В · ' + r.cnt.d + 'РН · ' + r.cnt.z + 'БН · ' + r.cnt.l + 'П' : '';
      return '<div class="' + cls + '" role="row" data-key="' + esc(r.key) + '" tabindex="0" aria-selected="' + sel + '">' +
        '<span class="c-pl" role="cell"><span class="pc">' + (r.place != null ? r.place : '') + '</span>' + moveHtml(r.move) + '</span>' +
        '<span class="c-nm" role="cell"><span class="av" aria-hidden="true">' + esc(initials(r.name)) + '</span><span class="nmw">' +
          '<span class="rk-nm">' + esc(r.name) + '</span>' +
          (r.num ? '<span class="sub d-only">№ ' + r.num + '</span>' : '') +
          (r.cnt ? '<span class="msub m-only"><span class="fls" aria-hidden="true">' + bars + '</span>' + wdlM + '</span>' : '') +
        '</span></span>' +
        (hasT ? '<span class="c-form d-only" role="cell">' + form + '</span><span class="c-wdl d-only" role="cell">' + wdl + '</span>' : '') +
        '<span class="c-pts" role="cell"><b>' + (r.pts != null ? r.pts : '') + '</b>' +
          (r.fish != null ? '<small class="m-only">' + r.fish + ' ' + fishWord(r.fish) + '</small>' : '') + '</span>' +
        '<span class="c-win d-only" role="cell">' + (r.wins != null ? r.wins : '') + '</span>' +
        '<span class="c-fish d-only" role="cell">' + (r.fish != null ? r.fish : '') + '</span>' +
        '</div>';
    }).join('');
    if (!rows.length) body = '<div class="empty"><strong>Нікого не знайдено</strong>Спробуйте інше прізвище.</div>';
    return '<div class="rk' + (hasT ? '' : ' no-t') + '" role="table" aria-label="Загальний залік">' + head + body + '</div>';
  }

  // По турах
  function toursHtml() {
    var t = toursData();
    if (!t) return null;
    var places = placeByName(), s = standingsRows();
    var sByName = {};
    if (s) s.rows.forEach(function (r) { sByName[normName(r.name)] = r; });
    var started = s && s.rows.some(function (r) { return r.pts > 0; });
    var list = Object.keys(t.byName).map(function (k) { return t.byName[k]; });
    list.forEach(function (x) { var r = sByName[normName(x.name)]; x._st = r || null; });
    list.sort(function (a, b) {
      var pa = a._st && a._st.place != null ? a._st.place : 999, pb = b._st && b._st.place != null ? b._st.place : 999;
      return pa - pb;
    });
    list = list.filter(function (x) { return matchQuery(x.name); });
    var tot = tourTotals(t);
    var head = '<div class="tr-row tr-head"><span class="t-pl">#</span><span class="t-nm">Учасник</span>' +
      tot.map(function (f, i) { return '<span class="t-c"><b>' + (i + 1) + '</b><small>' + (f != null ? f : '') + '</small></span>'; }).join('') +
      '<span class="t-s d-only">Бали</span><span class="t-s d-only">Перем.</span><span class="t-s d-only">Риби</span></div>';
    var body = list.map(function (x, i) {
      var st = x._st, key = st ? st.key : x.name, sel = state.selected.has(key);
      var cells = x.tours.map(function (c) {
        if (!c.code) return '<span class="t-c"><span class="tc tc-none" title="Тур ' + c.n + ': ще не зіграно">–</span></span>';
        return '<span class="t-c"><span class="tc tc-' + c.code + '" title="Тур ' + c.n + ': ' + RC[c.code][1] + ', ' + c.fish + ' ' + fishWord(c.fish) + '">' +
          '<small>' + RC[c.code][0] + '</small><b>' + c.fish + '</b></span></span>';
      }).join('');
      return '<div class="tr-row r' + (ZEBRA && i % 2 ? ' z' : '') + (sel ? ' is-sel' : '') + '" data-key="' + esc(key) + '" tabindex="0" aria-selected="' + sel + '">' +
        '<span class="t-pl"><span class="pc' + medalCls(st && st.place, started) + '">' + (st && st.place != null ? st.place : '') + '</span></span>' +
        '<span class="t-nm">' + esc(x.name) + '</span>' + cells +
        '<span class="t-s d-only"><b>' + (st && st.pts != null ? st.pts : (x.points != null ? x.points : '')) + '</b></span>' +
        '<span class="t-s d-only">' + (st && st.wins != null ? st.wins : '') + '</span>' +
        '<span class="t-s d-only">' + (st && st.fish != null ? st.fish : '') + '</span></div>';
    }).join('');
    if (!list.length) body = '<div class="empty"><strong>Нікого не знайдено</strong>Спробуйте інше прізвище.</div>';
    return '<p class="tgrid-hint m-only" aria-hidden="true">гортайте →</p><div class="tgrid" role="region" aria-label="Результати по турах" tabindex="0"><div class="tgrid__in">' + head + body + '</div></div>';
  }

  // Список учасників під час реєстрації
  function participantsHtml(m) {
    var pl = state.payload || {};
    var seats = parseInt(pl.seats, 10) || 0;
    var all = m.rows.map(function (row, i) {
      return { key: row.key, i: i, n: m.placeCol ? row.cells[m.placeCol.c] : String(i + 1), name: m.nameCol ? row.cells[m.nameCol.c] : row.key };
    });
    var main = seats ? all.slice(0, seats) : all, reserve = seats ? all.slice(seats) : [];
    var free = seats && all.length < seats ? seats - all.length : 0;
    var newest = all.length - 2;   // останні дві реєстрації — «нове»
    // На комп'ютері дві колонки: ліва — перша половина списку, права — друга
    var half = 1;
    function z2(j) { return (j % half) % 2 ? ' z2' : ''; }
    function olOpen(count) { half = Math.max(1, Math.ceil(count / 2)); return '<ol class="plist" style="--rows:' + half + '">'; }
    function item(p, j) {
      var sel = state.selected.has(p.key);
      return '<li class="pt r' + (j % 2 ? ' z1' : '') + z2(j) + (sel ? ' is-sel' : '') + '" data-key="' + esc(p.key) + '">' +
        '<span class="pt__n">' + esc(p.n) + '</span><span class="av" aria-hidden="true">' + esc(initials(p.name)) + '</span>' +
        '<span class="pt__nm">' + esc(p.name) + '</span>' + (p.i >= newest && p.i > 0 && all.length > 3 ? '<span class="pt__new">new</span>' : '') + '</li>';
    }
    var vis = main.filter(function (p) { return matchQuery(p.name); });
    var nFree = free && !state.query ? free : 0;
    var h = '<div class="plist-head m-only" aria-hidden="true"><span>Учасник</span><span>№</span></div>' + olOpen(vis.length + nFree) + vis.map(item).join('');
    if (nFree) {
      for (var k = 0; k < nFree; k++) {
        var j = vis.length + k, nn = all.length + k + 1;
        h += '<li class="pt pt--free' + (j % 2 ? ' z1' : '') + z2(j) + '"><span class="pt__n">' + nn + '</span>' +
          '<span class="av av--free" aria-hidden="true"></span><span class="pt__nm">Вільне місце</span></li>';
      }
    }
    h += '</ol>';
    var rv = reserve.filter(function (p) { return matchQuery(p.name); });
    if (rv.length) h += '<p class="plist-sep">Резерв</p>' + olOpen(rv.length) + rv.map(item).join('') + '</ol>';
    if (!vis.length && !rv.length) h = '<div class="empty"><strong>Нікого не знайдено</strong>Спробуйте інше прізвище.</div>';
    return h;
  }

  function renderInfo() { if (el.info) el.info.hidden = true; }

  // ----- Події нового дизайну -----
  v2.search.addEventListener('input', function () { state.query = v2.search.value; renderBoard(); });
  v2.navList.addEventListener('click', function () { goList(); });
  document.getElementById('heroBack').addEventListener('click', function () { goList(); });
  v2.navStats.addEventListener('click', function () { goStats(); });
  v2.heroStats.addEventListener('click', function () { goStats(); });
  v2.heroReg.addEventListener('click', function () { goReg(); });
  v2.selCard.addEventListener('click', function () { goCard(); });
  v2.selClear.addEventListener('click', function () {
    selectOnly(null);
    Array.prototype.forEach.call(el.board.querySelectorAll('[data-key]'), function (row) {
      row.classList.remove('is-sel');
      if (row.hasAttribute('aria-selected')) row.setAttribute('aria-selected', 'false');
    });
  });
  var toastT = null;
  function toast(msg) {
    v2.toast.textContent = msg;
    v2.toast.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { v2.toast.hidden = true; }, 2600);
  }
  function shareLink(url, text) {
    var tg = window.Telegram && window.Telegram.WebApp;
    try {
      if (tg && tg.initData && tg.openTelegramLink) {
        tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text));
        return;
      }
    } catch (e) { /* */ }
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ title: text, text: text, url: url }).catch(function () {});
      return;
    }
    var done = function () { toast('Посилання скопійовано'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast(url); });
    else toast(url);
  }
  v2.share.addEventListener('click', function () {
    var ev = (state.payload && state.payload.event) || {};
    shareLink(SHARE_URL, (ev.title || 'TROUT MASTER') + ': результати наживо');
  });
  // Клавіатура: Enter/пробіл на рядку = тап
  el.board.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.r[data-key]')) { e.preventDefault(); e.target.click(); }
  });
  // ================= /Новий дизайн =================

  // Посилання на картку: t.me/…?startapp=p9 (Telegram) або …/#p9 (браузер) — номер із жеребкування
  var wantM = /(?:tgWebAppStartParam=|#)p(\d+)(?:&|$)/.exec(location.hash + '&' + location.search.replace(/^\?/, ''));
  state.wantPlayer = wantM ? +wantM[1] : null;
  function openWantedPlayer() {
    if (!state.wantPlayer || !drawData()) return;
    var dp = drawData().players.find(function (x) { return +x.n === state.wantPlayer; });
    state.wantPlayer = null;
    if (!dp || !hasCardData(dp.name)) return;
    var s = standingsRows(), r = s && s.rows.find(function (x) { return normName(x.name) === normName(dp.name); });
    selectOnly(r ? r.key : dp.name);
    renderBoard();
    goCard();
  }

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
