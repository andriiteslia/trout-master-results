  // ===== src/js/20-render.js — Рендер таблиці (старий шар, частину перекриває v2) =====
  // ---------- Rendering ----------
  function currentModel() {
    if (!state.models.length) return null;
    return state.models.find(function (x) { return x.name === state.tab; }) || state.models[0];
  }



  function cellHtml(k, row, opts) {
    var v = row.cells[k.c] || '';
    var cls = [];
    if (k.gstart || k.sep) cls.push('gstart');
    if (opts.flash && opts.flash.indexOf(k.c) !== -1) cls.push('flash');

    if (k.role === 'place') {
      cls.push('c-place');
      var mvHtml = '';
      if (opts.move) {
        var n = Math.abs(opts.move);
        var dir = opts.move > 0 ? 'up' : 'down';
        var txt = (opts.move > 0 ? 'піднявся на ' : 'опустився на ') + n + ' ' + plural(n, 'місце', 'місця', 'місць');
        mvHtml = '<span class="mv ' + dir + '" title="' + txt + '"><span aria-hidden="true">' + (opts.move > 0 ? '▲' : '▼') + n + '</span><span class="visually-hidden">, ' + txt + '</span></span>';
      }
      return '<td class="' + cls.join(' ') + '"><span class="pn">' + esc(v) + '</span>' + mvHtml + '</td>';
    }
    if (k.role === 'name') {
      cls.push('c-name');
      return '<td class="' + cls.join(' ') + '"><button type="button" class="nm" data-key="' + esc(row.key) +
        '" aria-pressed="' + opts.sel + '">' + esc(v) + '</button></td>';
    }
    var code = CODES[v.toUpperCase()];
    var inner = code ? '<span class="code ' + code + '">' + esc(v) + '</span>' : esc(v);
    return '<td class="' + cls.join(' ') + '">' + inner + '</td>';
  }

  // Скелетон, поки вантажаться дані: лише обриси рядків (кружечок, ім'я, число) — легкий, без деталей
  function skeletonRows() {
    var w = [62, 48, 70, 54, 66, 44, 58];
    return '<div class="skel" role="status" aria-live="polite"><span class="visually-hidden">Завантаження результатів…</span>' +
      w.map(function (x) { return '<div class="skel__row" aria-hidden="true"><i class="skel__dot"></i><i class="skel__bar" style="width:' + x + '%"></i><i class="skel__num"></i></div>'; }).join('') +
      '</div>';
  }
  function renderTable() {
    var m = currentModel();
    var prevScroller = el.board.querySelector('.bs');
    var scrollX = prevScroller ? prevScroller.scrollLeft : 0;
    el.board.classList.remove('is-wide', 'is-compact');

    if (!m) {
      el.board.innerHTML = state.error
        ? '<div class="empty"><strong>Не вдалося завантажити результати</strong>Сторінка повторить спробу автоматично.</div>'
        : skeletonRows();
      return;
    }
    if (!m.rows.length) {
      el.board.innerHTML = '<div class="empty"><strong>Результатів ще немає</strong>Таблиця з’явиться тут, щойно судді внесуть перші дані.</div>';
      return;
    }

    var cols = m.cols;
    var hasGroups = cols.some(function (k) { return k.group; });

    var h1 = '', h2 = '';
    for (var i = 0; i < cols.length;) {
      var k = cols[i];
      if (!k.group) {
        var cls = k.role === 'place' ? 'c-place' : k.role === 'name' ? 'c-name' : '';
        var lbl = k.role === 'place' && (!k.label || k.label === '#')
          ? '<span aria-hidden="true">#</span><span class="visually-hidden">Номер</span>' : esc(k.label);
        h1 += '<th scope="col" class="' + cls + '"' + (hasGroups ? ' rowspan="2"' : '') + '>' + lbl + '</th>';
        i++;
        continue;
      }
      var j = i;
      while (j < cols.length && cols[j].group === k.group && (j === i || !cols[j].gstart)) j++;
      h1 += '<th scope="colgroup" colspan="' + (j - i) + '" class="grp gstart">' + esc(k.group) + '</th>';
      for (var x = i; x < j; x++) {
        h2 += '<th scope="col"' + (x === i || cols[x].sep ? ' class="gstart"' : '') + '>' + esc(cols[x].label) + '</th>';
      }
      i = j;
    }
    var thead = '<thead><tr class="h1">' + h1 + '</tr>' + (hasGroups ? '<tr class="h2">' + h2 + '</tr>' : '') + '</thead>';

    // Призери (1–3 місце) — лише на вкладці «Результат» і коли вже є ненульові результати
    var medals = /^результат$/i.test(m.name.trim()) && m.placeCol && m.rows.some(function (row) {
      return cols.some(function (k) {
        return k.numeric && k.role !== 'place' && parseFloat(String(row.cells[k.c]).replace(',', '.')) > 0;
      });
    });
    var flashOn = Date.now() - state.changeTime < 3500;
    // Стрілки ▲▼ вмикаються/вимикаються на аркуші «Сайт» (B9)
    var moves = (state.payload && state.payload.showMoves === false) ? {} : (state.moves[m.name] || {});
    var changed = state.changed[m.name] || {};
    // Список учасників: після N місць (B10 на аркуші «Сайт») — роздільник «Резерв»
    var pl = state.payload || {};
    var seats = parseInt(pl.seats, 10);
    var isList = pl.mode === 'Список учасників' || /учасник/i.test(m.name);
    var reserveAt = isList && seats > 0 && m.rows.length > seats ? seats : -1;
    var body = m.rows.map(function (row, idx) {
      var sel = state.selected.has(row.key);
      var opts = { sel: sel, move: moves[row.key] || 0, flash: flashOn ? changed[row.key] : null };
      var rc = [];
      if (sel) rc.push('is-sel');
      if (medals && row.place >= 1 && row.place <= 3) rc.push('medal medal-' + row.place);
      var sep = idx === reserveAt
        ? '<tr class="reserve-sep"><th scope="rowgroup" colspan="' + cols.length + '"><span>Резерв</span></th></tr>' : '';
      return sep + '<tr data-key="' + esc(row.key) + '"' + (rc.length ? ' class="' + rc.join(' ') + '"' : '') + '>' +
        cols.map(function (k) { return cellHtml(k, row, opts); }).join('') + '</tr>';
    }).join('');

    // Шапка й тіло — окремі таблиці: шапка прилипає до верху екрана,
    // тіло гортається вбік, ширини колонок однакові.
    el.board.innerHTML =
      '<div class="bh"><table class="t-head"></table></div>' +
      '<div class="bs"><table class="t-body">' + thead + '<tbody>' + body + '</tbody></table></div>';
    var headBox = el.board.querySelector('.bh');
    var scroller = el.board.querySelector('.bs');
    var tHead = headBox.firstChild;
    var tBody = scroller.firstChild;

    var cells = tBody.tBodies[0].rows[0].cells;
    var widths = Array.prototype.map.call(cells, function (c) { return c.getBoundingClientRect().width; });
    var total = widths.reduce(function (a, w) { return a + w; }, 0);
    var colgroup = '<colgroup>' + widths.map(function (w) { return '<col style="width:' + w + 'px">'; }).join('') + '</colgroup>';
    var theadEl = tBody.tHead;
    tBody.insertAdjacentHTML('afterbegin', colgroup);
    tHead.innerHTML = colgroup;
    tHead.appendChild(theadEl);
    [tHead, tBody].forEach(function (t) { t.style.tableLayout = 'fixed'; t.style.width = total + 'px'; });

    el.board.classList.toggle('is-wide', total > scroller.clientWidth + 1);
    el.board.style.setProperty('--pw', widths[0] + 'px');
    scroller.scrollLeft = scrollX;
    headBox.scrollLeft = scroller.scrollLeft;
  }

  function renderStatus(pulse) {
    var p = state.payload;
    var s, text;
    el.status.hidden = DEMO;
    if (DEMO) { s = 'demo'; text = ''; }
    else if (state.error) { s = p ? 'stale' : 'error'; text = 'Немає зв’язку'; }
    else if (!p || state.fromCache) { s = 'load'; text = 'Завантаження…'; }
    else {
      s = 'live';
      var at = p.changedAt || p.generatedAt;
      // сьогодні: «Оновлено – 14:32», раніше: «Оновлено 31 жов. 23:57»
      text = 'Оновлено ' + (isToday(new Date(at)) ? '\u2013 ' : '') + fmtTime(at);
    }
    el.status.dataset.state = s;
    // На вузькому телефоні слово «Оновлено» ховаємо (лишається зелена крапка й час), щоб у шапку влазив перемикач мови
    var mw = s === 'live' && text.match(/^(Оновлено (?:\u2013 )?)(.*)$/);
    if (mw) el.statusText.innerHTML = '<span class="st-w">' + esc(mw[1]) + '</span>' + esc(mw[2]);
    else el.statusText.textContent = text;
    el.status.setAttribute('aria-label', text);
    if (pulse && s === 'live') {
      el.status.classList.remove('is-pulse');
      void el.status.offsetWidth;
      el.status.classList.add('is-pulse');
    }

    var notice = '';
    if (DEMO) {
      notice = '';
    } else if (state.error && p) {
      notice = 'Не вдається отримати свіжі дані (' + esc(state.error) + '). Показано результати станом на ' +
        esc(fmtTime(p.changedAt || p.generatedAt)) + '. Сторінка повторить спробу автоматично.';
    } else if (state.error) {
      notice = 'Не вдалося завантажити результати: ' + esc(state.error) + '. Сторінка повторить спробу автоматично.';
    }
    el.notice.innerHTML = notice;
    el.notice.hidden = !notice;
  }

  // Підказка про виділення рядка потрібна лише для результатів, не для списку учасників

  function renderAll() {
    renderInfo();
    renderHeader();
    renderTabs();
    renderBoard();
    renderReg();
    if (state.view === 'card') renderCard();
    if (state.view === 'stats') renderStats();
    revealFocusRow();
    celebrateFinal();
  }

