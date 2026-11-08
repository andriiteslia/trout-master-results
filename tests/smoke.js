#!/usr/bin/env node
/*
 * Автотести основних сценаріїв сайту (Playwright + Chromium).
 *
 *   node tests/smoke.js            — усі сценарії
 *   node tests/smoke.js card       — лише ті, у назві яких є «card»
 *   SHOTS=1 node tests/smoke.js    — ще й скріни в tests/out/
 *
 * Сайт піднімається локальним сервером, запити до Apps Script підміняються
 * фікстурами з tests/fixtures/ (results.json — турнір триває, list.json — реєстрація).
 * Перед тестами перевіряється, що assets/app.js і assets/style.css зібрані з src/ (tools/build.js).
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const PORT = 8177;
const FIX = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8');
const SHOTS = !!process.env.SHOTS;
const only = process.argv[2] || '';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    r.end(d);
  });
});

const DESK = { viewport: { width: 1440, height: 900 } };
const MOB = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function page(b, opts, fixture, extra) {
  extra = extra || {};
  const ctx = await b.newContext(Object.assign({ locale: 'uk-UA' }, opts));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.addInitScript((lang) => { try { localStorage.setItem('tm:lang', lang); } catch (e) { /* */ } }, extra.lang || 'uk');
  if (extra.tg) {
    await p.addInitScript(() => {
      window.Telegram = { WebApp: { initData: 'query_id=test&user=%7B%22id%22%3A1%7D&hash=x', initDataUnsafe: { user: { id: 1 } }, platform: 'ios', version: '8.0',
        ready() {}, expand() {}, onEvent() {}, offEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {},
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, HapticFeedback: { impactOccurred() {}, selectionChanged() {} },
        CloudStorage: { getItem(k, cb) { cb && cb(null, ''); }, setItem() {} }, openTelegramLink() {}, openLink() {} } };
    });
  }
  const posts = [];
  await p.route('https://script.google.com/**', (r) => {
    const q = r.request();
    if (q.method() === 'POST') { posts.push(q.postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"names":[]}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: FIX(fixture) });
  });
  await p.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.route('https://t.me/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await p.goto('http://localhost:' + PORT + '/' + (extra.hash || ''));
  await p.waitForTimeout(extra.wait || 1800);
  return { ctx, p, errors, posts };
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const visible = (p, sel) => p.locator(sel).first().isVisible();
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, name + '.png') }); } }
const cardTitle = (p) => p.evaluate(() => { const c = document.getElementById('pcard'); const t = document.getElementById('pcTitle'); return c && !c.hidden && t ? t.textContent : null; });

const TESTS = {
  'build: assets/ зібрані з src/': async () => {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--check'], { stdio: 'pipe' });
  },

  'desktop results: таблиця, плитки, бічна панель': async (b) => {
    const t = await page(b, DESK, 'results');
    const rows = await t.p.locator('#board [data-key]').count();
    assert(rows >= 20, 'у таблиці мало рядків: ' + rows);
    assert(await visible(t.p, '#side'), 'немає бічної панелі');
    assert((await t.p.locator('#kpis > *').count()) >= 3, 'немає плиток KPI');
    await shot(t.p, 'desk-results');
    await t.p.click('#tab-1'); await t.p.waitForTimeout(600);
    assert((await t.p.getAttribute('#tab-1', 'aria-selected')) === 'true' && (await t.p.locator('#board .tgrid').count()) > 0, 'вкладка «По турах» не відкрилась');
    await shot(t.p, 'desk-tours');
    await t.ctx.close(); return t.errors;
  },

  'desktop card: вибір рядка → таблетка → картка → назад': async (b) => {
    const t = await page(b, DESK, 'results');
    const row = t.p.locator('#board [data-key]').nth(4);
    const key = await row.getAttribute('data-key');
    await row.click(); await t.p.waitForTimeout(700);
    assert(await visible(t.p, '#selbar.is-on'), 'таблетка не з’явилась');
    await t.p.click('#selCard'); await t.p.waitForTimeout(1200);
    const title = await cardTitle(t.p);
    assert(title && key.indexOf(title) === 0, 'картка не того учасника: ' + title + ' / ' + key);
    assert((await t.p.locator('#pcBody .pk').count()) === 4, 'у картці не 4 плитки');
    await shot(t.p, 'desk-card');
    await t.p.locator('#pcBody [data-act="back"]').first().click(); await t.p.waitForTimeout(800);
    assert(!(await cardTitle(t.p)), 'не повернулись до таблиці');
    await t.ctx.close(); return t.errors;
  },

  'desktop stats: екран статистики': async (b) => {
    const t = await page(b, DESK, 'results');
    await t.p.click('#navStats'); await t.p.waitForTimeout(1200);
    assert(await visible(t.p, '#tstats'), 'статистика не відкрилась');
    const txt = await t.p.locator('#tsBody').innerText();
    assert(/Карта водойми/.test(txt) && /Рекорди/.test(txt), 'на статистиці бракує блоків');
    await shot(t.p, 'desk-stats');
    await t.ctx.close(); return t.errors;
  },

  'mobile results: вибір → «Картка» → картка': async (b) => {
    const t = await page(b, MOB, 'results');
    await t.p.locator('#board [data-key]').nth(2).click(); await t.p.waitForTimeout(600);
    assert(await visible(t.p, '#cardOpen'), 'немає кнопки «Картка»');
    await shot(t.p, 'mob-selected');
    await t.p.click('#cardOpen'); await t.p.waitForTimeout(1200);
    assert(await cardTitle(t.p), 'картка не відкрилась');
    await shot(t.p, 'mob-card');
    await t.ctx.close(); return t.errors;
  },

  'list desktop: список, таблетка «Вибрано в списку»': async (b) => {
    const t = await page(b, DESK, 'list');
    assert((await t.p.locator('#board [data-key]').count()) >= 20, 'список учасників порожній');
    await t.p.locator('#board [data-key]').nth(3).click(); await t.p.waitForTimeout(700);
    assert(await visible(t.p, '#selbar.is-on'), 'таблетка не з’явилась');
    assert((await t.p.locator('#selLbl').innerText()) === 'Вибрано в списку', 'не той підпис у таблетці');
    await shot(t.p, 'desk-list');
    await t.ctx.close(); return t.errors;
  },

  'list mobile: реєстрація відкривається': async (b) => {
    const t = await page(b, MOB, 'list');
    assert(await visible(t.p, '#regOpen'), 'немає кнопки «Зареєструватися»');
    await t.p.click('#regOpen'); await t.p.waitForTimeout(900);
    assert(await visible(t.p, '#regForm'), 'форма реєстрації не відкрилась');
    await shot(t.p, 'mob-reg');
    await t.ctx.close(); return t.errors;
  },

  'deep link #p3: одразу картка, адреса чиста після оновлення': async (b) => {
    const t = await page(b, DESK, 'results', { hash: '#p3', wait: 2200 });
    assert(await cardTitle(t.p), 'картка за посиланням не відкрилась');
    await t.p.reload(); await t.p.waitForTimeout(1800);
    assert(!(await cardTitle(t.p)), 'після оновлення знову відкрилась картка');
    await t.ctx.close(); return t.errors;
  },

  'eng: перемикач мови': async (b) => {
    const t = await page(b, DESK, 'results', { lang: 'en' });
    const txt = await t.p.locator('#tabs').innerText();
    assert(!/[а-яіїєґ]/i.test(txt), 'вкладки не перекладені: ' + txt);
    await shot(t.p, 'desk-eng');
    await t.ctx.close(); return t.errors;
  },

  'telegram: апка в TG, партнер рахує клік': async (b) => {
    const t = await page(b, MOB, 'results', { tg: true });
    if (await visible(t.p, '#partner')) {
      await t.p.click('#partner'); await t.p.waitForTimeout(500);
      assert(t.posts.some((x) => /"pclick"/.test(x)), 'клік партнера не надіслано');
    }
    await shot(t.p, 'tg-results');
    await t.ctx.close(); return t.errors;
  }
};

(async () => {
  srv.listen(PORT);
  const b = await chromium.launch();
  let fail = 0;
  for (const [name, fn] of Object.entries(TESTS)) {
    if (only && !name.includes(only)) continue;
    const t0 = Date.now();
    try {
      const errs = (await fn(b)) || [];
      if (errs.length) throw new Error('помилки в консолі:\n    ' + errs.join('\n    '));
      console.log('  ✓ ' + name + '  (' + (Date.now() - t0) + ' мс)');
    } catch (e) {
      fail++;
      console.log('  ✗ ' + name + '\n    ' + String(e.message || e).split('\n').join('\n    '));
    }
  }
  await b.close(); srv.close();
  console.log(fail ? '\n' + fail + ' не пройшло' : '\nУсе пройшло');
  process.exit(fail ? 1 : 0);
})();
