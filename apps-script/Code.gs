/**
 * Trout Master — API результатів для сайту.
 *
 * Як це працює:
 * 1. У таблиці раунду є аркуш «Сайт» з галочкою «Опублікувати зараз».
 * 2. Ставите галочку → скрипт знімає поточні результати і зберігає їх.
 * 3. Сайт кожні кілька секунд питає скрипт, чи є нова публікація.
 *    Саму таблицю він не читає, тож глядачі бачать лише опубліковане.
 *
 * Перший запуск і кожен новий раунд:
 *   впишіть посилання на таблицю в SETTINGS і запустіть функцію setupSync.
 *   Вона створить аркуш «Сайт», підключить галочку й опублікує дані.
 *
 * Які частини таблиці показувати, задано у VIEWS: назва вкладки,
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

/** Аркуш з кнопкою публікації та його клітинки. */
var SYNC_SHEET = 'Сайт';
var CELL_PUBLISH = 'B3';
var CELL_STATUS = 'B4';
var CELL_TITLE = 'B6';
var CELL_SUBTITLE = 'B7';

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
    if (!out) out = { ok: false, error: 'Результати ще не опубліковано. Поставте галочку на аркуші «' + SYNC_SHEET + '».' };
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
 * Створює аркуш «Сайт» з галочкою, підключає її і публікує дані.
 */
function setupSync() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(SYNC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SYNC_SHEET);
    sh.getRange('A1').setValue('Публікація результатів на сайт').setFontWeight('bold').setFontSize(13);
    sh.getRange('A3:A7').setValues([['Опублікувати зараз'], ['Остання публікація'], [''], ['Заголовок'], ['Підзаголовок']]);
    sh.getRange('A3:A7').setFontWeight('bold');
    sh.getRange(CELL_TITLE).setValue(SETTINGS.EVENT_TITLE);
    sh.getRange(CELL_SUBTITLE).setValue(SETTINGS.EVENT_SUBTITLE);
    sh.getRange('A9').setValue('Поставте галочку в B3, щоб відправити поточні результати на сайт. Заголовок і підзаголовок теж оновлюються при публікації.');
    sh.getRange('A9').setFontColor('#475467');
    sh.setColumnWidth(1, 180);
    sh.setColumnWidth(2, 420);
  }
  sh.getRange(CELL_PUBLISH).insertCheckboxes().setValue(false);

  // Одна галочка на одну активну таблицю: старі тригери прибираємо
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'handleSiteSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleSiteSync').forSpreadsheet(ss).onEdit().create();

  var p = publish_(ss);
  writeStatus_(sh, p);
  Logger.log('Готово. Галочка підключена, дані опубліковано: ' + summary_(p));
}

/** Тригер: реагує на галочку «Опублікувати зараз». */
function handleSiteSync(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== SYNC_SHEET || e.range.getA1Notation() !== CELL_PUBLISH) return;
  if (String(e.value).toUpperCase() !== 'TRUE') return;

  sh.getRange(CELL_STATUS).setValue('⏳ Публікуємо…');
  SpreadsheetApp.flush();
  try {
    writeStatus_(sh, publish_(e.source));
  } catch (err) {
    sh.getRange(CELL_STATUS).setValue('❌ Помилка: ' + ((err && err.message) || err));
  } finally {
    e.range.setValue(false);
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

function publish_(ss) {
  var sheets = VIEWS.map(function (view) { return readView_(ss, view); });
  var sh = ss.getSheetByName(SYNC_SHEET);
  var event = {
    title: (sh && String(sh.getRange(CELL_TITLE).getDisplayValue()).trim()) || SETTINGS.EVENT_TITLE,
    subtitle: (sh && String(sh.getRange(CELL_SUBTITLE).getDisplayValue()).trim()) || SETTINGS.EVENT_SUBTITLE
  };
  var now = new Date().toISOString();
  var body = JSON.stringify([event, sheets]);
  var hash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body, Utilities.Charset.UTF_8));

  var payload = {
    ok: true,
    title: ss.getName(),
    event: event,
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
  sh.getRange(CELL_STATUS).setValue('✅ ' + t + ' • ' + summary_(p));
}

function summary_(p) {
  return p.sheets.map(function (s) {
    return s.name + ': ' + Math.max(0, s.values.length - 2);
  }).join(', ');
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
