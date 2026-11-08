(function () {
  'use strict';
  // Мова інтерфейсу (assets/i18n.js): апка рендерить українською, англійську підставляє i18n.js
  var I18N = window.TM_I18N || { en: false, tr: function (s) { return s; }, translit: function (s) { return s; }, plural: function () { return null; } };

  // ---------- Автооновлення апки ----------
  // Telegram і браузери інколи тримають стару версію сторінки в кеші. Тому апка сама перевіряє,
  // чи на сервері новіша версія (номер ?v= у index.html), і якщо так — тихо перезавантажується.
  (function autoUpdate() {
    var me = document.currentScript && /[?&]v=([\w.-]+)/.exec(document.currentScript.src);
    var MY_V = me ? me[1] : null;
    if (!MY_V || !window.fetch) return;
    var busy = false;
    function check() {
      if (busy || document.hidden) return;
      busy = true;
      fetch(location.pathname + '?_=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
          var m = /assets\/app\.js\?v=([\w.-]+)/.exec(html || '');
          var v = m ? m[1] : null;
          if (!v || v === MY_V) return;
          var key = 'tm:reloadedTo';
          try { if (sessionStorage.getItem(key) === v) return; sessionStorage.setItem(key, v); } catch (e) { /* */ }
          // нова адреса з ?v=… — так Telegram точно не візьме сторінку з кешу; дані Telegram у # зберігаються
          var q = location.search.replace(/([?&])v=[^&]*&?/, '$1').replace(/[?&]$/, '');
          location.replace(location.pathname + (q ? q + '&' : '?') + 'v=' + encodeURIComponent(v) + location.hash);
        })
        .catch(function () { /* немає мережі — перевіримо пізніше */ })
        .then(function () { busy = false; });
    }
    setTimeout(check, 3000);                       // одразу після відкриття
    setInterval(check, 5 * 60 * 1000);             // і раз на 5 хвилин, поки апка відкрита
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });   // повернулися в апку
  })();

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
      try { if (window.TM_I18N && window.TM_I18N.syncCloud) window.TM_I18N.syncCloud(); } catch (e) { /* */ }   // мова, збережена в Telegram
      try { tg.expand(); } catch (e) { /* */ }
      try { if (at('7.7')) tg.disableVerticalSwipes(); } catch (e) { /* */ }
      try {
        if (at('8.0') && /^(ios|android)$/.test(tg.platform) && !tg.isFullscreen) tg.requestFullscreen();
      } catch (e) { /* */ }
      try {
        if (at('6.1')) { tg.setHeaderColor('#080808'); tg.setBackgroundColor('#f4f6f8'); }
        if (at('7.10')) tg.setBottomBarColor('#f4f6f8');
      } catch (e) { /* */ }
      // Є системна кнопка «Назад» Telegram — свою кнопку «Назад» на телефоні ховаємо (див. .tg-back у стилях)
      try { if (at('6.1') && tg.BackButton) document.documentElement.classList.add('tg-back'); } catch (e) { /* */ }
      try { document.dispatchEvent(new Event('tm-tg-ready')); } catch (e) { /* */ }
    };
    document.head.appendChild(s);

    // Чи заїхав верх «аркуша» під панель Telegram (тоді малюємо заокруглені кути зверху)
    var frame = 0;
    function updateStuck() {
      frame = 0;
      var tb = document.querySelector('.topbar');
      // Світлий «аркуш»: у картці й статистиці це .pc-sheet під темною шапкою, на інших екранах — .main
      var main = null;
      [].some.call(document.querySelectorAll('.pc-sheet'), function (x) { if (x.getClientRects().length) { main = x; return true; } return false; });
      main = main || document.querySelector('.main');
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
    if (I18N.en) { var en = I18N.plural(n, one, few, many); if (en) return en; }
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

  // Скелетон, поки вантажаться дані: лише обриси рядків (кружечок, ім'я, число) — легкий, без деталей
  function skeletonRows() {
    var w = [62, 48, 70, 54, 66, 44, 58];
    return '<div class="skel" role="status" aria-live="polite"><span class="visually-hidden">Завантаження результатів…</span>' +
      w.map(function (x) { return '<div class="skel__row" aria-hidden="true"><i class="skel__dot"></i><i class="skel__bar" style="width:' + x + '%"></i><i class="skel__num"></i></div>'; }).join('') +
      '</div>';
  }
  function renderTable() {
    var m = currentModel();
    var prevScroller = el.board.querySelector('.bs');
    var scrollX = prevScroller ? prevScroller.scrollLeft : 0;
    el.board.classList.remove('is-wide', 'is-compact');

    if (!m) {
      el.board.innerHTML = state.error
        ? '<div class="empty"><strong>Не вдалося завантажити результати</strong>Сторінка повторить спробу автоматично.</div>'
        : skeletonRows();
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
    // На вузькому телефоні слово «Оновлено» ховаємо (лишається зелена крапка й час), щоб у шапку влазив перемикач мови
    var mw = s === 'live' && text.match(/^(Оновлено (?:\u2013 )?)(.*)$/);
    if (mw) el.statusText.innerHTML = '<span class="st-w">' + esc(mw[1]) + '</span>' + esc(mw[2]);
    else el.statusText.textContent = text;
    el.status.setAttribute('aria-label', text);
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
    celebrateFinal();
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
    if (p && p.event && I18N.setEvent) I18N.setEvent(p.event);
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
        state.lastLoad = { ok: true, changed: !!changed };
        state.error = null;
        if (changed) renderAll();
        openWantedPlayer();
        renderStatus(true);
      })
      .catch(function (err) {
        state.error = (err && err.message) || 'невідома помилка';
        state.lastLoad = { ok: false };
        renderStatus(false);
        if (!state.models.length) renderBoard();
      })
      .finally(function () {
        state.loading = false;
        schedule();
        try { window.dispatchEvent(new Event('tm:loaded')); } catch (e) { /* */ }
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
    if (b.getAttribute('aria-selected') === 'true') return;
    var next = b.getAttribute('data-tab');
    // Плавний перехід «Підсумок ↔ По турах»: таблиця розтягується/стискається, бічна панель від'їжджає праворуч
    smoothSwap(function () {
      state.tab = next;
      var sc = el.board.querySelector('.bs');
      if (sc) sc.scrollLeft = 0;
      renderTabs();
      renderBoard();
      var cur = el.tabs.querySelector('[aria-selected="true"]');
      if (cur) cur.focus({ preventScroll: true });
    });
  });
  function smoothSwap(fn) {
    var root = document.documentElement;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return; }
    // Мобайл: бічної панелі нема, тож без View Transition (його знімок перекриває фіксовані кнопки й «кришку» TG) —
    // просто м'яко проявляємо нову таблицю.
    if (!document.startViewTransition || (window.matchMedia && window.matchMedia('(max-width: 979px)').matches)) {
      fn();
      var bd = el.board; bd.classList.remove('tab-in'); void bd.offsetWidth; bd.classList.add('tab-in');
      clearTimeout(bd._tin); bd._tin = setTimeout(function () { bd.classList.remove('tab-in'); }, 260);
      return;
    }
    root.classList.add('vt-tabs');
    var t;
    try { t = document.startViewTransition(fn); } catch (e) { root.classList.remove('vt-tabs'); fn(); return; }
    var done = function () { root.classList.remove('vt-tabs'); };
    t.finished.then(done, done);
  }
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
  function fmt1(v) { return (Math.round(v * 10) / 10).toString().replace('.', I18N.en ? '.' : ','); }
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
  // ---------- «Одометр»: числа рахують від 0 до значення ----------
  var countedCard = '';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(els, ms) {
    if (REDUCED || !els || !els.length) return;
    ms = ms || 900;
    var items = [];
    [].forEach.call(els, function (el) {
      // лише власний текст (без <small> і прихованих підписів)
      [].forEach.call(el.childNodes, function (n) {
        if (n.nodeType !== 3 || !/\d/.test(n.nodeValue)) return;
        var parts = [], re = /(\d+(?:[.,]\d+)?)/g, last = 0, m, src = n.nodeValue;
        while ((m = re.exec(src))) {
          parts.push(src.slice(last, m.index));
          var txt = m[1], dec = (txt.split(/[.,]/)[1] || '').length;
          parts.push({ to: parseFloat(txt.replace(',', '.')), dec: dec, sep: txt.indexOf(',') !== -1 ? ',' : '.' });
          last = m.index + txt.length;
        }
        parts.push(src.slice(last));
        items.push({ node: n, parts: parts });
      });
    });
    if (!items.length) return;
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms), e = 1 - Math.pow(1 - k, 3);   // плавне сповільнення в кінці
      items.forEach(function (it) {
        if (!it.node.isConnected) return;
        it.node.nodeValue = it.parts.map(function (p) {
          if (typeof p === 'string') return p;
          var v = p.to * e;
          return (p.dec ? v.toFixed(p.dec) : String(Math.round(v))).replace('.', p.sep);
        }).join('');
      });
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Конфеті: короткий «вжух» (без бібліотек) ----------
  function confetti(from) {
    if (REDUCED) return;
    var cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = window.innerWidth, H = window.innerHeight;
    cv.className = 'confetti'; cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    var c = cv.getContext('2d'); c.scale(dpr, dpr);
    var r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    var ox = r ? r.left + r.width / 2 : W / 2, oy = r ? r.top + r.height / 2 : H * 0.28;
    var COLORS = ['#f5c542', '#e8b931', '#76b12d', '#4a9112', '#ffffff', '#5b8fe0', '#e0675c'];
    var parts = [];
    for (var i = 0; i < 150; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1, sp = 7 + Math.random() * 9;
      parts.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
        col: COLORS[i % COLORS.length], round: Math.random() < 0.25
      });
    }
    var t0 = null, DUR = 2600;
    (function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = (ts - t0) / DUR;
      c.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        c.save(); c.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3);
        c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col;
        if (p.round) { c.beginPath(); c.arc(0, 0, p.w / 2.4, 0, 6.28); c.fill(); }
        else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
        c.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(performance.now());
  }
  function glow(el) {
    if (!el) return;
    el.classList.remove('is-glow'); void el.offsetWidth; el.classList.add('is-glow');
    setTimeout(function () { el.classList.remove('is-glow'); }, 2600);
  }
  // Турнір завершено: усі тури внесено
  function tournamentDone() {
    var S = tournamentStats();
    return !!(S && S.rounds && S.played >= S.rounds);
  }
  // Святкування — один раз на пристрої для кожного турніру (щоб не набридало при кожному відкритті)
  function onceOnDevice(k) {
    try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); return true; } catch (e) { return true; }
  }
  function finKey() { var ev = state.payload && state.payload.event; return 'tm:fin:' + ((ev && ev.title) || '') + '|' + ((ev && ev.subtitle) || ''); }
  // Підсумкові результати: раз за сеанс — конфеті з переможця на подіумі (або над таблицею) і сяйво медалі
  function celebrateFinal() {
    if (state.view !== 'list' || isListMode() || !tournamentDone()) return;
    var m = currentModel();
    if (!m || !/результат/i.test(m.name)) return;
    if (!onceOnDevice(finKey())) return;
    setTimeout(function () {
      var p1 = v2.side && !v2.side.hidden ? v2.side.querySelector('.p1') : null;
      var row1 = el.board.querySelector('.rk-row.medal-1 .pc');
      confetti(p1 && p1.offsetWidth ? p1.querySelector('.podium__av') || p1 : row1);
      glow(p1 && p1.offsetWidth ? p1.querySelector('.podium__bar') : row1);
    }, 450);
  }

  // Стовпчики графіків «виростають» знизу по черзі, далі з'являються числа й лінія середнього
  function growCharts(root) {
    if (REDUCED || !root) return;
    [].forEach.call(root.querySelectorAll('.pc-chart'), function (svg) {
      var i = 0;
      [].forEach.call(svg.querySelectorAll('rect.bar, rect.bar-t'), function (r) { r.style.animationDelay = (i++ * 45) + 'ms'; });
      var j = 0;
      [].forEach.call(svg.querySelectorAll('text.val'), function (t) { t.style.animationDelay = (250 + j++ * 45) + 'ms'; });
      svg.classList.add('grow');
    });
  }
  var grownStats = false;

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
    var I_STORY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7v6M9 10l3-3 3 3"/></svg>';
    h += '<header class="pc-hero"><div class="pc-hero__bar">' +
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span class="l-m">Назад</span><span class="l-d">До підсумку</span></button>' +
      '<span class="pc-hero__acts">' +
        (nav.prev ? '<button type="button" class="pc-ibtn d-only" data-act="prev" aria-label="Попередній учасник: ' + esc(nav.prev.name) + '">' + I_BACK + '</button>' : '') +
        (nav.next ? '<button type="button" class="pc-ibtn d-only" data-act="next" aria-label="Наступний учасник: ' + esc(nav.next.name) + '">' + I_NEXT + '</button>' : '') +
        (started ? '<button type="button" class="pc-sharestory d-only" data-act="story">' + I_STORY + '<span>Поділитися результатом</span></button>' : '') +
        '<button type="button" class="pc-share d-only" data-act="share" aria-label="Поділитися карткою">' + I_SHARE + '<span>Поділитися карткою</span></button>' +
      '</span></div>' +
      '<div class="pc-hero__main">' +
      // Є фото — кружечок із фото, а місце маленьким значком у куті; немає — кружечок із місцем, як раніше
      (PHOTOS[normName(st.name)]
        ? '<div class="pc-ava" aria-hidden="true"><img src="assets/players/lg/' + encodeURIComponent(PHOTOS[normName(st.name)]) + '?v=' + PHOTO_V + '" alt="" decoding="async" onerror="this.onerror=null;this.src=this.src.replace(\'/lg/\',\'/\')">' +
            (started && st.place ? '<span class="pc-place pc-place--badge' + medal + '">' + st.place + '</span>' : '') + '</div>'
        : '<div class="pc-ava pc-ava--ini" aria-hidden="true"><span class="pc-ini">' + esc(initials(st.name)) + '</span>' +   // без фото — ініціали в такому ж кружечку
            (started && st.place ? '<span class="pc-place pc-place--badge' + medal + '">' + st.place + '</span>' : '') + '</div>') +
      '<div class="pc-head__txt"><h1 class="title" id="pcTitle" tabindex="-1">' + esc(st.name) + '</h1>' +
      '<p class="pc-sub m-only">' + esc([st.num ? '№ ' + st.num : '', sideWord ? sideWord + ' берег' : '', placeTxt].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="pc-chips d-only">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') +
        (placeTxt ? '<span class="chip chip-place' + medal + '">' + esc(placeTxt) + '</span>' : '') +
        (ev.title ? '<span class="chip chip-plain">' + esc(ev.title) + '</span>' : '') + '</p>' +
      '</div>' +
      // На телефоні «Поділитися» — іконка праворуч від імені
      '<button type="button" class="pc-share pc-share--m m-only" data-act="share" aria-label="Поділитися карткою">' + I_SHARE + '</button>' +
      '</div></header><div class="pc-sheet">';

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
          '<span class="pk__badge ' + (diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : '') + '">' + (diff > 0 ? '+' : '') + diff + '<span class="d-only"> ' + fishWord(Math.abs(diff)) + '</span></span></div>' : gapTile(st)) +
        '<div class="pk"><span class="pk__l">Перемоги</span><span class="pk__v pk__v--sm">' + Math.round(st.winRate * 100) + '%</span>' +
          '<span class="pk__s">' + (st.streak ? '<span class="l-m">серія — ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + '</span><span class="l-d">найдовша серія — ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + ' поспіль</span>' : st.cnt.w + ' з ' + st.played) + '</span></div>' +
        '</div>' +
        // Телефон: кнопка внизу екрана, як «Зареєструватися»
        '<div class="pc-storybar m-only"><button type="button" class="btn pc-storybtn" data-act="story">' + I_STORY +
          '<span class="btn__text">Поділитися результатом</span></button></div>';
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
    // Цифри у верхніх плитках «докручуються» від нуля — лише коли картку щойно відкрили (не при кожному оновленні даних)
    if (state.view === 'card' && countedCard !== name) {
      countedCard = name;
      countUp(pc.body.querySelectorAll('.pc-k .pk__v, .pc-k .pk__badge'));
      growCharts(pc.body);
      // Призер відкрив свою картку після фіналу — привітання конфеті (раз за сеанс)
      if (started && st.place >= 1 && st.place <= 3 && tournamentDone() && isMine(name)) {
        var ck = finKey() + ':card:' + normName(name);
        if (onceOnDevice(ck)) setTimeout(function () {
          var badge = pc.body.querySelector('.pc-hero .pc-place');
          confetti(pc.body.querySelector('.pc-hero .pc-ava') || badge);
          glow(badge);
        }, 350);
      }
    }

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
          // Скільки секторів на водоймі — з аркуша «Сайт» (B13); якщо не вказано — найбільший номер із жеребкування.
          // Сектори без жодного туру теж показуємо (порожні), щоб карта відповідала водоймі.
          var secN = +(state.payload && state.payload.sectors) || 0;
          for (var sk = 1; sk <= secN; sk++) if (!sectors[sk]) sectors[sk] = { sector: sk, cells: [], fish: 0, n: 0 };
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
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span>' + (isListMode() ? 'Учасники' : 'Підсумок') + '</span></button></div>' +
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
    if (!grownStats && state.view === 'stats') { grownStats = true; growCharts(ts.body); }

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
    // Секторів на водоймі: з аркуша «Сайт» або найбільший номер у жеребкуванні; на кожному березі — половина
    var N = Math.max(+(state.payload && state.payload.sectors) || 0, rows.reduce(function (m, r) { return Math.max(m, r.sector); }, 0));
    var half = Math.ceil(N / 2);
    // «14 (6, 8)» на аркуші «Сайт»: верхній берег 6, нижній 8 (нумерація та сама — по колу від нижнього лівого)
    var split = state.payload && state.payload.sectorsSplit;
    if (split && +split[0] + +split[1] === N) half = +split[1];
    var cols = Math.max(half, N - half);
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
      '<div class="pond" style="--pond-n:' + cols + '" role="img" aria-label="Карта водойми: ' + caption + '">' +
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
    // підписи: [повний (веб), короткий (телефон)]; англійською на телефоні — «m», щоб влізли хвилини
    var U = I18N.en ? { d: ['d', 'd'], h: ['h', 'h'], m: ['min', 'm'], s: ['s', 's'] } : { d: ['д', 'д'], h: ['год', 'г'], m: ['хв', 'хв'], s: ['с', 'с'] };
    var parts = d ? [[d, U.d[0], U.d[1]], [h, U.h[0], U.h[1]], [pad2(m), U.m[0], U.m[1]]] : [[h, U.h[0], U.h[1]], [pad2(m), U.m[0], U.m[1]], [pad2(sec), U.s[0], U.s[1]]];
    if (d) parts.push([pad2(sec), U.s[0], U.s[1], ' d-only']);   // на вебі — ще й секунди (на телефоні лишаємо три плитки)
    return '<span class="visually-hidden">' + (d ? d + ' д ' : '') + h + ' год ' + m + ' хв</span>' + parts.map(function (x, i) {
      return '<span class="tt' + (i === 2 ? ' tt-3' : '') + (x[3] || '') + '" aria-hidden="true"><b>' + x[0] + '</b><span class="l-d">' + x[1] + '</span><span class="l-m">' + x[2] + '</span></span>';
    }).join('');
  }
  function renderTimer() {
    var d = regDeadline();
    var on = !!d && regOpenNow() && (state.view === 'list' || state.view === 'reg');
    reg.timer.hidden = !on;
    if (!on) { clearInterval(timerId); timerId = null; return; }
    var left = d.getTime() - Date.now();
    if (left <= 0) { clearInterval(timerId); timerId = null; renderReg(); renderKpis(); return; }   // час вийшов: ховаємо кнопку, картка → «Закрита»
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

  // ----- Картка учасника: прилипла шапка таблиці «Тури» отримує заокруглені кути, як у картки -----
  var stuckFrame = 0;
  function markStuckHeads() {
    stuckFrame = 0;
    // Шапка «прилипла», якщо вона нижче свого звичайного місця (одразу після попереднього елемента
    // або від верху таблиці)
    var tbar = IN_TG ? document.querySelector('.topbar') : null;
    var capTop = tbar ? parseFloat(getComputedStyle(tbar).paddingTop) || 0 : 0;   // нижній край панелі Telegram
    [].forEach.call(document.querySelectorAll('.pcard .pc-tour--head, .tg .rk-head, .tg .plist-head, .tg .tgrid-hd'), function (hd) {
      if (!hd.offsetParent) return;
      var prev = hd.previousElementSibling, natural;
      if (prev && prev.offsetParent) natural = prev.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(prev).marginBottom) || 0);
      else { var par = hd.parentElement; natural = par.getBoundingClientRect().top + (parseFloat(getComputedStyle(par).borderTopWidth) || 0) + (parseFloat(getComputedStyle(par).paddingTop) || 0); }
      var r = hd.getBoundingClientRect().top;
      hd.classList.toggle('is-stuck', r > natural + 0.5);
      // Telegram: шапка над «кришкою» аркуша лише поки стоїть на своєму місці (12 px під панеллю);
      // коли таблиця закінчується і шапка їде вгору — ховається під заокруглення, а не налазить на кути
      if (IN_TG) hd.classList.toggle('over-cap', r >= capTop + 11.5);
    });
    // Форма реєстрації (Telegram): так само
    if (IN_TG && state.view === 'reg' && reg.form.offsetParent) {
      reg.form.classList.toggle('over-cap', reg.form.getBoundingClientRect().top >= capTop + 11.5);
    }
  }
  window.addEventListener('scroll', function () { if (!stuckFrame) stuckFrame = requestAnimationFrame(markStuckHeads); }, { passive: true });

  // ----- Реєстрація на телефоні: при фокусі на першому полі форма піднімається до верху -----
  // Шапка турніру прокручується повністю, лишається лише заокруглення аркуша, а картка форми
  // стоїть на 12 px під ним (у Telegram — під панеллю Telegram), як і від країв екрана.
  var formLift = { spacer: 0 };
  function setFormSpacer(px) {
    formLift.spacer = Math.max(0, Math.ceil(px));
    var m = document.querySelector('.main');
    if (m) m.style.paddingBottom = formLift.spacer ? 'calc(' + formLift.spacer + 'px + 112px)' : '';
  }
  function liftForm() {
    if (state.view !== 'reg' || window.innerWidth >= 980 || reg.form.hidden || !reg.form.offsetParent) return;
    var tgTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tg-top')) || 0;
    if (IN_TG) {
      // --tg-top — це calc() зі змінних Telegram; беремо готове значення з відступу шапки
      var tb = document.querySelector('.topbar');
      tgTop = tb ? parseFloat(getComputedStyle(tb).paddingTop) || 0 : 0;
    }
    var target = reg.form.getBoundingClientRect().top + window.scrollY - (tgTop + 12);
    var room = document.documentElement.scrollHeight - window.innerHeight;
    if (target > room) setFormSpacer(formLift.spacer + target - room);
    var smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { window.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { window.scrollTo(0, target); }
  }
  reg.name.addEventListener('focus', function () {
    liftForm();
    // iOS сам прокручує до поля, коли виїжджає клавіатура, — вирівнюємо ще раз після цього
    setTimeout(liftForm, 350);
  });

  function setView(v) {
    if (state.view === v) return;
    state.view = v;
    if (v !== 'card') countedCard = '';   // наступне відкриття картки — знову з «докручуванням»
    if (v !== 'stats') grownStats = false;
    if (formLift.spacer) setFormSpacer(0);
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

  // ----- Telegram: потягнути сторінку вниз — оновити дані (pull to refresh) -----
  // Робить той самий запит, що й автооновлення кожні 15 с: бере вже опубліковані дані, таблицю не чіпає.
  // «Оновлено – 14:32» показує час публікації, тож від ручного оновлення він не змінюється, якщо нових даних немає.
  (function pullToRefresh() {
    if (!IN_TG) return;
    var GO = 72, MAX = 110, COOLDOWN = 3000;
    var ind = null, sy = 0, sx = 0, dy = 0, on = false, decided = false, armed = false, busy = false, lastAt = 0;
    function indicator() {
      if (ind) return ind;
      ind = document.createElement('div');
      ind.className = 'ptr';
      ind.setAttribute('aria-hidden', 'true');
      ind.innerHTML = '<svg class="ptr__arrow" viewBox="0 0 24 24"><path d="M12 5v13M6 12l6 6 6-6"/></svg><span class="ptr__spin"></span>';
      document.body.appendChild(ind);
      return ind;
    }
    function paint(d) {
      var i = indicator(), k = Math.min(d, MAX) / MAX;
      i.classList.add('is-dragging');
      i.style.opacity = String(Math.min(1, k * 1.8));
      i.style.transform = 'translate(-50%, ' + (Math.min(d, MAX) * 0.55 - 44) + 'px) rotate(' + (armed ? 180 : 0) + 'deg)';
      var nowArmed = d >= GO;
      if (nowArmed !== armed) {
        armed = nowArmed;
        i.classList.toggle('is-armed', armed);
        i.style.transform = 'translate(-50%, ' + (Math.min(d, MAX) * 0.55 - 44) + 'px) rotate(' + (armed ? 180 : 0) + 'deg)';
        if (armed) try { window.Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (e) { /* */ }
      }
    }
    function hide() {
      if (!ind) return;
      ind.classList.remove('is-dragging', 'is-armed', 'is-busy');
      ind.style.opacity = '0';
      ind.style.transform = 'translate(-50%, -44px)';
    }
    function refresh() {
      var i = indicator();
      busy = true; lastAt = Date.now();
      i.classList.remove('is-dragging', 'is-armed');
      i.classList.add('is-busy');
      i.style.opacity = '1';
      i.style.transform = 'translate(-50%, 16px)';
      try { window.Telegram.WebApp.HapticFeedback.impactOccurred('light'); } catch (e) { /* */ }
      var t0 = Date.now();
      if (!state.loading) load();
      var iv = setInterval(function () {
        if (state.loading || Date.now() - t0 < 700) return;   // крутимо щонайменше 0,7 с, щоб було видно
        clearInterval(iv);
        busy = false;
        try { window.Telegram.WebApp.HapticFeedback.notificationOccurred(state.error ? 'error' : 'success'); } catch (e) { /* */ }
        hide();
      }, 100);
    }
    document.addEventListener('touchstart', function (e) {
      if (busy || e.touches.length !== 1 || (window.scrollY || document.documentElement.scrollTop) > 0) return;
      var t = e.touches[0];
      if (t.clientX <= 28) return;   // від лівого краю — це жест «Назад»
      on = true; decided = false; armed = false; sy = t.clientY; sx = t.clientX; dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!on) return;
      var t = e.touches[0], my = t.clientY - sy, mx = t.clientX - sx;
      if (!decided) {
        if (Math.abs(my) < 8 && Math.abs(mx) < 8) return;
        decided = true;
        if (my <= 0 || Math.abs(mx) > Math.abs(my) || (window.scrollY || 0) > 0) { on = false; return; }
      }
      dy = Math.max(0, my);
      if (e.cancelable) e.preventDefault();
      paint(dy);
    }, { passive: false });
    document.addEventListener('touchend', function () {
      if (!on) return;
      on = false;
      if (decided && dy >= GO && Date.now() - lastAt > COOLDOWN) refresh(); else hide();
      armed = false;
    }, { passive: true });
    document.addEventListener('touchcancel', function () { if (on) { on = false; if (!busy) hide(); } }, { passive: true });
  })();

  // ----- Telegram: свайп від лівого краю екрана — «Назад» (iOS і Android) -----
  // Працює на реєстрації, картці й статистиці. Тягнемо палець від краю: з'являється стрілка,
  // після ~72 px вона заповнюється — відпускаєш, і повертаємось на головну.
  (function edgeSwipeBack() {
    if (!IN_TG) return;
    var EDGE = 28, GO = 72, MAX = 96;
    var ind = null, sx = 0, sy = 0, dx = 0, on = false, decided = false, armed = false;
    function indicator() {
      if (ind) return ind;
      ind = document.createElement('div');
      ind.className = 'swipe-back';
      ind.setAttribute('aria-hidden', 'true');
      ind.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
      document.body.appendChild(ind);
      return ind;
    }
    function paint(x, y) {
      var i = indicator(), k = Math.min(x, MAX) / MAX;
      i.classList.add('is-dragging');
      i.style.top = y + 'px';
      i.style.transform = 'translate(' + (Math.min(x, MAX) * 0.6 - 44) + 'px, -50%) scale(' + (0.6 + 0.4 * k) + ')';
      i.style.opacity = String(Math.min(1, k * 1.6));
      var nowArmed = x >= GO;
      if (nowArmed !== armed) {
        armed = nowArmed;
        i.classList.toggle('is-armed', armed);
        if (armed) try { window.Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (e) { /* */ }
      }
    }
    function reset() {
      on = decided = armed = false; dx = 0;
      if (ind) { ind.classList.remove('is-armed', 'is-dragging'); ind.style.opacity = '0'; ind.style.transform = 'translate(-44px, -50%) scale(0.6)'; }
    }
    document.addEventListener('touchstart', function (e) {
      if (state.view === 'list' || e.touches.length !== 1) return;
      var t = e.touches[0];
      if (t.clientX > EDGE) return;
      on = true; decided = false; sx = t.clientX; sy = t.clientY; dx = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!on) return;
      var t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (!decided) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        decided = true;
        if (mx <= 0 || Math.abs(my) > Math.abs(mx)) { on = false; return; }   // вертикальний скрол — не наш жест
      }
      dx = Math.max(0, mx);
      if (e.cancelable) e.preventDefault();
      paint(dx, t.clientY);
    }, { passive: false });
    function end() {
      if (!on) return;
      var go = decided && dx >= GO;
      reset();
      if (go) goList();
    }
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', function () { reset(); }, { passive: true });
  })();

  // ----- Telegram: автоматично виділити свій рядок -----
  // Скрипт таблиці за підписаними даними Telegram знаходить ім'я людини (колонка G → B).
  // Виділяємо кожне ім'я лише один раз: якщо людина зняла виділення, воно не повертається.
  var LS_AUTO = 'tm:autoSel';
  // Чи це «свій» учасник: зареєстрований із цього акаунта Telegram
  function isMine(name) {
    var n = normName(name);
    return (state.myNames || []).some(function (x) { return normName(x) === n; });
  }
  function applyMyNames(names) {
    state.myNames = names.slice();
    var done = store.get(LS_AUTO, []);
    if (state.selFromLink) { names.forEach(function (n) { if (done.indexOf(n) === -1) done.push(n); }); store.set(LS_AUTO, done.slice(-50)); return; }
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
        nbarReady();
      })
      .catch(function () { nbarReady(); /* не вийшло — нічого страшного */ });
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

  // Кнопка партнера над нижньою кнопкою (лише в ТГ на телефоні): відкриває канал усередині Telegram
  (function () {
    ['partner', 'partnerWeb'].forEach(function (id) {
      var a = document.getElementById(id);
      if (!a) return;
      a.addEventListener('click', function (e) {
        var tg = tgApp();
        if (!IN_TG || !tg || typeof tg.openTelegramLink !== 'function') return;   // звичайний браузер — просте посилання
        e.preventDefault();
        try { tg.HapticFeedback && tg.HapticFeedback.impactOccurred('light'); } catch (er) { /* */ }
        tg.openTelegramLink(a.href);
      });
    });
  })();

  // Плашка над таблицею «Результати — у Telegram»: для всіх у ТГ, хто ще не дозволив боту писати.
  // Показуємо лише після відповіді «Хто я?» (щоб не блимала тим, кому вже можна писати). Хрестик ховає на 14 днів.
  var LS_NBAR = 'tm:nbarHideUntil', nbarOk = false;
  function nbarReady() { nbarOk = true; renderNbar(); }
  function renderNbar() {
    var el = $('nbar');
    if (!el) return;
    var hideUntil = Number(store.get(LS_NBAR, 0)) || 0;
    el.hidden = !(nbarOk && IN_TG && canOfferNotify() && Date.now() > hideUntil);
  }
  $('nbarX').addEventListener('click', function () {
    store.set(LS_NBAR, Date.now() + 14 * 864e5);
    renderNbar();
  });
  $('nbarGo').addEventListener('click', function () {
    var tg = tgApp();
    if (!tg) return;
    try {
      tg.requestWriteAccess(function (granted) {
        if (granted) {
          state.canWrite = true;
          store.set(LS_WRITE, true);
          sendWriteAccess(true);
          var el = $('nbar');
          el.classList.add('is-done');
          $('nbarTxt').innerHTML = '<b>🔔 Готово!</b><small>Результати прийдуть у Telegram</small>';
          setTimeout(function () { el.hidden = true; el.classList.remove('is-done'); }, 2600);
        } else {
          store.set(LS_NBAR, Date.now() + 14 * 864e5);
          renderNbar();
        }
      });
    } catch (e) { /* */ }
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
  // Кнопка сіра, доки поля не заповнені правильно; натиснути її можна завжди — тоді підсвітяться помилки
  function updateRegReady() {
    var ok = !nameError(reg.name.value) && !phoneError(reg.phone.value);
    reg.submit.classList.toggle('is-idle', !ok);
  }
  reg.form.addEventListener('input', updateRegReady);
  reg.name.addEventListener('blur', updateRegReady);
  reg.phone.addEventListener('blur', updateRegReady);
  updateRegReady();

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
        updateRegReady();
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
    if (act === 'story') { openStory(selectedPlayerName()); return; }
    if (act === 'share') {
      var nm = selectedPlayerName(), dp = nm ? drawPlayer(nm) : null;
      shareLink(shareUrl(dp && dp.n), (nm || 'Учасник') + ': картка учасника TROUT MASTER');
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
    selbar: $('selbar'), selPlace: $('selPlace'), selName: $('selName'), selCard: $('selCard'), selClear: $('selClear'), selLbl: $('selLbl'),
    side: $('side'), toast: $('toast')
  };
  var SHARE_URL = 'https://t.me/troutmasterua_bot?startapp';
  var WEB_URL = 'https://troutmaster.app/';
  // У Telegram ділимось посиланням на Mini App, у браузері — на сайт (картка: …?startapp=p9 / …/#p9)
  function shareUrl(n) {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initData) return n ? SHARE_URL + '=p' + n : SHARE_URL;
    return n ? WEB_URL + '#p' + n : WEB_URL;
  }
  var ZEBRA = true;
  var RC = { w: ['В', 'Перемога'], d: ['РН', 'Рибна нічия'], z: ['БН', 'Безрибна нічия'], l: ['П', 'Поразка'] };
  state.query = '';

  function isListMode() {
    var p = state.payload;
    return !!p && (p.mode === 'Список учасників' ||
      (!p.mode && (p.sheets || []).length === 1 && /учасник/i.test(p.sheets[0].name || '')));
  }
  function tabLabel(name) { return /результат/i.test(name) ? 'Підсумок' : /^тур/i.test(String(name).trim()) ? 'По турах' : name; }
  function initials(n) { if (I18N.en) n = I18N.translit(n); return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0); }).join('').toUpperCase(); }
  // ----- Фото учасників (assets/players/players.json: «прізвище ім'я» малими літерами → файл) -----
  // Кого немає у списку або чиє фото не завантажилось — показуємо ініціали.
  var PHOTOS = {};
  var PHOTO_V = 5;   // збільшити, коли фото замінено на нові (щоб Telegram і браузери не тримали старі)
  function avatarHtml(name) {
    var f = PHOTOS[normName(name)];
    return '<span class="av' + (f ? ' av--ph' : '') + '" aria-hidden="true">' + esc(initials(name)) +
      (f ? '<img src="assets/players/' + encodeURIComponent(f) + '?v=' + PHOTO_V + '" alt="" loading="lazy" decoding="async">' : '') + '</span>';
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('av')) {
      t.parentNode.classList.remove('av--ph'); t.remove();
    }
  }, true);
  fetch('assets/players/players.json?v=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (m) {
      if (!m || typeof m !== 'object' || !Object.keys(m).length) return;
      PHOTOS = m;
      if (state.models && state.models.length) { renderBoard(); try { renderSide(); } catch (e) { /* */ } }
      if (state.view === 'card' && typeof renderCard === 'function') try { renderCard(); } catch (e) { /* */ }
    })
    .catch(function () { /* без фото — лишаються ініціали */ });
  function colBy(m, re) { return m.cols.find(function (k) { return k.role !== 'name' && k.role !== 'place' && re.test(k.label); }) || null; }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, I18N.en ? ',' : ' '); }
  function matchQuery(name) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    if (String(name).toLowerCase().indexOf(q) !== -1) return true;
    return I18N.en && I18N.translit(String(name)).toLowerCase().indexOf(q) !== -1;   // англійською шукають латиницею
  }
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
  // ----- Картинка-сторіс з результатом учасника (1080×1920) -----
  // Важливе — в «безпечній зоні» сторіс Instagram/Telegram: зверху ~200 px перекриває інтерфейс, знизу ~260 px — поле відповіді
  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  }
  // Прямокутник із кутами-супереліпсом (як «згладжування кутів» в iOS): |x|^n + |y|^n = 1
  function sqPath(ctx, x, y, w, h, r, n) {
    n = n || 4.2; r = Math.min(r, w / 2, h / 2);
    var steps = 18, pts = [];
    function corner(cx, cy, sx, sy, from) {
      for (var i = 0; i <= steps; i++) {
        var t = (from + i / steps) * Math.PI / 2;
        var ct = Math.cos(t), st = Math.sin(t);
        pts.push([cx + sx * r * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n), cy + sy * r * Math.sign(st) * Math.pow(Math.abs(st), 2 / n)]);
      }
    }
    // правий верхній, правий нижній, лівий нижній, лівий верхній
    var q = [];
    for (var i = 0; i <= steps; i++) { var t = i / steps * Math.PI / 2; q.push([Math.pow(Math.cos(t), 2 / n), Math.pow(Math.sin(t), 2 / n)]); }
    ctx.beginPath();
    q.forEach(function (p, i) { var px = x + w - r + r * p[0], py = y + r - r * p[1]; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    q.slice().reverse().forEach(function (p) { ctx.lineTo(x + r - r * p[0], y + r - r * p[1]); });
    q.forEach(function (p) { ctx.lineTo(x + r - r * p[0], y + h - r + r * p[1]); });
    q.slice().reverse().forEach(function (p) { ctx.lineTo(x + w - r + r * p[0], y + h - r + r * p[1]); });
    ctx.closePath();
  }
  // Розмиття малої копії: кілька проходів box-blur по горизонталі й вертикалі ≈ гаусове розмиття
  function boxBlur(ctx, w, h, r, passes) {
    var im = ctx.getImageData(0, 0, w, h), a = im.data, b = new Float32Array(a.length), t = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) b[i] = a[i];
    function pass(src, dst, horiz) {
      var len = horiz ? w : h, lines = horiz ? h : w;
      for (var l = 0; l < lines; l++) for (var ch = 0; ch < 4; ch++) {
        var sum = 0, idx = function (k) { k = k < 0 ? 0 : k >= len ? len - 1 : k; return ((horiz ? l * w + k : k * w + l) * 4) + ch; };
        for (var k = -r; k <= r; k++) sum += src[idx(k)];
        for (var k2 = 0; k2 < len; k2++) {
          dst[idx(k2)] = sum / (2 * r + 1);
          sum += src[idx(k2 + r + 1)] - src[idx(k2 - r)];
        }
      }
    }
    for (var p = 0; p < passes; p++) { pass(b, t, true); pass(t, b, false); }
    for (var j = 0; j < a.length; j++) a[j] = b[j];
    ctx.putImageData(im, 0, 0);
  }
  function fitText(ctx, text, maxW, size, weight) {
    var s = size;
    do { ctx.font = weight + ' ' + s + 'px Fixel, system-ui, sans-serif'; s -= 1; } while (ctx.measureText(text).width > maxW && s > 12);
  }
  // fmt: 'story' — 1080×1920 (сторіс), 'wide' — 1440×1080 (4:3, допис / чат)
  function storyCanvas(st, fmt) {
    var wide = fmt === 'wide';
    var ev = (state.payload && state.payload.event) || {};
    var photo = PHOTOS[normName(st.name)];
    var total = cardPlayersCount();
    var F = 'Fixel, system-ui, sans-serif';
    return Promise.all([
      loadImg('assets/logo.svg?v=3'),
      // для картинки — фото у більшій якості (assets/players/lg), якщо його немає — звичайне
      loadImg(photo ? 'assets/players/lg/' + encodeURIComponent(photo) + '?v=' + PHOTO_V : null).then(function (im) { return im || loadImg(photo ? 'assets/players/' + encodeURIComponent(photo) + '?v=' + PHOTO_V : null); }),
      loadImg('assets/fish.webp'),
      document.fonts && document.fonts.load ? Promise.all([document.fonts.load('700 80px Fixel'), document.fonts.load('500 30px Fixel')]).catch(function () {}) : null
    ]).then(function (r) {
      var logo = r[0], face = r[1], fish = r[2];
      var W = wide ? 1440 : 1080, H = wide ? 1080 : 1920, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      if (I18N.en) {   // англійська: усі підписи на картинці перекладаємо так само, як на сторінці
        var _ft = c.fillText.bind(c), _mt = c.measureText.bind(c);
        c.fillText = function (s, x, y, w) { return w == null ? _ft(I18N.tr(String(s)), x, y) : _ft(I18N.tr(String(s)), x, y, w); };
        c.measureText = function (s) { return _mt(I18N.tr(String(s))); };
      }
      var track = function (px) { try { c.letterSpacing = px + 'px'; } catch (e) { /* */ } };
      var font = function (w, size) { c.font = w + ' ' + size + 'px ' + F; };
      var place = st.played > 0 ? st.place : null;
      var accent = place === 1 ? '#e8c35a' : place === 2 ? '#c9d0da' : place === 3 ? '#d79a6a' : '#8fd12a';
      // Розкладка: сторіс — усе по центру стовпчиком; 4:3 — ліворуч людина, праворуч статистика
      var L = wide
        ? { cx: 400, logoW: 280, logoY: 112, titleY: 262, subY: 302, photoY: 500, R: 122, nameY: 722, nameW: 660, nameS: 62, placeY: 776,
            px: 780, py: 210, pw: 580, ph: 560, footY: 952, botY: 998, footX: W / 2, glowX: 400, glowY: 470, fishX: W - 980, fishY: 640, fishW: 960 }
        : { cx: W / 2, logoW: 340, logoY: 214, titleY: 390, subY: 434, photoY: 640, R: 118, nameY: 878, nameW: 920, nameS: 78, placeY: 936,
            px: 90, py: 1010, pw: W - 180, ph: 520, footY: 1600, botY: 1648, footX: W / 2, glowX: W / 2, glowY: 560, fishX: W - 1180 - 10, fishY: 1240, fishW: 1180 };

      // фон: глибокий чорний, м'яке зелене світло, ледь помітна форель (голова праворуч)
      c.fillStyle = '#08090a'; c.fillRect(0, 0, W, H);
      var g = c.createRadialGradient(L.glowX, L.glowY, 20, L.glowX, L.glowY, wide ? 700 : 820);
      g.addColorStop(0, 'rgba(118,177,29,0.16)'); g.addColorStop(0.3, 'rgba(118,177,29,0.10)'); g.addColorStop(0.6, 'rgba(118,177,29,0.04)'); g.addColorStop(1, 'rgba(118,177,29,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (fish) {
        var fh = L.fishW * fish.height / fish.width;
        c.globalAlpha = 0.07; c.drawImage(fish, L.fishX, L.fishY, L.fishW, fh); c.globalAlpha = 1;
      }
      // Знімок фону під панеллю ще без шуму → справжнє гаусоподібне розмиття (3 проходи box-blur на зменшеній копії)
      var glass = null;
      try {
        var gm = 80, gs = 6, gx = L.px - gm, gy = L.py - gm, gw = L.pw + gm * 2, gh = L.ph + gm * 2;
        glass = document.createElement('canvas'); glass.width = Math.round(gw / gs); glass.height = Math.round(gh / gs);
        var gc = glass.getContext('2d'); gc.imageSmoothingEnabled = true; gc.imageSmoothingQuality = 'high';
        gc.drawImage(cv, gx, gy, gw, gh, 0, 0, glass.width, glass.height);
        boxBlur(gc, glass.width, glass.height, 5, 3);
        glass._x = gx; glass._y = gy; glass._w = gw; glass._h = gh;
      } catch (e) { glass = null; }
      // Дизеринг: ледь помітний «шум» на фоні, щоб плавне світло не розпадалося на смуги
      // після стиснення в Instagram/Telegram
      try {
        var img = c.getImageData(0, 0, W, H), px8 = img.data;
        for (var k = 0; k < px8.length; k += 4) {
          var n = (Math.random() + Math.random() - 1) * 5;
          px8[k] += n; px8[k + 1] += n; px8[k + 2] += n;
        }
        c.putImageData(img, 0, 0);
      } catch (e) { /* */ }
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';

      // лого й назва турніру
      if (logo) { var lh = L.logoW * 306 / 1020; c.drawImage(logo, L.cx - L.logoW / 2, L.logoY, L.logoW, lh); }
      track(5); font(500, wide ? 24 : 26); c.fillStyle = '#9aa3b2';
      var title = String(ev.title || 'TROUT MASTER').toUpperCase();
      fitText(c, title, wide ? 640 : 900, wide ? 24 : 26, 500); c.fillText(title, L.cx, L.titleY);
      track(0);
      if (ev.subtitle) { c.fillStyle = '#6b7380'; fitText(c, ev.subtitle, wide ? 660 : 900, wide ? 26 : 28, 400); c.fillText(ev.subtitle, L.cx, L.subY); }

      // фото: тонкий обідок кольору місця з повітрям
      var cx = L.cx, cy = L.photoY, R = L.R;
      c.beginPath(); c.arc(cx, cy, R + 14, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = accent; c.stroke();
      c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
      if (face) c.drawImage(face, cx - R, cy - R, R * 2, R * 2);
      else {
        c.fillStyle = '#16181c'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
        font(600, 84); c.fillStyle = '#d0d5dd'; c.textBaseline = 'middle'; c.fillText(initials(st.name), cx, cy + 4); c.textBaseline = 'alphabetic';
      }
      c.restore();
      if (place) {
        var bx = cx + (R + 14) * 0.7071, by = cy + (R + 14) * 0.7071, br = 34;
        c.beginPath(); c.arc(bx, by, br + 6, 0, Math.PI * 2); c.fillStyle = '#08090a'; c.fill();
        c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fillStyle = accent; c.fill();
        font(700, place > 9 ? 30 : 36); c.fillStyle = '#0b0c0e'; c.textBaseline = 'middle'; c.fillText(String(place), bx, by + 2); c.textBaseline = 'alphabetic';
      }

      // ім'я і місце
      c.fillStyle = '#ffffff'; track(-1); fitText(c, st.name, L.nameW, L.nameS, 700); c.fillText(st.name, cx, L.nameY); track(0);
      if (place) {
        var pt = place + ' місце' + (total ? ' з ' + total : '');
        track(1); font(500, wide ? 30 : 32); c.fillStyle = accent; c.fillText(pt, cx, L.placeY); track(0);
      }

      // панель статистики: одна скляна картка 2×2 з тонкими роздільниками
      var stats = [
        ['БАЛИ', st.points != null ? String(st.points) : '—', st.cnt.w + 'В · ' + st.cnt.d + 'РН · ' + st.cnt.z + 'БН · ' + st.cnt.l + 'П'],
        ['УЛОВ', String(st.fish), fishWord(st.fish) + (st.avg != null ? ' · ' + fmt1(st.avg) + ' за тур' : '')],
        ['ПЕРЕМОГИ', st.winRate != null ? Math.round(st.winRate * 100) + '%' : '—', st.streak ? 'серія ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') : st.cnt.w + ' з ' + st.played],
        st.vsOpp
          ? ['ПРОТИ СУПЕРНИКІВ', st.vsOpp.mine + ':' + st.vsOpp.theirs, (st.vsOpp.mine - st.vsOpp.theirs > 0 ? '+' : '') + (st.vsOpp.mine - st.vsOpp.theirs) + ' ' + fishWord(Math.abs(st.vsOpp.mine - st.vsOpp.theirs))]
          : ['НАЙКРАЩИЙ ТУР', st.best ? String(st.best.fish) : '—', st.best ? fishWord(st.best.fish) + ' · тур ' + st.best.n : '']
      ];
      var px = L.px, py = L.py, pw = L.pw, ph = L.ph, cw = pw / 2, ch = ph / 2;
      // «Скло»: розмитий фон під панеллю (зменшили й розтягнули назад — працює в усіх браузерах), світла плівка, тонка рамка
      if (glass) try {
        c.save(); sqPath(c, px, py, pw, ph, 64); c.clip();
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(glass, glass._x, glass._y, glass._w, glass._h);
        c.restore();
      } catch (e) { /* без розмиття */ }
      sqPath(c, px, py, pw, ph, 64);
      c.fillStyle = 'rgba(255,255,255,0.075)'; c.fill();
      // ледь помітний діагональний перехід: світліше зверху зліва → темніше знизу справа
      var sheen = c.createLinearGradient(px, py, px + pw, py + ph);
      sheen.addColorStop(0, 'rgba(255,255,255,0.06)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0.01)');
      sheen.addColorStop(0.55, 'rgba(0,0,0,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
      c.fillStyle = sheen; c.fill();
      try {
        var pd = c.getImageData(px, py, pw, ph), d8 = pd.data;
        for (var q = 0; q < d8.length; q += 4) { var nn = (Math.random() + Math.random() - 1) * 4; d8[q] += nn; d8[q + 1] += nn; d8[q + 2] += nn; }
        var tmp = document.createElement('canvas'); tmp.width = pw; tmp.height = ph; tmp.getContext('2d').putImageData(pd, 0, 0);
        c.save(); sqPath(c, px, py, pw, ph, 64); c.clip(); c.drawImage(tmp, px, py); c.restore();
      } catch (e) { /* */ }
      sqPath(c, px, py, pw, ph, 64);
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.16)'; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px + cw, py + 36); c.lineTo(px + cw, py + ph - 36); c.moveTo(px + 36, py + ch); c.lineTo(px + pw - 36, py + ch); c.stroke();
      stats.forEach(function (t, i) {
        var x = px + (i % 2) * cw + (wide ? 40 : 48), y = py + Math.floor(i / 2) * ch, inner = cw - (wide ? 80 : 96);
        c.textAlign = 'left';
        track(wide ? 2 : 3); fitText(c, t[0], inner, 22, 500); c.fillStyle = '#7d8696'; c.fillText(t[0], x, y + 72); track(0);
        c.fillStyle = '#ffffff'; track(-1); fitText(c, t[1], inner, wide ? 62 : 68, 650); c.fillText(t[1], x, y + 160); track(0);
        if (t[2]) { c.fillStyle = '#8a93a3'; fitText(c, t[2], inner, wide ? 24 : 26, 400); c.fillText(t[2], x, y + 206); }
        c.textAlign = 'center';
      });

      // підпис
      track(4); font(500, 22); c.fillStyle = '#6b7380'; c.fillText('РЕЗУЛЬТАТИ Й СТАТИСТИКА', L.footX, L.footY); track(0);
      font(600, 36); c.fillStyle = '#9bd83a'; c.fillText('@troutmasterua_bot', L.footX, L.botY);
      return cv;
    });
  }
  var story = { el: null, url: null, file: null };
  function closeStory() {
    if (story.el) story.el.hidden = true;
    if (story.url) { try { URL.revokeObjectURL(story.url); } catch (e) { /* */ } story.url = null; }
    document.documentElement.classList.remove('story-open');
  }
  function openStory(name) {
    if (!name) return;
    var st = playerStats(name);
    if (!story.el) {
      story.el = document.createElement('div');
      story.el.className = 'story';
      story.el.setAttribute('role', 'dialog');
      story.el.setAttribute('aria-modal', 'true');
      story.el.setAttribute('aria-label', 'Поділитися результатом');
      story.el.innerHTML = '<div class="story__box"><div class="story__img"><span class="story__spin" aria-hidden="true"></span></div>' +
        '<div class="story__fmt" role="radiogroup" aria-label="Формат картинки">' +
          '<button type="button" role="radio" data-fmt="story" aria-checked="true">Сторіс 9:16</button>' +
          '<button type="button" role="radio" data-fmt="wide" aria-checked="false">Допис 4:3</button></div>' +
        '<p class="story__hint" hidden>Утримуй картинку, щоб зберегти її. Якщо не виходить — відкрий апку в браузері.</p>' +
        '<div class="story__acts"><button type="button" class="btn btn-primary story__share">Поділитися</button>' +
        '<a class="btn btn-secondary story__save" download>Зберегти</a>' +
        '<button type="button" class="btn btn-secondary story__close">Закрити</button></div></div>';
      document.body.appendChild(story.el);
      story.el.addEventListener('click', function (e) { if (e.target === story.el || e.target.closest('.story__close')) closeStory(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && story.el && !story.el.hidden) closeStory(); });
      story.el.querySelector('.story__fmt').addEventListener('click', function (e) {
        var b = e.target.closest('[data-fmt]');
        if (!b || b.getAttribute('data-fmt') === story.fmt) return;
        story.fmt = b.getAttribute('data-fmt');
        try { localStorage.setItem('tm:storyFmt', story.fmt); } catch (x) { /* */ }
        renderStory();
      });
      story.el.querySelector('.story__share').addEventListener('click', function () {
        if (!story.file) return;
        navigator.share({ files: [story.file], title: 'TROUT MASTER' }).catch(function () { /* скасував */ });
      });
    }
    story.st = st;
    if (!story.fmt) { try { story.fmt = localStorage.getItem('tm:storyFmt') || 'story'; } catch (x) { story.fmt = 'story'; } }
    story.el.hidden = false;
    document.documentElement.classList.add('story-open');
    renderStory();
  }
  function renderStory() {
    var st = story.st, fmt = story.fmt === 'wide' ? 'wide' : 'story';
    [].forEach.call(story.el.querySelectorAll('[data-fmt]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-fmt') === fmt)); });
    var box = story.el.querySelector('.story__img');
    box.classList.toggle('is-wide', fmt === 'wide');
    box.innerHTML = '<span class="story__spin" aria-hidden="true"></span>';
    if (story.url) { try { URL.revokeObjectURL(story.url); } catch (e) { /* */ } story.url = null; }
    var token = story.token = (story.token || 0) + 1;
    storyCanvas(st, fmt).then(function (cv) {
      cv.toBlob(function (blob) {
        if (!blob || token !== story.token) return;
        var fname = 'trout-master-' + (st.num || 'result') + (fmt === 'wide' ? '-4x3' : '-story') + '.png';
        story.file = typeof File === 'function' ? new File([blob], fname, { type: 'image/png' }) : null;
        story.url = URL.createObjectURL(blob);
        box.innerHTML = '<img alt="Результат: ' + esc(st.name) + '" src="' + story.url + '">';
        var canShare = !!(story.file && navigator.canShare && navigator.share && navigator.canShare({ files: [story.file] }));
        story.el.querySelector('.story__share').hidden = !canShare;
        var save = story.el.querySelector('.story__save');
        save.href = story.url; save.setAttribute('download', fname);
        save.hidden = IN_TG && canShare;   // у Telegram «Зберегти» через посилання не працює — є «Поділитися» → «Зберегти зображення»
        // Підказка «утримуй» — лише там, де немає системного «Поділитися» (у Telegram утримання часто нічого не дає)
        story.el.querySelector('.story__hint').hidden = canShare || !IN_TG;
      }, 'image/png');
    });
  }

  // Плитка «Відрив» у картці (коли немає даних «Проти суперників»): лідеру — запас над 2-м місцем,
  // решті — скільки балів до 1-го місця й до місця вище
  function gapTile(st) {
    var sr = standingsRows();
    if (!sr || st.points == null) return '';
    var rows = sr.rows.filter(function (r) { return r.pts != null && r.place; })
      .sort(function (a, b) { return a.place - b.place; });
    var me = rows.find(function (r) { return normName(r.name) === normName(st.name); });
    if (!me || rows.length < 2) return '';
    var pts = function (n) { return plural(Math.abs(n), 'бал', 'бали', 'балів'); };
    var lbl, val, sub;
    if (me.place === 1) {
      var second = rows.find(function (r) { return r !== me && r.place > 1; }) || rows.find(function (r) { return r !== me; });
      var lead = me.pts - second.pts;
      lbl = 'Відрив'; val = (lead > 0 ? '+' : '') + lead;
      sub = lead > 0 ? 'від ' + second.place + '-го місця' : 'стільки ж балів у ' + second.place + '-го місця';
    } else {
      var leader = rows[0];
      var toLead = leader.pts - me.pts;
      lbl = 'До 1-го місця'; val = (toLead > 0 ? '\u2212' : '') + toLead;
      // найближче місце вище, де балів більше (рівні бали — це вже розподіл за перемогами й рибою)
      var above = rows.filter(function (r) { return r.place < me.place && r.pts > me.pts; }).pop();
      var below = rows.find(function (r) { return r.place > me.place && r.pts < me.pts; });
      if (above && above.place > 1) sub = '\u2212' + (above.pts - me.pts) + ' до ' + above.place + '-го місця';
      else if (below) sub = '+' + (me.pts - below.pts) + ' від ' + below.place + '-го місця';
      else sub = '';
    }
    return '<div class="pk"><span class="pk__l">' + lbl + '</span><span class="pk__v pk__v--sm">' + val +
      ' <small>' + pts(+String(val).replace(/[^0-9]/g, '')) + '</small></span>' +
      (sub ? '<span class="pk__s">' + esc(sub) + '</span>' : '') + '</div>';
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
    v2.topnav.hidden = !p || !stats;   // одна вкладка «Учасники» нічого не перемикає — не показуємо
    v2.navList.textContent = list ? 'Учасники' : 'Результати';
    v2.navStats.hidden = !stats;
    v2.navList.setAttribute('aria-current', state.view === 'list' ? 'page' : 'false');
    v2.navStats.setAttribute('aria-current', state.view === 'stats' ? 'page' : 'false');
    segSlide(v2.topnav, '[aria-current="page"]');   // біла «таблетка» плавно їде між «Результати» і «Статистика»

    renderSide();
    renderSelbar();
  }

  function kpi(cls, label, labelM, valHtml, extra) {
    return '<div class="kpi ' + cls + '"><span class="kpi__l"><span class="l-d">' + label + '</span><span class="l-m">' + (labelM || label) + '</span></span>' +
      '<span class="kpi__v">' + valHtml + '</span>' + (extra || '') + '</div>';
  }
  // Дата турніру з підзаголовка («21 листопада • …») → скільки днів до старту
  function daysToStart() {
    var ev = state.payload && state.payload.event, sub = String((ev && ev.subtitle) || '');
    var m = sub.match(new RegExp('(\\d{1,2})\\s+(' + MONTHS_FULL.join('|') + ')', 'i'));
    if (!m) return null;
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var d = new Date(now.getFullYear(), MONTHS_FULL.indexOf(m[2].toLowerCase()), parseInt(m[1], 10));
    if (d - today < -60 * 864e5) d.setFullYear(d.getFullYear() + 1);   // напр. зараз грудень, турнір у січні
    var days = Math.round((d - today) / 864e5);
    if (days < 0) return null;   // турнір уже минув
    var v = days === 0 ? 'Сьогодні' : days === 1 ? 'Завтра'
      : days + ' <small>' + plural(days, 'день', 'дні', 'днів') + '</small>';
    return { v: v, date: m[1] + ' ' + m[2].toLowerCase() };
  }
  function renderKpis() {
    var p = state.payload, h = '';
    if (!p) {   // ще вантажимо: три легкі плитки-скелетони
      v2.kpis.innerHTML = state.error ? '' : [0, 1, 2].map(function (i) {
        return '<div class="kpi skel-kpi" aria-hidden="true"><i class="skel__bar" style="width:46%"></i><i class="skel__bar skel__bar--lg" style="width:32%"></i></div>';
      }).join('');
      return;
    }
    if (isListMode()) {
      var m = state.models[0], n = m ? m.rows.length : 0, seats = parseInt(p.seats, 10) || 0;
      var pct = seats ? Math.min(100, Math.round(n / seats * 100)) : 0;
      h += kpi('', 'Зареєстровано', 'Учасників', n + (seats ? ' <small>/ ' + seats + '</small>' : ''),
        seats ? '<span class="kpi__bar" role="img" aria-label="' + n + ' з ' + seats + ' місць зайнято"><span style="width:' + pct + '%"></span></span>' : '');
      var start = regOpenNow() ? null : daysToStart();
      if (seats && start) {
        // Реєстрацію закрито — замість «Вільно» показуємо, скільки лишилось до турніру
        h += kpi('k-green', 'До старту', 'До старту', start.v, '<span class="kpi__s l-d">' + esc(start.date) + '</span>');
      } else if (seats) {
        h += n < seats
          ? kpi('k-green', 'Вільних місць', 'Вільно', (seats - n) + ' <small class="l-m">' + plural(seats - n, 'місце', 'місця', 'місць') + '</small>', '<span class="kpi__s l-d">далі — резерв</span>')
          : kpi('', 'Резерв', 'Резерв', (n - seats) + ' <small>' + plural(n - seats, 'учасник', 'учасники', 'учасників') + '</small>', '<span class="kpi__s l-d">усі місця зайняті</span>');
      }
      if (regOpenNow() && regDeadline()) h += kpi('k-dark', 'До закриття реєстрації', 'До закриття', '<span id="kTimer"></span>');
      else if (!regOpenNow()) h += kpi('k-dark k-closed', 'Реєстрація', 'Реєстрація', 'Закрита');   // картка лишається — без порожнього місця
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
      h += kpi(spark ? 'k-spark' : '', 'Усього риби', 'Риби', fmtInt(tf), spark);
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
        return '<div class="podium__col p' + r.place + '">' + avatarHtml(r.name).replace('class="av', 'class="av podium__av') +
          '<span class="podium__name">' + esc(r.name) + '</span>' +
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

  // ----- Смужка «Вибрано в таблиці / у списку» (комп'ютер) -----
  function renderSelbar() {
    var name = state.view === 'list' ? selectedPlayerName() : null;
    var cardOn = !(state.payload && state.payload.showCard === false);
    var on = !!name && cardOn && hasCardData(name);
    selShow(on);
    if (!on) return;
    if (isListMode()) {   // список учасників: у кружечку номер, без балів
      var m = state.models[0], key = Array.from(state.selected)[0];
      var row = m && m.rows.find(function (x) { return x.key === key; });
      var n = row && m.placeCol ? row.cells[m.placeCol.c] : '';
      v2.selLbl.textContent = 'Вибрано в списку';
      v2.selPlace.hidden = !n;
      v2.selPlace.textContent = n;
      v2.selPlace.className = 'selbar__place';
      v2.selName.textContent = name;
      return;
    }
    v2.selLbl.textContent = 'Вибрано в таблиці';
    var s = standingsRows(), r = s && s.rows.find(function (x) { return normName(x.name) === normName(name); });
    v2.selPlace.hidden = !(r && r.place);
    if (r && r.place) {
      v2.selPlace.textContent = r.place;
      v2.selPlace.className = 'selbar__place' + (r.place <= 3 ? ' medal-' + r.place : '');
    }
    v2.selName.textContent = name + (r && r.pts != null ? ' · ' + r.pts + ' ' + plural(r.pts, 'бал', 'бали', 'балів') : '');
  }

  // Вибраний учасник на компі — плаваюча «таблетка» внизу екрана: виїжджає знизу і ховається назад
  function selShow(on) {
    var sb = v2.selbar, root = document.documentElement;
    clearTimeout(sb._t);
    if (on) {
      if (sb.hidden) { sb.hidden = false; void sb.offsetWidth; }
      sb.classList.add('is-on'); root.classList.add('sel-on');
      return;
    }
    root.classList.remove('sel-on');
    if (sb.hidden) return;
    sb.classList.remove('is-on');
    sb._t = setTimeout(function () { if (!sb.classList.contains('is-on')) sb.hidden = true; }, 280);
  }
  // Таблетка живе поза карткою таблиці (інакше її перекриває знімок переходу між вкладками)
  if (v2.selbar && v2.selbar.parentNode !== document.body) document.body.appendChild(v2.selbar);
  // Висота верхньої панелі таблиці — під нею прилипає рядок назв колонок
  (function () {
    var bt = document.querySelector('.bcard .btools');
    if (!bt) return;
    var put = function () { document.documentElement.style.setProperty('--bt-h', bt.offsetHeight + 'px'); };
    put();
    if (window.ResizeObserver) new ResizeObserver(put).observe(bt); else window.addEventListener('resize', put);
  })();

  // ----- Вкладки «Залік / По турах» -----
  // ---------- Перемикачі: біла «таблетка» плавно переїжджає до вибраного пункту ----------
  function segSlide(box, sel) {
    if (!box) return;
    var b = box.querySelector(sel);
    var ind = box.querySelector('.seg-ind');
    if (!b || !b.offsetWidth) { if (ind) ind.style.opacity = '0'; return; }
    if (!ind) { ind = document.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); }
    box.classList.add('has-seg');   // спершу position: relative — тоді відступи міряються від самого перемикача
    var to = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }, from = box._seg;
    function put(p) { ind.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; ind.style.width = p.w + 'px'; ind.style.height = p.h + 'px'; }
    if (from && !REDUCED && (from.x !== to.x || from.w !== to.w)) {
      ind.style.transition = 'none'; put(from); void ind.offsetWidth; ind.style.transition = '';   // стартуємо з попереднього місця
    } else if (!from) { ind.style.transition = 'none'; put(to); void ind.offsetWidth; ind.style.transition = ''; }
    put(to); ind.style.opacity = '1';
    box._seg = to;
    box.classList.add('has-seg');
  }
  function slideTabs() { segSlide(el.tabs, '.tab[aria-selected="true"]'); }
  window.addEventListener('resize', function () {
    el.tabs._seg = null; slideTabs();
    if (v2.topnav) { v2.topnav._seg = null; segSlide(v2.topnav, '[aria-current="page"]'); }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { el.tabs._seg = null; slideTabs(); });

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
      slideTabs();
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
      v2.bTitle.textContent = m ? (/результат/i.test(m.name) ? 'Підсумкова таблиця' : m.name) : 'Результати';
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
    // Живі оновлення: запам'ятовуємо, де стояв кожен рядок, щоб після нових даних він плавно «переїхав»
    var flip = !REDUCED && state.changeTime && state.flipDone !== state.changeTime && el.board._model === m.name && state.view === 'list';
    var before = {};
    if (flip) [].forEach.call(el.board.querySelectorAll('[data-key]'), function (r) { before[r.getAttribute('data-key')] = r.getBoundingClientRect().top; });
    el.board.classList.add('v2');
    el.board.innerHTML = html;
    el.board._model = m.name;
    var sc2 = el.board.querySelector('.tgrid');
    if (sc2) sc2.scrollLeft = x;
    syncTgridHead();
    if (flip) { state.flipDone = state.changeTime; flipRows(before); }
  }
  // FLIP: рядок, що змінив місце, стартує зі старої позиції й м'яко їде на нову
  function flipRows(before) {
    var moved = [];
    [].forEach.call(el.board.querySelectorAll('[data-key]'), function (r) {
      var k = r.getAttribute('data-key');
      if (!(k in before)) return;
      var dy = before[k] - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) return;
      r.style.transition = 'none';
      r.style.transform = 'translateY(' + dy + 'px)';
      r.classList.add('is-moving');
      moved.push(r);
    });
    if (!moved.length) return;
    void el.board.offsetWidth;
    requestAnimationFrame(function () {
      moved.forEach(function (r, i) {
        r.style.transition = 'transform 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) ' + Math.min(i * 30, 240) + 'ms';
        r.style.transform = '';
        setTimeout(function () { r.classList.remove('is-moving'); r.style.transition = ''; }, 1100 + Math.min(i * 30, 240));
      });
    });
  }
  // Прилипла копія шапки «По турах» гортається вбік разом із таблицею
  function syncTgridHead() {
    var sc = el.board.querySelector('.tgrid'), hd = el.board.querySelector('.tgrid-hd');
    if (sc && hd) hd.scrollLeft = sc.scrollLeft;
  }
  el.board.addEventListener('scroll', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('tgrid')) syncTgridHead();
  }, true);

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
        '<span class="c-nm" role="cell">' + avatarHtml(r.name) + '<span class="nmw">' +
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
    return '<div class="rk' + (hasT ? '' : ' no-t') + '" role="table" aria-label="Підсумкова таблиця">' + head + body + '</div>';
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
    // Копія шапки поза горизонтальним скролом: у Telegram на телефоні вона прилипає до верху (див. .tgrid-hd у стилях)
    return '<p class="tgrid-hint m-only" aria-hidden="true">гортайте →</p><div class="tgrid-hd" aria-hidden="true"><div class="tgrid__in">' + head + '</div></div>' +
      '<div class="tgrid" role="region" aria-label="Результати по турах" tabindex="0"><div class="tgrid__in">' + head + body + '</div></div>';
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
        '<span class="pt__n">' + esc(p.n) + '</span>' + avatarHtml(p.name) +
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
  var searchClear = document.getElementById('searchClear');
  function syncClear() { if (searchClear) searchClear.hidden = !v2.search.value; }
  v2.search.addEventListener('input', function () { state.query = v2.search.value; syncClear(); renderBoard(); });
  if (searchClear) searchClear.addEventListener('click', function (e) {
    e.preventDefault();   // кнопка всередині <label> — не даємо кліку піти далі
    v2.search.value = '';
    v2.search.dispatchEvent(new Event('input', { bubbles: true }));
    v2.search.focus();
  });
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
  // Усі тости — зверху: виїжджають з-під навбару вниз, потім тікають назад угору
  function toast(msg) {
    var t = v2.toast;
    t.textContent = msg;
    clearTimeout(toastT);
    t.classList.remove('is-in', 'is-out');
    t.classList.add('toast--top');
    var nb = document.querySelector('.topbar');
    var y = nb ? Math.max(0, nb.getBoundingClientRect().bottom) : 0;
    t.style.top = (y + 12) + 'px';
    t.hidden = false; void t.offsetWidth;
    t.classList.add('is-in');
    toastT = setTimeout(function () {
      t.classList.remove('is-in'); t.classList.add('is-out');
      toastT = setTimeout(function () { t.hidden = true; t.classList.remove('is-out', 'toast--top'); t.style.top = ''; }, 320);
    }, 2400);
  }

  // Кнопка «Оновити» в шапці (комп'ютер; на телефоні — потягнути вниз)
  (function () {
    var b = document.getElementById('refreshBtn');
    if (!b) return;
    var t0 = 0;
    b.addEventListener('click', function () {
      if (b.classList.contains('is-spin')) return;
      b.classList.add('is-spin'); t0 = Date.now();
      load();
    });
    window.addEventListener('tm:loaded', function () {
      if (!b.classList.contains('is-spin')) return;
      setTimeout(function () {
        b.classList.remove('is-spin');
        var r = state.lastLoad || {};
        toast(!r.ok ? 'Не вдалося оновити. Перевірте інтернет' : r.changed ? '✓ Оновлено: є нові дані' : '✓ Оновлено — змін немає');
      }, Math.max(0, 700 - (Date.now() - t0)));   // щоб оберт було видно
    });
  })();

  // Перемикач мови в шапці: без перезавантаження — i18n.js міняє тексти на місці, а ми перемальовуємо блоки
  (function () {
    var sw = document.getElementById('langSw');
    if (!sw) return;
    var btns = [].slice.call(sw.querySelectorAll('[data-lang]'));
    function mark() {
      btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === (I18N.lang || 'uk'))); });
      segSlide(sw, '[aria-pressed="true"]');
    }
    mark();
    window.addEventListener('resize', function () { sw._seg = null; mark(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sw._seg = null; mark(); });
    btns.forEach(function (b) {
      b.addEventListener('click', function () { if (I18N.setLang) I18N.setLang(b.getAttribute('data-lang')); });
    });
    window.addEventListener('tm:lang', function () {
      mark();
      var y = window.scrollY;
      try {
        renderStatus(false);
        if (state.payload) renderAll();
        renderSelbar(); renderSide(); renderTimer();
        if (v2.selbar.hidden) v2.selName.textContent = '';
        // приховані екрани (картка/статистика) перемалюються при наступному відкритті
        if (state.view !== 'card' && pc && pc.body) pc.body.innerHTML = '';
        if (state.view !== 'stats' && ts && ts.body) ts.body.innerHTML = '';
        if (story && story.el && !story.el.hidden) renderStory();
      } catch (e) { /* */ }
      window.scrollTo(0, y);   // лишаємось на тому самому місці
      slideTabs();
    });
  })();

  function shareLink(url, text) {
    text = I18N.tr(text);
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
    var done = function () { toast('✓ Посилання скопійовано'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast(url); });
    else toast(url);
  }
  v2.share.addEventListener('click', function () {
    var ev = (state.payload && state.payload.event) || {};
    shareLink(shareUrl(), (ev.title || 'TROUT MASTER') + ': результати наживо');
  });
  // Клавіатура: Enter/пробіл на рядку = тап
  el.board.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.r[data-key]')) { e.preventDefault(); e.target.click(); }
  });
  // ================= /Новий дизайн =================

  // Посилання на картку: t.me/…?startapp=p9 (Telegram) або …/#p9 (браузер) — номер із жеребкування
  var wantM = /(?:tgWebAppStartParam=|#)p(\d+)(?:&|$)/.exec(location.hash + '&' + location.search.replace(/^\?/, ''));
  state.wantPlayer = wantM ? +wantM[1] : null;
  // ?sel=9 — з персонального повідомлення бота: виділити рядок учасника №9 (картку відкриває він сам)
  var selM = /(?:^|[?&])sel=(\d+)(?:&|$)/.exec(location.search);
  state.wantSelect = selM ? +selM[1] : null;
  if (state.wantSelect) state.selFromLink = true;
  function selectWanted() {
    if (!state.wantSelect) return;
    var n = state.wantSelect, name = null;
    if (isListMode()) {   // список учасників: шукаємо за номером у першій колонці
      var m = state.models[0];
      var row = m && m.rows.find(function (r) { return +String(r.cells[0]).trim() === n; });
      if (row && m.nameCol) name = row.cells[m.nameCol.c];
    } else {
      var dp = drawData() && drawData().players.find(function (x) { return +x.n === n; });
      if (dp) name = dp.name;
    }
    if (!name) return;
    state.wantSelect = null;
    var s = standingsRows(), r = s && s.rows.find(function (x) { return normName(x.name) === normName(name); });
    selectOnly(r ? r.key : name);
    renderBoard();
    setTimeout(function () {
      var el2 = el.board.querySelector('.is-sel');
      if (el2) try { el2.scrollIntoView({ block: 'center' }); } catch (e) { /* */ }
    }, 60);
  }
  function openWantedPlayer() {
    selectWanted();
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
