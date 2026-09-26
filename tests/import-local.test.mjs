// Импорт без ИИ (js/import-local.js): строки манифеста кодом из ячеек Excel и из текста PDF, дальше — те же проверки.
// Книги и страницы — вымышленные, собираются в памяти.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { manifestXlsx, ROWS, TOTAL, CLIENTS, DATE, ROUTE } from './fixtures/manifest.mjs';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../js/xlsx-io.js');
const L = require('../js/import-core.js');
const C = require('../js/import-checks.js');
const Loc = require('../js/import-local.js');
const X = globalThis.XlsxIO;
const S = { freeOutM3: 1, densityMin: 40, densityMax: 800 };

const analyzeLocal = (doc, clients = CLIENTS) => L.analyze({ doc, fileName: 'm', clients, draftId: 'd1', today: '2026-09-25', local: Loc.localExtract });
const draftOf = (d, kind) => ({ id: 'd1', file: { kind, name: 'm' }, ...d });

test('Excel-шаблон консолидатора без ИИ: все строки, дата, маршрут, итог; проверки без блокирующих', async () => {
  const book = await X.readGrid(manifestXlsx());
  const d = await analyzeLocal({ kind: 'xlsx', book });
  assert.equal(d.model, 'без ИИ'); assert.equal(d.calls.length, 1); assert.equal(d.calls[0].mode, 'local');
  assert.deepEqual(d.rows.map(r => [r.mark, r.places, r.cbm, r.kg]), ROWS);
  assert.equal(d.journalDate, DATE); assert.equal(d.meta.route, ROUTE); assert.equal(d.meta.consolidator, 'TESTCO');
  assert.deepEqual([d.meta.total.places, d.meta.total.cbm, d.meta.total.kg], [TOTAL.places, TOTAL.cbm, TOTAL.kg]);
  assert.match(d.summary, /\{marks\}/); assert.doesNotMatch(d.summary, /\d/);
  const r = C.check(draftOf(d, 'xlsx'), { book, settings: S });
  assert.deepEqual(r.blocking, []); assert.deepEqual(r.sum, TOTAL);
  // маркировки — только кодом: BL-коды, бренды, BL-00; предложений ИИ нет
  assert.equal(d.marks.ALFA.client, 'BL-904'); assert.equal(d.marks.CBETA.client, 'BL-906'); assert.equal(d.marks.BL00.by, 'unknown-owner');
  assert.ok(Object.values(d.marks).every(m => !m.suggest));
});

// книга как у readGrid: брутто и нетто, объём коробки и общий, пустые маркировки под первой строкой группы,
// объединённый объём на две строки, подытог, дата текстом
function trickyBook() {
  const rows = {
    1: { A: 'PACKING LIST', F: 'DATE: 2026.9.21' },
    2: { A: 'KASHGAR TO TASHKENT - URUMQI SILKCO' },
    4: { A: 'NO', B: 'SHIPPING MARKS 唛头', C: 'DESCRIPTION', D: 'CTNS', E: 'N.W.(KG)', F: 'G.W.(KG)', G: 'CBM/CTN', H: 'T/CBM' },
    5: { A: 1, B: 'BL-901', C: 'shoes', D: 10, E: 90, F: 100, G: 0.1, H: 1 },
    6: { A: 2, C: 'bags', D: 5, E: 45, F: 50, G: 0.1, H: 0.5 },                  // маркировка пустая — продолжение BL-901
    7: { A: 3, B: 'BL-902', C: 'toys', D: 20, E: 380, F: 400, G: 0.2, H: 6 },   // H7:H8 объединены: 6 м³ на две строки
    8: { A: 4, B: 'BL-902', C: 'toys', D: 10, E: 190, F: 200, G: 0.2 },
    9: { B: 'SUBTOTAL', D: 45, F: 750, H: 7.5 },
    10: { A: 5, B: 'OMG', C: 'lamps', D: 8, E: 150, F: 160, G: 0.25, H: 2 },
    11: { A: 6, B: 'BL-00', C: 'misc', D: 0, F: 0, H: 0 },                        // нули — не груз
    12: { B: 'TOTAL', D: 53, F: 910, H: 9.5 }
  };
  return [{ name: 'PL', hidden: false, rows, merges: ['H7:H8'] }];
}

test('Excel: брутто, а не нетто; общий объём, а не коробки; объединённое число — один раз; подытог пропущен', async () => {
  const book = trickyBook();
  const x = Loc.localExtract({ kind: 'xlsx', book });
  assert.deepEqual(x.meta.header, { sheet: 'PL', row: 4, mark: 'B', places: 'D', cbm: 'H', kg: 'F' });
  assert.equal(x.meta.date, '2026-09-21'); assert.equal(x.meta.consolidator, 'SILKCO');
  assert.deepEqual(x.rows.map(r => [r.row, r.mark, r.places, r.cbm, r.kg]), [[5, 'BL-901', 10, 1, 100], [6, 'BL-901', 5, 0.5, 50], [7, 'BL-902', 20, 6, 400], [8, 'BL-902', 10, null, 200], [10, 'OMG', 8, 2, 160]]);
  assert.equal(x.rows[1].note, 'Маркировка взята из строки выше');
  assert.deepEqual([x.meta.total.places, x.meta.total.cbm, x.meta.total.kg], [53, 9.5, 910]);
  const d = await analyzeLocal({ kind: 'xlsx', book });
  const r = C.check(draftOf(d, 'xlsx'), { book, settings: S });
  assert.deepEqual(r.blocking, [], JSON.stringify(r.blocking));
  assert.deepEqual(r.sum, { places: 53, cbm: 9.5, kg: 910 });
  assert.ok(r.flags.r2.some(f => f.code === 'mark-above'));
  assert.equal(d.marks.OMG.client, 'BL-907');   // маркировка из карточки клиента
});

test('ответ ИИ с числом объединённой ячейки в обеих строках — блокирующая ошибка (иначе посчиталось бы дважды)', async () => {
  const book = trickyBook(), d = await analyzeLocal({ kind: 'xlsx', book });
  const bad = JSON.parse(JSON.stringify(d)); bad.rows[3].cbm = 6; bad.rows[3].ai.cbm = 6;
  const r = C.check(draftOf(bad, 'xlsx'), { book, settings: S });
  assert.ok(r.blocking.some(b => /R8 — м³: в документе —, в строке 6/.test(b.text)), JSON.stringify(r.blocking));
});

test('несколько брендов у клиента через запятую — маркировка узнаётся по любому из них', () => {
  const idx = L.clientIndex([{ bl: 'BL-908', brand: 'NORD DECOR, STUDIO', name: 'Umar' }, { bl: 'BL-909', brand: 'NOVA; STAR', name: 'Ali' }]);
  assert.deepEqual(L.matchMark('STUDIO', idx), { client: 'BL-908', by: 'brand', reason: 'бренд' });
  assert.equal(L.matchMark('NORD DECOR', idx).client, 'BL-908'); assert.equal(L.matchMark('star', idx).client, 'BL-909');
  assert.equal(L.matchMark('DECOR', idx), null);
});

test('партия уже в журнале, но итог разошёлся из-за одной строки — предупреждение по клиентам', async () => {
  const book = await X.readGrid(manifestXlsx()), d = await analyzeLocal({ kind: 'xlsx', book });
  const g = C.groupsOf(d).filter(x => x.decision && x.decision.client);
  const shipments = g.map(x => ({ date: DATE, bl: x.decision.client, places: x.places, cbm: x.cbm, kg: x.kg }));
  shipments[1] = { ...shipments[1], places: 1, cbm: 0.1, kg: 5 };                // одна отгрузка внесена с ошибкой
  const r = C.check(draftOf(d, 'xlsx'), { book, settings: S, shipments });
  const w = r.warnings.find(x => x.code === 'duplicate');
  assert.ok(w, JSON.stringify(r.warnings)); assert.match(w.text, new RegExp('у ' + (g.length - 1) + ' из ' + g.length + ' клиентов'));
  assert.match(w.text, new RegExp('расходится: ' + shipments[1].bl + ' — в журнале 1 мест · 0,1 м³ · 5 кг, в манифесте'));
  // другая дата — не дубликат
  assert.ok(!C.check(draftOf(d, 'xlsx'), { book, settings: S, shipments: shipments.map(x => ({ ...x, date: '2026-09-21' })) }).warnings.some(x => x.code === 'duplicate'));
});

test('Excel без строки заголовков — строк нет, понятная заметка', () => {
  const x = Loc.localExtract({ kind: 'xlsx', book: [{ name: 'S', rows: { 1: { A: 'hello' }, 2: { A: 1, B: 2 } }, merges: [] }] });
  assert.equal(x.rows.length, 0); assert.match(x.notes[0], /Не найдена строка заголовков/);
});

// страницы PDF как у LogiPdf.pageTexts: строки со словами и их x
const line = (...cells) => ({ text: cells.map(c => c[0]).join(' '), items: cells.map(([s, x]) => ({ s: String(s), x, w: String(s).length * 5 })) });
const page = (n, lines) => ({ page: n, text: lines.map(l => l.text).join('\n'), lines });
function pdfPages() {
  const H = [['No', 20], ['SHIPPING MARK', 50], ['CTN', 200], ['G.W.', 260], ['CBM', 320]];
  return [
    page(1, [line(['CARGO MANIFEST', 50]), line(['DATE 20.09.2026', 50]), line(['HORGOS TO TASHKENT - YIWU TESTCO', 50]), line(...H),
      line(['1', 20], ['BL-901', 50], ['12', 205], ['250.5', 262], ['1.234', 320]),
      line(['2', 20], ['CBETA', 50], ['20', 205], ['510', 262], ['2.75', 320]),
      line(['3', 20], ['15', 205], ['300', 262], ['1.5', 320])]),                      // без маркировки — продолжение CBETA
    page(2, []),                                                                       // скан
    page(3, [line(...H), line(['4', 20], ['BL-902', 50], ['40', 205], ['1,320', 262], ['6.8', 320]),
      line(['TOTAL', 50], ['87', 205], ['2,380.5', 262], ['12.284', 320])])
  ];
}

test('PDF с текстом без ИИ: столбцы по заголовкам, маркировка сверху, итог, скан — в заметках; проверки', async () => {
  const texts = pdfPages();
  const x = Loc.localExtract({ kind: 'pdf', texts });
  assert.deepEqual(x.rows.map(r => [r.page, r.mark, r.places, r.kg, r.cbm]), [[1, 'BL-901', 12, 250.5, 1.234], [1, 'CBETA', 20, 510, 2.75], [1, 'CBETA', 15, 300, 1.5], [3, 'BL-902', 40, 1320, 6.8]]);
  assert.equal(x.rows[2].note, 'Маркировка взята из строки выше');
  assert.deepEqual(x.meta.total, { places: 87, cbm: 12.284, kg: 2380.5, sheet: null, row: null, page: 3 });
  assert.equal(x.meta.date, '2026-09-20'); assert.equal(x.meta.consolidator, 'TESTCO');
  assert.match(x.notes.join(' '), /скан\): 2/);
  const d = await analyzeLocal({ kind: 'pdf', texts });
  const r = C.check(draftOf(d, 'pdf'), { pages: texts, settings: S });
  assert.deepEqual(r.blocking, []); assert.deepEqual(r.sum, { places: 87, cbm: 12.284, kg: 2380.5 });
  assert.ok(r.warnings.some(w => w.code === 'scan'));
});

test('PDF, где строка таблицы — один кусок текста: маркировка в начале, числа по порядку столбцов; № строки и описание', () => {
  const one = (t, x = 50) => ({ text: t, items: [{ s: t, x, w: t.length * 5 }] });
  const a = Loc.localExtract({ kind: 'pdf', texts: [page(1, [one('DATE 2026-09-20'), one('SHIPPING MARK   CTN   T/CBM   KG'), one('BL-901   12   1.234   250.5'), one('CBETA   20   2.75   1,510'), one('TOTAL   32   3.984   1760.5')])] });
  assert.deepEqual(a.rows.map(r => [r.mark, r.places, r.cbm, r.kg]), [['BL-901', 12, 1.234, 250.5], ['CBETA', 20, 2.75, 1510]]);
  assert.deepEqual([a.meta.total.places, a.meta.total.cbm, a.meta.total.kg], [32, 3.984, 1760.5]);
  const b = Loc.localExtract({ kind: 'pdf', texts: [page(1, [one('No  SHIPPING MARK  DESCRIPTION  CTNS  G.W.  CBM'), one('1  BL-905  shoes and bags  7  260  1.05')])] });
  assert.deepEqual(b.rows.map(r => [r.mark, r.places, r.kg, r.cbm]), [['BL-905', 7, 260, 1.05]]);
});

test('даты: ячейка, 2026.9.20, 2026年9月20日, 20.09.2026; не дата — null', () => {
  assert.equal(Loc.dateIn('2026-09-20'), '2026-09-20'); assert.equal(Loc.dateIn('DATE: 2026.9.20'), '2026-09-20');
  assert.equal(Loc.dateIn('日期 2026年9月20日'), '2026-09-20'); assert.equal(Loc.dateIn('20.09.2026'), '2026-09-20');
  assert.equal(Loc.dateIn('BL-146 12 1.234'), null); assert.equal(Loc.dateIn('2026.13.40'), null);
});
