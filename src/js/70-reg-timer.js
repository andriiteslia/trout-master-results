  // ===== src/js/70-reg-timer.js — Відлік до кінця реєстрації, екрани (setView), прилипла шапка «Тури» =====
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
    html.classList.remove('deep-wait');
    html.classList.remove('home-wait');
    html.classList.toggle('view-stats', state.view === 'stats');
    html.classList.toggle('view-home', state.view === 'home');
    if (HOME) HOME.root.hidden = state.view !== 'home';
    // На сторінці раунду, коли є головна з картками, «Назад» веде до всіх раундів
    var listHome = isList && hasHome();
    html.classList.toggle('list-home', listHome);
    var hb = document.querySelector('#heroBack span');
    if (hb) hb.textContent = listHome ? 'Усі раунди' : 'Назад';
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
    var pair = showCard ? cmpPair() : null;   // виділено двох — кнопка порівняння замість картки
    pc.open.classList.toggle('is-cmp', !!pair);
    pc.openText.textContent = pair ? (other ? 'Порівняти' : 'Порівняти учасників') : other ? 'Картка учасника' : 'Картка учасника · ' + player;
    pc.open.classList.toggle('btn-primary', !other);
    pc.open.classList.toggle('btn-secondary', other);
    reg.bar.classList.toggle('two', other && showCard);
    // Раунд без даних (реєстрацію закрито, турів ще немає) і є головна — кнопка «На головну» замість порожньої панелі
    var showHomeBtn = isList && hasHome() && !other && !showCard;
    var hbtn = document.getElementById('homeOpen');
    if (hbtn) hbtn.hidden = !showHomeBtn;
    var showBar = other || showCard || showHomeBtn;
    // Плаваючої кнопки партнера більше немає (партнери — у розділі «Партнери» й на банерах раундів): без кнопок панелі немає
    reg.bar.hidden = !showBar;
    reg.bar.classList.remove('solo');
    html.classList.remove('has-partner-solo');
    reg.live.hidden = !showReg;   // плашка «Триває реєстрація» над таблицею
    renderTimer();
    html.classList.toggle('has-regbar', showBar);
    if (typeof v2 !== 'undefined' && v2) renderChrome();
    renderLeagueNav();
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
      tg.BackButton.offClick(goBack);
      if (show) { tg.BackButton.onClick(goBack); tg.BackButton.show(); } else tg.BackButton.hide();
    } catch (e) { /* */ }
  }

  // ----- Картка учасника: прилипла шапка таблиці «Тури» отримує заокруглені кути, як у картки -----
  var stuckFrame = 0;
  function markStuckHeads() {
    stuckFrame = 0;
    // Шапка «прилипла», якщо вона нижче свого звичайного місця (одразу після попереднього елемента
    // або від верху таблиці)
    var cap = IN_TG ? capTop() : 0;   // нижній край закріпленого навбару
    [].forEach.call(document.querySelectorAll('.pcard .pc-tour--head, .tg .rk-head, .tg .plist-head, .tg .tgrid-hd, .lb-sticky'), function (hd) {
      if (!hd.offsetParent) return;
      var prev = hd.previousElementSibling, natural;
      if (prev && prev.offsetParent) natural = prev.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(prev).marginBottom) || 0);
      else { var par = hd.parentElement; natural = par.getBoundingClientRect().top + (parseFloat(getComputedStyle(par).borderTopWidth) || 0) + (parseFloat(getComputedStyle(par).paddingTop) || 0); }
      var r = hd.getBoundingClientRect().top;
      hd.classList.toggle('is-stuck', r > natural + 0.5);
      // Telegram: шапка над «кришкою» аркуша лише поки стоїть на своєму місці (12 px під панеллю);
      // коли таблиця закінчується і шапка їде вгору — ховається під заокруглення, а не налазить на кути
      if (IN_TG) hd.classList.toggle('over-cap', r >= cap + 11.5);
    });
    // Форма реєстрації (Telegram): так само
    if (IN_TG && state.view === 'reg' && reg.form.offsetParent) {
      reg.form.classList.toggle('over-cap', reg.form.getBoundingClientRect().top >= cap + 11.5);
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
    // форма стає на 12 px під закріпленим навбаром (у Telegram його висота вже містить відступ під панеллю)
    var target = reg.form.getBoundingClientRect().top + window.scrollY - (capTop() + 12);
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
    if (v !== 'card' && state.cardPending) { state.cardPending = false; state.wantPlayer = null; }   // пішли з картки, поки вона вантажилась
    if (v !== 'card') { countedCard = ''; state.cmpOpen = false; }   // наступне відкриття картки — знову з «докручуванням»
    if (v !== 'stats') { grownStats = false; state.rulesOpen = false; }
    if (formLift.spacer) setFormSpacer(0);
    renderReg();
    tgBack(v !== rootView());
    window.scrollTo(0, 0);
    if (v === 'stats') {
      renderStats();
      var hs = document.getElementById('tsTitle');
      if (hs) { try { hs.focus({ preventScroll: true }); } catch (e) { hs.focus(); } }
    } else if (v === 'card') {
      renderCard();
      var h = document.getElementById('pcTitle');
      if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    } else if (v === 'home') {
      renderHome();
      renderStatus(false);
      var ht = document.getElementById('homeTitle');
      if (ht && state.payload) { try { ht.focus({ preventScroll: true }); } catch (e) { /* */ } }
    } else if (v === 'reg') {
      renderHeader();
      try { reg.title.focus({ preventScroll: true }); } catch (e) { reg.title.focus(); }
      if (!DEMO && state.payload) load();   // перевірити, чи реєстрація досі відкрита
    } else {
      renderHeader();
      renderBoard();
      // Перемикач «Підсумок / По турах» міг малюватись, поки сторінка була прихована (головна) — ставимо «таблетку» заново
      el.tabs._seg = null; slideTabs();
      revealFocusRow();
    }
  }

  function goReg() {
    if (state.view === 'reg') return;
    state.regDone = null;
    state.regPushed = true;
    try { history.pushState({ tmView: 'reg' }, '', IN_TG ? location.href : SITE_ROOT + '#register'); } catch (e) { state.regPushed = false; }
    setView('reg');
  }

  function goCard() {
    if (state.view === 'card') return;
    state.regPushed = true;
    var nm = selectedPlayerName(), dpc = nm && drawData() ? drawData().players.find(function (x) { return normName(x.name) === normName(nm); }) : null;
    try { history.pushState({ tmView: 'card' }, '', IN_TG ? location.href : viewHash(dpc ? 'p' + dpc.n : null)); } catch (e) { state.regPushed = false; }
    setView('card');
  }

  function goStats() {
    if (state.view === 'stats' && state.rulesOpen) { state.rulesOpen = false; renderStats(); renderChrome(); window.scrollTo(0, 0); return; }
    if (state.view === 'stats') return;
    state.regPushed = true;
    try { history.pushState({ tmView: 'stats' }, '', IN_TG ? location.href : viewHash('stats')); } catch (e) { state.regPushed = false; }
    setView('stats');
  }

  function goList() {
    if (state.view === 'list') return;
    if (state.regPushed && history.state && history.state.tmView === state.view) { history.back(); return; }
    try { history.replaceState({ tmView: 'list', round: HOME.n || null }, '', IN_TG ? location.href : viewHash(null)); } catch (e) { /* */ }
    setView('list');
  }

  window.addEventListener('hashchange', function () {
    if (takeHashPlayer()) return;
    if (location.hash !== '#register' || state.view === 'reg') return;
    state.regDone = null;
    state.regPushed = false;
    try { history.replaceState({ tmView: 'reg' }, '', location.href); } catch (e) { /* */ }
    setView('reg');
  });
  document.addEventListener('tm-tg-ready', function () { if (state.view !== rootView()) tgBack(true); });

