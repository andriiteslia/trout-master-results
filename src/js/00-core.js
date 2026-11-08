  // ===== src/js/00-core.js — Ядро: мова (i18n), автооновлення апки, Telegram Mini App, налаштування, DOM, стан =====
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

