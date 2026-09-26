// Заглушки сервисов Google Apps Script для тестов tools/gs/Code.gs в Node (без сети и без Google).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
  cell(i, j) { const row = this.sh.rows[this.r - 1 + i] || []; return row[this.c - 1 + j] ?? ''; }
  getValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.cell(i, j))); }
  getValue() { return this.cell(0, 0); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  getFormula() { return ''; }
  copyTo() { return this; }
  getRichTextValues() { return Array.from({ length: this.nr }, () => [null]); }
  setRichTextValue(v) { this.sh.set(this.r, this.c, v.text); return this; }
  setDataValidation() { return this; }
}
class Sheet {
  constructor(name, rows = [], maxCols = 26) { this.name = name; this.rows = rows.map(r => r.slice()); this.maxCols = maxCols; this.frozen = 0; }
  set(r, c, x) { if (c > this.maxCols) throw new Error('Координаты вне листа: столбец ' + c + ' > ' + this.maxCols); while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = x; }
  getRange(r, c, nr, nc) { if (c + (nc || 1) - 1 > this.maxCols) throw new Error('Координаты вне листа'); return new Range(this, r, c, nr, nc); }
  getLastRow() { for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some(v => v !== '' && v != null)) return i; return 0; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(after, n) { this.maxCols += n; }
  appendRow(row) { this.set(this.getLastRow() + 1, 1, row[0]); const r = this.getLastRow(); row.forEach((x, j) => this.set(r, j + 1, x)); }
  setFrozenRows(n) { this.frozen = n; }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
}

export function loadScript({ props = {}, sheets = {}, fetch } = {}) {
  const book = { name: 'Тест', sheets: Object.fromEntries(Object.entries(sheets).map(([n, s]) => [n, new Sheet(n, s.rows || [], s.maxCols || 26)])) };
  const calls = [], logs = [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, getProperties: () => ({ ...props }) }) },
    UrlFetchApp: { fetch: (url, opts) => { const req = opts.payload ? JSON.parse(opts.payload) : null; calls.push({ url, opts, req }); const r = fetch(req, opts, calls.length); if (r instanceof Error) throw r;
      return { getResponseCode: () => r.status ?? 200, getContentText: () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body), getAllHeaders: () => ({}) }; } },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getName: () => book.name, getSpreadsheetTimeZone: () => 'Asia/Tashkent', getSheetByName: n => book.sheets[n] || null,
        insertSheet: n => (book.sheets[n] = new Sheet(n)) }),
      flush() {}, newRichTextValue: () => { const o = { text: '', setText(t) { o.text = t; return o; }, setLinkUrl() { return o; }, build() { return o; } }; return o; },
      newDataValidation: () => { const o = { requireValueInRange: () => o, setAllowInvalid: () => o, build: () => o }; return o; }, CopyPasteType: { PASTE_FORMULA: 1 }
    },
    ContentService: { createTextOutput: s => ({ text: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 10) },
    Logger: { log: m => logs.push(m) },
    ScriptApp: { AuthMode: { FULL: 'FULL' }, requireAllScopes: m => logs.push('requireAllScopes ' + m) },
    Maps: {}, Date, JSON, Math, String, Number, Object, Array, isNaN, RegExp, Error
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../tools/gs/Code.gs', import.meta.url), 'utf8'), ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  const get = (params = {}) => JSON.parse(ctx.doGet({ parameter: params }).text);
  return { ctx, book, calls, logs, post, get };
}
