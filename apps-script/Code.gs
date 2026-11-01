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
  EVENT_SUBTITLE: '21 листопада • Плугів • Krychevychi Area Fishing'
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
var CELL_DEADLINE = 'B11';      // дата й час завершення реєстрації (порожньо — без обмеження)

/** Куди пишуться заявки з форми реєстрації (номери колонок: A=1, B=2, ...). */
var REG_SHEET = 'Учасники';
var REG_COL_NUM = 1;     // A — порядковий номер
var REG_COL_NAME = 2;    // B — прізвище та ім'я
var REG_COL_PHONE = 5;   // E — телефон (лише для організатора)
var REG_COL_TIME = 6;    // F — час реєстрації
var REG_COL_TG_ID = 7;   // G — Telegram ID (якщо реєструвались через бота)
var REG_COL_TG_USER = 8; // H — @username у Telegram

/**
 * Діапазони, які можна змінювати прямо на аркуші «Сайт» (B14:B16).
 * Формат: A1:B50, A1:AK (без номера рядка — до останнього заповненого)
 * або з назвою аркуша: Results!A1:AK. Порожня клітинка — діапазон із коду.
 */
var RANGE_ROW_FIRST = 14;
var RANGE_KEYS = ['Учасники', 'Результат', 'Тури'];

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
  sh.getRange('A9:B11').breakApart();
  sh.getRange('A3:A11').setValues([['Дія'], ['Остання публікація'], ['Що показувати'], ['Заголовок'], ['Підзаголовок'],
    ['Реєстрація'], ['Стрілки ▲▼ місць'], ['Кількість місць'], ['Реєстрація до']]);
  sh.getRange('A3:A11').setFontWeight('bold');
  sh.getRange('A12:B12').merge().setWrap(true);
  sh.getRange('A12').setValue('B5 — що бачать глядачі: «' + MODE_REG + '» (аркуш «Учасники») або «' + MODE_RES +
    '» (вкладки «Результат» і «Тури»). Зміна режиму одразу публікує дані. Щоб оновити дані на сайті, у B3 виберіть «' +
    ACTION_PUBLISH + '». Заголовок і підзаголовок теж оновлюються при публікації. B8 — «' + REG_OPEN +
    '» показує на сайті кнопку «Зареєструватися» (заявки йдуть в аркуш «' + REG_SHEET + '», телефон у колонку E). B9 — показувати чи ні стрілки ▲▼, на скільки місць змістився учасник після оновлення. ' +
    'B10 — кількість місць: хто зареєструвався понад неї, стоїть у списку під лінією «Резерв» (порожньо — без обмеження). ' +
    'B11 — дата й час завершення реєстрації, напр. 20.11.2026 20:00: сайт показує зворотний відлік, а після цього часу заявки не приймаються.');
  sh.getRange('A12').setFontColor('#475467');
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
    .setHelpText('Дата й час, напр. 20.11.2026 20:00. Порожньо — без обмеження.').build());
  dlCell.setNumberFormat('dd.MM.yyyy HH:mm').setFontWeight('bold').setBackground('#fdf3e1').setHorizontalAlignment('left');

  // Заголовки колонок для заявок на аркуші «Учасники» (лише якщо порожні)
  var reg = ss.getSheetByName(REG_SHEET);
  if (reg) {
    [[REG_COL_PHONE, 'Телефон'], [REG_COL_TIME, 'Зареєстровано'], [REG_COL_TG_ID, 'Telegram ID'], [REG_COL_TG_USER, 'Telegram']].forEach(function (x) {
      var c = reg.getRange(1, x[0]);
      if (!String(c.getDisplayValue()).trim()) c.setValue(x[1]).setFontWeight('bold');
    });
  }

  // Блок діапазонів: заповнюємо лише порожні клітинки, щоб не затерти ваші значення
  sh.getRange(RANGE_ROW_FIRST - 1, 1).setValue('Діапазони (звідки брати дані)').setFontWeight('bold');
  var defaults = defaultRanges_();
  var rangeCells = sh.getRange(RANGE_ROW_FIRST, 1, RANGE_KEYS.length, 2);
  var current = rangeCells.getDisplayValues();
  rangeCells.setValues(RANGE_KEYS.map(function (k, i) {
    return [k, String(current[i][1]).trim() || defaults[k]];
  }));
  sh.getRange(RANGE_ROW_FIRST, 1, RANGE_KEYS.length, 1).setFontWeight('bold');
  sh.getRange(RANGE_ROW_FIRST, 2, RANGE_KEYS.length, 1).setBackground('#f2f4f7');
  sh.getRange(RANGE_ROW_FIRST + RANGE_KEYS.length, 1).setValue(
    'Можна вказати з назвою аркуша, напр. Results!A1:AK. Без номера останнього рядка (A1:AK) береться все заповнене. Зміна діапазону одразу публікує дані.')
    .setFontColor('#475467');

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
  if (sh.getName() !== SYNC_SHEET) return;
  var a1 = e.range.getA1Notation();
  var v = String(e.value == null ? '' : e.value).trim();
  var isPublish = a1 === CELL_PUBLISH && (v === ACTION_PUBLISH || v.toUpperCase() === 'TRUE');
  var isMode = a1 === CELL_MODE && !!MODES[v];
  var isReg = a1 === CELL_REG && (v === REG_OPEN || v === REG_CLOSED);
  var isMoves = a1 === CELL_MOVES && (v === MOVES_ON || v === MOVES_OFF);
  var isRegSetting = a1 === CELL_SEATS || a1 === CELL_DEADLINE;
  var row = e.range.getRow();
  var isRange = e.range.getColumn() === 2 && e.range.getNumRows() === 1 &&
    row >= RANGE_ROW_FIRST && row < RANGE_ROW_FIRST + RANGE_KEYS.length;
  if (!isPublish && !isMode && !isReg && !isMoves && !isRegSetting && !isRange) return;

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

/** Дата завершення реєстрації (B11) або null. */
function regDeadline_(sh) {
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

/** Підставляє діапазони з аркуша «Сайт» (B14:B16), якщо вони заповнені. */
function viewsWithRanges_(sh, views) {
  if (!sh) return views;
  var vals = sh.getRange(RANGE_ROW_FIRST, 1, RANGE_KEYS.length, 2).getDisplayValues();
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

function publish_(ss) {
  var sh = ss.getSheetByName(SYNC_SHEET);
  var mode = currentMode_(sh);
  var sheets = viewsWithRanges_(sh, MODES[mode]).map(function (view) { return readView_(ss, view); });
  var event = {
    title: (sh && String(sh.getRange(CELL_TITLE).getDisplayValue()).trim()) || SETTINGS.EVENT_TITLE,
    subtitle: (sh && String(sh.getRange(CELL_SUBTITLE).getDisplayValue()).trim()) || SETTINGS.EVENT_SUBTITLE
  };
  var registration = isRegOpen_(sh);
  var deadline = regDeadline_(sh);
  var regDeadline = registration && deadline ? deadline.toISOString() : null;
  var seats = seats_(sh);
  var showMoves = !sh || String(sh.getRange(CELL_MOVES).getDisplayValue()).trim() !== MOVES_OFF;
  var now = new Date().toISOString();
  var body = JSON.stringify([event, sheets, registration, regDeadline, seats, showMoves]);
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
    hash: hash,
    changedAt: now,
    generatedAt: now,
    sheets: sheets
  };
  saveSnapshot_(JSON.stringify(payload));
  return payload;
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
  var out;
  try {
    var data = {};
    var raw = e && e.postData && e.postData.contents;
    if (raw) { try { data = JSON.parse(raw); } catch (x) { data = {}; } }
    if (e && e.parameter) Object.keys(e.parameter).forEach(function (k) { if (data[k] == null) data[k] = e.parameter[k]; });
    if (data.action === 'register') out = register_(data);
    else if (data.action === 'whoami') out = whoami_(data);
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
    if (!isRegOpen_(site)) return fail_('closed', 'От халепа( На жаль, реєстрацію вже завершено.');
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
  var sh = ss.getSheetByName(REG_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, names: [] };
  var width = Math.max(REG_COL_NAME, REG_COL_TG_ID);
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, width).getDisplayValues();
  var names = [];
  rows.forEach(function (r) {
    var name = String(r[REG_COL_NAME - 1]).trim();
    if (name && String(r[REG_COL_TG_ID - 1]).trim() === user.id && names.indexOf(name) < 0) names.push(name);
  });
  return { ok: true, names: names };
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
    return { id: String(u.id), username: username };
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
