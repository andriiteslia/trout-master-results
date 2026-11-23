/**
 * Trout Master — API результатів для сайту.
 *
 * Як це працює:
 * 1. У таблиці раунду є аркуш «Сайт» зі списком «Дія» (клітинка B3).
 * 2. Вибираєте «Опублікувати на сайт» → скрипт знімає поточні результати
 *    і зберігає їх, а список повертається у «—».
 * 3. Сайт кожні кілька секунд питає скрипт, чи є нова публікація.
 *    Саму таблицю він не читає, тож глядачі бачать лише опубліковане.
 *
 * Дві таблиці:
 *   — АДМІНКА (SETTINGS.SPREADSHEET_ID): аркуші «Сайт», «Положення», «Відвідування», журнали, «Партнери».
 *     Тут налаштування сайту, реєстрації й розсилки — вони не змінюються від раунду до раунду.
 *   — ТАБЛИЦЯ РАУНДУ (посилання в B2 на аркуші «Сайт»): «Учасники», «Жеребкування», «Results» і «Пульт».
 *     На «Пульті» — «Опублікувати на сайт», «Турів у раунді» й «Надіслати особисті результати»,
 *     тож під час змагань достатньо тримати відкритою лише таблицю раунду.
 *   Новий раунд: зробіть копію таблиці раунду, очистіть її і вставте посилання в B2 адмінки —
 *   скрипт сам створить «Пульт» і підключиться до нової таблиці. B2 порожня — усе береться з адмінки.
 *
 * Перший запуск (і після оновлення коду): запустіть функцію setupSync.
 *   Вона створить/оновить аркуш «Сайт», підключить таблицю раунду й опублікує дані.
 *
 * Реєстрація: у B8 на аркуші «Сайт» виберіть «Відкрита», і на сайті з'явиться кнопка
 *   «Зареєструватися». Заявки дописуються в аркуш «Учасники»: A — номер, B — прізвище та ім'я,
 *   E — телефон (на сайт не потрапляє), F — час реєстрації,
 *   G — Telegram ID і H — @username (якщо заявку надіслано з міні-застосунку бота).
 *   Після жеребкування в колонку A вписуються номери, які учасники витягнули (1–28): за ними
 *   скрипт підставляє імена в аркуш «Жеребкування» і в картки учасників.
 *   Хто відкривав застосунок у Telegram, записується в аркуш «Відвідування» (лише з BOT_TOKEN).
 *   Щоб Telegram ID не можна було підробити, впишіть токен бота у властивості скрипта:
 *   ⚙️ «Налаштування проєкту» → «Властивості скрипта» → BOT_TOKEN.
 *
 * Що показувати, вибирається у B5 на аркуші «Сайт» (MODES нижче):
 * «Список учасників» або «Результати». Для кожного режиму задано вкладки:
 * назва вкладки,
 * аркуш і діапазон колонок. Перші два рядки діапазону — заголовки.
 * Номер останнього рядка можна не вказувати: скрипт візьме всі заповнені.
 */

var SETTINGS = {
  SPREADSHEET_ID: 'https://docs.google.com/spreadsheets/d/13wvgmiuQeCl6ap4QmScSdf1dR0_wUuljV9-1-GggLdk/edit',
  EVENT_TITLE: 'Round 1',
  EVENT_SUBTITLE: '21 листопада • Плугів • Krychevychi Area Fishing',
  // Адреса розгортання (/exec) — для вебхука Telegram. Та сама, що в config.js сайту.
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxbXAq9BaSu4nxH27TCGc2HZkzt7RlrWtWAle7zF20802ujhpsfMBLek1efKtXexdNF/exec',
  // Сайт (міні-застосунок) — для кнопки в привітанні бота
  SITE_URL: 'https://troutmaster.app/',
  // Відповідь бота на Start. Порожньо — бот мовчить.
  BOT_GREETING: 'Привіт! Тут онлайн-результати та реєстрація на турніри TROUT MASTER 🎣\nНатисни кнопку нижче, щоб відкрити застосунок.'
};

/**
 * Діапазон «авто»: скрипт сам знаходить блоки на аркуші «Results»:
 * «Тури» — від першого «#» до колонки «Місце»; «Результат» — від другого «#» до останньої колонки із заголовком.
 * Так однаково працюють таблиці на 10, 12 чи 14 турів.
 */
var RANGE_AUTO = 'авто';
var VIEWS = [
  { name: 'Результат', sheet: 'Results', range: RANGE_AUTO },
  { name: 'Тури',      sheet: 'Results', range: RANGE_AUTO }
];
var OLD_DEFAULT_RANGES = { 'Результат': 'AM1:AQ', 'Тури': 'A1:AK' };   // старі значення з коду → «авто»

/** Режими показу: що саме бачать глядачі. headerRows — скільки рядків заголовків. */
var MODE_REG = 'Список учасників';
var MODE_RES = 'Результати';
var MODES = {};
MODES[MODE_REG] = [{ name: 'Учасники', sheet: 'Учасники', range: 'A1:B', headerRows: 1 }];
// MODES[MODE_RES] = VIEWS (див. вище)
MODES[MODE_RES] = VIEWS;

/** Аркуш з кнопкою публікації та його клітинки. */
var SYNC_SHEET = 'Сайт';
var ACTION_IDLE = '—';
var ACTION_PUBLISH = 'Опублікувати на сайт';
var CELL_ROUND = 'B2';         // посилання на таблицю поточного раунду (порожньо — дані з адмінки)
var CELL_PUBLISH = 'B3';
var CELL_STATUS = 'B4';
var CELL_MODE = 'B5';
var CELL_TITLE = 'B6';
var CELL_SUBTITLE = 'B7';
var CELL_REG = 'B8';
var REG_OPEN = 'Відкрита';
var REG_CLOSED = 'Закрита';
var CELL_MOVES = 'B9';          // стрілки ▲▼ зміни місць у таблиці
var MOVES_ON = 'Показувати';
var MOVES_OFF = 'Приховати';
var CELL_SEATS = 'B10';         // кількість місць; хто зареєструвався після — у резерві
var CELL_DEADLINE = 'B11';      // дата завершення реєстрації (порожньо — без обмеження)
var CELL_DEADLINE_TIME = 'C11'; // час завершення, напр. 20:00 (порожньо — час із B11 або 00:00)
var CELL_CARD = 'B12';          // «Картка учасника» на сайті: показувати чи ні
var CELL_SECTORS = 'B13';       // скільки секторів на водоймі (по половині на кожному березі)
var CELL_FEE = 'B14';           // вартість участі: показується у формі реєстрації під кнопкою
var CELL_PAYCARD = 'C14';       // реквізити для оплати (номер картки, можна з ім'ям): кнопка «Скопіювати реквізити» в апці
var CELL_PAY = 'D14';           // кнопка «Оплатити участь» на сайті: показувати чи ні (підпис — у D13)
var PAY_ON = 'Показувати';
var PAY_OFF = 'Приховати';
var CARD_ON = 'Показувати';
var CARD_OFF = 'Приховати';

/** Куди пишуться заявки з форми реєстрації (номери колонок: A=1, B=2, ...). */
var REG_SHEET = 'Учасники';
var REG_COL_NUM = 1;     // A — порядковий номер
var REG_COL_NAME = 2;    // B — прізвище та ім'я
var REG_COL_SUM = 4;     // D — сума оплати, грн (лише для організатора; у D1 — «Зібрано: N грн»)
var REG_COL_PAID = 3;    // C — оплата (галочка; на сайті — значок «оплачено» біля імені)
var REG_COL_PHONE = 5;   // E — телефон (лише для організатора)
var REG_COL_TIME = 6;    // F — час реєстрації
var REG_COL_TG_ID = 7;   // G — Telegram ID (якщо реєструвались через бота)
var REG_COL_TG_USER = 8; // H — @username у Telegram

/**
 * Діапазони, які можна змінювати прямо на аркуші «Сайт» (блок «Діапазони…», B16:B18).
 * Формат: A1:B50, A1:AK (без номера рядка — до останнього заповненого)
 * або з назвою аркуша: Results!A1:AK. Порожня клітинка — діапазон із коду.
 */
var RANGE_ROW_FIRST = 17;     // якщо блок зсунуто, рядок шукається за заголовком «Діапазони…»
var RANGES_TITLE = 'Діапазони (звідки брати дані)';

/** Перший рядок блоку діапазонів (під заголовком «Діапазони…»). */
function rangeRowFirst_(sh) {
  if (!sh) return RANGE_ROW_FIRST;
  var col = sh.getRange(1, 1, 40, 1).getDisplayValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === RANGES_TITLE) return i + 2;
  return RANGE_ROW_FIRST;
}
var RANGE_KEYS = ['Учасники', 'Результат', 'Тури'];

/**
 * Жеребкування (аркуш «Жеребкування»): вставляється кнопкою «📋 Для таблиці» із сервісу жеребкування.
 * Рядок на гравця: № | Учасник | Сторона | Тур 1 сектор | Тур 1 суперник | Тур 2 сектор | …
 * Публікується разом із результатами для «Картки гравця». Імена беруться з «Учасників» за номером.
 */
var DRAW_SHEET = 'Жеребкування';
// Положення турніру для апки: A — назва розділу, B — пункти (кожен з нового рядка, Ctrl+Enter).
// Розділ «Розклад» показується як таблиця «час — подія». Зміни публікуються одразу, якщо режим «Список учасників».
var RULES_SHEET = 'Положення';

/**
 * «Пульт» у таблиці раунду: те, що потрібно під час змагань, без переходу в адмінку.
 * B3 — «Опублікувати на сайт», B4 — остання публікація, B5 — турів у раунді (10, 12…),
 * B6 — надіслати особисті результати, B7 — стан розсилки.
 */
var PULT_SHEET = 'Пульт';
var PULT_PUBLISH = 'B3';
var PULT_STATUS = 'B4';
var PULT_TOURS = 'B5';
var PULT_RES = 'B6';
var PULT_RES_STATUS = 'B7';
var PULT_TITLE = 'B8';      // назва раунду для сайту й картки на головній, напр. «TM • Round 2»
var PULT_SUB = 'B9';        // дата і місце, напр. «12 грудня • Плугів, Krychevychi Area Fishing»
var PULT_MODE = 'B10';
var PULT_VENUE = 'B11';     // «Як доїхати»: назва локації, напр. «Krychevychi Area Fishing»
var PULT_MAP = 'B12';       // посилання на Google Maps
var PULT_COORDS = 'B13';    // координати «49.766483, 25.014995» (для Waze і точки на карті)      // що показувати: «Список учасників» / «Результати» (те саме, що B5 адмінки — синхронізуються)

/**
 * «Раунди сезону» на аркуші «Сайт» адмінки (F1:H10): R1…R6 — посилання на таблицю раунду й банер.
 * Скільки рядків з посиланням — стільки карток на головній сайту. Поточний раунд — останній такий рядок.
 */
var SEASON_TITLE = 'Раунди сезону';
var SEASON_COL = 6;          // F
var SEASON_NAME = 'G2';      // назва сезону, напр. «2026–2027»
var SEASON_HEAD_ROW = 3;
var SEASON_FIRST_ROW = 4;
var SEASON_ROWS = 6;
var RESULTS_SHEET = 'Results';

var CACHE_KEY = 'snapshot';
var CACHE_TTL = 21600;   // 6 годин, максимум для CacheService
var CHUNK = 4000;        // розмір шматка для збереження у властивостях

// ---------------------------------------------------------------------------
// Сайт: віддати останню публікацію
// ---------------------------------------------------------------------------

function doGet(e) {
  var out;
  try {
    var round = e && e.parameter ? parseInt(e.parameter.round, 10) : 0;
    if (round > 0) {
      out = archiveJson_(SpreadsheetApp.openById(getSpreadsheetId_()), round);
      if (!out) out = { ok: false, error: 'Раунду ' + round + ' немає в «' + SEASON_TITLE + '».' };
    } else out = getSnapshot_();
    if (!out) out = { ok: false, error: 'Результати ще не опубліковано. Виберіть «' + ACTION_PUBLISH + '» на аркуші «' + SYNC_SHEET + '».' };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  var text = typeof out === 'string' ? out : JSON.stringify(out);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** Повертає JSON-рядок останньої публікації або null. */
function getSnapshot_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) return hit;

  var all = PropertiesService.getScriptProperties().getProperties();
  var count = Number(all['snap:count'] || 0);
  if (!count) return null;
  var parts = [];
  for (var i = 0; i < count; i++) parts.push(all['snap:' + i] || '');
  var json = parts.join('');
  try { cache.put(CACHE_KEY, json, CACHE_TTL); } catch (e) { /* завеликий для кешу */ }
  return json;
}

// ---------------------------------------------------------------------------
// Таблиця: кнопка публікації
// ---------------------------------------------------------------------------

/**
 * Запустіть один раз для кожної нової таблиці раунду (кнопка «Виконати»).
 * Створює або оновлює аркуш «Сайт» зі списком дій, підключає його і публікує дані.
 */
function setupSync() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(SYNC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SYNC_SHEET);
    sh.getRange(CELL_TITLE).setValue(SETTINGS.EVENT_TITLE);
    sh.getRange(CELL_SUBTITLE).setValue(SETTINGS.EVENT_SUBTITLE);
  }
  sh.getRange('A1').setValue('Публікація результатів на сайт').setFontWeight('bold').setFontSize(13);
  // Таблиця поточного раунду (B2): посилання на копію з «Учасниками», «Жеребкуванням» і «Results»
  sh.getRange('A2').setValue('Поточний раунд').setFontWeight('bold');
  sh.getRange(CELL_ROUND).setWrap(false)
    .setNote('Поточний раунд — останній рядок з посиланням у блоці «' + SEASON_TITLE + '» (праворуч, F1). ' +
      'Звідти беруться учасники, жеребкування й результати; там же «' + PULT_SHEET + '».');
  // Старий макет (діапазони в рядках 12–14): звільняємо два рядки під «Кількість місць» і «Реєстрація до»
  if (String(sh.getRange('A12').getDisplayValue()).trim() === RANGE_KEYS[0] &&
      String(sh.getRange('A10').getDisplayValue()).indexOf('B5') === 0) {
    sh.insertRowsAfter(9, 2);
  }
  // Макет до «Картки учасника» (підказка в рядку 12): звільняємо рядок 12 під перемикач
  if (String(sh.getRange('A12').getDisplayValue()).indexOf('B5') === 0) sh.insertRowsAfter(11, 1);
  // Макет до «Секторів на водоймі» (підказка в рядку 13): звільняємо рядок 13
  if (String(sh.getRange('A13').getDisplayValue()).indexOf('B5') === 0) sh.insertRowsAfter(12, 1);
  // Макет до «Вартості участі» (підказка в рядку 14): звільняємо рядок 14
  if (String(sh.getRange('A14').getDisplayValue()).indexOf('B5') === 0) sh.insertRowsAfter(13, 1);
  sh.getRange('A9:B14').breakApart();
  sh.getRange('A3:A14').setValues([['Дія'], ['Остання публікація'], ['Що показувати'], ['Заголовок (запасний)'], ['Підзаголовок (запасний)'],
    ['Реєстрація'], ['Стрілки ▲▼ місць'], ['Кількість місць'], ['Реєстрація до'], ['Картка учасника'], ['Секторів на водоймі'], ['Вартість участі']]);
  sh.getRange('A3:A14').setFontWeight('bold');
  sh.getRange('A15:B15').merge().setWrap(true);
  sh.getRange('A15').setValue('B2 — поточний раунд: останній рядок у «' + SEASON_TITLE + '» (F1). Звідти беруться учасники, жеребкування й результати, ' +
    'а на його аркуші «' + PULT_SHEET + '» — «' + ACTION_PUBLISH + '», «Турів у раунді», назва й дата раунду, особисті результати. ' +
    '\nB5 — що бачать глядачі (те саме, що B10 на «Пульті» раунду): «' + MODE_REG + '» (аркуш «Учасники») або «' + MODE_RES +
    '» (вкладки «Результат» і «Тури»). \nЗміна режиму одразу публікує дані. Щоб оновити дані на сайті, у B3 виберіть «' +
    ACTION_PUBLISH + '». Заголовок і підзаголовок теж оновлюються при публікації. \nB8 — «' + REG_OPEN +
    '» показує на сайті кнопку «Зареєструватися» (заявки йдуть в аркуш «' + REG_SHEET + '», телефон у колонку E). \nB9 — показувати чи ні стрілки ▲▼, на скільки місць змістився учасник після оновлення. ' +
    '\nB10 — кількість місць: хто зареєструвався понад неї, стоїть у списку під лінією «Резерв» (порожньо — без обмеження). ' +
    '\nB11 — дата завершення реєстрації (подвійний клік — календар), C11 — час (зі списку або свій, напр. 20:15). Сайт показує зворотний відлік, а в цей момент реєстрація закривається сама. ' +
    '\nB12 — чи показувати на сайті кнопку «Картка учасника» (тап по учаснику → кнопка внизу). ' +
    '\nB13 — скільки секторів на водоймі, напр. 14: по 7 на кожному березі. За цим числом малюються карта водойми й карта секторів у статистиці (порожньо — за найбільшим номером сектора в жеребкуванні). ' +
    '\nB14 — вартість участі, напр. 1700: у формі реєстрації під кнопкою буде «Вартість участі — 1 700 грн». Можна й текстом. Порожньо — рядок не показується.');
  sh.getRange('A15').setFontColor('#475467');
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 420);
  setupRules_(ss);

  // Випадаючий список замість галочки
  var cell = sh.getRange(CELL_PUBLISH);
  cell.clearDataValidations();
  cell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([ACTION_IDLE, ACTION_PUBLISH], true)
    .setAllowInvalid(false)
    .build());
  cell.setValue(ACTION_IDLE).setFontWeight('bold').setBackground('#e8f3d6');

  // Список режимів: що показувати на сайті
  var modeCell = sh.getRange(CELL_MODE);
  var currentMode = String(modeCell.getDisplayValue()).trim();
  modeCell.clearDataValidations();
  modeCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([MODE_REG, MODE_RES], true)
    .setAllowInvalid(false)
    .build());
  if (!MODES[currentMode]) modeCell.setValue(MODE_REG);
  modeCell.setFontWeight('bold').setBackground('#e3f0fa');

  // Перемикач реєстрації
  var regCell = sh.getRange(CELL_REG);
  var currentReg = String(regCell.getDisplayValue()).trim();
  regCell.clearDataValidations();
  regCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([REG_OPEN, REG_CLOSED], true)
    .setAllowInvalid(false)
    .build());
  if (currentReg !== REG_OPEN && currentReg !== REG_CLOSED) regCell.setValue(REG_CLOSED);
  regCell.setFontWeight('bold').setBackground('#fdf3e1');

  // Перемикач «Картка учасника»
  var cardCell = sh.getRange(CELL_CARD);
  var currentCard = String(cardCell.getDisplayValue()).trim();
  cardCell.clearDataValidations();
  cardCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([CARD_ON, CARD_OFF], true).setAllowInvalid(false).build());
  if (currentCard !== CARD_ON && currentCard !== CARD_OFF) cardCell.setValue(CARD_ON);
  cardCell.setFontWeight('bold').setBackground('#e3f0fa');

  // Перемикач стрілок зміни місць
  var movesCell = sh.getRange(CELL_MOVES);
  var currentMoves = String(movesCell.getDisplayValue()).trim();
  movesCell.clearDataValidations();
  movesCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([MOVES_ON, MOVES_OFF], true)
    .setAllowInvalid(false)
    .build());
  if (currentMoves !== MOVES_ON && currentMoves !== MOVES_OFF) movesCell.setValue(MOVES_ON);
  movesCell.setFontWeight('bold').setBackground('#e3f0fa');

  // Скільки секторів на водоймі: якщо порожньо — підставляємо найбільший номер сектора з жеребкування
  var secCell = sh.getRange(CELL_SECTORS);
  secCell.clearDataValidations();   // тепер можна й «14 (6, 8)», тож без перевірки «лише число»
  secCell.setNumberFormat('@').setNote('Скільки секторів на водоймі.\n14 — порівну, по 7 на кожному березі.\n14 (6, 8) — верхній берег 6, нижній 8.');
  secCell.setFontWeight('bold').setBackground('#e3f0fa').setHorizontalAlignment('left');
  if (!String(secCell.getDisplayValue()).trim()) {
    try {
      var dr = readDraw_(ss), maxSec = 0;
      if (dr) dr.players.forEach(function (pl) { pl.t.forEach(function (x) { if (x[0] > maxSec) maxSec = x[0]; }); });
      if (maxSec) secCell.setValue(maxSec % 2 ? maxSec + 1 : maxSec);
    } catch (err) { console.error(err); }
  }

  // Вартість участі (текст: «1700» або «1700 грн, юніори — 1000»)
  var feeCell = sh.getRange(CELL_FEE);
  feeCell.clearDataValidations();
  feeCell.setNumberFormat('@').setNote('Вартість участі. Число (1700) — на сайті «1 700 грн». Можна текстом. Порожньо — не показувати.');
  feeCell.setFontWeight('bold').setBackground('#fdf3e1').setHorizontalAlignment('left');
  // Перемикач кнопки «Оплатити участь» (D14, підпис у D13)
  sh.getRange('D13').setValue('Кнопка оплати').setFontWeight('bold');
  var payCell = sh.getRange(CELL_PAY);
  var currentPay = String(payCell.getDisplayValue()).trim();
  payCell.clearDataValidations();
  payCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([PAY_ON, PAY_OFF], true).setAllowInvalid(false).build());
  if (currentPay !== PAY_ON && currentPay !== PAY_OFF) payCell.setValue(PAY_ON);
  payCell.setFontWeight('bold').setBackground('#fdf3e1')
    .setNote('Кнопка «Оплатити участь» на сайті й у Telegram: «' + PAY_ON + '» або «' + PAY_OFF + '». Зміна одразу публікує дані.');
  if (sh.getColumnWidth(4) < 130) sh.setColumnWidth(4, 130);
  sh.getRange(CELL_PAYCARD).setNumberFormat('@').setBackground('#fdf3e1').setHorizontalAlignment('left')
    .setNote('Реквізити для оплати: номер картки (можна з ім\'ям, напр. «4441 1111 2222 3333 · Тесля А.»). В апці «Оплатити участь» → «Скопіювати реквізити» копіює номер картки. Порожньо — лише «Оплатити в Monobank».');

  // Кількість місць і дата завершення реєстрації
  var seatsCell = sh.getRange(CELL_SEATS);
  seatsCell.clearDataValidations();
  seatsCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, 1000).setAllowInvalid(false)
    .setHelpText('Ціле число, напр. 28. Порожньо — без обмеження.').build());
  seatsCell.setFontWeight('bold').setBackground('#fdf3e1').setHorizontalAlignment('left');
  var dlCell = sh.getRange(CELL_DEADLINE);
  dlCell.clearDataValidations();
  dlCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireDate().setAllowInvalid(false)
    .setHelpText('Дата завершення (календар — подвійний клік). Час — у сусідній клітинці. Порожньо — без обмеження.').build());
  dlCell.setNumberFormat('dd.MM.yyyy').setFontWeight('bold').setBackground('#fdf3e1').setHorizontalAlignment('left');
  // Час завершення: список кожні 30 хв, можна вписати й свій (напр. 20:15)
  var times = [];
  for (var h = 0; h < 24; h++) times.push(('0' + h).slice(-2) + ':00', ('0' + h).slice(-2) + ':30');
  times.push('23:59');
  var tCell = sh.getRange(CELL_DEADLINE_TIME);
  tCell.clearDataValidations();
  tCell.setNumberFormat('@');
  tCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(times, true).setAllowInvalid(true)
    .setHelpText('Час завершення реєстрації, напр. 20:00. Можна вписати свій, напр. 20:15.').build());
  tCell.setFontWeight('bold').setBackground('#fdf3e1').setHorizontalAlignment('left');

  // Блок діапазонів: заповнюємо лише порожні клітинки, щоб не затерти ваші значення
  var rr = rangeRowFirst_(sh);
  sh.getRange(rr - 1, 1).setValue(RANGES_TITLE).setFontWeight('bold');
  var defaults = defaultRanges_();
  var rangeCells = sh.getRange(rr, 1, RANGE_KEYS.length, 2);
  var current = rangeCells.getDisplayValues();
  rangeCells.setValues(RANGE_KEYS.map(function (k, i) {
    var cur = String(current[i][1]).trim();
    if (cur && OLD_DEFAULT_RANGES[k] && cur.toUpperCase() === OLD_DEFAULT_RANGES[k]) cur = '';   // старе значення з коду → «авто»
    return [k, cur || defaults[k]];
  }));
  sh.getRange(rr, 1, RANGE_KEYS.length, 1).setFontWeight('bold');
  sh.getRange(rr, 2, RANGE_KEYS.length, 1).setBackground('#f2f4f7');
  sh.getRange(rr + RANGE_KEYS.length, 1).setValue(
    '«' + RANGE_AUTO + '» — скрипт сам знаходить блоки на аркуші «Results» таблиці раунду (за заголовками «#» і «Місце»). ' +
    'Можна вказати й вручну, напр. A1:AG або Results!A1:AG. Без номера останнього рядка береться все заповнене. Зміна діапазону одразу публікує дані.')
    .setFontColor('#475467');

  setupBroadcast_(sh);
  setupResults_(sh);

  // «Раунди сезону» (F1:H10). Перший запуск: посилання з B2 переїжджає в рядок R1, назва й дата — на «Пульт»
  var migrate = setupSeason_(sh);
  // Таблиця поточного раунду: тригер правок, «Пульт», колонки «Учасників» (немає жодної — усе в цій таблиці)
  var rs = connectRound_(ss, migrate);
  clearSeasonCache_();
  var arch = 0;
  try { arch = buildArchives_(ss); } catch (err) { console.error(err); }

  var p = publish_(ss);
  writeStatus_(sh, p);
  scheduleRegClose_(sh);
  Logger.log('Готово. Таблиця поточного раунду: ' + (rs.getId() === ss.getId() ? 'ця ж («' + SEASON_TITLE + '» порожні)' : rs.getName()) +
    '. Архівів минулих раундів: ' + arch + '. Дані опубліковано: ' + summary_(p));
}

/**
 * Тригер правок — і в адмінці, і в таблиці раунду (setupSync ставить обидва).
 * Адмінка: аркуш «Сайт» (публікація, перемикачі, B2), «Положення». Раунд: «Пульт», «Учасники», «Жеребкування».
 */
function handleSiteSync(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var src = e.source || sh.getParent();
  var adminId = getSpreadsheetId_();
  var isAdmin = src.getId() === adminId;
  var ss = isAdmin ? src : SpreadsheetApp.openById(adminId);
  if (!isAdmin) {
    ROUND_SS_[src.getId()] = src;
    var cur = '';
    try { cur = roundSs_(ss).getId(); } catch (err) { console.error(err); }
    if (cur !== src.getId()) return;   // таблиця старого раунду — її правки сайт не чіпають
  }
  var name = sh.getName();
  var isRoundSheet = !isAdmin;
  if (isAdmin) { try { isRoundSheet = roundSs_(ss).getId() === ss.getId(); } catch (err) { isRoundSheet = false; } }
  if (isRoundSheet) {
    if (name === PULT_SHEET) { handlePultEdit_(e, ss, sh); return; }
    // Вставили жеребкування або змінили номери/імена в «Учасниках» — підставляємо імена в «Жеребкування»
    if (name === DRAW_SHEET ||
        (name === REG_SHEET && e.range.getColumn() <= REG_COL_NAME && e.range.getLastColumn() >= REG_COL_NUM)) {
      try { syncDrawNames_(ss); } catch (err) { console.error(err); }
      return;
    }
    // Змінили «Положення» раунду — публікуємо одразу, але лише в режимі «Список учасників»
    if (name === RULES_SHEET) {
      var st0 = ss.getSheetByName(SYNC_SHEET);
      if (st0 && currentMode_(st0) === MODE_REG) {
        try { writeStatus_(st0, publish_(ss)); } catch (err) { console.error(err); }
      }
      return;
    }
    // Поставили/зняли галочку «Оплата» — оновлюємо значок 💵 у списку учасників на сайті
    if (name === REG_SHEET && e.range.getColumn() <= REG_COL_PAID && e.range.getLastColumn() >= REG_COL_PAID) {
      var site = ss.getSheetByName(SYNC_SHEET);
      if (site && currentMode_(site) === MODE_REG) {
        try { writeStatus_(site, publish_(ss)); } catch (err) { console.error(err); }
      }
      return;
    }
  }
  if (!isAdmin) return;
  // Змінили «Положення» — публікуємо одразу, але лише в режимі «Список учасників» (у результатах його не показуємо,
  // а публікація посеред туру віддала б глядачам неповні результати)
  if (name === RULES_SHEET) {
    var st = ss.getSheetByName(SYNC_SHEET);
    if (st && currentMode_(st) === MODE_REG) {
      try { writeStatus_(st, publish_(ss)); } catch (err) { console.error(err); }
    }
    return;
  }
  if (name !== SYNC_SHEET) return;
  // «Раунди сезону» (F2:H9): новий раунд, банер чи назва сезону — підключаємо поточний, оновлюємо картки й архіви
  var er = e.range;
  if (er.getLastColumn() >= SEASON_COL && er.getColumn() <= SEASON_COL + 2 &&
      er.getLastRow() >= 2 && er.getRow() < SEASON_FIRST_ROW + SEASON_ROWS) {
    sh.getRange(CELL_STATUS).setValue('⏳ Оновлюю раунди сезону…');
    SpreadsheetApp.flush();
    try {
      var rs2 = connectRound_(ss, false);
      clearSeasonCache_();
      writeStatus_(sh, publish_(ss));
      var built = buildArchives_(ss);
      sh.getRange(CELL_STATUS).setValue(sh.getRange(CELL_STATUS).getDisplayValue() + ' • поточний раунд: «' + rs2.getName() + '»' +
        (built ? ' • минулих раундів: ' + built : ''));
    } catch (err) {
      sh.getRange(CELL_STATUS).setValue('❌ ' + ((err && err.message) || err));
    }
    return;
  }
  // Вставили посилання на таблицю раунду — підключаємо її й публікуємо
  if (e.range.getA1Notation() === CELL_ROUND) {
    sh.getRange(CELL_STATUS).setValue('⏳ Підключаю таблицю раунду…');
    SpreadsheetApp.flush();
    try {
      var rs = connectRound_(ss);
      writeStatus_(sh, publish_(ss));
      sh.getRange(CELL_STATUS).setValue(sh.getRange(CELL_STATUS).getDisplayValue() + ' • таблиця раунду: ' +
        (rs.getId() === ss.getId() ? 'ця ж (B2 порожня)' : '«' + rs.getName() + '»'));
    } catch (err) {
      sh.getRange(CELL_STATUS).setValue('❌ ' + ((err && err.message) || err));
    }
    return;
  }
  // Блоки «Особисті результати в Telegram» і «Розсилка в Telegram»
  if (handleResultsEdit_(e, sh)) return;
  if (handleBroadcastEdit_(e, sh)) return;
  var a1 = e.range.getA1Notation();
  var v = String(e.value == null ? '' : e.value).trim();
  var isPublish = a1 === CELL_PUBLISH && (v === ACTION_PUBLISH || v.toUpperCase() === 'TRUE');
  var isMode = a1 === CELL_MODE && !!MODES[v];
  var isReg = a1 === CELL_REG && (v === REG_OPEN || v === REG_CLOSED);
  var isMoves = a1 === CELL_MOVES && (v === MOVES_ON || v === MOVES_OFF);
  var isRegSetting = a1 === CELL_SEATS || a1 === CELL_DEADLINE || a1 === CELL_DEADLINE_TIME;
  var isCard = a1 === CELL_CARD && (v === CARD_ON || v === CARD_OFF);
  var isSectors = a1 === CELL_SECTORS || a1 === CELL_FEE || a1 === CELL_PAYCARD || (a1 === CELL_PAY && (v === PAY_ON || v === PAY_OFF));
  var row = e.range.getRow();
  var isRange = e.range.getColumn() === 2 && e.range.getNumRows() === 1 &&
    row >= rangeRowFirst_(sh) && row < rangeRowFirst_(sh) + RANGE_KEYS.length;
  if (!isPublish && !isMode && !isReg && !isMoves && !isRegSetting && !isCard && !isSectors && !isRange) return;

  sh.getRange(CELL_STATUS).setValue('⏳ Публікуємо…');
  SpreadsheetApp.flush();
  try {
    writeStatus_(sh, publish_(ss));
    if (isReg || isRegSetting) scheduleRegClose_(sh);
  } catch (err) {
    sh.getRange(CELL_STATUS).setValue('❌ Помилка: ' + ((err && err.message) || err));
  } finally {
    if (!isPublish) return;
    // Повертаємо клітинку у вихідний стан: «—» для списку, порожньо для галочки
    var rule = e.range.getDataValidation();
    var isCheckbox = rule && rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX;
    e.range.setValue(isCheckbox ? false : ACTION_IDLE);
  }
}

/** Можна запустити вручну з редактора, щоб опублікувати без галочки. */
function publishNow() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var p = publish_(ss);
  var sh = ss.getSheetByName(SYNC_SHEET);
  if (sh) writeStatus_(sh, p);
  Logger.log('Опубліковано: ' + summary_(p));
}

// ---------------------------------------------------------------------------
// Автоматичне закриття реєстрації в момент з B11
// ---------------------------------------------------------------------------

var CLOSE_HANDLER = 'closeRegistration';

/**
 * Ставить «будильник» на дату з B11: у цей момент скрипт сам вибере в B8 «Закрита»
 * й опублікує дані. Старий будильник прибирається. Викликається при зміні B8 або B11.
 * Google запускає такі тригери з точністю до кількох хвилин; сайт ховає кнопку точно вчасно сам.
 */
function scheduleRegClose_(sh) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === CLOSE_HANDLER) ScriptApp.deleteTrigger(t);
  });
  var dl = regDeadline_(sh);
  if (!dl || !isRegSwitchOn_(sh) || dl.getTime() <= Date.now()) return null;
  ScriptApp.newTrigger(CLOSE_HANDLER).timeBased().at(dl).create();
  return dl;
}

/** Можна запустити з редактора, щоб поставити будильник для поточної дати в B11. */
function scheduleRegistrationClose() {
  var sh = SpreadsheetApp.openById(getSpreadsheetId_()).getSheetByName(SYNC_SHEET);
  var dl = scheduleRegClose_(sh);
  Logger.log(dl ? 'Реєстрація закриється автоматично: ' + dl : 'Будильник не потрібен: дата в B11 порожня або минула, чи реєстрацію вже закрито.');
}

/** Тригер за часом: закриває реєстрацію в B8 і публікує. */
function closeRegistration() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(SYNC_SHEET);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === CLOSE_HANDLER) ScriptApp.deleteTrigger(t);
  });
  if (!sh || !isRegSwitchOn_(sh)) return;
  var dl = regDeadline_(sh);
  // Дату перенесли на пізніше — ставимо новий будильник замість закриття
  if (dl && dl.getTime() > Date.now() + 60000) { scheduleRegClose_(sh); return; }
  sh.getRange(CELL_REG).setValue(REG_CLOSED);
  SpreadsheetApp.flush();
  try {
    var p = publish_(ss);
    writeStatus_(sh, p);
    var t = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy HH:mm');
    sh.getRange(CELL_STATUS).setValue(sh.getRange(CELL_STATUS).getDisplayValue() + ' • реєстрацію закрито автоматично о ' + t);
  } catch (err) {
    sh.getRange(CELL_STATUS).setValue('❌ Помилка: ' + ((err && err.message) || err));
  }
}

/** Реєстрацію відкрито в B8 (без урахування дати завершення). */
function isRegSwitchOn_(sh) {
  return !!sh && String(sh.getRange(CELL_REG).getDisplayValue()).trim() === REG_OPEN;
}

/** Реєстрація відкрита зараз: увімкнено в B8 і ще не минула дата з B11. */
function isRegOpen_(sh) {
  if (!isRegSwitchOn_(sh)) return false;
  var dl = regDeadline_(sh);
  return !dl || Date.now() < dl.getTime();
}

/** Дата завершення реєстрації: дата з B11 + час із C11 (якщо вказано) або null. */
function regDeadline_(sh) {
  var d = regDeadlineDate_(sh);
  if (!d) return null;
  var t = String(sh.getRange(CELL_DEADLINE_TIME).getDisplayValue()).trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return d;
  // Час із B11 (у часовому поясі таблиці) замінюємо на час із C11
  var tz = sh.getParent().getSpreadsheetTimeZone();
  var cur = Utilities.formatDate(d, tz, 'H:m').split(':');
  var shift = (Number(t[1]) * 60 + Number(t[2])) - (Number(cur[0]) * 60 + Number(cur[1]));
  return new Date(d.getTime() + shift * 60000);
}

function regDeadlineDate_(sh) {
  if (!sh) return null;
  var v = sh.getRange(CELL_DEADLINE).getValue();
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var m = String(v || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 23), Number(m[5] || 59));
}

/** Кількість місць (B10) або null, якщо без обмеження. */
function seats_(sh) {
  if (!sh) return null;
  var n = parseInt(String(sh.getRange(CELL_SEATS).getDisplayValue()).replace(/\s/g, ''), 10);
  return n > 0 ? n : null;
}

function currentMode_(sh) {
  var m = sh ? String(sh.getRange(CELL_MODE).getDisplayValue()).trim() : '';
  return MODES[m] ? m : MODE_RES;
}

/** Діапазони за замовчуванням (з коду) за назвою вкладки. */
function defaultRanges_() {
  var out = {};
  [MODES[MODE_REG], MODES[MODE_RES]].forEach(function (views) {
    views.forEach(function (v) { out[v.name] = v.range; });
  });
  return out;
}

/** Підставляє діапазони з аркуша «Сайт» (блок «Діапазони…»), якщо вони заповнені. */
function viewsWithRanges_(sh, views) {
  if (!sh) return views;
  var vals = sh.getRange(rangeRowFirst_(sh), 1, RANGE_KEYS.length, 2).getDisplayValues();
  var byName = {};
  vals.forEach(function (r) { byName[String(r[0]).trim()] = String(r[1]).trim(); });
  return views.map(function (v) {
    var raw = byName[v.name];
    if (!raw) return v;
    var sheet = v.sheet;
    var range = raw;
    var i = raw.lastIndexOf('!');
    if (i >= 0) {
      sheet = raw.slice(0, i).trim().replace(/^'(.*)'$/, '$1');
      range = raw.slice(i + 1).trim();
    }
    return { name: v.name, sheet: sheet, range: range, headerRows: v.headerRows };
  });
}

/** Скільки секторів на водоймі (B13 на аркуші «Сайт»); null — не вказано. */
/** Переклад українського тексту англійською (для перемикача ENG на сайті). Кешується у властивостях скрипта. */
function trEn_(text) {
  text = String(text || '').trim();
  if (!text || !/[А-Яа-яІіЇїЄєҐґ]/.test(text)) return text;
  var key = 'tr_en_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8));
  var props = PropertiesService.getScriptProperties();
  var hit = props.getProperty(key);
  if (hit) return hit;
  try {
    var out = String(LanguageApp.translate(text, 'uk', 'en') || '').trim();
    if (out) props.setProperty(key, out);
    return out;
  } catch (err) {
    console.error('Переклад не вдався: ' + err);
    return '';
  }
}

/**
 * Сектори на водоймі з B13: «14» — порівну на берегах (7 + 7);
 * «14 (6, 8)» — верхній берег 6, нижній 8 (буває через рельєф берега й підходи до води).
 */
function sectorsCfg_(sh) {
  if (!sh) return null;
  var t = String(sh.getRange(CELL_SECTORS).getDisplayValue()).trim();
  var m = t.match(/^(\d+)?\s*\(?\s*(\d+)\s*[,;+\/]\s*(\d+)\s*\)?$/);
  if (m && (m[1] || /[(,;+\/]/.test(t))) {
    var top = +m[2], bottom = +m[3];
    if (top >= 1 && bottom >= 1) return { n: top + bottom, top: top, bottom: bottom };
  }
  var n = parseInt(t.replace(/\s/g, ''), 10);
  return n >= 2 ? { n: n, top: null, bottom: null } : null;
}
function sectors_(sh) { var c = sectorsCfg_(sh); return c ? c.n : null; }

function publish_(ss) {
  var payload = buildPayload_(ss, null);
  saveSnapshot_(JSON.stringify(payload));
  try { resSavePlaces_(payload); } catch (err) { console.error(err); }
  return payload;
}

/** Локація для «Як доїхати» з «Пульта» (B11–B13): { name, google, lat, lng } або null (тоді — з налаштувань сайту). */
function venue_(ss) {
  var pu = pultSheet_(ss);
  if (!pu || String(pu.getRange('A11').getDisplayValue()).trim() !== 'Локація') return null;
  var name = String(pu.getRange(PULT_VENUE).getDisplayValue()).trim();
  var google = String(pu.getRange(PULT_MAP).getDisplayValue()).trim();
  var m = String(pu.getRange(PULT_COORDS).getDisplayValue()).match(/(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
  if (!m && google) m = google.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || google.match(/[?&](?:q|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  var lat = m ? Number(String(m[1]).replace(',', '.')) : null, lng = m ? Number(String(m[2]).replace(',', '.')) : null;
  if (!/^https?:\/\//.test(google)) google = '';
  if (!name && !google && lat == null) return null;
  return { name: name, google: google || null, lat: lat, lng: lng };
}

/** Назва й дата раунду: «Пульт» таблиці раунду (B8, B9); без «Пульта» — «Сайт» адмінки (B6, B7). */
function roundEvent_(ss, n) {
  var sh = ss.getSheetByName(SYNC_SHEET), pu = pultSheet_(ss);
  var adminT = sh ? String(sh.getRange(CELL_TITLE).getDisplayValue()).trim() : '';
  var adminS = sh ? String(sh.getRange(CELL_SUBTITLE).getDisplayValue()).trim() : '';
  if (pu) {
    var pt = String(pu.getRange(PULT_TITLE).getDisplayValue()).trim();
    var ps = String(pu.getRange(PULT_SUB).getDisplayValue()).trim();
    return { title: pt || (n ? 'TM • Round ' + n : adminT) || SETTINGS.EVENT_TITLE, subtitle: ps };
  }
  return { title: adminT || SETTINGS.EVENT_TITLE, subtitle: adminS || SETTINGS.EVENT_SUBTITLE };
}

/**
 * Дані для сайту. arch = { n } — архів минулого раунду (RS_OVERRIDE_ уже вказує на його таблицю):
 * лише підсумки, без реєстрації, оплат і сезону.
 */
function buildPayload_(ss, arch) {
  var sh = ss.getSheetByName(SYNC_SHEET);
  var mode = arch ? MODE_RES : currentMode_(sh);
  var sheets = viewsWithRanges_(sh, MODES[mode]).map(function (view) { return readView_(ss, view); });
  // «Турів у раунді» на «Пульті»: тури понад це число не публікуються, тож сайт і бот рахують «з N»
  var tours = toursLimit_(ss);
  if (tours) sheets = sheets.map(function (v) { return trimTours_(v, tours); });
  var rows = arch ? [] : seasonRows_(sh);
  var event = roundEvent_(ss, arch ? arch.n : (rows.length ? rows[rows.length - 1].n : 0));
  // Англійська версія сайту: назву й підзаголовок перекладає Google Translate (результат запам'ятовується)
  event.titleEn = trEn_(event.title);
  event.subtitleEn = trEn_(event.subtitle);
  var draw = null;
  try { draw = readDraw_(ss); if (!arch) syncDrawNames_(ss, draw); } catch (err) { console.error(err); }
  if (draw && tours && draw.rounds > tours) {
    draw.rounds = tours;
    draw.players.forEach(function (pl) { pl.t = pl.t.slice(0, tours); });
  }
  var showCard = !sh || String(sh.getRange(CELL_CARD).getDisplayValue()).trim() !== CARD_OFF;
  var registration = !arch && isRegOpen_(sh);
  var deadline = regDeadline_(sh);
  var regDeadline = registration && deadline ? deadline.toISOString() : null;
  var seats = seats_(sh);
  var fee = sh ? String(sh.getRange(CELL_FEE).getDisplayValue()).trim() || null : null;
  var payCard = sh ? String(sh.getRange(CELL_PAYCARD).getDisplayValue()).trim() || null : null;
  var payOn = !arch && (!sh || String(sh.getRange(CELL_PAY).getDisplayValue()).trim() !== PAY_OFF);
  var paid = [];
  if (!arch) try { paid = paidNames_(ss); } catch (err) { console.error(err); }
  var regAt = {};
  if (!arch) try { regAt = recentRegs_(ss); } catch (err) { console.error(err); }
  var showMoves = !arch && (!sh || String(sh.getRange(CELL_MOVES).getDisplayValue()).trim() !== MOVES_OFF);
  var secCfg = sectorsCfg_(sh);
  var sectors = secCfg ? secCfg.n : null;
  var sectorsSplit = secCfg && secCfg.top ? [secCfg.top, secCfg.bottom] : null;   // [верхній, нижній] берег
  var now = new Date().toISOString();
  var rules = null;
  if (!arch) try { rules = readRules_(ss); } catch (err) { console.error(err); }
  var season = null;
  if (!arch) try { season = seasonPayload_(ss, rows); } catch (err) { console.error(err); }
  var venue = null;
  try { venue = venue_(ss); } catch (err) { console.error(err); }
  var body = JSON.stringify([event, sheets, registration, regDeadline, seats, showMoves, draw, showCard, sectors, sectorsSplit, fee, paid, rules, payCard, regAt, payOn, tours, season, venue]);
  var hash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body, Utilities.Charset.UTF_8));

  var payload = {
    ok: true,
    mode: mode,
    title: ss.getName(),
    event: event,
    registration: registration,
    regDeadline: regDeadline,
    seats: seats,
    fee: fee,
    payCard: payCard,
    payOn: payOn,
    paid: paid,
    regAt: regAt,
    rules: rules,
    showMoves: showMoves,
    draw: draw,
    showCard: showCard,
    sectors: sectors,
    sectorsSplit: sectorsSplit,
    tours: tours,
    season: season,
    venue: venue,
    hash: hash,
    changedAt: now,
    generatedAt: now,
    sheets: sheets
  };
  if (arch) { payload.archived = true; payload.round = arch.n; payload.fee = null; payload.payCard = null; payload.seats = null; }
  return payload;
}

// ---------------------------------------------------------------------------
// Сезон: картки раундів на головній і архіви минулих раундів
// ---------------------------------------------------------------------------

/** Банер з Google Drive → адреса картинки для сайту (файл має бути доступний «усім, хто має посилання»). */
function bannerUrl_(id) { return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200' : null; }

/** Назва, дата й турів — з «Пульта» таблиці раунду. */
function roundMeta_(rs, n) {
  var pu = rs.getSheetByName(PULT_SHEET);
  var t = pu ? String(pu.getRange(PULT_TITLE).getDisplayValue()).trim() : '';
  var sub = pu ? String(pu.getRange(PULT_SUB).getDisplayValue()).trim() : '';
  var tours = pu ? parseInt(String(pu.getRange(PULT_TOURS).getDisplayValue()).replace(/\s/g, ''), 10) : 0;
  if (!(tours > 0)) tours = toursInSheet_(rs);
  return { title: t || 'TM • Round ' + n, subtitle: sub, tours: tours || null };
}

/** Сезон для сайту: { name, rounds: [{ n, title, subtitle, banner, tours, current }] } або null. */
function seasonPayload_(ss, rows) {
  var sh = ss.getSheetByName(SYNC_SHEET);
  rows = rows || seasonRows_(sh);
  if (!rows.length) return null;
  var props = PropertiesService.getScriptProperties();
  var meta = {};
  try { meta = JSON.parse(props.getProperty('season:meta') || '{}') || {}; } catch (e) { meta = {}; }
  var changed = false, last = rows.length - 1;
  var out = rows.map(function (r, i) {
    var m;
    if (i === last) m = roundMeta_(roundSs_(ss), r.n);   // поточний — завжди свіже
    else {
      m = meta[r.id];
      if (!m) {
        try { m = roundMeta_(SpreadsheetApp.openById(r.id), r.n); meta[r.id] = m; changed = true; }
        catch (err) { console.error(err); m = { title: 'TM • Round ' + r.n, subtitle: '', tours: null }; }
      }
    }
    var ev = { title: m.title, subtitle: m.subtitle };
    return { n: r.n, title: m.title, subtitle: m.subtitle, titleEn: trEn_(ev.title), subtitleEn: trEn_(ev.subtitle),
      banner: bannerUrl_(r.banner), tours: m.tours, current: i === last };
  });
  if (changed) props.setProperty('season:meta', JSON.stringify(meta));
  var name = sh ? String(sh.getRange(SEASON_NAME).getDisplayValue()).trim() : '';
  return { name: name || null, rounds: out };
}

/** Зберегти / прочитати великий JSON шматками у властивостях скрипта. */
function saveChunks_(prefix, json) {
  var props = PropertiesService.getScriptProperties();
  var old = Number(props.getProperty(prefix + ':count') || 0);
  var update = {}, n = Math.ceil(json.length / CHUNK);
  for (var i = 0; i < n; i++) update[prefix + ':' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
  update[prefix + ':count'] = String(n);
  props.setProperties(update);
  for (var j = n; j < old; j++) props.deleteProperty(prefix + ':' + j);
}
function readChunks_(prefix) {
  var all = PropertiesService.getScriptProperties().getProperties();
  var n = Number(all[prefix + ':count'] || 0);
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < n; i++) parts.push(all[prefix + ':' + i] || '');
  return parts.join('');
}

/** Архів минулого раунду (JSON-рядок): з властивостей, а якщо ще немає — збирає з його таблиці й зберігає. */
function archiveJson_(ss, n, rebuild) {
  var rows = seasonRows_(ss.getSheetByName(SYNC_SHEET));
  var row = rows.filter(function (r) { return r.n === n; })[0];
  if (!row) return null;
  if (row === rows[rows.length - 1]) return getSnapshot_();   // поточний раунд — звичайна публікація
  var key = 'arch:' + row.id, cache = CacheService.getScriptCache();
  if (!rebuild) {
    var hit = cache.get(key) || readChunks_(key);
    if (hit) return hit;
  }
  var json;
  RS_OVERRIDE_ = SpreadsheetApp.openById(row.id);
  try { json = JSON.stringify(buildPayload_(ss, { n: n })); }
  finally { RS_OVERRIDE_ = null; }
  saveChunks_(key, json);
  try { cache.put(key, json, CACHE_TTL); } catch (e) { /* завеликий для кешу */ }
  return json;
}

/** Забути збережені архіви й назви минулих раундів (зберуться знову з таблиць раундів). */
function clearSeasonCache_() {
  var props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (/^arch:|^season:meta$/.test(k)) props.deleteProperty(k);
    var m = /^(arch:[^:]+):count$/.exec(k);
    if (m) try { cache.remove(m[1]); } catch (e) { /* */ }
  });
}

/** Зібрати архіви всіх минулих раундів наперед (щоб сайт відкривав їх миттєво). Повертає скільки зібрано. */
function buildArchives_(ss) {
  var rows = seasonRows_(ss.getSheetByName(SYNC_SHEET)), done = 0;
  rows.slice(0, -1).forEach(function (r) {
    try { if (archiveJson_(ss, r.n)) done++; } catch (err) { console.error('Архів R' + r.n + ': ' + err); }
  });
  return done;
}

/**
 * Положення з аркуша «Положення»: [{ t: 'Мета турніру', items: ['…', '…'] }, …] або null.
 * A — назва розділу (номер на початку прибирається, апка нумерує сама), B — пункти, кожен з нового рядка.
 * Маркери «•», «-», «*» на початку й «;» у кінці пункту прибираються.
 */
function readRules_(ss) {
  var sh = roundSheet_(ss, RULES_SHEET) || ss.getSheetByName(RULES_SHEET);   // своє положення в кожного раунду; немає — з адмінки
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues(), out = [];
  vals.forEach(function (r) {
    var t = String(r[0] || '').trim().replace(/^\d+[.)]\s*/, '');
    var items = String(r[1] || '').split(/\r?\n/).map(function (x) {
      return x.trim().replace(/^[•\-–*·]\s*/, '').replace(/[;]\s*$/, '').trim();
    }).filter(Boolean);
    if (t || items.length) out.push({ t: t, items: items });
  });
  return out.length ? out : null;
}

/** Створює аркуш «Положення» із заголовками й підказкою, якщо його ще немає. Запускається з setupSync. */
/**
 * Аркуш «Положення» в таблиці раунду (у кожного раунду своє). Якщо його ще немає — копія з адмінки
 * (як заготовка: поправте під цей раунд), а якщо й там немає — порожній аркуш із заголовками.
 */
function setupRules_(ss, rs) {
  rs = rs || roundSs_(ss);
  if (rs.getSheetByName(RULES_SHEET)) return;
  var tpl = ss.getSheetByName(RULES_SHEET);
  if (tpl && rs.getId() !== ss.getId()) { tpl.copyTo(rs).setName(RULES_SHEET); return; }
  var sh = rs.insertSheet(RULES_SHEET);
  sh.getRange(1, 1, 1, 2).setValues([['Розділ', 'Пункти — кожен з нового рядка (Ctrl+Enter / ⌘+Enter). Розділ «Розклад»: «07:00 — Збір учасників»']])
    .setFontWeight('bold').setBackground('#f3f4f6').setWrap(true);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 720);
  sh.getRange('B:B').setWrap(true);
  sh.getRange('A:B').setVerticalAlignment('top');
}

/**
 * Жеребкування для картки гравця: { rounds, players: [{ n, name, side, t: [[сектор, № суперника], …] }] }
 * або null, якщо аркуша немає чи він порожній.
 */
function readDraw_(ss) {
  var sh = roundSheet_(ss, DRAW_SHEET);
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 5) return null;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  var rounds = Math.floor((vals[0].length - 3) / 2);
  while (rounds > 0 && !vals.slice(1).some(function (r) { return String(r[3 + (rounds - 1) * 2]).trim(); })) rounds--;
  if (!rounds) return null;

  var names = drawNames_(ss);

  var players = [];
  vals.slice(1).forEach(function (r) {
    var n = parseInt(r[0], 10);
    if (!(n > 0)) return;
    var t = [];
    for (var i = 0; i < rounds; i++) {
      var sec = parseInt(r[3 + i * 2], 10);
      var opp = parseInt(r[4 + i * 2], 10);
      t.push([sec > 0 ? sec : null, opp > 0 ? opp : null]);
    }
    players.push({ n: n, name: names[n] || String(r[1]).trim(), side: String(r[2]).trim(), t: t });
  });
  return players.length ? { rounds: rounds, players: players } : null;
}

/**
 * № у жеребкуванні → прізвище та ім'я з «Учасників» (колонка A → колонка B).
 * До жеребкування в колонці A порядкові номери, після — номери, які учасники витягнули на водоймі.
 */
function drawNames_(ss) {
  var reg = roundSheet_(ss, REG_SHEET);
  var names = {};
  if (!reg || reg.getLastRow() < 2) return names;
  reg.getRange(2, 1, reg.getLastRow() - 1, Math.max(REG_COL_NUM, REG_COL_NAME)).getDisplayValues().forEach(function (r) {
    var nm = String(r[REG_COL_NAME - 1]).trim();
    var n = parseInt(r[REG_COL_NUM - 1], 10);
    if (nm && n > 0) names[n] = nm;
  });
  return names;
}

/**
 * Колонка «Оплата» (C) на аркуші «Учасники»: галочка навпроти кожного учасника,
 * у заголовку — скільки оплатили, напр. «Оплата: 12/28». На сайті в списку учасників у тих,
 * хто оплатив, праворуч значок 💵 (payload.paid — лише імена, без сум).
 */
function setupPaidColumn_(reg) {
  // Колонка могла бути об'єднаною клітинкою-роздільником (C1:C150) — у ній галочки не ставляться
  var colAll = reg.getRange(1, REG_COL_PAID, reg.getMaxRows(), 1);
  if (colAll.getMergedRanges().length) colAll.breakApart();
  var head = reg.getRange(1, REG_COL_PAID);
  var hv = String(head.getDisplayValue()).trim();
  if (!hv || hv.indexOf('Оплата') === 0) {
    var col = String.fromCharCode(64 + REG_COL_PAID), nameCol = String.fromCharCode(64 + REG_COL_NAME);
    var sep = formulaSep_(head);
    head.setFormula('="Оплата: "&COUNTIF(' + col + '2:' + col + sep + 'TRUE)&"/"&COUNTA(' + nameCol + '2:' + nameCol + ')')
      .setFontWeight('bold').setHorizontalAlignment('center')
      .setNote('Поставте галочку, коли учасник оплатив участь. На сайті в списку учасників біля його імені з’явиться значок «оплачено».');
  }
  // Сума оплат (D): у заголовку — скільки зібрано
  var sHead = reg.getRange(1, REG_COL_SUM);
  var sv = String(sHead.getDisplayValue()).trim();
  if (!sv || sv.indexOf('Зібрано') === 0 || sv === 'Загалом') {
    var sc = String.fromCharCode(64 + REG_COL_SUM), sp = formulaSep_(sHead);
    sHead.setFormula('="Зібрано: "&TEXT(SUM(' + sc + '2:' + sc + ')' + sp + '"#,##0")&" грн"')
      .setFontWeight('bold').setHorizontalAlignment('center')
      .setNote('Впишіть суму в гривнях, яку заплатив учасник (напр. 1700). У заголовку — скільки зібрано загалом. На сайт не потрапляє.');
    reg.getRange(2, REG_COL_SUM, reg.getMaxRows() - 1, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
    if (reg.getColumnWidth(REG_COL_SUM) < 130) reg.setColumnWidth(REG_COL_SUM, 150);
  }
  var last = reg.getLastRow();
  if (last < 2) return;
  var names = reg.getRange(2, REG_COL_NAME, last - 1, 1).getDisplayValues();
  for (var i = 0; i < names.length; i++) if (String(names[i][0]).trim()) paidCheckbox_(reg, i + 2);
  reg.getRange(2, REG_COL_PAID, last - 1, 1).setHorizontalAlignment('center');
  if (reg.getColumnWidth(REG_COL_PAID) < 90) reg.setColumnWidth(REG_COL_PAID, 110);
}

/** Імена тих, у кого стоїть галочка «Оплата» (для значка у списку учасників на сайті). */
function paidNames_(ss) {
  var reg = roundSheet_(ss, REG_SHEET);
  if (!reg || reg.getLastRow() < 2) return [];
  var n = reg.getLastRow() - 1;
  var names = reg.getRange(2, REG_COL_NAME, n, 1).getDisplayValues();
  var paid = reg.getRange(2, REG_COL_PAID, n, 1).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    var nm = String(names[i][0]).replace(/\s+/g, ' ').trim(), v = paid[i][0];
    if (nm && (v === true || /^(✅|✔️?|true)$/i.test(String(v).trim()))) out.push(nm);
  }
  return out;
}

/**
 * Час реєстрації тих, хто зареєструвався за останні 2 доби (колонка F): { «Ім'я»: мс }.
 * Сайт показує біля них мітку «new», доки минуло менше доби. Телефони й ID сюди не потрапляють.
 */
function recentRegs_(ss) {
  var reg = roundSheet_(ss, REG_SHEET);
  if (!reg || reg.getLastRow() < 2) return {};
  var n = reg.getLastRow() - 1, since = Date.now() - 48 * 3600 * 1000;
  var names = reg.getRange(2, REG_COL_NAME, n, 1).getDisplayValues();
  var times = reg.getRange(2, REG_COL_TIME, n, 1).getValues();
  var out = {};
  for (var i = 0; i < n; i++) {
    var nm = String(names[i][0]).replace(/\s+/g, ' ').trim(), t = times[i][0];
    if (nm && t instanceof Date && t.getTime() > since) out[nm] = t.getTime();
  }
  return out;
}

/** Галочка «Оплата» в рядку учасника (якщо її ще немає; уже вписані ✅/так стають поставленою галочкою). */
function paidCheckbox_(sh, row) {
  var c = sh.getRange(row, REG_COL_PAID);
  if (c.isPartOfMerge()) return;   // об'єднана клітинка — спершу запустіть setupSync
  var dv = c.getDataValidation();
  if (dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX) return;
  var v = String(c.getDisplayValue()).trim().toLowerCase();
  c.insertCheckboxes();
  if (v && /^(✅|✔|✔️|\+|так|да|yes|true|1|ok|оплачено|оплатив)$/.test(v)) c.check(); else c.uncheck();
}

/** Вписує імена учасників у колонку B «Жеребкування» (лише там, де вони змінилися). */
function syncDrawNames_(ss, draw) {
  var sh = roundSheet_(ss, DRAW_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  var names = drawNames_(ss);
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, 2);
  var vals = rng.getDisplayValues();
  var changed = false;
  var out = vals.map(function (r) {
    var n = parseInt(r[0], 10);
    var nm = n > 0 && names[n] ? names[n] : r[1];
    if (nm !== r[1]) changed = true;
    return [nm];
  });
  if (changed) sh.getRange(2, 2, out.length, 1).setValues(out);
}

function saveSnapshot_(json) {
  var props = PropertiesService.getScriptProperties();
  var old = Number(props.getProperty('snap:count') || 0);
  var update = {};
  var n = Math.ceil(json.length / CHUNK);
  for (var i = 0; i < n; i++) update['snap:' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
  update['snap:count'] = String(n);
  props.setProperties(update);
  for (var j = n; j < old; j++) props.deleteProperty('snap:' + j);
  try { CacheService.getScriptCache().put(CACHE_KEY, json, CACHE_TTL); } catch (e) { /* завеликий для кешу */ }
}

function writeStatus_(sh, p) {
  var t = Utilities.formatDate(new Date(p.changedAt), 'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss');
  var extra = '';
  try {
    if (p.mode === MODE_RES && titleRow_(sh, RES_TITLE)) {
      var d = resData_(p.sheets);
      if (d && d.round) extra = ' • 📨 можна надіслати особисті результати після ' + d.round + ' туру (блок «' + RES_TITLE + '» нижче)';
    }
    resRefresh_(sh.getParent(), sh);
  } catch (err) { console.error(err); }
  var text = '✅ ' + t + ' • ' + p.mode + ' • ' + summary_(p) + (p.tours ? ' • турів у раунді: ' + p.tours : '') + extra;
  sh.getRange(CELL_STATUS).setValue(text);
  try {   // те саме — на «Пульті» таблиці раунду
    var pu = pultSheet_(sh.getParent());
    if (pu) {
      pu.getRange(PULT_STATUS).setValue(text.replace(' (блок «' + RES_TITLE + '» нижче)', ' (B6 нижче)'));
      var pm = pu.getRange(PULT_MODE);   // «Що показувати» на «Пульті» = B5 адмінки
      if (String(pm.getDisplayValue()).trim() !== p.mode && String(pu.getRange('A10').getDisplayValue()).trim() === 'Що показувати') pm.setValue(p.mode);
    }
  } catch (err) { console.error(err); }
}

/**
 * Підсумок для «Остання публікація»: скільки учасників реально є (рядки з іменем у колонці B),
 * а не скільки рядків у діапазоні (заготовлені номери без імен не рахуються).
 * Для списку учасників — ще й «з N місць» (B10).
 */
function summary_(p) {
  return p.sheets.map(function (s) {
    var n = s.values.slice(s.headerRows || 2).filter(function (r) { return String(r[1] == null ? '' : r[1]).trim(); }).length;
    return s.name + ': ' + n + (s.name === 'Учасники' && p.seats ? ' з ' + p.seats + ' місць' : '');
  }).join(', ');
}

// ---------------------------------------------------------------------------
// Реєстрація з сайту
// ---------------------------------------------------------------------------

/**
 * Сайт надсилає сюди заявку: { action: 'register', name: 'Прізвище Ім'я', phone: '+380671234567' }.
 * Відповідь: { ok: true, number: 29, name: '...' } або { ok: false, code: '...', error: '...' }.
 */
function doPost(e) {
  // Вебхук Telegram (адреса з ?hook=секрет): нічого не повертаємо — так Telegram отримує «200 OK»
  if (e && e.parameter && e.parameter.hook) {
    try { handleTelegramUpdate_(e); } catch (err) { console.error(err); }
    return;
  }
  var out;
  try {
    var data = {};
    var raw = e && e.postData && e.postData.contents;
    if (raw) { try { data = JSON.parse(raw); } catch (x) { data = {}; } }
    if (e && e.parameter) Object.keys(e.parameter).forEach(function (k) { if (data[k] == null) data[k] = e.parameter[k]; });
    if (data.action === 'register') out = register_(data);
    else if (data.action === 'whoami') out = whoami_(data);
    else if (data.action === 'writeAccess') out = writeAccess_(data);
    else if (data.action === 'visit') out = visit_(data);
    else if (data.action === 'pclick') out = partnerClick_(data);
    else if (data.action === 'shareMsg') out = shareMsg_(data);
    else out = fail_('bad_request', 'Невідомий запит.');
  } catch (err) {
    out = fail_('server', 'Не вдалося зберегти заявку. Спробуйте ще раз за хвилину.');
    console.error(err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * «Поділитися» в апці Telegram: готує повідомлення від бота (фото-прев'ю сайту + підпис + кнопка з посиланням),
 * яке людина надсилає в будь-який чат через рідне вікно Telegram (WebApp.shareMessage, Bot API 8.0).
 * Картинка для всіх однакова — og.jpg сайту; підпис і посилання — свої (картка учасника або результати).
 */
var SHARE_PHOTO = 'https://troutmaster.app/assets/og.jpg?v=2';
function shareMsg_(data) {
  if (!PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')) return fail_('no_token', 'Немає BOT_TOKEN.');
  var user = telegramUser_(data.tg);
  if (!user) return fail_('auth', 'Не вдалося перевірити Telegram.');
  var url = String(data.url || '');
  if (!/^https:\/\/(t\.me\/troutmasterua_bot(\?startapp(=[\w-]{1,32})?)?|troutmaster\.app\/(#[\w-]{1,32})?)$/.test(url)) return fail_('url', 'Невідоме посилання.');
  var text = String(data.text || '').replace(/[<>]/g, '').trim().slice(0, 300);
  var btn = String(data.btn || '').replace(/[<>]/g, '').trim().slice(0, 40) || 'Відкрити в TROUT MASTER';
  var res = tgApi_('savePreparedInlineMessage', {
    user_id: Number(user.id),
    result: {
      type: 'photo', id: 'sh' + Date.now().toString(36),
      photo_url: SHARE_PHOTO, thumbnail_url: SHARE_PHOTO,
      caption: text + '\n' + url,
      reply_markup: { inline_keyboard: [[{ text: btn, url: url }]] }
    },
    allow_user_chats: true, allow_bot_chats: true, allow_group_chats: true, allow_channel_chats: true
  });
  if (!res || !res.ok || !res.result) return fail_('tg', (res && res.description) || 'Telegram не прийняв повідомлення.');
  return { ok: true, id: res.result.id };
}

function fail_(code, error) { return { ok: false, code: code, error: error }; }

function register_(data) {
  // Пастка для ботів: приховане поле, яке людина не бачить і не заповнює
  if (String(data.website || '').trim()) return { ok: true, number: 0, name: '' };

  var name = normalizeName_(data.name);
  if (!isValidName_(name)) return fail_('name', 'Вкажіть прізвище та ім’я, наприклад: Шевченко Тарас.');
  var phone = normalizePhone_(data.phone);
  if (!phone) return fail_('phone', 'Вкажіть номер у форматі +380 XX XXX XX XX.');
  var tgUser = telegramUser_(data.tg);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('busy', 'Зараз багато заявок. Спробуйте ще раз за хвилину.');
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId_());
    var site = ss.getSheetByName(SYNC_SHEET);
    if (!isRegOpen_(site)) return fail_('closed', 'Ой, не встигли: на жаль, реєстрацію вже закрито.');
    var sh = roundSheet_(ss, REG_SHEET);
    if (!sh) return fail_('server', 'У таблиці раунду немає аркуша «' + REG_SHEET + '».');

    var last = Math.max(sh.getLastRow(), 1);
    var width = Math.max(REG_COL_NUM, REG_COL_NAME, REG_COL_PHONE);
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, width).getDisplayValues() : [];

    var key = nameKey_(name);
    var lastFilled = 1;   // номер рядка (1 — заголовок)
    var maxNum = 0;
    for (var i = 0; i < rows.length; i++) {
      var rName = String(rows[i][REG_COL_NAME - 1]).trim();
      if (!rName) continue;
      lastFilled = i + 2;
      var n = parseInt(rows[i][REG_COL_NUM - 1], 10);
      if (n > maxNum) maxNum = n;
      if (normalizePhone_(rows[i][REG_COL_PHONE - 1]) === phone) {
        return fail_('duplicate', 'Цей номер уже зареєстровано: ' + rName + '.');
      }
      if (nameKey_(rName) === key) {
        return fail_('duplicate', 'Учасник «' + rName + '» уже є у списку. Якщо це інша людина, напишіть організатору.');
      }
    }

    var row = lastFilled + 1;
    if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), row - sh.getMaxRows());
    var numCell = sh.getRange(row, REG_COL_NUM);
    var existingNum = parseInt(numCell.getDisplayValue(), 10);
    var number = existingNum > 0 ? existingNum : maxNum + 1;
    if (!(existingNum > 0)) numCell.setValue(number);
    sh.getRange(row, REG_COL_NAME).setValue(name);
    paidCheckbox_(sh, row);
    sh.getRange(row, REG_COL_PHONE).setNumberFormat('@').setValue(formatPhone_(phone));
    sh.getRange(row, REG_COL_TIME).setValue(new Date()).setNumberFormat('dd.MM.yyyy HH:mm');
    if (tgUser) {
      sh.getRange(row, REG_COL_TG_ID).setNumberFormat('@').setValue(String(tgUser.id));
      if (tgUser.username) sh.getRange(row, REG_COL_TG_USER).setValue('@' + tgUser.username);
    }
    SpreadsheetApp.flush();

    // Одразу показуємо нового учасника на сайті (якщо зараз режим «Список учасників»)
    if (currentMode_(site) === MODE_REG) {
      try { writeStatus_(site, publish_(ss)); } catch (err) { console.error(err); }
    }
    return { ok: true, number: number, name: name };
  } finally {
    lock.releaseLock();
  }
}

/**
 * «Хто я?»: застосунок у Telegram надсилає свої дані, скрипт шукає Telegram ID у колонці G
 * аркуша «Учасники» й повертає імена з колонки B, щоб сайт виділив людині її рядок.
 * Працює лише з BOT_TOKEN у властивостях скрипта: без перевірки підпису можна було б
 * підставити чужий ID.
 */
function whoami_(data) {
  if (!PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')) return { ok: true, names: [] };
  var user = telegramUser_(data.tg);
  if (!user) return { ok: true, names: [] };
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var names = regNamesFor_(ss, user.id);
  try { upsertTgUser_(ss, user, { visit: true, canWrite: user.allowsWrite ? true : null, names: names }); } catch (err) { console.error(err); }
  try { logVisit_(ss, 'Telegram', user.id); } catch (err) { console.error(err); }
  return { ok: true, names: names, canWrite: user.allowsWrite };
}

/** Імена з «Учасників», зареєстровані з цього Telegram ID (колонка G). */
function regNamesFor_(ss, id) {
  var sh = roundSheet_(ss, REG_SHEET);
  var names = [];
  if (!sh || sh.getLastRow() < 2) return names;
  var width = Math.max(REG_COL_NAME, REG_COL_TG_ID);
  sh.getRange(2, 1, sh.getLastRow() - 1, width).getDisplayValues().forEach(function (r) {
    var name = String(r[REG_COL_NAME - 1]).trim();
    if (name && String(r[REG_COL_TG_ID - 1]).trim() === String(id) && names.indexOf(name) < 0) names.push(name);
  });
  return names;
}

/** Застосунок повідомляє, що людина дозволила (чи ні) боту писати їй. */
function writeAccess_(data) {
  if (!PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')) return { ok: true };
  var user = telegramUser_(data.tg);
  if (!user) return { ok: true };
  if (data.granted === true || data.granted === 'true') {
    var ss = SpreadsheetApp.openById(getSpreadsheetId_());
    upsertTgUser_(ss, user, { canWrite: true, names: regNamesFor_(ss, user.id) });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Хто відкривав застосунок у Telegram (аркуш «Відвідування»)
// ---------------------------------------------------------------------------

var VISITS_SHEET = 'Відвідування';
var VISITS_HEAD = ['Telegram ID', 'Telegram', 'Ім’я в Telegram', 'Зареєстрований як', 'Перший візит', 'Останній візит', 'Візитів', 'Можна писати'];
var VISITS_COL_WRITE = 8;   // H — чи може бот писати людині (так/ні)

/**
 * Один рядок на людину в «Відвідуваннях». opts:
 *   visit: true — людина відкрила застосунок (оновити час і лічильник);
 *   canWrite: true/false — змінити «Можна писати»; null — не чіпати;
 *   names: імена з «Учасників» для колонки «Зареєстрований як».
 */
function upsertTgUser_(ss, user, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var sh = visitsSheet_(ss);
    var now = new Date();
    var at = user.username ? '@' + user.username : '';
    var reg = (opts.names || []).join(', ');
    var write = opts.canWrite === true ? 'так' : opts.canWrite === false ? 'ні' : null;
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() !== user.id) continue;
      var r = i + 2;
      var row = sh.getRange(r, 1, 1, VISITS_HEAD.length).getValues()[0];
      sh.getRange(r, 2, 1, 3).setValues([[at || row[1], user.name || row[2], reg || row[3]]]);
      if (opts.visit) sh.getRange(r, 5, 1, 3).setValues([[row[4] || now, now, (Number(row[6]) || 0) + 1]]);
      if (write) sh.getRange(r, VISITS_COL_WRITE).setValue(write);
      else if (!row[VISITS_COL_WRITE - 1]) sh.getRange(r, VISITS_COL_WRITE).setValue('ні');
      return;
    }
    // Не appendRow: праворуч стоїть зведення (J:M), і appendRow писав би під ним
    var lastId = 0;
    for (var j = 0; j < ids.length; j++) if (String(ids[j][0]).trim()) lastId = j + 1;
    sh.getRange(lastId + 2, 1, 1, VISITS_HEAD.length).setValues([[user.id, at, user.name || '', reg,
      opts.visit ? now : '', opts.visit ? now : '', opts.visit ? 1 : 0, write || 'ні']]);
  } finally {
    lock.releaseLock();
  }
}

function visitsSheet_(ss) {
  var sh = ss.getSheetByName(VISITS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(VISITS_SHEET);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('E:F').setNumberFormat('dd.MM.yyyy HH:mm');
    sh.setColumnWidth(3, 180);
    sh.setColumnWidth(4, 200);
  }
  // Заголовки (і нові колонки в старому аркуші)
  var head = sh.getRange(1, 1, 1, VISITS_HEAD.length);
  if (head.getDisplayValues()[0].join('|') !== VISITS_HEAD.join('|')) {
    head.setValues([VISITS_HEAD]).setFontWeight('bold').setBackground('#e3f0fa');
  }
  // Зведення «сьогодні / тиждень / місяць» праворуч (якщо його ще немає або його стерли)
  if (sh.getRange(1, VSTATS_COL).getDisplayValue() !== VSTATS_TITLE) writeVisitStats_(sh);
  return sh;
}

// ---------------------------------------------------------------------------
// Статистика відвідувань: журнал кожного відкриття + зведення на «Відвідуванні»
// ---------------------------------------------------------------------------

var JOURNAL_SHEET = 'Журнал візитів';  // прихований аркуш: Час | Джерело | ID
var VISIT_DEDUPE_SEC = 600;            // повторне відкриття тим самим пристроєм/людиною за 10 хв — один візит
var VSTATS_COL = 10;                   // J — зведення на аркуші «Відвідування»
var VSTATS_TITLE = 'Статистика відвідувань';

/**
 * Сайт у звичайному браузері: { action: 'visit', vid: 'випадковий ID пристрою' }.
 * Без імен і телефонів: лише анонімний ID, який браузер сам згенерував.
 */
function visit_(data) {
  var id = String(data.vid || '').trim().toLowerCase();
  if (!/^[a-z0-9]{8,40}$/.test(id)) return { ok: true };
  logVisit_(null, 'Сайт', 'web:' + id);
  return { ok: true };
}

/** Один рядок у «Журнал візитів» (з відсіюванням повторів за 10 хв). */
function logVisit_(ss, source, id) {
  var cache = CacheService.getScriptCache();
  var key = 'vis:' + id;
  if (cache.get(key)) return;
  cache.put(key, '1', VISIT_DEDUPE_SEC);
  ss = ss || SpreadsheetApp.openById(getSpreadsheetId_());
  journalSheet_(ss).appendRow([new Date(), source, String(id)]);
  visitsSheet_(ss);  // переконатися, що зведення на місці
}

function journalSheet_(ss) {
  var sh = ss.getSheetByName(JOURNAL_SHEET);
  if (sh) return sh;
  try {
    sh = ss.insertSheet(JOURNAL_SHEET);
  } catch (err) {               // два перші візити одночасно: аркуш уже створив інший запит
    sh = ss.getSheetByName(JOURNAL_SHEET);
    if (sh) return sh;
    throw err;
  }
  sh.getRange(1, 1, 1, 3).setValues([['Час', 'Джерело', 'ID']]).setFontWeight('bold').setBackground('#e3f0fa');
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('dd.MM.yyyy HH:mm:ss');
  sh.getRange('C:C').setNumberFormat('@');
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(3, 200);
  try { sh.hideSheet(); } catch (e) { /* не критично */ }
  return sh;
}

/** Таблиця формул J1:M13 на «Відвідуванні». Рахує сама, скрипт її лише створює. */
function writeVisitStats_(sh) {
  var J = "'" + JOURNAL_SHEET + "'!";
  var A = J + 'A2:A', B = J + 'B2:B', C = J + 'C2:C';
  var cols = ['K', 'L', 'M'];
  function uniq(src) {
    return cols.map(function (c) {
      return '=COUNTUNIQUEIFS(' + C + ',' + A + ',">="&' + c + '$3' + (src ? ',' + B + ',"' + src + '"' : '') + ')';
    });
  }
  function count(src) {
    return cols.map(function (c) {
      return '=COUNTIFS(' + A + ',">="&' + c + '$3' + (src ? ',' + B + ',"' + src + '"' : '') + ')';
    });
  }
  var rows = [
    [VSTATS_TITLE, '', '', ''],
    ['', 'Сьогодні', 'Тиждень', 'Місяць'],
    ['Починаючи з', '=TODAY()', '=TODAY()-WEEKDAY(TODAY(),2)+1', '=DATE(YEAR(TODAY()),MONTH(TODAY()),1)'],
    ['Унікальні користувачі'].concat(uniq('')),
    ['   у Telegram'].concat(uniq('Telegram')),
    ['   на сайті (браузер)'].concat(uniq('Сайт')),
    ['Відвідування'].concat(count('')),
    ['   у Telegram'].concat(count('Telegram')),
    ['   на сайті (браузер)'].concat(count('Сайт')),
    ['', '', '', ''],
    ['Тиждень — з понеділка, місяць — з 1-го числа.', '', '', ''],
    ['Повторне відкриття тією ж людиною чи пристроєм за 10 хв — одне відвідування.', '', '', ''],
    ['Сайт рахується анонімно за пристроєм. Записи — на прихованому аркуші «' + JOURNAL_SHEET + '».', '', '', '']
  ];
  var c0 = VSTATS_COL;
  sh.getRange(1, c0, rows.length, 4).setValues(rows.map(function (r) {
    return r.map(function (v) { return String(v).charAt(0) === '=' ? '' : v; });
  }));
  // Розділювач аргументів залежить від локалі таблиці: в українській «;», в англійській «,».
  // Google розбирає формули зі скрипта за локаллю, тож перевіряємо пробною формулою.
  var sep = formulaSep_(sh.getRange(3, c0 + 1));
  sh.getRange(3, c0 + 1, 7, 3).setFormulas(rows.slice(2, 9).map(function (r) {
    return r.slice(1).map(function (f) { return f.replace(/,/g, sep); });  // коми в цих формулах — лише розділювачі
  }));
  sh.getRange(1, c0, rows.length, 1).setHorizontalAlignment('left');
  sh.getRange(1, c0, rows.length, 4).setWrap(false);
  sh.getRange(1, c0).setFontWeight('bold').setFontSize(12);
  sh.getRange(2, c0, 1, 4).setFontWeight('bold').setBackground('#e3f0fa');
  sh.getRange(3, c0, 1, 4).setFontColor('#667085');
  sh.getRange(3, c0 + 1, 1, 3).setNumberFormat('dd.MM');
  sh.getRange(3, c0 + 1, 7, 3).setHorizontalAlignment('center');
  sh.getRange(4, c0, 1, 4).setFontWeight('bold');
  sh.getRange(7, c0, 1, 4).setFontWeight('bold');
  sh.getRange(11, c0, 3, 1).setFontColor('#667085');
  sh.setColumnWidth(c0 - 1, 24);
  sh.setColumnWidth(c0, 190);
  for (var i = 1; i <= 3; i++) sh.setColumnWidth(c0 + i, 90);
}

/** «,» чи «;» між аргументами формул у цій таблиці. */
function formulaSep_(cell) {
  cell.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  var ok = cell.getDisplayValue() === '3';
  cell.setValue('');
  return ok ? ',' : ';';
}

/** Можна запустити з редактора, щоб зведення з’явилося одразу (інакше — з першим візитом). */
function setupVisitStats() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  journalSheet_(ss);
  var sh = visitsSheet_(ss);
  writeVisitStats_(sh);
  Logger.log('Готово: зведення на аркуші «' + VISITS_SHEET + '» (J1:M13), журнал — «' + JOURNAL_SHEET + '».');
}

// ---------------------------------------------------------------------------
// Кліки по партнерах (кнопка FISH.ME.FISH тощо): журнал + зведення на аркуші «Партнери»
// ---------------------------------------------------------------------------

var PCLICK_JOURNAL = 'Журнал кліків';   // прихований аркуш: Час | Партнер | Джерело | Пристрій | ID
var PARTNERS_SHEET = 'Партнери';         // видимий аркуш зі зведенням: блок на кожного партнера
var PCLICK_DEDUPE_SEC = 3;               // подвійний тап за 3 с — один клік
var PSTATS_HEAD_ROWS = 3;                // заголовок, «Сьогодні / Тиждень / …», «Починаючи з»

/**
 * Сайт/апка: { action: 'pclick', partner: 'FISH.ME.FISH', dev: 'Телефон'|'Комп', vid, tg }.
 * Людина — та сама, що у «Журналі візитів»: Telegram ID (перевірений підписом) або анонімний ID браузера.
 */
function partnerClick_(data) {
  var partner = String(data.partner || '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N} .&'’_-]{2,40}$/u.test(partner)) return { ok: true };
  var dev = data.dev === 'Комп' ? 'Комп' : 'Телефон';
  var src = data.tg ? 'Telegram' : 'Сайт', id = '';
  if (data.tg && PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')) {
    var user = telegramUser_(data.tg);
    if (user) id = String(user.id);
  }
  if (!id) {
    var vid = String(data.vid || '').trim().toLowerCase();
    if (/^[a-z0-9]{8,40}$/.test(vid)) id = 'web:' + vid;
  }
  var cache = CacheService.getScriptCache();
  var key = 'pcl:' + partner + ':' + (id || 'anon');
  if (id && cache.get(key)) return { ok: true };
  if (id) cache.put(key, '1', PCLICK_DEDUPE_SEC);
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  pclickJournal_(ss).appendRow([new Date(), partner, src, dev, id]);
  ensurePartnerBlock_(ss, partner);
  return { ok: true };
}

function pclickJournal_(ss) {
  var sh = ss.getSheetByName(PCLICK_JOURNAL);
  if (sh) return sh;
  try { sh = ss.insertSheet(PCLICK_JOURNAL); } catch (err) {
    sh = ss.getSheetByName(PCLICK_JOURNAL);
    if (sh) return sh;
    throw err;
  }
  sh.getRange(1, 1, 1, 5).setValues([['Час', 'Партнер', 'Джерело', 'Пристрій', 'ID']]).setFontWeight('bold').setBackground('#e3f0fa');
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('dd.MM.yyyy HH:mm:ss');
  sh.getRange('E:E').setNumberFormat('@');
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(5, 200);
  try { sh.hideSheet(); } catch (e) { /* не критично */ }
  return sh;
}

/** Аркуш «Партнери»: шапка з періодами (рахують формули, скрипт лише створює). */
function partnersSheet_(ss) {
  var sh = ss.getSheetByName(PARTNERS_SHEET);
  if (sh) return sh;
  try { sh = ss.insertSheet(PARTNERS_SHEET); } catch (err) {
    sh = ss.getSheetByName(PARTNERS_SHEET);
    if (sh) return sh;
    throw err;
  }
  sh.getRange(1, 1, 2, 5).setValues([['Кліки по партнерах', '', '', '', ''], ['', 'Сьогодні', 'Тиждень', 'Місяць', 'Усього']]);
  var sep = formulaSep_(sh.getRange(3, 2));
  sh.getRange(3, 1).setValue('Починаючи з');
  sh.getRange(3, 2, 1, 4).setFormulas([['=TODAY()', '=TODAY()-WEEKDAY(TODAY(),2)+1', '=DATE(YEAR(TODAY()),MONTH(TODAY()),1)', '=DATE(2020,1,1)']
    .map(function (f) { return f.replace(/,/g, sep); })]);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sh.getRange(2, 1, 1, 5).setFontWeight('bold').setBackground('#e3f0fa');
  sh.getRange(3, 1, 1, 5).setFontColor('#667085');
  sh.getRange(3, 2, 1, 3).setNumberFormat('dd.MM');
  sh.getRange(3, 5).setNumberFormat('"увесь час"');
  sh.getRange(2, 2, 2, 4).setHorizontalAlignment('center');
  sh.setFrozenRows(3);
  sh.setColumnWidth(1, 230);
  for (var i = 2; i <= 5; i++) sh.setColumnWidth(i, 95);
  sh.getRange(1, 7, 4, 1).setValues([
    ['Кліки — скільки разів натиснули кнопку партнера (подвійний тап за 3 с — один).'],
    ['Люди — скільки різних людей (у Telegram) чи пристроїв (у браузері) натиснули.'],
    ['Конверсія — частка відвідувачів сайту/апки за період, які натиснули.'],
    ['Тиждень — з понеділка, місяць — з 1-го числа. Записи — на прихованому аркуші «' + PCLICK_JOURNAL + '».']
  ]).setFontColor('#667085').setWrap(false);
  return sh;
}

/** Блок партнера на «Партнерах» (додається сам із першим кліком нового партнера). */
function ensurePartnerBlock_(ss, partner) {
  var sh = partnersSheet_(ss);
  var last = lastRowA_(sh);
  if (last > PSTATS_HEAD_ROWS) {
    var names = sh.getRange(PSTATS_HEAD_ROWS + 1, 1, last - PSTATS_HEAD_ROWS, 1).getDisplayValues();
    for (var i = 0; i < names.length; i++) if (names[i][0] === partner) return;
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return; }
  try {
    last = lastRowA_(sh);   // хтось міг додати блок, поки чекали
    if (last > PSTATS_HEAD_ROWS) {
      var again = sh.getRange(PSTATS_HEAD_ROWS + 1, 1, last - PSTATS_HEAD_ROWS, 1).getDisplayValues();
      for (var k = 0; k < again.length; k++) if (again[k][0] === partner) return;
    }
    var r = last > PSTATS_HEAD_ROWS ? last + 2 : PSTATS_HEAD_ROWS + 1;   // між блоками — порожній рядок
    journalSheet_(ss);   // формула конверсії посилається на «Журнал візитів» — він має існувати
    var J = "'" + PCLICK_JOURNAL + "'!", V = "'" + JOURNAL_SHEET + "'!";
    var nameRef = '$A$' + r;
    var cols = ['B', 'C', 'D', 'E'];
    var since = function (c) { return J + 'A2:A,">="&' + c + '$3'; };
    var clicks = function (src) { return cols.map(function (c) { return '=COUNTIFS(' + J + 'B2:B,' + nameRef + ',' + since(c) + (src ? ',' + J + 'C2:C,"' + src + '"' : '') + ')'; }); };
    var people = cols.map(function (c) { return '=COUNTUNIQUEIFS(' + J + 'E2:E,' + J + 'B2:B,' + nameRef + ',' + since(c) + ')'; });
    var conv = cols.map(function (c, i) {
      return '=IFERROR(' + c + (r + 4) + '/COUNTUNIQUEIFS(' + V + 'C2:C,' + V + 'A2:A,">="&' + c + '$3),0)';
    });
    var labels = [[partner], ['Кліки'], ['   у Telegram'], ['   на сайті (браузер)'], ['Люди'], ['Конверсія від відвідувачів']];
    sh.getRange(r, 1, labels.length, 1).setValues(labels);
    var sep = formulaSep_(sh.getRange(r, 2));
    var f = [clicks(''), clicks('Telegram'), clicks('Сайт'), people, conv].map(function (row) {
      return row.map(function (x) { return x.replace(/,/g, sep); });
    });
    sh.getRange(r + 1, 2, 5, 4).setFormulas(f);
    sh.getRange(r, 1, 1, 5).setFontWeight('bold').setBackground('#eef6e3');
    sh.getRange(r + 1, 1, 1, 5).setFontWeight('bold');
    sh.getRange(r + 4, 1, 1, 5).setFontWeight('bold');
    sh.getRange(r + 5, 2, 1, 4).setNumberFormat('0.0%');
    sh.getRange(r + 1, 2, 5, 4).setHorizontalAlignment('center');
  } finally {
    lock.releaseLock();
  }
}

/** Останній заповнений рядок у колонці A (пояснення праворуч не рахуються). */
function lastRowA_(sh) {
  var n = sh.getLastRow();
  if (!n) return 0;
  var v = sh.getRange(1, 1, n, 1).getDisplayValues();
  for (var i = n - 1; i >= 0; i--) if (String(v[i][0]).trim()) return i + 1;
  return 0;
}

/** Можна запустити з редактора, щоб аркуш «Партнери» з'явився одразу (інакше — з першим кліком). */
function setupPartnerStats() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  pclickJournal_(ss);
  journalSheet_(ss);
  ensurePartnerBlock_(ss, 'FISH.ME.FISH');
  Logger.log('Готово: аркуш «' + PARTNERS_SHEET + '», журнал — «' + PCLICK_JOURNAL + '».');
}

// ---------------------------------------------------------------------------
// Вебхук Telegram: хто натиснув Start, дозволив повідомлення або заблокував бота
// ---------------------------------------------------------------------------

/**
 * Запустіть один раз з редактора (кнопка «Виконати»), щоб Telegram надсилав скрипту
 * натискання Start і блокування бота. Потрібен BOT_TOKEN у властивостях скрипта.
 * Якщо в бота вже є інший вебхук (сервіс-конструктор тощо), функція нічого не змінить.
 */
function setupTelegramWebhook() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BOT_TOKEN');
  if (!token) throw new Error('Спершу додайте BOT_TOKEN у властивості скрипта.');
  var info = tgApi_('getWebhookInfo', {});
  var current = info && info.result && info.result.url;
  if (current && current.indexOf(SETTINGS.WEBAPP_URL) !== 0) {
    Logger.log('У бота вже є інший вебхук: ' + current.replace(/\?.*$/, '') +
      '. Щоб не зламати його, нічого не змінюю. Якщо він більше не потрібен, запустіть removeTelegramWebhook і повторіть.');
    return;
  }
  var secret = props.getProperty('TG_HOOK_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TG_HOOK_SECRET', secret);
  }
  var res = tgApi_('setWebhook', {
    url: SETTINGS.WEBAPP_URL + '?hook=' + secret,
    allowed_updates: ['message', 'my_chat_member'],
    drop_pending_updates: true
  });
  Logger.log(res && res.ok ? 'Готово: Telegram надсилатиме скрипту натискання Start і блокування бота.' : 'Не вдалося: ' + JSON.stringify(res));
}

/** Вимкнути вебхук (якщо колись знадобиться інший сервіс для бота). */
function removeTelegramWebhook() {
  var res = tgApi_('deleteWebhook', {});
  Logger.log(res && res.ok ? 'Вебхук вимкнено.' : 'Не вдалося: ' + JSON.stringify(res));
}

// ---------------------------------------------------------------------------
// Розсилка в Telegram (блок «Розсилка в Telegram» на аркуші «Сайт»)
// ---------------------------------------------------------------------------

var BC_TITLE = 'Розсилка в Telegram';
var BC_TO_NONE = '—';               // нікому не обрано: «Надіслати» нічого не робить
var BC_TO_REG = 'Учасникам турніру';
var BC_TO_ALL = 'Усім, хто відкривав апку';
var BC_CHAT = '@troutmasterua';                        // публічний чат/канал турніру
var BC_TO_CHAT = 'У чат ' + BC_CHAT;
var BC_TO_ME = 'Собі';   // звичайна розсилка, але лише собі (на «Тест — мій Telegram ID»), вигляд як в учасників
var BC_APP_LINK = 'https://t.me/troutmasterua_bot?startapp';   // у групах і каналах кнопка відкриває апку через посилання
var BC_IDLE = '—';
var BC_TEST = 'Надіслати тест собі';
var BC_SEND = 'Надіслати';
var BC_BUTTON = 'Відкрити TM APP';
var BC_BUTTON_ME = 'Моя картка в TM APP';
// Рядки блоку відносно заголовка
var BC_TEXT = 1, BC_PHOTO = 2, BC_BTN = 3, BC_TO = 4, BC_TESTID = 5, BC_ACTION = 6, BC_STATUS = 7, BC_HELP = 8;
// Табличка «Картинки для розсилки» (назва | посилання) — під блоком розсилки
var BC_PICS_TITLE = 'Картинки для розсилки';
var BC_PICS_ROWS = 20;   // скільки рядків табличка дає під назви
var BC_NO_PHOTO = 'Без фото';
var BC_CARD_PICS = ['Проміжні результати', 'Підсумкові результати'];   // лише з цими фото кнопка — «Моя картка в TM APP»
var BC_PICS_DEFAULT = ['Реєстрацію відкрито!', 'Реєстрація завершена', 'Проміжні результати', 'Підсумкові результати'];

/** Рядок заголовка «Розсилка в Telegram» на аркуші «Сайт» (0 — блоку немає). */
function bcRow_(sh) {
  var last = sh.getLastRow();
  if (last < 1) return 0;
  var col = sh.getRange(1, 1, last, 1).getDisplayValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === BC_TITLE) return i + 1;
  return 0;
}

/** Створює (або оновлює оформлення) блоку розсилки під діапазонами. */
function setupBroadcast_(sh) {
  var r = bcRow_(sh);
  if (!r) r = Math.max(sh.getLastRow(), RANGE_ROW_FIRST + RANGE_KEYS.length) + 2;
  // Старі макети: без рядка «Фото» (Кому одразу під текстом) і без рядка «Кнопка» (Кому під «Фото»)
  if (String(sh.getRange(r + 2, 1).getDisplayValue()).trim() === 'Кому') {
    sh.getRange(r + 2, 1, 6, 2).breakApart();
    sh.insertRowsAfter(r + 1, 1);
  }
  if (String(sh.getRange(r + 3, 1).getDisplayValue()).trim() === 'Кому') {
    sh.getRange(r + 3, 1, 6, 2).breakApart();
    sh.insertRowsAfter(r + 2, 1);
  }
  sh.getRange(r, 1).setValue(BC_TITLE).setFontWeight('bold').setFontSize(12);
  sh.getRange(r + BC_TEXT, 1, 7, 1).setValues([['Текст повідомлення'], ['Фото'], ['Кнопка (текст | посилання)'], ['Кому'], ['Тест — мій Telegram ID'], ['Дія'], ['Остання розсилка']])
    .setFontWeight('bold');
  sh.getRange(r + BC_BTN, 2, 1, 2).clearDataValidations();   // вставлений рядок міг успадкувати список «Фото» — тут вільний текст
  sh.getRange(r + BC_BTN, 2).setBackground('#e3f0fa').setNote('Текст своєї кнопки під повідомленням (замість «' + BC_BUTTON + '»), напр. 📍 Маршрут. Порожньо — «' + BC_BUTTON + '».');
  sh.getRange(r + BC_BTN, 3).setBackground('#e3f0fa').setNote('Посилання для кнопки, напр. https://maps.app.goo.gl/…');
  var text = sh.getRange(r + BC_TEXT, 2);
  text.setWrap(true).setVerticalAlignment('top').setBackground('#fffbe8');
  sh.setRowHeight(r + BC_TEXT, 110);

  var to = sh.getRange(r + BC_TO, 2);
  var toNow = String(to.getDisplayValue()).trim();
  to.clearDataValidations();
  to.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([BC_TO_NONE, BC_TO_ME, BC_TO_REG, BC_TO_ALL, BC_TO_CHAT], true).setAllowInvalid(false).build())
    .setFontWeight('bold').setBackground('#e3f0fa');
  if (toNow !== BC_TO_ME && toNow !== BC_TO_REG && toNow !== BC_TO_ALL && toNow !== BC_TO_CHAT) to.setValue(BC_TO_NONE);

  sh.getRange(r + BC_TESTID, 2).setNumberFormat('@').setBackground('#e3f0fa').setHorizontalAlignment('left');

  var act = sh.getRange(r + BC_ACTION, 2);
  act.clearDataValidations();
  act.setValue(BC_IDLE);
  act.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([BC_IDLE, BC_TEST, BC_SEND], true).setAllowInvalid(false).build())
    .setFontWeight('bold').setBackground('#fde7e7');

  // Табличка картинок і список «Фото»
  var p = bcPicsRow_(sh);
  if (!p) {
    p = r + BC_HELP + 2;
    sh.getRange(p, 1).setValue(BC_PICS_TITLE);
    sh.getRange(p + 1, 1, 1, 2).setValues([['Назва', 'Посилання на фото (Google Drive, доступ «Усі, хто має посилання»)']]);
    sh.getRange(p + 2, 1, BC_PICS_DEFAULT.length, 1).setValues(BC_PICS_DEFAULT.map(function (n) { return [n]; }));
  }
  sh.getRange(p, 1).setFontWeight('bold').setFontSize(12);
  sh.getRange(p + 1, 1, 1, 2).setFontWeight('bold').setFontColor('#475467');
  sh.getRange(p + 2, 1, BC_PICS_ROWS, 1).setBackground('#f7f8fa');
  sh.getRange(p + 2, 2, BC_PICS_ROWS, 1).setBackground('#e3f0fa').setWrap(false);
  var photo = sh.getRange(r + BC_PHOTO, 2);
  bcPhotoRule_(sh, r, p);
  photo.setFontWeight('bold').setBackground('#e3f0fa');
  if (!String(photo.getDisplayValue()).trim()) photo.setValue(BC_NO_PHOTO);

  var help = sh.getRange(r + BC_HELP, 1, 1, 2);
  help.merge().setWrap(true).setFontColor('#475467').setVerticalAlignment('top');
  help.setValue('Посилання в тексті: [Правила турніру](https://…) — учасник побачить клікабельні слова «Правила турніру». Звичайне посилання теж стає клікабельним. ' +
    '\n«Кнопка» — своя кнопка під повідомленням замість «' + BC_BUTTON + '»: у B — текст (напр. 📍 Маршрут), у C — посилання. Порожньо — кнопка «' + BC_BUTTON + '» (з фото «' + BC_CARD_PICS.join('» / «') + '» учасникам — «' + BC_BUTTON_ME + '»). ' +
    '\n«Фото» — картинка з таблички «' + BC_PICS_TITLE + '» нижче або «' + BC_NO_PHOTO + '» (лише текст). Текст стає підписом під фото; якщо він довший за 1024 символи — бот надішле фото, а за ним текст окремим повідомленням. ' +
    '\n«Кому» спершу «—»: поки не оберете отримувачів, «' + BC_SEND + '» нічого не надішле (тест собі працює завжди). Після розсилки «Кому» знову стає «—». ' +
    '\n«' + BC_TO_REG + '» — основний склад з аркуша «Учасники» (стільки, скільки вказано в «Кількість місць»; резерв не отримує). ' +
    '«' + BC_TO_ME + '» — лише вам, на ID з рядка «Тест — мій Telegram ID», точно так, як отримають учасники. ' +
    '«' + BC_TO_CHAT + '» — одне повідомлення в чат турніру (бот має бути доданий туди адміністратором з правом надсилати повідомлення; мітки {ім\'я}, {місце} там не працюють). ' +
    '«' + BC_TO_ALL + '» — усі з аркуша «Відвідування». Бот може написати лише тим, хто колись натиснув Start у боті або дозволив повідомлення: кому не дійшло, тому в «Відвідуванні» стане «Можна писати: ні». ' +
    '\nУ тексті можна писати мітки — кожен отримає свої дані: {ім\'я} (у кличному відмінку: Андрію, Олександре), {прізвище}, {номер}, {місце} (напр. 5-те), {бали}, {риби}. ' +
    '{місце}, {бали} і {риби} беруться з опублікованих результатів — спершу опублікуйте їх у B3. Кому мітку нема чим заповнити, той повідомлення не отримує. ' +
    '\nКнопка під повідомленням відкриває апку; учасникам — одразу з виділеним їхнім рядком. Коли результати опубліковані й в учасника є місце, кнопка називається «' + BC_BUTTON_ME + '», інакше — «' + BC_BUTTON + '». Новий рядок у тексті: Ctrl+Enter (⌘+Enter). ' +
    '\n«' + BC_TEST + '» — те саме повідомлення лише на ID вище (з вашими даними). «' + BC_SEND + '» — по-справжньому, скасувати не можна. Після надсилання «Дія» повертається в «—».');
  bcStatus_(sh, r, recipientsInfo_(sh.getParent(), sh, r));
}

function bcStatus_(sh, r, text) { sh.getRange(r + BC_STATUS, 2).setValue(text); }

/** Текст → HTML для Telegram: екрануємо <>&, а [слова](https://…) робимо посиланням. */
function bcHtml_(text) {
  var esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\[([^\]\n]+)\]\(((?:https?|tg):\/\/[^\s)]+)\)/g, function (m, label, url) {
    return '<a href="' + url.replace(/"/g, '&quot;') + '">' + label + '</a>';
  });
}
/** Скільки символів побачить людина (для ліміту підпису під фото 1024). */
function bcVisibleLen_(text) {
  return String(text).replace(/\[([^\]\n]+)\]\(((?:https?|tg):\/\/[^\s)]+)\)/g, '$1').length;
}

/** Рядок заголовка «Картинки для розсилки» (0 — таблички немає). */
function bcPicsRow_(sh) {
  var last = sh.getLastRow();
  if (last < 1) return 0;
  var col = sh.getRange(1, 1, last, 1).getDisplayValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === BC_PICS_TITLE) return i + 1;
  return 0;
}

/** Список у «Фото»: «Без фото» + назви з таблички. Оновлюється, коли змінюєте назви в табличці. */
function bcPhotoRule_(sh, r, p) {
  p = p || bcPicsRow_(sh);
  var names = p ? sh.getRange(p + 2, 1, BC_PICS_ROWS, 1).getDisplayValues()
    .map(function (x) { return String(x[0]).trim(); }).filter(function (n) { return n && n !== BC_NO_PHOTO; }) : [];
  var photo = sh.getRange(r + BC_PHOTO, 2);
  photo.clearDataValidations();
  photo.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([BC_NO_PHOTO].concat(names), true).setAllowInvalid(false)
    .setHelpText('«' + BC_NO_PHOTO + '» — лише текст. Інші — картинки з таблички «' + BC_PICS_TITLE + '» нижче.').build());
}

/** Посилання на картинку за назвою з таблички (або '' якщо фото не обрано). */
function bcPhotoLink_(sh, r) {
  var name = String(sh.getRange(r + BC_PHOTO, 2).getDisplayValue()).trim();
  if (!name || name === BC_NO_PHOTO) return { name: '', link: '' };
  var p = bcPicsRow_(sh);
  if (!p) return { name: name, link: '' };
  var rows = sh.getRange(p + 2, 1, BC_PICS_ROWS, 2).getDisplayValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === name) return { name: name, link: String(rows[i][1]).trim() };
  return { name: name, link: '' };
}

/** Завантажує картинку за посиланням (Google Drive або пряме). Повертає Blob або кидає зрозумілу помилку. */
function bcFetchPhoto_(link) {
  var id = (/\/d\/([\w-]{20,})/.exec(link) || /[?&]id=([\w-]{20,})/.exec(link) || [])[1];
  var url = id ? 'https://drive.google.com/uc?export=download&id=' + id : link;
  if (!/^https?:\/\//i.test(url)) throw new Error('Це не посилання: ' + link);
  var resp = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
  var type = String((resp.getHeaders() || {})['Content-Type'] || resp.getBlob().getContentType() || '').toLowerCase();
  if (resp.getResponseCode() !== 200 || type.indexOf('image/') !== 0) {
    throw new Error('Не вдалося взяти фото — відкрийте доступ «Усі, хто має посилання» (Google Drive → Поділитися)');
  }
  var blob = resp.getBlob();
  if (blob.getBytes().length > 10 * 1024 * 1024) throw new Error('Фото більше за 10 МБ — Telegram не прийме');
  return blob.setName('photo.' + (type.indexOf('png') !== -1 ? 'png' : 'jpg'));
}

/** sendPhoto: photo — Blob (перше завантаження) або file_id (далі). */
function tgPhoto_(chatId, photo, caption, markup) {
  if (typeof photo === 'string') {
    var p = { chat_id: chatId, photo: photo };
    if (caption) { p.caption = caption; p.parse_mode = 'HTML'; }
    if (markup) p.reply_markup = markup;
    return tgApi_('sendPhoto', p);
  }
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var form = { chat_id: String(chatId), photo: photo };
  if (caption) { form.caption = caption; form.parse_mode = 'HTML'; }
  if (markup) form.reply_markup = JSON.stringify(markup);
  var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + String(token).trim() + '/sendPhoto', { method: 'post', payload: form, muteHttpExceptions: true });
  try { return JSON.parse(resp.getContentText()); } catch (e) { return null; }
}

// ----- Хто є хто -----

/** Основний склад з «Учасників»: [{num, name, id}] (перші «Кількість місць» рядків з іменем). */
function mainSquad_(ss) {
  var reg = roundSheet_(ss, REG_SHEET);
  if (!reg || reg.getLastRow() < 2) return [];
  var rows = reg.getRange(2, 1, reg.getLastRow() - 1, REG_COL_TG_ID).getDisplayValues();
  var site = ss.getSheetByName(SYNC_SHEET);
  var seats = site ? parseInt(String(site.getRange(CELL_SEATS).getDisplayValue()).replace(/\s/g, ''), 10) : 0;
  var out = [];
  rows.forEach(function (x) {
    var name = String(x[REG_COL_NAME - 1]).replace(/\s+/g, ' ').trim();
    if (!name) return;
    out.push({ num: String(x[REG_COL_NUM - 1]).trim(), name: name, id: String(x[REG_COL_TG_ID - 1]).replace(/\s/g, '') });
  });
  return seats > 0 ? out.slice(0, seats) : out;
}

/** «Відвідування»: [{id, row, regNames: []}] */
function visitors_(ss) {
  var vs = ss.getSheetByName(VISITS_SHEET);
  if (!vs || vs.getLastRow() < 2) return [];
  return vs.getRange(2, 1, vs.getLastRow() - 1, VISITS_HEAD.length).getDisplayValues().map(function (x, i) {
    return {
      id: String(x[0]).replace(/\s/g, ''), row: i + 2,
      regNames: String(x[3]).split(',').map(function (n) { return n.replace(/\s+/g, ' ').trim().toLowerCase(); }).filter(Boolean)
    };
  }).filter(function (v) { return /^\d{3,15}$/.test(v.id); });
}

/** Кому надсилати: [{id, person|null, visitRow}] — один запис на Telegram ID. */
function bcRecipients_(ss, toReg) {
  var vis = visitors_(ss), byId = {}, out = [], seen = {};
  vis.forEach(function (v) { if (!byId[v.id]) byId[v.id] = v; });
  var squad = mainSquad_(ss);
  var idOf = function (p) {
    if (/^\d{3,15}$/.test(p.id)) return p.id;
    var key = p.name.toLowerCase();
    var v = vis.find(function (x) { return x.regNames.indexOf(key) !== -1; });
    return v ? v.id : '';
  };
  var personById = {};
  squad.forEach(function (p) { var id = idOf(p); if (id && !personById[id]) personById[id] = p; });
  if (toReg) {
    squad.forEach(function (p) {
      var id = idOf(p);
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, person: personById[id], visitRow: byId[id] ? byId[id].row : 0 });
    });
  } else {
    vis.forEach(function (v) {
      if (seen[v.id]) return;
      seen[v.id] = 1;
      out.push({ id: v.id, person: personById[v.id] || null, visitRow: v.row });
    });
    // учасники з ID, яких чомусь немає у «Відвідуванні»
    squad.forEach(function (p) {
      var id = idOf(p);
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, person: p, visitRow: 0 });
    });
  }
  return out;
}

function recipientsInfo_(ss, sh, r) {
  var toVal = String(sh.getRange(r + BC_TO, 2).getDisplayValue()).trim();
  if (toVal === BC_TO_CHAT) return 'Готово до розсилки: одне повідомлення в чат ' + BC_CHAT;
  if (toVal === BC_TO_ME) return 'Готово: повідомлення лише собі (на ID з рядка «Тест — мій Telegram ID»), так, як його отримають учасники';
  if (toVal !== BC_TO_REG && toVal !== BC_TO_ALL) return 'Оберіть у «Кому», кому надсилати';
  var toReg = toVal === BC_TO_REG;
  var list = bcRecipients_(ss, toReg);
  var n = list.length;
  var info = 'Готово до розсилки: ' + n + ' ' + plural_(n, 'отримувач', 'отримувачі', 'отримувачів');
  if (toReg) {
    var squad = mainSquad_(ss).length, noId = squad - n;
    info += ' з ' + squad + ' учасників основного складу' + (noId > 0 ? ' (ще ' + noId + ' без Telegram)' : '');
  } else info += ' (усі, хто відкривав апку)';
  return info;
}

// ----- Підстановки {ім'я}, {місце}… -----

/** Результати з опублікованого знімка: { 'прізвище ім'я' (малими): {place, pts, fish} }, або null. */
function publishedResults_() {
  var json = getSnapshot_();
  if (!json) return null;
  var snap; try { snap = JSON.parse(json); } catch (e) { return null; }
  var sheet = (snap.sheets || []).find(function (x) { return /результат/i.test(x.name || ''); });
  if (!sheet || !sheet.values || !sheet.values.length) return null;
  var hr = Number(sheet.headerRows) || 1, vals = sheet.values, w = 0;
  vals.forEach(function (row) { w = Math.max(w, row.length); });
  var labels = [];
  for (var c = 0; c < w; c++) {
    var l = '';
    for (var h = 0; h < hr && h < vals.length; h++) if (String(vals[h][c] || '').trim()) l = String(vals[h][c]).trim();
    labels.push(l.toLowerCase());
  }
  var find = function (re) { for (var i = 0; i < labels.length; i++) if (re.test(labels[i])) return i; return -1; };
  var cName = find(/учасник|прізвище|піб/), cPlace = find(/^(#|№|місце)$/), cPts = find(/^бали/), cFish = find(/^риб/);
  if (cName < 0) return null;
  var out = {}, anyPts = false;
  vals.slice(hr).forEach(function (row) {
    var name = String(row[cName] || '').replace(/\s+/g, ' ').trim();
    if (!name) return;
    var pts = cPts >= 0 ? Number(String(row[cPts]).replace(',', '.')) : NaN;
    if (pts > 0) anyPts = true;
    out[name.toLowerCase()] = {
      place: cPlace >= 0 ? parseInt(row[cPlace], 10) : NaN,
      pts: isNaN(pts) ? '' : String(row[cPts]).trim(),
      fish: cFish >= 0 ? String(row[cFish]).trim() : ''
    };
  });
  // Турнір ще не почався (у всіх 0 балів) — місць ще немає
  if (!anyPts) Object.keys(out).forEach(function (k) { out[k].place = NaN; });
  return out;
}

/** Порядковий: 1-ше, 2-ге, 3-тє, 5-те, 7-ме… */
function ordinal_(n) {
  var t = n % 100, d = n % 10, end;
  if (t >= 11 && t <= 19) end = 'те';
  else end = { 1: 'ше', 2: 'ге', 3: 'тє', 7: 'ме', 8: 'ме' }[d] || (d === 0 && n % 100 === 40 ? 'ве' : 'те');
  return n + '-' + end;
}

/** Кличний відмінок імені: Андрій → Андрію, Олександр → Олександре, Дмитро → Дмитре, Олена → Олено. */
function vocative_(name) {
  var n = String(name || '').trim();
  if (!n) return n;
  var exc = { 'Ігор': 'Ігоре', 'Лев': 'Леве', 'Петро': 'Петре', 'Ілля': 'Іллє', 'Марія': 'Маріє', 'Наталія': 'Наталіє', 'Ольга': 'Ольго',
    'Любов': 'Любове', 'Яків': 'Якове', 'Федір': 'Федоре', 'Никифір': 'Никифоре', 'Антоній': 'Антонію' };
  if (/[кгх]$/.test(n)) return n + 'у';                         // Марк → Марку, Олег → Олегу
  if (exc[n]) return exc[n];
  if (/[ії]й$/.test(n)) return n.slice(0, -1) + 'ю';         // Андрій, Віталій, Сергій, Олексій
  if (/ій$/.test(n)) return n.slice(0, -1) + 'ю';
  if (/й$/.test(n)) return n.slice(0, -1) + 'ю';               // Валентин(ий)…
  if (/ія$/.test(n)) return n.slice(0, -1) + 'є';              // Юлія → Юліє
  if (/я$/.test(n)) return n.slice(0, -1) + 'ю';               // Таня → Таню
  if (/а$/.test(n)) return n.slice(0, -1) + 'о';               // Микита → Микито
  if (/о$/.test(n)) return n.slice(0, -1) + 'е';               // Дмитро → Дмитре
  if (/ь$/.test(n)) return n.slice(0, -1) + 'ю';               // Олесь → Олесю, Василь → Василю
  if (/[бвгґджзклмнпрстфхцчшщ]$/i.test(n)) return n + 'е';     // Іван → Іване, Олександр → Олександре
  return n;
}

var BC_TAGS = /\{\s*(ім['’ʼ`]?я|прізвище|номер|місце|бали|риби)\s*\}/gi;

/** Підставляє дані людини в текст. Повертає null, якщо якусь мітку нема чим заповнити. */
function personalize_(text, person, results) {
  var missing = false;
  var out = text.replace(BC_TAGS, function (m, tag) {
    tag = tag.toLowerCase().replace(/['’ʼ`]/g, '');
    if (!person) { missing = true; return m; }
    var parts = person.name.split(' ');
    var res = results ? results[person.name.toLowerCase()] : null;
    var v = '';
    if (tag === 'імя') v = vocative_(parts[1] || parts[0]);
    else if (tag === 'прізвище') v = parts[0];
    else if (tag === 'номер') v = person.num;
    else if (tag === 'місце') v = res && res.place > 0 ? ordinal_(res.place) : '';
    else if (tag === 'бали') v = res ? res.pts : '';
    else if (tag === 'риби') v = res ? res.fish : '';
    if (v === '' || v == null) missing = true;
    return v;
  });
  return missing ? null : out;
}

function plural_(n, one, few, many) {
  n = Math.abs(n) % 100;
  var n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

/** Правка в блоці розсилки. Повертає true, якщо правка стосувалась блоку. */
function handleBroadcastEdit_(e, sh) {
  var r = bcRow_(sh);
  if (!r) return false;
  // Змінили назви в табличці «Картинки для розсилки» — оновлюємо список у «Фото»
  var pr = e.range.getColumn() === 1 ? bcPicsRow_(sh) : 0;
  if (pr && e.range.getLastRow() >= pr + 2 && e.range.getRow() <= pr + 1 + BC_PICS_ROWS) { bcPhotoRule_(sh, r, pr); resPhotoRule_(sh); return true; }
  if (e.range.getColumn() !== 2 || e.range.getNumRows() !== 1) return false;
  var row = e.range.getRow();
  if (row < r + BC_TEXT || row > r + BC_STATUS) return false;
  var ss = e.source || sh.getParent();
  if (row !== r + BC_ACTION) {
    if (row === r + BC_TO) bcStatus_(sh, r, recipientsInfo_(ss, sh, r));   // змінили «Кому» — оновлюємо підрахунок
    return true;
  }
  var v = String(e.value == null ? '' : e.value).trim();
  if (v !== BC_TEST && v !== BC_SEND) return true;
  broadcast_(ss, sh, r, v === BC_TEST);
  return true;
}

function broadcast_(ss, sh, r, test) {
  var act = sh.getRange(r + BC_ACTION, 2);
  var now = function () { return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Europe/Kyiv', 'dd.MM.yyyy HH:mm'); };
  if (!PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')) {
    act.setValue(BC_IDLE); bcStatus_(sh, r, '⚠️ Немає BOT_TOKEN у властивостях скрипта'); return;
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { act.setValue(BC_IDLE); bcStatus_(sh, r, '⚠️ Розсилка вже йде, спробуйте за хвилину'); return; }
  try {
    act.setValue(BC_IDLE);   // одразу повертаємо «—», щоб випадково не надіслати двічі
    var text = String(sh.getRange(r + BC_TEXT, 2).getValue() || '').replace(/\r\n?/g, '\n').trim();
    if (!text) { bcStatus_(sh, r, '⚠️ Немає тексту повідомлення'); return; }
    if (text.length > 4000) { bcStatus_(sh, r, '⚠️ Задовгий текст: ' + text.length + ' символів (максимум 4000)'); return; }
    var hasTags = new RegExp(BC_TAGS.source, 'i').test(text);
    var results = publishedResults_();   // для міток і для назви кнопки
    var toVal = String(sh.getRange(r + BC_TO, 2).getDisplayValue()).trim();
    var toReg = toVal === BC_TO_REG;
    var toChat = toVal === BC_TO_CHAT;
    if (toVal === BC_TO_ME) test = true;   // «Собі» — те саме, що тест: на свій ID, вигляд як в учасників
    if (!test && toVal !== BC_TO_REG && toVal !== BC_TO_ALL && !toChat) { bcStatus_(sh, r, '⚠️ Не надіслано: оберіть у «Кому», кому надсилати'); return; }
    if (!test && toChat && hasTags) { bcStatus_(sh, r, '⚠️ У чат не надіслано: мітки {ім\'я}, {місце}… працюють лише в особистих повідомленнях — приберіть їх з тексту'); return; }

    var list;
    if (test) {
      var tid = String(sh.getRange(r + BC_TESTID, 2).getDisplayValue()).replace(/\s/g, '');
      if (!/^\d{3,15}$/.test(tid)) { bcStatus_(sh, r, '⚠️ Вкажіть свій Telegram ID у рядку «Тест — мій Telegram ID» (є в аркуші «Відвідування», колонка A)'); return; }
      // Тест — з даними самого тестувальника; якщо його немає серед учасників — з даними першого учасника
      var mine = bcRecipients_(ss, true).find(function (x) { return x.id === tid; });
      var person = mine ? mine.person : (hasTags ? (mainSquad_(ss)[0] || null) : null);
      list = [{ id: tid, person: person, visitRow: 0 }];
    } else if (toChat) {
      list = [{ id: BC_CHAT, person: null, visitRow: 0, chat: true }];
    } else {
      list = bcRecipients_(ss, toReg);
      if (!list.length) { bcStatus_(sh, r, '⚠️ Немає кому надсилати'); return; }
    }

    // Друга кнопка (необов'язково)
    var btnText = String(sh.getRange(r + BC_BTN, 2).getDisplayValue()).trim();
    var btnUrl = String(sh.getRange(r + BC_BTN, 3).getDisplayValue()).trim();
    var extraBtn = null;
    if (btnText || btnUrl) {
      if (!btnText || !/^(https?|tg):\/\/\S+$/i.test(btnUrl)) { bcStatus_(sh, r, '⚠️ «Кнопка»: потрібні і текст (B), і посилання на https://… (C)'); return; }
      extraBtn = { text: btnText.slice(0, 60), url: btnUrl };
    }

    // Фото (якщо обрано): завантажуємо один раз, далі Telegram надсилає за file_id
    var pic = bcPhotoLink_(sh, r), photo = null;
    if (pic.name) {
      if (!pic.link) { bcStatus_(sh, r, '⚠️ Для «' + pic.name + '» немає посилання в табличці «' + BC_PICS_TITLE + '»'); return; }
      try { photo = bcFetchPhoto_(pic.link); } catch (err) { bcStatus_(sh, r, '⚠️ ' + err.message); return; }
    }

    bcStatus_(sh, r, '⏳ Надсилаю… 0 з ' + list.length);
    SpreadsheetApp.flush();
    var sent = 0, blocked = 0, noStart = 0, gone = 0, failed = 0, skipped = 0, errs = {}, vs = ss.getSheetByName(VISITS_SHEET);
    var send = function (chatId, body, markup) {
      var html = bcHtml_(body);
      if (!photo) return tgApi_('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: true });
      var fits = bcVisibleLen_(body) <= 1024;
      var res = tgPhoto_(chatId, photo, fits ? html : '', fits ? markup : null);
      if (res && res.ok && typeof photo !== 'string') {   // запам'ятали file_id — далі без повторного завантаження
        var sizes = res.result && res.result.photo;
        if (sizes && sizes.length) photo = sizes[sizes.length - 1].file_id;
      }
      if (res && res.ok && !fits) res = tgApi_('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: true });
      return res;
    };
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      var body = hasTags ? personalize_(text, x.person, results) : text;
      if (body == null) { skipped++; continue; }
      // Учасник: апка відкривається з його виділеним рядком; «Моя картка» — коли в нього вже є місце в результатах
      var url = SETTINGS.SITE_URL + (x.person && x.person.num ? '?sel=' + encodeURIComponent(x.person.num) : '');
      var res0 = x.person && results ? results[x.person.name.toLowerCase()] : null;
      var played = res0 && res0.place > 0 && (Number(String(res0.pts).replace(',', '.')) > 0 || Number(res0.fish) > 0);
      // У групах і каналах Telegram не дозволяє кнопку-апку — там звичайне посилання на апку
      // Заповнена своя «Кнопка» — під повідомленням лише вона (і в чаті, і в особистих).
      // Порожня — кнопка апки: в особистих «Моя картка» / «Відкрити TM APP», у чаті — посилання на апку.
      var chatLike = x.chat || (test && toChat);
      // «Моя картка» — лише з фото «Проміжні / Підсумкові результати» і коли в учасника вже є місце
      var myCard = played && BC_CARD_PICS.indexOf(pic.name) !== -1;
      var markup = { inline_keyboard: [[extraBtn ? extraBtn
        : chatLike ? { text: BC_BUTTON, url: BC_APP_LINK }
        : myCard ? { text: BC_BUTTON_ME, web_app: { url: url } }
        : { text: BC_BUTTON, web_app: { url: SETTINGS.SITE_URL } }]] };
      var res = send(x.id, body, markup);
      if (res && !res.ok && res.error_code === 429) {   // Telegram просить зачекати
        Utilities.sleep(((res.parameters && res.parameters.retry_after) || 1) * 1000 + 200);
        res = send(x.id, body, markup);
      }
      if (res && res.ok) {
        sent++;
        if (vs && x.visitRow && !test) vs.getRange(x.visitRow, VISITS_COL_WRITE).setValue('так');
      } else {
        // Розрізняємо причину за текстом помилки Telegram
        var why = bcWhy_(res);
        if (why === 'blocked') blocked++;
        else if (why === 'nostart') noStart++;
        else if (why === 'gone') gone++;
        else { failed++; var d = String((res && res.description) || 'немає відповіді').replace(/^Bad Request:\s*/i, ''); errs[d] = (errs[d] || 0) + 1; }
        if (why && vs && x.visitRow && !test) vs.getRange(x.visitRow, VISITS_COL_WRITE).setValue('ні');
      }
      if (i % 10 === 9) { bcStatus_(sh, r, '⏳ Надсилаю… ' + (i + 1) + ' з ' + list.length); SpreadsheetApp.flush(); }
      Utilities.sleep(60);   // ~15 повідомлень за секунду — з запасом до ліміту Telegram
    }
    var total = list.length;
    var msg = test
      ? '🧪 ' + now() + ' · ' + (sent ? 'тест надіслано собі ' + (toChat ? '(вигляд як у чаті ' + BC_CHAT + ')' : '(так, як отримають учасники)') + (pic.name ? ' з фото «' + pic.name + '»' : '') + (list[0].person && hasTags ? ' (з даними: ' + list[0].person.name + ')' : '')
          : skipped ? 'тест не надіслано: для «' + (list[0].person ? list[0].person.name : 'вас') + '» немає даних для міток (місце/бали — спершу опублікуйте результати)'
          : 'тест не дійшов — перевірте ID і чи натиснули ви Start у боті')
      : toChat
        ? (sent ? '✅ ' + now() + ' · надіслано в чат ' + BC_CHAT + (pic.name ? ' (фото «' + pic.name + '»)' : '')
                : '⚠️ ' + now() + ' · у чат ' + BC_CHAT + ' не надіслано: додайте бота в чат адміністратором з правом надсилати повідомлення')
      : '✅ ' + now() + ' · ' + (toReg ? 'учасникам' : 'усім, хто відкривав') + (pic.name ? ' (фото «' + pic.name + '»)' : '') + ': надіслано ' + sent + ' з ' + total +
        (noStart ? ' · ' + noStart + ' ще не натискали Start у боті' : '') +
        (blocked ? ' · ' + blocked + ' заблокували бота' : '') +
        (gone ? ' · ' + gone + ' видалили акаунт' : '') +
        (skipped ? ' · ' + skipped + ' без даних для міток' : '') +
        (failed ? ' · ' + failed + ' помилка (' + Object.keys(errs).slice(0, 2).join('; ') + ')' : '');
    bcStatus_(sh, r, msg);
    // Після справжньої розсилки «Кому» знову порожнє — щоб наступну не надіслати випадково не тим
    if (!test) sh.getRange(r + BC_TO, 2).setValue(BC_TO_NONE);
  } catch (err) {
    console.error(err);
    bcStatus_(sh, r, '⚠️ Помилка розсилки: ' + (err && err.message ? err.message : err));
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Особисті результати в Telegram: після публікації кожен учасник, якому бот може писати,
// отримує своє місце (і зміну), бали, перемоги, улов, відрив до місця вище, останні тури
// й кнопку «Моя картка». Блок на аркуші «Сайт» під табличкою картинок; надсилання — вручну.
// ---------------------------------------------------------------------------

var RES_TITLE = 'Особисті результати в Telegram';
var RES_PHOTO = 1, RES_ACTION = 2, RES_STATUS = 3, RES_HELP = 4;
var RES_IDLE = '—';
var RES_TEST = 'Надіслати тест собі';
var RES_SEND = 'Надіслати учасникам';
var RES_RESEND = 'Надіслати учасникам ще раз';
var RES_CODES = { 'В': 1, 'П': 1, 'РН': 1, 'БН': 1 };
// Результати в чат турніру (з «Пульта»): готовий текст + фото «Проміжні результати» / «Підсумкові результати»
var RES_CHAT_MID = 'Проміжні результати → чат ' + BC_CHAT;
var RES_CHAT_FIN = 'Підсумкові результати → чат ' + BC_CHAT;
var RES_CHAT_TEST = 'Результати для чату → тест собі';

/** Рядок заголовка блоку за назвою в колонці A (0 — немає). */
function titleRow_(sh, title) {
  var last = sh.getLastRow();
  if (last < 1) return 0;
  var col = sh.getRange(1, 1, last, 1).getDisplayValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === title) return i + 1;
  return 0;
}

/** Назви картинок з таблички «Картинки для розсилки». */
function picsNames_(sh) {
  var p = bcPicsRow_(sh);
  return p ? sh.getRange(p + 2, 1, BC_PICS_ROWS, 1).getDisplayValues()
    .map(function (x) { return String(x[0]).trim(); }).filter(function (n) { return n && n !== BC_NO_PHOTO; }) : [];
}

/** Посилання на картинку за назвою (або ''). */
function picLink_(sh, name) {
  var p = bcPicsRow_(sh);
  if (!p || !name || name === BC_NO_PHOTO) return '';
  var rows = sh.getRange(p + 2, 1, BC_PICS_ROWS, 2).getDisplayValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === name) return String(rows[i][1]).trim();
  return '';
}

function resPhotoRule_(sh, r) {
  r = r || titleRow_(sh, RES_TITLE);
  if (!r) return;
  var cell = sh.getRange(r + RES_PHOTO, 2);
  cell.clearDataValidations();
  cell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([BC_NO_PHOTO].concat(picsNames_(sh)), true).setAllowInvalid(false)
    .setHelpText('Картинка з таблички «' + BC_PICS_TITLE + '» — однакова для всіх, під нею кожен бачить свій текст.').build());
}

/** Створює (або оновлює оформлення) блоку під табличкою картинок. */
function setupResults_(sh) {
  var r = titleRow_(sh, RES_TITLE);
  if (!r) {
    var p = bcPicsRow_(sh);
    r = p ? p + 2 + BC_PICS_ROWS + 2 : sh.getLastRow() + 3;
  }
  sh.getRange(r, 1).setValue(RES_TITLE).setFontWeight('bold').setFontSize(12);
  sh.getRange(r + RES_PHOTO, 1, 3, 1).setValues([['Фото'], ['Дія'], ['Стан']]).setFontWeight('bold');
  var photo = sh.getRange(r + RES_PHOTO, 2);
  var cur = String(photo.getDisplayValue()).trim();
  resPhotoRule_(sh, r);
  if (!cur) photo.setValue(picsNames_(sh).indexOf('Проміжні результати') !== -1 ? 'Проміжні результати' : BC_NO_PHOTO);
  photo.setFontWeight('bold').setBackground('#e3f0fa');
  var act = sh.getRange(r + RES_ACTION, 2);
  act.clearDataValidations();
  act.setValue(RES_IDLE);
  act.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([RES_IDLE, RES_TEST, RES_SEND, RES_RESEND], true).setAllowInvalid(false).build())
    .setFontWeight('bold').setBackground('#fde7e7');
  sh.getRange(r + RES_STATUS, 2).setWrap(true);
  var help = sh.getRange(r + RES_HELP, 1, 1, 2);
  help.merge().setWrap(true).setFontColor('#475467').setVerticalAlignment('top');
  help.setValue('Після кожної публікації результатів (B3) кожен учасник, якому бот може писати, отримує особисте повідомлення: ' +
    'місце і зміну місця з минулої публікації (▲▼), бали, перемоги, улов, скільки балів до місця вище, результати останніх турів ' +
    'і кнопку «' + BC_BUTTON_ME + '». Текст складається сам. ' +
    '\n«Фото» — картинка з таблички «' + BC_PICS_TITLE + '» (після останнього туру оберіть «Підсумкові результати»). ' +
    '\n«' + RES_TEST + '» — лише вам, на ID з рядка «Тест — мій Telegram ID» блоку розсилки (з вашими даними, а якщо ви не учасник — з даними 1-го місця). ' +
    '«' + RES_SEND + '» — по-справжньому, скасувати не можна. Двічі за той самий тур не надішле — для цього є «' + RES_RESEND + '» (напр. після виправлення помилки в таблиці). ' +
    '\nОтримають лише ті, хто натиснув Start у боті або дозволив повідомлення в апці.');
  sh.setRowHeight(r + RES_HELP, 120);
  resRefresh_(sh.getParent(), sh);
}

/**
 * Дані для повідомлень з опублікованих аркушів: { round, total, people: {ключ: {name, place, pts, wins, fish, codes}} }
 * round — скільки турів зіграно (0 — ще жодного), total — скільки турів у таблиці.
 */
function resData_(sheets) {
  var low = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  var keyOf = resKey_;
  var num = function (s) { var x = Number(String(s == null ? '' : s).replace(',', '.').replace(/\s/g, '')); return isNaN(x) ? 0 : x; };
  var resSh = (sheets || []).find(function (x) { return /результат/i.test(x.name || ''); });
  if (!resSh || !resSh.values || resSh.values.length < 2) return null;
  var v = resSh.values, w = 0;
  v.forEach(function (row) { w = Math.max(w, row.length); });
  var labels = [];
  for (var c = 0; c < w; c++) {
    var l = '';
    for (var h = 0; h < 2 && h < v.length; h++) if (String(v[h][c] || '').trim()) l = low(v[h][c]);
    labels.push(l);
  }
  var find = function (re) { for (var i = 0; i < labels.length; i++) if (re.test(labels[i])) return i; return -1; };
  var cName = find(/учасник|прізвище|піб/), cPlace = find(/^(#|№|місце)$/), cPts = find(/^бали/), cWins = find(/^виграш|^перемог/), cFish = find(/^риб/);
  if (cName < 0 || cPlace < 0) return null;
  var people = {}, any = false;
  v.forEach(function (row) {
    var name = String(row[cName] || '').replace(/\s+/g, ' ').trim();
    var place = parseInt(row[cPlace], 10);
    if (!name || !(place > 0)) return;
    var p = { name: name, place: place, pts: cPts >= 0 ? num(row[cPts]) : 0, wins: cWins >= 0 ? num(row[cWins]) : null, fish: cFish >= 0 ? num(row[cFish]) : 0, codes: [] };
    if (p.pts > 0 || p.fish > 0) any = true;
    people[keyOf(name)] = p;
  });
  if (!any) return { round: 0, total: 0, people: people };
  // Тури: «Тур N» у першому рядку заголовка; під ним — результат (В/П/РН/БН) і риба
  var round = 0, total = 0;
  var tSh = (sheets || []).find(function (x) { return /^тур/i.test(x.name || ''); });
  if (tSh && tSh.values && tSh.values.length > 2) {
    var head = tSh.values[0], cols = {}, tName = -1;
    head.forEach(function (x, i) {
      var m = /^тур\s*(\d+)/i.exec(String(x || '').trim());
      if (m) { cols[Number(m[1])] = i; total = Math.max(total, Number(m[1])); }
      if (/учасник|прізвище|піб/i.test(String(x || ''))) tName = i;
    });
    if (tName < 0) tName = 1;
    tSh.values.slice(1).forEach(function (row) {
      var p = people[keyOf(row[tName] || '')];
      if (!p) return;
      for (var n = 1; n <= total; n++) {
        var code = cols[n] != null ? String(row[cols[n]] || '').trim().toUpperCase() : '';
        p.codes[n - 1] = RES_CODES[code] ? code : '';
        if (RES_CODES[code]) round = Math.max(round, n);
      }
    });
    Object.keys(people).forEach(function (k) {
      var p = people[k];
      if (p.wins == null) p.wins = p.codes.filter(function (x) { return x === 'В'; }).length;
    });
  }
  if (!round) round = 1;   // результати є, а турів не знайшли — вважаємо, що зіграно хоча б один
  return { round: round, total: total, people: people };
}

/** Місця після кожної публікації результатів — щоб показати ▲▼. Зберігаємо по турах. */
function resSavePlaces_(payload) {
  if (!payload) return;
  var props = PropertiesService.getScriptProperties();
  if (payload.mode === MODE_REG) {   // новий турнір (реєстрація) — минулі місця й «уже надіслано» більше не потрібні
    Object.keys(props.getProperties()).forEach(function (k) { if (/^res:/.test(k)) props.deleteProperty(k); });
    return;
  }
  if (payload.mode !== MODE_RES) return;
  var d = resData_(payload.sheets);
  if (!d || !d.round) return;
  var places = {};
  Object.keys(d.people).forEach(function (k) { places[k] = d.people[k].place; });
  props.setProperty('res:places:' + d.round, JSON.stringify(places));
}

/** Місця з найближчої попередньої публікації (тур < round), або null. */
function resPrevPlaces_(round) {
  var all = PropertiesService.getScriptProperties().getProperties(), best = 0;
  Object.keys(all).forEach(function (k) {
    var m = /^res:places:(\d+)$/.exec(k);
    if (m && Number(m[1]) < round && Number(m[1]) > best) best = Number(m[1]);
  });
  if (!best) return null;
  try { return { round: best, places: JSON.parse(all['res:places:' + best]) }; } catch (e) { return null; }
}

/** Ключ імені: малими, один пробіл, однаковий апостроф (В'югін = В’югін). */
function resKey_(n) { return String(n == null ? '' : n).replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase(); }

function resEsc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function resNum_(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }

/** HTML-текст особистого повідомлення. */
function resText_(p, d, prev) {
  var parts = p.name.split(' ');
  var first = vocative_(parts[1] || parts[0]);
  var R = d.round, T = d.total;
  var medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[p.place] || '📍';
  var final = T && R >= T;
  var lines = [];
  lines.push(resEsc_(first) + ', ' + (final ? 'підсумкові результати турніру 🏆' : 'результати після ' + R + ' туру 🎣'));
  lines.push('');
  var change = '';
  if (prev && prev.places) {
    var was = prev.places[resKey_(p.name)];
    if (was > 0) change = was > p.place ? ' ▲' + (was - p.place) : was < p.place ? ' ▼' + (p.place - was) : ' · без змін';
  }
  lines.push(medal + ' <b>' + ordinal_(p.place) + ' місце</b>' + change);
  lines.push(resNum_(p.pts) + ' ' + plural_(Math.round(p.pts), 'бал', 'бали', 'балів') + ' · ' +
    p.wins + ' ' + plural_(p.wins, 'перемога', 'перемоги', 'перемог') + ' · ' +
    p.fish + ' ' + plural_(p.fish, 'риба', 'риби', 'риб'));
  // Відрив: до місця вище (або від 2-го, якщо лідер)
  var byPlace = {};
  Object.keys(d.people).forEach(function (k) { byPlace[d.people[k].place] = d.people[k]; });
  if (p.place > 1 && byPlace[p.place - 1]) {
    var gap = byPlace[p.place - 1].pts - p.pts;
    lines.push(gap > 0 ? 'До ' + (p.place - 1) + '-го місця — ' + resNum_(gap) + ' ' + plural_(Math.round(gap), 'бал', 'бали', 'балів')
      : 'З ' + (p.place - 1) + '-м місцем — однаково балів');
  } else if (p.place === 1 && byPlace[2]) {
    var lead = p.pts - byPlace[2].pts;
    lines.push(lead > 0 ? 'Відрив від 2-го місця — ' + resNum_(lead) + ' ' + plural_(Math.round(lead), 'бал', 'бали', 'балів')
      : 'З 2-м місцем — однаково балів');
  }
  // Останні тури (до 5)
  if (p.codes && p.codes.length) {
    var from = Math.max(1, R - 4), codes = [];
    for (var n = from; n <= R; n++) codes.push(p.codes[n - 1] || '—');
    lines.push((from === R ? 'Тур ' + R : 'Тури ' + from + '–' + R) + ': ' + codes.join(' · '));
  }
  lines.push('');
  if (final) lines.push('Дякуємо за участь! 🙌');
  else if (T > R) lines.push('Попереду ще ' + (T - R) + ' ' + plural_(T - R, 'тур', 'тури', 'турів') + ' — успіхів! 💪');
  return lines.join('\n');
}

/** Стан блоку: що буде надіслано і кому. */
function resRefresh_(ss, sh) {
  sh = sh || ss.getSheetByName(SYNC_SHEET);
  var r = sh ? titleRow_(sh, RES_TITLE) : 0;
  if (!r) return;
  var info = resInfo_(ss);
  sh.getRange(r + RES_STATUS, 2).setValue(info);
  var pu = pultSheet_(ss);
  if (pu) pu.getRange(PULT_RES_STATUS).setValue(info);
}

function resInfo_(ss) {
  var snap = null;
  try { snap = JSON.parse(getSnapshot_() || 'null'); } catch (e) { snap = null; }
  if (!snap || snap.mode !== MODE_RES) return 'Спершу опублікуйте результати (режим «' + MODE_RES + '», B3)';
  var d = resData_(snap.sheets);
  if (!d || !d.round || !Object.keys(d.people).length) return 'Ще немає зіграних турів — надсилати нічого';
  var list = bcRecipients_(ss, true).filter(function (x) { return x.person && d.people[resKey_(x.person.name)]; });
  var squad = mainSquad_(ss).length;
  var info = 'Готово: ' + (d.total && d.round >= d.total ? 'підсумкові результати' : 'результати після ' + d.round + ' туру') +
    ' · отримають до ' + list.length + ' з ' + squad + ' (кому бот може писати)';
  var sent = null;
  try { sent = JSON.parse(PropertiesService.getScriptProperties().getProperty('res:sent') || 'null'); } catch (e) { sent = null; }
  if (sent && sent.round === d.round) info += '\n⚠️ Після ' + d.round + ' туру вже надіслано ' + sent.at + ' (' + sent.sent + ' з ' + sent.total + ')';
  else if (sent) info += '\nОстаннє надсилання: після ' + sent.round + ' туру, ' + sent.at;
  var chat = null;
  try { chat = JSON.parse(PropertiesService.getScriptProperties().getProperty('res:chat') || 'null'); } catch (e) { chat = null; }
  if (chat) info += '\nЧат ' + BC_CHAT + ': ' + (chat.fin ? 'підсумкові' : 'після ' + chat.round + ' туру') + ' надіслано ' + chat.at;
  return info;
}

/** Правка в блоці. Повертає true, якщо правка стосувалась блоку. */
function handleResultsEdit_(e, sh) {
  var r = titleRow_(sh, RES_TITLE);
  if (!r || e.range.getColumn() !== 2 || e.range.getNumRows() !== 1) return false;
  var row = e.range.getRow();
  if (row < r + RES_PHOTO || row > r + RES_STATUS) return false;
  if (row !== r + RES_ACTION) return true;
  var v = String(e.value == null ? '' : e.value).trim();
  if (v === RES_TEST || v === RES_SEND || v === RES_RESEND) resSend_(e.source || sh.getParent(), sh, r, v);
  return true;
}

function resSend_(ss, sh, r, how, also) {
  var act = sh.getRange(r + RES_ACTION, 2);
  if (!also) { var pu0 = pultSheet_(ss); if (pu0) also = pu0.getRange(PULT_RES_STATUS); }   // стан видно й на «Пульті»
  var status = function (t) { sh.getRange(r + RES_STATUS, 2).setValue(t); if (also) also.setValue(t); };
  var now = function () { return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Europe/Kyiv', 'dd.MM.yyyy HH:mm'); };
  act.setValue(RES_IDLE);   // одразу повертаємо «—», щоб випадково не надіслати двічі
  if (!PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')) { status('⚠️ Немає BOT_TOKEN у властивостях скрипта'); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { status('⚠️ Розсилка вже йде, спробуйте за хвилину'); return; }
  try {
    var snap = null;
    try { snap = JSON.parse(getSnapshot_() || 'null'); } catch (e0) { snap = null; }
    if (!snap || snap.mode !== MODE_RES) { status('⚠️ Спершу опублікуйте результати (режим «' + MODE_RES + '», B3)'); return; }
    var d = resData_(snap.sheets);
    if (!d || !d.round) { status('⚠️ Ще немає зіграних турів'); return; }
    var test = how === RES_TEST;
    var props = PropertiesService.getScriptProperties();
    var sent0 = null;
    try { sent0 = JSON.parse(props.getProperty('res:sent') || 'null'); } catch (e1) { sent0 = null; }
    if (how === RES_SEND && sent0 && sent0.round === d.round) {
      status('⚠️ Не надіслано: після ' + d.round + ' туру вже надсилали ' + sent0.at + '. Якщо треба ще раз — оберіть «' + RES_RESEND + '»');
      return;
    }
    var prev = resPrevPlaces_(d.round);
    var all = bcRecipients_(ss, true);
    var list;
    if (test) {
      var br = bcRow_(sh);
      var tid = br ? String(sh.getRange(br + BC_TESTID, 2).getDisplayValue()).replace(/\s/g, '') : '';
      if (!/^\d{3,15}$/.test(tid)) { status('⚠️ Вкажіть свій Telegram ID у рядку «Тест — мій Telegram ID» блоку «' + BC_TITLE + '»'); return; }
      var mine = all.find(function (x) { return x.id === tid && x.person && d.people[resKey_(x.person.name)]; });
      var sample = mine ? mine.person : null;
      if (!sample) {   // ви не учасник — показуємо на прикладі 1-го місця
        var top = Object.keys(d.people).map(function (k) { return d.people[k]; }).sort(function (a, b) { return a.place - b.place; })[0];
        var squadTop = mainSquad_(ss).find(function (p) { return resKey_(p.name) === resKey_(top.name); });
        sample = squadTop || { name: top.name, num: '' };
      }
      list = [{ id: tid, person: sample, visitRow: 0 }];
    } else {
      list = all.filter(function (x) { return x.person && d.people[resKey_(x.person.name)]; });
      if (!list.length) { status('⚠️ Немає кому надсилати: ніхто з учасників ще не натиснув Start у боті'); return; }
    }

    var picName = String(sh.getRange(r + RES_PHOTO, 2).getDisplayValue()).trim(), photo = null;
    if (picName && picName !== BC_NO_PHOTO) {
      var link = picLink_(sh, picName);
      if (!link) { status('⚠️ Для «' + picName + '» немає посилання в табличці «' + BC_PICS_TITLE + '»'); return; }
      try { photo = bcFetchPhoto_(link); } catch (err) { status('⚠️ ' + err.message); return; }
    }

    status('⏳ Надсилаю… 0 з ' + list.length);
    SpreadsheetApp.flush();
    var sent = 0, blocked = 0, noStart = 0, gone = 0, failed = 0, errs = {}, vs = ss.getSheetByName(VISITS_SHEET);
    var send = function (chatId, html, markup) {
      if (!photo) return tgApi_('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: true });
      var res = tgPhoto_(chatId, photo, html, markup);
      if (res && res.ok && typeof photo !== 'string') {
        var sizes = res.result && res.result.photo;
        if (sizes && sizes.length) photo = sizes[sizes.length - 1].file_id;
      }
      return res;
    };
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      var p = d.people[resKey_(x.person.name)];
      var html = resText_(p, d, prev);
      var url = SETTINGS.SITE_URL + (x.person.num ? '?sel=' + encodeURIComponent(x.person.num) : '');
      var markup = { inline_keyboard: [[{ text: BC_BUTTON_ME, web_app: { url: url } }]] };
      var res = send(x.id, html, markup);
      if (res && !res.ok && res.error_code === 429) {
        Utilities.sleep(((res.parameters && res.parameters.retry_after) || 1) * 1000 + 200);
        res = send(x.id, html, markup);
      }
      if (res && res.ok) {
        sent++;
        if (vs && x.visitRow && !test) vs.getRange(x.visitRow, VISITS_COL_WRITE).setValue('так');
      } else {
        var why = bcWhy_(res);
        if (why === 'blocked') blocked++;
        else if (why === 'nostart') noStart++;
        else if (why === 'gone') gone++;
        else { failed++; var dsc = String((res && res.description) || 'немає відповіді').replace(/^Bad Request:\s*/i, ''); errs[dsc] = (errs[dsc] || 0) + 1; }
        if (why && vs && x.visitRow && !test) vs.getRange(x.visitRow, VISITS_COL_WRITE).setValue('ні');
      }
      if (i % 10 === 9) { status('⏳ Надсилаю… ' + (i + 1) + ' з ' + list.length); SpreadsheetApp.flush(); }
      Utilities.sleep(60);
    }
    var what = d.total && d.round >= d.total ? 'підсумкові результати' : 'результати після ' + d.round + ' туру';
    if (test) {
      status('🧪 ' + now() + ' · ' + (sent ? 'тест надіслано собі: ' + what + ' (з даними: ' + list[0].person.name + ')' : 'тест не дійшов — перевірте ID і чи натиснули ви Start у боті') +
        '\n' + resInfo_(ss));
      return;
    }
    props.setProperty('res:sent', JSON.stringify({ round: d.round, at: now(), sent: sent, total: list.length }));
    status('✅ ' + now() + ' · ' + what + ': надіслано ' + sent + ' з ' + list.length +
      (noStart ? ' · ' + noStart + ' ще не натискали Start у боті' : '') +
      (blocked ? ' · ' + blocked + ' заблокували бота' : '') +
      (gone ? ' · ' + gone + ' видалили акаунт' : '') +
      (failed ? ' · ' + failed + ' помилка (' + Object.keys(errs).slice(0, 2).join('; ') + ')' : ''));
  } catch (err) {
    console.error(err);
    status('⚠️ Помилка: ' + (err && err.message ? err.message : err));
  } finally {
    lock.releaseLock();
  }
}

/** Текст для чату турніру: проміжні (топ-5) або підсумкові (подіум). HTML. */
function resChatText_(d, title) {
  var fin = d.total && d.round >= d.total;
  var list = Object.keys(d.people).map(function (k) { return d.people[k]; })
    .filter(function (p) { return p.place > 0 && p.place <= (fin ? 3 : 5); })
    .sort(function (a, b) { return a.place - b.place || a.name.localeCompare(b.name); });
  var medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  var lines = [];
  if (fin) {
    lines.push('🏆 <b>Підсумкові результати</b>');
    lines.push(resEsc_(title || '') + (d.total ? ' · ' + d.total + ' ' + plural_(d.total, 'тур', 'тури', 'турів') : ''));
  } else {
    lines.push('📊 <b>Проміжні результати після ' + d.round + ' туру' + (d.total ? ' з ' + d.total : '') + '</b>');
    if (title) lines.push(resEsc_(title));
  }
  lines.push('');
  list.forEach(function (p) {
    var pts = resNum_(p.pts) + ' ' + plural_(Math.round(p.pts), 'бал', 'бали', 'балів');
    var fish = p.fish + ' ' + plural_(p.fish, 'риба', 'риби', 'риб');
    var head = (medal[p.place] || p.place + '.') + ' ' + (fin && p.place === 1 ? '<b>' + resEsc_(p.name) + '</b>' : resEsc_(p.name));
    lines.push(head + ' — ' + pts + (fin ? ' · ' + p.wins + ' ' + plural_(p.wins, 'перемога', 'перемоги', 'перемог') : '') + ' · ' + fish);
  });
  lines.push('');
  if (fin) {
    lines.push('Вітаємо переможців і дякуємо всім за участь та боротьбу до останньої хвилини! 🙌');
    lines.push('Уся статистика турніру й кожного учасника — в апці 👇');
  } else {
    var left = d.total > d.round ? d.total - d.round : 0;
    if (left) lines.push('Попереду ще ' + left + ' ' + plural_(left, 'тур', 'тури', 'турів') + ' — боротьба триває! 💪');
    lines.push('Повна таблиця, тури й картка кожного учасника — в апці 👇');
  }
  return lines.join('\n');
}

/** Результати в чат турніру (або тест собі). Стан — у клітинці «Пульта» і в блоці адмінки. */
function resChatSend_(ss, how, cell) {
  var site = ss.getSheetByName(SYNC_SHEET);
  var r = site ? titleRow_(site, RES_TITLE) : 0;
  var status = function (t) { if (cell) cell.setValue(t); if (r) site.getRange(r + RES_STATUS, 2).setValue(t); };
  var now = function () { return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Europe/Kyiv', 'dd.MM.yyyy HH:mm'); };
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BOT_TOKEN')) { status('⚠️ Немає BOT_TOKEN у властивостях скрипта'); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { status('⚠️ Розсилка вже йде, спробуйте за хвилину'); return; }
  try {
    var snap = null;
    try { snap = JSON.parse(getSnapshot_() || 'null'); } catch (e0) { snap = null; }
    if (!snap || snap.mode !== MODE_RES) { status('⚠️ Спершу опублікуйте результати (режим «' + MODE_RES + '», B3)'); return; }
    var d = resData_(snap.sheets);
    if (!d || !d.round || !Object.keys(d.people).length) { status('⚠️ Ще немає зіграних турів'); return; }
    var fin = !!(d.total && d.round >= d.total);
    var test = how === RES_CHAT_TEST;
    if (how === RES_CHAT_MID && fin) { status('⚠️ Не надіслано: зіграно всі ' + d.total + ' турів — оберіть «' + RES_CHAT_FIN + '»'); return; }
    if (how === RES_CHAT_FIN && !fin) {
      status('⚠️ Не надіслано: зіграно ' + d.round + ' з ' + (d.total || '?') + ' турів — це ще проміжні. Якщо турів у раунді менше, змініть B5 і опублікуйте'); return;
    }
    var chatId = BC_CHAT;
    if (test) {
      var br = site ? bcRow_(site) : 0;
      chatId = br ? String(site.getRange(br + BC_TESTID, 2).getDisplayValue()).replace(/\s/g, '') : '';
      if (!/^\d{3,15}$/.test(chatId)) { status('⚠️ Вкажіть свій Telegram ID у рядку «Тест — мій Telegram ID» блоку «' + BC_TITLE + '» в адмінці'); return; }
    } else {
      var was = null;
      try { was = JSON.parse(props.getProperty('res:chat') || 'null'); } catch (e1) { was = null; }
      if (was && was.round === d.round && was.fin === fin) {
        status('⚠️ Не надіслано: у чат ' + (fin ? 'підсумкові' : 'результати після ' + d.round + ' туру') + ' вже надсилали ' + was.at); return;
      }
    }
    var picName = BC_CARD_PICS[fin ? 1 : 0], photo = null, note = '';
    var link = site ? picLink_(site, picName) : '';
    if (link) { try { photo = bcFetchPhoto_(link); } catch (err) { status('⚠️ ' + err.message); return; } }
    else note = ' (без фото: у табличці «' + BC_PICS_TITLE + '» немає «' + picName + '»)';
    var html = resChatText_(d, snap.event && snap.event.title);
    var markup = { inline_keyboard: [[{ text: BC_BUTTON, url: BC_APP_LINK }]] };
    status('⏳ Надсилаю…');
    SpreadsheetApp.flush();
    var res = photo ? tgPhoto_(chatId, photo, html, markup)
      : tgApi_('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: true });
    var what = fin ? 'підсумкові результати' : 'результати після ' + d.round + ' туру';
    if (!res || !res.ok) {
      var why = String((res && res.description) || 'немає відповіді').replace(/^Bad Request:\s*/i, '');
      status('⚠️ Не надіслано (' + why + ')' + (test ? '' : '. Перевірте, що бот — адміністратор чату ' + BC_CHAT + ' з правом надсилати повідомлення'));
      return;
    }
    if (test) { status('🧪 ' + now() + ' · тест собі: ' + what + ' для чату' + note + '\n' + resInfo_(ss)); return; }
    props.setProperty('res:chat', JSON.stringify({ round: d.round, fin: fin, at: now() }));
    status('✅ ' + now() + ' · у чат ' + BC_CHAT + ' надіслано ' + what + note);
  } catch (err) {
    console.error(err);
    status('⚠️ Помилка: ' + (err && err.message ? err.message : err));
  } finally {
    lock.releaseLock();
  }
}

/** Чому Telegram не доставив: 'blocked' | 'nostart' | 'gone' | '' (інша помилка) */
function bcWhy_(res) {
  if (!res || res.ok) return '';
  var d = String(res.description || '').toLowerCase();
  if (/blocked by the user/.test(d)) return 'blocked';
  if (/deactivated/.test(d)) return 'gone';
  if (/can't initiate|chat not found|have no rights to send a message|bot can't send messages to bots/.test(d)) return 'nostart';
  if (res.error_code === 403) return 'nostart';
  return '';
}

function tgApi_(method, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + String(token).trim() + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  try { return JSON.parse(resp.getContentText()); } catch (e) { return null; }
}

function handleTelegramUpdate_(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('TG_HOOK_SECRET');
  if (!secret || e.parameter.hook !== secret) return;   // чужий запит
  var upd = JSON.parse((e.postData && e.postData.contents) || '{}');
  var msg = upd.message;
  var member = upd.my_chat_member;
  var from = (msg && msg.from) || (member && member.from);
  var chat = (msg && msg.chat) || (member && member.chat);
  if (!from || from.is_bot || !chat || chat.type !== 'private') return;

  // Telegram може надіслати те саме оновлення двічі — обробляємо один раз
  var cache = CacheService.getScriptCache();
  var key = 'upd:' + upd.update_id;
  if (cache.get(key)) return;
  cache.put(key, '1', 21600);

  var user = {
    id: String(from.id),
    username: /^[A-Za-z0-9_]{3,32}$/.test(String(from.username || '')) ? String(from.username) : '',
    name: [from.first_name, from.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  };
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  if (member) {
    var st = member.new_chat_member && member.new_chat_member.status;
    if (st === 'kicked') upsertTgUser_(ss, user, { canWrite: false, names: regNamesFor_(ss, user.id) });      // заблокував бота
    else if (st === 'member') upsertTgUser_(ss, user, { canWrite: true, names: regNamesFor_(ss, user.id) });  // розблокував
    return;
  }
  // Будь-яке повідомлення боту (Start, текст, дозвіл із застосунку) означає, що писати можна
  upsertTgUser_(ss, user, { canWrite: true, names: regNamesFor_(ss, user.id) });
  if (/^\/start\s+notify\b/.test(String(msg.text || ''))) {   // натиснули кнопку «Отримувати повідомлення» з чату
    tgApi_('sendMessage', {
      chat_id: from.id,
      text: '🔔 Готово! Тепер я надсилатиму вам нагадування перед турніром і ваші результати.',
      reply_markup: { inline_keyboard: [[{ text: 'Відкрити TM APP', web_app: { url: SETTINGS.SITE_URL } }]] }
    });
    return;
  }
  if (/^\/start\b/.test(String(msg.text || '')) && SETTINGS.BOT_GREETING) {
    tgApi_('sendMessage', {
      chat_id: from.id,
      text: SETTINGS.BOT_GREETING,
      reply_markup: { inline_keyboard: [[{ text: 'Відкрити TM APP', web_app: { url: SETTINGS.SITE_URL } }]] }
    });
  }
}

/**
 * Дані користувача з Telegram (initData міні-застосунку) або null.
 * Якщо у властивостях скрипта є BOT_TOKEN, підпис перевіряється: підроблені дані відкидаються.
 */
function telegramUser_(initData) {
  var raw = String(initData || '');
  if (!raw || raw.length > 4096) return null;
  var fields = {};
  raw.split('&').forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i < 0) return;
    try { fields[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* */ }
  });
  if (!fields.user) return null;

  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  if (token) {
    var check = Object.keys(fields).filter(function (k) { return k !== 'hash'; }).sort()
      .map(function (k) { return k + '=' + fields[k]; }).join('\n');
    var secret = Utilities.computeHmacSha256Signature(String(token).trim(), 'WebAppData');
    var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(check).getBytes(), secret);
    var hex = sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    if (hex !== String(fields.hash || '').toLowerCase()) return null;
  }
  try {
    var u = JSON.parse(fields.user);
    if (!u || !/^\d{1,20}$/.test(String(u.id))) return null;
    var username = /^[A-Za-z0-9_]{3,32}$/.test(String(u.username || '')) ? String(u.username) : '';
    var full = [u.first_name, u.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return { id: String(u.id), username: username, name: full, allowsWrite: u.allows_write_to_pm === true };
  } catch (e) {
    return null;
  }
}

/** «  шевченко   тарас » → «Шевченко Тарас». Змішаний регістр не чіпаємо. */
function normalizeName_(v) {
  var s = String(v == null ? '' : v).replace(/[‘’ʼ`]/g, '’').replace(/\s+/g, ' ').trim();
  return s.split(' ').map(function (w) {
    if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
    return w.toLowerCase().replace(/(^|[-’'])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
  }).join(' ');
}

function isValidName_(s) {
  if (s.length < 4 || s.length > 60) return false;
  var words = s.split(' ');
  if (words.length < 2 || words.length > 4) return false;
  return words.every(function (w) { return /^[A-Za-zЀ-ӿ]+(?:[-’'][A-Za-zЀ-ӿ]+)*$/.test(w) && w.length >= 2; });
}

/** Ключ для пошуку дублікатів: без регістру й порядку слів. */
function nameKey_(s) {
  return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[’']/g, '').split(/\s+/).filter(String).sort().join(' ');
}

/** Будь-який запис номера → «+380XXXXXXXXX» або '' якщо номер неправильний. */
function normalizePhone_(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('380') === 0) d = d.slice(3);
  else if (d.length === 10 && d.charAt(0) === '0') d = d.slice(1);
  else if (d.length === 11 && d.indexOf('80') === 0) d = d.slice(2);
  if (!/^[1-9]\d{8}$/.test(d)) return '';
  return '+380' + d;
}

function formatPhone_(p) {
  var d = p.slice(4);
  return '+380 ' + d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5, 7) + ' ' + d.slice(7);
}

// ---------------------------------------------------------------------------
// Читання таблиці
// ---------------------------------------------------------------------------

function getSpreadsheetId_() {
  var v = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var raw = String(v && v.trim() ? v : SETTINGS.SPREADSHEET_ID || '').trim();
  if (!raw) throw new Error('Не задано SPREADSHEET_ID у SETTINGS.');
  var m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw;
}

// ----- Таблиця поточного раунду -----

var ROUND_SS_ = {};   // відкриті таблиці раунду в межах одного запуску

/** ID файлу з посилання Google (…/d/ID/…, ?id=ID) або сам ID; '' — не схоже. */
function fileId_(raw) {
  raw = String(raw || '').trim();
  var m = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{30,}$/.test(raw) ? raw : '';
}

/** Рядки «Раундів сезону» з посиланням на таблицю: [{ n, id, banner }] (banner — ID файлу або ''). */
function seasonRows_(site) {
  if (!site) return [];
  var rng = site.getRange(SEASON_FIRST_ROW, SEASON_COL, SEASON_ROWS, 3);
  var vals = rng.getDisplayValues(), rich = null;
  try { rich = rng.getRichTextValues(); } catch (e) { rich = null; }
  var link = function (i, j) {
    var id = fileId_(vals[i][j]);
    if (id || !rich || !rich[i][j]) return id;
    try {   // смарт-чип або текст із посиланням
      var rt = rich[i][j];
      var url = rt.getLinkUrl() || rt.getRuns().map(function (x) { return x.getLinkUrl(); }).filter(Boolean)[0];
      return fileId_(url);
    } catch (e) { return ''; }
  };
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var id = link(i, 1);
    if (id) out.push({ n: i + 1, id: id, banner: link(i, 2) });
  }
  return out;
}

var ROUND_ID_ = null;   // { sheetId, id } — у межах одного запуску

/** ID таблиці поточного раунду: останній рядок «Раундів сезону»; якщо блок порожній — посилання з B2 (як було раніше). */
function roundId_(site) {
  if (!site) return '';
  if (ROUND_ID_ && ROUND_ID_.sheetId === site.getSheetId()) return ROUND_ID_.id;
  var rows = seasonRows_(site);
  var id = rows.length ? rows[rows.length - 1].id : legacyRoundId_(site);
  ROUND_ID_ = { sheetId: site.getSheetId(), id: id };
  return id;
}

/** Посилання з B2 (до «Раундів сезону»). */
function legacyRoundId_(site) {
  var cell = site.getRange(CELL_ROUND);
  var raw = String(cell.getDisplayValue()).trim();
  var m = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  try {   // смарт-чип або текст із посиланням: показує назву файлу, а посилання — всередині
    var rt = cell.getRichTextValue();
    var url = rt && (rt.getLinkUrl() || rt.getRuns().map(function (x) { return x.getLinkUrl(); }).filter(Boolean)[0]);
    m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
  } catch (e) { /* без форматування */ }
  return /^[a-zA-Z0-9_-]{30,}$/.test(raw) ? raw : '';
}

/**
 * Таблиця раунду (з B2 на «Сайті») або сама адмінка, якщо B2 порожня.
 * Можна передавати й саму таблицю раунду: у ній немає «Сайту», тож вона повертається як є.
 */
var RS_OVERRIDE_ = null;   // таблиця минулого раунду, поки збирається його архів

function roundSs_(ss) {
  if (RS_OVERRIDE_) return RS_OVERRIDE_;
  var id = roundId_(ss.getSheetByName(SYNC_SHEET));
  if (!id || id === ss.getId()) return ss;
  if (!ROUND_SS_[id]) {
    try { ROUND_SS_[id] = SpreadsheetApp.openById(id); }
    catch (err) { throw new Error('Не вдалося відкрити таблицю раунду з ' + CELL_ROUND + ' на аркуші «' + SYNC_SHEET + '»: перевірте посилання й доступ (' + ((err && err.message) || err) + ')'); }
  }
  return ROUND_SS_[id];
}

/** Аркуш таблиці раунду: «Учасники», «Жеребкування», «Results», «Пульт». */
function roundSheet_(ss, name) { return roundSs_(ss).getSheetByName(name); }

/** «Пульт» у таблиці раунду (або null). */
function pultSheet_(ss) { try { return roundSheet_(ss, PULT_SHEET); } catch (e) { return null; } }

/** Турів у раунді з «Пульта» (B5) або null — тоді показуються всі тури з таблиці. */
function toursLimit_(ss) {
  var pu = pultSheet_(ss);
  if (!pu) return null;
  var n = parseInt(String(pu.getRange(PULT_TOURS).getDisplayValue()).replace(/\s/g, ''), 10);
  return n > 0 && n <= 50 ? n : null;
}

/** Скільки турів закладено в таблиці «Results» (найбільше «Тур N» у першому рядку). */
function toursInSheet_(rs) {
  var sh = rs.getSheetByName(RESULTS_SHEET);
  if (!sh || sh.getLastColumn() < 1) return 0;
  var max = 0;
  sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].forEach(function (h) {
    var m = /^тур\s*(\d+)$/i.exec(String(h).trim());
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max;
}

/**
 * Блок «Раунди сезону» (F1:H10) на аркуші «Сайт». Повертає true, якщо посилання з B2 (старий спосіб)
 * щойно перенесено в рядок R1 — тоді назва й дата з B6/B7 переїжджають на «Пульт» цього раунду.
 */
function setupSeason_(sh) {
  var c = SEASON_COL;
  sh.getRange(1, c).setValue(SEASON_TITLE).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, c).setValue('Сезон').setFontWeight('bold');
  var name = sh.getRange(SEASON_NAME);
  if (!String(name.getDisplayValue()).trim()) name.setValue('2026–2027');
  name.setNumberFormat('@').setFontWeight('bold').setBackground('#fff4cc').setHorizontalAlignment('left')
    .setNote('Назва сезону над картками на головній сайту: «Сезон 2026–2027».');
  sh.getRange(SEASON_HEAD_ROW, c, 1, 3).setValues([['Раунд', 'Таблиця раунду (посилання)', 'Банер 1200×480 (посилання на Google Drive)']])
    .setFontWeight('bold').setBackground('#e9edf2');
  var labels = [];
  for (var i = 1; i <= SEASON_ROWS; i++) labels.push(['R' + i]);
  sh.getRange(SEASON_FIRST_ROW, c, SEASON_ROWS, 1).setValues(labels).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(SEASON_FIRST_ROW, c + 1, SEASON_ROWS, 2).setBackground('#fff4cc').setWrap(false);
  var help = sh.getRange(SEASON_FIRST_ROW + SEASON_ROWS, c, 1, 3);
  help.merge().setWrap(true).setFontColor('#475467').setVerticalAlignment('top').setValue(
    'Скільки рядків з посиланням на таблицю — стільки карток на головній сайту. Поточний раунд — останній такий рядок: ' +
    'сайт і бот працюють з ним, а на «' + PULT_SHEET + '» його таблиці — публікація, назва й дата. ' +
    'Новий раунд: копія таблиці раунду → посилання в наступний рядок. Банер — картинка 1200×480 з доступом «Усі, хто має посилання». ' +
    'Минулі раунди сайт показує зі знімка; виправили щось у їхній таблиці — запустіть setupSync.');
  sh.setRowHeight(SEASON_FIRST_ROW + SEASON_ROWS, 90);
  sh.setColumnWidth(c, 70);
  sh.setColumnWidth(c + 1, 300);
  sh.setColumnWidth(c + 2, 300);
  ROUND_ID_ = null;
  if (seasonRows_(sh).length) return false;
  var legacy = legacyRoundId_(sh);
  if (!legacy) return false;
  sh.getRange(SEASON_FIRST_ROW, c + 1).setValue('https://docs.google.com/spreadsheets/d/' + legacy + '/edit');
  ROUND_ID_ = null;
  return true;
}

/**
 * Підключає таблицю раунду з B2: тригер правок для неї, «Пульт», колонки «Учасників».
 * Якщо раунд змінився — забуває, кому й після якого туру вже надсилали особисті результати.
 */
function connectRound_(ss, prefill) {
  ROUND_SS_ = {};
  ROUND_ID_ = null;
  var rs = roundSs_(ss);
  var props = PropertiesService.getScriptProperties();
  var prev = props.getProperty('round:id');
  if (prev && prev !== rs.getId()) {
    Object.keys(props.getProperties()).forEach(function (k) { if (/^res:/.test(k)) props.deleteProperty(k); });
  }
  props.setProperty('round:id', rs.getId());

  // Тригер правок: один на адмінку й один на таблицю раунду; тригери старих раундів прибираємо
  var keep = {};
  keep[ss.getId()] = 0;
  keep[rs.getId()] = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() !== 'handleSiteSync') return;
    var id = t.getTriggerSourceId();
    if (keep.hasOwnProperty(id) && !keep[id]) { keep[id] = 1; return; }
    ScriptApp.deleteTrigger(t);
  });
  [ss, rs].forEach(function (x) {
    if (keep[x.getId()]) return;
    ScriptApp.newTrigger('handleSiteSync').forSpreadsheet(x).onEdit().create();
    keep[x.getId()] = 1;
  });

  var reg = rs.getSheetByName(REG_SHEET);
  if (reg) setupRegSheet_(reg);
  var site = ss.getSheetByName(SYNC_SHEET);
  var rows = seasonRows_(site), cur = rows.length ? rows[rows.length - 1] : null;
  if (rs.getId() !== ss.getId()) setupPult_(rs, ss, cur ? cur.n : 0, prefill);
  try { setupRules_(ss, rs); } catch (err) { console.error(err); }
  // B2 — лише показує, який раунд зараз поточний
  if (site && rows.length) {
    site.getRange(CELL_ROUND).setValue('R' + cur.n + ' · «' + rs.getName() + '» (останній рядок у «' + SEASON_TITLE + '» →)')
      .setFontWeight('bold').setBackground('#f2f4f7');
  }
  return rs;
}

/** Заголовки колонок для заявок на аркуші «Учасники» (лише якщо порожні) і колонки оплати. */
function setupRegSheet_(reg) {
  [[REG_COL_PHONE, 'Телефон'], [REG_COL_TIME, 'Зареєстровано'], [REG_COL_TG_ID, 'Telegram ID'], [REG_COL_TG_USER, 'Telegram']].forEach(function (x) {
    var c = reg.getRange(1, x[0]);
    if (!String(c.getDisplayValue()).trim()) c.setValue(x[1]).setFontWeight('bold');
  });
  setupPaidColumn_(reg);
}

/** Створює або оновлює «Пульт» у таблиці раунду. Значення, які вже вписано, не чіпає. */
function setupPult_(rs, ss, n, prefill) {
  var pu = rs.getSheetByName(PULT_SHEET);
  if (!pu) pu = rs.insertSheet(PULT_SHEET, 0);
  pu.getRange('A1').setValue('Пульт раунду').setFontWeight('bold').setFontSize(13);
  var text = '↗ Адмінка: налаштування сайту, реєстрації й розсилки';
  pu.getRange('A2:B2').merge();
  pu.getRange('A2').setRichTextValue(SpreadsheetApp.newRichTextValue().setText(text).setLinkUrl(ss.getUrl()).build())
    .setFontColor('#475467');
  // Старий макет: підказка була в A8:B8 — звільняємо рядки 8–9 під назву й дату
  var old = pu.getRange('A8');
  if (old.isPartOfMerge() || String(old.getDisplayValue()).indexOf('B3 —') === 0) {
    pu.getRange('A8:B8').breakApart();
    pu.getRange('A8:B9').clearContent();
  }
  // Підказка була в A10:B10 або A11:B11 — звільняємо рядки під «Що показувати» й локацію
  ['A10:B10', 'A11:B11'].forEach(function (a) {
    var c = pu.getRange(a.split(':')[0]);
    if (c.isPartOfMerge() || String(c.getDisplayValue()).indexOf('B3 —') === 0) {
      pu.getRange(a).breakApart();
      pu.getRange(a).clearContent();
    }
  });
  pu.getRange('A11:A13').setValues([['Локація'], ['Google Maps'], ['Координати']]).setFontWeight('bold').setVerticalAlignment('top');
  [PULT_VENUE, PULT_MAP, PULT_COORDS].forEach(function (a) {
    pu.getRange(a).setNumberFormat('@').setFontWeight('bold').setBackground('#fdf3e1').setHorizontalAlignment('left');
  });
  pu.getRange(PULT_VENUE).setNote('Назва місця для кнопки «Як доїхати», напр. «Krychevychi Area Fishing». Порожньо — як у налаштуваннях сайту.');
  pu.getRange(PULT_MAP).setNote('Посилання на місце в Google Maps (Поділитися → Копіювати посилання).');
  pu.getRange(PULT_COORDS).setNote('Широта, довгота, напр. «49.766483, 25.014995» (у Google Maps: правий клік по точці → перший рядок). Потрібні для Waze.');
  pu.getRange('A3:A10').setValues([['Дія'], ['Остання публікація'], ['Турів у раунді'], ['Особисті результати'], ['Стан розсилки'],
    ['Назва раунду'], ['Дата і місце'], ['Що показувати']]).setFontWeight('bold').setVerticalAlignment('top');
  var modeC = pu.getRange(PULT_MODE);
  modeC.clearDataValidations();
  modeC.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([MODE_REG, MODE_RES], true).setAllowInvalid(false).build());
  modeC.setValue(currentMode_(ss.getSheetByName(SYNC_SHEET))).setFontWeight('bold').setBackground('#e3f0fa')
    .setNote('Що бачать глядачі: «' + MODE_REG + '» або «' + MODE_RES + '». Те саме, що «Що показувати» (B5) в адмінці. Зміна одразу публікує дані.');
  var tCell = pu.getRange(PULT_TITLE), sCell = pu.getRange(PULT_SUB);
  var site0 = ss.getSheetByName(SYNC_SHEET);
  if (!String(tCell.getDisplayValue()).trim()) {
    var t0 = prefill && site0 ? String(site0.getRange(CELL_TITLE).getDisplayValue()).trim() : '';
    tCell.setValue(t0 || (n ? 'TM • Round ' + n : ''));
  }
  if (prefill && site0 && !String(sCell.getDisplayValue()).trim()) sCell.setValue(String(site0.getRange(CELL_SUBTITLE).getDisplayValue()).trim());
  [tCell, sCell].forEach(function (c) { c.setNumberFormat('@').setFontWeight('bold').setBackground('#e3f0fa').setHorizontalAlignment('left'); });
  tCell.setNote('Назва раунду на сайті й на картці на головній, напр. «TM • Round 2».');
  sCell.setNote('Дата і місце через «•», напр. «12 грудня • Плугів, Krychevychi Area Fishing».');

  var pub = pu.getRange(PULT_PUBLISH);
  pub.clearDataValidations();
  pub.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([ACTION_IDLE, ACTION_PUBLISH], true).setAllowInvalid(false).build());
  pub.setValue(ACTION_IDLE).setFontWeight('bold').setBackground('#e8f3d6');

  pu.getRange(PULT_STATUS).setWrap(true).setVerticalAlignment('top');

  var tours = pu.getRange(PULT_TOURS);
  var curTours = String(tours.getDisplayValue()).trim();
  tours.clearDataValidations();
  tours.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['10', '12'], true).setAllowInvalid(true)
    .setHelpText('Скільки турів у цьому раунді (можна вписати своє число). Сайт показує «Тур X з N», а після N-го туру — підсумкові результати.').build());
  tours.setNumberFormat('@').setFontWeight('bold').setBackground('#e3f0fa').setHorizontalAlignment('left');
  if (!curTours) { var n = toursInSheet_(rs); if (n) tours.setValue(String(n)); }

  var res = pu.getRange(PULT_RES);
  res.clearDataValidations();
  res.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([RES_IDLE, RES_SEND, RES_RESEND, RES_CHAT_MID, RES_CHAT_FIN, RES_CHAT_TEST], true).setAllowInvalid(false).build());
  res.setValue(RES_IDLE).setFontWeight('bold').setBackground('#fde7e7');

  pu.getRange(PULT_RES_STATUS).setWrap(true).setVerticalAlignment('top');

  var help = pu.getRange('A14:B14');
  help.merge().setWrap(true).setFontColor('#475467').setVerticalAlignment('top');
  help.setValue('B3 — «' + ACTION_PUBLISH + '»: глядачі побачать поточні дані з цієї таблиці (що саме показувати — «Що показувати» в адмінці). ' +
    '\nB5 — турів у раунді. Тури понад це число на сайті не показуються, а після N-го туру результати стають підсумковими ' +
    '(переможець, «Дякуємо за участь»). Зміна застосується після наступної публікації. ' +
    '\nB6 — особисті результати в Telegram кожному учаснику після публікації. «' + RES_SEND + '» — двічі за той самий тур не надішле; ' +
    '«' + RES_RESEND + '» — якщо після надсилання виправили помилку в таблиці. Фото й тест собі — у блоці «' + RES_TITLE + '» в адмінці. ' +
    '\n«' + RES_CHAT_MID + '» / «' + RES_CHAT_FIN + '» — одне повідомлення в чат турніру: топ-5 після туру (або подіум після останнього туру з B5), ' +
    'фото «' + BC_CARD_PICS[0] + '» / «' + BC_CARD_PICS[1] + '» з таблички картинок в адмінці й кнопка на апку. Двічі за той самий тур не надішле. ' +
    '«' + RES_CHAT_TEST + '» — те саме повідомлення лише вам (ID з «Тест — мій Telegram ID» в адмінці).');
  help.setValue(help.getDisplayValue() + '\nB8, B9 — назва раунду й дата і місце: заголовок сторінки раунду й картка на головній сайту. Застосується після наступної публікації.');
  help.setValue(help.getDisplayValue() + '\nB10 — що показувати на сайті: «' + MODE_REG + '» (реєстрація) або «' + MODE_RES + '». Зміна одразу публікує дані.');
  help.setValue(help.getDisplayValue() + '\nB11–B13 — «Як доїхати» (Telegram, режим «' + MODE_REG + '»): назва локації, посилання на Google Maps і координати для Waze. Застосується після наступної публікації.');
  pu.setRowHeight(14, 230);
  pu.setColumnWidth(1, 170);
  pu.setColumnWidth(2, 460);
  try { pu.getRange(PULT_RES_STATUS).setValue(resInfo_(ss)); } catch (err) { console.error(err); }
  return pu;
}

/** Правка на «Пульті». */
function handlePultEdit_(e, ss, pu) {
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  var a1 = e.range.getA1Notation();
  var v = String(e.value == null ? '' : e.value).trim();
  var site = ss.getSheetByName(SYNC_SHEET);
  if (a1 === PULT_PUBLISH) {
    if (v !== ACTION_PUBLISH) return;
    pu.getRange(PULT_STATUS).setValue('⏳ Публікуємо…');
    SpreadsheetApp.flush();
    try {
      writeStatus_(site, publish_(ss));
    } catch (err) {
      var msg = '❌ Помилка: ' + ((err && err.message) || err);
      pu.getRange(PULT_STATUS).setValue(msg);
      if (site) site.getRange(CELL_STATUS).setValue(msg);
    } finally {
      e.range.setValue(ACTION_IDLE);
    }
    return;
  }
  if (a1 === PULT_MODE) {
    if (!MODES[v] || !site) return;
    site.getRange(CELL_MODE).setValue(v);   // одне джерело — B5 адмінки
    pu.getRange(PULT_STATUS).setValue('⏳ Публікуємо…');
    SpreadsheetApp.flush();
    try { writeStatus_(site, publish_(ss)); }
    catch (err) { pu.getRange(PULT_STATUS).setValue('❌ Помилка: ' + ((err && err.message) || err)); }
    return;
  }
  if (a1 === PULT_TITLE || a1 === PULT_SUB || a1 === PULT_VENUE || a1 === PULT_MAP || a1 === PULT_COORDS) {
    pu.getRange(PULT_STATUS).setValue('Змінено. Застосується після «' + ACTION_PUBLISH + '» (B3).');
    return;
  }
  if (a1 === PULT_TOURS) {
    var n = toursLimit_(ss);
    pu.getRange(PULT_STATUS).setValue(n ? 'Турів у раунді: ' + n + '. Застосується після «' + ACTION_PUBLISH + '» (B3).'
      : '⚠️ Впишіть у B5 кількість турів, напр. 10 або 12 (порожньо — показуються всі тури з таблиці)');
    return;
  }
  if (a1 === PULT_RES) {
    if (v === RES_CHAT_MID || v === RES_CHAT_FIN || v === RES_CHAT_TEST) {
      e.range.setValue(RES_IDLE);
      resChatSend_(ss, v, pu.getRange(PULT_RES_STATUS));
      return;
    }
    if (v !== RES_SEND && v !== RES_RESEND) return;
    e.range.setValue(RES_IDLE);
    var r = site ? titleRow_(site, RES_TITLE) : 0;
    if (!r) { pu.getRange(PULT_RES_STATUS).setValue('⚠️ В адмінці немає блоку «' + RES_TITLE + '» — запустіть setupSync'); return; }
    resSend_(ss, site, r, v, pu.getRange(PULT_RES_STATUS));
  }
}

/** Номер колонки → літери (1 → A, 27 → AA). */
function colLetters_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Діапазон «авто» за заголовками (рядки 1–2): «Тури» — від першого «#» до «Місце»,
 * «Результат» — від другого «#» до останньої колонки із заголовком. Повертає 'A1:AG' або ''.
 */
function autoRange_(sheet, name) {
  var w = sheet.getLastColumn();
  if (w < 1 || sheet.getLastRow() < 1) return '';
  var h = sheet.getRange(1, 1, Math.min(2, sheet.getMaxRows()), w).getDisplayValues();
  var r0 = h[0], r1 = h[1] || [];
  var lab = function (c) { return String(r0[c] || '').trim() || String(r1[c] || '').trim(); };
  var hashes = [];
  for (var c = 0; c < w; c++) if (/^[#№]$/.test(String(r0[c] || '').trim())) hashes.push(c);
  var start, end = -1;
  if (/^тур/i.test(name)) {
    start = hashes.length ? hashes[0] : 0;
    for (c = start; c < w; c++) {
      if (/^місце$/i.test(String(r0[c] || '').trim()) || /^місце$/i.test(String(r1[c] || '').trim())) { end = c; break; }
    }
  } else {
    if (hashes.length < 2) return '';
    start = hashes[1];
    for (c = start; c < w && lab(c); c++) end = c;
  }
  if (end < start) return '';
  return colLetters_(start + 1) + '1:' + colLetters_(end + 1);
}

/** Прибирає з вкладки «Тури» колонки турів, номер яких більший за n (разом з об'єднаними клітинками). */
function trimTours_(view, n) {
  var vals = view.values || [];
  var top = vals[0] || [];
  var starts = [];
  top.forEach(function (h, c) { var m = /^тур\s*(\d+)$/i.exec(String(h).trim()); if (m) starts.push({ n: Number(m[1]), c: c }); });
  if (!starts.length) return view;
  var w = 0;
  vals.forEach(function (r) { w = Math.max(w, r.length); });
  var drop = {}, any = false;
  starts.forEach(function (t, i) {
    if (t.n <= n) return;
    var end = t.c + 1;
    if (i + 1 < starts.length) end = starts[i + 1].c;
    else while (end < w && !String(top[end] == null ? '' : top[end]).trim()) end++;
    for (var c = t.c; c < end; c++) { drop[c] = true; any = true; }
  });
  if (!any) return view;
  var before = [], k = 0;   // before[c] — скільки колонок лишається лівіше c
  for (var c = 0; c <= w; c++) { before[c] = k; if (!drop[c]) k++; }
  var out = {};
  Object.keys(view).forEach(function (key) { out[key] = view[key]; });
  out.values = vals.map(function (r) { return r.filter(function (x, c) { return !drop[c]; }); });
  out.merges = (view.merges || []).map(function (m) {
    var c2 = Math.min(m.c + m.cs, w);
    var cs = before[c2] - before[m.c];
    return { r: m.r, c: before[m.c], rs: m.rs, cs: cs };
  }).filter(function (m) { return m.cs > 0; });
  return out;
}

function readView_(ss, view) {
  var sheet = roundSheet_(ss, view.sheet);
  if (!sheet) throw new Error('У таблиці раунду немає аркуша «' + view.sheet + '».');

  var rangeA1 = String(view.range || '').trim();
  if (!rangeA1 || rangeA1.toLowerCase() === RANGE_AUTO) {
    rangeA1 = autoRange_(sheet, view.name);
    if (!rangeA1) throw new Error('Не вдалося знайти блок «' + view.name + '» на аркуші «' + view.sheet +
      '» (потрібні заголовки «#» і «Місце»). Вкажіть діапазон вручну в блоці «' + RANGES_TITLE + '».');
  }
  var m = rangeA1.toUpperCase().replace(/\$/g, '').match(/^([A-Z]+)(\d*):([A-Z]+)(\d*)$/);
  if (!m) throw new Error('Неправильний діапазон «' + view.range + '» для вкладки «' + view.name + '».');
  var c1 = colIndex_(m[1]);
  var c2 = colIndex_(m[3]);
  var r1 = m[2] ? Number(m[2]) : 1;
  var last = sheet.getLastRow();
  var r2 = m[4] ? Math.min(Number(m[4]), last) : last;
  var width = c2 - c1 + 1;
  var headerRows = view.headerRows || 2;
  if (r2 < r1 || width < 1) return { name: view.name, headerRows: headerRows, values: [], merges: [] };

  var range = sheet.getRange(r1, c1, r2 - r1 + 1, width);
  var values = range.getDisplayValues();
  // Порожні рядки внизу не передаємо
  while (values.length && values[values.length - 1].every(function (x) { return x === ''; })) values.pop();

  var merges = range.getMergedRanges().map(function (mr) {
    var r = mr.getRow() - r1;
    var c = mr.getColumn() - c1;
    var rr = Math.max(r, 0);
    var cc = Math.max(c, 0);
    return {
      r: rr,
      c: cc,
      rs: Math.min(r + mr.getNumRows(), values.length) - rr,
      cs: Math.min(c + mr.getNumColumns(), width) - cc
    };
  }).filter(function (x) { return x.rs > 0 && x.cs > 0; });

  return { name: view.name, headerRows: headerRows, values: values, merges: merges };
}

function colIndex_(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}
