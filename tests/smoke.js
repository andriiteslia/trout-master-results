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
  else if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html';   // як GitHub Pages: /r1 → r1/index.html
  fs.readFile(p, (e, d) => {
    if (e && !path.extname(p)) return fs.readFile(path.join(ROOT, '404.html'), (e2, d2) => { r.writeHead(404, { 'Content-Type': 'text/html' }); r.end(d2); });   // як GitHub Pages: 404.html
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
        BackButton: { show() {}, hide() {}, onClick(h) { window.__tgBack = h; }, offClick() {} }, HapticFeedback: { impactOccurred() {}, selectionChanged() {} },
        CloudStorage: { getItem(k, cb) { cb && cb(null, ''); }, setItem() {} }, openTelegramLink() {}, openLink() {},
        isVersionAtLeast() { return true; }, requestWriteAccess(cb) { cb && cb(true); } } };
    });
  }
  const posts = [];
  let gets = 0;
  await p.route('https://script.google.com/**', (r) => {
    const q = r.request();
    if (q.method() === 'GET') gets++;
    if (q.method() === 'POST') { posts.push(q.postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, names: extra.names || [] }) }); }
    const rn = /[?&]round=(\d+)/.exec(q.url());
    if (rn) return r.fulfill({ status: 200, contentType: 'application/json', body: FIX('arch-' + rn[1]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: extra.body || FIX(extra.fx ? extra.fx.name : fixture) });
  });
  await p.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.route('https://t.me/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  if (extra.clock) await p.clock.install();
  await p.goto('http://localhost:' + PORT + '/' + (extra.hash || (extra.tg ? '#tgWebAppVersion=8.0&tgWebAppPlatform=ios' : '')));
  await p.waitForTimeout(extra.wait || 1800);
  return { ctx, p, errors, posts, gets: () => gets };
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const visible = (p, sel) => p.locator(sel).first().isVisible();
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, name + '.png') }); } }
const cardTitle = (p) => p.evaluate(() => { const c = document.getElementById('pcard'); const t = document.getElementById('pcTitle'); return c && !c.hidden && t ? t.textContent : null; });

const TESTS = {
  'build: assets/ зібрані з src/': async () => {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--check'], { stdio: 'pipe' });
  },

  'build: стиснення (tools/minify.js) нічого не змінює в JS і CSS': async (b) => {
    const errs = await require('./minify-check.js')(b);
    assert(!errs.length, errs.join('\n'));
    return [];
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

  'лідерборд: таблиця, аркуш гравця (комп і телефон)': async (b) => {
    const t = await page(b, DESK, 'league');
    await t.p.click('#leagueNav [data-sec="lb"]'); await t.p.waitForTimeout(500);
    assert((await t.p.locator('.lb-row').count()) === 24, 'у лідерборді не 24 рядки');
    assert((await t.p.locator('.lb-row').first().innerText()).includes('Красько Олег'), 'першим не Красько');
    assert(await visible(t.p, '.lb-side .lb-prize'), 'на компі немає картки призу');
    await shot(t.p, 'desk-lb');
    await t.p.fill('#lbSearch', 'лічн'); await t.p.waitForTimeout(200);
    assert((await t.p.locator('.lb-row:visible').count()) === 1, 'пошук у лідерборді не відфільтрував');
    await shot(t.p, 'desk-lb-search');
    await t.p.click('#lbSearchClear'); await t.p.waitForTimeout(200);
    assert((await t.p.locator('.lb-row:visible').count()) === 24, 'очищення пошуку не повернуло всіх');
    assert(await t.p.evaluate(() => getComputedStyle(document.querySelector('.lb-sticky')).boxShadow === 'none'), 'у шапки є тінь');
    await t.p.evaluate(() => window.scrollTo(0, 700)); await t.p.waitForTimeout(300);
    const top = await t.p.evaluate(() => document.querySelector('.lb-sticky').getBoundingClientRect().top);
    assert(Math.abs(top) < 2, 'шапка лідерборду не прилипла на компі: ' + top);
    await shot(t.p, 'desk-lb-sticky');
    await t.p.evaluate(() => window.scrollTo(0, 0));
    await t.p.locator('.lb-row').nth(1).click(); await t.p.waitForTimeout(500);
    assert(await visible(t.p, '#lbSheet .lbsheet__done'), 'не відкрилось віконце гравця');
    assert((await t.p.locator('#lbSheet .lb-fest li.g').count()) === 2, 'у Лічнера мало бути 2 бонуси (риба, лідер)');
    await shot(t.p, 'desk-lb-sheet');
    await t.p.click('#lbSheet .lbsheet__done'); await t.p.waitForTimeout(450);
    assert(!(await visible(t.p, '#lbSheet')), '«Готово» не закрило віконце');
    await t.ctx.close();
    const m = await page(b, MOB, 'league', { tg: true });
    await m.p.click('#tabbar [data-sec="lb"]'); await m.p.waitForTimeout(500);
    assert((await m.p.locator('.lb-row:visible').count()) === 24, 'на телефоні показано не всіх');
    assert((await m.p.locator('[data-lg-all]').count()) === 0, 'зайва кнопка «Показати всіх»');
    assert(await m.p.evaluate(() => getComputedStyle(document.querySelectorAll('.lb-pl')[3]).backgroundColor === 'rgba(0, 0, 0, 0)'), '4-те місце не має бути з кружечком');
    await shot(m.p, 'tg-lb');
    await m.p.evaluate(() => window.scrollTo(0, 900)); await m.p.waitForTimeout(400);
    const mt = await m.p.evaluate(() => { const r = document.querySelector('.lb-sticky').getBoundingClientRect(), c = document.querySelector('.lb-card').getBoundingClientRect(); return r.top - Math.max(c.top, 0); });
    assert(mt >= 0 && await m.p.evaluate(() => document.querySelector('.lb-sticky').getBoundingClientRect().top < 120), 'шапка лідерборду не прилипла в Telegram');
    await shot(m.p, 'tg-lb-sticky');
    await m.p.evaluate(() => window.scrollTo(0, 0)); await m.p.waitForTimeout(200);
    await m.p.locator('.lb-row').nth(1).click(); await m.p.waitForTimeout(500);
    await shot(m.p, 'tg-lb-sheet');
    // свайп униз по аркушу — закриває
    const bx = await m.p.locator('#lbSheet .mapsheet__box').boundingBox();
    const cdp = await m.ctx.newCDPSession(m.p);
    const tp = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
    await tp('touchStart', bx.y + 30);
    for (let k = 1; k <= 8; k++) { await tp('touchMove', bx.y + 30 + k * 30); await m.p.waitForTimeout(16); }
    await tp('touchEnd'); await m.p.waitForTimeout(500);
    assert(!(await visible(m.p, '#lbSheet')), 'свайп униз не закрив аркуш');
    assert(!(await m.p.evaluate(() => document.querySelector('.ptr.is-busy'))), 'під аркушем спрацювало оновлення сторінки');
    await m.ctx.close();
    return t.errors.concat(m.errors);
  },

  'мова ENG: лідерборд без транслітерації': async (b) => {
    const t = await page(b, DESK, 'league', { lang: 'en', hash: 'leaderboard/' });
    const cap = await t.p.textContent('.lb-cap span');
    assert(/^After 1 of 4 fests$/.test(cap.replace(/\s+/g, ' ').trim()), 'підпис лідерборду: ' + cap);
    assert((await t.p.getAttribute('#leagueNav', 'aria-label')) === 'League sections', 'aria-label навігації не перекладено');
    await t.ctx.close();
    return t.errors;
  },

  'мова: ENG → УКР, заголовок головної не лишається англійським': async (b) => {
    const t = await page(b, DESK, 'season', { lang: 'en' });
    await t.p.click('[data-lang="uk"]'); await t.p.waitForTimeout(300);
    await t.p.click('#leagueNav [data-sec="lb"]'); await t.p.waitForTimeout(300);
    await t.p.click('#leagueNav [data-sec="tours"]'); await t.p.waitForTimeout(300);
    const head = await t.p.evaluate(() => document.getElementById('homeTitle').innerText + ' | ' + document.querySelector('#home .home__lead').textContent);
    assert(!/Tournaments|Registration/.test(head), 'на УКР заголовок англійською: ' + head);
    await t.ctx.close();
    return t.errors;
  },

  'посилання #r1 при збережених даних: одразу R1, без проміжного R2': async (b) => {
    const t = await page(b, DESK, 'season');
    await t.p.route('https://script.google.com/**', async (r) => {   // повільний сервер, як справжній Apps Script
      const rn = /[?&]round=(\d+)/.exec(r.request().url());
      await new Promise((z) => setTimeout(z, rn ? 1500 : 1000));
      r.fulfill({ status: 200, contentType: 'application/json', body: rn ? FIX('arch-' + rn[1]) : FIX('season') });
    });
    await t.p.addInitScript(() => {
      window.__h1s = [];
      setInterval(() => { const h = [...document.querySelectorAll('h1')].filter((e) => e.offsetParent).map((e) => e.textContent.trim()).join('/'); if (h && window.__h1s[window.__h1s.length - 1] !== h) window.__h1s.push(h); }, 10);
    });
    await t.p.goto('http://localhost:' + PORT + '/?again=1#r1'); await t.p.waitForTimeout(3000);
    const seq = await t.p.evaluate(() => window.__h1s);
    if (process.env.SEQ) console.log(seq.join(' → '));
    assert(!seq.some((h) => /Round 2/.test(h)), 'перед R1 блимає R2: ' + seq.join(' → '));
    assert(/Round 1/.test(seq[seq.length - 1]), 'не відкрився R1: ' + seq.join(' → '));
    await t.ctx.close();
    return t.errors;
  },

  'адреси розділів: /leaderboard, /partners, /about': async (b) => {
    const t = await page(b, DESK, 'league', { hash: 'leaderboard/' });
    const u = () => new URL(t.p.url()).pathname + new URL(t.p.url()).hash;
    assert((await t.p.getAttribute('#leagueNav [data-sec="lb"]', 'aria-current')) === 'page' && await visible(t.p, '.lb-row'), '/leaderboard/ не відкрив лідерборд');
    assert(/Лідерборд/.test(await t.p.title()), 'назва вкладки не «Лідерборд»: ' + await t.p.title());
    await t.p.click('#leagueNav [data-sec="partners"]'); await t.p.waitForTimeout(400);
    assert(u() === '/partners', 'адреса партнерів: ' + u());
    await t.p.click('#leagueNav [data-sec="about"]'); await t.p.waitForTimeout(400);
    assert(u() === '/about', 'адреса «Про лігу»: ' + u());
    await t.p.goBack(); await t.p.waitForTimeout(400);
    assert(u() === '/partners' && (await t.p.getAttribute('#leagueNav [data-sec="partners"]', 'aria-current')) === 'page', '«Назад» не повернув на партнерів: ' + u());
    await t.p.click('#leagueNav [data-sec="tours"]'); await t.p.waitForTimeout(400);
    assert(u() === '/', 'адреса турнірів: ' + u());
    await t.p.locator('[data-round="1"]:visible').first().click(); await t.p.waitForTimeout(800);
    assert(u() === '/r1', 'адреса раунду: ' + u());
    await t.p.click('#leagueNav [data-sec="lb"]'); await t.p.waitForTimeout(400);
    assert(u() === '/leaderboard' && await visible(t.p, '.lb-row'), 'з раунду в лідерборд: ' + u());
    await t.p.goBack(); await t.p.waitForTimeout(600);
    assert(u() === '/r1' && await visible(t.p, '#board'), '«Назад» з лідерборду не в раунд: ' + u());
    // перезавантаження на /partners/ — ті самі файли з кореня, без помилок
    await t.p.goto('http://localhost:' + PORT + '/partners/'); await t.p.waitForTimeout(1500);
    assert((await t.p.getAttribute('#leagueNav [data-sec="partners"]', 'aria-current')) === 'page', '/partners/ не відкрив партнерів');
    await t.ctx.close();
    const m = await page(b, MOB, 'league', { tg: true, hash: '#tgWebAppStartParam=leaderboard&tgWebAppVersion=8.0&tgWebAppPlatform=ios' });
    assert((await m.p.getAttribute('#tabbar [data-sec="lb"]', 'aria-current')) === 'page', 'startapp=leaderboard не відкрив лідерборд у Telegram');
    await m.ctx.close();
    return t.errors.concat(m.errors);
  },

  'навбар: Турніри / Лідерборд / Про лігу (комп)': async (b) => {
    const t = await page(b, DESK, 'season');
    assert(await visible(t.p, '#leagueNav'), 'на головній немає перемикача розділів');
    assert((await t.p.getAttribute('#leagueNav [data-sec="tours"]', 'aria-current')) === 'page', '«Турніри» не активні');
    await shot(t.p, 'desk-nav-tours');
    await t.p.click('#leagueNav [data-sec="lb"]'); await t.p.waitForTimeout(500);
    assert((await t.p.locator('#homeTitle').innerText()).includes('Лідерборд'), 'не відкрився «Лідерборд»');
    await shot(t.p, 'desk-nav-lb');
    // «таблетка» має їхати, а не перескакувати: одразу після кліку вона ще між пунктами
    const midX = await t.p.evaluate(() => new Promise(res => {
      const nav = document.getElementById('leagueNav'), ind = nav.querySelector('.seg-ind');
      nav.querySelector('[data-sec="partners"]').click();
      setTimeout(() => res({ x: new DOMMatrix(getComputedStyle(ind).transform).m41, to: nav.querySelector('[data-sec="partners"]').offsetLeft }), 60);
    }));
    assert(Math.abs(midX.x - midX.to) > 2, 'таблетка в навбарі перескакує без анімації');
    await t.p.waitForTimeout(500);
    assert((await t.p.locator('#homeTitle').innerText()).includes('Партнери') && await visible(t.p, '.pt-card [data-partner="FISH.ME.FISH"]'), 'не відкрились «Партнери»');
    await shot(t.p, 'desk-nav-partners');
    await t.p.click('#leagueNav [data-sec="about"]'); await t.p.waitForTimeout(500);
    assert((await t.p.locator('#homeTitle').innerText()).includes('Про лігу'), 'не відкрилось «Про лігу»');
    await shot(t.p, 'desk-nav-about');
    await t.p.click('#leagueNav [data-sec="tours"]'); await t.p.waitForTimeout(400);
    await t.p.locator('[data-round="2"]').first().click(); await t.p.waitForTimeout(700);
    assert(await visible(t.p, '#leagueNav'), 'на сторінці раунду немає перемикача');
    assert((await t.p.getAttribute('#leagueNav [data-sec="tours"]', 'aria-current')) === 'page', 'на сторінці раунду мають бути активні «Турніри»');
    await shot(t.p, 'desk-nav-round');
    await t.p.click('#leagueNav [data-sec="lb"]'); await t.p.waitForTimeout(700);
    assert(await visible(t.p, '#home') && (await t.p.locator('#homeTitle').innerText()).includes('Лідерборд'), 'з раунду не відкрився «Лідерборд»');
    const m = await page(b, MOB, 'season');
    assert(!(await visible(m.p, '#leagueNav')), 'на телефоні не має бути перемикача');
    // відкрили вузьким, потім розширили — «таблетка» під «Турніри» має з'явитись
    await m.p.setViewportSize({ width: 1440, height: 900 }); await m.p.waitForTimeout(500);
    const ind = await m.p.evaluate(() => { const i = document.querySelector('#leagueNav .seg-ind'), b2 = document.querySelector('#leagueNav [aria-current="page"]');
      const bg = getComputedStyle(b2).backgroundColor; return (i && getComputedStyle(i).opacity === '1' && i.offsetWidth > 20) || bg === 'rgb(255, 255, 255)'; });
    assert(ind, 'після розширення вікна немає білої таблетки під «Турніри»');
    await m.ctx.close();
    await t.ctx.close(); return t.errors;
  },

  'таббар розділів: телефон і Telegram, лише на головних розділах': async (b) => {
    const t = await page(b, MOB, 'season', { tg: true });
    assert(await visible(t.p, '#tabbar'), 'у Telegram на головній немає таббару');
    assert(!(await visible(t.p, '#leagueNav')), 'на телефоні видно перемикач з навбару');
    // білий аркуш — до низу екрана: футер не видно на першому екрані
    const footTop = await t.p.evaluate(() => document.getElementById('siteFoot').getBoundingClientRect().top);
    assert(footTop >= 844, 'футер видно на першому екрані під таббаром: ' + footTop);
    assert((await t.p.locator('#partner').count()) === 0, 'плаваюча кнопка партнера ще є');
    await shot(t.p, 'tg-tabbar-home');
    await t.p.click('#tabbar [data-sec="lb"]'); await t.p.waitForTimeout(500);
    assert((await t.p.getAttribute('#tabbar [data-sec="lb"]', 'aria-current')) === 'page', '«Лідерборд» не активний');
    assert(await visible(t.p, '#homeTitle'), 'на телефоні в розділі не видно заголовка');
    await shot(t.p, 'tg-tabbar-lb');
    await t.p.click('#tabbar [data-sec="partners"]'); await t.p.waitForTimeout(500);
    assert(await visible(t.p, '.pt-card'), 'на телефоні не відкрились «Партнери»');
    await shot(t.p, 'tg-tabbar-partners');
    await t.p.click('#tabbar [data-sec="tours"]'); await t.p.waitForTimeout(400);
    await t.p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await t.p.waitForTimeout(400);
    await shot(t.p, 'tg-tabbar-bottom');
    await t.p.locator('[data-round="2"]').first().click(); await t.p.waitForTimeout(700);
    assert(!(await visible(t.p, '#tabbar')), 'у раунді видно таббар');
    await t.ctx.close();
    const m = await page(b, MOB, 'season');
    assert(await visible(m.p, '#tabbar'), 'у мобільному браузері немає таббару');
    await shot(m.p, 'mob-tabbar-home');
    await m.ctx.close();
    return t.errors.concat(m.errors);
  },

  'посилання з номером раунду: #r1-stats, #r1-p3, адреси екранів': async (b) => {
    // Архів R1: статистика за посиланням — саме R1
    let t = await page(b, DESK, 'season', { hash: '#r1-stats', wait: 2500 });
    assert(await visible(t.p, '#tstats'), '#r1-stats не відкрив статистику');
    assert(await t.p.evaluate(() => document.documentElement.classList.contains('is-archive')), '#r1-stats відкрив не архів R1');
    assert(/\/r1\/stats$/.test(t.p.url()), 'старе #r1-stats не перейшло на /r1/stats: ' + t.p.url());
    await t.p.evaluate(() => history.back()); await t.p.waitForTimeout(600);
    assert(/\/r1$/.test(t.p.url()) && await visible(t.p, '#board'), '«Назад» зі статистики не на список R1: ' + t.p.url());
    // картка з архіву: адреса #r1-pN, а «Поділитися» — теж із r1
    await t.p.locator('#board [data-key]').first().click(); await t.p.waitForTimeout(300);
    await t.p.evaluate(() => { const b2 = document.getElementById('selCard') || document.getElementById('cardOpen'); b2 && b2.click(); });
    await t.p.waitForTimeout(800);
    assert(/\/r1\/p\d+$/.test(t.p.url()), 'адреса картки без раунду: ' + t.p.url());
    assert(await t.p.evaluate(() => /troutmaster\.app\/r1\/p\d+$/.test(window.__tmShareUrl())), 'посилання «Поділитися» без раунду');
    await t.ctx.close();
    // Нові адреси: /r1/stats, /r1/p3 (копії сторінки), /r5 (немає копії — 404.html) відкривають потрібне
    t = await page(b, DESK, 'season', { hash: 'r1/stats', wait: 2500 });
    assert(await visible(t.p, '#tstats') && await t.p.evaluate(() => document.documentElement.classList.contains('is-archive')), '/r1/stats не відкрив статистику R1');
    await t.ctx.close();
    t = await page(b, DESK, 'season', { hash: 'r1/p3', wait: 2500 });
    assert(/\/r1\/p3$/.test(t.p.url()) && (await cardTitle(t.p)) && await t.p.evaluate(() => document.documentElement.classList.contains('is-archive')), '/r1/p3 не відкрив картку з R1: ' + t.p.url());
    await t.ctx.close();
    t = await page(b, DESK, 'season', { hash: 'r2', wait: 2500 });
    assert(await visible(t.p, '#board') && !(await t.p.evaluate(() => document.documentElement.classList.contains('is-archive'))), '/r2 не відкрив поточний раунд');
    await t.ctx.close();
    // Поточний раунд R2: #r2-stats — статистика поточного
    t = await page(b, DESK, 'season-live', { hash: '#r2-stats', wait: 2500 });
    assert(await visible(t.p, '#tstats') && !(await t.p.evaluate(() => document.documentElement.classList.contains('is-archive'))), '#r2-stats не відкрив статистику поточного раунду');
    await t.ctx.close();
    // Telegram: startapp=r1-stats
    t = await page(b, MOB, 'season', { tg: true, hash: '#tgWebAppStartParam=r1-stats&tgWebAppVersion=8.0&tgWebAppPlatform=ios', wait: 2500 });
    assert(await visible(t.p, '#tstats') && await t.p.evaluate(() => document.documentElement.classList.contains('is-archive')), 'startapp=r1-stats не відкрив статистику R1');
    await t.ctx.close(); return t.errors;
  },

  'картка раунду: реєстрацію відкрито — «Зареєструватися» веде одразу у форму': async (b) => {
    const t = await page(b, MOB, 'season');
    assert(await visible(t.p, '.hc--cur [data-reg="2"]'), 'на картці немає «Зареєструватися»');
    assert(await visible(t.p, '.hc--cur .hc-go--sec'), 'на картці немає другорядної «Детальніше»');
    await shot(t.p, 'mob-home-reg');
    await t.p.click('.hc--cur [data-reg="2"]'); await t.p.waitForTimeout(700);
    assert(await t.p.evaluate(() => document.documentElement.classList.contains('view-reg')), '«Зареєструватися» не відкрила форму');
    await t.ctx.close(); return t.errors;
  },

  'раунд без даних: внизу «На головну» (телефон, Telegram)': async (b) => {
    const fx = JSON.parse(FIX('season'));
    fx.registration = false; fx.hash = 'empty-round';
    fx.sheets.forEach((sh) => { sh.values = sh.values.slice(0, sh.headerRows || 1); });
    const t = await page(b, MOB, null, { tg: true, body: JSON.stringify(fx) });
    await t.p.locator('[data-round="2"]').first().click();
    await t.p.waitForTimeout(900);
    assert(await visible(t.p, '#homeOpen'), 'у порожньому раунді немає кнопки «На головну»');
    await shot(t.p, 'mob-empty-round');
    await t.p.click('#homeOpen'); await t.p.waitForTimeout(700);
    assert(await visible(t.p, '#home'), '«На головну» не повернула на головну');
    assert(!(await visible(t.p, '#homeOpen')), 'на головній видно «На головну»');
    await t.ctx.close(); return t.errors;
  },

  'головна: картки сезону → архів R1 → «Усі раунди» → поточний раунд': async (b) => {
    for (const opts of [MOB, DESK]) {
      const t = await page(b, opts, 'season');
      const tag = opts === MOB ? 'mob' : 'desk';
      assert(await visible(t.p, '#home'), 'головна не відкрилась');
      assert(!(await visible(t.p, '#board')), 'на головній видно таблицю');
      assert((await t.p.locator('.hc--cur').count()) === 1 && (await t.p.locator('.hx').count()) === 1, 'не ті картки');
      assert(/Реєстрацію відкрито/.test(await t.p.textContent('.hc-chip')), 'немає «Реєстрацію відкрито»');
      assert((await visible(t.p, '#partnerHome')) === (opts === DESK) && (await visible(t.p, '#chatHome')) === (opts === DESK), 'FISH.ME.FISH і Telegram-чат — лише на головній на комп\'ютері');
      await shot(t.p, tag + '-home');
      await t.p.click('.hx'); await t.p.waitForTimeout(1200);
      assert((await t.p.textContent('#title')) === 'TM • Round 1', 'архів R1 не відкрився');
      assert(await t.p.locator('#heroPill').isHidden(), 'після фіналу плашки «завершено» не має бути');
      assert(await visible(t.p, '#heroBack'), 'немає «Усі раунди»');
      assert((await t.p.evaluate(() => { const i = document.querySelector('#tabs .seg-ind'); return i ? getComputedStyle(i).opacity : '0'; })) === '1', 'у перемикачі «Підсумок / По турах» нічого не виділено');
      await shot(t.p, tag + '-arch');
      await t.p.click('#heroBack'); await t.p.waitForTimeout(800);
      assert(await visible(t.p, '#home'), '«Усі раунди» не повернули на головну');
      // вдруге архів уже збережений — сторінка малюється одразу, перемикач має бути з виділенням
      await t.p.click('.hx'); await t.p.waitForTimeout(150);
      assert((await t.p.evaluate(() => { const i = document.querySelector('#tabs .seg-ind'); return i ? getComputedStyle(i).opacity : '0'; })) === '1', 'вдруге в перемикачі нічого не виділено');
      await t.p.click('#heroBack'); await t.p.waitForTimeout(800);
      await t.p.click('.hc-go'); await t.p.waitForTimeout(800);
      assert((await t.p.textContent('#title')) === 'TM • Round 2', 'поточний раунд не відкрився');
      assert((await t.p.locator('#board [data-key]').count()) > 5, 'немає списку учасників поточного раунду');
      await t.p.goBack(); await t.p.waitForTimeout(800);
      assert(await visible(t.p, '#home'), 'кнопка «Назад» браузера не повернула на головну');
      await t.ctx.close();
      if (t.errors.length) return t.errors;
    }
    return [];
  },

  'головна: посилання #r1 відкриває архів, без сезону — одразу таблиця': async (b) => {
    let t = await page(b, MOB, 'season', { hash: '#r1', wait: 2500 });
    assert((await t.p.textContent('#title')) === 'TM • Round 1', '#r1 не відкрив архів');
    await t.ctx.close();
    if (t.errors.length) return t.errors;
    t = await page(b, MOB, 'results');
    assert(!(await visible(t.p, '#home')) && (await t.p.locator('#board [data-key]').count()) > 5, 'без сезону мала бути таблиця');
    await t.ctx.close(); return t.errors;
  },

  'telegram: головна → архів → системна «Назад» і свайп від краю → головна': async (b) => {
    const t = await page(b, MOB, 'season-live', { tg: true });
    assert(await visible(t.p, '#home'), 'у Telegram головна не відкрилась');
    assert((await t.p.locator('#partner').count()) === 0, 'плаваючої кнопки партнера вже не має бути');
    await shot(t.p, 'tg-home');
    // «Кришка» з кутами під панеллю Telegram — лише коли аркуш доїхав до верху, а не одразу
    assert(!(await t.p.evaluate(() => document.documentElement.classList.contains('tg-stuck'))), 'на головній кути під панеллю одразу, без прокрутки');
    await t.p.evaluate(() => window.scrollTo(0, 400)); await t.p.waitForTimeout(200);
    assert(await t.p.evaluate(() => document.documentElement.classList.contains('tg-stuck')), 'після прокрутки аркуш не «прилип»');
    await t.p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await t.p.waitForTimeout(200);
    assert(await t.p.evaluate(() => { const r = document.querySelector('.home__inner').getBoundingClientRect(), c = document.documentElement.classList;
      return c.contains('tg-stuck') && (r.bottom > 24 || c.contains('tg-past')); }), 'біля чорного футера: має лишитись чорна смуга, але без «кришки»');
    await t.p.evaluate(() => window.scrollTo(0, 0)); await t.p.waitForTimeout(200);
    await t.p.click('.hx'); await t.p.waitForTimeout(1200);
    assert((await t.p.textContent('#title')) === 'TM • Round 1', 'архів не відкрився');
    await t.p.evaluate(() => { const h = window.__tgBack; if (h) h(); else history.back(); });
    await t.p.waitForTimeout(800);
    assert(await visible(t.p, '#home'), '«Назад» не повернула на головну');
    // Свайп від лівого краю: з раунду — на головну
    await t.p.click('.hc-go'); await t.p.waitForTimeout(800);
    assert(!(await visible(t.p, '#home')), 'раунд не відкрився');
    await t.p.evaluate(async () => {
      const ev = (type, x) => { const tt = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
        document.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [tt], changedTouches: [tt], bubbles: true, cancelable: true })); };
      ev('touchstart', 10);
      for (let x = 20; x <= 140; x += 20) { ev('touchmove', x); await new Promise((r) => setTimeout(r, 16)); }
      ev('touchend', 140);
    });
    await t.p.waitForTimeout(900);
    assert(await visible(t.p, '#home'), 'свайп назад не повернув з раунду на головну');
    await t.ctx.close(); return t.errors;
  },

  'раунд на 10 турів (Пульт): «10 / 10», переможець, без 11-го туру': async (b) => {
    for (const opts of [DESK, MOB]) {
      const t = await page(b, opts, 'tours10');
      const txt = await t.p.evaluate(() => document.body.innerText);
      assert(/10\s*\/\s*10/.test(txt), 'немає «10 / 10» турів');
      assert(/Переможець/.test(txt) || opts === MOB, 'немає «Переможець»');
      await shot(t.p, opts === DESK ? 'desk-tours10' : 'mob-tours10');
      await t.p.click('#tab-1'); await t.p.waitForTimeout(600);
      const cols = await t.p.locator('#board .tgrid .tr-head .t-c').count();
      assert(cols === 10, 'у «По турах» не 10 турів: ' + cols);
      await shot(t.p, opts === DESK ? 'desk-tours10-tab' : 'mob-tours10-tab');
      await t.ctx.close();
      if (t.errors.length) return t.errors;
    }
    return [];
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
    // D14 «Приховати» → payOn: false — кнопки немає ні на телефоні, ні плиткою в широкому Telegram
    const off = JSON.parse(FIX('list')); off.payOn = false; off.hash = 'pay-off';
    const o = await page(b, MOB, 'list', { tg: true, body: JSON.stringify(off) });
    assert(!(await visible(o.p, '#payBox')), 'payOn=false, а кнопка оплати видна'); await o.ctx.close();
    const ow = await page(b, DESK, 'list', { tg: true, body: JSON.stringify(off) });
    assert((await ow.p.locator('.hlink--pay').count()) === 0, 'payOn=false, а плитка оплати є в широкому Telegram'); await ow.ctx.close();
    return t.errors.concat(r.errors, d.errors, o.errors, ow.errors);
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
    assert(/send\.monobank\.ua\/jar\/R2test/.test(await t.p.getAttribute('#paySheet [data-pay="mono"]', 'href')), 'у попапі не банка раунду (payUrl з «Пульта»)');
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

  'list new/closed: «new» лише за добу; закрито — без вільних місць і «new»': async (b) => {
    const d = JSON.parse(FIX('list')), now = Date.now();
    d.seats = 28; d.registration = true; d.hash = 'new-1';
    d.regAt = { 'Гуменюк Петро': now - 5 * 3600e3, 'Журавель Сергій': now - 30 * 3600e3, 'Повар Олександр': now - 2 * 3600e3 };
    let t = await page(b, DESK, 'list', { body: JSON.stringify(d) });
    const news = await t.p.$$eval('#board .pt__new', (a) => a.map((x) => x.closest('li').querySelector('.pt__nm').textContent));
    assert(news.length === 2 && news.includes('Гуменюк Петро') && news.includes('Повар Олександр'), '«new» не за добою: ' + news);
    assert((await t.p.locator('#board .pt--free').count()) === 3, 'немає вільних місць у відкритій реєстрації');
    await t.ctx.close();
    d.registration = false; d.regDeadline = null; d.hash = 'new-2';
    const t2 = await page(b, DESK, 'list', { body: JSON.stringify(d) });
    assert((await t2.p.locator('#board .pt--free').count()) === 0, 'реєстрацію закрито, а вільні місця лишились');
    assert((await t2.p.locator('#board .pt__new').count()) === 0, 'реєстрацію закрито, а «new» лишились');
    await shot(t2.p, 'desk-list-closed');
    await t2.ctx.close(); return t.errors.concat(t2.errors);
  },

  'stale selection: виділений зі списку, якого немає в результатах, не ламає «Картку»': async (b) => {
    const ctx = await b.newContext(Object.assign({ locale: 'uk-UA' }, MOB));
    await ctx.addInitScript(() => { try { localStorage.setItem('tm:lang', 'uk'); localStorage.setItem('tm:selected', JSON.stringify(['Мельник Тарас'])); } catch (e) { /* */ } });
    await ctx.route('https://script.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIX('results') }));
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://localhost:' + PORT + '/'); await p.waitForTimeout(1800);
    await p.locator('#board .r[data-key]').nth(5).click(); await p.waitForTimeout(600);
    assert(await visible(p, '#cardOpen'), 'кнопки «Картка» немає після тапу');
    assert(!(await p.locator('#cardOpen').evaluate((e) => e.classList.contains('is-cmp'))), 'замість «Картка» — «Порівняти»');
    await ctx.close(); return errors;
  },

  'rules in results: у Telegram на телефоні плашка «Положення» є, а приховане на «Пульті» — немає': async (b) => {
    const fin = JSON.parse(FIX('results')); fin.rules = JSON.parse(FIX('rules')).rules; fin.hash = 'rr-fin';
    const fin2 = JSON.parse(JSON.stringify(fin)); fin2.rules = null; fin2.hash = 'rr-off';   // «Приховати» на «Пульті»
    const f = await page(b, MOB, 'results', { tg: true, body: JSON.stringify(fin2) });
    assert((await f.p.locator('#heroLinks .hlink').filter({ visible: true }).count()) === 0, 'приховане положення видно');
    await f.ctx.close();
    // турнір триває: тури 8+ ще не зіграно
    const d = JSON.parse(JSON.stringify(fin)); d.hash = 'rr';
    const tury = d.sheets.find((x) => /^тур/i.test(x.name)), cols = [];
    tury.values[0].forEach((h, c) => { const m = /^Тур (\d+)$/.exec(String(h).trim()); if (m && +m[1] > 7) cols.push(c); });
    tury.values.slice(2).forEach((row) => cols.forEach((c) => { row[c] = '-'; row[c + 1] = '0'; }));
    const t = await page(b, MOB, 'results', { tg: true, body: JSON.stringify(d) });
    assert((await t.p.locator('#heroLinks .hlink').filter({ visible: true }).count()) === 1, 'у результатах немає плашки «Положення»');
    await t.p.locator('#heroLinks .hlink').first().click(); await t.p.waitForTimeout(1000);
    assert(/Положення/.test(await t.p.textContent('#tstats')), 'екран «Положення» не відкрився');
    assert(/Результати/.test(await t.p.textContent('#tstats .hero-back')), '«Назад» не «Результати»');
    await t.ctx.close();
    const w = await page(b, MOB, 'results', { body: JSON.stringify(d) });   // браузер — без плашки
    assert((await w.p.locator('#heroLinks .hlink').filter({ visible: true }).count()) === 0, 'плашка «Положення» видна в браузері');
    await w.ctx.close(); return f.errors.concat(t.errors, w.errors);
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

  'perf: дані запитуються до стилів, головна не тягне зайвих картинок': async (b) => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(html.indexOf('window.__tmEarly = fetch') < html.indexOf('<link rel="stylesheet" href="assets/style.css'), 'ранній запит даних стоїть після CSS');
    assert(/rel="preload" href="assets\/fonts\/fixel-latin-var\.woff2"/.test(html), 'латинський шрифт (цифри) не вантажиться наперед');
    const ctxUrls = [];
    const t = await page(b, MOB, 'season');
    t.p.on('request', (q) => ctxUrls.push(q.url()));
    await t.p.waitForTimeout(2500);   // раніше og.jpg підтягувався через 2,5 с
    const done = await t.p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
    const all = done.concat(ctxUrls).join('\n');
    assert((all.match(/fishmefish\.svg/g) || []).length <= 1, 'логотип партнера вантажиться кілька разів');
    assert(!/og\.jpg\?v=2/.test(all), 'картинка для «Поділитися» вантажиться на головній');
    assert(!/fish\.webp/.test(all), 'fish.webp вантажиться на головній');
    await t.ctx.close(); return t.errors;
  },

  'perf: опитування — під час туру кожні 15 с, список і завершений раунд раз на хвилину': async (b) => {
    // «Наживо»: tours10 без результатів 10-го туру
    const live = JSON.parse(FIX('tours10'));
    const ts = live.sheets.find((x) => x.name === 'Тури');
    ts.values.slice(ts.headerRows).forEach((r) => { r[20] = ''; r[21] = ''; });
    live.hash = 'live-9-of-10';
    const errs = [];
    async function polls(fx, body, sec) {
      const t = await page(b, DESK, fx, { clock: true, body: body });
      const g0 = t.gets();
      await t.p.clock.fastForward(sec * 1000); await t.p.waitForTimeout(400);
      const n = t.gets() - g0;
      errs.push.apply(errs, t.errors); await t.ctx.close();
      return n;
    }
    assert(await polls('results', JSON.stringify(live), 16) >= 1, 'під час туру немає запиту за 16 с');
    assert(await polls('list', null, 30) === 0, 'список учасників опитується частіше, ніж раз на хвилину');
    assert(await polls('list', null, 61) >= 1, 'список учасників не опитується взагалі');
    assert(await polls('tours10', null, 30) === 0, 'завершений раунд опитується частіше, ніж раз на хвилину');
    return errs;
  },

  'perf: банери головної — великий 1200 з пріоритетом, мініатюри 400; наступного разу банер вантажиться з <head>': async (b) => {
    const fx = JSON.parse(FIX('season-live'));
    fx.season.rounds[0].banner = 'https://drive.google.com/thumbnail?id=R1file&sz=w1200&v=111';
    fx.season.rounds[1].banner = 'https://drive.google.com/thumbnail?id=R2file&sz=w1200&v=222';
    const ctx = await b.newContext(Object.assign({ locale: 'uk-UA' }, MOB));
    const lh3 = [];
    await ctx.route('https://lh3.googleusercontent.com/**', (r) => { lh3.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/webp', headers: { 'Cache-Control': 'max-age=3600' }, body: fs.readFileSync(path.join(ROOT, 'assets/reel.webp')) }); });
    await ctx.route('https://script.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx) }));
    await ctx.addInitScript(() => { try { localStorage.setItem('tm:lang', 'uk'); } catch (e) { /* */ } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await p.goto('http://localhost:' + PORT + '/'); await p.waitForTimeout(2000);
    const BIG = 'https://lh3.googleusercontent.com/d/R2file=w1200?v=222&b=2', TH = 'https://lh3.googleusercontent.com/d/R1file=w400?v=111&b=2';
    const imgs = await p.evaluate(() => Array.from(document.querySelectorAll('.hc-ban img, .hx-th img')).map((i) => [i.parentNode.className.split(' ')[0], i.getAttribute('src'), i.getAttribute('fetchpriority')]));
    assert(imgs.some((x) => x[0] === 'hc-ban' && x[1] === BIG && x[2] === 'high'), 'великий банер не 1200/high: ' + JSON.stringify(imgs));
    assert(imgs.some((x) => x[0] === 'hx-th' && x[1] === TH && x[2] === 'low'), 'мініатюра не 400/low: ' + JSON.stringify(imgs));
    assert(!lh3.some((u) => /R1file=w1200/.test(u)), 'мініатюра тягне велику картинку');
    assert((await p.evaluate(() => localStorage.getItem('tm:hero'))) === JSON.stringify(BIG), 'адресу банера не збережено');
    // Повторний візит: банер у <link rel="preload"> ще до app.js, і вантажиться один раз
    const before = lh3.length;
    await p.goto('http://localhost:' + PORT + '/'); await p.waitForTimeout(2000);
    const pre = await p.evaluate(() => Array.from(document.querySelectorAll('link[rel="preload"][as="image"]')).map((l) => l.href + '|' + l.getAttribute('fetchpriority')));
    assert(pre.includes(BIG + '|high'), 'немає preload банера: ' + JSON.stringify(pre));
    assert(lh3.slice(before).filter((u) => u === BIG).length <= 1, 'банер вантажиться двічі');
    assert(await p.evaluate(() => typeof window.l === 'undefined' && (!window.hero || window.hero instanceof Element)), 'змінні з <head> потрапили в window');
    // На /leaderboard банера немає — і preload теж
    await p.goto('http://localhost:' + PORT + '/leaderboard'); await p.waitForTimeout(1500);
    assert(!(await p.evaluate(() => document.querySelector('link[rel="preload"][as="image"][href*="lh3"]'))), 'preload банера на /leaderboard');
    await ctx.close(); return errors;
  },

  'telegram: апка в TG, партнер рахує клік («Партнери»)': async (b) => {
    const t = await page(b, MOB, 'season', { tg: true });
    await t.p.click('#tabbar [data-sec="partners"]'); await t.p.waitForTimeout(400);
    await t.p.click('.pt-card [data-partner]'); await t.p.waitForTimeout(500);
    assert(t.posts.some((x) => /"pclick"/.test(x)), 'клік партнера не надіслано');
    await t.ctx.close();
    const r = await page(b, MOB, 'results', { tg: true });
    await shot(r.p, 'tg-results');
    await r.ctx.close(); return t.errors.concat(r.errors);
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
