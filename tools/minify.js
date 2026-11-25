/*
 * Обережне стиснення для збірки (без залежностей). Нічого не перейменовує й не переписує:
 *   JS  — прибирає коментарі, відступи й порожні рядки. Переноси рядків лишаються (тож автокрапки з комою
 *         працюють як раніше), рядки й регулярні вирази не чіпаються.
 *   CSS — прибирає коментарі, зайві пробіли навколо { } ; та «;» перед «}».
 * Для перевірки: tests/minify-check.js порівнює стилі до/після в браузері (CSSOM) і синтаксис JS.
 */
'use strict';

// Після цих символів «/» — початок регулярного виразу, а не ділення
const RE_BEFORE = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const RE_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'instanceof', 'do', 'else', 'yield', 'await']);

function js(src) {
  let out = '', i = 0, n = src.length;
  let last = '', lastWord = '';           // останній значущий символ і слово перед ним — щоб відрізнити регулярку від ділення
  const word = /[A-Za-z0-9_$]/;
  function mark(s) {                       // запам'ятати останній значущий фрагмент коду
    const t = s.replace(/\s+$/, '');
    if (!t) return;
    last = t[t.length - 1];
    const m = /([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(t);
    lastWord = m ? m[1] : '';
  }
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      if (c === '`') throw new Error('minify: шаблонні рядки (`…`) не підтримуються — у коді їх немає; додайте підтримку, якщо знадобляться');
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') throw new Error('minify: незакритий рядок біля символу ' + i); j++; }
      out += src.slice(i, j + 1); mark(src.slice(i, j + 1)); i = j + 1; continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) throw new Error('minify: незакритий коментар біля символу ' + i);
      out += src.slice(i, e).indexOf('\n') >= 0 ? '\n' : ' ';
      i = e + 2; continue;
    }
    if (c === '/' && (last === '' || RE_BEFORE.has(last) || RE_WORDS.has(lastWord))) {
      let j = i + 1, cls = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') throw new Error('minify: незакритий регулярний вираз біля символу ' + i);
        if (cls) { if (ch === ']') cls = false; }
        else if (ch === '[') cls = true;
        else if (ch === '/') break;
        j++;
      }
      j++;
      while (j < n && word.test(src[j])) j++;   // прапорці g, i, …
      out += src.slice(i, j); last = 'x'; lastWord = ''; i = j; continue;
    }
    // звичайний код — до наступного «особливого» символу
    let j = i;
    while (j < n && '"\'`/'.indexOf(src[j]) < 0) j++;
    if (j === i) { out += c; mark(c); i++; continue; }
    const chunk = src.slice(i, j);
    out += chunk; mark(chunk); i = j;
  }
  return out.split('\n').map((l) => l.trim()).filter(Boolean).join('\n') + '\n';
}

function css(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) throw new Error('minify: незакритий коментар у CSS біля символу ' + i);
      out += ' '; i = e + 2; continue;
    }
    if (/\s/.test(c)) { let j = i; while (j < n && /\s/.test(src[j])) j++; out += ' '; i = j; continue; }
    out += c; i++;
  }
  // Пробіли навколо { } ; , — без значення. Рядки в лапках захищаємо, щоб їх не зачепити.
  const strs = [];
  out = out.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (s) => '\u0000' + (strs.push(s) - 1) + '\u0000');
  // Кому не чіпаємо: у значеннях зі змінними (var(), env()) браузер зберігає пробіл після неї як є
  out = out.replace(/\s*([{};])\s*/g, '$1').replace(/;}/g, '}').trim();
  out = out.replace(/}/g, '}\n');   // рядок на правило — щоб файл лишався читабельним у DevTools
  return out.replace(/\u0000(\d+)\u0000/g, (_, k) => strs[+k]) + '\n';
}

module.exports = { js, css };
