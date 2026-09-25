// Имитация ответов ИИ для тестов: читает текст части Excel («R7 | A: … | B: …») и отвечает строками, как это сделал бы Claude.
export function readExcelPart(text) {
  const lines = text.split('\n'), rows = [], meta = { date: null, route: null, consolidator: null, header: null, total: null };
  let inCtx = false, range = null;
  const m = text.match(/только из R(\d+)–R(\d+)/); if (m) range = [+m[1], +m[2]];
  const sheet = (text.match(/Лист \d+ «([^»]+)»/) || [])[1] || 'Manifest';
  for (const l of lines) {
    if (/^\[контекст/.test(l)) { inCtx = true; continue; }
    if (/^\[часть листа/.test(l)) { inCtx = false; continue; }
    const r = l.match(/^R(\d+) \| (.*)$/); if (!r) continue;
    const n = +r[1], cells = Object.fromEntries(r[2].split(' | ').map(c => { const i = c.indexOf(': '); return [c.slice(0, i), c.slice(i + 2).replace(/ ↑$/, '')]; }));
    if (cells.A === 'DATE') meta.date = cells.B;
    else if (cells.A === 'ROUTE') { meta.route = cells.B; meta.consolidator = cells.B.split(' ').pop(); }
    else if (cells.A === 'SHIPPING MARK') meta.header = { sheet, row: n, mark: 'A', places: 'B', cbm: 'C', kg: 'D' };
    else if (cells.A === 'TOTAL') meta.total = { places: +cells.B, cbm: +cells.C, kg: +cells.D, sheet, row: n, page: null };
    else if (cells.B != null && !inCtx && (!range || (n >= range[0] && n <= range[1])))
      rows.push({ mark: cells.A ?? null, places: +cells.B, cbm: +cells.C, kg: +cells.D, sheet, row: n, page: null, text: r[2], note: null });
  }
  return { meta, rows, notes: [] };
}
// ai(req): { ok, result, usage, ms, model, mode }; hooks — подменить ответ для части
export function fakeAi({ hooks = {}, matches = {}, log = [] } = {}) {
  return async req => {
    log.push(req);
    const text = req.content.map(c => c.text || '').join('\n');
    const base = { ok: true, ms: 1500, model: 'claude-sonnet-5', mode: 'tool', usage: { in: 1000, cache: 0, out: 400 } };
    if (hooks.before) { const h = hooks.before(req, log.length); if (h) return h; }
    if (req.schema.name === 'match_marks') {
      const marks = (text.match(/<marks>\n([\s\S]*?)\n<\/marks>/) || [])[1].split('\n');
      return { ...base, result: { matches: marks.map(mk => ({ mark: mk, client: matches[mk] || null, confidence: matches[mk] ? 'medium' : 'low', reason: matches[mk] ? 'похоже на бренд' : 'нет в справочнике' })), summary: 'В партии {marks} маркировок, {unknown} без клиента.' } };
    }
    if (req.content[0].type === 'document') {
      const pm = text.match(/страниц (\d+)–(\d+)/), [a, b] = pm ? [+pm[1], +pm[2]] : [1, +(text.match(/страниц: (\d+)/) || [])[1]];
      const rows = []; for (let p = a; p <= b; p++) rows.push({ mark: 'BL-9' + String(p).padStart(2, '0'), places: p, cbm: p / 10, kg: p * 10, sheet: null, row: null, page: p, text: 'BL-9' + p + ' ' + p, note: null });
      return { ...base, result: { meta: { date: a === 1 ? '2026-09-20' : null, route: a === 1 ? 'PDF ROUTE' : null, consolidator: null, header: null, total: null }, rows, notes: [] } };
    }
    return { ...base, result: readExcelPart(text) };
  };
}
