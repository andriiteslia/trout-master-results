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

const check = process.argv.includes('--check');
let stale = [];
for (const [file, text] of Object.entries(out)) {
  const p = path.join(ROOT, file);
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur === text) continue;
  if (check) stale.push(file);
  else { fs.writeFileSync(p, text); console.log('зібрано ' + file + ' (' + text.split('\n').length + ' рядків)'); }
}
if (check && stale.length) {
  console.error('Не зібрано з src/: ' + stale.join(', ') + ' — запустіть node tools/build.js');
  process.exit(1);
}
if (!check && !stale.length) console.log('assets/ уже актуальні');
