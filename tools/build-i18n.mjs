// Словарь сайта: tools/i18n/uz.txt («русский<TAB>узбекский») → js/i18n-uz.js (window.I18N_UZ для js/i18n.js).
// Проверяет: у строки есть перевод, в переводе нет кириллицы, одна и та же строка не переведена по-разному,
// метки {n} {d} {t} {w} {s} в переводе те же, что в ключе. Запуск: node tools/build-i18n.mjs
// Варианты: [рейс|рейса|рейсов] или [| на {n2} маш.] в ключе — строка раскрывается во все сочетания. Перевод без
// групп […] — один на все сочетания; иначе в нём столько же групп в том же порядке: [reys] — одна на все варианты
// группы, [|, {n2} ta mashinada] — по вариантам.
import { readFileSync, writeFileSync } from 'node:fs';

const src = new URL('./i18n/uz.txt', import.meta.url), out = new URL('../js/i18n-uz.js', import.meta.url);
const dict = {}, errors = [], CYR = /[А-Яа-яЁё]/;
const marks = s => (s.match(/\{[ndtws]\d?\}/g) || []).sort().join(' ');
const KG = /\[([^[\]]*\|[^[\]]*)\]/, VG = /\[([^[\]]*)\]/;
function expand(k, v, paired) {
  const km = k.match(KG);
  if (!km) { if (paired && VG.test(v)) throw new Error('в переводе групп […] больше, чем в ключе'); return [[k, v]]; }
  if (paired === undefined) paired = VG.test(v);
  if (!paired) return k.match(KG)[1].split('|').flatMap(a => expand(k.replace(km[0], a), v, false));
  const vm = v.match(VG);
  if (!vm) throw new Error('в ключе групп […|…] больше, чем в переводе');
  const ka = km[1].split('|'), va = vm[1].split('|');
  if (va.length !== 1 && va.length !== ka.length) throw new Error('в группе ключа ' + ka.length + ' вариантов, а в переводе ' + va.length);
  return ka.flatMap((a, i) => expand(k.replace(km[0], a), v.replace(vm[0], va.length === 1 ? va[0] : va[i]), true));
}
readFileSync(src, 'utf8').split('\n').forEach((line, i) => {
  if (!line.trim() || line.startsWith('#')) return;
  const p = line.split('\t');
  const at = 'строка ' + (i + 1) + ': ';
  if (p.length !== 2 || !p[0].trim() || !p[1].trim()) return errors.push(at + 'нужно «русский<TAB>узбекский»: ' + line.slice(0, 80));
  let pairs;
  try { pairs = expand(p[0].replace(/\s+/g, ' ').trim(), p[1].trim()); } catch (e) { return errors.push(at + e.message + ': ' + line.slice(0, 120)); }
  pairs.forEach(([k0, v0]) => {
    const k = k0.replace(/\s+/g, ' ').trim(), v = v0.replace(/ {2,}/g, ' ').trim();
    if (!CYR.test(k)) errors.push(at + 'в ключе нет русских букв: ' + k);
    if (CYR.test(v)) errors.push(at + 'в переводе кириллица: ' + v);
    if (marks(k) !== marks(v)) errors.push(at + 'метки в переводе не те, что в ключе: ' + k + ' → ' + v);
    if (k in dict && dict[k] !== v) errors.push(at + 'переведено по-разному: ' + k + ' → «' + dict[k] + '» / «' + v + '»');
    dict[k] = v;
  });
});
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
writeFileSync(out, '/* Сгенерировано из tools/i18n/uz.txt (node tools/build-i18n.mjs) — правьте словарь там. */\nwindow.I18N_UZ = ' + JSON.stringify(dict, null, 0).replace(/","/g, '",\n"') + ';\n');
console.log('js/i18n-uz.js ← tools/i18n/uz.txt, строк: ' + Object.keys(dict).length);
