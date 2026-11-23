  // ===== src/js/99-start.js — Старт: дані з кешу, перший рендер, завантаження =====
  // ---------- Start ----------
  var cached = store.get(LS.data, null);
  if (cached && cached.sheets) {
    applyPayload(cached, { cached: true });
    renderAll();
    if (state.wantPlayer) openWantedPlayer();   // посилання на картку: відкриваємо одразу зі збережених даних
  } else {
    renderHeader();
    renderBoard();
  }
  // Даних ще немає (перший візит) — одразу показуємо картку зі скелетоном, без проміжного списку
  if (state.wantPlayer) {
    state.cardPending = true;
    goCard();
  }
  // Головна з картками раундів: одразу, якщо сезон відомий зі збережених даних, інакше — скелетон до завантаження
  if (HOME_FIRST && (!state.payload || hasHome())) {
    try { history.replaceState({ tmView: 'home' }, '', location.href); } catch (e) { /* */ }
    setView('home');
  }
  renderStatus(false);
  load();
  if (wantReg) {
    try { history.replaceState({ tmView: 'list' }, '', IN_TG ? location.href : location.pathname + location.search); } catch (e) { /* */ }
    goReg();
  }
