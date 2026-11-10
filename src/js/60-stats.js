  // ===== src/js/60-stats.js — Статистика турніру, карта водойми, карта секторів =====
  // ---------- Таблиця по ходу турніру й статистика турніру ----------
  var POINTS = { w: 3, d: 2, z: 1, l: 0 };   // В — 3, РН — 2, БН — 1, П — 0

  // Місце кожного учасника після кожного туру: бали (3/2/1/0), далі кількість перемог, далі улов; повна рівність — одне місце
  var standCache = { payload: null, data: null };
  function standings() {
    if (standCache.payload === state.payload) return standCache.data;
    var t = toursData(), out = null;
    if (t) {
      var names = Object.keys(t.byName);
      var acc = {};
      names.forEach(function (k) { acc[k] = { p: 0, w: 0, f: 0 }; });
      out = { byName: {}, rounds: t.rounds };
      names.forEach(function (k) { out.byName[k] = []; });
      for (var i = 0; i < t.rounds; i++) {
        var anyPlayed = false;
        names.forEach(function (k) {
          var r = t.byName[k].tours[i];
          if (r && r.code) { acc[k].p += POINTS[r.code]; acc[k].f += r.fish; if (r.code === 'w') acc[k].w++; anyPlayed = true; }
        });
        if (!anyPlayed) break;
        var order = names.slice().sort(function (a, b) { return acc[b].p - acc[a].p || acc[b].w - acc[a].w || acc[b].f - acc[a].f; });
        var place = 0, prev = null;
        order.forEach(function (k, idx) {
          if (!prev || acc[k].p !== acc[prev].p || acc[k].w !== acc[prev].w || acc[k].f !== acc[prev].f) place = idx + 1;
          out.byName[k].push(place);
          prev = k;
        });
      }
    }
    // Остання точка — офіційне місце з таблиці (там можуть бути додаткові правила для повної рівності)
    if (out) Object.keys(out.byName).forEach(function (k) {
      var arr = out.byName[k], official = t.byName[k].place;
      if (arr.length && official > 0) arr[arr.length - 1] = official;
    });
    standCache = { payload: state.payload, data: out };
    return out;
  }

  // Статистика всього турніру
  var tsCache = { payload: null, data: null };
  function tournamentStats() {
    if (tsCache.payload === state.payload) return tsCache.data;
    var t = toursData(), d = drawData(), data = null;
    if (t) {
      var names = Object.keys(t.byName);
      var played = [], totals = [], cnt = { w: 0, l: 0, d: 0, z: 0 }, entries = 0;
      for (var i = 0; i < t.rounds; i++) {
        var f = 0, n = 0;
        names.forEach(function (k) { var r = t.byName[k].tours[i]; if (r && r.code) { f += r.fish; n++; cnt[r.code]++; entries++; } });
        totals.push(n ? { fish: f, n: n, avg: f / n } : null);
        if (n) played.push(i);
      }
      if (played.length) {
        // Рекорди
        var bestCatch = null, streak = null, dry = null, fishTop = [];
        var byNum = {};
        if (d) d.players.forEach(function (x) { byNum[normName(x.name)] = x; });
        names.forEach(function (k) {
          var me = t.byName[k], dp = byNum[k];
          var cur = 0, best = 0, dryN = 0, fishSum = 0;
          me.tours.forEach(function (r, i) {
            if (!r.code) { cur = 0; return; }
            fishSum += r.fish;
            var hit = { name: me.name, tour: i + 1, sector: dp && dp.t[i] ? dp.t[i][0] : null };
            if (!bestCatch || r.fish > bestCatch.fish) bestCatch = { fish: r.fish, who: [hit] };
            else if (r.fish === bestCatch.fish) bestCatch.who.push(hit);
            cur = r.code === 'w' ? cur + 1 : 0;
            if (cur > best) best = cur;
            // «Суха» перемога: суперник не спіймав нічого
            if (r.code === 'w' && dp && dp.t[i] && dp.t[i][1]) {
              var opp = d.players.find(function (x) { return x.n === dp.t[i][1]; });
              var orow = opp && t.byName[normName(opp.name)];
              var or = orow && orow.tours[i];
              if (or && or.code && or.fish === 0) dryN++;
            }
          });
          if (best && (!streak || best > streak.n)) streak = { n: best, who: [me.name] };
          else if (best && streak && best === streak.n) streak.who.push(me.name);
          if (dryN && (!dry || dryN > dry.n)) dry = { n: dryN, who: [me.name] };
          else if (dryN && dry && dryN === dry.n) dry.who.push(me.name);
          fishTop.push({ name: me.name, fish: fishSum, place: me.place });
        });
        fishTop.sort(function (a, b) { return b.fish - a.fish || (a.place || 99) - (b.place || 99); });
        // Карта секторів: улов у кожному секторі в кожному турі (обидва береги разом)
        var heat = null;
        if (d) {
          var sectors = {};
          d.players.forEach(function (pl) {
            var me = t.byName[normName(pl.name)];
            pl.t.forEach(function (x, i) {
              if (!x[0]) return;
              var row = sectors[x[0]] || (sectors[x[0]] = { sector: x[0], cells: [], fish: 0, n: 0 });
              var r = me && me.tours[i];
              if (r && r.code) {
                row.cells[i] = (row.cells[i] || 0) + r.fish;
                row.fish += r.fish; row.n++;
              }
            });
          });
          // Скільки секторів на водоймі — з аркуша «Сайт» (B13); якщо не вказано — найбільший номер із жеребкування.
          // Сектори без жодного туру теж показуємо (порожні), щоб карта відповідала водоймі.
          var secN = +(state.payload && state.payload.sectors) || 0;
          for (var sk = 1; sk <= secN; sk++) if (!sectors[sk]) sectors[sk] = { sector: sk, cells: [], fish: 0, n: 0 };
          var list = Object.keys(sectors).map(function (k) { var r = sectors[k]; r.avg = r.n ? r.fish / r.n : null; return r; });
          list.sort(function (a, b) { return a.sector - b.sector; });
          var max = 0;
          list.forEach(function (r) { r.cells.forEach(function (v) { if (v > max) max = v; }); });
          heat = { rows: list, max: max };
        }
        data = {
          rounds: t.rounds, played: played.length, players: names.length,
          totals: totals, totalFish: t.totalFish, avg: t.avgPerTour,
          cnt: cnt, entries: entries,
          battles: Math.round(entries / 2), battlesPlanned: Math.floor(names.length / 2) * t.rounds,
          bestCatch: bestCatch, streak: streak, dry: dry, fishTop: fishTop.slice(0, 5), heat: heat
        };
      }
    }
    tsCache = { payload: state.payload, data: data };
    return data;
  }
  // Дві колонки (ліва L, права R) — на широкому екрані; на вузькому одна, порядок за номером o
  function twoCols(L, R) {
    function col(items) {
      return '<div class="pc-col">' + items.map(function (x) { return '<div class="pc-cell" style="order:' + x[0] + '">' + x[1] + '</div>'; }).join('') + '</div>';
    }
    return '<div class="pc-cols' + (R.length ? '' : ' is-single') + '">' + col(L) + col(R) + '</div>';
  }

  function statsReady() { return !!tournamentStats(); }

  var ts = { root: $('tstats'), body: $('tsBody'), back: $('tsBack'), open: $('statsOpen') };

  function renderStats() {
    if (state.rulesOpen) { renderRules(); return; }   // «Положення» живе в контейнері статистики (той самий вигляд і «Назад»)
    var S = tournamentStats();
    var ev = (state.payload && state.payload.event) || {};
    document.title = 'Статистика | Trout Master';
    if (!S) { ts.body.innerHTML = emptyState('Статистики поки немає', 'Вона з’явиться після перших зіграних турів.'); return; }
    var sub = [S.players + ' ' + plural(S.players, 'учасник', 'учасники', 'учасників'),
      S.played < S.rounds ? 'після ' + S.played + ' з ' + S.rounds + ' турів' : 'усі ' + S.rounds + ' турів'];
    var best = null;
    (S.totals || []).forEach(function (x, i) { if (x && (!best || x.fish > best.fish)) best = { n: i + 1, fish: x.fish }; });
    var I_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    var I_TABLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 14.5h18M9 9.5V20"/></svg>';
    var h = '<header class="pc-hero ts-hero"><div class="pc-hero__bar m-only">' +
      '<button type="button" class="hero-back pc-back" data-act="back">' + I_BACK + '<span>' + (isListMode() ? 'Учасники' : 'Підсумок') + '</span></button></div>' +
      '<div class="ts-hero__main"><div class="pc-head__txt"><h1 class="title" id="tsTitle" tabindex="-1">Статистика</h1>' +
      '<p class="pc-sub">' + esc([ev.title].concat(sub).filter(Boolean).join(' · ')) + '</p></div>' +
      '<button type="button" class="btn2 btn2-dark d-only" data-act="back">' + I_TABLE + '<span>Результати</span></button></div>' +
      '<div class="kpis kpis--2">' +
        kpi('d-only', 'Турів зіграно', 'Турів', S.played + ' <small>/ ' + S.rounds + '</small>') +
        kpi('', 'Батлів зіграно', 'Батлів', S.battles + ' <small>/ ' + S.battlesPlanned + '</small>') +
        kpi('', 'Усього риби', 'Усього риби', fmtInt(S.totalFish)) +
        kpi('', 'Середній улов', 'Середній улов', fmt1(S.avg) + ' <small class="l-d">на учасника за тур</small>') +
        (best ? kpi('m-only', 'Найкращий тур', 'Найкращий тур', best.n + ' <small>· ' + best.fish + ' ' + fishWord(best.fish) + '</small>') : '') +
      '</div></header><div class="pc-sheet">';

    // На широкому екрані — дві колонки; на телефоні — одна, у порядку o (CSS order)
    var L = [], R = [];

    // Улов по турах
    L.push([2, '<section class="card pc-block"><h2 class="pc-h2">Улов по турах</h2>' + tourBars(S) +
      '<p class="pc-legend">Скільки риби спіймали всі учасники за тур</p></section>']);

    // Як змінювались місця (графік зі слайдером) — після улову, перед картою водойми
    var bh = bumpHtml();
    if (bh) L.push([2, bh]);

    // Карта водойми і карта секторів
    if (S.heat && S.heat.rows.length) {
      L.push([3, '<div id="pondWrap">' + pondHtml(S) + '</div>']);
      R.push([4, heatHtml(S)]);
    }

    // Рекорди
    var rec = [];
    if (S.bestCatch) rec.push(recRow('Найбільший улов за тур', S.bestCatch.fish + ' ' + fishWord(S.bestCatch.fish),
      S.bestCatch.who.map(function (x) { return [x.name, 'тур ' + x.tour + (x.sector ? ', сектор ' + x.sector : '')]; })));
    if (S.streak) rec.push(recRow('Найдовша серія перемог', S.streak.n + ' ' + plural(S.streak.n, 'тур', 'тури', 'турів') + ' поспіль',
      S.streak.who.map(function (n) { return [n, '']; })));
    if (S.dry) rec.push(recRow('Найбільше «сухих» перемог', S.dry.n + ' ' + plural(S.dry.n, 'перемога', 'перемоги', 'перемог'),
      S.dry.who.map(function (n) { return [n, '']; }), 'суперник не спіймав жодної риби'));
    if (rec.length) R.push([5, '<section class="card pc-block"><h2 class="pc-h2">Рекорди</h2><dl class="pc-stats">' + rec.join('') + '</dl></section>']);

    // Топ за уловом
    L.push([6, '<section class="card pc-block"><h2 class="pc-h2">Топ за уловом</h2><ol class="ts-top">' +
      S.fishTop.map(function (x, i) {
        return '<li><span class="ts-top__n">' + (i + 1) + '</span><span class="ts-top__name">' + esc(x.name) + '</span>' +
          '<span class="ts-top__fish">' + x.fish + ' <small>' + fishWord(x.fish) + '</small></span>' +
          (x.place ? '<span class="ts-top__place">' + x.place + ' місце</span>' : '') + '</li>';
      }).join('') + '</ol><p class="pc-legend">Поруч — місце за балами</p></section>']);

    // Частки результатів
    var parts = [['w', 'Перемоги'], ['l', 'Поразки'], ['d', 'Рибні нічиї'], ['z', 'Безрибні нічиї']];
    R.push([7, '<section class="card pc-block"><h2 class="pc-h2">Результати турів</h2>' +
      '<p class="pc-legend ts-share__note">' + S.battles + ' ' + plural(S.battles, 'батл', 'батли', 'батлів') + ': у кожному один учасник виграє, а другий програє, або обидва грають унічию</p>' +
      '<div class="ts-share" role="img" aria-label="' +
      parts.map(function (p) { return p[1] + ' ' + pct(S.cnt[p[0]]); }).join(', ') + '">' +
      parts.map(function (p) { return S.cnt[p[0]] ? '<span class="ts-share__seg seg-' + p[0] + '" style="flex:' + S.cnt[p[0]] + '"></span>' : ''; }).join('') +
      '</div><ul class="ts-share__legend">' +
      parts.map(function (p) { return '<li><span class="sw seg-' + p[0] + '"></span>' + p[1] + ' <b>' + pct(S.cnt[p[0]]) + '</b> <small>(' + S.cnt[p[0]] + ')</small></li>'; }).join('') +
      '</ul></section>']);

    ts.body.innerHTML = h + twoCols(L, R) + '</div>';
    bumpInit();
    if (!grownStats && state.view === 'stats') { grownStats = true; growCharts(ts.body); }

    function pct(n) { return S.entries ? Math.round(n / S.entries * 100) + '%' : '—'; }
    function tsTile(label, valHtml) {
      return '<div class="pc-tile"><span class="pc-tile__label">' + label + '</span><span class="pc-tile__val">' + valHtml + '</span></div>';
    }
    // Рекорд: значення і всі, хто його має
    function recRow(k, v, who, note) {
      return '<div class="pc-stat ts-rec"><dt>' + k + '</dt><dd><b>' + esc(v) + '</b>' +
        (note ? '<span>' + esc(note) + '</span>' : '') +
        '<ul class="ts-who">' + who.map(function (w) {
          return '<li><span class="ts-who__n">' + esc(w[0]) + '</span>' + (w[1] ? '<span class="ts-who__m">' + esc(w[1]) + '</span>' : '') + '</li>';
        }).join('') + '</ul></dd></div>';
    }
  }

  function tourBars(S) {
    var n = S.rounds, W = 320, H = 130, top = 14, bottom = 22, gap = 4, max = 1;
    S.totals.forEach(function (x) { if (x && x.fish > max) max = x.fish; });
    var bw = (W - gap * (n - 1)) / n, ph = H - top - bottom;
    var out = '<svg class="pc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Улов по турах">' +
      '<line x1="0" x2="' + W + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" class="ax"/>';
    S.totals.forEach(function (x, i) {
      var x0 = i * (bw + gap);
      if (x) {
        var hh = Math.max(x.fish > 0 ? 2 : 0, x.fish / max * ph);
        out += '<rect x="' + x0 + '" y="' + (top + ph - hh) + '" width="' + bw + '" height="' + hh + '" rx="2" class="bar-t"><title>Тур ' + (i + 1) + ': ' + x.fish + '</title></rect>' +
          '<text x="' + (x0 + bw / 2) + '" y="' + (top + ph - hh - 3) + '" class="val">' + x.fish + '</text>';
      } else {
        out += '<rect x="' + (x0 + 0.5) + '" y="' + (top + ph - 8) + '" width="' + (bw - 1) + '" height="8" rx="2" class="bar-wait"/>';
      }
      out += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 6) + '" class="lbl">' + (i + 1) + '</text>';
    });
    return out + '</svg>';
  }

  // Карта секторів: рядок — сектор, колонка — тур; колір — скільки риби спіймали в секторі за тур
  function heatHtml(S) {
    var max = S.heat.max || 1;
    var bestAvg = -1, worstAvg = Infinity;
    S.heat.rows.forEach(function (r) { if (r.avg != null) { if (r.avg > bestAvg) bestAvg = r.avg; if (r.avg < worstAvg) worstAvg = r.avg; } });
    var head = '<div class="hm-row hm-axis"><span></span><span class="hm-axis__t" style="grid-column: 2 / span ' + S.rounds + '">Тури →</span><span></span></div>' +
      '<div class="hm-row hm-head"><span class="hm-sec hm-sec--h" title="Сектор">Сек.</span>';
    for (var i = 0; i < S.rounds; i++) head += '<span class="hm-cell hm-th">' + (i + 1) + '</span>';
    head += '<span class="hm-avg">Сер.</span></div>';
    var rows = S.heat.rows.map(function (r) {
      var cells = '';
      for (var i = 0; i < S.rounds; i++) {
        var v = r.cells[i];
        if (v == null) { cells += '<span class="hm-cell hm-empty"></span>'; continue; }
        var k = v / max;
        var bg = heatColor(k);
        cells += '<span class="hm-cell" style="background:' + bg + ';color:' + (k > 0.55 ? '#fff' : 'var(--text)') + '" title="Сектор ' + r.sector + ', тур ' + (i + 1) + ': ' + v + '">' + v + '</span>';
      }
      var mark = r.avg === bestAvg ? ' hm-best' : r.avg === worstAvg ? ' hm-worst' : '';
      return '<div class="hm-row"><span class="hm-sec"><span class="hm-sec__b">' + r.sector + '</span></span>' + cells +
        '<span class="hm-avg' + mark + '">' + (r.avg != null ? r.avg.toFixed(1).replace('.', ',') : '—') + '</span></div>';
    }).join('');
    return '<section class="card pc-block"><h2 class="pc-h2">Карта секторів</h2>' +
      '<p class="pc-legend hm-note"><b>Рядок — сектор, колонка — тур.</b> У клітинці — скільки риби спіймали в цьому секторі за тур (обидва береги разом). «Сер.» — середній улов на учасника за тур у секторі.</p>' +
      '<div class="hm" style="--hm-n:' + S.rounds + '" role="img" aria-label="Карта секторів: улов по секторах і турах">' + head + rows + '</div>' +
      '<div class="hm-scale"><span>мало</span><i style="background:linear-gradient(90deg,' + heatColor(0) + ',' + heatColor(0.5) + ',' + heatColor(1) + ')"></i><span>багато</span></div></section>';
  }
  // Карта водойми: сектори по колу — 1…N/2 нижнім берегом зліва направо, далі верхнім справа наліво.
  // Колір — середній улов на учасника за тур (або улов у вибраному турі).
  state.pondTour = 'all';
  function pondHtml(S) {
    var rows = S.heat.rows, bySec = {};
    rows.forEach(function (r) { bySec[r.sector] = r; });
    // Секторів на водоймі: з аркуша «Сайт» або найбільший номер у жеребкуванні; на кожному березі — половина
    var N = Math.max(+(state.payload && state.payload.sectors) || 0, rows.reduce(function (m, r) { return Math.max(m, r.sector); }, 0));
    var half = Math.ceil(N / 2);
    // «14 (6, 8)» на аркуші «Сайт»: верхній берег 6, нижній 8 (нумерація та сама — по колу від нижнього лівого)
    var split = state.payload && state.payload.sectorsSplit;
    if (split && +split[0] + +split[1] === N) half = +split[1];
    var cols = Math.max(half, N - half);
    var tour = state.pondTour;
    if (tour !== 'all' && !S.totals[tour]) tour = state.pondTour = 'all';
    var val = function (r) {
      if (!r) return null;
      if (tour === 'all') return r.avg;
      var v = r.cells[tour];
      return v == null ? null : v;
    };
    var max = 0, min = Infinity;
    for (var s1 = 1; s1 <= N; s1++) { var v1 = val(bySec[s1]); if (v1 != null) { max = Math.max(max, v1); min = Math.min(min, v1); } }
    var fmtV = function (v) { return tour === 'all' ? v.toFixed(1).replace('.', ',') : String(v); };
    var tile = function (sec) {
      var r = bySec[sec], v = val(r);
      if (v == null) return '<div class="pond-sec is-empty"><b>' + sec + '</b><span>—</span></div>';
      var k = max > min ? (v - min) / (max - min) : 0.5;
      var light = k > 0.55;
      var tag = v === max && max > min ? ' is-top' : v === min && max > min ? ' is-low' : '';
      return '<div class="pond-sec' + tag + '" style="background:' + heatColor(k) + ';color:' + (light ? '#fff' : 'var(--text)') + '" title="Сектор ' + sec + ': ' + fmtV(v) + '">' +
        '<b>' + sec + '</b><span>' + fmtV(v) + '</span></div>';
    };
    var top = '', bottom = '';
    for (var i = N; i > half; i--) top += tile(i);         // верхній берег: N … half+1 зліва направо
    for (var j = 1; j <= half; j++) bottom += tile(j);     // нижній берег: 1 … half
    var chips = '<button type="button" class="pond-chip" data-pond="all" aria-pressed="' + (tour === 'all') + '">Усі тури</button>' +
      S.totals.map(function (x, i) {
        return '<button type="button" class="pond-chip" data-pond="' + i + '" aria-pressed="' + (tour === i) + '"' + (x ? '' : ' disabled') + '>' + (i + 1) + '</button>';
      }).join('');
    var caption = tour === 'all'
      ? 'Колір і число — середній улов на учасника за тур у секторі за весь турнір.'
      : 'Тур ' + (tour + 1) + ': скільки риби спіймали в секторі (обидва учасники разом).';
    return '<section class="card pc-block"><h2 class="pc-h2">Карта водойми</h2>' +
      '<div class="pond-chips" role="group" aria-label="Тур для карти">' + chips + '</div>' +
      '<div class="pond" style="--pond-n:' + cols + '" role="img" aria-label="Карта водойми: ' + caption + '">' +
        '<div class="pond-row pond-row--top">' + top + '</div>' +
        '<div class="pond-water"><span>водойма</span></div>' +
        '<div class="pond-row">' + bottom + '</div>' +
      '</div><p class="pc-legend">' + caption + ' <span class="pond-key"><i class="is-top"></i>найкращий <i class="is-low"></i>найслабший</span></p></section>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-pond]');
    if (!b || b.disabled) return;
    var v = b.getAttribute('data-pond');
    state.pondTour = v === 'all' ? 'all' : +v;
    var wrap = document.getElementById('pondWrap'), S = tournamentStats();
    if (wrap && S && S.heat) {
      wrap.innerHTML = pondHtml(S);
      var cur = wrap.querySelector('[data-pond="' + v + '"]');
      if (cur) cur.focus();
    }
  });

  // Від світло-блакитного до насиченого синього
  function heatColor(k) {
    k = Math.max(0, Math.min(1, k));
    var a = [238, 246, 252], b = [111, 168, 220], c = [13, 63, 107];
    var from = k < 0.5 ? a : b, to = k < 0.5 ? b : c, t = k < 0.5 ? k * 2 : (k - 0.5) * 2;
    return 'rgb(' + from.map(function (v, i) { return Math.round(v + (to[i] - v) * t); }).join(',') + ')';
  }

  // Графік місця по турах (1 — угорі)
  function placeSvg(places, players) {
    var n = places.length, W = 320, H = 130, top = 12, bottom = 22, left = 22, right = 8, pad = 10;
    var maxP = Math.max(players, 2);
    var x = function (i) { return left + pad + (n > 1 ? i * (W - left - right - pad) / (n - 1) : (W - left - right - pad) / 2); };
    var y = function (p) { return top + (p - 1) / (maxP - 1) * (H - top - bottom); };
    var out = '<svg class="pc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Місце після кожного туру: ' + places.join(', ') + '">';
    [1, Math.ceil(maxP / 2), maxP].forEach(function (p) {
      out += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(p) + '" y2="' + y(p) + '" class="grid"/>' +
        '<text x="' + (left - 6) + '" y="' + (y(p) + 3) + '" class="lbl lbl-y">' + p + '</text>';
    });
    out += '<polyline points="' + places.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p).toFixed(1); }).join(' ') + '" class="place-line"/>';
    places.forEach(function (p, i) {
      out += '<circle cx="' + x(i) + '" cy="' + y(p) + '" r="3" class="place-dot"><title>Після туру ' + (i + 1) + ': ' + p + ' місце</title></circle>' +
        '<text x="' + x(i) + '" y="' + (y(p) - 7) + '" class="val' + (i === n - 1 ? ' val-last' : '') + '">' + p + '</text>' +
        '<text x="' + x(i) + '" y="' + (H - 6) + '" class="lbl">' + (i + 1) + '</text>';
    });
    return out + '</svg>';
  }

  // Стовпчики улову по турах + точки середнього улову в турі
  function chartSvg(st) {
    var n = st.tours.length, W = 320, H = 130, top = 14, bottom = 22, gap = 4;
    var max = 1;
    st.tours.forEach(function (x) { if (x.fish > max) max = x.fish; if (x.avg > max) max = x.avg; });
    var bw = (W - gap * (n - 1)) / n, ph = H - top - bottom;
    var y = function (v) { return top + ph - (v / max) * ph; };
    var out = '<svg class="pc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Улов по турах">';
    out += '<line x1="0" x2="' + W + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" class="ax"/>';
    st.tours.forEach(function (x, i) {
      var x0 = i * (bw + gap);
      if (x.code) {
        var hh = Math.max(x.fish > 0 ? 2 : 0, (x.fish / max) * ph);
        out += '<rect x="' + x0 + '" y="' + (top + ph - hh) + '" width="' + bw + '" height="' + hh + '" rx="2" class="bar bar-' + x.code + '"><title>Тур ' + x.n + ': ' + x.fish + '</title></rect>';
        out += '<text x="' + (x0 + bw / 2) + '" y="' + (top + ph - hh - 3) + '" class="val">' + x.fish + '</text>';
      } else {
        out += '<rect x="' + (x0 + 0.5) + '" y="' + (top + ph - 8) + '" width="' + (bw - 1) + '" height="8" rx="2" class="bar-wait"/>';
      }
      out += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 6) + '" class="lbl">' + x.n + '</text>';
    });
    // Середній улов у турі — лінія через усі зіграні тури (по центру стовпчиків)
    var pts = [];
    st.tours.forEach(function (x, i) {
      if (x.code && x.avg != null) pts.push((i * (bw + gap) + bw / 2).toFixed(1) + ',' + y(x.avg).toFixed(1));
    });
    if (pts.length > 1) out += '<polyline points="' + pts.join(' ') + '" class="avg-line"/>';
    else if (pts.length === 1) {
      var c = pts[0].split(',');
      out += '<line x1="' + (+c[0] - bw / 2) + '" x2="' + (+c[0] + bw / 2) + '" y1="' + c[1] + '" y2="' + c[1] + '" class="avg-line"/>';
    }
    return out + '</svg>';
  }

  var PREFIX = '+380 ';
  state.view = 'list';
  state.regDone = null;      // { name, number } після успішної реєстрації
  state.regTried = false;    // показувати помилки під час введення лише після першої спроби
  state.regSending = false;
  state.regPushed = false;
  state.focusKey = null;

  function regDeadline() {
    var d = state.payload && state.payload.regDeadline ? new Date(state.payload.regDeadline) : null;
    return d && !isNaN(d) ? d : null;
  }
  function regOpenNow() {
    if (!(state.payload && state.payload.registration === true)) return false;
    var d = regDeadline();
    return !d || Date.now() < d.getTime();
  }

