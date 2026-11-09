  // ===== src/js/55-effects.js — Ефекти: «одометр» чисел, конфеті, ріст графіків =====
  // ---------- «Одометр»: числа рахують від 0 до значення ----------
  var countedCard = '';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(els, ms) {
    if (REDUCED || !els || !els.length) return;
    ms = ms || 900;
    var items = [];
    [].forEach.call(els, function (el) {
      // лише власний текст (без <small> і прихованих підписів)
      [].forEach.call(el.childNodes, function (n) {
        if (n.nodeType !== 3 || !/\d/.test(n.nodeValue)) return;
        var parts = [], re = /(\d+(?:[.,]\d+)?)/g, last = 0, m, src = n.nodeValue;
        while ((m = re.exec(src))) {
          parts.push(src.slice(last, m.index));
          var txt = m[1], dec = (txt.split(/[.,]/)[1] || '').length;
          parts.push({ to: parseFloat(txt.replace(',', '.')), dec: dec, sep: txt.indexOf(',') !== -1 ? ',' : '.' });
          last = m.index + txt.length;
        }
        parts.push(src.slice(last));
        items.push({ node: n, parts: parts });
      });
    });
    if (!items.length) return;
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms), e = 1 - Math.pow(1 - k, 3);   // плавне сповільнення в кінці
      items.forEach(function (it) {
        if (!it.node.isConnected) return;
        it.node.nodeValue = it.parts.map(function (p) {
          if (typeof p === 'string') return p;
          var v = p.to * e;
          return (p.dec ? v.toFixed(p.dec) : String(Math.round(v))).replace('.', p.sep);
        }).join('');
      });
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Конфеті: короткий «вжух» (без бібліотек) ----------
  function confetti(from) {
    if (REDUCED) return;
    var cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = window.innerWidth, H = window.innerHeight;
    cv.className = 'confetti'; cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    var c = cv.getContext('2d'); c.scale(dpr, dpr);
    var r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    var ox = r ? r.left + r.width / 2 : W / 2, oy = r ? r.top + r.height / 2 : H * 0.28;
    var COLORS = ['#f5c542', '#e8b931', '#76b12d', '#4a9112', '#ffffff', '#5b8fe0', '#e0675c'];
    var parts = [];
    for (var i = 0; i < 150; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1, sp = 7 + Math.random() * 9;
      parts.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
        col: COLORS[i % COLORS.length], round: Math.random() < 0.25
      });
    }
    var t0 = null, DUR = 2600;
    (function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = (ts - t0) / DUR;
      c.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        c.save(); c.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3);
        c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col;
        if (p.round) { c.beginPath(); c.arc(0, 0, p.w / 2.4, 0, 6.28); c.fill(); }
        else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
        c.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(performance.now());
  }
  function glow(el) {
    if (!el) return;
    el.classList.remove('is-glow'); void el.offsetWidth; el.classList.add('is-glow');
    setTimeout(function () { el.classList.remove('is-glow'); }, 2600);
  }
  // Турнір завершено: усі тури внесено
  function tournamentDone() {
    var S = tournamentStats();
    return !!(S && S.rounds && S.played >= S.rounds);
  }
  // Святкування — один раз на пристрої для кожного турніру (щоб не набридало при кожному відкритті)
  function onceOnDevice(k) {
    try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); return true; } catch (e) { return true; }
  }
  function finKey() { var ev = state.payload && state.payload.event; return 'tm:fin:' + ((ev && ev.title) || '') + '|' + ((ev && ev.subtitle) || ''); }
  // Підсумкові результати: раз на пристрій — конфеті (комп: з подіуму; телефон: з плитки «Тур») і сяйво медалі переможця
  function celebrateFinal() {
    if (state.view !== 'list' || isListMode() || !tournamentDone()) return;
    var m = currentModel();
    if (!m || !/результат/i.test(m.name)) return;
    if (!onceOnDevice(finKey())) return;
    setTimeout(function () {
      var p1 = v2.side && !v2.side.hidden ? v2.side.querySelector('.p1') : null;
      var row1 = el.board.querySelector('.rk-row.medal-1 .pc');
      // Комп — з подіуму; телефон — з плитки «Тур 14 / 14» угорі (верхній рядок таблиці там надто низько)
      var tour = document.querySelector('.kpi.k-tour .kpi__v');
      confetti(p1 && p1.offsetWidth ? p1.querySelector('.podium__av') || p1 : tour && tour.offsetWidth ? tour : row1);
      glow(p1 && p1.offsetWidth ? p1.querySelector('.podium__bar') : row1);
    }, 450);
  }

  // Стовпчики графіків «виростають» знизу по черзі, далі з'являються числа й лінія середнього
  function growCharts(root) {
    if (REDUCED || !root) return;
    [].forEach.call(root.querySelectorAll('.pc-chart'), function (svg) {
      var i = 0;
      [].forEach.call(svg.querySelectorAll('rect.bar, rect.bar-t'), function (r) { r.style.animationDelay = (i++ * 45) + 'ms'; });
      var j = 0;
      [].forEach.call(svg.querySelectorAll('text.val'), function (t) { t.style.animationDelay = (250 + j++ * 45) + 'ms'; });
      svg.classList.add('grow');
    });
  }
  var grownStats = false;

