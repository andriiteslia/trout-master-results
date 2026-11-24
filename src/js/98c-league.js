  // ===== Лідерборд сезону (розділ «Лідерборд»): payload.league з Code.gs — бали за фести, бонуси, рівні бали =====
  var LG = { all: false, sheet: null };
  var LG_SHOW = 15;   // на телефоні спершу стільки рядків, далі «Показати всіх»
  function leaguePayload() {
    var p = HOME.live ? HOME.live.payload : state.payload;
    return p && p.league && p.league.fests ? p.league : null;
  }
  function lgOrd(n) {   // 1-ше, 2-ге, 3-тє, 7-ме, 8-ме, інакше -те
    var t = n % 100, d = n % 10;
    if (t >= 11 && t <= 14) return n + '-те';
    return n + '-' + ({ 1: 'ше', 2: 'ге', 3: 'тє', 7: 'ме', 8: 'ме' }[d] || 'те');
  }
  function lgFestDate(f) { return String(f.subtitle || '').split('•')[0].trim(); }
  function lgPrizeHtml(lg) {
    return '<div class="lb-prize"><img class="lb-reel" src="assets/reel.webp?v=1" alt="" decoding="async">' +
      '<div><small>Головний приз сезону</small><b>Shimano Vanquish CE 2500S</b>' +
      '<span>Для тих, хто відвідав ' + lg.minFests + ' з ' + lg.fests.length + ' фестів</span></div></div>';
  }
  function lgRulesHtml() {
    var li = function (a, b) { return '<li><span>' + a + '</span><b>' + b + '</b></li>'; };
    return '<div class="lb-rules"><h3>Як рахуються бали</h3><ul>' +
      li('1-ше місце', '24') + li('2 · 3 · 4 · 5', '18 · 15 · 12 · 10') + li('6 · 7 · 8', '8 · 6 · 4') + li('9–10 · 11–12 · 13–15', '3 · 2 · 1') +
      li('Участь у фесті', '+10') + li('Найбільше риби', '+3') + li('Лідер після 4-го або 8-го туру', '+2') +
      li('Сторіс з відміткою', '+3') + li('Друг на фест (до 2)', '+2') +
      '</ul><p>Рівні бали: перемоги → риба за сезон → рибні нічиї.</p></div>';
  }
  function lgDots(lg, p) {
    return '<span class="lb-dots" aria-hidden="true">' + lg.fests.map(function (f) { return '<i' + (p.by[f.n] ? ' class="on"' : '') + '></i>'; }).join('') + '</span>';
  }
  function lgPlace(n) { return '<span class="lb-pl' + (n <= 3 ? ' g' + n : '') + '">' + n + '</span>'; }
  function leagueHtml() {
    var lg = leaguePayload();
    if (!lg) return null;
    var nF = lg.fests.length, rows = lg.rows || [];
    var meta = '<div class="lb-meta lb-cap"><span>' + (lg.played ? 'Після <b>' + lg.played + ' з ' + nF + '</b> фестів' : 'Сезон ще не почався') + '</span>' +
      (rows.length ? '<span>' + rows.length + ' ' + plural(rows.length, 'учасник', 'учасники', 'учасників') + '</span>' : '') + '</div>';
    var table;
    if (!rows.length) {
      table = '<div class="lb-card"><div class="lb-sticky">' + meta + '</div><div class="lb-empty">Таблиця з’явиться після першого фесту.</div></div>';
    } else {
      var head = '<div class="lb-head d-only" aria-hidden="true"><span>#</span><span></span><span>Учасник</span>' +
        lg.fests.map(function (f) { return '<span class="c">R' + f.n + '</span>'; }).join('') + '<span class="r">Бали</span></div>';
      var list = rows.map(function (p, i) {
        var fest = lg.fests.map(function (f) { var x = p.by[f.n]; return '<span class="lb-fe d-only' + (x ? '' : ' no') + '">' + (x ? x.total : '—') + '</span>'; }).join('');
        return '<button type="button" class="lb-row' + (i >= LG_SHOW && !LG.all ? ' is-more' : '') + '" data-lg="' + i + '" style="--nf:' + nF + '">' +
          lgPlace(p.place) + avatarHtml(p.name) +
          '<span class="lb-nm"><b>' + esc(p.name) + '</b><span>' + lgDots(lg, p) +
          '<i class="m-only">' + p.fests + ' з ' + nF + ' · </i>' + p.wins + ' В · ' + fmtNum(p.fish) + ' ' + plural(Math.round(p.fish), 'риба', 'риби', 'риб') + '</span></span>' +
          fest + '<span class="lb-pts"><b>' + p.total + '</b><small class="m-only">' + plural(p.total, 'бал', 'бали', 'балів') + '</small></span></button>';
      }).join('');
      var more = rows.length > LG_SHOW && !LG.all ? '<button type="button" class="lb-more m-only" data-lg-all>Показати всіх (' + rows.length + ')</button>' : '';
      table = '<div class="lb-card" style="--nf:' + nF + '"><div class="lb-sticky">' + meta + head + '</div>' + list + more + '</div>';
    }
    return '<div class="home__col home__col--wide"><div class="lbd"><div class="lbx"><div class="m-only">' + lgPrizeHtml(lg) + '</div>' + table + '</div>' +
      '<div class="lb-side d-only">' + lgPrizeHtml(lg) + lgRulesHtml() + '</div></div></div>';
  }

  // Аркуш гравця: розбивка балів по фестах
  function lgSheetEl() {
    if (LG.sheet) return LG.sheet;
    var el = document.createElement('div');
    el.className = 'mapsheet lbsheet';
    el.id = 'lbSheet';
    el.hidden = true;
    el.innerHTML = '<div class="mapsheet__bg" data-lg-close></div><div class="mapsheet__box" role="dialog" aria-modal="true"><div class="lbsheet__grip" aria-hidden="true"></div><div class="lbsheet__body"></div>' +
      '<button type="button" class="lbsheet__done" data-lg-close>Готово</button></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target.closest('[data-lg-close]')) closeLgSheet(); });
    LG.sheet = el;
    return el;
  }
  function openLgSheet(i) {
    var lg = leaguePayload(), p = lg && lg.rows[i];
    if (!p) return;
    var nF = lg.fests.length;
    var line = function (t, v, g) { return '<li' + (g ? ' class="g"' : '') + '><span>' + t + '</span><b>+' + v + '</b></li>'; };
    var fests = lg.fests.map(function (f) {
      var x = p.by[f.n], d = lgFestDate(f);
      var name = 'R' + f.n + (d ? ' · ' + esc(d) : '');
      if (!x) return '<div class="lb-fest no"><span>' + name + '</span><span>' + (f.played ? 'не брав участі' : 'ще попереду') + '</span></div>';
      return '<div class="lb-fest"><div class="lb-fest-h">' + name + '<span>' + x.total + ' ' + plural(x.total, 'бал', 'бали', 'балів') + '</span></div><ul>' +
        (x.pp ? line(lgOrd(x.place) + ' місце', x.pp) : '<li><span>' + lgOrd(x.place) + ' місце</span><b>0</b></li>') + line('Участь', x.part) +
        (x.fish ? line('Найбільше риби', x.fish, 1) : '') + (x.lead ? line('Лідер після туру', x.lead, 1) : '') +
        (x.story ? line('Сторіс', x.story, 1) : '') + (x.friends ? line('Друзі на фесті', x.friends, 1) : '') + '</ul></div>';
    }).join('');
    var el = lgSheetEl();
    el.querySelector('.lbsheet__body').innerHTML =
      '<div class="lbsheet__hd">' + avatarHtml(p.name) + '<div><b>' + esc(p.name) + '</b><span>' + lgOrd(p.place) + ' місце в лізі · ' + p.fests + ' з ' + nF + ' ' +
      plural(nF, 'фесту', 'фестів', 'фестів') + '</span></div><div class="lbsheet__tot"><b>' + p.total + '</b><span>' + plural(p.total, 'бал', 'бали', 'балів') + '</span></div></div>' +
      '<div class="lbsheet__kpi"><div><small>Перемоги</small><b>' + p.wins + '</b></div><div><small>Риба</small><b>' + fmtNum(p.fish) + '</b></div><div><small>РН</small><b>' + p.rn + '</b></div></div>' + fests;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-on'); });
  }
  function closeLgSheet() {
    var el = LG.sheet;
    if (!el || el.hidden) return;
    el.classList.remove('is-on');
    setTimeout(function () { el.hidden = true; }, REDUCED ? 0 : 280);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLgSheet(); });
  HOME.body.addEventListener('click', function (e) {
    if (e.target.closest('[data-lg-all]')) { LG.all = true; renderHome(); return; }
    var r = e.target.closest('[data-lg]');
    if (r) openLgSheet(parseInt(r.getAttribute('data-lg'), 10));
  });
