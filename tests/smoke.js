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
        CloudStorage: { getItem(k, cb) { cb && cb(null, ''); }, setItem() {} }, openTelegramLink() {}, openLink() {},
        isVersionAtLeast() { return true; }, requestWriteAccess(cb) { cb && cb(true); } } };
    });
  }
  const posts = [];
  await p.route('https://script.google.com/**', (r) => {
    const q = r.request();
    if (q.method() === 'POST') { posts.push(q.postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, names: extra.names || [] }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: FIX(extra.fx ? extra.fx.name : fixture) });
  });
  await p.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.route('https://t.me/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await p.goto('http://localhost:' + PORT + '/' + (extra.hash || (extra.tg ? '#tgWebAppVersion=8.0&tgWebAppPlatform=ios' : '')));
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

  'compare desktop: два рядки → «Порівняти» → двобій; третій замінює другого': async (b) => {
    const t = await page(b, DESK, 'results');
    const rows = t.p.locator('#board [data-key]');
    await rows.nth(0).click(); await t.p.waitForTimeout(400);
    await rows.nth(4).click(); await t.p.waitForTimeout(600);
    assert((await t.p.locator('#board .is-sel').count()) === 2, 'виділено не двох');
    assert(await visible(t.p, '#selbar.is-cmp'), 'таблетка не в режимі порівняння');
    assert((await t.p.locator('#selCardText').innerText()) === 'Порівняти', 'на кнопці не «Порівняти»');
    const k3 = await rows.nth(7).getAttribute('data-key');
    await rows.nth(7).click(); await t.p.waitForTimeout(500);
    assert((await t.p.locator('#board .is-sel').count()) === 2, 'після третього тапу виділено не двох');
    assert(await t.p.locator('#board .is-sel[data-key="' + k3.replace(/"/g, '\\"') + '"]').count() === 1, 'третій не замінив другого');
    await shot(t.p, 'desk-cmp-sel');
    await t.p.click('#selCard'); await t.p.waitForTimeout(1500);
    assert(await visible(t.p, '#pcBody .cmp-duel'), 'екран порівняння не відкрився');
    assert((await t.p.locator('#pcBody .cmp-row').count()) >= 12, 'мало показників');
    await shot(t.p, 'desk-cmp');
    await t.p.locator('#pcBody [data-act="back"]').first().click(); await t.p.waitForTimeout(800);
    assert((await t.p.locator('#board .is-sel').count()) === 2, 'після «Назад» вибір загубився');
    await rows.nth(0).click(); await t.p.waitForTimeout(500);   // зняли першого — другий стає першим
    assert((await t.p.locator('#board .is-sel').count()) === 1 && !(await visible(t.p, '#selbar.is-cmp')), 'зняття першого працює не так');
    await t.ctx.close(); return t.errors;
  },

  'compare h2h: особисті зустрічі, якщо вони суперники': async (b) => {
    const fx = JSON.parse(FIX('results'));
    const pl = fx.draw.players, a = pl.find((x) => x.t[0][1]), bn = pl.find((x) => x.n === a.t[0][1]).name;
    const t = await page(b, DESK, 'results');
    await t.p.locator('#board [data-key^="' + a.name + '"]').first().click(); await t.p.waitForTimeout(300);
    await t.p.locator('#board [data-key^="' + bn + '"]').first().click(); await t.p.waitForTimeout(500);
    await t.p.click('#selCard'); await t.p.waitForTimeout(1500);
    assert(await visible(t.p, '#pcBody .cmp-h2h'), 'немає блоку «Особисті зустрічі»');
    assert((await t.p.locator('#pcBody .cmp-meet').count()) >= 1, 'немає жодної зустрічі');
    assert(/Тур 1/.test(await t.p.locator('#pcBody .cmp-h2h').innerText()), 'немає туру 1 у зустрічах');
    await shot(t.p, 'desk-cmp-h2h');
    await t.ctx.close(); return t.errors;
  },

  'compare mobile: «Порівняти» внизу → двобій': async (b) => {
    const t = await page(b, MOB, 'results');
    await t.p.locator('#board [data-key]').nth(1).click(); await t.p.waitForTimeout(400);
    await t.p.locator('#board [data-key]').nth(3).click(); await t.p.waitForTimeout(600);
    assert(/Порівняти/.test(await t.p.locator('#cardOpen').innerText()), 'внизу не «Порівняти»');
    await shot(t.p, 'mob-cmp-sel');
    await t.p.click('#cardOpen'); await t.p.waitForTimeout(1500);
    assert(await visible(t.p, '#pcBody .cmp-duel'), 'екран порівняння не відкрився');
    await shot(t.p, 'mob-cmp');
    await t.ctx.close(); return t.errors;
  },

  'compare list: у списку учасників другий тап замінює (без порівняння)': async (b) => {
    const t = await page(b, DESK, 'list');
    await t.p.locator('#board [data-key]').nth(1).click(); await t.p.waitForTimeout(300);
    await t.p.locator('#board [data-key]').nth(5).click(); await t.p.waitForTimeout(500);
    assert((await t.p.locator('#board .is-sel').count()) === 1, 'у списку виділено більше одного');
    await t.ctx.close(); return t.errors;
  },

  'stats → дані стали «списком»: порожній стан із кнопкою, лого веде на головну': async (b) => {
    const fx = { name: 'results' };
    const t = await page(b, DESK, 'results', { fx });
    await t.p.click('#navStats'); await t.p.waitForTimeout(1000);
    fx.name = 'list';
    await t.p.click('#refreshBtn'); await t.p.waitForTimeout(1800);
    assert(await visible(t.p, '#tsBody .empty-state'), 'немає порожнього стану');
    await shot(t.p, 'desk-stats-empty');
    await t.p.click('#tsBody .empty-state__btn'); await t.p.waitForTimeout(900);
    assert(!(await visible(t.p, '#tstats')), 'кнопка «На головну» не повернула на головну');
    fx.name = 'results';
    await t.p.click('#refreshBtn'); await t.p.waitForTimeout(1800);
    await t.p.click('#navStats'); await t.p.waitForTimeout(900);
    await t.p.click('#logoHome'); await t.p.waitForTimeout(900);
    assert(!(await visible(t.p, '#tstats')), 'лого не повернуло на головну');
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

  'pay: кнопка «Оплатити участь» — телефон у списку учасників; у результатах і на компі немає': async (b) => {
    const t = await page(b, MOB, 'list', { tg: true });
    assert(await visible(t.p, '#payBox'), 'немає кнопки оплати в списку (телефон)');
    assert(/send\.monobank\.ua\/jar\//.test(await t.p.getAttribute('#payBtn', 'href')), 'кнопка оплати веде не на банку');
    assert(/^Вартість: /.test((await t.p.textContent('#payFee')).trim()), 'під кнопкою немає «Вартість: …»');
    assert(/^\d+\/\d+$/.test((await t.p.textContent('.plist-paid')).trim()), 'у шапці списку немає лічильника оплат «N/M»');
    await shot(t.p, 'mob-pay'); await t.ctx.close();
    const m = await page(b, MOB, 'list', { tg: true, names: ['Повар Олександр'] });   // у фікстурі з галочкою «Оплата»
    assert(!(await visible(m.p, '#payBox')), 'оплаченому показано кнопку оплати');
    await shot(m.p, 'mob-pay-ok'); await m.ctx.close();
    t.errors.push(...m.errors);
    const r = await page(b, MOB, 'results');
    assert(!(await visible(r.p, '#payBox')), 'кнопка оплати видна в результатах'); await r.ctx.close();
    const d = await page(b, DESK, 'list');
    assert(!(await visible(d.p, '#payBox')), 'кнопка оплати видна на компі'); await d.ctx.close();
    return t.errors.concat(r.errors, d.errors);
  },

  'info: «Як доїхати» і «Положення» — лише в Telegram у списку учасників': async (b) => {
    const t = await page(b, MOB, 'rules', { tg: true });
    assert(await visible(t.p, '#heroLinks [data-info="map"]'), 'немає плитки «Як доїхати»');
    assert(await visible(t.p, '#heroLinks [data-info="rules"]'), 'немає плитки «Положення»');
    await t.p.click('#heroLinks [data-info="map"]'); await t.p.waitForTimeout(500);
    assert(await visible(t.p, '#mapSheet'), 'не відкрився вибір навігатора');
    assert(/waze\.com\/ul\?ll=49\.76/.test(await t.p.getAttribute('#mapSheet a[data-map="waze"]', 'href')), 'Waze веде не туди');
    await shot(t.p, 'mob-map');
    await t.p.click('#mapSheet [data-map="close"].mapsheet__btn'); await t.p.waitForTimeout(400);
    assert(!(await visible(t.p, '#mapSheet')), 'вибір навігатора не закрився');
    await t.p.click('#payBtn'); await t.p.waitForTimeout(500);   // є реквізити (payCard) — попап, а не одразу Monobank
    assert(await visible(t.p, '#paySheet'), 'не відкрився попап оплати');
    assert(/^4441 \*{4} \*{4} 5566/.test((await t.p.textContent('#payCard')).trim()), 'у попапі номер картки не замаскований «4441 **** **** 5566»');
    await shot(t.p, 'mob-paysheet');
    await t.p.click('#paySheet .mapsheet__btn--x'); await t.p.waitForTimeout(400);
    await t.p.click('#heroLinks [data-info="rules"]'); await t.p.waitForTimeout(800);
    assert((await t.p.textContent('#tsTitle')) === 'Положення', 'не відкрився екран «Положення»');
    assert((await t.p.locator('.rules__sched li').count()) >= 4, 'розклад не став таблицею');
    assert((await t.p.locator('.rules__list li').count()) >= 10, 'пункти положення не показані');
    await shot(t.p, 'mob-rules');
    await t.p.evaluate(() => history.back()); await t.p.waitForTimeout(800);
    assert(await visible(t.p, '#heroLinks'), 'після «Назад» не повернулись до списку');
    await t.ctx.close();
    const w = await page(b, MOB, 'rules');   // браузер — плиток немає
    assert(!(await visible(w.p, '#heroLinks')), 'плитки видно в браузері'); await w.ctx.close();
    const r = await page(b, MOB, 'results', { tg: true });   // результати — плиток немає
    assert(!(await visible(r.p, '#heroLinks')), 'плитки видно в результатах'); await r.ctx.close();
    return t.errors.concat(w.errors, r.errors);
  },

  'table share: картинка таблиці з шапки таблиці і з картки («Картка | Таблиця»)': async (b) => {
    const t = await page(b, MOB, 'results');
    assert(await visible(t.p, '#tableShare'), 'немає кнопки «Поділитися таблицею»');
    await t.p.locator('#tabs button').nth(1).click(); await t.p.waitForTimeout(900);   // «По турах»: легенда не має стискати перемикач
    assert(await t.p.locator('#tabs').evaluate(e => e.getBoundingClientRect().width) > 250, 'на «По турах» перемикач стиснувся (легенда в одному рядку з ним)');
    await t.p.locator('#tabs button').nth(0).click(); await t.p.waitForTimeout(700);
    await t.p.click('#tableShare'); await t.p.waitForTimeout(2500);
    assert(await visible(t.p, '.story__img img'), 'картинка таблиці не згенерувалась');
    assert(!(await visible(t.p, '.story__kind')), 'без вибраного учасника не має бути перемикача «Картка | Таблиця»');
    assert(/4:5/.test(await t.p.textContent('.story [data-fmt="wide"]')) && await visible(t.p, '.story .fmt-t'), 'для таблиці допис має бути 4:5');
    await t.p.click('.story__close'); await t.p.waitForTimeout(300);
    await t.p.locator('#board [data-key]').nth(13).click(); await t.p.waitForTimeout(500);
    await t.p.click('#tableShare'); await t.p.waitForTimeout(2500);
    assert(await visible(t.p, '.story__kind'), 'з вибраним учасником немає перемикача «Картка | Таблиця»');
    await shot(t.p, 'mob-table-share');
    await t.p.click('[data-kind="card"]'); await t.p.waitForTimeout(2500);
    assert(/Результат:/.test(await t.p.getAttribute('.story__img img', 'alt')), 'перемикач не показав картку учасника');
    await t.ctx.close();
    const l = await page(b, MOB, 'list');
    assert(!(await visible(l.p, '#tableShare')), 'кнопка таблиці видна в списку учасників'); await l.ctx.close();
    return t.errors.concat(l.errors);
  },

  'bump: «Як змінювались місця» — слайдер рухає кружечки, тап підсвічує': async (b) => {
    const t = await page(b, MOB, 'results');
    await t.p.evaluate(() => document.getElementById('navStats').click()); await t.p.waitForTimeout(1500);
    assert(await t.p.locator('#bump').count() === 1, 'немає графіка «Як змінювались місця»');
    const top0 = await t.p.locator('#bump .bump__dot').nth(0).evaluate(e => e.style.top + '|' + e.style.left);
    await t.p.locator('#bumpRange').evaluate(e => { e.value = '1'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const top1 = await t.p.locator('#bump .bump__dot').nth(0).evaluate(e => e.style.top + '|' + e.style.left);
    assert(top0 !== top1, 'слайдер не рухає кружечки');
    assert((await t.p.textContent('#bumpCur')).trim() === 'Тур 1', 'підпис туру не оновився');
    await t.p.locator('#bump .bump__dot').nth(3).click(); await t.p.waitForTimeout(300);
    assert(await t.p.locator('#bump.has-hl .bump__dot.is-hl').count() === 1, 'тап не підсвітив учасника');
    await shot(t.p, 'mob-bump');
    await t.ctx.close();
    return t.errors;
  },

  'share: картка в браузері — системне меню з фото-прев\'ю і посиланням': async (b) => {
    const t = await page(b, MOB, 'results');
    await t.p.evaluate(() => { window.__ns = []; navigator.canShare = () => true; navigator.share = (d) => { window.__ns.push({ n: (d.files || []).length, text: d.text }); return Promise.resolve(); }; });
    await t.p.waitForTimeout(2500);   // фото-прев'ю довантажується заздалегідь
    await t.p.locator('#board [data-key]').nth(4).click(); await t.p.waitForTimeout(400);
    await t.p.click('#cardOpen'); await t.p.waitForTimeout(1500);
    await t.p.locator('[data-act="share"]:visible').first().click(); await t.p.waitForTimeout(800);
    const ns = await t.p.evaluate(() => window.__ns);
    assert(ns.length === 1 && ns[0].n === 1 && /картка учасника[\s\S]*troutmaster\.app\/#p\d+/.test(ns[0].text), 'поділитися карткою: немає фото або посилання ' + JSON.stringify(ns));
    await t.ctx.close();
    return t.errors;
  },

  'list desktop: список, таблетка «Вибрано в списку»': async (b) => {
    const t = await page(b, DESK, 'list');
    assert((await t.p.locator('#board [data-key]').count()) >= 20, 'список учасників порожній');
    assert((await t.p.locator('#board .pt__paid').count()) === 7, 'значок «оплачено» не в тих рядках');
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
    assert((await t.p.textContent('#title')) === 'Реєстрація', 'заголовок на екрані реєстрації — не «Реєстрація»');
    assert(!(await visible(t.p, '#payBox')), 'кнопка оплати видна на екрані реєстрації');
    assert(/Вартість участі — 1\u00a0700\u00a0грн/.test(await t.p.locator('#regFee').innerText()), 'немає вартості участі під кнопкою');
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

  'telegram: плашка сповіщень — зареєстрованому свій текст, «Увімкнути» ховає': async (b) => {
    const t = await page(b, MOB, 'list', { tg: true, names: ['Повар Олександр'], wait: 2500 });
    assert(await visible(t.p, '#nbar'), 'плашки немає');
    assert(/Ви в списку учасників/.test(await t.p.locator('#nbar').innerText()), 'не той текст для зареєстрованого');
    await shot(t.p, 'tg-nbar-reg');
    await t.p.click('#nbarGo'); await t.p.waitForTimeout(400);
    assert(/Готово/.test(await t.p.locator('#nbar').innerText()), 'немає «Готово»');
    assert(t.posts.some((x) => /"writeAccess"/.test(x)), 'дозвіл не надіслано');
    await t.ctx.close();
    const u = await page(b, MOB, 'list', { tg: true, names: [], wait: 2500 });
    assert(await visible(u.p, '#nbar') && /Результати — у Telegram/.test(await u.p.locator('#nbar').innerText()), 'глядачу не той текст');
    await u.ctx.close(); return t.errors.concat(u.errors);
  },

  'telegram: апка в TG, партнер рахує клік': async (b) => {
    const t = await page(b, MOB, 'results', { tg: true });
    if (await visible(t.p, '#partner')) {
      await t.p.locator('#partner').dispatchEvent('click'); await t.p.waitForTimeout(500);   // кнопка «левітує» — клікаємо без очікування стабільності
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
