  // ===== src/js/10-model.js — Допоміжні функції, аркуш → модель таблиці, різниця між оновленнями =====
  // ---------- Helpers ----------
  var NUM_RE = /^[-+−]?\d+(?:[.,]\d+)?\s*%?$/;
  function isNum(v) { return NUM_RE.test(String(v).trim()); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var t = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (isToday(d)) return t;
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + t;   // «31 жов. 23:57»
  }
  var MONTHS = ['січ.', 'лют.', 'бер.', 'кві.', 'тра.', 'чер.', 'лип.', 'сер.', 'вер.', 'жов.', 'лис.', 'гру.'];
  function isToday(d) { return d.toDateString() === new Date().toDateString(); }
  function plural(n, one, few, many) {
    if (I18N.en) { var en = I18N.plural(n, one, few, many); if (en) return en; }
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ---------- Sheet → table model ----------
  // Перші HEADER_ROWS рядків — заголовки, далі — дані.
  function parseSheet(sheet) {
    var raw = Array.isArray(sheet.values) ? sheet.values : [];
    var merges = Array.isArray(sheet.merges) ? sheet.merges : [];
    var hidden = new Set(sheet.hiddenCols || []);

    var W = 0;
    raw.forEach(function (row) { if (row && row.length > W) W = row.length; });
    var grid = raw.map(function (row) {
      var out = [];
      for (var c = 0; c < W; c++) out.push(row && row[c] != null ? String(row[c]).trim() : '');
      return out;
    });

    var owner = {};
    merges.forEach(function (m) {
      for (var r = m.r; r < m.r + m.rs; r++) for (var c = m.c; c < m.c + m.cs; c++) owner[r + ',' + c] = m;
    });
    var hv = function (r, c) {
      var m = owner[r + ',' + c];
      if (m) return (grid[m.r] && grid[m.r][m.c]) || '';
      return (grid[r] && grid[r][c]) || '';
    };
    var spanW = function (r, c) { var m = owner[r + ',' + c]; return m ? m.cs : 1; };

    var hr = parseInt(sheet.headerRows, 10) > 0 ? parseInt(sheet.headerRows, 10) : HEADER_ROWS;
    var he = Math.min(hr, grid.length);
    var body = grid.slice(he);

    // Колонки: група (рядок 1, об'єднана клітинка) + підпис (рядок 2)
    var cols = [];
    var prevGroup = null;
    for (var c = 0; c < W; c++) {
      var labels = [];
      for (var h = 0; h < he; h++) {
        var v = hv(h, c);
        if (v && labels[labels.length - 1] !== v) labels.push(v);
      }
      var group = null;
      var label = labels[labels.length - 1] || '';
      if (he >= 2) {
        var top = hv(0, c);
        if (top && (spanW(0, c) > 1 || labels.length > 1)) group = top;
        else if (!top && prevGroup && labels.length) group = prevGroup;
        if (group) label = labels.filter(function (x) { return x !== group; }).join(' ') || '';
      }
      prevGroup = group;
      var hasData = labels.length > 0 || body.some(function (row) { return row[c] !== ''; });
      if (hidden.has(c) || !hasData) continue;
      cols.push({ c: c, label: label, group: group });
    }

    // Колонка місця (#) і колонка імені
    var numRatio = function (ci) {
      var n = 0, tot = 0;
      body.forEach(function (row) { var v = row[ci]; if (v !== '') { tot++; if (isNum(v)) n++; } });
      return tot ? n / tot : 0;
    };
    cols.forEach(function (k) { k.numeric = numRatio(k.c) >= 0.6; });
    var placeCol = cols.length && !cols[0].group && (cols[0].numeric || /^(#|№|місце)/i.test(cols[0].label)) ? cols[0] : null;
    var nameCol = cols.find(function (k) { return k !== placeCol && !k.group && !k.numeric; }) || null;
    if (placeCol) placeCol.role = 'place';
    if (nameCol) nameCol.role = 'name';

    var prev = null;
    cols.forEach(function (k) {
      if (k.group && (!prev || prev.group !== k.group)) k.gstart = true;
      prev = k;
    });
    // Додаткові розділювачі всередині групи: перед «Бали» та «Місце» (напр. у «Підсумку»)
    cols.forEach(function (k) {
      if (k.group && !k.gstart && /^(бали|місце)/i.test(k.label)) k.sep = true;
    });

    // Рядки даних: беремо лише ті, де є ім'я учасника
    var seen = {};
    var rows = [];
    body.forEach(function (cells) {
      var name = nameCol ? cells[nameCol.c] : cells.filter(Boolean).join(' ');
      if (!name) return;
      var key = name;
      if (seen[key]) key = key + ' #' + (++seen[key]); else seen[key] = 1;
      var place = placeCol ? parseInt(cells[placeCol.c], 10) : NaN;
      rows.push({ cells: cells, key: key, place: isNaN(place) ? null : place });
    });

    return { name: sheet.name || 'Аркуш', cols: cols, rows: rows, placeCol: placeCol, nameCol: nameCol };
  }

  // ---------- Diff between updates ----------
  function diff(oldModels, newModels) {
    var moves = {}, changed = {}, any = false;
    newModels.forEach(function (m) {
      var old = oldModels.find(function (o) { return o.name === m.name; });
      if (!old) return;
      var byKey = {};
      old.rows.forEach(function (row) { byKey[row.key] = row; });
      var mv = {}, ch = {};
      m.rows.forEach(function (row) {
        var p = byKey[row.key];
        if (!p) return;
        if (row.place != null && p.place != null && row.place !== p.place) mv[row.key] = p.place - row.place;
        var cc = [];
        m.cols.forEach(function (k) { if ((p.cells[k.c] || '') !== (row.cells[k.c] || '')) cc.push(k.c); });
        if (cc.length) { ch[row.key] = cc; any = true; }
      });
      moves[m.name] = mv;
      changed[m.name] = ch;
    });
    return { moves: moves, changed: changed, any: any };
  }

