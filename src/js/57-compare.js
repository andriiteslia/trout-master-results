  // ===== src/js/57-compare.js — Порівняння двох учасників («Двобій») =====
  // Вибір у результатах: тап по рядку — перший учасник (state.selected, як і раніше), тап по іншому —
  // другий (state.cmpKey), тап по третьому замінює другого. Тоді замість «Картка учасника» —
  // «Порівняти» (кнопка внизу на телефоні й таблетка на комп'ютері). Екран порівняння живе в
  // контейнері картки (state.cmpOpen), тож «Назад», Telegram і свайп працюють так само.
  // Порівнюється основне: 4 плитки картки (бали, В·РН·БН·П, улов, проти суперників) і блок «Статистика»;
  // якщо за жеребкуванням вони суперники — ще й «Особисті зустрічі»: зазвичай один тур і один рахунок,
  // інколи 2 (або 4–6 у плей-оф) — тоді в заголовку ще й підсумок перемог між собою.

  function keyName(k) { return k ? String(k).replace(/ #\d+$/, '') : null; }
  // Порівняння — лише в результатах, коли вже є зіграні тури й картки увімкнені (B12)
  function canCompare() {
    return !isListMode() && statsReady() && !(state.payload && state.payload.showCard === false);
  }
  function isSel(key) {
    return state.selected.has(key) || (!!state.cmpKey && state.cmpKey === key && canCompare());
  }
  // [перший, другий] — імена двох виділених, якщо порівняння можливе
  function cmpPair() {
    if (!state.cmpKey || !canCompare()) return null;
    var a = selectedPlayerName(), b = keyName(state.cmpKey);
    if (!a || !b || normName(a) === normName(b) || !hasCardData(a) || !hasCardData(b)) return null;
    return [a, b];
  }

  function tapRow(key) {
    var prim = Array.from(state.selected)[0] || null;
    // Перший виділений із попереднього режиму (напр. зі списку учасників), якого немає в результатах, —
    // не тримаємо: тап просто виділяє новий рядок і показує «Картка учасника»
    if (prim && canCompare() && !hasCardData(keyName(prim))) prim = null;
    if (!canCompare() || !prim) { selectOnly(prim === key ? null : key); return; }
    if (key === prim) { selectOnly(state.cmpKey || null); return; }        // зняли першого — другий стає першим
    if (key === state.cmpKey) { state.cmpKey = null; renderReg(); return; } // зняли другого
    state.cmpKey = key;                                                       // додали другого (або замінили)
    renderReg();
  }

  function goCompare() {
    if (!cmpPair()) return;
    state.cmpOpen = true;
    if (state.view === 'card') { renderCard(); window.scrollTo(0, 0); return; }
    goCard();
  }

  function renderCompare() {
    var pair = cmpPair();
    if (!pair) { state.cmpOpen = false; renderCard(); return; }
    var A = playerStats(pair[0]), B = playerStats(pair[1]);
    var total = cardPlayersCount();
    document.title = 'Порівняння | Trout Master';

    function ava(st) {
      var medal = st.place >= 1 && st.place <= 3 ? ' medal-' + st.place : '';
      var badge = st.place ? '<span class="pc-place pc-place--badge' + medal + '">' + st.place + '</span>' : '';
      var ph = PHOTOS[normName(st.name)];
      return ph
        ? '<div class="pc-ava cmp-ava" aria-hidden="true"><img src="assets/players/lg/' + encodeURIComponent(ph) + '?v=' + PHOTO_V + '" alt="" decoding="async" onerror="this.onerror=null;this.src=this.src.replace(\'/lg/\',\'/\')">' + badge + '</div>'
        : '<div class="pc-ava pc-ava--ini cmp-ava" aria-hidden="true"><span class="pc-ini">' + esc(initials(st.name)) + '</span>' + badge + '</div>';
    }
    function side(st) {
      var sub = [st.place ? st.place + ' місце' + (total ? ' з ' + total : '') : '', st.num ? '№ ' + st.num : ''].filter(Boolean).join(' · ');
      return '<div class="cmp-p">' + ava(st) + '<span class="cmp-nm">' + esc(st.name) + '</span>' +
        (sub ? '<span class="cmp-sub">' + esc(sub) + '</span>' : '') + '</div>';
    }

    // Рядок показника: значення зліва й справа, назва по центру, під ними смужка-шкала.
    // dir: 'high' — більше краще, 'low' — менше краще, null — без переможця (лише для довідки)
    var score = { a: 0, b: 0, tie: 0, n: 0 };
    function row(label, a, b, o) {
      o = o || {};
      var win = null;
      if (o.dir && a != null && b != null) {
        score.n++;
        if (a === b) { win = 'tie'; score.tie++; }
        else { win = (o.dir === 'high' ? a > b : a < b) ? 'a' : 'b'; score[win]++; }
      }
      var show = o.fmt || function (v) { return String(v); };
      var cell = function (v, who, sub) {
        return '<span class="cmp-v cmp-v--' + who + (win === who ? ' is-win' : '') + '">' +
          '<b>' + (v == null ? '—' : esc(show(v))) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>';
      };
      var bar = '';
      if (o.bar !== false && a != null && b != null && a >= 0 && b >= 0 && a + b > 0) {
        var pa = Math.round(a / (a + b) * 1000) / 10;   // частка першого, % ширини шкали
        bar = '<span class="cmp-bar" aria-hidden="true">' +
          '<i class="cmp-bar__a' + (win === 'a' ? ' is-win' : '') + (win ? '' : ' is-neutral') + '" style="flex:' + pa + ' 1 0"></i>' +
          '<i class="cmp-bar__b' + (win === 'b' ? ' is-win' : '') + (win ? '' : ' is-neutral') + '" style="flex:' + (Math.round((100 - pa) * 10) / 10) + ' 1 0"></i></span>';
      }
      var sr = win === 'a' ? ', краще: ' + A.name : win === 'b' ? ', краще: ' + B.name : win === 'tie' ? ', порівну' : '';
      return '<div class="cmp-row' + (o.dir ? '' : ' is-info') + '" role="group" aria-label="' + esc(label + sr) + '">' +
        cell(a, 'a', o.subA) + '<span class="cmp-l">' + esc(label) + '</span>' + cell(b, 'b', o.subB) + bar + '</div>';
    }
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var pct1 = function (v) { return fmt1(v * 100) + '%'; };
    var diff = function (st) { return st.vsOpp ? st.vsOpp.mine - st.vsOpp.theirs : null; };
    var signed = function (v) { return (v > 0 ? '+' : '') + v; };

    // 1. Основне — те, що в 4 плитках картки
    var main = [
      row('Бали', A.points, B.points, { dir: 'high' }),
      row('Перемоги', A.cnt.w, B.cnt.w, { dir: 'high' }),
      row('Рибні нічиї', A.cnt.d, B.cnt.d, {}),
      row('Безрибні нічиї', A.cnt.z, B.cnt.z, {}),
      row('Поразки', A.cnt.l, B.cnt.l, { dir: 'low' }),
      row('Улов', A.fish, B.fish, { dir: 'high', subA: fishWord(A.fish), subB: fishWord(B.fish) }),
      row('Проти суперників', diff(A), diff(B), {
        dir: 'high', bar: false, fmt: signed,
        subA: A.vsOpp ? A.vsOpp.mine + ' : ' + A.vsOpp.theirs : '', subB: B.vsOpp ? B.vsOpp.mine + ' : ' + B.vsOpp.theirs : ''
      })
    ].join('');
    // 2. Статистика — як у блоці «Статистика» картки
    var stats = [
      row('Відсоток перемог', A.winRate, B.winRate, { dir: 'high', fmt: pct, subA: A.cnt.w + ' з ' + A.played, subB: B.cnt.w + ' з ' + B.played }),
      row('Середній улов за тур', A.avg, B.avg, { dir: 'high', fmt: fmt1 }),
      row('Частка від усієї риби', A.share, B.share, { dir: 'high', fmt: pct1 }),
      row('Найкращий тур', A.best ? A.best.fish : null, B.best ? B.best.fish : null, {
        dir: 'high', subA: A.best ? 'тур ' + A.best.n : '', subB: B.best ? 'тур ' + B.best.n : ''
      }),
      row('Найдовша серія перемог', A.streak, B.streak, { dir: 'high' }),
      row('Найуловистіший сектор', A.secBest ? A.secBest.sector : null, B.secBest ? B.secBest.sector : null, {
        bar: false, fmt: function (v) { return 'Сектор ' + v; },
        subA: A.secBest ? fmt1(A.secBest.avg) + ' за тур' : '', subB: B.secBest ? fmt1(B.secBest.avg) + ' за тур' : ''
      }),
      row('Найслабший сектор', A.secWorst ? A.secWorst.sector : null, B.secWorst ? B.secWorst.sector : null, {
        bar: false, fmt: function (v) { return 'Сектор ' + v; },
        subA: A.secWorst ? fmt1(A.secWorst.avg) + ' за тур' : '', subB: B.secWorst ? fmt1(B.secWorst.avg) + ' за тур' : ''
      })
    ].join('');

    // Підсумок: «рахунок» кращих показників і різниця в балах та улові
    var lead = score.a > score.b ? A : score.b > score.a ? B : null;
    var gap = [];
    if (A.points != null && B.points != null && A.points !== B.points) gap.push(Math.abs(A.points - B.points) + ' ' + plural(Math.abs(A.points - B.points), 'бал', 'бали', 'балів'));
    if (A.fish !== B.fish) gap.push(Math.abs(A.fish - B.fish) + ' ' + fishWord(Math.abs(A.fish - B.fish)));
    var sumTxt = lead
      ? esc(lead.name) + ' — краще у ' + Math.max(score.a, score.b) + ' з ' + score.n + ' ' + plural(score.n, 'показника', 'показників', 'показників')
      : 'Порівну: по ' + score.a + ' ' + plural(score.a, 'кращому показнику', 'кращих показники', 'кращих показників');
    // Примітка: показники ≠ місце. Якщо попереду за показниками той, хто нижче в таблиці, — кажемо, хто вище і чому
    var upper = A.place && B.place && A.place !== B.place ? (A.place < B.place ? A : B) : null;
    var noteTxt = 'Перевага в показниках не означає вищого місця: його вирішують бали за перемоги в турах.' +
      (lead && upper && lead !== upper ? ' Тому вище в таблиці — ' + esc(upper.name) + '.' : '');
    var I_INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>';
    var I_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

    // Особисті зустрічі: тури, де за жеребкуванням вони суперники (зіграні — з рахунком, майбутні — «ще попереду»)
    var meets = A.tours.filter(function (x) { return x.oppName && normName(x.oppName) === normName(B.name); });
    var h2h = '';
    if (meets.length) {
      var wa = 0, wb = 0;
      var DRAW = { d: 'рибна нічия', z: 'безрибна нічия' };
      var mrows = meets.map(function (x) {
        var bt = B.tours[x.n - 1] || {};
        var bf = x.oppFish != null ? x.oppFish : (bt.code ? bt.fish : null);
        var win = x.code === 'w' ? 'a' : x.code === 'l' ? 'b' : null;
        if (win === 'a') wa++; else if (win === 'b') wb++;
        var sec = x.sector ? 'сектор ' + x.sector : '';
        var sub = !x.code ? 'ще попереду' : DRAW[x.code] || '';
        var cell = function (v, who) {
          return '<span class="cmp-v cmp-v--' + who + (win === who ? ' is-win' : '') + '"><b>' + (v == null ? '—' : v) + '</b></span>';
        };
        var sr = !x.code ? ', ще попереду' : win ? ', переміг ' + (win === 'a' ? A.name : B.name) + ', ' + x.fish + ' : ' + bf : ', ' + DRAW[x.code] + ', ' + x.fish + ' : ' + bf;
        return '<div class="cmp-row cmp-meet' + (x.code ? '' : ' is-wait') + '" role="group" aria-label="' + esc('Тур ' + x.n + sr) + '">' +
          cell(x.code ? x.fish : null, 'a') +
          '<span class="cmp-l"><span class="cmp-meet__t">Тур ' + x.n + '</span>' +
            ([sec, sub].filter(Boolean).length ? '<small>' + esc([sec, sub].filter(Boolean).join(' · ')) + '</small>' : '') + '</span>' +
          cell(x.code ? bf : null, 'b') + '</div>';
      }).join('');
      var played = meets.filter(function (x) { return x.code; }).length;
      h2h = '<section class="card pc-block cmp-h2h"><h2 class="pc-h2">Особисті зустрічі' +
        (played > 1 ? '<span class="cmp-h2h__tally" aria-label="' + esc('Перемоги між собою ' + wa + ' : ' + wb) + '">' +
          '<b class="' + (wa > wb ? 'is-win' : '') + '">' + wa + '</b> : <b class="' + (wb > wa ? 'is-win' : '') + '">' + wb + '</b></span>' : '') +
        '</h2><div class="cmp-rows">' + mrows + '</div></section>';
    }

    pc.body.innerHTML =
      '<header class="pc-hero cmp-hero"><div class="pc-hero__bar">' +
        '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span class="l-m">Назад</span><span class="l-d">До підсумку</span></button></div>' +
        '<h1 class="visually-hidden" id="cmpTitle" tabindex="-1">Порівняння: ' + esc(A.name) + ' і ' + esc(B.name) + '</h1>' +
        '<div class="cmp-duel">' + side(A) + '<span class="cmp-vs" aria-hidden="true">VS</span>' + side(B) + '</div>' +
      '</header>' +
      '<div class="pc-sheet"><div class="cmp-wrap">' +
        '<section class="card pc-block cmp-sum" aria-label="Підсумок порівняння">' +
          '<div class="cmp-score" aria-hidden="true"><b class="' + (score.a > score.b ? 'is-win' : '') + '">' + score.a + '</b><span>:</span>' +
            '<b class="' + (score.b > score.a ? 'is-win' : '') + '">' + score.b + '</b></div>' +
          '<p class="cmp-sum__t">' + sumTxt + (score.tie ? ', порівну — ' + score.tie : '') + '</p>' +
          (gap.length ? '<p class="cmp-sum__s">Різниця: ' + esc(gap.join(' · ')) + '</p>' : '') +
          '<p class="cmp-sum__note">' + I_INFO + '<span>' + noteTxt + '</span></p>' +
        '</section>' + h2h +
        '<div class="cmp-cols">' +
          '<section class="card pc-block"><h2 class="pc-h2">Основне</h2><div class="cmp-rows">' + main + '</div></section>' +
          '<section class="card pc-block"><h2 class="pc-h2">Статистика</h2><div class="cmp-rows">' + stats + '</div></section>' +
        '</div>' +
      '</div></div>';

    var k = 'cmp:' + pair.join('|');
    if (countedCard !== k) {
      countedCard = k;
      countUp(pc.body.querySelectorAll('.cmp-v b, .cmp-score b'), 800);
      pc.body.classList.remove('cmp-anim'); void pc.body.offsetWidth; pc.body.classList.add('cmp-anim');
    }
  }
