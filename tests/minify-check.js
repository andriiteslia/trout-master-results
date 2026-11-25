#!/usr/bin/env node
/*
 * Перевірка стиснення (tools/minify.js) — що воно нічого не змінило по суті:
 *   JS  — кожен рядок результату дослівно є в модулі (лише без коментарів і відступів), а викинуто
 *         тільки коментарі й порожні рядки; зібраний assets/app.js синтаксично правильний.
 *   CSS — браузер розбирає модулі до і після стиснення в однакові правила (CSSOM, разом з @media/@supports).
 *
 *   node tests/minify-check.js   (також запускається з tests/smoke.js)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const MIN = require(path.join(ROOT, 'tools/minify.js'));
const mods = (dir, ext) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)).sort()
  .map((f) => ({ name: dir + '/' + f, src: fs.readFileSync(path.join(ROOT, dir, f), 'utf8') }));

function checkJsModule(name, src) {
  const norm = (s) => s.replace(/\/\*[^\n]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
  const L = src.split('\n').map(norm);
  const out = MIN.js(src).split('\n').filter(Boolean);
  const errs = [];
  let k = 0, inBlock = false;
  const commentish = (s) => {
    if (inBlock) { if (s.includes('*/')) inBlock = false; return true; }
    if (!s || s.startsWith('//')) return true;
    if (s.startsWith('/*')) { if (!s.includes('*/')) inBlock = true; return true; }
    return false;
  };
  for (const raw of out) {
    const l = norm(raw);
    let j = k;
    while (j < L.length && !L[j].startsWith(l)) { if (!commentish(L[j])) errs.push(name + ':' + (j + 1) + ' викинуто код: ' + L[j]); j++; }
    if (j >= L.length) { errs.push(name + ': рядка немає в модулі: ' + raw); break; }
    const rest = L[j].slice(l.length).trim();
    if (rest && !rest.startsWith('//')) errs.push(name + ':' + (j + 1) + ' обрізано код: ' + rest);
    inBlock = false; k = j + 1;
  }
  for (; k < L.length; k++) if (!commentish(L[k])) errs.push(name + ':' + (k + 1) + ' викинуто код у кінці: ' + L[k]);
  if (MIN.js(MIN.js(src)) !== MIN.js(src)) errs.push(name + ': повторне стиснення дає інше');
  return errs;
}

async function checkCss(browser) {
  const raw = mods('src/css', '.css').map((m) => m.src).join('\n');
  const min = mods('src/css', '.css').map((m) => MIN.css(m.src)).join('\n');
  const p = await browser.newPage();
  const dump = (css) => p.evaluate((css) => {
    const s = new CSSStyleSheet(); s.replaceSync(css);
    const walk = (rules) => Array.from(rules).map((r) => r.cssRules && !(r instanceof CSSStyleRule) ? { head: r.cssText.slice(0, r.cssText.indexOf('{')).trim(), kids: walk(r.cssRules) } : r.cssText);
    return JSON.stringify(walk(s.cssRules));
  }, css);
  const a = await dump(raw), b = await dump(min);
  await p.close();
  if (a === b) return [];
  const A = JSON.parse(a), B = JSON.parse(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) return ['CSS: правило №' + (i + 1) + ' відрізняється:\n    було  ' + JSON.stringify(A[i]).slice(0, 300) + '\n    стало ' + JSON.stringify(B[i]).slice(0, 300)];
  }
  return ['CSS: правила відрізняються'];
}

async function run(browser) {
  let errs = [];
  for (const m of mods('src/js', '.js')) errs = errs.concat(checkJsModule(m.name, m.src));
  try { new vm.Script(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8')); } catch (e) { errs.push('assets/app.js: синтаксична помилка: ' + e.message); }
  errs = errs.concat(await checkCss(browser));
  return errs;
}
module.exports = run;

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const b = await chromium.launch();
    const errs = await run(b);
    await b.close();
    if (errs.length) { console.log('✗ ' + errs.join('\n✗ ')); process.exit(1); }
    console.log('✓ стиснення нічого не змінило (JS і CSS)');
  })();
}
