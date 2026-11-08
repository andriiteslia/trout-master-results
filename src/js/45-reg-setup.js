  // ===== src/js/45-reg-setup.js — Реєстрація: елементи форми =====
  // ---------- Реєстрація ----------
  // Кнопка «Зареєструватися» видно, коли на аркуші «Сайт» реєстрація «Відкрита».
  // Форма відкривається на тій самій сторінці (без перезавантаження), кнопка «Назад»
  // браузера та Telegram повертає до списку.
  var IN_TG = document.documentElement.classList.contains('tg');
  var reg = {
    root: $('reg'), back: $('regBack'), title: $('regTitle'), event: $('regEvent'),
    form: $('regForm'), name: $('fName'), phone: $('fPhone'), nameErr: $('fNameErr'), phoneErr: $('fPhoneErr'),
    alert: $('regAlert'), submit: $('regSubmit'), done: $('regDone'), doneText: $('regDoneText'),
    toList: $('regToList'), closed: $('regClosed'), closedBack: $('regClosedBack'),
    bar: $('regbar'), open: $('regOpen'), live: $('regLive'),
    timer: $('regTimer'), timerTxt: $('regTimerTxt'), timerSr: $('regTimerSr')
  };
