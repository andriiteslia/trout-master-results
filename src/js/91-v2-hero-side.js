  // ===== src/js/91-v2-hero-side.js — Новий дизайн: шапка турніру, бічна панель, таблетка вибраного, тости =====
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
    // Вартість участі — з таблиці (аркуш «Сайт», B14). Число → «1 700 грн», текст — як є
    var feeEl = document.getElementById('regFee'), fee = String((state.payload && state.payload.fee) || '').trim();
    if (feeEl) {
      feeEl.hidden = !fee;
      if (fee) {
        if (/^\d[\d\s]*$/.test(fee)) fee = fee.replace(/\s/g, '').replace(/\B(?=(\d{3})+$)/g, '\u00a0') + '\u00a0грн';
        feeEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/></svg>' +
          '<span>Вартість участі — ' + esc(fee) + '</span>';
      }
    }
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
      h += kpi('k-tour', 'Турів зіграно', 'Тур', pl + ' <small>/ ' + t.rounds + '</small>',
        '<span class="kpi__bar d-only"><span style="width:' + Math.round(pl / t.rounds * 100) + '%"></span></span>');
    }
    var tf = totalFish();
    if (tf != null) {
      var tot = tourTotals(t), mx = Math.max.apply(null, tot.map(function (x) { return x || 0; }).concat([1]));
      var spark = t && playedTours(t) > 1 ? '<span class="spark d-only" aria-hidden="true">' + tot.map(function (x) {
        return '<i style="height:' + (x ? Math.max(2, Math.round(x / mx * 30)) : 0) + 'px"></i>';
      }).join('') + '</span>' : '';
      // Третій рядок — найуловистіший сектор турніру (середній улов на учасника за тур), якщо секторів більше одного
      var secs = t && playedTours(t) ? tournamentSectors() : null;
      var secLine = secs && secs.length > 1 ? '<span class="kpi__s d-only">Найуловистіший сектор: <b>' + secs[0].sector + '</b></span>' : '';
      h += kpi(spark ? 'k-spark' : '', 'Усього риби', 'Риби', fmtInt(tf), spark + secLine);
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
    var pair = cmpPair();
    v2.selbar.classList.toggle('is-cmp', !!pair);
    v2.selPlace2.hidden = true;
    v2.selCardText.textContent = pair ? 'Порівняти' : 'Картка учасника';
    if (pair) {   // виділено двох: два кружечки місць, «Порівняння», імена через «vs»
      var sr = standingsRows();
      [[v2.selPlace, pair[0]], [v2.selPlace2, pair[1]]].forEach(function (x) {
        var r = sr && sr.rows.find(function (y) { return normName(y.name) === normName(x[1]); });
        x[0].hidden = !(r && r.place);
        if (r && r.place) { x[0].textContent = r.place; x[0].className = 'selbar__place' + (x[0] === v2.selPlace2 ? ' selbar__place--2' : '') + (r.place <= 3 ? ' medal-' + r.place : ''); }
      });
      v2.selLbl.textContent = 'Порівняння';
      v2.selName.textContent = pair[0] + '  vs  ' + pair[1];
      return;
    }
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
    // Дробова висота (напр. 80.6px) + 1px нахлесту — інакше між панеллю й рядком колонок щілина, крізь яку видно рядки
    var put = function () { document.documentElement.style.setProperty('--bt-h', (bt.getBoundingClientRect().height - 1) + 'px'); };
    put();
    if (window.ResizeObserver) new ResizeObserver(put).observe(bt); else window.addEventListener('resize', put);
  })();

