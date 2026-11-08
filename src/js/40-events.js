  // ===== src/js/40-events.js — Події: вкладки, пошук, вибір рядків, мережа =====
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
    state.cmpKey = null;   // другий для порівняння знімається разом
    state.selected = new Set(key ? [key] : []);
    store.set(LS.sel, Array.from(state.selected));
    if (typeof renderReg === 'function' && reg) renderReg();   // кнопка «Картка учасника»
  }

  // Тап по рядку: виділити гравця / повторний тап — зняти. У результатах тап по другому рядку
  // додає його до порівняння (tapRow у 57-compare.js)
  el.board.addEventListener('click', function (e) {
    var tr = e.target.closest('.r[data-key], tbody tr[data-key]');
    if (!tr) return;
    tapRow(tr.getAttribute('data-key'));
    Array.prototype.forEach.call(el.board.querySelectorAll('[data-key]'), function (row) {
      var on = isSel(row.getAttribute('data-key'));
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

