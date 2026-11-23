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
  var HOME_HASH = /^#r(\d+)$/.exec(location.hash);
  var HOME_FIRST = !state.wantPlayer && !wantReg && !HOME_HASH && !/[?&]sel=/.test(location.search) &&
    !/tgWebAppStartParam=/.test(location.hash + location.search) && !/^#(player|stats|register)$/.test(location.hash);

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
      try { history.pushState({ tmView: 'list', round: past ? n : null }, '', IN_TG ? location.href : '#r' + n); } catch (e) { HOME.pushed = false; }
    }
    if (past) enterArchive(n); else leaveArchive();
    if (state.view === 'list') { renderAll(); renderReg(); tgBack(true); window.scrollTo(0, 0); }
    else { renderAll(); setView('list'); }
  }
  function goHome() {
    if (state.view === 'home') { window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); return; }
    if (state.view === 'list' && HOME.pushed && history.state && history.state.tmView === 'list') { history.back(); return; }
    try { history.replaceState({ tmView: 'home' }, '', IN_TG ? location.href : location.pathname + location.search); } catch (e) { /* */ }
    HOME.pushed = false;
    showHome();
  }
  function showHome() {
    var left = leaveArchive();
    if (left) renderAll();
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
  function bannerSrc(u) {
    var m = /^https:\/\/drive\.google\.com\/thumbnail\?id=([\w-]+)/.exec(String(u || ''));
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1200' : u;
  }
  function bannerHtml(r, cls) {
    var ph = '<span class="hb-ph"><small>TROUT MASTER</small><b>ROUND ' + r.n + '</b></span>';
    if (!r.banner) return '<span class="' + cls + '">' + ph + '</span>';
    var src = bannerSrc(r.banner), ok = IMG_OK[src];
    // ще не завантажувався — скелетон, а не заглушка «ROUND N», щоб не блимало; не вийшло — заглушка
    return '<span class="' + cls + (ok ? ' has-img' : ' hb-wait') + '">' + ph + '<img src="' + esc(src) + '" alt="" decoding="async"' + (ok ? ' class="ld"' : '') +
      ' onerror="var p=this.parentNode;this.remove();if(p)p.classList.remove(\'hb-wait\')">' + '</span>';
  }
  // Банер поточного раунду — вантажимо одразу зі збережених даних, ще до першого малювання
  (function () {
    var c = store.get(LS.data, null), s = c && c.season;
    (s && s.rounds || []).forEach(function (r) { if (r.banner) { var im = new Image(); im.src = bannerSrc(r.banner); } });
  })();
  function toursWord(n) { return n + ' ' + plural(n, 'тур', 'тури', 'турів'); }

  function curCardHtml(r) {
    var p = HOME.live ? HOME.live.payload : state.payload;
    var chip = '', chipCls = '', extra = '';
    var parts = subParts(r);
    var meta = parts.map(function (s, i) { return '<span>' + (i === 0 ? ICON_CAL : i === 1 ? ICON_PIN : '') + esc(s) + '</span>'; }).join('');
    if (p && isListMode()) {
      var open = regOpenNow(), d = regDeadline(), si = seatsInfo();
      chip = open ? 'Реєстрація відкрита' : 'Реєстрацію закрито';
      chipCls = open ? 'reg' : 'off';
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
      else { chip = 'Скоро старт'; chipCls = 'soon'; }
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
      '<button type="button" class="hc-go" data-round="' + r.n + '">Детальніше</button></div></article>';
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

  function renderHome() {
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
    var b = e.target.closest('[data-round]');
    if (!b) return;
    openRound(parseInt(b.getAttribute('data-round'), 10));
  });

  // Після кожного завантаження поточних даних: сезону немає (стара версія скрипта) — головна не потрібна
  window.addEventListener('tm:loaded', function () {
    if (state.view === 'home' && state.payload && !hasHome()) {
      try { history.replaceState({ tmView: 'list' }, '', location.pathname + location.search); } catch (e) { /* */ }
      setView('list');
    }
    // Посилання …/#r1: відкрити раунд, щойно відомий сезон
    if (HOME_HASH && hasHome()) {
      var n = parseInt(HOME_HASH[1], 10);
      HOME_HASH = null;
      if (homeSeason().rounds.some(function (r) { return r.n === n; })) {
        try { history.replaceState({ tmView: 'list', round: n }, '', location.href); } catch (e) { /* */ }
        openRound(n, true);
      }
    }
  });

  // Вставили …/#r1 у ту саму вкладку — відкрити цей раунд
  window.addEventListener('hashchange', function () {
    var m = /^#r(\d+)$/.exec(location.hash);
    if (!m || !hasHome()) return;
    var n = parseInt(m[1], 10);
    if (!homeSeason().rounds.some(function (r) { return r.n === n; })) return;
    var cur = homeCurrent();
    if (state.view === 'list' && (HOME.n === n || (!HOME.n && cur && cur.n === n))) return;
    HOME.pushed = false;
    openRound(n, true);
  });
