  // ===== src/js/00-core.js — Ядро: мова (i18n), автооновлення апки, Telegram Mini App, налаштування, DOM, стан =====
  // Мова інтерфейсу (assets/i18n.js): апка рендерить українською, англійську підставляє i18n.js
  var I18N = window.TM_I18N || { en: false, tr: function (s) { return s; }, translit: function (s) { return s; }, plural: function () { return null; } };

  // ---------- Автооновлення апки ----------
  // Telegram і браузери інколи тримають стару версію сторінки в кеші. Тому апка сама перевіряє,
  // чи на сервері новіша версія, і якщо так — тихо перезавантажується. Номер версії (?v= з index.html)
  // лежить у крихітному version.json (робить tools/build.js), щоб не тягнути всю сторінку.
  (function autoUpdate() {
    var me = document.currentScript && /[?&]v=([\w.-]+)/.exec(document.currentScript.src);
    var MY_V = me ? me[1] : null;
    if (!MY_V || !window.fetch) return;
    var busy = false;
    function check() {
      if (busy || document.hidden) return;
      busy = true;
      fetch((SITE_ROOT || '/') + 'version.json?_=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var v = j && typeof j.v === 'string' && /^[\w.-]+$/.test(j.v) ? j.v : null;
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
  // Окремі адреси розділів ліги: /leaderboard, /partners, /about (копії index.html, їх робить tools/build.js).
  // SITE_ROOT — корінь сайту (з «/» у кінці): раунди й екрани в ньому завжди відкриваються від кореня (/#r1)
  var SEC_PATH = { lb: 'leaderboard', partners: 'partners', about: 'about' };
  function secOfPath(p) { for (var k in SEC_PATH) if (new RegExp('/' + SEC_PATH[k] + '/?$').test(p)) return k; return null; }
  var PATH_SEC = secOfPath(location.pathname);
  // Адреси раундів і екранів у них: /r1, /r1/stats, /r1/rules, /r1/p9 (відкриває 404.html — копія index.html, теж від tools/build.js)
  var ROUND_PATH_RE = /\/r(\d+)(?:\/(stats|rules|p\d+))?\/?$/;
  var PATH_DEEP = (function (m) { return m ? { n: +m[1], sub: m[2] || null } : null; })(ROUND_PATH_RE.exec(location.pathname));
  var SITE_ROOT = PATH_SEC ? location.pathname.replace(/[^/]+\/?$/, '') :
    PATH_DEEP ? location.pathname.replace(ROUND_PATH_RE, '/') : location.pathname.replace(/[^/]*$/, '');
  function roundUrl(n, sub) { return SITE_ROOT + 'r' + n + (sub ? '/' + sub : ''); }
  function secUrl(sec) { return SITE_ROOT + (SEC_PATH[sec] || ''); }
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
        // фон за сторінкою темний: при «відтягуванні» внизу (під чорним футером) не видно світлої смуги
        if (at('6.1')) { tg.setHeaderColor('#080808'); tg.setBackgroundColor('#080808'); }
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
      // на головній (картки раундів) «аркуш» — .home__inner, а .main прихований
      if (!main) { var hm = document.querySelector('.home:not([hidden]) .home__inner'); if (hm && hm.getClientRects().length) main = hm; }
      main = main || document.querySelector('.main');
      if (!tb || !main) return;
      var top = capTop();   // нижній край закріпленого навбару
      // Аркуш доїхав до навбару — під ним «кришка» з кутами.
      // Аркуш уже проїхав (під панеллю чорний футер) — смуга лишається, а «кришки» немає (tg-past)
      // (без прокрутки «кришки» немає: на головній аркуш і так стоїть одразу під навбаром)
      var mr = main.getBoundingClientRect(), stuck = mr.top <= top + 0.5 && (window.scrollY || 0) > 0;
      document.documentElement.classList.toggle('tg-stuck', stuck);
      document.documentElement.classList.toggle('tg-past', stuck && mr.bottom <= top + 24);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(updateStuck); }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    s.addEventListener('load', schedule);
    document.addEventListener('DOMContentLoaded', schedule);
  })();

  // ----- Закріплений навбар: його нижній край — лінія, під якою прилипають шапки таблиць і «кришка» аркуша -----
  // CSS бере її зі змінної --cap-top (src/css/99d-sticky-nav.css), JS — з capTop().
  function capTop() {
    var tb = document.querySelector('.topbar');
    return tb ? Math.max(0, tb.getBoundingClientRect().bottom) : 0;
  }
  (function watchCapTop() {
    var tb = document.querySelector('.topbar');
    if (!tb) return;
    var last = -1;
    // Дробова висота, без округлення: інакше між навбаром і прилиплою шапкою буває щілина в 1 px
    function put() {
      var h = tb.getBoundingClientRect().height;
      if (h !== last) { last = h; document.documentElement.style.setProperty('--cap-top', h + 'px'); }
    }
    put();
    if (window.ResizeObserver) new ResizeObserver(put).observe(tb);
    window.addEventListener('resize', put);
  })();

  // ---------- Config ----------
  var CFG = Object.assign({ API_URL: '', HEADER_ROWS: 2, REFRESH_SECONDS: 20 }, window.RESULTS_CONFIG || {});
  var API = String(CFG.API_URL || '').trim();
  var DEMO = !API;
  var SOURCE = DEMO ? 'demo.json' : API;
  var HEADER_ROWS = Math.max(1, parseInt(CFG.HEADER_ROWS, 10) || 2);
  var REFRESH_MS = Math.max(10, Number(CFG.REFRESH_SECONDS) || 20) * 1000;
  var CALM_REFRESH_MS = 60000;   // список учасників / раунд завершено
  var FETCH_TIMEOUT_MS = 15000;

  // Коди результату туру → стиль бейджа
  var CODES = { 'В': 'code-w', 'П': 'code-l', 'РН': 'code-d', 'БН': 'code-z' };

  var LS = { data: 'tm2:data:' + SOURCE, sel: 'tm:selected', tab: 'tm:tab', hero: 'tm:hero' };   // hero — адреса банера поточного раунду (читає й <head> в index.html)
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
    selected: new Set(store.get(LS.sel, []).slice(-1)),   // виділений гравець (один; зберігається в браузері)
    cmpKey: null,      // другий виділений — для порівняння (лише в результатах, не зберігається)
    cmpOpen: false,    // відкрито екран порівняння (у контейнері картки)
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

