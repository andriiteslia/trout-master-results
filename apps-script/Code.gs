/**
 * Trout Master — API результатів для сайту.
 *
 * Скрипт читає Google Таблицю турніру і віддає її вміст у JSON.
 * Яку таблицю показувати, задається у властивості скрипту SPREADSHEET_ID
 * (Налаштування проєкту → Властивості скрипту). Туди можна вставити
 * як ID, так і повне посилання на таблицю. Після зміни властивості
 * нічого перепубліковувати не треба: сайт підхопить нову таблицю
 * за кілька секунд.
 *
 * Сайт показує всі видимі листи таблиці у тому ж порядку.
 * Щоб прибрати лист чи колонку з сайту, просто приховайте їх у таблиці.
 */

/** Скільки секунд тримати готову відповідь у кеші. */
var CACHE_SECONDS = 10;

function doGet() {
  var out;
  try {
    out = getPayload_();
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Запустіть цю функцію один раз вручну (кнопка «Виконати»),
 * щоб надати скрипту доступ і перевірити, що таблицю видно.
 */
function testConnection() {
  var payload = buildPayload_(getSpreadsheetId_());
  Logger.log('Таблиця: ' + payload.title);
  payload.sheets.forEach(function (s) {
    Logger.log('Лист «' + s.name + '»: ' + s.values.length + ' рядків');
  });
  Logger.log('Усе гаразд. Тепер опублікуйте скрипт як веб-застосунок.');
}

function getSpreadsheetId_() {
  var raw = (PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '').trim();
  if (!raw) {
    throw new Error('Не задано SPREADSHEET_ID у властивостях скрипту.');
  }
  var m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw;
}

function getPayload_() {
  var id = getSpreadsheetId_();
  var cache = CacheService.getScriptCache();
  var key = 'payload:' + id;

  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  // Якщо кеш порожній і одночасно прийшло кілька запитів,
  // таблицю читає лише один із них, решта чекає на кеш.
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(8000);
  try {
    if (locked) {
      hit = cache.get(key);
      if (hit) return JSON.parse(hit);
    }
    var payload = buildPayload_(id);
    try {
      cache.put(key, JSON.stringify(payload), CACHE_SECONDS);
    } catch (e) {
      // Завелика відповідь для кешу: просто віддаємо без кешування.
    }
    return payload;
  } finally {
    if (locked) lock.releaseLock();
  }
}

function buildPayload_(id) {
  var ss = SpreadsheetApp.openById(id);
  var sheets = ss.getSheets()
    .filter(function (s) { return !s.isSheetHidden(); })
    .map(readSheet_);

  // Хеш вмісту: сайт за ним розуміє, чи змінилися дані,
  // а скрипт запам'ятовує час останньої зміни.
  var body = JSON.stringify(sheets);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body, Utilities.Charset.UTF_8);
  var hash = Utilities.base64EncodeWebSafe(digest);

  var props = PropertiesService.getScriptProperties();
  var changedAt = props.getProperty('changedAt:' + id);
  if (props.getProperty('hash:' + id) !== hash || !changedAt) {
    changedAt = new Date().toISOString();
    var update = {};
    update['hash:' + id] = hash;
    update['changedAt:' + id] = changedAt;
    props.setProperties(update);
  }

  return {
    ok: true,
    title: ss.getName(),
    hash: hash,
    changedAt: changedAt,
    generatedAt: new Date().toISOString(),
    sheets: sheets
  };
}

function readSheet_(sheet) {
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  var merges = range.getMergedRanges().map(function (m) {
    return { r: m.getRow() - 1, c: m.getColumn() - 1, rs: m.getNumRows(), cs: m.getNumColumns() };
  });
  var hiddenCols = [];
  for (var c = 1; c <= range.getNumColumns(); c++) {
    if (sheet.isColumnHiddenByUser(c)) hiddenCols.push(c - 1);
  }
  return { name: sheet.getName(), values: values, merges: merges, hiddenCols: hiddenCols };
}
