  // ===== src/js/96-table-story.js — Картинка таблиці: топ-10 + свій рядок (сторіс 9:16 і допис 4:5) =====
  // Живе в тому ж екрані «Поділитися», що й картинка-сторіс учасника (openStory у 90-v2-photos-story.js).

  // Заголовок картинки: «Підсумкова таблиця» після фіналу, інакше «Після N туру з M»
  function tableHeading() {
    var S = tournamentStats();
    if (S && S.rounds && S.played >= S.rounds) return 'Підсумкова таблиця';
    if (S && S.rounds && S.played) return 'Після ' + S.played + ' туру з ' + S.rounds;
    return 'Таблиця';
  }
  function canShareTable() {
    if (isListMode()) return false;
    var s = standingsRows();
    return !!(s && s.rows.some(function (r) { return r.pts > 0; }));
  }
  function tableRows() {
    var s = standingsRows();
    if (!s) return [];
    return s.rows.filter(function (r) { return r.place; }).sort(function (a, b) { return a.place - b.place; });
  }
  function photoFor(name, big) {
    var f = PHOTOS[normName(name)];
    if (!f) return Promise.resolve(null);
    var small = 'assets/players/' + encodeURIComponent(f) + '?v=' + PHOTO_V;
    return big ? loadImg('assets/players/lg/' + encodeURIComponent(f) + '?v=' + PHOTO_V).then(function (im) { return im || loadImg(small); }) : loadImg(small);
  }

  // fmt: 'story' — 1080×1920, 'post' — 1080×1350 (4:5)
  function tableCanvas(me, fmt) {
    var post = fmt === 'post';
    var ev = (state.payload && state.payload.event) || {};
    var rows = tableRows();
    var top = rows.slice(0, 10);
    var meKey = me ? normName(me) : null;
    var meRow = meKey ? rows.find(function (r) { return normName(r.name) === meKey; }) : null;
    var extra = meRow && meRow.place > 10 ? meRow : null;   // свій рядок окремо, якщо нижче 10-го місця
    var pod = [2, 1, 3].map(function (p) { return top.find(function (r) { return r.place === p; }); });
    var podOk = pod.every(Boolean);
    var list = podOk ? top.filter(function (r) { return r.place > 3; }) : top;
    var F = 'Fixel, system-ui, sans-serif';
    return Promise.all([
      loadImg('assets/logo.svg?v=3'),
      loadImg('assets/fish.webp?v=2'),
      Promise.all((podOk ? pod : []).map(function (r) { return photoFor(r.name, true); })),
      Promise.all(list.concat(extra ? [extra] : []).map(function (r) { return photoFor(r.name, false); })),
      document.fonts && document.fonts.load ? Promise.all([document.fonts.load('700 80px Fixel'), document.fonts.load('500 30px Fixel')]).catch(function () {}) : null
    ]).then(function (res) {
      var logo = res[0], fish = res[1], podFaces = res[2], rowFaces = res[3];
      var W = 1080, H = post ? 1350 : 1920, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      if (I18N.en) {
        var _ft = c.fillText.bind(c), _mt = c.measureText.bind(c);
        c.fillText = function (s, x, y, w) { return w == null ? _ft(I18N.tr(String(s)), x, y) : _ft(I18N.tr(String(s)), x, y, w); };
        c.measureText = function (s) { return _mt(I18N.tr(String(s))); };
      }
      var track = function (px) { try { c.letterSpacing = px + 'px'; } catch (e) { /* */ } };
      var font = function (w, size) { c.font = w + ' ' + size + 'px ' + F; };
      var MED = { 1: '#e8c35a', 2: '#c9d0da', 3: '#d79a6a' }, GREEN = '#8fd12a';

      // Розкладка. Сторіс: зверху ~150 px і знизу ~190 px перекриває інтерфейс Instagram/Telegram — там лише фон
      var L = post
        ? { logoY: 40, logoW: 190, titleY: 148, subY: 182, headY: 246, headS: 52, podY: 276, R1: 62, R: 48,
            listY: 630, rowH: 66, gapY: 30, footY: 1318, rowR: 22 }
        : { logoY: 150, logoW: 250, titleY: 284, subY: 322, headY: 404, headS: 62, podY: 440, R1: 76, R: 60,
            listY: 850, rowH: 84, gapY: 36, footY: 1770, rowR: 26 };

      // фон
      c.fillStyle = '#08090a'; c.fillRect(0, 0, W, H);
      var g = c.createRadialGradient(W / 2, L.podY + 120, 20, W / 2, L.podY + 120, 760);
      g.addColorStop(0, 'rgba(118,177,29,0.16)'); g.addColorStop(0.35, 'rgba(118,177,29,0.08)'); g.addColorStop(1, 'rgba(118,177,29,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (fish) { var fw = 1180, fh = fw * fish.height / fish.width; c.globalAlpha = 0.06; c.drawImage(fish, W - fw - 10, H - fh - (post ? 40 : 300), fw, fh); c.globalAlpha = 1; }
      try {   // дизеринг, щоб світло не розпадалося на смуги після стиснення
        var img = c.getImageData(0, 0, W, H), d8 = img.data;
        for (var k = 0; k < d8.length; k += 4) { var n = (Math.random() + Math.random() - 1) * 5; d8[k] += n; d8[k + 1] += n; d8[k + 2] += n; }
        c.putImageData(img, 0, 0);
      } catch (e) { /* */ }

      // шапка
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      if (logo) { var lh = L.logoW * 306 / 1020; c.drawImage(logo, W / 2 - L.logoW / 2, L.logoY, L.logoW, lh); }
      track(5); c.fillStyle = '#9aa3b2';
      var title = String(ev.title || 'TROUT MASTER').toUpperCase();
      fitText(c, title, 900, post ? 22 : 26, 500); c.fillText(title, W / 2, L.titleY); track(0);
      if (ev.subtitle) { c.fillStyle = '#6b7380'; fitText(c, ev.subtitle, 900, post ? 24 : 28, 400); c.fillText(ev.subtitle, W / 2, L.subY); }
      var head = tableHeading(), done = head === 'Підсумкова таблиця';
      c.fillStyle = '#fff'; track(-1); fitText(c, head + (done ? ' 🏆' : ''), 940, L.headS, 700); c.fillText(head + (done ? ' 🏆' : ''), W / 2, L.headY); track(0);

      function face(im, name, cx, cy, R, ring) {
        if (ring) { c.beginPath(); c.arc(cx, cy, R + 10, 0, Math.PI * 2); c.lineWidth = R > 60 ? 4 : 3; c.strokeStyle = ring; c.stroke(); }
        c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
        if (im) c.drawImage(im, cx - R, cy - R, R * 2, R * 2);
        else {
          c.fillStyle = '#1b1e23'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
          font(650, Math.round(R * 0.62)); c.fillStyle = '#d0d5dd'; c.textBaseline = 'middle'; c.fillText(initials(name), cx, cy + 2); c.textBaseline = 'alphabetic';
        }
        c.restore();
      }
      function badge(cx, cy, r, place, col) {
        c.beginPath(); c.arc(cx, cy, r + 5, 0, Math.PI * 2); c.fillStyle = '#08090a'; c.fill();
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = col; c.fill();
        font(750, Math.round(r * 1.05)); c.fillStyle = '#0b0c0e'; c.textBaseline = 'middle'; c.fillText(String(place), cx, cy + 2); c.textBaseline = 'alphabetic';
      }
      var ptsTxt = function (r) { return r.pts + ' ' + plural(Math.round(r.pts), 'бал', 'бали', 'балів'); };
      var fishTxt = function (r) { return r.fish != null ? r.fish + ' ' + fishWord(r.fish) : ''; };

      // подіум: 2 — 1 — 3
      if (podOk) {
        var cols = [W / 2 - 330, W / 2, W / 2 + 330];
        pod.forEach(function (r, i) {
          var first = r.place === 1, R = first ? L.R1 : L.R, cy = L.podY + (first ? L.R1 + 14 : L.R1 + 40);
          var mine = meKey && normName(r.name) === meKey;
          face(podFaces[i], r.name, cols[i], cy, R, MED[r.place]);
          badge(cols[i] + (R + 10) * 0.7071, cy + (R + 10) * 0.7071, first ? 28 : 24, r.place, MED[r.place]);
          var ny = cy + R + (post ? 52 : 62);
          c.fillStyle = mine ? GREEN : '#fff'; track(-0.5);
          var nm = r.name.split(' ');
          fitText(c, nm[0] || r.name, 300, first ? (post ? 34 : 40) : (post ? 30 : 34), 700); c.fillText(nm[0] || r.name, cols[i], ny);
          if (nm[1]) { fitText(c, nm.slice(1).join(' '), 300, first ? (post ? 28 : 32) : (post ? 24 : 28), 500); c.fillStyle = mine ? GREEN : '#c4cad4'; c.fillText(nm.slice(1).join(' '), cols[i], ny + (post ? 34 : 40)); }
          track(0);
          font(650, post ? 26 : 30); c.fillStyle = MED[r.place];
          c.fillText(ptsTxt(r) + (fishTxt(r) ? ' · ' + fishTxt(r) : ''), cols[i], ny + (post ? 76 : 90));
        });
      }

      // рядки 4–10 (або 1–10 без подіуму) і свій рядок
      var x0 = 70, x1 = W - 70;
      function row(r, y, im, mine) {
        var h = L.rowH - 8;
        if (mine) {
          sqPath(c, x0 - 14, y - 4, x1 - x0 + 28, h + 8, L.rowR);
          c.fillStyle = 'rgba(143,209,42,0.14)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = 'rgba(143,209,42,0.75)'; c.stroke();
        }
        var cy = y + h / 2;
        c.textAlign = 'center'; font(700, post ? 30 : 34); c.fillStyle = mine ? GREEN : '#7d8696'; c.textBaseline = 'middle';
        c.fillText(String(r.place), x0 + 26, cy + 1);
        var ar = post ? 22 : 26;
        face(im, r.name, x0 + 92, cy, ar, null);
        c.textAlign = 'left'; c.fillStyle = '#fff';
        var nameX = x0 + 92 + ar + 22, numW = 250;
        fitText(c, r.name, x1 - nameX - numW - 20, post ? 30 : 34, 650); c.fillText(r.name, nameX, cy + 1);
        c.textAlign = 'right';
        font(700, post ? 32 : 36); c.fillStyle = '#fff'; c.fillText(String(r.pts), x1 - 120, cy + 1);
        font(500, post ? 24 : 26); c.fillStyle = '#9aa3b2'; c.fillText(r.fish != null ? String(r.fish) : '', x1, cy + 1);
        c.textBaseline = 'alphabetic'; c.textAlign = 'center';
      }
      // підписи колонок
      font(500, post ? 18 : 20); track(3); c.fillStyle = '#5b6474'; c.textAlign = 'right';
      c.fillText('БАЛИ', x1 - 120, L.listY - 16); c.fillText('РИБИ', x1, L.listY - 16); track(0); c.textAlign = 'center';
      list.forEach(function (r, i) {
        var y = L.listY + i * L.rowH;
        if (i) { c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, y - 4); c.lineTo(x1, y - 4); c.stroke(); }
        row(r, y, rowFaces[i], meKey && normName(r.name) === meKey);
      });
      if (extra) {
        var ye = L.listY + list.length * L.rowH + L.gapY;
        font(700, 34); c.fillStyle = '#5b6474'; c.fillText('···', W / 2, ye - L.gapY / 2 + 6);
        row(extra, ye + 6, rowFaces[list.length], true);
      }

      // підпис
      track(4); font(500, 22); c.fillStyle = '#6b7380'; c.fillText('РЕЗУЛЬТАТИ Й СТАТИСТИКА', W / 2, L.footY - 46); track(0);
      font(600, 34); c.fillStyle = '#9bd83a'; c.fillText('troutmaster.app', W / 2, L.footY);
      return cv;
    });
  }
  function tableCaption() {
    var ev = (state.payload && state.payload.event) || {};
    var head = tableHeading();
    if (I18N.en) return 'TROUT MASTER' + (ev.title ? ' — ' + I18N.tr(ev.title) : '') + ': ' + I18N.tr(head) + ' 🎣\n' + shareUrl();
    return (ev.title || 'TROUT MASTER') + ' — ' + head.toLowerCase() + ' 🎣\n' + shareUrl();
  }

  // Кнопка «Поділитися таблицею» в шапці таблиці (результати)
  var tShare = document.getElementById('tableShare');
  function renderTableShare() {
    if (!tShare) return;
    tShare.hidden = !(state.view === 'list' && canShareTable());
  }
  if (tShare) tShare.addEventListener('click', function () { openStory(selectedPlayerName(), 'table'); });
