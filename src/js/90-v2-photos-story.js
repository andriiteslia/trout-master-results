  // ===== src/js/90-v2-photos-story.js — Новий дизайн: фото учасників, картинка-сторіс =====
  // ================= Новий дизайн: шапка, плитки, таблиці =================
  var v2 = {
    hero: $('hero'), pill: $('heroPill'), kpis: $('kpis'), share: $('shareBtn'),
    heroStats: $('heroStats'), heroReg: $('heroReg'), topnav: $('topnav'), navList: $('navList'), navStats: $('navStats'),
    bcard: $('bcard'), bTitle: $('boardTitle'), bSub: $('boardSub'), legend: $('legend'), search: $('search'), searchBox: $('searchBox'),
    selbar: $('selbar'), selPlace: $('selPlace'), selName: $('selName'), selCard: $('selCard'), selClear: $('selClear'), selLbl: $('selLbl'), selPlace2: $('selPlace2'), selCardText: $('selCardText'),
    side: $('side'), toast: $('toast')
  };
  var SHARE_URL = 'https://t.me/troutmasterua_bot?startapp';
  var WEB_URL = 'https://troutmaster.app/';
  // У Telegram ділимось посиланням на Mini App, у браузері — на сайт (картка: …?startapp=p9 / …/#p9)
  function shareUrl(n) {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initData) return n ? SHARE_URL + '=p' + n : SHARE_URL;
    return n ? WEB_URL + '#p' + n : WEB_URL;
  }
  var ZEBRA = true;
  var RC = { w: ['В', 'Перемога'], d: ['РН', 'Рибна нічия'], z: ['БН', 'Безрибна нічия'], l: ['П', 'Поразка'] };
  state.query = '';

  function isListMode() {
    var p = state.payload;
    return !!p && (p.mode === 'Список учасників' ||
      (!p.mode && (p.sheets || []).length === 1 && /учасник/i.test(p.sheets[0].name || '')));
  }
  function tabLabel(name) { return /результат/i.test(name) ? 'Підсумок' : /^тур/i.test(String(name).trim()) ? 'По турах' : name; }
  function initials(n) { if (I18N.en) n = I18N.translit(n); return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0); }).join('').toUpperCase(); }
  // ----- Фото учасників (assets/players/players.json: «прізвище ім'я» малими літерами → файл) -----
  // Кого немає у списку або чиє фото не завантажилось — показуємо ініціали.
  var PHOTOS = {};
  var PHOTO_V = 5;   // збільшити, коли фото замінено на нові (щоб Telegram і браузери не тримали старі)
  function avatarHtml(name) {
    var f = PHOTOS[normName(name)];
    return '<span class="av' + (f ? ' av--ph' : '') + '" aria-hidden="true">' + esc(initials(name)) +
      (f ? '<img src="assets/players/' + encodeURIComponent(f) + '?v=' + PHOTO_V + '" alt="" loading="lazy" decoding="async">' : '') + '</span>';
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('av')) {
      t.parentNode.classList.remove('av--ph'); t.remove();
    }
  }, true);
  fetch('assets/players/players.json?v=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (m) {
      if (!m || typeof m !== 'object' || !Object.keys(m).length) return;
      PHOTOS = m;
      if (state.models && state.models.length) { renderBoard(); try { renderSide(); } catch (e) { /* */ } }
      if (state.view === 'card' && typeof renderCard === 'function') try { renderCard(); } catch (e) { /* */ }
    })
    .catch(function () { /* без фото — лишаються ініціали */ });
  function colBy(m, re) { return m.cols.find(function (k) { return k.role !== 'name' && k.role !== 'place' && re.test(k.label); }) || null; }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, I18N.en ? ',' : ' '); }
  function matchQuery(name) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    if (String(name).toLowerCase().indexOf(q) !== -1) return true;
    return I18N.en && I18N.translit(String(name)).toLowerCase().indexOf(q) !== -1;   // англійською шукають латиницею
  }
  function resultsModel() { return state.models.find(function (m) { return /результат/i.test(m.name); }) || null; }
  function placeByName() {
    var m = resultsModel(), map = {};
    if (m) m.rows.forEach(function (r) { map[normName(r.cells[m.nameCol ? m.nameCol.c : 1])] = r; });
    return map;
  }
  function playedTours(t) { return t ? t.tourAvg.filter(function (x) { return x != null; }).length : 0; }
  function tourTotals(t) {
    var s = [];
    if (!t) return s;
    for (var i = 0; i < t.rounds; i++) s.push(null);
    Object.keys(t.byName).forEach(function (k) {
      t.byName[k].tours.forEach(function (x, i) { if (x.code) s[i] = (s[i] || 0) + x.fish; });
    });
    return s;
  }
  // Підсумки заліку з аркуша «Результат» (+ «Тури» для форми й В·РН·БН·П)
  function standingsRows() {
    var m = resultsModel();
    if (!m || !m.nameCol) return null;
    var cPts = colBy(m, /^бали/i), cWin = colBy(m, /^(виграш|перемог)/i), cFish = colBy(m, /^риб/i);
    if (!cPts) return null;
    var t = toursData();
    var moves = (state.payload && state.payload.showMoves === false) ? {} : (state.moves[m.name] || {});
    return {
      model: m, fishLabel: cFish ? cFish.label : '',
      rows: m.rows.map(function (row) {
        var name = row.cells[m.nameCol.c];
        var me = t ? t.byName[normName(name)] : null;
        var cnt = { w: 0, d: 0, z: 0, l: 0 }, form = [];
        if (me) me.tours.forEach(function (x) { if (x.code) { cnt[x.code]++; form.push(x.code); } });
        var dp = drawPlayer(name);
        return {
          key: row.key, name: name, place: row.place, move: moves[row.key] || 0,
          pts: num(row.cells[cPts.c]), wins: cWin ? num(row.cells[cWin.c]) : (me ? cnt.w : null),
          fish: cFish ? num(row.cells[cFish.c]) : null, cnt: me ? cnt : null, form: form.slice(-5), num: dp ? dp.n : null
        };
      })
    };
  }
  // ----- Картинка-сторіс з результатом учасника (1080×1920) -----
  // Важливе — в «безпечній зоні» сторіс Instagram/Telegram: зверху ~150 px перекриває інтерфейс, знизу ~190 px — поле відповіді
  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  }
  // Прямокутник із кутами-супереліпсом (як «згладжування кутів» в iOS): |x|^n + |y|^n = 1
  function sqPath(ctx, x, y, w, h, r, n) {
    n = n || 4.2; r = Math.min(r, w / 2, h / 2);
    var steps = 18, pts = [];
    function corner(cx, cy, sx, sy, from) {
      for (var i = 0; i <= steps; i++) {
        var t = (from + i / steps) * Math.PI / 2;
        var ct = Math.cos(t), st = Math.sin(t);
        pts.push([cx + sx * r * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n), cy + sy * r * Math.sign(st) * Math.pow(Math.abs(st), 2 / n)]);
      }
    }
    // правий верхній, правий нижній, лівий нижній, лівий верхній
    var q = [];
    for (var i = 0; i <= steps; i++) { var t = i / steps * Math.PI / 2; q.push([Math.pow(Math.cos(t), 2 / n), Math.pow(Math.sin(t), 2 / n)]); }
    ctx.beginPath();
    q.forEach(function (p, i) { var px = x + w - r + r * p[0], py = y + r - r * p[1]; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    q.slice().reverse().forEach(function (p) { ctx.lineTo(x + r - r * p[0], y + r - r * p[1]); });
    q.forEach(function (p) { ctx.lineTo(x + r - r * p[0], y + h - r + r * p[1]); });
    q.slice().reverse().forEach(function (p) { ctx.lineTo(x + w - r + r * p[0], y + h - r + r * p[1]); });
    ctx.closePath();
  }
  // Розмиття малої копії: кілька проходів box-blur по горизонталі й вертикалі ≈ гаусове розмиття
  function boxBlur(ctx, w, h, r, passes) {
    var im = ctx.getImageData(0, 0, w, h), a = im.data, b = new Float32Array(a.length), t = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) b[i] = a[i];
    function pass(src, dst, horiz) {
      var len = horiz ? w : h, lines = horiz ? h : w;
      for (var l = 0; l < lines; l++) for (var ch = 0; ch < 4; ch++) {
        var sum = 0, idx = function (k) { k = k < 0 ? 0 : k >= len ? len - 1 : k; return ((horiz ? l * w + k : k * w + l) * 4) + ch; };
        for (var k = -r; k <= r; k++) sum += src[idx(k)];
        for (var k2 = 0; k2 < len; k2++) {
          dst[idx(k2)] = sum / (2 * r + 1);
          sum += src[idx(k2 + r + 1)] - src[idx(k2 - r)];
        }
      }
    }
    for (var p = 0; p < passes; p++) { pass(b, t, true); pass(t, b, false); }
    for (var j = 0; j < a.length; j++) a[j] = b[j];
    ctx.putImageData(im, 0, 0);
  }
  function fitText(ctx, text, maxW, size, weight) {
    var s = size;
    do { ctx.font = weight + ' ' + s + 'px Fixel, system-ui, sans-serif'; s -= 1; } while (ctx.measureText(text).width > maxW && s > 12);
  }
  // fmt: 'story' — 1080×1920 (сторіс), 'wide' — 1440×1080 (4:3, допис / чат)
  function storyCanvas(st, fmt) {
    var wide = fmt === 'wide';
    var ev = (state.payload && state.payload.event) || {};
    var photo = PHOTOS[normName(st.name)];
    var total = cardPlayersCount();
    var F = 'Fixel, system-ui, sans-serif';
    return Promise.all([
      loadImg('assets/logo.svg?v=3'),
      // для картинки — фото у більшій якості (assets/players/lg), якщо його немає — звичайне
      loadImg(photo ? 'assets/players/lg/' + encodeURIComponent(photo) + '?v=' + PHOTO_V : null).then(function (im) { return im || loadImg(photo ? 'assets/players/' + encodeURIComponent(photo) + '?v=' + PHOTO_V : null); }),
      loadImg('assets/fish.webp?v=2'),
      document.fonts && document.fonts.load ? Promise.all([document.fonts.load('700 80px Fixel'), document.fonts.load('500 30px Fixel')]).catch(function () {}) : null
    ]).then(function (r) {
      var logo = r[0], face = r[1], fish = r[2];
      var W = wide ? 1440 : 1080, H = wide ? 1080 : 1920, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      if (I18N.en) {   // англійська: усі підписи на картинці перекладаємо так само, як на сторінці
        var _ft = c.fillText.bind(c), _mt = c.measureText.bind(c);
        c.fillText = function (s, x, y, w) { return w == null ? _ft(I18N.tr(String(s)), x, y) : _ft(I18N.tr(String(s)), x, y, w); };
        c.measureText = function (s) { return _mt(I18N.tr(String(s))); };
      }
      var track = function (px) { try { c.letterSpacing = px + 'px'; } catch (e) { /* */ } };
      var font = function (w, size) { c.font = w + ' ' + size + 'px ' + F; };
      var place = st.played > 0 ? st.place : null;
      var accent = place === 1 ? '#e8c35a' : place === 2 ? '#c9d0da' : place === 3 ? '#d79a6a' : '#8fd12a';
      // Розкладка: сторіс — усе по центру стовпчиком; 4:3 — ліворуч людина, праворуч статистика
      var L = wide
        ? { cx: 400, logoW: 280, logoY: 112, titleY: 262, subY: 302, photoY: 500, R: 122, nameY: 722, nameW: 660, nameS: 62, placeY: 776,
            px: 780, py: 210, pw: 580, ph: 560, footY: 952, botY: 998, footX: W / 2, glowX: 400, glowY: 470, fishX: W - 980, fishY: 640, fishW: 960 }
        : { cx: W / 2, logoW: 340, logoY: 150, titleY: 326, subY: 370, photoY: 600, R: 118, nameY: 838, nameW: 920, nameS: 78, placeY: 896,
            px: 90, py: 980, pw: W - 180, ph: 560, footY: 1676, botY: 1724, footX: W / 2, glowX: W / 2, glowY: 560, fishX: W - 1180 - 10, fishY: 1240, fishW: 1180 };

      // фон: глибокий чорний, м'яке зелене світло, ледь помітна форель (голова праворуч)
      c.fillStyle = '#08090a'; c.fillRect(0, 0, W, H);
      var g = c.createRadialGradient(L.glowX, L.glowY, 20, L.glowX, L.glowY, wide ? 700 : 820);
      g.addColorStop(0, 'rgba(118,177,29,0.16)'); g.addColorStop(0.3, 'rgba(118,177,29,0.10)'); g.addColorStop(0.6, 'rgba(118,177,29,0.04)'); g.addColorStop(1, 'rgba(118,177,29,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (fish) {
        var fh = L.fishW * fish.height / fish.width;
        c.globalAlpha = 0.07; c.drawImage(fish, L.fishX, L.fishY, L.fishW, fh); c.globalAlpha = 1;
      }
      // Знімок фону під панеллю ще без шуму → справжнє гаусоподібне розмиття (3 проходи box-blur на зменшеній копії)
      var glass = null;
      try {
        var gm = 80, gs = 6, gx = L.px - gm, gy = L.py - gm, gw = L.pw + gm * 2, gh = L.ph + gm * 2;
        glass = document.createElement('canvas'); glass.width = Math.round(gw / gs); glass.height = Math.round(gh / gs);
        var gc = glass.getContext('2d'); gc.imageSmoothingEnabled = true; gc.imageSmoothingQuality = 'high';
        gc.drawImage(cv, gx, gy, gw, gh, 0, 0, glass.width, glass.height);
        boxBlur(gc, glass.width, glass.height, 5, 3);
        glass._x = gx; glass._y = gy; glass._w = gw; glass._h = gh;
      } catch (e) { glass = null; }
      // Дизеринг: ледь помітний «шум» на фоні, щоб плавне світло не розпадалося на смуги
      // після стиснення в Instagram/Telegram
      try {
        var img = c.getImageData(0, 0, W, H), px8 = img.data;
        for (var k = 0; k < px8.length; k += 4) {
          var n = (Math.random() + Math.random() - 1) * 5;
          px8[k] += n; px8[k + 1] += n; px8[k + 2] += n;
        }
        c.putImageData(img, 0, 0);
      } catch (e) { /* */ }
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';

      // лого й назва турніру
      if (logo) { var lh = L.logoW * 306 / 1020; c.drawImage(logo, L.cx - L.logoW / 2, L.logoY, L.logoW, lh); }
      track(5); font(500, wide ? 24 : 26); c.fillStyle = '#9aa3b2';
      var title = String(ev.title || 'TROUT MASTER').toUpperCase();
      fitText(c, title, wide ? 640 : 900, wide ? 24 : 26, 500); c.fillText(title, L.cx, L.titleY);
      track(0);
      if (ev.subtitle) { c.fillStyle = '#6b7380'; fitText(c, ev.subtitle, wide ? 660 : 900, wide ? 26 : 28, 400); c.fillText(ev.subtitle, L.cx, L.subY); }

      // фото: тонкий обідок кольору місця з повітрям
      var cx = L.cx, cy = L.photoY, R = L.R;
      c.beginPath(); c.arc(cx, cy, R + 14, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = accent; c.stroke();
      c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
      if (face) c.drawImage(face, cx - R, cy - R, R * 2, R * 2);
      else {
        c.fillStyle = '#16181c'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
        font(600, 84); c.fillStyle = '#d0d5dd'; c.textBaseline = 'middle'; c.fillText(initials(st.name), cx, cy + 4); c.textBaseline = 'alphabetic';
      }
      c.restore();
      if (place) {
        var bx = cx + (R + 14) * 0.7071, by = cy + (R + 14) * 0.7071, br = 34;
        c.beginPath(); c.arc(bx, by, br + 6, 0, Math.PI * 2); c.fillStyle = '#08090a'; c.fill();
        c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fillStyle = accent; c.fill();
        font(700, place > 9 ? 30 : 36); c.fillStyle = '#0b0c0e'; c.textBaseline = 'middle'; c.fillText(String(place), bx, by + 2); c.textBaseline = 'alphabetic';
      }

      // ім'я і місце
      c.fillStyle = '#ffffff'; track(-1); fitText(c, st.name, L.nameW, L.nameS, 700); c.fillText(st.name, cx, L.nameY); track(0);
      if (place) {
        var pt = place + ' місце' + (total ? ' з ' + total : '');
        track(1); font(500, wide ? 30 : 32); c.fillStyle = accent; c.fillText(pt, cx, L.placeY); track(0);
      }

      // панель статистики: одна скляна картка 2×2 з тонкими роздільниками
      var stats = [
        ['БАЛИ', st.points != null ? String(st.points) : '—', st.cnt.w + 'В · ' + st.cnt.d + 'РН · ' + st.cnt.z + 'БН · ' + st.cnt.l + 'П'],
        ['УЛОВ', String(st.fish), fishWord(st.fish) + (st.avg != null ? ' · ' + fmt1(st.avg) + ' за тур' : '')],
        ['ПЕРЕМОГИ', st.winRate != null ? Math.round(st.winRate * 100) + '%' : '—', st.streak ? 'серія ' + st.streak + ' ' + plural(st.streak, 'тур', 'тури', 'турів') : st.cnt.w + ' з ' + st.played],
        st.vsOpp
          ? ['ПРОТИ СУПЕРНИКІВ', st.vsOpp.mine + ':' + st.vsOpp.theirs, (st.vsOpp.mine - st.vsOpp.theirs > 0 ? '+' : '') + (st.vsOpp.mine - st.vsOpp.theirs) + ' ' + fishWord(Math.abs(st.vsOpp.mine - st.vsOpp.theirs))]
          : ['НАЙКРАЩИЙ ТУР', st.best ? String(st.best.fish) : '—', st.best ? fishWord(st.best.fish) + ' · тур ' + st.best.n : '']
      ];
      var px = L.px, py = L.py, pw = L.pw, ph = L.ph, cw = pw / 2, ch = ph / 2;
      // «Скло»: розмитий фон під панеллю (зменшили й розтягнули назад — працює в усіх браузерах), світла плівка, тонка рамка
      if (glass) try {
        c.save(); sqPath(c, px, py, pw, ph, 64); c.clip();
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(glass, glass._x, glass._y, glass._w, glass._h);
        c.restore();
      } catch (e) { /* без розмиття */ }
      sqPath(c, px, py, pw, ph, 64);
      c.fillStyle = 'rgba(255,255,255,0.075)'; c.fill();
      // ледь помітний діагональний перехід: світліше зверху зліва → темніше знизу справа
      var sheen = c.createLinearGradient(px, py, px + pw, py + ph);
      sheen.addColorStop(0, 'rgba(255,255,255,0.06)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0.01)');
      sheen.addColorStop(0.55, 'rgba(0,0,0,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
      c.fillStyle = sheen; c.fill();
      try {
        var pd = c.getImageData(px, py, pw, ph), d8 = pd.data;
        for (var q = 0; q < d8.length; q += 4) { var nn = (Math.random() + Math.random() - 1) * 4; d8[q] += nn; d8[q + 1] += nn; d8[q + 2] += nn; }
        var tmp = document.createElement('canvas'); tmp.width = pw; tmp.height = ph; tmp.getContext('2d').putImageData(pd, 0, 0);
        c.save(); sqPath(c, px, py, pw, ph, 64); c.clip(); c.drawImage(tmp, px, py); c.restore();
      } catch (e) { /* */ }
      sqPath(c, px, py, pw, ph, 64);
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.16)'; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px + cw, py + 36); c.lineTo(px + cw, py + ph - 36); c.moveTo(px + 36, py + ch); c.lineTo(px + pw - 36, py + ch); c.stroke();
      stats.forEach(function (t, i) {
        var x = px + (i % 2) * cw + (wide ? 40 : 48), y = py + Math.floor(i / 2) * ch, inner = cw - (wide ? 80 : 96);
        c.textAlign = 'left';
        track(wide ? 2 : 3); fitText(c, t[0], inner, 22, 500); c.fillStyle = '#7d8696'; c.fillText(t[0], x, y + 72); track(0);
        c.fillStyle = '#ffffff'; track(-1); fitText(c, t[1], inner, wide ? 62 : 68, 650); c.fillText(t[1], x, y + 160); track(0);
        if (t[2]) { c.fillStyle = '#8a93a3'; fitText(c, t[2], inner, wide ? 24 : 26, 400); c.fillText(t[2], x, y + 206); }
        c.textAlign = 'center';
      });

      // підпис
      track(4); font(500, 22); c.fillStyle = '#6b7380'; c.fillText('РЕЗУЛЬТАТИ Й СТАТИСТИКА', L.footX, L.footY); track(0);
      font(600, 36); c.fillStyle = '#9bd83a'; c.fillText('troutmaster.app', L.footX, L.botY);
      return cv;
    });
  }
  var story = { el: null, url: null, file: null };
  function closeStory() {
    if (story.el) story.el.hidden = true;
    if (story.url) { try { URL.revokeObjectURL(story.url); } catch (e) { /* */ } story.url = null; }
    document.documentElement.classList.remove('story-open');
  }
  // Підпис до картинки: чат, Viber, Facebook підхоплять його разом із фото (Instagram-сторіс — ні, там лише стікер «Посилання»)
  function storyCaption(st) {
    var url = shareUrl(st.num), en = I18N.en, name = en ? I18N.translit(st.name) : st.name;
    var place = st.played > 0 && st.place ? st.place : null;
    if (en) {
      return name + (place ? ' — ' + I18N.ord(place) + ' place, ' + st.points + ' pts' : '') + ' at TROUT MASTER 🎣\nStats: ' + url;
    }
    var t = place % 100, d = place % 10;
    var ua = place + '-' + (t >= 11 && t <= 19 ? 'те' : ({ 1: 'ше', 2: 'ге', 3: 'тє', 7: 'ме', 8: 'ме' }[d] || 'те'));   // 1-ше, 2-ге, 5-те, 7-ме
    return name + (place ? ' — ' + ua + ' місце, ' + st.points + ' ' + plural(Number(st.points) || 0, 'бал', 'бали', 'балів') : '') +
      ' на TROUT MASTER 🎣\nСтатистика: ' + url;
  }
  // kind: 'card' — картинка-картка учасника (за замовчуванням), 'table' — таблиця топ-10 (+ свій рядок, якщо name задано)
  function openStory(name, kind) {
    kind = kind === 'table' ? 'table' : 'card';
    if (kind === 'card' && !name) return;
    var st = name ? playerStats(name) : null;
    if (!story.el) {
      story.el = document.createElement('div');
      story.el.className = 'story';
      story.el.setAttribute('role', 'dialog');
      story.el.setAttribute('aria-modal', 'true');
      story.el.setAttribute('aria-label', 'Поділитися результатом');
      story.el.innerHTML = '<div class="story__box">' +
        '<div class="story__fmt story__kind" role="radiogroup" aria-label="Що на картинці">' +
          '<button type="button" role="radio" data-kind="card" aria-checked="true">Картка</button>' +
          '<button type="button" role="radio" data-kind="table" aria-checked="false">Таблиця</button></div>' +
        '<div class="story__img"><span class="story__spin" aria-hidden="true"></span></div>' +
        '<div class="story__fmt" role="radiogroup" aria-label="Формат картинки">' +
          '<button type="button" role="radio" data-fmt="story" aria-checked="true">Сторіс 9:16</button>' +
          '<button type="button" role="radio" data-fmt="wide" aria-checked="false"><span class="fmt-c">Допис 4:3</span><span class="fmt-t">Допис 4:5</span></button></div>' +
        '<p class="story__hint" hidden>Утримуй картинку, щоб зберегти її. Якщо не виходить — відкрий апку в браузері.</p>' +
        '<div class="story__acts"><button type="button" class="btn btn-primary story__share">Поділитися</button>' +
        '<a class="btn btn-secondary story__save" download>Зберегти</a>' +
        '<button type="button" class="btn btn-secondary story__close">Закрити</button></div></div>';
      document.body.appendChild(story.el);
      story.el.addEventListener('click', function (e) { if (e.target === story.el || e.target.closest('.story__close')) closeStory(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && story.el && !story.el.hidden) closeStory(); });
      story.el.querySelector('.story__kind').addEventListener('click', function (e) {
        var b = e.target.closest('[data-kind]');
        if (!b || b.getAttribute('data-kind') === story.kind) return;
        story.kind = b.getAttribute('data-kind');
        renderStory();
      });
      story.el.querySelector('.story__fmt:not(.story__kind)').addEventListener('click', function (e) {
        var b = e.target.closest('[data-fmt]');
        if (!b || b.getAttribute('data-fmt') === story.fmt) return;
        story.fmt = b.getAttribute('data-fmt');
        try { localStorage.setItem('tm:storyFmt', story.fmt); } catch (x) { /* */ }
        renderStory();
      });
      story.el.querySelector('.story__share').addEventListener('click', function () {
        if (!story.file) return;
        navigator.share({ files: [story.file], title: 'TROUT MASTER', text: story.kind === 'table' ? tableCaption() : storyCaption(story.st) }).catch(function () { /* скасував */ });
      });
    }
    story.st = st;
    story.me = name || null;
    story.kind = kind;
    // Перемикач «Картка | Таблиця» — коли є і учасник, і таблиця з результатами
    story.el.querySelector('.story__kind').hidden = !(name && canShareTable());
    story.el.querySelector('.story__kind')._seg = null;
    if (!story.fmt) { try { story.fmt = localStorage.getItem('tm:storyFmt') || 'story'; } catch (x) { story.fmt = 'story'; } }
    story.el.hidden = false;
    story.el.querySelector('.story__fmt:not(.story__kind)')._seg = null;   // при відкритті — одразу на місці, без «приїзду»
    document.documentElement.classList.add('story-open');
    renderStory();
  }
  function renderStory() {
    var st = story.st, fmt = story.fmt === 'wide' ? 'wide' : 'story', isTable = story.kind === 'table';
    [].forEach.call(story.el.querySelectorAll('[data-fmt]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-fmt') === fmt)); });
    [].forEach.call(story.el.querySelectorAll('[data-kind]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-kind') === story.kind)); });
    story.el.classList.toggle('is-table', isTable);
    var fmtBox = story.el.querySelector('.story__fmt:not(.story__kind)'), kindBox = story.el.querySelector('.story__kind');
    segSlide(fmtBox, '[aria-checked="true"]');   // біла «таблетка» їде, як в інших перемикачах
    if (!kindBox.hidden) segSlide(kindBox, '[aria-checked="true"]');
    story.el.setAttribute('aria-label', isTable ? 'Поділитися таблицею' : 'Поділитися результатом');
    var box = story.el.querySelector('.story__img');
    box.classList.toggle('is-wide', fmt === 'wide' && !isTable);
    box.classList.toggle('is-post', fmt === 'wide' && isTable);
    box.innerHTML = '<span class="story__spin" aria-hidden="true"></span>';
    if (story.url) { try { URL.revokeObjectURL(story.url); } catch (e) { /* */ } story.url = null; }
    var token = story.token = (story.token || 0) + 1;
    (isTable ? tableCanvas(story.me, fmt === 'wide' ? 'post' : 'story') : storyCanvas(st, fmt)).then(function (cv) {
      cv.toBlob(function (blob) {
        if (!blob || token !== story.token) return;
        var fname = isTable ? 'trout-master-table' + (fmt === 'wide' ? '-4x5' : '-story') + '.png'
          : 'trout-master-' + (st.num || 'result') + (fmt === 'wide' ? '-4x3' : '-story') + '.png';
        story.file = typeof File === 'function' ? new File([blob], fname, { type: 'image/png' }) : null;
        story.url = URL.createObjectURL(blob);
        box.innerHTML = '<img alt="' + (isTable ? esc(tableHeading()) : 'Результат: ' + esc(st.name)) + '" src="' + story.url + '">';
        var canShare = !!(story.file && navigator.canShare && navigator.share && navigator.canShare({ files: [story.file] }));
        story.el.querySelector('.story__share').hidden = !canShare;
        var save = story.el.querySelector('.story__save');
        save.href = story.url; save.setAttribute('download', fname);
        save.hidden = IN_TG && canShare;   // у Telegram «Зберегти» через посилання не працює — є «Поділитися» → «Зберегти зображення»
        // Підказка «утримуй» — лише там, де немає системного «Поділитися» (у Telegram утримання часто нічого не дає)
        story.el.querySelector('.story__hint').hidden = canShare || !IN_TG;
      }, 'image/png');
    });
  }

  // Плитка «Відрив» у картці (коли немає даних «Проти суперників»): лідеру — запас над 2-м місцем,
  // решті — скільки балів до 1-го місця й до місця вище
  function gapTile(st) {
    var sr = standingsRows();
    if (!sr || st.points == null) return '';
    var rows = sr.rows.filter(function (r) { return r.pts != null && r.place; })
      .sort(function (a, b) { return a.place - b.place; });
    var me = rows.find(function (r) { return normName(r.name) === normName(st.name); });
    if (!me || rows.length < 2) return '';
    var pts = function (n) { return plural(Math.abs(n), 'бал', 'бали', 'балів'); };
    var lbl, val, sub;
    if (me.place === 1) {
      var second = rows.find(function (r) { return r !== me && r.place > 1; }) || rows.find(function (r) { return r !== me; });
      var lead = me.pts - second.pts;
      lbl = 'Відрив'; val = (lead > 0 ? '+' : '') + lead;
      sub = lead > 0 ? 'від ' + second.place + '-го місця' : 'стільки ж балів у ' + second.place + '-го місця';
    } else {
      var leader = rows[0];
      var toLead = leader.pts - me.pts;
      lbl = 'До 1-го місця'; val = (toLead > 0 ? '\u2212' : '') + toLead;
      // найближче місце вище, де балів більше (рівні бали — це вже розподіл за перемогами й рибою)
      var above = rows.filter(function (r) { return r.place < me.place && r.pts > me.pts; }).pop();
      var below = rows.find(function (r) { return r.place > me.place && r.pts < me.pts; });
      if (above && above.place > 1) sub = '\u2212' + (above.pts - me.pts) + ' до ' + above.place + '-го місця';
      else if (below) sub = '+' + (me.pts - below.pts) + ' від ' + below.place + '-го місця';
      else sub = '';
    }
    return '<div class="pk"><span class="pk__l">' + lbl + '</span><span class="pk__v pk__v--sm">' + val +
      ' <small>' + pts(+String(val).replace(/[^0-9]/g, '')) + '</small></span>' +
      (sub ? '<span class="pk__s">' + esc(sub) + '</span>' : '') + '</div>';
  }
  function totalFish() {
    var t = toursData();
    if (t && t.totalFish) return t.totalFish;
    var s = standingsRows();
    if (s && s.fishLabel) { var n = num(s.fishLabel); if (n) return n; }
    return null;
  }

