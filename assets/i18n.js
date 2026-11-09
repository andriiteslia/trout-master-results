/*
 * TROUT MASTER — мови інтерфейсу (УКР / ENG).
 *
 * Як працює англійська версія:
 *  1. Апка рендерить усе українською, як і раніше.
 *  2. Цей файл стежить за сторінкою (MutationObserver) і кожен текст із кирилицею перекладає:
 *     точний збіг зі словником → фрази з числами (RULES) → окремі фрази (PHRASES) →
 *     усе, що лишилось кирилицею (імена, назви), — транслітерація за постановою КМУ № 55 (як у паспорті, ДМСУ).
 *  3. Дані в пам'яті апки не змінюються — лише те, що бачить людина.
 *
 * Мова: збережений вибір (перемикач у шапці) → мова Telegram → мова браузера. Англійська — лише якщо там «en».
 */
(function () {
  'use strict';

  var LS = 'tm:lang';
  function stored() { try { return localStorage.getItem(LS); } catch (e) { return null; } }
  function tgLang() {
    // Telegram передає мову користувача в адресі міні-застосунку (tgWebAppData → user.language_code)
    try {
      var h = location.hash.slice(1) + '&' + location.search.slice(1);
      var m = h.match(/(?:^|&)tgWebAppData=([^&]*)/);
      if (!m) return '';
      var data = decodeURIComponent(m[1]), u = data.match(/(?:^|&)user=([^&]*)/);
      return u ? (JSON.parse(decodeURIComponent(u[1])).language_code || '') : '';
    } catch (e) { return ''; }
  }
  var pick = stored();
  if (pick !== 'en' && pick !== 'uk') {
    var auto = tgLang() || (navigator.languages && navigator.languages[0]) || navigator.language || '';
    pick = /^en/i.test(auto) ? 'en' : 'uk';
  }
  var EN = pick === 'en';
  document.documentElement.lang = EN ? 'en' : 'uk';
  if (EN) document.documentElement.classList.add('lang-en');

  // Перемикання без перезавантаження: перекладаємо/повертаємо тексти на місці, апка перемальовує свої блоки
  // Вибір пам'ятаємо в браузері, а в Telegram — ще й у хмарі Telegram (не губиться, якщо Telegram почистив кеш, і однаковий на всіх пристроях)
  function cloud() {
    var tg = window.Telegram && window.Telegram.WebApp;
    try { return tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9') ? tg.CloudStorage : null; } catch (e) { return null; }
  }
  function remember(l) {
    try { localStorage.setItem(LS, l); } catch (e) { /* */ }
    var cs = cloud();
    if (cs) try { cs.setItem('tm_lang', l, function () {}); } catch (e) { /* */ }
  }
  // Після завантаження Telegram: беремо збережену в хмарі мову (якщо в браузері її немає або вона інша)
  function syncCloud() {
    var cs = cloud();
    if (!cs) return;
    try {
      cs.getItem('tm_lang', function (err, v) {
        if (err || (v !== 'en' && v !== 'uk')) { if (stored()) remember(stored()); return; }   // у хмарі порожньо — збережемо поточний вибір
        try { localStorage.setItem(LS, v); } catch (e) { /* */ }
        if (v !== pick) apply(v);
      });
    } catch (e) { /* */ }
  }
  function setLang(l) {
    if (l !== 'en' && l !== 'uk') return;
    remember(l);
    apply(l);
  }
  function apply(l) {
    if (l === pick) return;
    pick = l; EN = l === 'en';
    API.lang = pick; API.en = EN;
    document.documentElement.lang = l;
    document.documentElement.classList.toggle('lang-en', EN);
    if (EN) start(); else restore();
    try { window.dispatchEvent(new CustomEvent('tm:lang', { detail: l })); } catch (e) { /* */ }
  }

  // ---------- Транслітерація (КМУ № 55 від 27.01.2010) ----------
  var TL = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ie', 'ж': 'zh', 'з': 'z', 'и': 'y',
    'і': 'i', 'ї': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
    'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'iu', 'я': 'ia',
    'ы': 'y', 'э': 'e', 'ё': 'io', 'ъ': ''
  };
  var TL_START = { 'є': 'ye', 'ї': 'yi', 'й': 'y', 'ю': 'yu', 'я': 'ya' };   // на початку слова
  var CYR = 'А-Яа-яІіЇїЄєҐґЁёЫыЭэЪъ';
  var IS_CYR = new RegExp('[' + CYR + ']');
  var NEED = new RegExp('[' + CYR + '№]');   // що треба перекладати (кирилиця або знак номера)
  function isUp(c) { return !!c && c !== c.toLowerCase() && c === c.toUpperCase(); }
  function translit(s) {
    s = String(s);
    var out = '', prevLetter = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), lo = ch.toLowerCase();
      if (/['’ʼ`]/.test(ch) && prevLetter && IS_CYR.test(s.charAt(i + 1))) continue;   // апостроф не передається
      if (!TL.hasOwnProperty(lo)) { out += ch; prevLetter = /[A-Za-z]/.test(ch); continue; }
      var t = (!prevLetter && TL_START[lo]) || TL[lo];
      if (lo === 'г' && s.charAt(i - 1).toLowerCase() === 'з') t = 'gh';   // «зг» → «zgh»
      if (isUp(ch) && t) t = (isUp(s.charAt(i + 1)) || isUp(s.charAt(i - 1)) && !/[a-zа-яіїєґ]/.test(s.charAt(i + 1))) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1);
      out += t; prevLetter = true;
    }
    return out;
  }

  // ---------- Словник ----------
  // Точні збіги (весь текст вузла, без пробілів по краях)
  var EXACT = {
    'Trout Master: результати': 'Trout Master: results',
    'Онлайн-результати Trout Master. Оновлюються автоматично під час змагань.': 'Trout Master live results. Updated automatically during the competition.',
    'Розділи': 'Sections', 'Результати': 'Results', 'Статистика': 'Statistics', 'Завантаження…': 'Loading…',
    'Назад': 'Back', 'Поділитися': 'Share', 'Зареєструватися': 'Register', 'Підсумки': 'Summary',
    'Підсумкова таблиця': 'Standings', 'Вигляд': 'View', 'Знайти учасника': 'Find a participant', 'Оновити': 'Refresh', 'Не вдалося оновити. Перевірте інтернет': 'Couldn’t refresh. Check your internet connection', '✓ Оновлено: є нові дані': '✓ Updated: new data', '✓ Оновлено — змін немає': '✓ Updated — no changes', 'Оновити дані': 'Refresh data', 'Очистити пошук': 'Clear search',
    'Вибрано в таблиці': 'Selected in the table', 'Вибрано в списку': 'Selected in the list', 'Картка учасника': 'Player card', 'Зняти вибір': 'Clear selection',
    'Результати — у Telegram': 'Results on Telegram', 'Бот напише ваше місце й підсумки після турніру': 'The bot will send you your place and results after the tournament',
    'Закрити': 'Close', 'Отримувати результати': 'Get results', 'Таблиця результатів': 'Results table',
    'До списку': 'To the list', 'Реєстрація': 'Registration', 'Прізвище та ім’я': 'Surname and first name',
    'Номер телефону': 'Phone number', 'Номер бачить лише організатор. На сайті буде тільки прізвище та ім’я.': 'Only the organiser sees your number. The site shows just your name.',
    'Сайт': 'Website', 'Підтвердити реєстрацію': 'Confirm registration',
    'Після реєстрації бот зможе надіслати нагадування перед турніром і ваші результати.': 'Once you register, the bot can send you a reminder before the tournament and your results.',
    'Реєстрацію підтверджено': 'Registration confirmed',
    'Хочете отримувати нагадування перед турніром і результати в Telegram?': 'Want a reminder before the tournament and your results on Telegram?',
    'Отримувати сповіщення': 'Get notifications', '🔔 Готово! Сповіщення прийдуть у Telegram.': '🔔 Done! Notifications will arrive on Telegram.',
    'Переглянути список': 'View the list', 'Ой, не встигли 😔': 'Oops, too late 😔',
    'На жаль, реєстрацію вже закрито. Але не засмучуйтесь: стежте за анонсами, наступного разу обов’язково встигнете!': 'Sorry, registration is already closed. Don’t be upset — follow the announcements and you’ll make it next time!',
    'До списку учасників': 'To the participant list', 'До таблиці': 'To the table',
    'Аркуш': 'Sheet', 'Не вдалося завантажити результати': 'Couldn’t load the results',
    'Сторінка повторить спробу автоматично.': 'The page will retry automatically.', 'Завантаження результатів…': 'Loading results…',
    'Результатів ще немає': 'No results yet', 'Таблиця з’явиться тут, щойно судді внесуть перші дані.': 'The table will appear here as soon as the judges enter the first data.',
    'Номер': 'Number', 'Резерв': 'Reserve', 'Немає зв’язку': 'No connection',
    'сервер не відповідає': 'server is not responding', 'неправильна відповідь сервера': 'invalid server response',
    'немає інтернету або сервер недоступний': 'no internet or server unavailable', 'порожня відповідь': 'empty response', 'невідома помилка': 'unknown error',
    'Перемога': 'Win', 'Поразка': 'Loss', 'Рибна нічия': 'Fish draw', 'Безрибна нічия': 'No-fish draw',
    'Рибна Нічия': 'Fish draw', 'Безрибна Нічия': 'No-fish draw', 'Перемоги': 'Wins', 'Поразки': 'Losses',
    'Рибні нічиї': 'Fish draws', 'Безрибні нічиї': 'No-fish draws', 'Виграш': 'Win', 'Виграші': 'Wins',
    'Виберіть учасника в таблиці.': 'Select a participant in the table.',
    'До підсумку': 'To standings', 'Поділитися результатом': 'Share result', 'Поділитися карткою': 'Share card',
    'Бали': 'Points', 'Улов': 'Catch', 'Проти суперників': 'Vs opponents',
    'Турнір ще не почався. Тут уже видно жеребкування, а статистика з’явиться після перших турів.': 'The tournament hasn’t started yet. The draw is already here; statistics will appear after the first rounds.',
    'Тури': 'Rounds', 'Тур': 'Round', 'Сектор': 'Sector', 'Суперник': 'Opponent', 'Результат': 'Result',
    'наступний': 'next', 'очікується': 'pending', 'Улов по турах': 'Catch by round', 'улов учасника': 'participant’s catch',
    'середній улов у турі': 'average catch per round', 'Місце по турах': 'Place by round',
    'Місце після кожного туру: бали (В 3, РН 2, БН 1, П 0), при рівних — більше перемог, далі більше риби': 'Place after each round: points (W 3, FD 2, ND 1, L 0); ties go to more wins, then more fish',
    'Відсоток перемог': 'Win rate', 'Сумарно проти суперників': 'Total vs opponents', 'Середній улов за тур': 'Average catch per round',
    'Частка від усієї риби': 'Share of all fish', 'Найкращий тур': 'Best round', 'Найдовша серія перемог': 'Longest winning streak',
    'Найуловистіший сектор': 'Most productive sector', 'Найслабший сектор': 'Weakest sector',
    'Найуловистіший сектор турніру': 'Most productive sector of the tournament', 'Найслабший сектор турніру': 'Weakest sector of the tournament',
    'Статистика': 'Statistics', 'По турніру': 'Tournament', 'Обіграно': 'Beat', 'Програно': 'Lost to',
    'Особисті зустрічі': 'Head-to-head', 'Учасник у цьому секторі ще не рибалив': 'The participant hasn’t fished this sector yet',
    'Учасник у цьому секторі не рибалив': 'The participant didn’t fish this sector',
    'Статистика | Trout Master': 'Statistics | Trout Master', 'Статистика з’явиться після перших турів.': 'Statistics will appear after the first rounds.',
    'Учасники': 'Participants', 'Підсумок': 'Standings', 'По турах': 'By round', 'Турів зіграно': 'Rounds played', 'Турів': 'Rounds',
    'Батлів зіграно': 'Battles played', 'Батлів': 'Battles', 'Усього риби': 'Total fish', 'Середній улов': 'Average catch',
    'на учасника за тур': 'per participant per round', 'Скільки риби спіймали всі учасники за тур': 'Fish caught by all participants in each round',
    'Найбільший улов за тур': 'Biggest catch in a round', 'Найбільше «сухих» перемог': 'Most “dry” wins',
    'суперник не спіймав жодної риби': 'the opponent caught no fish', 'Рекорди': 'Records', 'Топ за уловом': 'Top by catch',
    'Поруч — місце за балами': 'Next to it — place by points', 'Результати турів': 'Round results',
    'Тури →': 'Rounds →', 'Сек.': 'Sec.', 'Сер.': 'Avg', 'Карта секторів': 'Sector map',
    'Рядок — сектор, колонка — тур.': 'Row — sector, column — round.',
    'У клітинці — скільки риби спіймали в цьому секторі за тур (обидва береги разом). «Сер.» — середній улов на учасника за тур у секторі.': 'Each cell — fish caught in this sector in the round (both banks together). “Avg” — average catch per participant per round in the sector.',
    'Карта секторів: улов по секторах і турах': 'Sector map: catch by sector and round', 'мало': 'few', 'багато': 'many',
    'Усі тури': 'All rounds', 'Колір і число — середній улов на учасника за тур у секторі за весь турнір.': 'Colour and number — average catch per participant per round in the sector over the whole tournament.',
    'Карта водойми': 'Pond map', 'Тур для карти': 'Round for the map', 'водойма': 'pond', 'найкращий': 'best', 'найслабший': 'weakest',
    'Реєстрація | Trout Master': 'Registration | Trout Master', '🔔 Готово!': '🔔 Done!', 'Результати прийдуть у Telegram': 'Results will arrive on Telegram',
    'Вкажіть прізвище та ім’я.': 'Enter your surname and first name.', 'Використовуйте лише літери, дефіс та апостроф.': 'Use only letters, hyphens and apostrophes.',
    'Вкажіть і прізвище, і ім’я, наприклад: Шевченко Тарас.': 'Enter both surname and first name, e.g. Shevchenko Taras.',
    'Задовге ім’я. Вкажіть лише прізвище та ім’я.': 'The name is too long. Enter just your surname and first name.',
    'Вкажіть номер телефону.': 'Enter your phone number.', 'Перевірте номер: після +380 не може йти 0.': 'Check the number: it can’t start with 0 after +380.',
    'Номер неповний: після +380 потрібно ввести 9 цифр.': 'The number is incomplete: enter 9 digits after +380.',
    'Надсилаємо…': 'Sending…', 'Не вдалося зареєструватися. Спробуйте ще раз.': 'Registration failed. Please try again.',
    'Не вдалося надіслати заявку. Перевірте інтернет і спробуйте ще раз.': 'Couldn’t send the application. Check your internet connection and try again.',
    'Невідомий запит.': 'Unknown request.', 'Не вдалося зберегти заявку. Спробуйте ще раз за хвилину.': 'Couldn’t save the application. Try again in a minute.',
    'Вкажіть прізвище та ім’я, наприклад: Шевченко Тарас.': 'Enter your surname and first name, e.g. Shevchenko Taras.',
    'Вкажіть номер у форматі +380 XX XXX XX XX.': 'Enter the number as +380 XX XXX XX XX.',
    'Зараз багато заявок. Спробуйте ще раз за хвилину.': 'Lots of applications right now. Try again in a minute.',
    'Ой, не встигли: на жаль, реєстрацію вже закрито.': 'Oops, too late: registration is already closed.',
    'Учасник': 'Participant', 'БАЛИ': 'POINTS', 'УЛОВ': 'CATCH', 'ПЕРЕМОГИ': 'WINS', 'ПРОТИ СУПЕРНИКІВ': 'VS OPPONENTS',
    'НАЙКРАЩИЙ ТУР': 'BEST ROUND', 'ВІДРИВ': 'LEAD', 'РЕЗУЛЬТАТИ Й СТАТИСТИКА': 'RESULTS & STATS',
    'Формат картинки': 'Image format', 'Сторіс 9:16': 'Story 9:16', 'Допис 4:3': 'Post 4:3',
    'Утримуй картинку, щоб зберегти її. Якщо не виходить — відкрий апку в браузері.': 'Press and hold the image to save it. If that doesn’t work, open the app in a browser.',
    'Зберегти': 'Save', 'Відрив': 'Lead', 'далі — резерв': 'then the reserve list', 'До закриття': 'Closes in',
    'Триває реєстрація': 'Registration open', 'Реєстрацію закрито': 'Registration closed', 'Сьогодні': 'Today', 'Завтра': 'Tomorrow',
    'Зареєстровано': 'Registered', 'Учасників': 'Participants', 'До старту': 'Starts in', 'Вільних місць': 'Free places', 'Вільно': 'Free',
    'усі місця зайняті': 'all places taken', 'До закриття реєстрації': 'Registration closes in', 'Закрита': 'Closed',
    'Переможець': 'Winner', 'Лідер': 'Leader', 'Риби': 'Fish', 'Середній': 'Average', 'риби на учасника за тур': 'fish per participant per round',
    'Подіум': 'Podium', 'Найбільше риби': 'Most fish', 'Як рахуються бали': 'How points work',
    'перемога — 3': 'win — 3', 'рибна нічия — 2': 'fish draw — 2', 'безрибна нічия — 1': 'no-fish draw — 1', 'поразка — 0': 'loss — 0',
    'Список учасників': 'Participant list', 'У порядку реєстрації': 'In order of registration', 'Результати по турах': 'Results by round',
    'У клітинці — результат і улов учасника в турі': 'Each cell — the participant’s result and catch in the round',
    'Бали → перемоги → риба': 'Points → wins → fish', 'Місце': 'Place', 'Останні 5': 'Last 5', 'Нікого не знайдено': 'No one found',
    'Спробуйте інше прізвище.': 'Try another surname.', 'Перем.': 'Wins', 'гортайте →': 'scroll →', 'Вільне місце': 'Free place',
    'TROUT MASTER — результати онлайн': 'TROUT MASTER — live results', 'Таблиця, тури, картки учасників і статистика турніру з ловлі форелі. Оновлюється наживо.': 'Standings, rounds, player cards and stats of the trout fishing tournament. Updated live.', 'Завантаження картки…': 'Loading card…', 'ще попереду': 'upcoming', 'На головну': 'Home', 'Trout Master — на головну': 'Trout Master — home', 'Учасника не знайдено': 'Participant not found', 'Можливо, дані щойно оновились. Виберіть учасника в таблиці, щоб відкрити його картку.': 'The data may have just been updated. Select a participant in the table to open their card.', 'Статистики поки немає': 'No statistics yet', 'Вона з’явиться після перших зіграних турів.': 'It will appear after the first rounds are played.', 'Ви в списку учасників': 'You’re on the participant list', 'Увімкніть сповіщення — надішлемо жеребкування, нагадування й ваші результати': 'Turn on notifications — we’ll send the draw, reminders and your results', 'Увімкнути сповіщення': 'Turn on notifications', 'Жеребкування, нагадування й результати прийдуть у Telegram': 'The draw, reminders and results will arrive in Telegram', 'Порівняти': 'Compare', 'Порівняти учасників': 'Compare players', 'Порівняння': 'Comparison', 'Основне': 'Main', 'Підсумок порівняння': 'Comparison summary', 'Посилання скопійовано': 'Link copied', '✓ Посилання скопійовано': '✓ Link copied', 'Берег': 'Bank', 'Сектори': 'Sectors', 'Жеребкування': 'Draw',
    'Наш партнер FISH.ME.FISH': 'Our partner FISH.ME.FISH', 'Наш партнер FISH.ME.FISH у Telegram': 'Our partner FISH.ME.FISH on Telegram',
    'В': 'W', 'РН': 'FD', 'БН': 'ND', 'П': 'L', 'Л': 'L', 'В · РН · БН · П': 'W · FD · ND · L',
    'лівий': 'left', 'правий': 'right', 'турів': 'rounds', 'тури': 'rounds', 'туру': 'round', 'риби': 'fish', 'риб': 'fish', 'риба': 'fish',
    'бали': 'points', 'балів': 'points', 'бал': 'point', 'учасників': 'participants', 'учасники': 'participants',
    'Оновлено': 'Updated', 'Оновлено –': 'Updated –',
    'берег': 'bank', 'перемог': 'wins', 'перемога': 'win', 'перемоги': 'wins', 'від': 'over', 'після': 'after', 'усі': 'all',
    'завершено': 'finished', 'Зіграно': 'Played', 'Заповнено': 'Filled', 'місце': 'place', 'місця': 'places', 'місць': 'places',
    'учасник': 'participant', 'батл': 'battle', 'батли': 'battles', 'батлів': 'battles', 'день': 'day', 'дні': 'days', 'днів': 'days',
    'Шевченко Тарас': 'Shevchenko Taras', 'УКР': 'УКР', 'Мова': 'Language', 'д': 'd', 'год': 'h', 'г': 'h', 'хв': 'min', 'с': 's'
  };

  var MON_FULL = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  var MON_SHORT = ['січ.', 'лют.', 'бер.', 'кві.', 'тра.', 'чер.', 'лип.', 'сер.', 'вер.', 'жов.', 'лис.', 'гру.'];
  var EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  MON_FULL.forEach(function (m, i) { EXACT[m] = EN_FULL[i]; });
  MON_SHORT.forEach(function (m, i) { EXACT[m] = EN_SHORT[i]; EXACT[m.replace('.', '')] = EN_SHORT[i]; });
  function ord(n) {
    n = +n; var a = n % 100, b = n % 10;
    return n + (a > 10 && a < 14 ? 'th' : b === 1 ? 'st' : b === 2 ? 'nd' : b === 3 ? 'rd' : 'th');
  }
  var L_ = '(^|[^' + CYR + '\'’])', R_ = '(?![' + CYR + '])';   // межі слова для кирилиці
  var CODE = { 'В': 'W', 'РН': 'FD', 'БН': 'ND', 'П': 'L' };

  // Фрази з числами — по черзі, до словника фраз
  var RULES = [
    // Порівняння учасників (src/js/57-compare.js)
    [/^([^,]+), краще: /, function (m, l) { return (EXACT[l] || l) + ', better: '; }],
    [/^([^,]+), порівну$/, function (m, l) { return (EXACT[l] || l) + ', tie'; }],
    [/^Порівняння: (.+) і (.+)$/, 'Comparison: $1 and $2'],
    [/ — краще у (\d+) з (\d+) показник[а-яіїєґ]*/, ' — better in $1 of $2 metrics'],
    [/^Порівну: по (\d+) кращ[а-яіїєґ]* показник[а-яіїєґ]*/, 'Even: $1 better metrics each'],
    [/, порівну — (\d+)$/, ', tied in $1'],
    [/^Різниця: /, 'Difference: '],
    [/^Вартість участі — (.+?)(?:\s|\u00a0)?грн$/, 'Entry fee: $1 UAH'],
    [/^Вартість участі — /, 'Entry fee: '],
    [/^Перевага в показниках не означає вищого місця: його вирішують бали за перемоги в турах\. Тому вище в таблиці — (.+)\.$/, 'Better stats don’t mean a higher place: it’s decided by points for round wins. That’s why $1 is higher in the standings.'],
    [/^Перевага в показниках не означає вищого місця: його вирішують бали за перемоги в турах\.$/, 'Better stats don’t mean a higher place: it’s decided by points for round wins.'],
    [/, переміг (.+), (\d+) : (\d+)$/, ', won by $1, $2 : $3'],
    [/^Перемоги між собою (\d+) : (\d+)$/, 'Head-to-head wins $1 : $2'],
    [/сектор (\d+)/g, 'sector $1'],
    [/^тур (\d+)$/, 'round $1'],
    [/^Оновлено\s+(.+)$/, function (m, a) { return 'Updated ' + a; }],
    [/(\d+)\s?(РН|БН|В|П)(?=\s|$|·|,|\))/g, function (m, n, c) { return n + CODE[c]; }],
    [/(\d+) перемог, (\d+) рибних нічиїх, (\d+) безрибних, (\d+) поразок/, '$1 wins, $2 fish draws, $3 no-fish draws, $4 losses'],
    [/(\d+) місце з (\d+)/g, function (m, a, b) { return ord(a) + ' of ' + b; }],
    [/Після туру (\d+): (\d+) місце/g, function (m, a, b) { return 'After round ' + a + ': ' + ord(b) + ' place'; }],
    [/(\d+) місце/g, function (m, a) { return ord(a) + ' place'; }],
    [/(\d+)-го місця/g, function (m, a) { return ord(a) + ' place'; }],
    [/До (\d+(?:st|nd|rd|th) place)/g, 'To $1'],
    [/стільки ж балів у (\d+(?:st|nd|rd|th) place)/g, 'same points as $1'],
    [/від (\d+(?:st|nd|rd|th) place)/g, 'over $1'],
    [/ до (\d+(?:st|nd|rd|th) place)/g, ' to $1'],
    [/Тур (\d+) з (\d+) · завершено/g, 'Round $1 of $2 · finished'],
    [/Зіграно (\d+) з (\d+)/g, 'Played $1 of $2'],
    [/після (\d+) з (\d+)/g, 'after $1 of $2'],
    [/усі (\d+) (rounds?|турів|тури)/g, 'all $1 rounds'],
    [/(\d+) з (\d+) місць зайнято/g, '$1 of $2 places taken'],
    [/Заповнено (\d+) з (\d+)/g, 'Filled $1 of $2'],
    [/Зареєстровано (\d+) з (\d+)/g, 'Registered $1 of $2'],
    [/Зареєстровано (\d+)/g, 'Registered $1'],
    [/^ще (\d+) (places?)$/, '$1 $2 left'],
    [/(\d+) з (\d+)/g, '$1 of $2'],
    [new RegExp(L_ + 'Тур (\\d+)', 'g'), '$1Round $2'],
    [new RegExp(L_ + 'тур (\\d+)', 'g'), '$1round $2'],
    [new RegExp(L_ + 'тури (\\d+)', 'g'), '$1rounds $2'],
    [new RegExp(L_ + 'Сектор (\\d+)', 'g'), '$1Sector $2'],
    [new RegExp(L_ + 'сектор (\\d+)', 'g'), '$1sector $2'],
    [/Риб: ([\d\s]+)/g, 'Fish: $1'],
    [/^(\d+)Л$/, '$1L'], [/^(\d+)П$/, '$1R'],
    [/Цей номер уже зареєстровано: (.+)\.$/, 'This number is already registered: $1.'],
    [/Учасник «(.+)» уже є у списку\. Якщо це інша людина, напишіть організатору\./, 'Participant “$1” is already on the list. If it’s a different person, please contact the organiser.'],
    [/(\d+) д (\d+) год (\d+) хв/g, '$1 d $2 h $3 min'], [/(\d+) год (\d+) хв/g, '$1 h $2 min'],
    [/(\d+) д (\d\d):/g, '$1 d $2:'],
    [new RegExp('(\\d{1,2})\\s+(' + MON_FULL.join('|') + ')', 'g'), function (m, d, mo) { return d + ' ' + EN_FULL[MON_FULL.indexOf(mo)]; }],
    [new RegExp('(\\d{1,2})\\s+(' + MON_SHORT.join('|').replace(/\./g, '\\.') + ')', 'g'), function (m, d, mo) { return EN_SHORT[MON_SHORT.indexOf(mo)] + ' ' + d + ','; }],
    [/№\s?(\d+)/g, '#$1']
  ];

  // Окремі фрази (у межах слова), довші — першими
  var PHRASES = {
    'ще попереду': 'upcoming',
    'піднявся на': 'moved up', 'Рибна нічия': 'Fish draw', 'Безрибна нічия': 'No-fish draw', 'рибна нічия': 'fish draw', 'безрибна нічия': 'no-fish draw',
    'Рибні нічиї': 'Fish draws', 'Безрибні нічиї': 'No-fish draws', 'Перемоги': 'Wins', 'Поразки': 'Losses',
    'Колір і число — середній улов на учасника за тур у секторі за весь турнір': 'Colour and number — average catch per participant per round in the sector over the whole tournament', 'опустився на': 'moved down',
    'Не вдається отримати свіжі дані': 'Can’t get fresh data', 'Показано результати станом на': 'Showing results as of',
    'Не вдалося завантажити результати': 'Couldn’t load the results', 'Сторінка повторить спробу автоматично': 'The page will retry automatically',
    'сервер відповів': 'server responded', 'Лівий берег': 'Left bank', 'Правий берег': 'Right bank', 'лівий берег': 'left bank', 'правий берег': 'right bank',
    'Попередній учасник': 'Previous participant', 'Наступний учасник': 'Next participant', 'Картка учасника': 'Player card',
    'в середньому по турніру': 'tournament average', 'по турніру в середньому': 'tournament average', 'за тур': 'per round',
    'найдовша серія': 'longest streak', 'серія': 'streak', 'поспіль': 'in a row', 'різниця': 'difference', 'турніру': 'in the tournament',
    'проти': 'vs', 'Учасник': 'Participant', 'Улов учасника тут': 'Participant’s catch here', 'в середньому': 'on average',
    'на учасника за тур': 'per participant per round', 'усього': 'total', 'суперник не спіймав жодної риби': 'the opponent caught no fish',
    'у кожному один учасник виграє, а другий програє, або обидва грають унічию': 'in each, one participant wins and the other loses, or both draw',
    'скільки риби спіймали в секторі (обидва учасники разом)': 'fish caught in the sector (both participants together)',
    'Карта водойми': 'Pond map', 'Карта секторів': 'Sector map', 'Улов по турах': 'Catch by round', 'Місце після кожного туру': 'Place after each round',
    'ще не зіграно': 'not played yet', 'до кінця': 'ends in', 'Реєстрація триває до': 'Registration is open until',
    'ви в списку учасників': 'you’re on the participant list', 'під номером': 'as number', 'картка учасника TROUT MASTER': 'TROUT MASTER player card',
    'результати наживо': 'live results', 'Результат': 'Result', 'Триває реєстрація': 'Registration open', 'до': 'until',
    'Бали · риби': 'Points · fish', 'Риби': 'Fish', 'Сектор': 'Sector', 'сектор': 'sector', 'Тур': 'Round', 'тур': 'round',
    'на учасника': 'per participant', 'рибалив': 'fished', 'Наш партнер': 'Our partner', 'у Telegram': 'on Telegram',
    'Підсумок': 'Standings', 'Учасники': 'Participants', 'Результати': 'Results', 'Статистика': 'Statistics', 'Лідер': 'Leader'
  };

  var PH_KEYS = Object.keys(PHRASES).sort(function (a, b) { return b.length - a.length; });
  var PH_RE = new RegExp(L_ + '(' + PH_KEYS.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')' + R_, 'g');

  var misses = {};
  var extra = {};   // переклади назви/підзаголовка турніру з таблиці (Google Translate у скрипті)
  var cache = {};
  function tr(s) {
    if (!EN || s == null) return s;
    s = String(s);
    if (!NEED.test(s)) return s;
    if (cache.hasOwnProperty(s)) return cache[s];
    var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim(), out;
    if (extra.hasOwnProperty(core)) out = extra[core];
    else if (EXACT.hasOwnProperty(core)) out = EXACT[core];
    else {
      out = core;
      for (var i = 0; i < RULES.length; i++) out = out.replace(RULES[i][0], RULES[i][1]);
      out = out.replace(PH_RE, function (m, pre, k) { return pre + PHRASES[k]; });
      if (IS_CYR.test(out)) {
        // Що лишилося: окремі слова зі словника, решта — транслітерація (імена, назви)
        out = out.replace(new RegExp('[' + CYR + '][' + CYR + '\'’ʼ-]*', 'g'), function (w) {
          if (EXACT.hasOwnProperty(w)) return EXACT[w];
          misses[w] = core;   // для перевірки: що пішло в транслітерацію (має бути лише імена й назви)
          return translit(w);
        });
      }
    }
    out = lead + out + tail;
    cache[s] = out;
    return out;
  }

  // ---------- Сторінка: перекладаємо тексти й підписи ----------
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'content'];
  var busy = false, observing = false;
  var ORIG = new WeakMap(), ORIG_A = new WeakMap();   // українські оригінали — щоб повернути без перезавантаження
  function setAttr(el, name, val) {
    var o = ORIG_A.get(el) || {};
    o[name] = val; ORIG_A.set(el, o);
    el.setAttribute(name, tr(val));
  }
  function fixNode(n) {
    if (n.nodeType === 3) {
      var v = n.nodeValue;
      if (v && NEED.test(v)) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') return;
        var t = tr(v); if (t !== v) { ORIG.set(n, v); n.nodeValue = t; }
      }
      return;
    }
    if (n.nodeType !== 1) return;
    if (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = n.getAttribute(ATTRS[i]);
      if (a && NEED.test(a)) setAttr(n, ATTRS[i], a);
    }
    for (var c = n.firstChild; c; c = c.nextSibling) fixNode(c);
  }
  function restore() {
    busy = true;
    var w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (ORIG.has(n)) { n.nodeValue = ORIG.get(n); ORIG.delete(n); } }
      else if (ORIG_A.has(n)) { var o = ORIG_A.get(n); for (var k in o) n.setAttribute(k, o[k]); ORIG_A.delete(n); }
    }
    busy = false;
  }
  function start() {
    if (!EN) return;
    busy = true; fixNode(document.documentElement); busy = false;
    if (observing) return;
    observing = true;
    new MutationObserver(function (list) {
      if (busy || !EN) return;
      busy = true;
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') for (var j = 0; j < m.addedNodes.length; j++) fixNode(m.addedNodes[j]);
        else if (m.type === 'characterData') fixNode(m.target);
        else if (m.type === 'attributes') {
          var a = m.target.getAttribute(m.attributeName);
          if (a && NEED.test(a)) setAttr(m.target, m.attributeName, a);
        }
      }
      busy = false;
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // Англійські форми для plural() апки: ключ — українська форма «один»
  var PL = {
    'бал': ['point', 'points'], 'риба': ['fish', 'fish'], 'місце': ['place', 'places'], 'місця': ['place', 'places'],
    'тур': ['round', 'rounds'], 'туру': ['round', 'rounds'], 'учасник': ['participant', 'participants'],
    'перемога': ['win', 'wins'], 'батл': ['battle', 'battles'], 'день': ['day', 'days']
  };
  function plural(n, one, few, many) {
    var f = PL[one];
    return f ? (Math.abs(n) === 1 ? f[0] : f[1]) : null;
  }

  var API = window.TM_I18N = {
    lang: pick, en: EN, misses: misses, tr: tr, translit: translit, plural: plural, setLang: setLang, syncCloud: syncCloud, start: start, ord: ord,
    setEvent: function (ev) {
      if (!ev) return;
      if (ev.title && ev.titleEn) extra[String(ev.title).trim()] = ev.titleEn;
      if (ev.subtitle && ev.subtitleEn) extra[String(ev.subtitle).trim()] = ev.subtitleEn;
      // На сторінці підзаголовок показується частинами («дата • місце • водойма») — зіставляємо частини
      if (ev.subtitle && ev.subtitleEn) {
        var ua = String(ev.subtitle).split(/\s*[•·|]\s*/), en = String(ev.subtitleEn).split(/\s*[•·|]\s*/);
        if (ua.length === en.length) ua.forEach(function (x, i) { if (x && en[i] && IS_CYR.test(x)) extra[x.trim()] = en[i].trim(); });
      }
      cache = {};
    }
  };
  // Стартуємо одразу (скрипт у <head>): спостерігач перекладає й те, що браузер іще дочитує, — без «миготіння» української
  if (EN) start();
})();
