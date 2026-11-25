#!/usr/bin/env node
/*
 * Збирання сайту з модулів (без залежностей, лише Node):
 *   src/js/*.js   → assets/app.js   (усі модулі в одній IIFE, у порядку назв: 00-…, 10-…, …)
 *   src/css/*.css → assets/style.css (у порядку назв; пізніші правила перекривають ранні)
 *
 *   node tools/build.js          — зібрати
 *   node tools/build.js --check  — лише перевірити, що assets/ зібрані з поточних src/ (для тестів)
 *
 * Модулі JS — це шматки однієї функції: спільні змінні й функції видно з будь-якого модуля,
 * а оголошення функцій «піднімаються», тож порядок модулів важливий лише для коду, що виконується одразу.
 * GitHub Pages віддає вже зібрані assets/app.js і assets/style.css — після правок у src/ їх треба зібрати й закомітити.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

function read(dir, ext) {
  const d = path.join(ROOT, dir);
  return fs.readdirSync(d).filter((f) => f.endsWith(ext)).sort().map((f) => fs.readFileSync(path.join(d, f), 'utf8'));
}
const BANNER = (dir) => '/* Зібрано з ' + dir + ' командою node tools/build.js — правте модулі там, а не цей файл. */\n';
const JS_HEAD = BANNER('src/js') + "(function () {\n  'use strict';\n";
const JS_TAIL = '})();\n';
const out = {
  'assets/app.js': JS_HEAD + read('src/js', '.js').join('') + JS_TAIL,
  'assets/style.css': BANNER('src/css') + read('src/css', '.css').join('')
};

// Окремі адреси сторінок — копії index.html (у всіх <base href="/">, тож файли беруться з кореня;
// превʼю посилань — загальна картинка og.jpg, назва своя). Правити лише index.html.
//   розділи ліги: /leaderboard, /partners, /about
//   раунди: /r1 … /r4, у кожному /stats, /rules і картки /p1 … /p48
//   решта адрес (напр. /r5) — 404.html: той самий сайт, app.js сам відкриває потрібний екран
const ROUNDS = 4, PLAYERS = 48;
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOTE = '<!-- Зібрано з index.html командою node tools/build.js — правте index.html, а не цей файл. -->';
function copyOf(dir, title) {
  const t = title + ' — TROUT MASTER', url = 'https://troutmaster.app/' + dir;
  return INDEX
    .replace(/<head>/, '<head>\n  ' + NOTE)
    .replace(/<title>[^<]*<\/title>/, '<title>' + t + '</title>')
    .replace(/(<meta property="og:title" content=")[^"]*/, '$1' + t)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, '$1' + t)
    .replace(/(<meta property="og:url" content=")[^"]*/, '$1' + url)
    .replace(/(<link rel="canonical" href=")[^"]*/, '$1' + url);
}
const PAGES = { leaderboard: 'Лідерборд', partners: 'Партнери', about: 'Про лігу' };
for (let r = 1; r <= ROUNDS; r++) {
  const R = 'Раунд ' + r;
  PAGES['r' + r] = R;
  PAGES['r' + r + '/stats'] = 'Статистика · ' + R;
  PAGES['r' + r + '/rules'] = 'Правила · ' + R;
  for (let n = 1; n <= PLAYERS; n++) PAGES['r' + r + '/p' + n] = 'Учасник №' + n + ' · ' + R;
}
for (const [dir, title] of Object.entries(PAGES)) out[dir + '/index.html'] = copyOf(dir, title);
out['404.html'] = INDEX.replace(/<head>/, '<head>\n  ' + NOTE);
// Старі копії, яких уже немає в списку (напр. зменшили ROUNDS) — прибрати
const GEN = /^(leaderboard|partners|about|r\d+(\/(stats|rules|p\d+))?)\/index\.html$/;

const check = process.argv.includes('--check');
let stale = [], wrote = 0;
for (const [file, text] of Object.entries(out)) {
  const p = path.join(ROOT, file);
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur === text) continue;
  if (check) stale.push(file);
  else { wrote++; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); console.log('зібрано ' + file + ' (' + text.split('\n').length + ' рядків)'); }
}
(function prune(dir) {
  for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = (dir ? dir + '/' : '') + f.name;
    if (f.isDirectory() && /^(r\d+|stats|rules|p\d+|leaderboard|partners|about)$/.test(f.name)) prune(rel);
    else if (f.isFile() && GEN.test(rel) && !out[rel]) {
      if (check) stale.push(rel); else { fs.unlinkSync(path.join(ROOT, rel)); console.log('прибрано ' + rel); }
    }
  }
})('');
if (check && stale.length) {
  console.error('Не зібрано з src/: ' + stale.join(', ') + ' — запустіть node tools/build.js');
  process.exit(1);
}
if (!check && !wrote) console.log('assets/ уже актуальні');
