  // ===== src/js/94-v2-info.js — «Як доїхати» і «Положення»: плитки під KPI (Telegram, режим «Список учасників») =====
  var VENUE = CFG.VENUE && CFG.VENUE.lat && CFG.VENUE.lng ? CFG.VENUE : null;
  var I_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  var I_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
  var I_GO = '<svg class="hlink__go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function rulesData() {
    var r = state.payload && state.payload.rules;
    return Array.isArray(r) && r.length ? r : null;
  }
  function renderInfoLinks() {
    var box = document.getElementById('heroLinks');
    if (!box) return;
    var rules = rulesData();
    var on = IN_TG && !!state.payload && isListMode() && (!!VENUE || !!rules);
    box.hidden = !on;
    if (!on) { box.innerHTML = ''; return; }
    var h = '';
    if (VENUE) h += '<button type="button" class="kpi hlink" data-info="map">' + I_PIN +
      '<span class="hlink__txt"><b>Як доїхати</b><small>Навігатор</small></span>' + I_GO + '</button>';
    if (rules) h += '<button type="button" class="kpi hlink" data-info="rules">' + I_DOC +
      '<span class="hlink__txt"><b>Положення</b><small>Розклад і правила</small></span>' + I_GO + '</button>';
    if (box.innerHTML !== h) box.innerHTML = h;
    box.classList.toggle('hlinks--1', !(VENUE && rules));
  }

  // ---------- Вибір навігатора ----------
  var mapSheet = document.getElementById('mapSheet');
  function openLinkOut(url) {
    var tg = IN_TG ? tgApp() : null;
    if (tg && typeof tg.openLink === 'function') { tg.openLink(url); return true; }
    return false;
  }
  function openMapSheet() {
    if (!VENUE || !mapSheet) return;
    var ll = VENUE.lat + ',' + VENUE.lng, name = VENUE.name || '';
    var urls = {
      google: VENUE.google || 'https://www.google.com/maps/search/?api=1&query=' + ll,
      waze: 'https://waze.com/ul?ll=' + ll + '&navigate=yes',
      apple: 'https://maps.apple.com/?daddr=' + ll + (name ? '&q=' + encodeURIComponent(name) : '')
    };
    [].forEach.call(mapSheet.querySelectorAll('a[data-map]'), function (a) { a.href = urls[a.getAttribute('data-map')]; });
    document.getElementById('mapName').textContent = name;
    mapSheet.hidden = false;
    requestAnimationFrame(function () { mapSheet.classList.add('is-on'); });
  }
  function closeMapSheet() {
    if (!mapSheet || mapSheet.hidden) return;
    mapSheet.classList.remove('is-on');
    setTimeout(function () { mapSheet.hidden = true; }, REDUCED ? 0 : 220);
  }
  if (mapSheet) mapSheet.addEventListener('click', function (e) {
    var t = e.target.closest('[data-map]');
    if (!t) return;
    var k = t.getAttribute('data-map');
    if (k === 'close') { closeMapSheet(); return; }
    if (openLinkOut(t.href)) e.preventDefault();
    closeMapSheet();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMapSheet(); });

  document.getElementById('heroLinks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-info]');
    if (!b) return;
    if (b.getAttribute('data-info') === 'map') openMapSheet();
    else goRules();
  });

  // ---------- Екран «Положення» (у контейнері статистики) ----------
  function goRules() {
    if (!rulesData()) return;
    state.rulesOpen = true;
    if (state.view === 'stats') { renderStats(); window.scrollTo(0, 0); return; }
    state.regPushed = true;
    try { history.pushState({ tmView: 'stats' }, '', IN_TG ? location.href : '#rules'); } catch (e) { state.regPushed = false; }
    setView('stats');
  }
  // «07:00 — Збір» / «40 хв - Зважування» → [час, подія]; інакше null
  function schedLine(s) {
    var m = String(s).match(/^(\d{1,2}[:.]\d{2}(?:\s*[-–—]\s*\d{1,2}[:.]\d{2})?|\d+\s*(?:хв|год)\.?)\s*[-–—:]\s*(.+)$/i);
    return m ? [m[1].replace('.', ':'), m[2]] : null;
  }
  // Посилання в тексті положення робимо клікабельними (текст уже екранований)
  function linkify(h) {
    return h.replace(/https?:\/\/[^\s<]+[^\s<.,;:)!?]/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u.replace(/^https?:\/\//, '') + '</a>';
    });
  }
  function renderRules() {
    var rules = rulesData(), ev = (state.payload && state.payload.event) || {};
    document.title = 'Положення | Trout Master';
    if (!rules) { ts.body.innerHTML = emptyState('Положення поки немає', 'Організатор ще не додав його.'); return; }
    var I_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    var h = '<header class="pc-hero ts-hero"><div class="pc-hero__bar">' +
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span>Учасники</span></button></div>' +
      '<div class="ts-hero__main"><div class="pc-head__txt"><h1 class="title" id="tsTitle" tabindex="-1">Положення</h1>' +
      '<p class="pc-sub">' + esc([ev.title, ev.subtitle].filter(Boolean).join(' · ')) + '</p></div></div></header>' +
      '<div class="pc-sheet rules">';
    var n = 0;
    rules.forEach(function (sec) {
      var items = sec.items || [];
      var sched = /розклад|програма|регламент дня/i.test(sec.t || '') ||
        (items.length > 2 && items.filter(schedLine).length >= items.length * 0.6);
      h += '<section class="card pc-block rules__sec">';
      if (sec.t) h += '<h2 class="pc-h2">' + (sched ? '' : '<span class="rules__n">' + (++n) + '</span>') + esc(sec.t) + '</h2>';
      if (sched) {
        h += '<ol class="rules__sched" translate="no">' + items.map(function (it) {
          var p = schedLine(it);
          if (!p) return '<li class="rules__note">' + esc(it) + '</li>';
          var gap = /хв|год/i.test(p[0]);
          return '<li' + (gap ? ' class="is-gap"' : '') + '><span class="rules__time">' + esc(p[0]) + '</span><span>' + esc(p[1]) + '</span></li>';
        }).join('') + '</ol>';
      } else if (items.length) {
        h += '<ul class="rules__list" translate="no">' + items.map(function (it) { return '<li>' + linkify(esc(it)) + '</li>'; }).join('') + '</ul>';
      }
      h += '</section>';
    });
    if (VENUE) h += '<button type="button" class="rules__map" data-info="map">' + I_PIN + '<span>Як доїхати · ' + esc(VENUE.name || '') + '</span>' + I_GO + '</button>';
    ts.body.innerHTML = h + '</div>';
  }
  ts.body.addEventListener('click', function (e) {
    if (e.target.closest('[data-info="map"]')) { openMapSheet(); return; }
    var a = e.target.closest('.rules a[href]');
    if (a && openLinkOut(a.href)) e.preventDefault();   // у Telegram — через openLink
  });
