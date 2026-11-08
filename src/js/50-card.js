  // ===== src/js/50-card.js — Картка учасника: розрахунок статистики й рендер =====
  // ---------- Картка учасника ----------
  // Дані: жеребкування (payload.draw: сектор і суперник по турах) + аркуш «Тури»
  // (результат В/П/РН/БН і риба по турах, підсумок). Статистика рахується тут, з кожної публікації.
  var pc = {
    root: $('pcard'), body: $('pcBody'), back: $('pcBack'),
    open: $('cardOpen'), openText: $('cardOpenText')
  };
  var RES_CODES = { 'В': 'w', 'П': 'l', 'РН': 'd', 'БН': 'z' };
  var RES_TEXT = { w: 'Перемога', l: 'Поразка', d: 'Рибна нічия', z: 'Безрибна нічия' };
  function normName(v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function selectedPlayerName() {
    var k = Array.from(state.selected)[0];
    return k ? String(k).replace(/ #\d+$/, '') : null;
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; }
  function fmt1(v) { return (Math.round(v * 10) / 10).toString().replace('.', I18N.en ? '.' : ','); }
  function fishWord(n) { return plural(Math.round(n), 'риба', 'риби', 'риб'); }

  // Аркуш турів із публікації → { rounds, byName: { ім'я: {...} }, tourAvg: [...], totalFish, avgPerTour }
  var toursCache = { payload: null, data: null };
  function toursData() {
    var p = state.payload;
    if (toursCache.payload === p) return toursCache.data;
    var data = null;
    var sh = p && (p.sheets || []).find(function (x) { return (x.values || [])[0] && x.values[0].some(function (v) { return /^тур\s*1$/i.test(String(v).trim()); }); });
    if (sh) {
      var v = sh.values, top = v[0], sub = v[1] || [];
      var tourCols = [];
      top.forEach(function (h, c) { var m = String(h).trim().match(/^тур\s*(\d+)$/i); if (m) tourCols.push({ n: +m[1], c: c }); });
      var nameCol = -1;
      for (var c = 0; c < top.length; c++) if (/учасник/i.test(String(top[c]))) { nameCol = c; break; }
      if (nameCol < 0) nameCol = 1;
      var findSub = function (re) { for (var c = 0; c < sub.length; c++) if (re.test(String(sub[c]).trim())) return c; return -1; };
      var lastTour = tourCols.length ? tourCols[tourCols.length - 1].c + 1 : 0;
      var findSum = function (re) { for (var c = lastTour + 1; c < sub.length; c++) if (re.test(String(sub[c]).trim())) return c; return -1; };
      var col = { points: findSum(/^бали/i), place: findSum(/^місце/i), fish: findSum(/^риб/i) };
      var byName = {}, sums = tourCols.map(function () { return { fish: 0, n: 0 }; });
      v.slice(parseInt(sh.headerRows, 10) || 2).forEach(function (r) {
        var name = String(r[nameCol] || '').trim();
        if (!name) return;
        var tours = tourCols.map(function (tc, i) {
          var code = RES_CODES[String(r[tc.c] || '').trim().toUpperCase()] || null;
          var fish = code ? (num(r[tc.c + 1]) || 0) : null;
          if (code) { sums[i].fish += fish; sums[i].n++; }
          return { n: tc.n, code: code, fish: fish };
        });
        byName[normName(name)] = {
          name: name, tours: tours,
          points: col.points >= 0 ? num(r[col.points]) : null,
          place: col.place >= 0 ? num(r[col.place]) : null
        };
      });
      var totalFish = 0, totalN = 0;
      sums.forEach(function (x) { totalFish += x.fish; totalN += x.n; });
      data = {
        rounds: tourCols.length, byName: byName,
        tourAvg: sums.map(function (x) { return x.n ? x.fish / x.n : null; }),
        totalFish: totalFish, avgPerTour: totalN ? totalFish / totalN : null
      };
    }
    toursCache = { payload: p, data: data };
    return data;
  }
  function drawData() { var d = state.payload && state.payload.draw; return d && d.players ? d : null; }
  function drawPlayer(name) {
    var d = drawData(), key = normName(name);
    return d ? d.players.find(function (x) { return normName(x.name) === key; }) || null : null;
  }
  function hasCardData(name) {
    var t = toursData();
    return !!drawPlayer(name) || !!(t && t.byName[normName(name)]);
  }

  // Сектори по всьому турніру: середній улов на одного учасника за тур у кожному секторі
  var secCache = { payload: null, data: null };
  function tournamentSectors() {
    if (secCache.payload === state.payload) return secCache.data;
    var t = toursData(), d = drawData(), list = null;
    if (t && d) {
      var acc = {};
      d.players.forEach(function (pl) {
        var me = t.byName[normName(pl.name)];
        if (!me) return;
        pl.t.forEach(function (x, i) {
          var r = me.tours[i];
          if (!x[0] || !r || !r.code) return;
          var a = acc[x[0]] || (acc[x[0]] = { sector: x[0], fish: 0, n: 0 });
          a.fish += r.fish; a.n++;
        });
      });
      list = Object.keys(acc).map(function (k) { var a = acc[k]; return { sector: a.sector, avg: a.fish / a.n, fish: a.fish, n: a.n }; });
      list.sort(function (a, b) { return b.avg - a.avg || a.sector - b.sector; });
      if (list.length < 2) list = null;
    }
    secCache = { payload: state.payload, data: list };
    return list;
  }

  // Усе для картки одного гравця
  function playerStats(name) {
    var t = toursData(), d = drawData();
    var me = t ? t.byName[normName(name)] : null;
    var dp = drawPlayer(name);
    var byNum = {};
    if (d) d.players.forEach(function (x) { byNum[x.n] = x; });
    var rounds = Math.max(me ? me.tours.length : 0, dp ? dp.t.length : 0);
    var tours = [];
    for (var i = 0; i < rounds; i++) {
      var res = me && me.tours[i] ? me.tours[i] : { n: i + 1, code: null, fish: null };
      var dr = dp && dp.t[i] ? dp.t[i] : [null, null];
      var opp = dr[1] && byNum[dr[1]] ? byNum[dr[1]] : null;
      var oppRes = opp && t && t.byName[normName(opp.name)] ? t.byName[normName(opp.name)].tours[i] : null;
      tours.push({
        n: i + 1, sector: dr[0], oppNum: dr[1], oppName: opp ? opp.name : null,
        code: res.code, fish: res.fish,
        oppFish: res.code && oppRes && oppRes.code ? oppRes.fish : null,
        avg: t ? t.tourAvg[i] : null
      });
    }
    var played = tours.filter(function (x) { return x.code; });
    var cnt = { w: 0, d: 0, z: 0, l: 0 };
    played.forEach(function (x) { cnt[x.code]++; });
    var fish = played.reduce(function (a, x) { return a + x.fish; }, 0);
    var streak = 0, cur = 0;
    played.forEach(function (x) { cur = x.code === 'w' ? cur + 1 : 0; if (cur > streak) streak = cur; });
    var best = null;
    played.forEach(function (x) { if (!best || x.fish > best.fish) best = x; });
    // Сектори: середній улов у кожному секторі, де гравець уже рибалив
    var sec = {};
    played.forEach(function (x) { if (!x.sector) return; (sec[x.sector] = sec[x.sector] || []).push(x); });
    var secList = Object.keys(sec).map(function (k) {
      var arr = sec[k], sum = arr.reduce(function (a, x) { return a + x.fish; }, 0);
      return { sector: +k, avg: sum / arr.length, times: arr.length, tours: arr.map(function (x) { return x.n; }) };
    });
    secList.sort(function (a, b) { return b.avg - a.avg || a.sector - b.sector; });
    var meet = { w: [], d: [], z: [], l: [] };
    played.forEach(function (x) { if (x.oppName) meet[x.code].push(x); });
    return {
      name: me ? me.name : (dp ? dp.name : name), num: dp ? dp.n : null, side: dp ? dp.side : '',
      tours: tours, played: played.length, cnt: cnt, fish: fish,
      points: me ? me.points : null, place: me ? me.place : null,
      winRate: played.length ? cnt.w / played.length : null,
      avg: played.length ? fish / played.length : null,
      tAvg: t ? t.avgPerTour : null,
      share: t && t.totalFish ? fish / t.totalFish : null, totalFish: t ? t.totalFish : 0,
      best: best, streak: streak,
      secBest: secList.length > 1 ? secList[0] : null, secWorst: secList.length > 1 ? secList[secList.length - 1] : null,
      meet: meet, hasResults: !!me, hasDraw: !!dp,
      vsOpp: (function () {
        var mine = 0, theirs = 0, n = 0;
        played.forEach(function (x) { if (x.oppFish != null) { mine += x.fish; theirs += x.oppFish; n++; } });
        return n ? { mine: mine, theirs: theirs, n: n } : null;
      })(),
      nextTour: tours.find(function (x) { return !x.code; }) || null
    };
  }

  // Сусіди в заліку для кнопок «‹ ›» у картці
  function cardOrder() {
    var s = standingsRows();
    var list = s ? s.rows.map(function (r) { return { key: r.key, name: r.name }; }) : [];
    if (!list.length) { var t = toursData(); if (t) list = Object.keys(t.byName).map(function (k) { return { key: t.byName[k].name, name: t.byName[k].name }; }); }
    return list.filter(function (x) { return hasCardData(x.name); });
  }
  function cardNav(name) {
    var list = cardOrder(), i = -1;
    list.forEach(function (x, j) { if (normName(x.name) === normName(name)) i = j; });
    return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
  }
  function cardPlayersCount() {
    var s = standingsRows();
    if (s) return s.rows.length;
    var t = toursData();
    return t ? Object.keys(t.byName).length : 0;
  }
