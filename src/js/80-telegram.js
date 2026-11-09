  // ===== src/js/80-telegram.js — Telegram: потягнути — оновити, свайп «Назад», свій рядок, візити, дозвіл писати, партнери =====
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
  // Анонімний ID пристрою (той самий для візитів і кліків по партнерах)
  function deviceId() {
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
    return id;
  }
  function webVisit() {
    if (DEMO || IN_TG) return;
    var id = deviceId();
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
    // Головні дії — сповіщення (в апці) і Telegram-чат, тож «Переглянути список» завжди другорядна
    toList.classList.remove('btn-primary');
    toList.classList.add('btn-secondary');
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

  // Клік по партнеру — у статистику на аркуші «Партнери» (анонімно: Telegram ID або ID пристрою)
  function trackPartner(name) {
    if (DEMO || !name) return;
    var tg = tgApp();
    var body = JSON.stringify({
      action: 'pclick', partner: name,
      dev: window.matchMedia && window.matchMedia('(min-width: 980px)').matches ? 'Комп' : 'Телефон',
      vid: deviceId(), tg: (IN_TG && tg && tg.initData) || ''
    });
    try {
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, keepalive: true })
        .catch(function () { /* статистика — не критично */ });
    } catch (e) { /* */ }
  }
  // «Telegram-чат» (шапка на комп'ютері й банер після реєстрації): у браузері — просте посилання,
  // в апці — відкриваємо чат усередині Telegram
  ['chatWeb', 'regChat'].forEach(function (id) {
    var a = document.getElementById(id);
    if (!a) return;
    a.addEventListener('click', function (e) {
      var tg = tgApp();
      if (!IN_TG || !tg || typeof tg.openTelegramLink !== 'function') return;
      e.preventDefault();
      tg.openTelegramLink(a.href);
    });
  });
  // Кнопка партнера над нижньою кнопкою (лише в ТГ на телефоні): відкриває канал усередині Telegram
  (function () {
    ['partner', 'partnerWeb'].forEach(function (id) {
      var a = document.getElementById(id);
      if (!a) return;
      a.addEventListener('click', function (e) {
        trackPartner(a.getAttribute('data-partner'));
        var tg = tgApp();
        if (!IN_TG || !tg || typeof tg.openTelegramLink !== 'function') return;   // звичайний браузер — просте посилання
        e.preventDefault();
        try { tg.HapticFeedback && tg.HapticFeedback.impactOccurred('light'); } catch (er) { /* */ }
        tg.openTelegramLink(a.href);
      });
    });
  })();

  // Футер: рік, кліки по партнерах; в апці посилання t.me відкриваються всередині Telegram, решта — у браузері
  (function () {
    var f = document.getElementById('siteFoot');
    if (!f) return;
    var y = document.getElementById('footYear');
    if (y) y.textContent = String(Math.max(2026, new Date().getFullYear()));
    f.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      if (a.hasAttribute('data-partner')) trackPartner(a.getAttribute('data-partner'));
      var tg = tgApp();
      if (!IN_TG || !tg) return;
      if (/^https:\/\/t\.me\//.test(a.href) && typeof tg.openTelegramLink === 'function') { e.preventDefault(); tg.openTelegramLink(a.href); }
      else if (/^https?:/.test(a.href) && typeof tg.openLink === 'function') { e.preventDefault(); tg.openLink(a.href); }
    });
  })();

  // Плашка над таблицею «Результати — у Telegram»: для всіх у ТГ, хто ще не дозволив боту писати.
  // Показуємо лише після відповіді «Хто я?» (щоб не блимала тим, кому вже можна писати).
  // Зареєстрованим учасникам — свій текст («Ви в списку учасників…»): їм бот надсилає жеребкування,
  // нагадування й результати, тож після хрестика чи «Ні» плашка повертається вже через 2 дні (решті — через 14).
  var LS_NBAR = 'tm:nbarHideUntil', LS_NBAR_REG = 'tm:nbarRegHideUntil', nbarOk = false;
  function nbarIsReg() { return !!(state.myNames && state.myNames.length); }
  function nbarSnooze() {
    if (nbarIsReg()) store.set(LS_NBAR_REG, Date.now() + 2 * 864e5);
    else store.set(LS_NBAR, Date.now() + 14 * 864e5);
  }
  function nbarReady() { nbarOk = true; renderNbar(); }
  function renderNbar() {
    var el = $('nbar');
    if (!el || el.classList.contains('is-done')) return;
    var isReg = nbarIsReg();
    var hideUntil = Number(store.get(isReg ? LS_NBAR_REG : LS_NBAR, 0)) || 0;
    el.hidden = !(nbarOk && IN_TG && canOfferNotify() && Date.now() > hideUntil);
    el.classList.toggle('nbar--reg', isReg);
    var txt = isReg
      ? '<b>Ви в списку учасників</b><small>Увімкніть сповіщення — надішлемо жеребкування, нагадування й ваші результати</small>'
      : '<b>Результати — у Telegram</b><small>Бот напише ваше місце й підсумки після турніру</small>';
    if ($('nbarTxt').getAttribute('data-k') !== String(isReg)) { $('nbarTxt').innerHTML = txt; $('nbarTxt').setAttribute('data-k', String(isReg)); }
    $('nbarGo').textContent = isReg ? 'Увімкнути сповіщення' : 'Отримувати результати';
  }
  $('nbarX').addEventListener('click', function () {
    nbarSnooze();
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
          $('nbarTxt').innerHTML = nbarIsReg()
            ? '<b>🔔 Готово!</b><small>Жеребкування, нагадування й результати прийдуть у Telegram</small>'
            : '<b>🔔 Готово!</b><small>Результати прийдуть у Telegram</small>';
          setTimeout(function () { el.hidden = true; el.classList.remove('is-done'); $('nbarTxt').removeAttribute('data-k'); }, 2600);
        } else {
          nbarSnooze();
          renderNbar();
        }
      });
    } catch (e) { /* */ }
  });

  window.addEventListener('popstate', function (e) {
    if (takeHashPlayer()) return;   // вставили …/#p9 у ту саму вкладку — відкрити картку, а не список
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

