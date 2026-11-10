  // ===== src/js/93-v2-events.js — Новий дизайн: події (навігація, «Оновити», клавіатура) =====
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
  // Логотип — на головну (список/результати) з будь-якого екрана; на головній — угору
  document.getElementById('logoHome').addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;   // нова вкладка — як звичайне посилання
    e.preventDefault();
    if (state.view !== 'list') goList();
    else window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  });
  v2.heroStats.addEventListener('click', function () { goStats(); });
  v2.heroReg.addEventListener('click', function () { goReg(); });
  v2.selCard.addEventListener('click', function () { if (cmpPair()) goCompare(); else goCard(); });
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
      b.classList.add('is-spin'); b.setAttribute('aria-busy', 'true'); t0 = Date.now();
      load();
    });
    window.addEventListener('tm:loaded', function () {
      if (!b.classList.contains('is-spin')) return;
      setTimeout(function () {
        b.classList.remove('is-spin'); b.removeAttribute('aria-busy');
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

  // Картинка-прев'ю сайту (як og:image) — для «Поділитися» з фото. Вантажимо заздалегідь: системне меню
  // поділитися вимагає, щоб виклик ішов одразу з тапу, без очікування мережі.
  var SHARE_IMG = 'assets/og.jpg?v=2', shareFile = null;
  function preloadShareImg() {
    if (shareFile || !window.File || !window.fetch) return;
    fetch(SHARE_IMG).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (b) shareFile = new File([b], 'trout-master.jpg', { type: 'image/jpeg' });
    }).catch(function () {});
  }
  setTimeout(preloadShareImg, 2500);
  // Telegram: рідне повідомлення від бота (фото + підпис + кнопка) через WebApp.shareMessage; інакше — як раніше
  function tgShareMessage(tg, url, text, btn, fallback) {
    var done = false, to = setTimeout(function () { if (!done) { done = true; fallback(); } }, 6000);
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'shareMsg', tg: tg.initData, url: url, text: text, btn: btn }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (done) return;
        done = true; clearTimeout(to);
        if (res && res.ok && res.id) tg.shareMessage(res.id, function () {});
        else fallback();
      })
      .catch(function () { if (!done) { done = true; clearTimeout(to); fallback(); } });
  }
  function shareLink(url, text, btn) {
    text = I18N.tr(text);
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initData && typeof tg.shareMessage === 'function' && API && (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))) {
      tgShareMessage(tg, url, text, I18N.tr(btn || 'Відкрити в TROUT MASTER'), function () { shareLinkPlain(url, text, tg); });
      return;
    }
    shareLinkPlain(url, text, tg);
  }
  function shareLinkPlain(url, text, tg) {
    try {
      if (tg && tg.initData && tg.openTelegramLink) {
        tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text));
        return;
      }
    } catch (e) { /* */ }
    // Системне меню (телефон і Mac): фото-прев'ю + підпис із посиланням
    if (shareFile && navigator.canShare && navigator.share) {
      var d = { files: [shareFile], text: text + '\n' + url };
      try { if (navigator.canShare(d)) { navigator.share(d).catch(function () {}); return; } } catch (e) { /* */ }
    }
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ title: text, text: text, url: url }).catch(function () {});
      return;
    }
    var done = function () { toast('✓ Посилання скопійовано'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast(url); });
    else toast(url);
  }
  if (v2.share) v2.share.addEventListener('click', function () {
    var ev = (state.payload && state.payload.event) || {};
    shareLink(shareUrl(), (ev.title || 'TROUT MASTER') + ': результати наживо', 'Дивитися результати');
  });
  // Клавіатура: Enter/пробіл на рядку = тап
  el.board.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.r[data-key]')) { e.preventDefault(); e.target.click(); }
  });
  // ================= /Новий дизайн =================
