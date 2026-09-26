/* Импорт манифестов без ИИ: строки берутся кодом прямо из документа — бесплатно и без ключа API.
   Ответ — в том же виде, что у ИИ ({ meta, rows, notes }), дальше всё как обычно: черновик, проверки, подтверждение.
   - Excel: на каждом листе строка заголовков (маркировка + м³ или кг, см. headerIn в import-checks.js), строки ниже —
     до итога (TOTAL, 合计…); подытоги пропускаются; маркировка объединённой ячейки — в каждой строке, число объединённой
     ячейки — только в первой (иначе посчиталось бы дважды); строка без чисел (или с нулями) — не груз.
   - PDF с текстом: строка заголовков по словам на странице, столбцы — по положению заголовков; каждое слово строки
     относится к ближайшему столбцу. Строка без маркировки продолжает маркировку сверху (объединённая ячейка).
     Скан (страница без текста) без ИИ не прочитать — это в заметках.
   Дата и маршрут — из шапки документа, если найдутся; дату можно поправить на экране проверки. */
(function (root) {
  'use strict';
  const L = root.LogiImport || (typeof require === 'function' ? Object.assign({}, require('./import-core.js'), require('./import-checks.js')) : null);
  const FIELDS = ['places', 'cbm', 'kg'];

  // дата манифеста: ячейка-дата (readGrid отдаёт YYYY-MM-DD) или текст 2026-09-20 / 2026.9.20 / 2026年9月20日 / 20.09.2026
  function dateIn(v) {
    const s = String(v == null ? '' : v), ok = (y, m, d) => y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null;
    let m = s.match(/(20\d\d)\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})/); if (m) return ok(+m[1], +m[2], +m[3]);
    m = s.match(/(^|\D)(\d{1,2})[./-](\d{1,2})[./-](20\d\d)(\D|$)/); if (m) return ok(+m[4], +m[3], +m[2]);
    return null;
  }
  // маршрут: «… TO TASHKENT …»; консолидатор — последнее слово после « - » (HORGOS TO TASHKENT - YIWU YARGXOL → YARGXOL)
  function routeIn(v) {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!/TASHKENT|ТАШКЕНТ|TOSHKENT/i.test(s) || s.length > 120) return null;
    const tail = s.split(/\s[-–—]\s/).slice(1).join(' ').trim();
    return { route: s, consolidator: tail ? tail.split(' ').pop() : null };
  }
  function metaFrom(values, meta) {
    for (const v of values) {
      if (!meta.date) meta.date = dateIn(v);
      if (!meta.route) { const r = routeIn(v); if (r) Object.assign(meta, r); }
    }
  }

  // ───────── Excel ─────────
  function excel(book) {
    const out = { meta: { date: null, route: null, consolidator: null, header: null, total: null }, rows: [], notes: [] };
    const { rowNums, cellOf, ownCell, rowLine, headerIn, num, TOTAL_RE, SUBTOTAL_RE } = L;
    book.forEach(sh => {
      const rs = rowNums(sh); let h = null;
      for (const r of rs) { h = headerIn(sh, r); if (h) break; }
      if (!h) return;
      if (!out.meta.header) out.meta.header = { sheet: h.sheet, row: h.row, mark: h.mark, places: h.places, cbm: h.cbm, kg: h.kg };
      metaFrom(rs.filter(r => r < h.row).flatMap(r => Object.values(sh.rows[r])), out.meta);
      let n0 = 0;
      for (const n of rs.filter(r => r > h.row)) {
        const texts = Object.values(sh.rows[n]).filter(v => typeof v === 'string').join(' ');
        if (SUBTOTAL_RE.test(texts)) continue;
        if (TOTAL_RE.test(texts)) {
          if (!out.meta.total) out.meta.total = { places: h.places ? num(cellOf(sh, n, h.places)) : null, cbm: h.cbm ? num(cellOf(sh, n, h.cbm)) : null, kg: h.kg ? num(cellOf(sh, n, h.kg)) : null, sheet: sh.name, row: n, page: null };
          break;
        }
        const v = Object.fromEntries(FIELDS.map(f => [f, h[f] ? num(ownCell(sh, n, h[f])) : null]));
        if (!FIELDS.some(f => v[f] != null && v[f] !== 0)) continue;
        let mark = cellOf(sh, n, h.mark), note = null;
        if (mark == null || !String(mark).trim()) { const up = L.markAbove(sh, n, h); if (up) { mark = up; note = 'Маркировка взята из строки выше'; } }
        out.rows.push({ mark: mark == null ? null : String(mark).replace(/\s+/g, ' ').trim(), ...v, sheet: sh.name, row: n, page: null, text: rowLine(sh, n).replace(/^R\d+ \| /, ''), note });
        n0++;
      }
      if (book.length > 1) out.notes.push('Лист «' + sh.name + '»: строк груза ' + n0);
    });
    if (!out.meta.header) out.notes.push('Не найдена строка заголовков таблицы (маркировка и м³ или кг) — строки не прочитаны. Добавьте их вручную или разберите через ИИ.');
    if (out.meta.header && !out.meta.total) out.notes.push('Итоговая строка (TOTAL) не найдена — сумма не сверена.');
    return out;
  }

  // ───────── PDF (текст страниц из LogiPdf.pageTexts: строки со словами и их положением) ─────────
  // Два вида PDF: таблица по ячейкам (каждая ячейка — отдельный кусок текста) — столбец слова по положению заголовков;
  // строка одним куском («BL-901   12   1.234   250.5») — маркировка в начале, числа в конце строки по порядку столбцов.
  // слова куска текста с примерным положением (доля ширины по символам)
  const words = line => (line.items || []).flatMap(it => {
    const s = String(it.s || ''), n = s.length || 1, out = [], re = /\S+/g; let m;
    while ((m = re.exec(s))) out.push({ s: m[0], x: it.x + it.w * m.index / n, w: it.w * m[0].length / n });
    return out;
  });
  // заголовок: слово или два соседних слова; столбец — середина заголовка
  function pdfHeader(line) {
    const { headRank } = L, its = words(line), cand = [];
    its.forEach((it, i) => {
      cand.push({ s: it.s, x1: it.x, x2: it.x + it.w });
      if (its[i + 1]) cand.push({ s: it.s + ' ' + its[i + 1].s, x1: it.x, x2: its[i + 1].x + its[i + 1].w });
    });
    const cols = {};
    ['mark', 'places', 'cbm', 'kg'].forEach(f => {
      let best = null;
      cand.forEach(c => { const k = headRank(f, c.s); if (k >= 0 && !Object.values(cols).some(o => c.x1 < o.x2 && o.x1 < c.x2) && (!best || k < best.k || (k === best.k && c.s.length < best.c.s.length))) best = { k, c }; });
      if (best) cols[f] = best.c;
    });
    if (!cols.mark || !(cols.cbm || cols.kg)) return null;
    // все слова строки заголовков — границы столбцов (в том числе «лишних»: описание, № и т. п.)
    const anchors = its.map(it => ({ x: it.x + it.w / 2, f: null }));
    Object.entries(cols).forEach(([f, c]) => { const x = (c.x1 + c.x2) / 2; anchors.forEach(a => { if (a.x >= c.x1 - 0.5 && a.x <= c.x2 + 0.5) a.f = f; }); anchors.push({ x, f }); });
    anchors.sort((a, b) => a.x - b.x);
    const order = FIELDS.filter(f => cols[f]).sort((a, b) => cols[a].x1 - cols[b].x1);
    // между маркировкой и первым числом есть другие столбцы (описание) — в строке одним куском маркировка = первое слово
    const between = its.some(w => w.x > cols.mark.x2 && w.x < cols[order[0]].x1);
    return { anchors, order, between, cells: (line.items || []).length >= 3 };
  }
  const nearest = (anchors, x) => anchors.reduce((b, a) => Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b, anchors[0]);
  const isNum = t => /\d/.test(t) && /^-?[\d.,]+$/.test(t);
  function cellsOf(line, hdr) {
    const cells = { mark: [], places: [], cbm: [], kg: [] };
    if (hdr.cells && (line.items || []).length >= 3) {
      words(line).forEach(it => { const a = nearest(hdr.anchors, it.x + it.w / 2); if (a.f) cells[a.f].push(it.s); });
      return cells;
    }
    const toks = String(line.text || '').split(/\s+/).filter(Boolean), nums = [];
    let k = toks.length;
    while (k > 0 && isNum(toks[k - 1])) nums.unshift(toks[--k]);
    let head = toks.slice(0, k);
    if (head.length > 1 && /^\d+[.)]?$/.test(head[0])) head = head.slice(1);          // № строки
    cells.mark = hdr.between ? head.slice(0, 1) : head;
    const take = nums.slice(-hdr.order.length);
    hdr.order.slice(hdr.order.length - take.length).forEach((f, i) => cells[f].push(take[i]));
    return cells;
  }
  // число из слов столбца: «1,320» у мест и кг — тысячи (1320), у м³ — десятичная запятая (1,234 м³ = 1.234)
  const numOf = (parts, f) => {
    let t = parts.join('').replace(/[^\d.,-]/g, ''); if (!t) return null;
    if (f !== 'cbm' && /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    return L.num(t);
  };
  function pdf(pages) {
    const out = { meta: { date: null, route: null, consolidator: null, header: null, total: null }, rows: [], notes: [] };
    const { TOTAL_RE, SUBTOTAL_RE } = L, scans = [];
    let hdr = null, lastMark = null;
    pages.forEach(pg => {
      if (!String(pg.text || '').trim()) { scans.push(pg.page); return; }
      let inTable = !!hdr, done = false;
      (pg.lines || []).forEach(line => {
        if (done) return;
        const h = pdfHeader(line);
        if (h) { hdr = h; inTable = true; return; }
        if (!inTable) { metaFrom([line.text], out.meta); return; }
        if (SUBTOTAL_RE.test(line.text)) return;
        const c = cellsOf(line, hdr), v = Object.fromEntries(FIELDS.map(f => [f, c[f].length ? numOf(c[f], f) : null]));
        if (TOTAL_RE.test(line.text)) { out.meta.total = { ...v, sheet: null, row: null, page: pg.page }; done = true; return; }
        if (!FIELDS.some(f => v[f] != null && v[f] !== 0)) return;
        let mark = c.mark.join(' ').replace(/\s+/g, ' ').trim(), note = null;
        if (!mark && lastMark) { mark = lastMark; note = 'Маркировка взята из строки выше'; }
        if (mark) lastMark = mark;
        out.rows.push({ mark: mark || null, ...v, sheet: null, row: null, page: pg.page, text: line.text, note });
      });
      if (done) hdr = null;
    });
    if (scans.length) out.notes.push('Страниц без текста (скан): ' + scans.join(', ') + ' — без ИИ их не прочитать. Добавьте строки вручную или разберите через ИИ.');
    if (!out.rows.length && scans.length < pages.length) out.notes.push('Не найдена строка заголовков таблицы (маркировка и м³ или кг) — строки не прочитаны.');
    return out;
  }

  // doc: { kind: 'xlsx', book } | { kind: 'pdf', texts: [{ page, text, lines: [{ text, items: [{ s, x, w }] }] }] }
  function localExtract(doc) { return doc.kind === 'xlsx' ? excel(doc.book) : pdf(doc.texts || []); }

  const API = { localExtract, dateIn, routeIn };
  root.LogiImport = Object.assign(root.LogiImport || {}, API);
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
