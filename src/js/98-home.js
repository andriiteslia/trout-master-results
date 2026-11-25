  // ===== src/js/98-home.js — Головна: картки раундів сезону; перехід у поточний раунд і в архів минулого =====
  // Сезон приходить у payload.season (блок «Раунди сезону» в адмінці): { name, rounds: [{ n, title, subtitle, banner, tours, current }] }.
  // Поточний раунд — звичайні дані з опитуванням кожні 15 с. Минулий — знімок з Apps Script (?round=N), без опитування:
  // поки він відкритий, дані поточного раунду лежать у HOME.live і оновлюються там (HOME.next).
  var HOME = { root: document.getElementById('home'), body: document.getElementById('homeBody'), live: null, next: null, n: null, cache: {}, pushed: false };

  function homeSeason() {
    var p = HOME && HOME.live ? HOME.live.payload : state.payload;
    var s = p && p.season;
    return s && s.rounds && s.rounds.length ? s : null;
  }
  function hasHome() { return !!homeSeason(); }
  function homeCurrent() { var s = homeSeason(); return s ? s.rounds.filter(function (r) { return r.current; })[0] || s.rounds[s.rounds.length - 1] : null; }
  function rootView() { return hasHome() ? 'home' : 'list'; }

  // Куди відкривати на старті: головна — якщо немає посилання на картку, реєстрацію, рядок чи раунд
  // Посилання на раунд і на екран у ньому: браузер #r1, #r1-stats, #r1-rules, #r1-p9; Telegram startapp=r1, r1-stats, r1-p9
  var DEEP_RE = /^r(\d+)(?:-(stats|rules|p\d+))?$/;
  function deepOf(s) { var m = DEEP_RE.exec(s || ''); return m ? { n: +m[1], sub: m[2] || null } : null; }
  var HOME_HASH = PATH_DEEP || deepOf(location.hash.replace(/^#/, '')) ||
    deepOf((/tgWebAppStartParam=([\w-]+)/.exec(location.hash + '&' + location.search) || [])[1]);
  var HOME_FIRST = !state.wantPlayer && !wantReg && !HOME_HASH && !/[?&]sel=/.test(location.search) &&
    !/tgWebAppStartParam=(?!(leaderboard|partners|about)(&|$))/.test(location.hash + location.search) && !/^#(player|stats|rules|register)$/.test(location.hash);

  // Номер раунду, який зараз відкрито (архів або поточний); без сезону — null
  function roundTag() {
    if (!hasHome()) return null;
    if (HOME.n) return HOME.n;
    var c = homeCurrent();
    return c ? c.n : null;
  }
  // Адреса екрана в браузері: #r2, #r2-stats, #r2-rules, #r2-p9 (без сезону — як раніше)
  function viewHash(sub) {
    var t = roundTag();
    if (t) return roundUrl(t, sub);
    if (sub === 'stats') return SITE_ROOT + '#stats';
    if (sub === 'rules') return SITE_ROOT + '#rules';
    if (sub) return SITE_ROOT + '#player';
    return SITE_ROOT + location.search;
  }
  // Екран раунду з посилання — коли дані раунду готові (архів може ще вантажитись)
  function runDeep(sub) {
    if (!sub) return;
    var go = function () {
      if (sub === 'stats') { if (statsReady()) goStats(); }
      else if (sub === 'rules') goRules();
      else { state.wantPlayer = +sub.slice(1); openWantedPlayer(); }
    };
    var ready = !HOME.n || (state.payload && state.payload.archived && +state.payload.round === HOME.n);
    if (ready) go(); else HOME.after = go;
  }

  // ----- Архів минулого раунду -----
  function archUrl(n) { return SOURCE + (SOURCE.indexOf('?') === -1 ? '?' : '&') + 'round=' + n; }
  function setArchPayload(p) {
    state.payload = p;
    state.models = (p.sheets || []).map(parseSheet);
    state.fromCache = false;
    state.moves = {}; state.changed = {}; state.changeTime = 0;
    if (p.event && I18N.setEvent) I18N.setEvent(p.event);
  }
  function enterArchive(n) {
    if (HOME.n === n) return;
    if (!HOME.live) HOME.live = { payload: state.payload, models: state.models, moves: state.moves, changed: state.changed, tab: state.tab };
    HOME.n = n;
    state.tab = null;
    document.documentElement.classList.add('is-archive');
    var hit = HOME.cache[n] || store.get('tm:arch:' + n, null);
    if (hit && hit.sheets) setArchPayload(hit);
    else { state.payload = null; state.models = []; state.moves = {}; state.changed = {}; }
    fetchJson(archUrl(n))
      .then(function (p) {
        if (!p || p.ok === false) throw new Error((p && p.error) || 'порожня відповідь');
        HOME.cache[n] = p;
        store.set('tm:arch:' + n, p);
        if (HOME.n !== n) return;
        var same = state.payload && state.payload.hash === p.hash;
        if (!same) { setArchPayload(p); renderAll(); }
        if (HOME.after) { var f = HOME.after; HOME.after = null; f(); }
        state.error = null;
        renderStatus(false);
      })
      .catch(function (err) {
        if (HOME.n !== n) return;
        state.error = (err && err.message) || 'невідома помилка';
        renderStatus(false);
        if (!state.payload) renderBoard();
      });
  }
  function leaveArchive() {
    if (!HOME.live) return false;
    state.payload = HOME.live.payload; state.models = HOME.live.models;
    state.moves = HOME.live.moves; state.changed = HOME.live.changed; state.tab = HOME.live.tab;
    HOME.live = null; HOME.n = null;
    document.documentElement.classList.remove('is-archive');
    if (state.payload && state.payload.event && I18N.setEvent) I18N.setEvent(state.payload.event);
    if (HOME.next) { applyPayload(HOME.next); HOME.next = null; }
    state.error = null;
    return true;
  }

  // ----- Навігація -----
  function openRound(n, noPush) {
    var cur = homeCurrent();
    var past = !!cur && n !== cur.n;
    if (!noPush) {
      HOME.pushed = true;
      try { history.pushState({ tmView: 'list', round: past ? n : null }, '', IN_TG ? location.href : roundUrl(n)); } catch (e) { HOME.pushed = false; }
    }
    if (past) enterArchive(n); else leaveArchive();
    if (state.view === 'list') { renderAll(); renderReg(); tgBack(true); window.scrollTo(0, 0); }
    else { renderAll(); setView('list'); }
  }
  function goHome() {
    if (state.view === 'home') { window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); return; }
    if (state.view === 'list' && HOME.pushed && history.state && history.state.tmView === 'list') { history.back(); return; }
    try { history.replaceState({ tmView: 'home', sec: HOME.sec }, '', IN_TG ? location.href : secUrl(HOME.sec) + location.search); } catch (e) { /* */ }
    HOME.pushed = false;
    showHome();
  }
  var homeOpenBtn = document.getElementById('homeOpen');
  if (homeOpenBtn) homeOpenBtn.addEventListener('click', function () { goHome(); });
  function showHome() {
    var left = leaveArchive();
    if (left) renderAll();
    if (state.view === 'home') { renderHome(); renderLeagueNav(); window.scrollTo(0, 0); return; }   // «Назад» між розділами ліги
    setView('home');
  }
  // «Назад» (Telegram, «Усі раунди»): з картки/реєстрації/статистики — до раунду, з раунду — на головну
  function goBack() {
    if (state.view === 'list' && hasHome()) goHome();
    else goList();
  }

  // ----- Картки -----
  var HOME_MONTHS = MONTHS_FULL;
  function subParts(r) { return String((I18N.en && r.subtitleEn) || r.subtitle || '').split(/\s*[•·]\s*/).filter(Boolean); }
  // Банер з Google Drive: пряма адреса lh3.googleusercontent.com (без переадресації, браузер її кешує)
  var BANNER_V = 2;
  // w — ширина: 1200 для великої картки поточного раунду, 400 для мініатюр зіграних (100 px на екрані)
  function bannerSrc(u, w) {
    var m = /^https:\/\/drive\.google\.com\/thumbnail\?id=([\w-]+)/.exec(String(u || ''));
    var v = /[?&]v=(\d+)/.exec(String(u || ''));   // час зміни файлу: нова картинка в тому ж файлі — нова адреса
    // BANNER_V — підняти, коли iPhone/Telegram тримає старе фото, а Drive не змінив час файлу
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w' + (w || 1200) + '?v=' + (v ? v[1] : '0') + '&b=' + BANNER_V : u;
  }
  function bannerHtml(r, cls) {
    var ph = '<span class="hb-ph"><small>TROUT MASTER</small><b>ROUND ' + r.n + '</b></span>';
    if (!r.banner) return '<span class="' + cls + '">' + ph + '</span>';
    var big = cls === 'hc-ban', src = bannerSrc(r.banner, big ? 1200 : 400), ok = IMG_OK[src];
    if (big) store.set(LS.hero, src);   // наступного разу банер почне вантажитись ще в <head> (index.html)
    // ще не завантажувався — скелетон, а не заглушка «ROUND N», щоб не блимало; не вийшло — заглушка
    return '<span class="' + cls + (ok ? ' has-img' : ' hb-wait') + '">' + ph + '<img src="' + esc(src) + '" alt="" decoding="async" fetchpriority="' + (big ? 'high' : 'low') + '"' + (ok ? ' class="ld"' : '') +
      ' onerror="var p=this.parentNode;this.remove();if(p)p.classList.remove(\'hb-wait\')">' + '</span>';
  }
  function toursWord(n) { return n + ' ' + plural(n, 'тур', 'тури', 'турів'); }

  function curCardHtml(r) {
    var p = HOME.live ? HOME.live.payload : state.payload;
    var chip = '', chipCls = '', extra = '', regBtn = false;
    var parts = subParts(r);
    var meta = parts.map(function (s, i) { return '<span>' + (i === 0 ? ICON_CAL : i === 1 ? ICON_PIN : '') + esc(s) + '</span>'; }).join('');
    if (p && isListMode()) {
      var open = regOpenNow(), d = regDeadline(), si = seatsInfo();
      // реєстрацію ще не відкривали (нікого немає) — «Скоро»; відкрита; закрита
      var soon = !open && (!si || !si.n);
      chip = open ? 'Реєстрацію відкрито' : soon ? 'Скоро' : 'Реєстрацію закрито';
      chipCls = open ? 'reg' : soon ? 'soon' : 'off';
      regBtn = open;
      if (si) {
        var pct = si.seats ? Math.min(100, Math.round(si.n / si.seats * 100)) : 0;
        extra += '<div class="hc-seats"><div class="hc-seats__r"><span>Зареєстровано <b>' + si.n + (si.seats ? ' з ' + si.seats : '') + '</b></span>' +
          (r.tours ? '<span>' + toursWord(r.tours) + '</span>' : '') + '</div>' +
          (si.seats ? '<span class="sbar"><span style="width:' + pct + '%"></span></span>' : '') +
          (open && d ? '<p class="hc-dl">Реєстрація до ' + esc(deadlineText(d)) + daysLeft(d) + '</p>' : '') + '</div>';
      }
    } else if (p) {
      var t = toursData(), pl = playedTours(t), total = t ? t.rounds : (r.tours || 0);
      var s = standingsRows(), top = s && pl ? s.rows.filter(function (x) { return x.place === 1; })[0] : null;
      if (total && pl >= total) { chip = 'Завершено'; chipCls = 'fin'; }
      else if (pl) { chip = 'Наживо · Тур ' + pl + ' з ' + total; chipCls = 'live'; }
      else { chip = 'Скоро'; chipCls = 'soon'; }
      if (total) {
        var seg = '';
        for (var i = 0; i < total; i++) seg += '<span' + (i < pl ? ' class="on"' : '') + '></span>';
        extra += '<div class="hc-prog' + (chipCls === 'fin' ? ' is-fin' : '') + '" aria-hidden="true">' + seg + '</div>';
      }
      if (top) {
        extra += '<div class="hc-lead">' + avatarHtml(top.name) + '<div><small>' + (chipCls === 'fin' ? 'Переможець' : 'Лідер') + '</small><b>' + esc(top.name) + '</b></div>' +
          '<div class="hc-lead__pts"><b>' + fmtNum(top.pts) + '</b>' + plural(Math.round(top.pts), 'бал', 'бали', 'балів') +
          (top.fish != null ? ' · ' + top.fish + ' ' + plural(top.fish, 'риба', 'риби', 'риб') : '') + '</div></div>';
      }
    }
    return '<article class="hc hc--cur" data-round="' + r.n + '">' +
      '<button type="button" class="hc-ban-btn" data-round="' + r.n + '" tabindex="-1" aria-hidden="true">' + bannerHtml(r, 'hc-ban') +
      (chip ? '<span class="hc-chip hc-chip--' + chipCls + '"><i></i>' + esc(chip) + '</span>' : '') + '</button>' +
      '<div class="hc-body"><h2 class="hc-t">' + esc(r.title) + '</h2>' + (meta ? '<p class="hc-meta">' + meta + '</p>' : '') + extra +
      (regBtn
        // Реєстрацію відкрито: «Зареєструватися» — головна дія, «Детальніше» — другорядна
        ? '<div class="hc-acts"><button type="button" class="hc-go hc-go--sec" data-round="' + r.n + '">Детальніше</button>' +
          '<button type="button" class="hc-go" data-reg="' + r.n + '">Зареєструватися</button></div>'
        : '<button type="button" class="hc-go" data-round="' + r.n + '">Детальніше</button>') + '</div></article>';
  }
  function daysLeft(d) {
    var days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    return days > 1 ? ' · залишилось ' + days + ' ' + plural(days, 'день', 'дні', 'днів') : '';
  }
  function fmtNum(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }
  function pastCardHtml(r) {
    var parts = subParts(r);
    return '<button type="button" class="hx" data-round="' + r.n + '">' + bannerHtml(r, 'hx-th') +
      '<span class="hx-txt"><b class="hx-t">' + esc(r.title) + '</b>' +
      (parts.length ? '<span class="hx-m">' + esc(parts.join(' · ')) + '</span>' : '') + '</span>' +
      '<svg class="hx-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
  }

  // ----- Розділи ліги: Турніри / Лідерборд / Партнери / Про лігу (навбар на компі, таббар на телефоні) -----
  // Розділ на старті: з адреси (/leaderboard) або з Telegram (startapp=leaderboard)
  HOME.sec = PATH_SEC || (function () {
    var m = /tgWebAppStartParam=(leaderboard|partners|about)(?:&|$)/.exec(location.hash + '&' + location.search.slice(1));
    return m ? secOfPath('/' + m[1]) : null;
  })() || 'tours';
  var LEAGUE_NAV = document.getElementById('leagueNav');
  var HOME_HEAD = { title: document.getElementById('homeTitle'), lead: document.querySelector('#home .home__lead') };
  // Оригінал — завжди українською (з DOM не беремо: якщо обрана ENG, i18n.js уже встиг його перекласти до запуску app.js)
  HOME_HEAD.titleHtml = '<span class="hw-uk">Турніри </span>TROUT MASTER<span class="hw-en"> tournaments</span>';
  HOME_HEAD.leadText = 'Реєстрація, результати онлайн та статистика';
  var LEAGUE_SECS = {
    lb: { title: 'Лідерборд', lead: 'Загальний залік сезону', empty: 'Лідерборд сезону з’явиться тут найближчим часом.' },
    partners: { title: 'Партнери', lead: 'Ті, хто підтримує лігу TROUT MASTER' },
    about: { title: 'Про лігу', lead: 'Що таке TROUT MASTER', empty: 'Розповідь про лігу, правила й формат з’являться тут найближчим часом.' }
  };
  var TABBAR = document.getElementById('tabbar');
  function renderLeagueNav() {
    var on = hasHome(), cur = state.view === 'home' ? HOME.sec : 'tours';
    var tab = on && state.view === 'home';   // таббар (телефон) — лише на розділах ліги, у раунді його немає
    if (TABBAR) TABBAR.hidden = !tab;
    document.documentElement.classList.toggle('has-tabbar', tab);
    var tb = document.querySelector('.topbar');
    if (tab && tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
    [LEAGUE_NAV, TABBAR].forEach(function (nav) {
      if (!nav) return;
      if (nav === LEAGUE_NAV) nav.hidden = !on;
      if (nav.hidden) return;
      [].forEach.call(nav.querySelectorAll('[data-sec]'), function (b) {
        b.setAttribute('aria-current', b.getAttribute('data-sec') === cur ? 'page' : 'false');
      });
      segSlide(nav, '[aria-current="page"]');
    });
  }
  function openSec(sec) {
    var was = state.view === 'home' ? HOME.sec : null;
    HOME.sec = LEAGUE_SECS[sec] ? sec : 'tours';
    if (state.view === 'home') {
      if (was === HOME.sec) { window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); return; }
      if (!IN_TG) try { history.pushState({ tmView: 'home', sec: HOME.sec }, '', secUrl(HOME.sec)); } catch (e) { /* */ }
      renderHome(); renderLeagueNav(); window.scrollTo(0, 0); return;
    }
    if (HOME.sec === 'tours') { goHome(); return; }
    // З раунду в розділ ліги — новий запис в історії («Назад» поверне в раунд)
    HOME.pushed = false;
    if (!IN_TG) try { history.pushState({ tmView: 'home', sec: HOME.sec }, '', secUrl(HOME.sec)); } catch (e) { /* */ }
    showHome();
  }
  [LEAGUE_NAV, TABBAR].forEach(function (nav) {
    if (nav) nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sec]');
      if (!b) return;
      if (nav === TABBAR && IN_TG) try { window.Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (err) { /* */ }
      openSec(b.getAttribute('data-sec'));
    });
  });
  // Зміна ширини (телефон ↔ комп) чи шрифт довантажився — «таблетку» переміряємо в обох перемикачах
  function remeasureNavs() {
    [LEAGUE_NAV, TABBAR].forEach(function (nav) { if (nav && !nav.hidden) { nav._seg = null; segSlide(nav, '[aria-current="page"]'); } });
  }
  window.addEventListener('resize', remeasureNavs);
  // Розмір перемикача змінився з будь-якої причини (Telegram розгорнув вікно, довантажився шрифт) — переміряємо «таблетку»
  if (window.ResizeObserver) {
    // …але лише коли «таблетка» справді стоїть не там: після кліку вона вже виміряна й анімується — не збиваємо анімацію
    var navRO = new ResizeObserver(function () {
      [LEAGUE_NAV, TABBAR].forEach(function (nav) {
        if (!nav || nav.hidden) return;
        var b = nav.querySelector('[aria-current="page"]'), s = nav._seg;
        if (b && s && b.offsetLeft === s.x && b.offsetWidth === s.w && b.offsetTop === s.y && b.offsetHeight === s.h) return;
        nav._seg = null; segSlide(nav, '[aria-current="page"]');
      });
    });
    [LEAGUE_NAV, TABBAR].forEach(function (nav) { if (nav) navRO.observe(nav); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasureNavs);
  // Партнери ліги: картка на кожного (зараз FISH.ME.FISH), нижче — «Стати партнером»
  var PARTNERS = [{
    name: 'FISH.ME.FISH', logo: 'assets/partners/fishmefish.svg?v=2', url: 'https://t.me/fishmefish_japan', handle: '@fishmefish_japan',
    tag: 'Японські приманки',
    text: 'Топові японські приманки — нові й б/у, зокрема дефіцитні моделі, а також витратні матеріали й аксесуари для ловлі хижої риби.'
  }];
  var I_TG = '<svg class="tg-ic" viewBox="26 23 446 446" aria-hidden="true"><path d="M192.579 406.775C179.579 406.775 181.912 401.775 177.246 389.442L139.246 264.108L375.246 116.775L402.912 124.108L379.912 186.775L192.579 406.775Z" fill="#C8DAEA"/><path d="M192.579 406.775C202.579 406.775 206.912 402.108 212.579 396.775C221.245 388.442 332.579 280.108 332.579 280.108L264.245 263.442L200.912 303.442L192.579 403.442V406.775Z" fill="#A9C9DD"/><path d="M199.245 304.775L360.579 423.775C378.912 433.775 392.245 428.775 396.912 406.775L462.579 97.4416C469.245 70.4416 452.245 58.4416 434.579 66.4416L49.2453 215.108C22.912 225.775 23.2453 240.442 44.5787 246.775L143.579 277.775L372.579 133.442C383.245 126.775 393.245 130.442 385.245 137.775L199.245 304.775Z" fill="url(#tgPlaneP)"/><defs><linearGradient id="tgPlaneP" x1="295.882" y1="235.958" x2="379.215" y2="369.292" gradientUnits="userSpaceOnUse"><stop stop-color="#EFF7FC"/><stop offset="1" stop-color="#fff"/></linearGradient></defs></svg>';
  function partnersHtml() {
    var cards = PARTNERS.map(function (p) {
      return '<article class="pt-card">' +
        '<span class="pt-logo"><img src="' + esc(p.logo) + '" alt="" width="288" height="288" decoding="async"></span>' +
        '<div class="pt-body"><span class="pt-tag">' + esc(p.tag) + '</span><h2 class="pt-name">' + esc(p.name) + '</h2>' +
        '<p class="pt-text">' + esc(p.text) + '</p>' +
        '<a class="btn2 btn2-tg pt-go" data-partner="' + esc(p.name) + '" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + I_TG +
        '<span>' + esc(p.handle) + '</span></a></div></article>';
    }).join('');
    return '<div class="home__col home__col--wide"><div class="pt-list">' + cards + '</div>' +
      '<div class="pt-join"><div><strong>Стати партнером ліги</strong><span>Пропозиції співпраці й партнерства — пишіть Андрію</span></div>' +
      '<a class="btn2 pt-join__go" href="https://t.me/andriiteslia" target="_blank" rel="noopener">@andriiteslia</a></div></div>';
  }
  function secHtml(sec) {
    if (sec === 'partners') return partnersHtml();
    if (sec === 'lb') { var lh = leagueHtml(); if (lh) return lh; }
    var c = LEAGUE_SECS[sec];
    return '<div class="home__col home__col--wide"><div class="card empty empty-state league-empty" role="status">' +
      '<img class="empty-state__fish" src="assets/fish.webp?v=2" alt="" width="640" height="296" decoding="async">' +
      '<strong>Скоро</strong><span>' + esc(c.empty) + '</span>' +
      '<button type="button" class="btn btn-primary empty-state__btn" data-sec-go="tours">До турнірів</button></div></div>';
  }
  HOME.body.addEventListener('click', function (e) {
    if (e.target.closest('[data-sec-go]')) { openSec('tours'); return; }
    // посилання розділу «Партнери»: кліки по партнерах рахуємо; в апці t.me — усередині Telegram
    var a = e.target.closest('.pt-card a[href], .pt-join a[href]');
    if (!a) return;
    if (a.hasAttribute('data-partner')) trackPartner(a.getAttribute('data-partner'));
    var tg = tgApp();
    if (IN_TG && tg && typeof tg.openTelegramLink === 'function' && /^https:\/\/t\.me\//.test(a.href)) { e.preventDefault(); tg.openTelegramLink(a.href); }
  });

  function renderHome() {
    var sec = LEAGUE_SECS[HOME.sec] ? HOME.sec : 'tours';
    HOME.root.classList.toggle('is-sec', sec !== 'tours');
    document.documentElement.classList.toggle('sec-partners', sec === 'partners');
    if (sec !== 'tours') {
      HOME_HEAD.title.textContent = LEAGUE_SECS[sec].title;
      HOME_HEAD.lead.textContent = LEAGUE_SECS[sec].lead;
      if (sec === 'lb' && leaguePayload() && homeSeason() && homeSeason().name) HOME_HEAD.lead.textContent = 'Сезон ' + homeSeason().name;
      HOME.body.innerHTML = secHtml(sec);
      if (sec === 'lb' && typeof LG !== 'undefined' && LG.q) lgFilter();
      document.title = LEAGUE_SECS[sec].title + ' — Trout Master';
      return;
    }
    if (HOME_HEAD.title.innerHTML !== HOME_HEAD.titleHtml) { HOME_HEAD.title.innerHTML = HOME_HEAD.titleHtml; HOME_HEAD.lead.textContent = HOME_HEAD.leadText; }
    var s = homeSeason();
    var kick = document.getElementById('homeSeason');
    if (!s) {
      HOME.body.innerHTML = '<div class="home-skel" aria-hidden="true"><i></i><i></i></div>';
      return;
    }
    kick.hidden = !s.name;
    kick.classList.remove('is-skel');
    kick.lastElementChild.textContent = s.name ? 'Сезон ' + s.name : '';
    var cur = homeCurrent();
    var past = s.rounds.filter(function (r) { return r !== cur; }).slice().reverse();
    var h = '<div class="home__col home__col--cur">' + curCardHtml(cur) + '</div>' +
      '<div class="home__col"><h2 class="home__sec">' + (past.length ? 'Зіграні раунди сезону' : 'Раунди сезону') + '</h2><div class="hx-list">' +
      past.map(pastCardHtml).join('') +
      (s.rounds.length < 6 ? '<p class="hx-empty">Наступні раунди з’являться тут після завершення</p>' : '') + '</div></div>';
    HOME.body.innerHTML = h;
    document.title = 'Trout Master — турніри з ловлі форелі';
  }

  HOME.body.addEventListener('click', function (e) {
    var rg = e.target.closest('[data-reg]');
    if (rg) { openRound(parseInt(rg.getAttribute('data-reg'), 10)); goReg(); return; }
    var b = e.target.closest('[data-round]');
    if (!b) return;
    openRound(parseInt(b.getAttribute('data-round'), 10));
  });

  // Після кожного завантаження поточних даних: сезону немає (стара версія скрипта) — головна не потрібна
  window.addEventListener('tm:loaded', function () {
    if (state.view === 'home' && state.payload && !hasHome()) {
      try { history.replaceState({ tmView: 'list' }, '', SITE_ROOT + location.search); } catch (e) { /* */ }
      setView('list');
    }
    openDeepRound();
  });
  // Посилання …/#r1: відкрити раунд, щойно відомий сезон (зі збережених даних — одразу на старті, без проміжного поточного раунду)
  function openDeepRound() {
    if (!HOME_HASH || !hasHome()) return;
    var dl = HOME_HASH;
    HOME_HASH = null;
    if (!homeSeason().rounds.some(function (r) { return r.n === dl.n; })) return;
    var cur0 = homeCurrent();
    try { history.replaceState({ tmView: 'list', round: cur0 && dl.n !== cur0.n ? dl.n : null }, '', IN_TG ? location.href : roundUrl(dl.n)); } catch (e) { /* */ }
    openRound(dl.n, true);
    runDeep(dl.sub);
  }

  // Вставили …/#r1 у ту саму вкладку — відкрити цей раунд
  window.addEventListener('hashchange', function () {
    var d = deepOf(location.hash.replace(/^#/, ''));
    if (!d || !hasHome()) return;
    var n = d.n;
    if (!homeSeason().rounds.some(function (r) { return r.n === n; })) return;
    var cur = homeCurrent();
    var here = HOME.n === n || (!HOME.n && cur && cur.n === n);
    if (!d.sub && state.view === 'list' && here) return;
    if (d.sub && here && ((d.sub === 'stats' && state.view === 'stats' && !state.rulesOpen) || (d.sub === 'rules' && state.rulesOpen) ||
      (d.sub[0] === 'p' && state.view === 'card'))) return;   // «Назад»/«Вперед» по історії — екран уже відкрила обробка popstate
    HOME.pushed = false;
    try { history.replaceState({ tmView: 'list', round: cur && n !== cur.n ? n : null }, '', roundUrl(n)); } catch (e) { /* */ }   // старе …/#r1 → /r1
    if (!here || state.view !== 'list') openRound(n, true);
    runDeep(d.sub);
  });
