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
 * Перший запуск і кожен новий раунд:
 *   впишіть посилання на таблицю в SETTINGS і запустіть функцію setupSync.
 *   Вона створить аркуш «Сайт», підключить список і опублікує дані.
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
  SITE_URL: 'https://andriiteslia.github.io/trout-master-results/',
  // Відповідь бота на Start. Порожньо — бот мовчить.
  BOT_GREETING: 'Привіт! Тут онлайн-результати та реєстрація на турніри TROUT MASTER 🎣\nНатисни кнопку нижче, щоб відкрити застосунок.'
};

var VIEWS = [
  { name: 'Результат', sheet: 'Results', range: 'AM1:AQ' },
  { name: 'Тури',      sheet: 'Results', range: 'A1:AK' }
];

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
var CARD_ON = 'Показувати';
var CARD_OFF = 'Приховати';

/** Куди пишуться заявки з форми реєстрації (номери колонок: A=1, B=2, ...). */
var REG_SHEET = 'Учасники';
var REG_COL_NUM = 1;     // A — порядковий номер
var REG_COL_NAME = 2;    // B — прізвище та ім'я
var REG_COL_PHONE = 5;   // E — телефон (лише для організатора)
var REG_COL_TIME = 6;    // F — час реєстрації
var REG_COL_TG_ID = 7;   // G — Telegram ID (якщо реєструвались через бота)
var REG_COL_TG_USER = 8; // H — @username у Telegram

/**
 * Діапазони, які можна змінювати прямо на аркуші «Сайт» (блок «Діапазони…», B16:B18).
 * Формат: A1:B50, A1:AK (без номера рядка — до останнього заповненого)
 * або з назвою аркуша: Results!A1:AK. Порожня клітинка — діапазон із коду.
 */
var RANGE_ROW_FIRST = 16;     // якщо блок зсунуто, рядок шукається за заголовком «Діапазони…»
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

var CACHE_KEY = 'snapshot';
var CACHE_TTL = 21600;   // 6 годин, максимум для CacheService
var CHUNK = 4000;        // розмір шматка для збереження у властивостях

// ---------------------------------------------------------------------------
// Сайт: віддати останню публікацію
// ---------------------------------------------------------------------------

function doGet() {
  var out;
  try {
    out = getSnapshot_();
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
  // Старий макет (діапазони в рядках 12–14): звільняємо два рядки під «Кількість місць» і «Реєстрація до»
  if (String(sh.getRange('A12').getDisplayValue()).trim() === RANGE_KEYS[0] &&
      String(sh.getRange('A10').getDisplayValue()).indexOf('B5') === 0) {
    sh.insertRowsAfter(9, 2);
  }
  // Макет до «Картки учасника» (підказка в рядку 12): звільняємо рядок 12 під перемикач
  if (String(sh.getRange('A12').getDisplayValue()).indexOf('B5') === 0) sh.insertRowsAfter(11, 1);
  // Макет до «Секторів на водоймі» (підказка в рядку 13): звільняємо рядок 13
  if (String(sh.getRange('A13').getDisplayValue()).indexOf('B5') === 0) sh.insertRowsAfter(12, 1);
  sh.getRange('A9:B13').breakApart();
  sh.getRange('A3:A13').setValues([['Дія'], ['Остання публікація'], ['Що показувати'], ['Заголовок'], ['Підзаголовок'],
    ['Реєстрація'], ['Стрілки ▲▼ місць'], ['Кількість місць'], ['Реєстрація до'], ['Картка учасника'], ['Секторів на водоймі']]);
  sh.getRange('A3:A13').setFontWeight('bold');
  sh.getRange('A14:B14').merge().setWrap(true);
  sh.getRange('A14').setValue('B5 — що бачать глядачі: «' + MODE_REG + '» (аркуш «Учасники») або «' + MODE_RES +
    '» (вкладки «Результат» і «Тури»). \nЗміна режиму одразу публікує дані. Щоб оновити дані на сайті, у B3 виберіть «' +
    ACTION_PUBLISH + '». Заголовок і підзаголовок теж оновлюються при публікації. \nB8 — «' + REG_OPEN +
    '» показує на сайті кнопку «Зареєструватися» (заявки йдуть в аркуш «' + REG_SHEET + '», телефон у колонку E). \nB9 — показувати чи ні стрілки ▲▼, на скільки місць змістився учасник після оновлення. ' +
    '\nB10 — кількість місць: хто зареєструвався понад неї, стоїть у списку під лінією «Резерв» (порожньо — без обмеження). ' +
    '\nB11 — дата завершення реєстрації (подвійний клік — календар), C11 — час (зі списку або свій, напр. 20:15). Сайт показує зворотний відлік, а в цей момент реєстрація закривається сама. ' +
    '\nB12 — чи показувати на сайті кнопку «Картка учасника» (тап по учаснику → кнопка внизу). ' +
    '\nB13 — скільки секторів на водоймі, напр. 14: по 7 на кожному березі. За цим числом малюються карта водойми й карта секторів у статистиці (порожньо — за найбільшим номером сектора в жеребкуванні).');
  sh.getRange('A14').setFontColor('#475467');
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 420);

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
  secCell.clearDataValidations();
  secCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(2, 200).setAllowInvalid(false)
    .setHelpText('Скільки секторів на водоймі, напр. 14 — по 7 на кожному березі.').build());
  secCell.setFontWeight('bold').setBackground('#e3f0fa').setHorizontalAlignment('left');
  if (!String(secCell.getDisplayValue()).trim()) {
    try {
      var dr = readDraw_(ss), maxSec = 0;
      if (dr) dr.players.forEach(function (pl) { pl.t.forEach(function (x) { if (x[0] > maxSec) maxSec = x[0]; }); });
      if (maxSec) secCell.setValue(maxSec % 2 ? maxSec + 1 : maxSec);
    } catch (err) { console.error(err); }
  }

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

  // Заголовки колонок для заявок на аркуші «Учасники» (лише якщо порожні)
  var reg = ss.getSheetByName(REG_SHEET);
  if (reg) {
    [[REG_COL_PHONE, 'Телефон'], [REG_COL_TIME, 'Зареєстровано'], [REG_COL_TG_ID, 'Telegram ID'], [REG_COL_TG_USER, 'Telegram']].forEach(function (x) {
      var c = reg.getRange(1, x[0]);
      if (!String(c.getDisplayValue()).trim()) c.setValue(x[1]).setFontWeight('bold');
    });
  }

  // Блок діапазонів: заповнюємо лише порожні клітинки, щоб не затерти ваші значення
  var rr = RANGE_ROW_FIRST;
  sh.getRange(rr - 1, 1).setValue(RANGES_TITLE).setFontWeight('bold');
  var defaults = defaultRanges_();
  var rangeCells = sh.getRange(rr, 1, RANGE_KEYS.length, 2);
  var current = rangeCells.getDisplayValues();
  rangeCells.setValues(RANGE_KEYS.map(function (k, i) {
    return [k, String(current[i][1]).trim() || defaults[k]];
  }));
  sh.getRange(rr, 1, RANGE_KEYS.length, 1).setFontWeight('bold');
  sh.getRange(rr, 2, RANGE_KEYS.length, 1).setBackground('#f2f4f7');
  sh.getRange(rr + RANGE_KEYS.length, 1).setValue(
    'Можна вказати з назвою аркуша, напр. Results!A1:AK. Без номера останнього рядка (A1:AK) береться все заповнене. Зміна діапазону одразу публікує дані.')
    .setFontColor('#475467');

  setupBroadcast_(sh);

  // Одна активна таблиця: старі тригери прибираємо
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'handleSiteSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleSiteSync').forSpreadsheet(ss).onEdit().create();

  var p = publish_(ss);
  writeStatus_(sh, p);
  scheduleRegClose_(sh);
  Logger.log('Готово. Список у B3 підключено, дані опубліковано: ' + summary_(p));
}

/** Тригер: реагує на вибір «Опублікувати на сайт» у B3. */
function handleSiteSync(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  // Вставили жеребкування або змінили номери/імена в «Учасниках» — підставляємо імена в «Жеребкування»
  if (sh.getName() === DRAW_SHEET ||
      (sh.getName() === REG_SHEET && e.range.getColumn() <= REG_COL_NAME && e.range.getLastColumn() >= REG_COL_NUM)) {
    try { syncDrawNames_(e.source); } catch (err) { console.error(err); }
    return;
  }
  if (sh.getName() !== SYNC_SHEET) return;
  // Блок «Розсилка в Telegram»
  if (handleBroadcastEdit_(e, sh)) return;
  var a1 = e.range.getA1Notation();
  var v = String(e.value == null ? '' : e.value).trim();
  var isPublish = a1 === CELL_PUBLISH && (v === ACTION_PUBLISH || v.toUpperCase() === 'TRUE');
  var isMode = a1 === CELL_MODE && !!MODES[v];
  var isReg = a1 === CELL_REG && (v === REG_OPEN || v === REG_CLOSED);
  var isMoves = a1 === CELL_MOVES && (v === MOVES_ON || v === MOVES_OFF);
  var isRegSetting = a1 === CELL_SEATS || a1 === CELL_DEADLINE || a1 === CELL_DEADLINE_TIME;
  var isCard = a1 === CELL_CARD && (v === CARD_ON || v === CARD_OFF);
  var isSectors = a1 === CELL_SECTORS;
  var row = e.range.getRow();
  var isRange = e.range.getColumn() === 2 && e.range.getNumRows() === 1 &&
    row >= rangeRowFirst_(sh) && row < rangeRowFirst_(sh) + RANGE_KEYS.length;
  if (!isPublish && !isMode && !isReg && !isMoves && !isRegSetting && !isCard && !isSectors && !isRange) return;

  sh.getRange(CELL_STATUS).setValue('⏳ Публікуємо…');
  SpreadsheetApp.flush();
  try {
    writeStatus_(sh, publish_(e.source));
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
function sectors_(sh) {
  if (!sh) return null;
  var n = parseInt(String(sh.getRange(CELL_SECTORS).getDisplayValue()).replace(/\s/g, ''), 10);
  return n >= 2 ? n : null;
}

function publish_(ss) {
  var sh = ss.getSheetByName(SYNC_SHEET);
  var mode = currentMode_(sh);
  var sheets = viewsWithRanges_(sh, MODES[mode]).map(function (view) { return readView_(ss, view); });
  var event = {
    title: (sh && String(sh.getRange(CELL_TITLE).getDisplayValue()).trim()) || SETTINGS.EVENT_TITLE,
    subtitle: (sh && String(sh.getRange(CELL_SUBTITLE).getDisplayValue()).trim()) || SETTINGS.EVENT_SUBTITLE
  };
  var draw = null;
  try { draw = readDraw_(ss); syncDrawNames_(ss, draw); } catch (err) { console.error(err); }
  var showCard = !sh || String(sh.getRange(CELL_CARD).getDisplayValue()).trim() !== CARD_OFF;
  var registration = isRegOpen_(sh);
  var deadline = regDeadline_(sh);
  var regDeadline = registration && deadline ? deadline.toISOString() : null;
  var seats = seats_(sh);
  var showMoves = !sh || String(sh.getRange(CELL_MOVES).getDisplayValue()).trim() !== MOVES_OFF;
  var sectors = sectors_(sh);
  var now = new Date().toISOString();
  var body = JSON.stringify([event, sheets, registration, regDeadline, seats, showMoves, draw, showCard, sectors]);
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
    showMoves: showMoves,
    draw: draw,
    showCard: showCard,
    sectors: sectors,
    hash: hash,
    changedAt: now,
    generatedAt: now,
    sheets: sheets
  };
  saveSnapshot_(JSON.stringify(payload));
  return payload;
}

/**
 * Жеребкування для картки гравця: { rounds, players: [{ n, name, side, t: [[сектор, № суперника], …] }] }
 * або null, якщо аркуша немає чи він порожній.
 */
function readDraw_(ss) {
  var sh = ss.getSheetByName(DRAW_SHEET);
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
  var reg = ss.getSheetByName(REG_SHEET);
  var names = {};
  if (!reg || reg.getLastRow() < 2) return names;
  reg.getRange(2, 1, reg.getLastRow() - 1, Math.max(REG_COL_NUM, REG_COL_NAME)).getDisplayValues().forEach(function (r) {
    var nm = String(r[REG_COL_NAME - 1]).trim();
    var n = parseInt(r[REG_COL_NUM - 1], 10);
    if (nm && n > 0) names[n] = nm;
  });
  return names;
}

/** Вписує імена учасників у колонку B «Жеребкування» (лише там, де вони змінилися). */
function syncDrawNames_(ss, draw) {
  var sh = ss.getSheetByName(DRAW_SHEET);
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
  sh.getRange(CELL_STATUS).setValue('✅ ' + t + ' • ' + p.mode + ' • ' + summary_(p));
}

function summary_(p) {
  return p.sheets.map(function (s) {
    return s.name + ': ' + Math.max(0, s.values.length - (s.headerRows || 2));
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
    else out = fail_('bad_request', 'Невідомий запит.');
  } catch (err) {
    out = fail_('server', 'Не вдалося зберегти заявку. Спробуйте ще раз за хвилину.');
    console.error(err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
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
    var sh = ss.getSheetByName(REG_SHEET);
    if (!sh) return fail_('server', 'У таблиці немає аркуша «' + REG_SHEET + '».');

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
  var sh = ss.getSheetByName(REG_SHEET);
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
  sh.getRange(r + BC_BTN, 2).setBackground('#e3f0fa').setNote('Текст другої кнопки під повідомленням, напр. 📍 Маршрут. Порожньо — лише «' + BC_BUTTON + '».');
  sh.getRange(r + BC_BTN, 3).setBackground('#e3f0fa').setNote('Посилання для кнопки, напр. https://maps.app.goo.gl/…');
  var text = sh.getRange(r + BC_TEXT, 2);
  text.setWrap(true).setVerticalAlignment('top').setBackground('#fffbe8');
  sh.setRowHeight(r + BC_TEXT, 110);

  var to = sh.getRange(r + BC_TO, 2);
  var toNow = String(to.getDisplayValue()).trim();
  to.clearDataValidations();
  to.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([BC_TO_NONE, BC_TO_REG, BC_TO_ALL, BC_TO_CHAT], true).setAllowInvalid(false).build())
    .setFontWeight('bold').setBackground('#e3f0fa');
  if (toNow !== BC_TO_REG && toNow !== BC_TO_ALL && toNow !== BC_TO_CHAT) to.setValue(BC_TO_NONE);

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
    '\n«Кнопка» — друга кнопка під повідомленням поруч із «' + BC_BUTTON + '»: у B — текст (напр. 📍 Маршрут), у C — посилання. Порожньо — без неї. У чаті @troutmasterua своя кнопка йде замість «' + BC_BUTTON + '». ' +
    '\n«Фото» — картинка з таблички «' + BC_PICS_TITLE + '» нижче або «' + BC_NO_PHOTO + '» (лише текст). Текст стає підписом під фото; якщо він довший за 1024 символи — бот надішле фото, а за ним текст окремим повідомленням. ' +
    '\n«Кому» спершу «—»: поки не оберете отримувачів, «' + BC_SEND + '» нічого не надішле (тест собі працює завжди). Після розсилки «Кому» знову стає «—». ' +
    '\n«' + BC_TO_REG + '» — основний склад з аркуша «Учасники» (стільки, скільки вказано в «Кількість місць»; резерв не отримує). ' +
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
  var reg = ss.getSheetByName(REG_SHEET);
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
  if (pr && e.range.getLastRow() >= pr + 2 && e.range.getRow() <= pr + 1 + BC_PICS_ROWS) { bcPhotoRule_(sh, r, pr); return true; }
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
      // У чаті: якщо задана своя «Кнопка» — лише вона (без «Відкрити TM APP»). В особистих — апка + своя кнопка.
      // Тест собі при «Кому: у чат» показує кнопки так, як їх побачать у чаті
      var chatLike = x.chat || (test && toChat);
      var row0 = chatLike && extraBtn ? [extraBtn]
        : [chatLike ? { text: BC_BUTTON, url: BC_APP_LINK } : { text: played ? BC_BUTTON_ME : BC_BUTTON, web_app: { url: url } }];
      // Своя кнопка — окремим рядком під кнопкою апки, щоб довгі назви не обрізались
      var markup = { inline_keyboard: extraBtn && !chatLike ? [row0, [extraBtn]] : [row0] };
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
      ? '🧪 ' + now() + ' · ' + (sent ? 'тест надіслано собі' + (pic.name ? ' з фото «' + pic.name + '»' : '') + (list[0].person && hasTags ? ' (з даними: ' + list[0].person.name + ')' : '')
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

function readView_(ss, view) {
  var sheet = ss.getSheetByName(view.sheet);
  if (!sheet) throw new Error('У таблиці немає аркуша «' + view.sheet + '».');

  var m = String(view.range).toUpperCase().replace(/\$/g, '').match(/^([A-Z]+)(\d*):([A-Z]+)(\d*)$/);
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
