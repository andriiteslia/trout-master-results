  // ===== src/js/97-bump.js — «Як змінювались місця»: графік місць по турах зі слайдером і ▶︎ (екран «Статистика») =====
  // По вертикалі — місця 1…N, по горизонталі — тури. Кружечки (фото/ініціали) їдуть своїми лініями, коли рухаєш слайдер.

  // Позиція кожного учасника після кожного туру (без нічиїх у місцях: при повній рівності — порядок за офіційним місцем, далі за іменем)
  function bumpData() {
    var t = toursData();
    if (!t) return null;
    var keys = Object.keys(t.byName), acc = {}, pos = {}, played = 0;
    keys.forEach(function (k) { acc[k] = { p: 0, w: 0, f: 0 }; pos[k] = []; });
    var off = function (k) { var p = t.byName[k].place; return p > 0 ? p : 999; };
    for (var i = 0; i < t.rounds; i++) {
      var any = false;
      keys.forEach(function (k) {
        var r = t.byName[k].tours[i];
        if (r && r.code) { acc[k].p += POINTS[r.code]; acc[k].f += r.fish; if (r.code === 'w') acc[k].w++; any = true; }
      });
      if (!any) break;
      played = i + 1;
      keys.slice().sort(function (a, b) {
        return acc[b].p - acc[a].p || acc[b].w - acc[a].w || acc[b].f - acc[a].f || off(a) - off(b) || a.localeCompare(b);
      }).forEach(function (k, idx) { pos[k].push(idx + 1); });
    }
    if (played < 2) return null;
    // остання точка — офіційний порядок з таблиці
    keys.slice().sort(function (a, b) { return off(a) - off(b) || pos[a][played - 1] - pos[b][played - 1]; })
      .forEach(function (k, idx) { pos[k][played - 1] = idx + 1; });
    return {
      played: played, n: keys.length,
      rows: keys.map(function (k) { return { key: k, name: t.byName[k].name, pos: pos[k], place: t.byName[k].place }; })
    };
  }

  var BUMP = { v: 1, raf: 0, hl: null, D: null };
  var BUMP_ROW = 34, BUMP_PAD = 18;   // висота рядка й відступ зверху/знизу (px)

  function bumpHtml() {
    var D = bumpData();
    BUMP.D = D;
    if (!D) return '';
    var T = D.played, H = BUMP_PAD * 2 + (D.n - 1) * BUMP_ROW;
    var X = function (t) { return (t - 1) / (T - 1) * 1000; };
    var Y = function (p) { return BUMP_PAD + (p - 1) * BUMP_ROW; };
    var MED = { 1: '#d4a72c', 2: '#98a2b3', 3: '#c27a45' };
    var me = selectedPlayerName(), meKey = me ? normName(me) : null;
    var lines = D.rows.map(function (r) {
      var d = r.pos.map(function (p, i) {
        if (!i) return 'M' + X(1) + ' ' + Y(p);
        var x0 = X(i), x1 = X(i + 1), y0 = Y(r.pos[i - 1]), y1 = Y(p), cx = (x0 + x1) / 2;
        return 'C' + cx + ' ' + y0 + ' ' + cx + ' ' + y1 + ' ' + x1 + ' ' + y1;   // плавні переходи між турами
      }).join(' ');
      var fin = r.pos[T - 1];
      return '<path class="bump__ln' + (fin <= 3 ? ' is-top' : '') + '" data-k="' + esc(r.key) + '" d="' + d + '"' +
        (fin <= 3 ? ' style="--c:' + MED[fin] + '"' : '') + '/>';
    }).join('');
    var dots = D.rows.map(function (r) {
      var f = PHOTOS[normName(r.name)];
      return '<button type="button" class="bump__dot' + (f ? ' has-ph' : '') + '" data-k="' + esc(r.key) + '" aria-label="' + esc(r.name) + '">' +
        '<span class="bump__av">' + esc(initials(r.name)) +
        (f ? '<img src="assets/players/' + encodeURIComponent(f) + '?v=' + PHOTO_V + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
        '<span class="bump__nm">' + esc(r.name) + '</span></button>';
    }).join('');
    var axis = '';
    for (var i = 1; i <= D.n; i++) axis += '<span style="top:' + Y(i) + 'px">' + i + '</span>';
    var ticks = '';
    for (var t = 1; t <= T; t++) ticks += '<span style="left:' + (X(t) / 10) + '%">' + t + '</span>';
    BUMP.hl = meKey && D.rows.some(function (r) { return r.key === meKey; }) ? meKey : null;
    return '<section class="card pc-block bump" id="bump">' +
      '<h2 class="pc-h2">Як змінювались місця</h2>' +
      '<div class="bump__scroll" id="bumpScroll">' +
        '<div class="bump__ticks"><span class="bump__tl">Тур</span><div class="bump__tk">' + ticks + '</div></div>' +
        '<div class="bump__plot" style="height:' + H + 'px">' +
          '<div class="bump__axis" aria-hidden="true">' + axis + '</div>' +
          '<div class="bump__area">' +
            '<svg class="bump__svg" viewBox="0 0 1000 ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
              '<defs><clipPath id="bumpClip"><rect id="bumpClipR" x="-20" y="-20" width="1040" height="' + (H + 40) + '"/></clipPath></defs>' +
              '<g class="bump__ghost">' + lines + '</g><g class="bump__lines" clip-path="url(#bumpClip)">' + lines + '</g></svg>' +
            dots +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="bump__ctl">' +
        '<button type="button" class="bump__play" id="bumpPlay" aria-label="Програти тури"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M8 5.5v13l11-6.5z"/><path class="i-pause" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg></button>' +
        '<input type="range" class="bump__range" id="bumpRange" min="1" max="' + T + '" step="0.01" value="' + T + '" aria-label="Тур">' +
        '<span class="bump__cur" id="bumpCur">Тур ' + T + '</span>' +
      '</div>' +
      '<p class="pc-legend">Тягни повзунок або натисни ▶︎. Тап по кружечку — підсвітити учасника</p>' +
    '</section>';
  }

  // Ставить кружечки в положення v (1…T, дробове — між турами)
  function bumpSet(v) {
    var D = BUMP.D, root = document.getElementById('bump');
    if (!D || !root) return;
    var T = D.played;
    v = Math.max(1, Math.min(T, v));
    BUMP.v = v;
    var i0 = Math.floor(v), i1 = Math.min(T, i0 + 1), f = v - i0;
    var e = f * f * (3 - 2 * f);   // плавно, як лінії між турами
    var xPct = (v - 1) / (T - 1) * 100;
    var dots = root.querySelectorAll('.bump__dot');
    D.rows.forEach(function (r, j) {
      var p = r.pos[i0 - 1] + (r.pos[i1 - 1] - r.pos[i0 - 1]) * e;
      var el = dots[j];
      el.style.left = xPct + '%';
      el.style.top = (BUMP_PAD + (p - 1) * BUMP_ROW) + 'px';
      el.classList.toggle('is-right', xPct > 55);   // ім'я з того боку, де є місце
    });
    // Під час ▶︎ графік сам прокручується за підсвіченим учасником, коли той підходить до краю вікна
    if (BUMP.raf && BUMP.hl) {
      var sc = document.getElementById('bumpScroll'), hd = root.querySelector('.bump__dot.is-hl');
      if (sc && hd && sc.scrollHeight > sc.clientHeight + 4) {
        var y = parseFloat(hd.style.top) + 26, top = sc.scrollTop, h = sc.clientHeight, m = Math.min(90, h * 0.25);
        if (y < top + m + 26 || y > top + h - m) sc.scrollTop = top + (y - h / 2 - top) * 0.12;   // м'яко, без ривків
      }
    }
    var cr = document.getElementById('bumpClipR');
    if (cr) cr.setAttribute('width', String(xPct * 10 + 20));
    var rg = document.getElementById('bumpRange');
    if (rg && Math.abs(+rg.value - v) > 0.001) rg.value = v;
    if (rg) rg.style.setProperty('--fill', xPct + '%');
    var cur = document.getElementById('bumpCur');
    var tn = Math.round(v);
    if (cur && cur.textContent !== 'Тур ' + tn) cur.textContent = 'Тур ' + tn;
  }
  function bumpHighlight(k) {
    var root = document.getElementById('bump');
    if (!root) return;
    BUMP.hl = k;
    root.classList.toggle('has-hl', !!k);
    [].forEach.call(root.querySelectorAll('[data-k]'), function (n) { n.classList.toggle('is-hl', !!k && n.getAttribute('data-k') === k); });
    // підсвічена лінія — поверх інших
    if (k) [].forEach.call(root.querySelectorAll('.bump__lines path.is-hl, .bump__ghost path.is-hl'), function (p) { p.parentNode.appendChild(p); });
  }
  function bumpStop() {
    if (BUMP.raf) cancelAnimationFrame(BUMP.raf);
    BUMP.raf = 0;
    var b = document.getElementById('bumpPlay');
    if (b) { b.classList.remove('is-on'); b.setAttribute('aria-label', 'Програти тури'); }
  }
  function bumpPlay() {
    var D = BUMP.D;
    if (!D) return;
    if (BUMP.raf) { bumpStop(); return; }
    var T = D.played, from = BUMP.v >= T - 0.01 ? 1 : BUMP.v;
    var dur = (T - from) * 650, t0 = null;
    var b = document.getElementById('bumpPlay');
    if (b) { b.classList.add('is-on'); b.setAttribute('aria-label', 'Пауза'); }
    bumpSet(from);
    (function step(ts) {
      if (t0 === null) t0 = ts;
      var v = from + (T - from) * Math.min(1, (ts - t0) / dur);
      bumpSet(v);
      if (v < T) BUMP.raf = requestAnimationFrame(step); else bumpStop();
    })(performance.now());
  }
  // Після кожного рендеру статистики: поставити кружечки на останній тур і підсвітити «себе»
  function bumpInit() {
    if (!document.getElementById('bump')) return;
    bumpStop();
    bumpSet(BUMP.D.played);
    bumpHighlight(BUMP.hl);
  }
  ts.body.addEventListener('input', function (e) {
    if (e.target.id !== 'bumpRange') return;
    bumpStop();
    bumpSet(+e.target.value);
  });
  ts.body.addEventListener('change', function (e) {   // відпустив повзунок — доводимо до найближчого туру
    if (e.target.id !== 'bumpRange') return;
    bumpSet(Math.round(+e.target.value));
  });
  ts.body.addEventListener('click', function (e) {
    if (e.target.closest('#bumpPlay')) { bumpPlay(); return; }
    var d = e.target.closest('#bump .bump__dot');
    if (d) { var k = d.getAttribute('data-k'); bumpHighlight(BUMP.hl === k ? null : k); }
  });
