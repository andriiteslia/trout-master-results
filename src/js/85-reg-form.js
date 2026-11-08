  // ===== src/js/85-reg-form.js — Форма реєстрації: маска телефону, перевірка, надсилання, «Поділитися» =====
  // ----- Маска номера: «+380 » уже стоїть, вводяться лише 9 цифр -----
  function localDigits(raw) {
    var v = String(raw || '');
    var d = v.replace(/\D/g, '');
    if (/^\s*\+/.test(v)) {
      if (d.indexOf('380') === 0) d = d.slice(3);
      else d = d.replace(/^3?8?0?/, '');   // частину префікса стерли
    } else if (d.indexOf('380') === 0 && d.length >= 12) d = d.slice(3);
    else if (d.indexOf('80') === 0 && d.length >= 11) d = d.slice(2);
    else if (d.charAt(0) === '0' && d.length >= 10) d = d.slice(1);
    return d.slice(0, 9);
  }
  function formatLocal(d) {
    var parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    return PREFIX + parts.join(' ');
  }
  // Позиція курсора після k-ї цифри локальної частини
  function caretAfter(formatted, k) {
    if (k <= 0) return PREFIX.length;
    var seen = 0;
    for (var i = PREFIX.length; i < formatted.length; i++) {
      if (/\d/.test(formatted.charAt(i)) && ++seen === k) return i + 1;
    }
    return formatted.length;
  }
  function applyMask(keepCaret) {
    var inp = reg.phone;
    var raw = inp.value;
    var atEnd = inp.selectionStart == null || inp.selectionStart >= raw.length;
    var d = localDigits(raw);
    var before = 0;
    if (keepCaret && !atEnd) {
      // скільки цифр локальної частини стоїть до курсора
      var all = raw.replace(/\D/g, '').length;
      var head = raw.slice(0, inp.selectionStart).replace(/\D/g, '').length;
      before = Math.max(0, Math.min(d.length, head - (all - d.length)));
    }
    var out = formatLocal(d);
    if (inp.value !== out) inp.value = out;
    var pos = keepCaret && !atEnd ? caretAfter(out, before) : out.length;
    try { if (document.activeElement === inp) inp.setSelectionRange(pos, pos); } catch (e) { /* */ }
  }
  reg.phone.addEventListener('focus', function () {
    var empty = !localDigits(reg.phone.value);
    if (empty) reg.phone.value = PREFIX;
    // курсор після «+380 », щоб одразу вводити номер
    setTimeout(function () {
      var inp = reg.phone;
      if (document.activeElement !== inp) return;
      try {
        if (empty) inp.setSelectionRange(inp.value.length, inp.value.length);
        else if (inp.selectionStart < PREFIX.length && inp.selectionEnd <= PREFIX.length) inp.setSelectionRange(PREFIX.length, PREFIX.length);
      } catch (e) { /* */ }
    }, 0);
  });
  reg.phone.addEventListener('blur', function () {
    if (!localDigits(reg.phone.value)) reg.phone.value = '';
    if (state.regTried) validate(false);
  });
  reg.phone.addEventListener('keydown', function (e) {
    // не даємо стерти «+380 »
    var a = reg.phone.selectionStart, b = reg.phone.selectionEnd;
    if (e.key === 'Backspace' && a === b && a <= PREFIX.length) { e.preventDefault(); return; }
    // Backspace одразу після пробілу стирає цифру перед ним
    if (e.key === 'Backspace' && a === b && reg.phone.value.charAt(a - 1) === ' ') {
      try { reg.phone.setSelectionRange(a - 1, a - 1); } catch (x) { /* */ }
    }
    if (e.key === 'Delete' && b <= PREFIX.length - 1) e.preventDefault();
  });
  reg.phone.addEventListener('input', function () {
    applyMask(true);
    if (state.regTried) validate(false);
  });
  reg.name.addEventListener('input', function () { if (state.regTried) validate(false); });
  reg.name.addEventListener('blur', function () {
    reg.name.value = reg.name.value.replace(/\s+/g, ' ').trim();
    if (state.regTried) validate(false);
  });

  // ----- Перевірка полів (ті самі правила, що й у скрипті таблиці) -----
  var WORD_RE = /^[A-Za-zЀ-ӿ]+(?:[-'’ʼ][A-Za-zЀ-ӿ]+)*$/;
  function nameError(v) {
    var s = String(v).replace(/\s+/g, ' ').trim();
    if (!s) return 'Вкажіть прізвище та ім’я.';
    var words = s.split(' ');
    if (!words.every(function (w) { return WORD_RE.test(w); })) return 'Використовуйте лише літери, дефіс та апостроф.';
    if (words.length < 2 || words.some(function (w) { return w.length < 2; })) return 'Вкажіть і прізвище, і ім’я, наприклад: Шевченко Тарас.';
    if (words.length > 4 || s.length > 60) return 'Задовге ім’я. Вкажіть лише прізвище та ім’я.';
    return '';
  }
  function phoneError(v) {
    var d = localDigits(v);
    if (!d) return 'Вкажіть номер телефону.';
    if (d.charAt(0) === '0') return 'Перевірте номер: після +380 не може йти 0.';
    if (d.length < 9) return 'Номер неповний: після +380 потрібно ввести 9 цифр.';
    return '';
  }
  // «  шевченко   тарас » → «Шевченко Тарас» (так само робить скрипт таблиці)
  function normalizeName(v) {
    return String(v || '').replace(/[\u2018\u2019\u02BC`]/g, '\u2019').replace(/\s+/g, ' ').trim().split(' ').map(function (w) {
      if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
      return w.toLowerCase().replace(/(^|[-\u2019'])(\S)/g, function (m, x, y) { return x + y.toUpperCase(); });
    }).join(' ');
  }
  function setFieldError(inp, box, msg) {
    box.textContent = msg;
    box.hidden = !msg;
    if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
  }
  function validate(focus) {
    var ne = nameError(reg.name.value);
    var pe = phoneError(reg.phone.value);
    setFieldError(reg.name, reg.nameErr, ne);
    setFieldError(reg.phone, reg.phoneErr, pe);
    if (focus) { if (ne) reg.name.focus(); else if (pe) reg.phone.focus(); }
    return !ne && !pe;
  }
  // Кнопка сіра, доки поля не заповнені правильно; натиснути її можна завжди — тоді підсвітяться помилки
  function updateRegReady() {
    var ok = !nameError(reg.name.value) && !phoneError(reg.phone.value);
    reg.submit.classList.toggle('is-idle', !ok);
  }
  reg.form.addEventListener('input', updateRegReady);
  reg.name.addEventListener('blur', updateRegReady);
  reg.phone.addEventListener('blur', updateRegReady);
  updateRegReady();

  function showAlert(msg) {
    reg.alert.textContent = msg || '';
    reg.alert.hidden = !msg;
  }
  function setSending(on) {
    state.regSending = on;
    reg.submit.disabled = on;
    reg.form.setAttribute('aria-busy', String(on));
    reg.name.readOnly = on;
    reg.phone.readOnly = on;
    reg.submit.classList.toggle('is-loading', on);
    reg.submit.querySelector('.btn__text').textContent = on ? 'Надсилаємо…' : 'Підтвердити реєстрацію';
  }

  function sendRegistration(body) {
    if (DEMO) {
      return new Promise(function (res) { setTimeout(function () { res({ ok: true, number: 0, name: body.name }); }, 600); });
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    // text/plain — щоб браузер не робив попередній CORS-запит, який Apps Script не підтримує
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  reg.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.regSending) return;
    state.regTried = true;
    showAlert('');
    reg.name.value = reg.name.value.replace(/\s+/g, ' ').trim();
    if (!validate(true)) return;
    var body = {
      action: 'register',
      name: normalizeName(reg.name.value),
      phone: '+380' + localDigits(reg.phone.value),
      website: reg.form.elements.website.value,
      // Дані Telegram (ID, @username) — лише коли форму відкрито в боті
      tg: (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || ''
    };
    setSending(true);
    sendRegistration(body)
      .then(function (res) {
        if (!res || res.ok !== true) {
          var msg = (res && res.error) || 'Не вдалося зареєструватися. Спробуйте ще раз.';
          if (res && res.code === 'name') setFieldError(reg.name, reg.nameErr, msg);
          else if (res && res.code === 'phone') setFieldError(reg.phone, reg.phoneErr, msg);
          else showAlert(msg);
          if (res && res.code === 'closed' && state.payload) { state.payload.registration = false; renderReg(); }
          return;
        }
        var name = res.name || body.name;
        state.regDone = { name: name, number: res.number };
        // Виділяємо себе у списку
        selectOnly(name);
        var auto = store.get(LS_AUTO, []);
        if (auto.indexOf(name) === -1) { auto.push(name); store.set(LS_AUTO, auto.slice(-50)); }
        state.focusKey = name;
        reg.form.reset();
        updateRegReady();
        state.regTried = false;
        renderReg();
        renderNotify(canOfferNotify() ? 'offer' : 'none');
        try { reg.done.focus({ preventScroll: true }); } catch (x) { reg.done.focus(); }
        load();   // підтягнути оновлений список
      })
      .catch(function () {
        showAlert('Не вдалося надіслати заявку. Перевірте інтернет і спробуйте ще раз.');
      })
      .finally(function () { setSending(false); });
  });

  reg.open.addEventListener('click', goReg);
  pc.open.addEventListener('click', goCard);
  pc.back.addEventListener('click', goList);
  pc.body.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'back') { goList(); return; }
    if (act === 'prev' || act === 'next') {
      var nav = cardNav(selectedPlayerName() || ''), to = nav[act];
      if (!to) return;
      selectOnly(to.key);
      renderCard();
      var h = document.getElementById('pcTitle');
      if (h) { try { h.focus({ preventScroll: true }); } catch (x) { h.focus(); } }
      return;
    }
    if (act === 'story') { openStory(selectedPlayerName()); return; }
    if (act === 'share') {
      var nm = selectedPlayerName(), dp = nm ? drawPlayer(nm) : null;
      shareLink(shareUrl(dp && dp.n), (nm || 'Учасник') + ': картка учасника TROUT MASTER');
    }
  });
  ts.open.addEventListener('click', goStats);
  ts.back.addEventListener('click', goList);
  ts.body.addEventListener('click', function (e) { if (e.target.closest('[data-act="back"]')) goList(); });
  // iOS Safari вмикає стан :active (натиснута кнопка) лише якщо на сторінці є обробник дотику
  document.addEventListener('touchstart', function () {}, { passive: true });
  reg.back.addEventListener('click', goList);
  reg.toList.addEventListener('click', goList);
  reg.closedBack.addEventListener('click', goList);

  // Пряме посилання на форму: сайт#register або t.me/бот?startapp=register
  if (location.hash === '#player' || location.hash === '#stats') {
    try { history.replaceState({ tmView: 'list' }, '', location.pathname + location.search); } catch (e) { /* */ }
  }
  var wantReg = /^#register$/.test(location.hash) || /tgWebAppStartParam=register(&|$)/.test(location.hash + location.search);

