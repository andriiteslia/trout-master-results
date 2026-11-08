  // ===== src/js/95-deeplinks.js — Посилання на картку (#p9 / startapp=p9) і на виділений рядок (?sel=9) =====

  // Посилання на картку: t.me/…?startapp=p9 (Telegram) або …/#p9 (браузер) — номер із жеребкування
  var wantM = /(?:tgWebAppStartParam=|#)p(\d+)(?:&|$)/.exec(location.hash + '&' + location.search.replace(/^\?/, ''));
  state.wantPlayer = wantM ? +wantM[1] : null;
  // …/#p9 у браузері: прибрати з адреси одразу, щоб після оновлення сторінки картка не відкривалась знову
  if (!IN_TG && /^#p\d+$/.test(location.hash)) {
    try { history.replaceState({ tmView: 'list' }, '', location.pathname + location.search); } catch (e) { /* */ }
  }
  // Посилання …/#p9 вставили в уже відкриту вкладку (без перезавантаження)
  function takeHashPlayer() {
    var m = /^#p(\d+)$/.exec(location.hash);
    if (!m || IN_TG) return false;
    try { history.replaceState({ tmView: 'list' }, '', location.pathname + location.search); } catch (e) { /* */ }
    state.wantPlayer = +m[1];
    if (state.payload) openWantedPlayer();
    return true;
  }
  // ?sel=9 — з персонального повідомлення бота: виділити рядок учасника №9 (картку відкриває він сам)
  var selM = /(?:^|[?&])sel=(\d+)(?:&|$)/.exec(location.search);
  state.wantSelect = selM ? +selM[1] : null;
  if (state.wantSelect) state.selFromLink = true;
  function selectWanted() {
    if (!state.wantSelect) return;
    var n = state.wantSelect, name = null;
    if (isListMode()) {   // список учасників: шукаємо за номером у першій колонці
      var m = state.models[0];
      var row = m && m.rows.find(function (r) { return +String(r.cells[0]).trim() === n; });
      if (row && m.nameCol) name = row.cells[m.nameCol.c];
    } else {
      var dp = drawData() && drawData().players.find(function (x) { return +x.n === n; });
      if (dp) name = dp.name;
    }
    if (!name) return;
    state.wantSelect = null;
    var s = standingsRows(), r = s && s.rows.find(function (x) { return normName(x.name) === normName(name); });
    selectOnly(r ? r.key : name);
    renderBoard();
    setTimeout(function () {
      var el2 = el.board.querySelector('.is-sel');
      if (el2) try { el2.scrollIntoView({ block: 'center' }); } catch (e) { /* */ }
    }, 60);
  }
  function openWantedPlayer() {
    selectWanted();
    var pending = state.cardPending;   // картку вже відкрито зі скелетоном — чекала на дані
    state.cardPending = false;
    var dp = state.wantPlayer && drawData() ? drawData().players.find(function (x) { return +x.n === state.wantPlayer; }) : null;
    state.wantPlayer = null;
    if (!dp || !hasCardData(dp.name)) {   // такого учасника немає — повертаємось до списку
      if (pending && state.view === 'card') goList();
      return;
    }
    var s = standingsRows(), r = s && s.rows.find(function (x) { return normName(x.name) === normName(dp.name); });
    selectOnly(r ? r.key : dp.name);
    renderBoard();
    if (pending && state.view === 'card') { renderCard(); return; }
    if (state.view !== 'list') { state.regPushed = false; setView('list'); }   // напр. уже на картці іншого учасника: новий запис історії — список, поверх нього картка
    goCard();
  }

