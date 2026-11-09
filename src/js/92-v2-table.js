  // ===== src/js/92-v2-table.js — Новий дизайн: перемикачі, таблиці (залік, по турах, список) =====
  // ----- Вкладки «Залік / По турах» -----
  // ---------- Перемикачі: біла «таблетка» плавно переїжджає до вибраного пункту ----------
  function segSlide(box, sel) {
    if (!box) return;
    var b = box.querySelector(sel);
    var ind = box.querySelector('.seg-ind');
    if (!b || !b.offsetWidth) { if (ind) ind.style.opacity = '0'; return; }
    if (!ind) { ind = document.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); }
    box.classList.add('has-seg');   // спершу position: relative — тоді відступи міряються від самого перемикача
    var to = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }, from = box._seg;
    function put(p) { ind.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; ind.style.width = p.w + 'px'; ind.style.height = p.h + 'px'; }
    if (from && !REDUCED && (from.x !== to.x || from.w !== to.w)) {
      ind.style.transition = 'none'; put(from); void ind.offsetWidth; ind.style.transition = '';   // стартуємо з попереднього місця
    } else if (!from) { ind.style.transition = 'none'; put(to); void ind.offsetWidth; ind.style.transition = ''; }
    put(to); ind.style.opacity = '1';
    box._seg = to;
    box.classList.add('has-seg');
  }
  function slideTabs() { segSlide(el.tabs, '.tab[aria-selected="true"]'); }
  window.addEventListener('resize', function () {
    el.tabs._seg = null; slideTabs();
    if (v2.topnav) { v2.topnav._seg = null; segSlide(v2.topnav, '[aria-current="page"]'); }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { el.tabs._seg = null; slideTabs(); });

  function renderTabs() {
    var list = isListMode();
    if (state.models.length < 2) el.tabs.innerHTML = '';
    else {
      var cur = currentModel();
      el.tabs.innerHTML = state.models.map(function (m, i) {
        var sel = m === cur;
        return '<button type="button" class="tab" role="tab" id="tab-' + i + '" data-tab="' + esc(m.name) +
          '" aria-selected="' + sel + '" tabindex="' + (sel ? 0 : -1) + '">' + esc(tabLabel(m.name)) + '</button>';
      }).join('');
      el.board.setAttribute('aria-labelledby', 'tab-' + state.models.indexOf(cur));
      slideTabs();
    }
    renderSide();
    var m = currentModel();
    var tours = !!m && /^тур/i.test(m.name.trim()) && !!toursData();
    v2.legend.hidden = !tours;
    if (list) {
      v2.bTitle.textContent = 'Список учасників';
      v2.bSub.textContent = 'У порядку реєстрації';
    } else if (tours) {
      v2.bTitle.textContent = 'Результати по турах';
      v2.bSub.textContent = 'У клітинці — результат і улов учасника в турі';
    } else {
      v2.bTitle.textContent = m ? (/результат/i.test(m.name) ? 'Підсумкова таблиця' : m.name) : 'Результати';
      v2.bSub.textContent = m && /результат/i.test(m.name) ? 'Бали → перемоги → риба' : '';
    }
  }

  // ----- Таблиця: вибір вигляду -----
  function renderBoard() {
    var m = currentModel();
    el.board.classList.remove('is-wide', 'is-compact', 'v2');
    if (!m || !m.rows.length) { renderTable(); return; }
    var html = null;
    if (isListMode()) html = participantsHtml(m);
    else if (/результат/i.test(m.name)) html = standingsHtml();
    else if (/^тур/i.test(m.name.trim())) html = toursHtml();
    if (html == null) { renderTable(); return; }
    var sc = el.board.querySelector('.tgrid');
    var x = sc ? sc.scrollLeft : 0;
    // Живі оновлення: запам'ятовуємо, де стояв кожен рядок, щоб після нових даних він плавно «переїхав»
    var flip = !REDUCED && state.changeTime && state.flipDone !== state.changeTime && el.board._model === m.name && state.view === 'list';
    var before = {};
    if (flip) [].forEach.call(el.board.querySelectorAll('[data-key]'), function (r) { before[r.getAttribute('data-key')] = r.getBoundingClientRect().top; });
    el.board.classList.add('v2');
    el.board.innerHTML = html;
    el.board._model = m.name;
    var sc2 = el.board.querySelector('.tgrid');
    if (sc2) sc2.scrollLeft = x;
    syncTgridHead();
    if (flip) { state.flipDone = state.changeTime; flipRows(before); }
  }
  // FLIP: рядок, що змінив місце, стартує зі старої позиції й м'яко їде на нову
  function flipRows(before) {
    var moved = [];
    [].forEach.call(el.board.querySelectorAll('[data-key]'), function (r) {
      var k = r.getAttribute('data-key');
      if (!(k in before)) return;
      var dy = before[k] - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) return;
      r.style.transition = 'none';
      r.style.transform = 'translateY(' + dy + 'px)';
      r.classList.add('is-moving');
      moved.push(r);
    });
    if (!moved.length) return;
    void el.board.offsetWidth;
    requestAnimationFrame(function () {
      moved.forEach(function (r, i) {
        r.style.transition = 'transform 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) ' + Math.min(i * 30, 240) + 'ms';
        r.style.transform = '';
        setTimeout(function () { r.classList.remove('is-moving'); r.style.transition = ''; }, 1100 + Math.min(i * 30, 240));
      });
    });
  }
  // Прилипла копія шапки «По турах» гортається вбік разом із таблицею
  function syncTgridHead() {
    var sc = el.board.querySelector('.tgrid'), hd = el.board.querySelector('.tgrid-hd');
    if (sc && hd) hd.scrollLeft = sc.scrollLeft;
  }
  el.board.addEventListener('scroll', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('tgrid')) syncTgridHead();
  }, true);

  function medalCls(place, started) { return started && place >= 1 && place <= 3 ? ' medal-' + place : ''; }
  function moveHtml(mv) {
    if (!mv) return '';
    var n = Math.abs(mv), txt = (mv > 0 ? 'піднявся на ' : 'опустився на ') + n + ' ' + plural(n, 'місце', 'місця', 'місць');
    return '<span class="mv ' + (mv > 0 ? 'up' : 'down') + '" title="' + txt + '"><span aria-hidden="true">' + (mv > 0 ? '▲' : '▼') + n +
      '</span><span class="visually-hidden">, ' + txt + '</span></span>';
  }

  // Залік
  function standingsHtml() {
    var s = standingsRows();
    if (!s) return null;
    var started = s.rows.some(function (r) { return r.pts > 0; });
    var hasT = s.rows.some(function (r) { return r.cnt; });
    var fishTotal = totalFish();
    var flashOn = Date.now() - state.changeTime < 3500;
    var changed = state.changed[s.model.name] || {};
    var rows = s.rows.filter(function (r) { return matchQuery(r.name); });
    var head = '<div class="rk-row rk-head" role="row">' +
      '<span class="c-pl" role="columnheader">Місце</span><span class="c-nm" role="columnheader">Учасник</span>' +
      (hasT ? '<span class="c-form d-only" role="columnheader">Останні 5</span><span class="c-wdl d-only" role="columnheader">В · РН · БН · П</span>' : '') +
      '<span class="c-pts" role="columnheader"><span class="d-only">Бали</span><span class="m-only">Бали · риби' + (fishTotal ? ' (' + fmtInt(fishTotal) + ')' : '') + '</span></span>' +
      '<span class="c-win d-only" role="columnheader">Перемоги</span>' +
      '<span class="c-fish d-only" role="columnheader">Риби' + (fishTotal ? ' (' + fmtInt(fishTotal) + ')' : '') + '</span></div>';
    var body = rows.map(function (r, i) {
      var sel = isSel(r.key);
      var cls = 'rk-row r' + (ZEBRA && i % 2 ? ' z' : '') + (sel ? ' is-sel' : '') + medalCls(r.place, started) +
        (flashOn && changed[r.key] ? ' flash' : '') + (hasT ? '' : ' no-t');
      var form = r.form.map(function (c) { return '<span class="fb fb-' + c + '" title="' + RC[c][1] + '">' + RC[c][0] + '</span>'; }).join('');
      var bars = r.form.map(function (c) { return '<i class="fl fl-' + c + '"></i>'; }).join('');
      var wdl = r.cnt ? '<b class="c-w">' + r.cnt.w + '</b> · <b class="c-d">' + r.cnt.d + '</b> · <b class="c-z">' + r.cnt.z + '</b> · <b class="c-l">' + r.cnt.l + '</b>' : '';
      var wdlM = r.cnt ? r.cnt.w + 'В · ' + r.cnt.d + 'РН · ' + r.cnt.z + 'БН · ' + r.cnt.l + 'П' : '';
      return '<div class="' + cls + '" role="row" data-key="' + esc(r.key) + '" tabindex="0" aria-selected="' + sel + '">' +
        '<span class="c-pl" role="cell"><span class="pc">' + (r.place != null ? r.place : '') + '</span>' + moveHtml(r.move) + '</span>' +
        '<span class="c-nm" role="cell">' + avatarHtml(r.name) + '<span class="nmw">' +
          '<span class="rk-nm">' + esc(r.name) + '</span>' +
          (r.num ? '<span class="sub d-only">№ ' + r.num + '</span>' : '') +
          (r.cnt ? '<span class="msub m-only"><span class="fls" aria-hidden="true">' + bars + '</span>' + wdlM + '</span>' : '') +
        '</span></span>' +
        (hasT ? '<span class="c-form d-only" role="cell">' + form + '</span><span class="c-wdl d-only" role="cell">' + wdl + '</span>' : '') +
        '<span class="c-pts" role="cell"><b>' + (r.pts != null ? r.pts : '') + '</b>' +
          (r.fish != null ? '<small class="m-only">' + r.fish + ' ' + fishWord(r.fish) + '</small>' : '') + '</span>' +
        '<span class="c-win d-only" role="cell">' + (r.wins != null ? r.wins : '') + '</span>' +
        '<span class="c-fish d-only" role="cell">' + (r.fish != null ? r.fish : '') + '</span>' +
        '</div>';
    }).join('');
    if (!rows.length) body = '<div class="empty"><strong>Нікого не знайдено</strong>Спробуйте інше прізвище.</div>';
    return '<div class="rk' + (hasT ? '' : ' no-t') + '" role="table" aria-label="Підсумкова таблиця">' + head + body + '</div>';
  }

  // По турах
  function toursHtml() {
    var t = toursData();
    if (!t) return null;
    var places = placeByName(), s = standingsRows();
    var sByName = {};
    if (s) s.rows.forEach(function (r) { sByName[normName(r.name)] = r; });
    var started = s && s.rows.some(function (r) { return r.pts > 0; });
    var list = Object.keys(t.byName).map(function (k) { return t.byName[k]; });
    list.forEach(function (x) { var r = sByName[normName(x.name)]; x._st = r || null; });
    list.sort(function (a, b) {
      var pa = a._st && a._st.place != null ? a._st.place : 999, pb = b._st && b._st.place != null ? b._st.place : 999;
      return pa - pb;
    });
    list = list.filter(function (x) { return matchQuery(x.name); });
    var tot = tourTotals(t);
    var head = '<div class="tr-row tr-head"><span class="t-pl">#</span><span class="t-nm">Учасник</span>' +
      tot.map(function (f, i) { return '<span class="t-c"><b>' + (i + 1) + '</b><small>' + (f != null ? f : '') + '</small></span>'; }).join('') +
      '<span class="t-s d-only">Бали</span><span class="t-s d-only">Перем.</span><span class="t-s d-only">Риби</span></div>';
    var body = list.map(function (x, i) {
      var st = x._st, key = st ? st.key : x.name, sel = isSel(key);
      var cells = x.tours.map(function (c) {
        if (!c.code) return '<span class="t-c"><span class="tc tc-none" title="Тур ' + c.n + ': ще не зіграно">–</span></span>';
        return '<span class="t-c"><span class="tc tc-' + c.code + '" title="Тур ' + c.n + ': ' + RC[c.code][1] + ', ' + c.fish + ' ' + fishWord(c.fish) + '">' +
          '<small>' + RC[c.code][0] + '</small><b>' + c.fish + '</b></span></span>';
      }).join('');
      return '<div class="tr-row r' + (ZEBRA && i % 2 ? ' z' : '') + (sel ? ' is-sel' : '') + '" data-key="' + esc(key) + '" tabindex="0" aria-selected="' + sel + '">' +
        '<span class="t-pl"><span class="pc' + medalCls(st && st.place, started) + '">' + (st && st.place != null ? st.place : '') + '</span></span>' +
        '<span class="t-nm">' + esc(x.name) + '</span>' + cells +
        '<span class="t-s d-only"><b>' + (st && st.pts != null ? st.pts : (x.points != null ? x.points : '')) + '</b></span>' +
        '<span class="t-s d-only">' + (st && st.wins != null ? st.wins : '') + '</span>' +
        '<span class="t-s d-only">' + (st && st.fish != null ? st.fish : '') + '</span></div>';
    }).join('');
    if (!list.length) body = '<div class="empty"><strong>Нікого не знайдено</strong>Спробуйте інше прізвище.</div>';
    // Копія шапки поза горизонтальним скролом: у Telegram на телефоні вона прилипає до верху (див. .tgrid-hd у стилях)
    return '<p class="tgrid-hint m-only" aria-hidden="true">гортайте →</p><div class="tgrid-hd" aria-hidden="true"><div class="tgrid__in">' + head + '</div></div>' +
      '<div class="tgrid" role="region" aria-label="Результати по турах" tabindex="0"><div class="tgrid__in">' + head + body + '</div></div>';
  }

  // Список учасників під час реєстрації
  function participantsHtml(m) {
    var pl = state.payload || {};
    var seats = parseInt(pl.seats, 10) || 0;
    var all = m.rows.map(function (row, i) {
      return { key: row.key, i: i, n: m.placeCol ? row.cells[m.placeCol.c] : String(i + 1), name: m.nameCol ? row.cells[m.nameCol.c] : row.key };
    });
    var main = seats ? all.slice(0, seats) : all, reserve = seats ? all.slice(seats) : [];
    var free = seats && all.length < seats ? seats - all.length : 0;
    var newest = all.length - 2;   // останні дві реєстрації — «нове»
    // Хто оплатив участь (галочка «Оплата» в таблиці) — значок праворуч
    var paid = {};
    (Array.isArray(pl.paid) ? pl.paid : []).forEach(function (n) { paid[normName(n)] = 1; });
    var PAID_IC = '<img class="pt__paid" src="assets/icons/paid.webp?v=1" width="28" height="28" alt="Оплачено" title="Участь оплачена" decoding="async">';
    // На комп'ютері дві колонки: ліва — перша половина списку, права — друга
    var half = 1;
    function z2(j) { return (j % half) % 2 ? ' z2' : ''; }
    function olOpen(count) { half = Math.max(1, Math.ceil(count / 2)); return '<ol class="plist" style="--rows:' + half + '">'; }
    function item(p, j) {
      var sel = isSel(p.key);
      return '<li class="pt r' + (j % 2 ? ' z1' : '') + z2(j) + (sel ? ' is-sel' : '') + '" data-key="' + esc(p.key) + '">' +
        '<span class="pt__n">' + esc(p.n) + '</span>' + avatarHtml(p.name) +
        '<span class="pt__nm">' + esc(p.name) + '</span>' + (p.i >= newest && p.i > 0 && all.length > 3 ? '<span class="pt__new">new</span>' : '') +
        (paid[normName(p.name)] ? PAID_IC : '') + '</li>';
    }
    var vis = main.filter(function (p) { return matchQuery(p.name); });
    var nFree = free && !state.query ? free : 0;
    var h = '<div class="plist-head m-only" aria-hidden="true"><span>Учасник</span><span>№</span></div>' + olOpen(vis.length + nFree) + vis.map(item).join('');
    if (nFree) {
      for (var k = 0; k < nFree; k++) {
        var j = vis.length + k, nn = all.length + k + 1;
        h += '<li class="pt pt--free' + (j % 2 ? ' z1' : '') + z2(j) + '"><span class="pt__n">' + nn + '</span>' +
          '<span class="av av--free" aria-hidden="true"></span><span class="pt__nm">Вільне місце</span></li>';
      }
    }
    h += '</ol>';
    var rv = reserve.filter(function (p) { return matchQuery(p.name); });
    if (rv.length) h += '<p class="plist-sep">Резерв</p>' + olOpen(rv.length) + rv.map(item).join('') + '</ol>';
    if (!vis.length && !rv.length) h = '<div class="empty"><strong>Нікого не знайдено</strong>Спробуйте інше прізвище.</div>';
    return h;
  }

  function renderInfo() { if (el.info) el.info.hidden = true; }

