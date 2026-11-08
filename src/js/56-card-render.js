  // ===== src/js/56-card-render.js — Картка учасника: скелетон і рендер екрана =====
  function cardSkeleton() {
    var bar = function (w, h, mt) { return '<i class="skel__bar" style="width:' + w + ';' + (h ? 'height:' + h + 'px;' : '') + (mt ? 'margin-top:' + mt + 'px' : '') + '"></i>'; };
    return '<div class="pc-skel" role="status" aria-live="polite"><span class="visually-hidden">Завантаження картки…</span>' +
      '<header class="pc-hero"><div class="pc-hero__bar">' +
      '<button type="button" class="hero-back pc-back" data-act="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span class="l-m">Назад</span><span class="l-d">До підсумку</span></button></div>' +
      '<div class="pc-hero__main" aria-hidden="true"><div class="pc-ava pc-ava--ini skel__dot"></div>' +
      '<div class="pc-head__txt">' + bar('min(320px, 60vw)', 30) + bar('min(200px, 40vw)', 14, 14) + '</div></div></header>' +
      '<div class="pc-sheet" aria-hidden="true"><section class="card pc-block">' + skeletonRows() + '</section></div></div>';
  }
  function renderCard() {
    if (state.cardPending) { pc.body.innerHTML = cardSkeleton(); return; }
    if (state.cmpOpen) { renderCompare(); return; }
    var name = selectedPlayerName();
    if (!name || !hasCardData(name)) { pc.body.innerHTML = '<div class="card empty">Виберіть учасника в таблиці.</div>'; return; }
    var st = playerStats(name);
    // Сторона з жеребкування: «лівий» → Л, «правий» → П
    var sideL = /^л/i.test(st.side) ? 'Л' : /^п/i.test(st.side) ? 'П' : '';
    var sideWord = sideL === 'Л' ? 'лівий' : sideL === 'П' ? 'правий' : '';
    var ev = (state.payload && state.payload.event) || {};
    document.title = st.name + ' | Trout Master';
    var started = st.played > 0;
    var medal = started && st.place >= 1 && st.place <= 3 ? ' medal-' + st.place : '';
    var h = '';

    // Шапка: на телефоні темна, на комп'ютері світла
    var nav = cardNav(name);
    var total = cardPlayersCount();
    var placeTxt = started && st.place ? st.place + ' місце' + (total ? ' з ' + total : '') : '';
    var chips = [st.num ? '№ ' + st.num : '', sideWord ? sideWord.charAt(0).toUpperCase() + sideWord.slice(1) + ' берег' : ''].filter(Boolean);
    var I_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    var I_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    var I_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
    var I_STORY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7v6M9 10l3-3 3 3"/></svg>';
    h += '<header class="pc-hero"><div class="pc-hero__bar">' +
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span class="l-m">Назад</span><span class="l-d">До підсумку</span></button>' +
      '<span class="pc-hero__acts">' +
        (nav.prev ? '<button type="button" class="pc-ibtn d-only" data-act="prev" aria-label="Попередній учасник: ' + esc(nav.prev.name) + '">' + I_BACK + '</button>' : '') +
        (nav.next ? '<button type="button" class="pc-ibtn d-only" data-act="next" aria-label="Наступний учасник: ' + esc(nav.next.name) + '">' + I_NEXT + '</button>' : '') +
        (started ? '<button type="button" class="pc-sharestory d-only" data-act="story">' + I_STORY + '<span>Поділитися результатом</span></button>' : '') +
        '<button type="button" class="pc-share d-only" data-act="share" aria-label="Поділитися карткою">' + I_SHARE + '<span>Поділитися карткою</span></button>' +
      '</span></div>' +
      '<div class="pc-hero__main">' +
      // Є фото — кружечок із фото, а місце маленьким значком у куті; немає — кружечок із місцем, як раніше
      (PHOTOS[normName(st.name)]
        ? '<div class="pc-ava" aria-hidden="true"><img src="assets/players/lg/' + encodeURIComponent(PHOTOS[normName(st.name)]) + '?v=' + PHOTO_V + '" alt="" decoding="async" onerror="this.onerror=null;this.src=this.src.replace(\'/lg/\',\'/\')">' +
            (started && st.place ? '<span class="pc-place pc-place--badge' + medal + '">' + st.place + '</span>' : '') + '</div>'
        : '<div class="pc-ava pc-ava--ini" aria-hidden="true"><span class="pc-ini">' + esc(initials(st.name)) + '</span>' +   // без фото — ініціали в такому ж кружечку
            (started && st.place ? '<span class="pc-place pc-place--badge' + medal + '">' + st.place + '</span>' : '') + '</div>') +
      '<div class="pc-head__txt"><h1 class="title" id="pcTitle" tabindex="-1">' + esc(st.name) + '</h1>' +
      '<p class="pc-sub m-only">' + esc([st.num ? '№ ' + st.num : '', sideWord ? sideWord + ' берег' : '', placeTxt].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="pc-chips d-only">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') +
        (placeTxt ? '<span class="chip chip-place' + medal + '">' + esc(placeTxt) + '</span>' : '') +
        (ev.title ? '<span class="chip chip-plain">' + esc(ev.title) + '</span>' : '') + '</p>' +
      '</div>' +
      // На телефоні «Поділитися» — іконка праворуч від імені
      '<button type="button" class="pc-share pc-share--m m-only" data-act="share" aria-label="Поділитися карткою">' + I_SHARE + '</button>' +
      '</div></header><div class="pc-sheet">';

    // Плитки
    if (started) {
      var diff = st.vsOpp ? st.vsOpp.mine - st.vsOpp.theirs : null;
      h += '<div class="pc-k">' +
        '<div class="pk"><span class="pk__l">Бали</span><span class="pk__v">' + (st.points != null ? st.points : '—') + '</span>' +
          '<span class="pk__wdl" role="img" aria-label="' + st.cnt.w + ' перемог, ' + st.cnt.d + ' рибних нічиїх, ' + st.cnt.z + ' безрибних, ' + st.cnt.l + ' поразок">' +
          ['w', 'd', 'z', 'l'].map(function (c) { return st.cnt[c] ? '<i class="fl-' + c + '" style="flex:' + st.cnt[c] + '"></i>' : ''; }).join('') + '</span>' +
          '<span class="pk__s d-only">' + st.cnt.w + ' В · ' + st.cnt.d + ' РН · ' + st.cnt.z + ' БН · ' + st.cnt.l + ' П</span></div>' +
        '<div class="pk"><span class="pk__l">Улов</span><span class="pk__v">' + st.fish + ' <small>' + fishWord(st.fish) + '</small></span>' +
          '<span class="pk__s">' + (st.avg != null ? fmt1(st.avg) + ' за тур' : '') + '<span class="d-only">' + (st.tAvg != null ? ' · в середньому по турніру ' + fmt1(st.tAvg) : '') + '</span></span></div>' +
        (st.vsOpp ? '<div class="pk"><span class="pk__l">Проти суперників</span><span class="pk__v pk__v--sm">' + st.vsOpp.mine + ' : ' + st.vsOpp.theirs + '</span>' +
          '<span class="pk__badge ' + (diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : '') + '">' + (diff > 0 ? '+' : '') + diff + '<span class="d-only"> ' + fishWord(Math.abs(diff)) + '</span></span></div>' : gapTile(st)) +
        '<div class="pk"><span class="pk__l">Перемоги</span><span class="pk__v pk__v--sm">' + Math.round(st.winRate * 100) + '%</span>' +
          '<span class="pk__s">' + (st.streak ? '<span class="l-m">серія — ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + '</span><span class="l-d">найдовша серія — ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + ' поспіль</span>' : st.cnt.w + ' з ' + st.played) + '</span></div>' +
        '</div>' +
        // Телефон: кнопка внизу екрана, як «Зареєструватися»
        '<div class="pc-storybar m-only"><button type="button" class="btn pc-storybtn" data-act="story">' + I_STORY +
          '<span class="btn__text">Поділитися результатом</span></button></div>';
    } else {
      h += '<p class="info pc-note">Турнір ще не почався. Тут уже видно жеребкування, а статистика з’явиться після перших турів.</p>';
    }

    // Тури (ліва колонка); на широкому екрані праворуч графіки й статистика
    var L = [], R = [];
    L.push([1, '<section class="card pc-block"><h2 class="pc-h2">Тури</h2>' +
      '<div class="pc-tour pc-tour--head" aria-hidden="true"><span>Тур</span><span>Сектор</span><span>Суперник</span><span class="pc-tour__res">Результат</span></div>' +
      '<ol class="pc-tours">' +
      st.tours.map(function (x) {
        var next = st.nextTour === x && started;
        var res = x.code
          ? '<span class="code ' + ({ w: 'code-w', l: 'code-l', d: 'code-d', z: 'code-z' })[x.code] + '" title="' + RES_TEXT[x.code] + '">' +
              ({ w: 'В', l: 'П', d: 'РН', z: 'БН' })[x.code] + '</span>' +
            '<span class="pc-score">' + x.fish + (x.oppFish != null ? ' : ' + x.oppFish : '') + '</span>'
          : '<span class="pc-wait">' + (next ? 'наступний' : 'очікується') + '</span>';
        return '<li class="pc-tour' + (x.code ? '' : ' is-wait') + (next ? ' is-next' : '') + '">' +
          '<span class="pc-tour__n"><span class="visually-hidden">Тур </span><span class="hm-sec__b">' + x.n + '</span></span>' +
          '<span class="pc-tour__sec">' + (x.sector ? '<span class="visually-hidden">сектор </span><b>' + x.sector + '</b>' +
            (sideL ? '<span class="pc-side" aria-hidden="true">' + sideL + '</span><span class="visually-hidden">, ' + sideWord + '</span>' : '') : '') + '</span>' +
          '<span class="pc-tour__opp">' + (x.oppName ? '<span class="pc-num">№' + x.oppNum + '</span> ' + esc(x.oppName) : (x.oppNum ? '№' + x.oppNum : '')) + '</span>' +
          '<span class="pc-tour__res">' + res + '</span>' +
          (x.code ? '<span class="visually-hidden">, ' + RES_TEXT[x.code] + ', ' + x.fish + ' ' + fishWord(x.fish) +
            (x.oppFish != null ? ' проти ' + x.oppFish : '') + '</span>' : '') +
          '</li>';
      }).join('') + '</ol></section>']);

    if (started) {
      // Графік улову по турах
      R.push([2, '<section class="card pc-block"><h2 class="pc-h2">Улов по турах</h2>' + chartSvg(st) +
        '<p class="pc-legend"><span class="lg-bar"></span>улов учасника <span class="lg-line"></span>середній улов у турі</p></section>']);

      // Місце по турах
      var stand = standings(), myPlaces = stand && stand.byName[normName(st.name)];
      if (myPlaces && myPlaces.length > 1) {
        var tCount = Object.keys(toursData().byName).length;
        R.push([3, '<section class="card pc-block"><h2 class="pc-h2">Місце по турах</h2>' + placeSvg(myPlaces, tCount) +
          '<p class="pc-legend">Місце після кожного туру: бали (В 3, РН 2, БН 1, П 0), при рівних — більше перемог, далі більше риби</p></section>']);
      }

      // Статистика
      var rows = [];
      rows.push(stat('Відсоток перемог', Math.round(st.winRate * 100) + '%', st.cnt.w + ' з ' + st.played + ' ' + plural(st.played, 'туру', 'турів', 'турів')));
      if (st.vsOpp) rows.push(stat('Сумарно проти суперників', st.vsOpp.mine + ' : ' + st.vsOpp.theirs,
        'різниця ' + (st.vsOpp.mine - st.vsOpp.theirs > 0 ? '+' : '') + (st.vsOpp.mine - st.vsOpp.theirs) + ' ' + fishWord(Math.abs(st.vsOpp.mine - st.vsOpp.theirs))));
      rows.push(stat('Середній улов за тур', fmt1(st.avg) + ' ' + fishWord(st.avg), st.tAvg != null ? 'по турніру в середньому ' + fmt1(st.tAvg) : ''));
      if (st.share != null) rows.push(stat('Частка від усієї риби', fmt1(st.share * 100) + '%', st.fish + ' з ' + st.totalFish + ' ' + fishWord(st.totalFish) + ' турніру'));
      if (st.best) rows.push(stat('Найкращий тур', 'Тур ' + st.best.n, st.best.fish + ' ' + fishWord(st.best.fish) + (st.best.sector ? ', сектор ' + st.best.sector : '')));
      rows.push(stat('Найдовша серія перемог', st.streak ? st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') + ' поспіль' : '—', ''));
      if (st.secBest) rows.push(stat('Найуловистіший сектор', 'Сектор ' + st.secBest.sector, secText(st.secBest)));
      if (st.secWorst) rows.push(stat('Найслабший сектор', 'Сектор ' + st.secWorst.sector, secText(st.secWorst)));
      var ts = tournamentSectors(), tRows = [];
      if (ts) {
        var tb = ts[0], tw = ts[ts.length - 1];
        tRows.push(stat('Найуловистіший сектор турніру', 'Сектор ' + tb.sector, [tSecText(tb), mySecText(tb.sector)]));
        tRows.push(stat('Найслабший сектор турніру', 'Сектор ' + tw.sector, [tSecText(tw), mySecText(tw.sector)]));
      }
      R.push([4, '<section class="card pc-block"><h2 class="pc-h2">Статистика</h2><dl class="pc-stats">' + rows.join('') + '</dl>' +
        (tRows.length ? '<h3 class="pc-h3">По турніру</h3><dl class="pc-stats">' + tRows.join('') + '</dl>' : '') + '</section>']);

      // Особисті зустрічі
      var groups = [['w', 'Обіграно'], ['d', 'Рибна нічия'], ['z', 'Безрибна нічия'], ['l', 'Програно']].filter(function (g) { return st.meet[g[0]].length; });
      if (groups.length) {
        L.push([5, '<section class="card pc-block"><h2 class="pc-h2">Особисті зустрічі</h2>' + groups.map(function (g) {
          return '<div class="pc-meet"><span class="pc-meet__k c-' + g[0] + '">' + g[1] + ' (' + st.meet[g[0]].length + ')</span><ul class="pc-chips">' +
            st.meet[g[0]].map(function (x) { return '<li>' + esc(x.oppName) + ' <span>' + x.fish + ':' + (x.oppFish != null ? x.oppFish : '?') + '</span></li>'; }).join('') +
            '</ul></div>';
        }).join('') + '</section>']);
      }
    }
    pc.body.innerHTML = h + twoCols(L, R) + '</div>';
    // Цифри у верхніх плитках «докручуються» від нуля — лише коли картку щойно відкрили (не при кожному оновленні даних)
    if (state.view === 'card' && countedCard !== name) {
      countedCard = name;
      countUp(pc.body.querySelectorAll('.pc-k .pk__v, .pc-k .pk__badge'));
      growCharts(pc.body);
      // Призер відкрив свою картку після фіналу — привітання конфеті (раз за сеанс)
      if (started && st.place >= 1 && st.place <= 3 && tournamentDone() && isMine(name)) {
        var ck = finKey() + ':card:' + normName(name);
        if (onceOnDevice(ck)) setTimeout(function () {
          var badge = pc.body.querySelector('.pc-hero .pc-place');
          confetti(pc.body.querySelector('.pc-hero .pc-ava') || badge);
          glow(badge);
        }, 350);
      }
    }

    function tile(label, val, unit) {
      return '<div class="pc-tile"><span class="pc-tile__label">' + label + '</span><span class="pc-tile__val">' + esc(val) +
        (unit ? ' <small>' + unit + '</small>' : '') + '</span></div>';
    }
    function stat(k, v, sub) {
      var subs = (Array.isArray(sub) ? sub : [sub]).filter(Boolean);
      return '<div class="pc-stat"><dt>' + k + '</dt><dd><b>' + esc(v) + '</b>' +
        subs.map(function (x, i) { return '<span' + (i ? ' class="pc-stat__me"' : '') + '>' + esc(x) + '</span>'; }).join('') + '</dd></div>';
    }
    // Улов цього учасника в секторі (для блоку «По турніру»)
    function mySecText(sector) {
      var mine = st.tours.filter(function (x) { return x.code && x.sector === sector; });
      if (!mine.length) return st.nextTour ? 'Учасник у цьому секторі ще не рибалив' : 'Учасник у цьому секторі не рибалив';
      var f = mine.reduce(function (a, x) { return a + x.fish; }, 0);
      return 'Улов учасника тут: ' + f + ' ' + fishWord(f) + ' (' + (mine.length > 1 ? 'тури ' : 'тур ') +
        mine.map(function (x) { return x.n; }).join(', ') + ')';
    }
    function tSecText(x) {
      return 'в середньому ' + fmt1(x.avg) + ' ' + fishWord(x.avg) + ' на учасника за тур (' + x.fish + ' ' + fishWord(x.fish) + ' усього)';
    }
    function secText(x) {
      return x.times > 1 ? 'в середньому ' + fmt1(x.avg) + ' ' + fishWord(x.avg) + ' (' + x.times + ' тури)' : fmt1(x.avg) + ' ' + fishWord(x.avg) + ' (тур ' + x.tours[0] + ')';
    }
  }

