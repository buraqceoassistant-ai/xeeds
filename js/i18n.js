/* Сайт на двух языках: русский (как написан код) и узбекский (латиница, словарь — js/i18n-uz.js).
   Перевод — слоем поверх страницы: текст, подсказки и подписи переводятся, когда появляются
   или меняются (MutationObserver), поэтому код приложения пишет по-русски и ничего не знает о языке.
   Словарь: 'русская строка': 'узбекская'. В ключе можно ставить {n} (число), {d} (дата 27.09 или 27.09.2026),
   {t} (время 09:30), {w} (слово без пробелов), {s} (любой текст) — те же метки подставляются в перевод; русские
   {w} и {s} тоже переводятся. Строки без перевода целиком переводятся по частям: по предложениям, по « · », «: »,
   « — »; текст в несколько строк — ещё и построчно.
   Переводятся и атрибуты title, placeholder, aria-label, alt, data-label (подписи ячеек на телефоне).
   Не переводится: поля ввода, [translate="no"], [contenteditable]. Язык — кнопки [data-lang-set], выбор — в
   localStorage (buraq-lang). window.I18N: lang, set(l), t(строка), missing (строки без перевода — для проверки).
   Проверка словаря: localStorage buraq-i18n-audit = 1 — сайт остаётся русским, а каждая строка на экране и в окнах
   прогоняется через словарь, и строки без перевода копятся в I18N.missing (так гоняются браузерные тесты). */
(function () {
  'use strict';
  // data-label — подписи ячеек в карточках таблиц на телефоне (css/mobile.css: content: attr(data-label))
  var KEY = 'buraq-lang', CYR = /[А-Яа-яЁё]/, ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-label'];
  var ATTR_SEL = ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
  var lang = '';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { /* закрытый режим */ }
  if (lang !== 'uz' && lang !== 'ru') lang = /^uz\b/i.test(navigator.language || '') ? 'uz' : 'ru';
  var AUDIT = false;
  try { AUDIT = localStorage.getItem('buraq-i18n-audit') === '1'; } catch (e) { /* закрытый режим */ }

  // ── словарь: точные строки и шаблоны ──
  var PH = { n: '(\\d{4}-\\d\\d-\\d\\d(?:[ T]\\d\\d:\\d\\d)?|-?\\d[\\d\\s\\u00a0.,]*%?)', d: '(\\d{1,2}\\.\\d{1,2}(?:\\.\\d{2,4})?)', t: '(\\d{1,2}:\\d{2})', w: '(\\S+)', s: '(.+?)' };
  var exact = new Map(), shapes = new Map(), tpls = [], cache = new Map(), missing = new Set();
  // числа в строке («14,3», «1 325», «09:30», «27.09.2026», «2026-09-26») → {n}, {n2}, … — так «14,3 м³» и «0,5 м³»
  // находят одну строку словаря «{n} м³»
  var NUM = /\d{4}-\d\d-\d\d(?:[ T]\d\d:\d\d)?|\d(?:(?:[.,:]|[ \u00a0](?=\d{3}(?!\d)))?\d)*%?/g;   // разделитель — только между цифрами
  function ph(i) { return i ? '{n' + (i + 1) + '}' : '{n}'; }
  function shape(k) { var vals = []; var sh = k.replace(NUM, function (m) { return ph(vals.push(m) - 1); }); return { sh: sh, vals: vals }; }
  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function load(dict) {
    Object.keys(dict || {}).forEach(function (k) {
      var key = norm(k), v = dict[k];
      if (!/\{[ndtws]\d?\}/.test(key)) { exact.set(key, v); return; }
      // только числа, даты и время — в «форму» с {n}, {n2}, …; если в ключе есть и свои цифры («рейс 2») — шаблоном ниже
      if (!/\{[ws]\d?\}/.test(key) && !/\d/.test(key.replace(/\{[ndt]\d?\}/g, ''))) {
        var map = {}, i = 0, sk = key.replace(/\{[ndt]\d?\}/g, function (m) { return (map[m] = ph(i++)); });
        shapes.set(sk, v.replace(/\{[ndt]\d?\}/g, function (m) { return map[m] || m; }));
        return;
      }
      var names = [];
      var re = key.split(/(\{[ndtws]\d?\})/).map(function (p) {
        var m = p.match(/^\{([ndtws])\d?\}$/);
        if (m) { names.push(p); return PH[m[1]]; }
        return esc(p);
      }).join('');
      tpls.push({ re: new RegExp('^' + re + '$'), names: names, v: v });
    });
    // длинные шаблоны — раньше коротких: «Точек: {n} · {s}» не должен съесть более точный
    tpls.sort(function (a, b) { return b.re.source.length - a.re.source.length; });
    cache.clear();
  }
  function direct(k) {
    if (exact.has(k)) return exact.get(k);
    var f = shape(k);
    if (f.vals.length && shapes.has(f.sh)) {
      var o = shapes.get(f.sh);
      for (var j = f.vals.length - 1; j >= 0; j--) o = o.split(ph(j)).join(f.vals[j]);
      return o;
    }
    if (sentences(k).length > 1) return null;   // шаблон с {s} — только на одно предложение, иначе {s} захватит соседние
    for (var i = 0; i < tpls.length; i++) {
      var m = k.match(tpls[i].re);
      if (!m) continue;
      var out = tpls[i].v;
      tpls[i].names.forEach(function (nm, j) {
        var val = m[j + 1];
        if (nm.charAt(1) !== 'n' && nm.charAt(1) !== 'd' && nm.charAt(1) !== 't' && CYR.test(val)) { var tv = tr(val); if (tv != null) val = tv; }
        out = out.split(nm).join(val);
      });
      return out;
    }
    return null;
  }
  // по частям: предложения, « · », «; », «: », « — », «, »; перевод есть хотя бы у одной русской части
  // предложения: после «.!?…» (и закрывающей кавычки или скобки за ним) и пробела — заглавная, цифра или кавычка;
  // сокращения («отгр.», «тыс.») — не конец; «(GMT+05:00) Tashkent» — тоже не конец
  var ABBR = /(?:^|[\s(])(?:отгр|точ|тыс|стр|коорд|парт|маш|тел|реальн|подтв|откл|макс|посл|доп|напр|мин|сек|млн|шт)\.$/i;
  function sentences(k) {   // без lookbehind в RegExp — его нет в старых Safari на iPhone
    var out = [], re = /([.!?…]["»)]?)\s+(?=[«"\dA-ZА-ЯЁ])/g, last = 0, m;
    while ((m = re.exec(k))) {
      if (m[1].charAt(0) === '.' && ABBR.test(k.slice(Math.max(last, m.index - 12), m.index + 1))) continue;
      out.push(k.slice(last, m.index + m[1].length)); last = re.lastIndex;
    }
    out.push(k.slice(last));
    return out;
  }
  var SPLITS = [sentences, ' · ', '; ', ': ', ' — ', ', '];
  var JOIN = [' ', ' · ', '; ', ': ', ' — ', ', '];
  function parts(k, depth) {
    for (var i = depth; i < SPLITS.length; i++) {
      var ps = typeof SPLITS[i] === 'function' ? SPLITS[i](k) : k.split(SPLITS[i]);
      if (ps.length < 2) continue;
      var any = false, out = ps.map(function (p) {
        if (!CYR.test(p)) return p;
        var t = direct(p);
        if (t == null) t = parts(p, i + 1);
        if (t == null) { missing.add(p); return p; }
        any = true; return t;
      });
      if (any) return out.join(JOIN[i]);
    }
    return null;
  }
  function tr(s) {
    var k = norm(s);
    if (!k || !CYR.test(k)) return null;
    if (cache.has(k)) return cache.get(k);
    var r = direct(k);
    if (r == null) r = parts(k, 0);
    if (r == null) missing.add(k);
    cache.set(k, r);
    return r;
  }
  // текст в несколько строк (окна alert и confirm, списки через перевод строки): сначала построчно — так
  // сохраняются переносы; если построчно переводится не всё — берётся вариант, где меньше русских букв
  function cyr(s) { return (String(s).match(/[А-Яа-яЁё]/g) || []).length; }
  function trText(s) {
    if (!/\S[ \t]*\n\s*\S/.test(s)) return tr(s);
    var any = false, byLine = String(s).split('\n').map(function (l) {
      var x = CYR.test(l) ? tr(l) : null;
      if (x == null) return l;
      any = true; return l.match(/^\s*/)[0] + x + l.match(/\s*$/)[0];
    }).join('\n');
    if (any && !CYR.test(byLine)) return byLine;
    var r = tr(s);
    if (!any) return r;
    return r != null && cyr(r) < cyr(byLine) ? r : byLine;
  }
  function t(s) { if (s == null) return s; if (lang !== 'uz') { if (AUDIT) trText(String(s)); return s; } var r = trText(String(s)); return r == null ? s : r; }

  // ── страница ──
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  var origText = new WeakMap(), shownText = new WeakMap(), liveText = new Set();
  var origAttr = new WeakMap(), shownAttr = new WeakMap(), liveAttr = new Set();
  // x-dc — шаблон приложения до отрисовки (dc-runtime читает его один раз): переводим только отрисованное,
  // иначе узбекский «впечётся» в приложение и не вернётся к русскому
  function skipEl(el) { return !el || SKIP[el.nodeName] || (el.closest && el.closest('x-dc,noscript,[translate="no"],[contenteditable=""],[contenteditable="true"]')); }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || shownText.get(n) === v || !CYR.test(v) || skipEl(n.parentNode)) return;
    var r = trText(v);
    if (r == null || lang !== 'uz') return;
    var nv = v.match(/^\s*/)[0] + r + v.match(/\s*$/)[0];
    origText.set(n, v); shownText.set(n, nv); liveText.add(n);
    if (++added % 2000 === 0) prune();
    n.nodeValue = nv;
  }
  // узлы, которые приложение уже убрало со страницы, — не держим в памяти
  var added = 0;
  function prune() {
    liveText.forEach(function (n) { if (!n.isConnected) liveText.delete(n); });
    liveAttr.forEach(function (el) { if (!el.isConnected) liveAttr.delete(el); });
  }
  function doAttr(el, a) {
    var v = el.getAttribute(a), sh = shownAttr.get(el);
    if (!v || (sh && sh[a] === v) || !CYR.test(v) || skipEl(el)) return;
    var r = trText(v);
    if (r == null || lang !== 'uz') return;
    var o = origAttr.get(el) || {}; o[a] = v; origAttr.set(el, o);
    sh = sh || {}; sh[a] = r; shownAttr.set(el, sh); liveAttr.add(el);
    el.setAttribute(a, r);
  }
  // noMarks — из наблюдателя: кнопки языка отмечаются один раз на пачку изменений, а не на каждый новый узел
  function walk(root, noMarks) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) doText(n);
    if (root.nodeType === 1) ATTRS.forEach(function (a) { if (root.hasAttribute(a)) doAttr(root, a); });
    if (root.querySelectorAll) root.querySelectorAll(ATTR_SEL).forEach(function (el) { ATTRS.forEach(function (a) { if (el.hasAttribute(a)) doAttr(el, a); }); });
    if (!noMarks) marks(root);
  }
  function restore() {
    liveText.forEach(function (n) { if (shownText.get(n) === n.nodeValue) n.nodeValue = origText.get(n); shownText.delete(n); });
    liveText.clear();
    liveAttr.forEach(function (el) {
      var o = origAttr.get(el) || {}, sh = shownAttr.get(el) || {};
      Object.keys(o).forEach(function (a) { if (el.getAttribute(a) === sh[a]) el.setAttribute(a, o[a]); });
      shownAttr.delete(el);
    });
    liveAttr.clear();
  }
  // кнопки языка: нажатая — aria-pressed="true"
  function marks(root) {
    var list = root && root.querySelectorAll ? root.querySelectorAll('[data-lang-set]') : [];
    Array.prototype.forEach.call(list, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-set') === lang)); });
  }
  // Кнопки языка отмечаются один раз на пачку изменений: раньше — на каждый добавленный узел поиском по его родителю,
  // и таблица на 800 строк (каждая строка — узел в том же родителе) перерисовывалась секундами (рост квадратичный)
  var mo = new MutationObserver(function (list) {
    var grew = false;
    if (lang !== 'uz' && !AUDIT) {
      for (var i = 0; i < list.length && !grew; i++) if (list[i].type === 'childList') for (var j = 0; j < list[i].addedNodes.length; j++) if (list[i].addedNodes[j].nodeType === 1) { grew = true; break; }
      if (grew) marks(document);
      return;
    }
    list.forEach(function (m) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
      else m.addedNodes.forEach(function (x) { if (x.nodeType === 1) grew = true; walk(x, true); });
    });
    if (grew) marks(document);
  });
  // мелкие правки старых записей (например, «данные пользователя») не переводятся: только видимые строки сайта
  // словарь по-русски не загружен (index.html) — при переходе на узбекский загрузить и потом перевести
  var dictReady = !!window.I18N_UZ;
  function withDict(cb) {
    if (dictReady || window.I18N_UZ) { if (!dictReady) { load(window.I18N_UZ); dictReady = true; } cb(); return; }
    var sc = document.createElement('script');
    sc.src = 'js/i18n-uz.js';
    sc.onload = function () { load(window.I18N_UZ); dictReady = true; cb(); };
    sc.onerror = function () { cb(); };
    document.head.appendChild(sc);
  }
  function set(l) {
    if (l !== 'uz' && l !== 'ru') return;
    if (l === 'uz' && !dictReady && !window.I18N_UZ) { withDict(function () { set(l); }); return; }
    if (!dictReady && window.I18N_UZ) { load(window.I18N_UZ); dictReady = true; }
    var was = lang; lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* закрытый режим */ }
    document.documentElement.setAttribute('lang', l);
    if (l === 'uz') walk(document.documentElement);
    else if (was === 'uz') restore();
    marks(document);
    (window.I18N.onChange || []).forEach(function (f) { try { f(l); } catch (e) { console.error(e); } });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang-set]');
    if (b) { e.preventDefault(); set(b.getAttribute('data-lang-set')); }
  }, true);

  // окна alert / confirm / prompt — тоже на выбранном языке
  ['alert', 'confirm', 'prompt'].forEach(function (f) {
    var o = window[f];
    if (typeof o !== 'function') return;
    window[f] = function (msg, def) { return arguments.length > 1 ? o.call(window, t(msg), def) : o.call(window, t(msg)); };
  });

  window.I18N = { get lang() { return lang; }, set: set, t: t, missing: missing, load: load, onChange: [] };
  if (window.I18N_UZ) load(window.I18N_UZ);
  document.documentElement.setAttribute('lang', lang);
  mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // отчёты в Excel (LogiEngine.xlsx) — на языке сайта: листы, заголовки и подписи; файл данных журнала не трогаем
  function wrapXlsx() {
    var E = window.LogiEngine;
    if (!E || typeof E.xlsx !== 'function' || E.xlsx.i18n) return;
    var o = E.xlsx;
    E.xlsx = function (sheets) {
      if (lang === 'uz' && Array.isArray(sheets)) sheets = sheets.map(function (sh) {
        return Object.assign({}, sh, { name: t(sh.name), rows: (sh.rows || []).map(function (r) { return (r || []).map(function (c) { return typeof c === 'string' ? t(c) : c; }); }) });
      });
      return o.apply(this, [sheets].concat(Array.prototype.slice.call(arguments, 1)));
    };
    E.xlsx.i18n = true;
  }
  function first() { if (lang === 'uz' || AUDIT) walk(document.documentElement); marks(document); wrapXlsx(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first); else first();
})();
