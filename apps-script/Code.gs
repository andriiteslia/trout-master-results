/**
 * Trout Master — API результатів для сайту.
 *
 * Скрипт читає Google Таблицю турніру і віддає її вміст у JSON.
 * Налаштування (Налаштування проєкту → Властивості скрипту):
 *   SPREADSHEET_ID  — посилання на таблицю раунду (або лише її ID)
 *   EVENT_TITLE     — заголовок на сайті, напр. «Round 1»
 *   EVENT_SUBTITLE  — підзаголовок, напр. «21 листопада • Плугів • Krychevychi Area Fishing»
 * Після зміни властивостей нічого перепубліковувати не треба:
 * сайт підхопить зміни за кілька секунд.
 *
 * Які таблиці показувати на сайті, задано нижче у VIEWS:
 * назва вкладки, аркуш і діапазон колонок. Перші два рядки
 * діапазону — заголовки. Номер останнього рядка можна не вказувати:
 * скрипт сам візьме всі заповнені рядки.
 */

var VIEWS = [
  { name: 'Результат', sheet: 'Results', range: 'AM1:AQ' },
  { name: 'Тури',      sheet: 'Results', range: 'A1:AK' }
];

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
    Logger.log('Вкладка «' + s.name + '»: ' + Math.max(0, s.values.length - 2) + ' рядків даних');
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
  var sheets = VIEWS.map(function (view) { return readView_(ss, view); });

  var props = PropertiesService.getScriptProperties();
  var event = {
    title: (props.getProperty('EVENT_TITLE') || '').trim(),
    subtitle: (props.getProperty('EVENT_SUBTITLE') || '').trim()
  };

  // Хеш вмісту: сайт за ним розуміє, чи змінилися дані,
  // а скрипт запам'ятовує час останньої зміни.
  var body = JSON.stringify([event, sheets]);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body, Utilities.Charset.UTF_8);
  var hash = Utilities.base64EncodeWebSafe(digest);

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
    event: event,
    hash: hash,
    changedAt: changedAt,
    generatedAt: new Date().toISOString(),
    sheets: sheets
  };
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
  if (r2 < r1 || width < 1) return { name: view.name, values: [], merges: [] };

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

  return { name: view.name, values: values, merges: merges };
}

function colIndex_(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}
