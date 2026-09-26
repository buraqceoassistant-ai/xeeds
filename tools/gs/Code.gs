/**
 * Логистика — связь сайта с этой Google Таблицей.
 * 1) Расширения → Apps Script → вставьте этот код вместо всего, что там есть → Сохранить.
 * 2) Развернуть → Новое развертывание → Тип: Веб-приложение.
 *    Выполнять как: Я. Доступ: Все (Anyone). → Развернуть → разрешите доступ.
 * 3) Скопируйте ссылку веб-приложения (…/exec) и вставьте её на сайте.
 * Пароль (необязательно): впишите его ниже в кавычки и тот же пароль на сайте.
 * Удобнее — в свойства скрипта: ⚙ Настройки проекта → Свойства скрипта → TOKEN.
 * Тогда при обновлении кода пароль вписывать заново не нужно.
 *
 * ИИ-импорт манифестов (версия 8) — там же, в свойствах скрипта:
 *   ANTHROPIC_API_KEY — ключ Claude API (platform.claude.com → API keys); на сайт он не попадает;
 *   AI_MODEL          — модель, например claude-sonnet-5 (пусто — claude-sonnet-5);
 *   EDITOR_TOKEN      — секрет редактора: без него ИИ не вызвать (сайт хранит его только у руководителя).
 * Каждый вызов записывается в лист «ИИ-журнал».
 */
var TOKEN = '';
var VERSION = 8; // сайт сверяет версию и просит обновить код, если он старый

var SH = { ship: 'Yuborishlar', cli: 'Mijozlar', wh: 'Qoshimcha omborlar', set: 'Sozlamalar', ring: 'Halqa zonasi', notes: 'O‘zgarishlar' };
var COLS = { ship: 16, cli: 25, wh: 8, set: 3, ring: 3, notes: 3 };   // Mijozlar Y (25) — маркировки клиента для импорта
var SET_ROWS = { isuzuM3: 5, isuzuKg: 6, depotName: 7, depotLat: 8, depotLon: 9, unloadMin: 10, dayStart: 11, speed: 12, aMaxStops: 13, maxPlaces: 14, bSmallM3: 15, bcMaxStops: 16, cM3: 17, cKg: 18, cTrucks: 19, roadK: 20, gazelBase: 43, gazelHeavy: 44, gazelHeavyKg: 45, gazelPtIn: 46, gazelPtOut: 47, laboBase: 48, laboPt: 49, laboM3: 50, laboKg: 51, baseIncludesPts: 52, kamazBase: 53, kamazPt: 54, laboBaseIncludesPts: 55, kamazBaseIncludesPts: 56, gazelM3: 57, gazelKg: 58, bTolM3: 59, bTolKg: 60,
  changanM3: 61, changanKg: 62, changanBase: 63, changanPt: 64, changanBaseIncludesPts: 65, gazelCount: 66, laboCount: 67, changanCount: 68, tripsPerVehicle: 69, freeOutM3: 70, densityMin: 71, densityMax: 72 };
// подписи новых строк «Sozlamalar»: пишутся, только если в столбце A пусто
var SET_LABELS = {
  baseIncludesPts: ['Gazel — bazaviy narxga kirgan tochkalar', '0 = har bir tochka alohida to‘lanadi: 450 + 3×100. 1 = birinchi tochka bazaviy narx ichida: 450 + 2×100.'],
  laboBaseIncludesPts: ['Labo — bazaviy narxga kirgan tochkalar', '0 = har bir tochka alohida to‘lanadi: 250 + 3×75. 1 = birinchi tochka bazaviy narx ichida: 250 + 2×75.'],
  kamazBaseIncludesPts: ['Katta mashina (Kamaz) — bazaviy narxga kirgan tochkalar', '0 = har bir tochka alohida to‘lanadi. 1 = birinchi tochka bazaviy narx ichida.'],
  gazelM3: ['Gazel — hajmi (m³)', 'Saytdagi rejalarda Gazel reysi shu hajmdan oshmaydi, sig‘masa — Kamaz.'],
  gazelKg: ['Gazel — yuk ko‘tarishi (kg)', 'Gazel’ingizning haqiqiy yuk ko‘tarishi.'],
  bTolM3: ['B reja — Gazel uchun qo‘shimcha hajm (m³)', 'B rejada Gazel shuncha m³ ko‘proq olishi mumkin (23 + 5 = 28). Bundan katta yuk — Kamaz.'],
  bTolKg: ['B reja — Gazel uchun qo‘shimcha og‘irlik (kg)', 'B rejada Gazel shuncha kg ko‘proq olishi mumkin (4000 + 500 = 4500). Bundan og‘ir yuk — Kamaz.'],
  changanM3: ['Changan — hajmi (m³)', 'Changan kuzovi hajmi.'],
  changanKg: ['Changan — yuk ko‘tarishi (kg)', 'Changan yuk ko‘tarishi.'],
  changanBase: ['Changan — bazaviy narx', 'Bir reys uchun. Bo‘sh bo‘lsa — Changan rejalarda ishlatilmaydi.'],
  changanPt: ['Changan — 1 tochka', 'Yuqoridagi bilan birga to‘ldiring.'],
  changanBaseIncludesPts: ['Changan — bazaviy narxga kirgan tochkalar', '0 = har bir tochka alohida to‘lanadi. 1 = birinchi tochka bazaviy narx ichida.'],
  gazelCount: ['Avtopark — Gazel soni', 'Rejada reyslar mashinalarga taqsimlanadi.'],
  laboCount: ['Avtopark — Labo soni', ''],
  changanCount: ['Avtopark — Changan soni', ''],
  tripsPerVehicle: ['Bir mashina kuniga necha reys', 'Mashinalar yetmasa — ikkinchi reys; undan ham ko‘p bo‘lsa — ogohlantirish.'],
  freeOutM3: ['Mayda yuk chegarasi, m³', 'Nuqtaning yuki shundan kichik bo‘lsa, yetkazib berish uchun biz to‘lamaymiz. Halqadan tashqaridagi nuqtalar uchun ham to‘lamaymiz (har qanday hajmda). Rejada bu xarajatlar alohida ko‘rsatiladi. 0 = faqat halqadan tashqaridagilar uchun to‘lamaymiz.'],
  densityMin: ['Import — zichlik, pastki chegara (kg/m³)', 'Manifestdagi yuk bundan yengil bo‘lsa — ogohlantirish (xato bo‘lishi mumkin).'],
  densityMax: ['Import — zichlik, yuqori chegara (kg/m³)', 'Manifestdagi yuk bundan og‘ir bo‘lsa — ogohlantirish (og‘ir yuk yoki xato).']
};
// ro‘yxat «Yuborishlar» M ustunidagi mashinalar: Sozlamalar C24:C39
var TRUCKS_ROW = 24, TRUCKS_N = 16;

function props_() { return PropertiesService.getScriptProperties(); }
// свойство скрипта: точное имя, иначе то же имя в другом регистре или с пробелами («anthropic_api_key », «ANTHROPIC API KEY»)
function prop_(name) {
  var p = props_(), v = String(p.getProperty(name) || '').trim();
  if (v) return v;
  var all = p.getProperties(), norm = function (s) { return String(s).trim().toUpperCase().replace(/[\s-]+/g, '_'); };
  for (var k in all) if (norm(k) === name && String(all[k]).trim()) return String(all[k]).trim();
  return '';
}
// ключ Claude API: ANTHROPIC_API_KEY, иначе любое свойство со значением «sk-ant-…» (ключ вписан под другим именем)
function apiKey_() {
  var k = prop_('ANTHROPIC_API_KEY'); if (k) return k;
  var all = props_().getProperties();
  for (var n in all) if (/^\s*sk-ant-/.test(String(all[n]))) return String(all[n]).trim();
  return '';
}
// для ошибки «нет ключа»: какие свойства скрипт видит — только имена, без значений
function propNames_() {
  var n = Object.keys(props_().getProperties());
  return n.length ? 'Скрипт видит свойства: ' + n.join(', ') + '.' : 'Скрипт не видит ни одного свойства: проверьте, что они сохранены в проекте этой таблицы (Расширения → Apps Script).';
}
function token_() { return String(props_().getProperty('TOKEN') || TOKEN || ''); }

function doGet(e) {
  var p = (e && e.parameter) || {}, tk = token_();
  if (tk && p.token !== tk) return json_({ error: 'Неверный пароль' });
  if (p.resolve || p.geo) return json_(locate_(p));
  return json_({ ok: true, v: VERSION, data: dump_() });
}

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '{}', body = {}, tk = token_();
  try { body = JSON.parse(raw); } catch (err) { return json_({ error: 'Плохой запрос' }); }
  if (tk && body.token !== tk) return json_({ error: 'Неверный пароль' });
  if (body.ai) return json_(ai_(body, raw.length));   // ИИ — без блокировки таблицы и без выгрузки данных
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  var results = [];
  try {
    (body.ops || []).forEach(function (op) { results.push(apply_(op)); });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return json_({ ok: true, v: VERSION, results: results, data: dump_() });
}

// Ссылка на карту → куда она ведёт; координаты → адрес. Короткие ссылки (maps.app.goo.gl, yandex…/maps/-/…)
// раскрываются здесь: браузер этого сделать не может. Адрес — геокодер Google Карт, на узбекском.
function locate_(p) {
  var out = { ok: true, v: VERSION };
  if (p.resolve) {
    var u = String(p.resolve).trim(), hops = [], html = '';
    if (!/^https?:\/\//i.test(u)) return { error: 'Это не ссылка' };
    for (var i = 0; i < 6; i++) {
      hops.push(u);
      var r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'ru,uz;q=0.9,en;q=0.5' } });
      var code = r.getResponseCode(), h = r.getAllHeaders(), loc = h.Location || h.location;
      if (loc && loc.join) loc = loc[0];
      if (code >= 300 && code < 400 && loc) { u = /^https?:/i.test(loc) ? loc : u.replace(/^(https?:\/\/[^\/]+).*$/, '$1') + (loc.charAt(0) === '/' ? '' : '/') + loc; continue; }
      if (code === 200) html = r.getContentText();
      break;
    }
    out.url = u; out.hops = hops;
    // в итоговой ссылке координат нет (карточка места) — ищем их на самой странице карты
    var m = html.match(/(?:center|markers)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/);
    if (m) out.ll = [+m[1], +m[2]];
    if (!out.ll) { m = html.match(/APP_INITIALIZATION_STATE=\[\[\[[\d.]+,(-?\d+\.\d+),(-?\d+\.\d+)\]/); if (m) out.ll = [+m[2], +m[1]]; }
    if (!out.ll) { m = html.match(/"coordinates":\[(-?\d+\.\d+),(-?\d+\.\d+)\]/); if (m) out.ll = [+m[2], +m[1]]; }   // Яндекс: [долгота, широта]
  }
  if (p.geo) {
    var ll = String(p.geo).split(',').map(Number);
    try {
      var g = Maps.newGeocoder().setLanguage('uz').reverseGeocode(ll[0], ll[1]);
      var res = (g.results || []).filter(function (x) { return (x.types || []).indexOf('plus_code') < 0; })[0];   // без «9GHQ+X2»
      if (res) { out.address = res.formatted_address; out.parts = (res.address_components || []).map(function (c) { return c.long_name; }); }
    } catch (err) { out.geoError = String(err); }
  }
  return out;
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function serial_(d, tz) {
  var s = Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss').split(/[- :]/).map(Number);
  return Date.UTC(s[0], s[1] - 1, s[2], s[3], s[4], s[5]) / 864e5 + 25569;
}

function dump_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone(), out = { name: ss.getName(), sheets: {}, links: {} };
  Object.keys(SH).forEach(function (k) {
    var sh = ss.getSheetByName(SH[k]);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last < 1) { out.sheets[SH[k]] = []; return; }
    var vals = sh.getRange(1, 1, last, Math.min(COLS[k], sh.getMaxColumns())).getValues();
    var n = vals.length;
    while (n > 0 && vals[n - 1].every(function (v) { return v === '' || v === null; })) n--;
    vals = vals.slice(0, n).map(function (row) {
      return row.map(function (v) { return v instanceof Date ? serial_(v, tz) : v; });
    });
    out.sheets[SH[k]] = vals;
    if (k === 'cli' && n >= 5) {
      var rt = sh.getRange(5, 10, n - 4, 1).getRichTextValues();
      rt.forEach(function (r, i) { var u = r[0] && r[0].getLinkUrl(); if (u) out.links['J' + (5 + i)] = u; });
    }
  });
  out.imports = imports_(ss);
  return out;
}

// Подтверждённые импорты из «ИИ-журнала» — сайт сверяет по ним дубликаты партий (дата, маршрут, итоги).
function imports_(ss) {
  var sh = ss.getSheetByName(AI_LOG), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var last = sh.getLastRow(), first = Math.max(2, last - 499), v = sh.getRange(first, 1, last - first + 1, AI_HEAD.length).getValues();   // последние 500 записей
  v.forEach(function (r) {
    if (r[11] !== 'подтверждён') return;
    try { var d = JSON.parse(r[12] || '{}'); d.draft = r[3]; d.at = r[0] instanceof Date ? r[0].toISOString() : String(r[0]); out.push(d); } catch (err) { /* повреждённая строка */ }
  });
  return out;
}

function lastRow_(sh, col, first) {
  var last = sh.getLastRow();
  if (last < first) return first - 1;
  var v = sh.getRange(first, col, last - first + 1, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) if (v[i][0] !== '' && v[i][0] !== null) return first + i;
  return first - 1;
}

function num_(x) { return x === '' || x === null || x === undefined || isNaN(Number(x)) ? '' : Number(x); }
function date_(iso) { var p = String(iso).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function setRow_(sh, row, map, textCols) {
  Object.keys(map).forEach(function (c) {
    var v = map[c];
    if (v === undefined) return;
    var r = sh.getRange(row, Number(c));
    if (textCols && textCols.indexOf(Number(c)) >= 0) r.setNumberFormat('@');
    r.setValue(v === null ? '' : v);
  });
}

function ensureF_(sh, row, tplRow, cols) {
  if (row === tplRow) return;
  cols.forEach(function (c) {
    var dst = sh.getRange(row, c);
    if (!dst.getFormula()) sh.getRange(tplRow, c).copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  });
}

// сдвинуть строки ввода вверх вместо удаления строки — формулы и связи листов не ломаются
function shiftUp_(sh, row, blocks, keyCol, first) {
  var last = lastRow_(sh, keyCol, first);
  if (row > last) return;
  blocks.forEach(function (b) {
    if (last > row) sh.getRange(row, b[0], last - row, b[1]).setValues(sh.getRange(row + 1, b[0], last - row, b[1]).getValues());
    sh.getRange(last, b[0], 1, b[1]).clearContent();
  });
}

function findShip_(sh, row, guard) {
  if (row && guard && String(sh.getRange(row, 3).getValue()).trim() === guard.bl) return row;
  if (!guard) return row || 0;
  var last = lastRow_(sh, 3, 5);
  if (last < 5) return 0;
  var v = sh.getRange(5, 1, last - 4, 3).getValues(), tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], tz, 'yyyy-MM-dd') : '';
    if (String(v[i][2]).trim() === guard.bl && d === guard.date) return 5 + i;
  }
  return 0;
}

function findByA_(sh, key) {
  var last = lastRow_(sh, 1, 5);
  if (last < 5) return 0;
  var v = sh.getRange(5, 1, last - 4, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === key) return 5 + i;
  return 0;
}

function apply_(op) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), v = op.v || {}, sh, row;
  if (op.t === 'ship.upsert' || op.t === 'ship.delete') {
    sh = ss.getSheetByName(SH.ship);
    row = op.row || op.guard ? findShip_(sh, op.row, op.guard) : 0;
    if (op.t === 'ship.delete') { if (row) shiftUp_(sh, row, [[1, 1], [3, 1], [10, 7]], 3, 5); return { row: row }; }
    if (!row) row = lastRow_(sh, 3, 5) + 1;
    setRow_(sh, row, { 1: date_(v.date), 3: v.bl, 10: num_(v.cbm), 11: num_(v.kg), 12: num_(v.places), 13: v.truck, 14: num_(v.route), 15: v.status, 16: v.note });
    ensureF_(sh, row, 6, [2, 4, 5, 6, 7, 8, 9, 17, 18, 19, 20, 21]);
    return { row: row };
  }
  if (op.t === 'cli.upsert' || op.t === 'cli.delete') {
    sh = ss.getSheetByName(SH.cli);
    row = op.key ? findByA_(sh, op.key) : 0;
    if (op.t === 'cli.delete') { if (row) sh.deleteRow(row); return { row: row }; }
    if (!row) row = lastRow_(sh, 1, 5) + 1;
    if (v.marks !== undefined) {   // маркировки — столбец Y: добавить столбец и подпись, если их ещё нет
      if (sh.getMaxColumns() < 25) sh.insertColumnsAfter(sh.getMaxColumns(), 25 - sh.getMaxColumns());
      var hc = sh.getRange(4, 25); if (String(hc.getValue()).trim() === '') hc.setValue('Markirovkalar');
    }
    setRow_(sh, row, { 1: v.bl, 2: v.brand, 3: v.name, 4: v.tel1, 5: v.tel2, 6: v.receiver, 7: v.receiverTel, 8: v.district, 9: v.address, 11: num_(v.lat), 12: num_(v.lon), 15: v.note, 24: v.manualZone, 25: v.marks }, [4, 5, 7, 25]);
    if (v.link !== undefined) {
      var r = sh.getRange(row, 10);
      if (v.link) r.setRichTextValue(SpreadsheetApp.newRichTextValue().setText('Xaritada ochish').setLinkUrl(v.link).build());
      else r.clearContent();
    }
    ensureF_(sh, row, 5, [13, 14, 16, 17, 18, 19, 20, 21, 22, 23]);
    return { row: row };
  }
  if (op.t === 'wh.upsert' || op.t === 'wh.delete') {
    sh = ss.getSheetByName(SH.wh);
    row = op.row && op.guard && String(sh.getRange(op.row, 1).getValue()).trim() === op.guard.bl ? op.row : 0;
    if (op.t === 'wh.delete') { if (row) shiftUp_(sh, row, [[1, 5]], 1, 5); return { row: row }; }
    if (!row) row = lastRow_(sh, 1, 5) + 1;
    setRow_(sh, row, { 1: v.bl, 2: v.brand, 3: v.name, 4: num_(v.lat), 5: num_(v.lon) });
    ensureF_(sh, row, 5, [6, 7, 8]);
    return { row: row };
  }
  if (op.t === 'ring') {
    sh = ss.getSheetByName(SH.ring);
    if (!sh || !op.v || op.v.length < 3) return { error: 'no ring' };
    var pts = op.v.slice(0, 210);
    sh.getRange(11, 2, 210, 2).clearContent();
    sh.getRange(11, 2, pts.length, 2).setValues(pts.map(function (p) { return [Number(p[0]), Number(p[1])]; }));
    return { ok: true, n: pts.length };
  }
  if (op.t === 'trucks') {
    sh = ss.getSheetByName(SH.set);
    var list = (op.v || []).slice(0, TRUCKS_N).map(function (x) { return [String(x)]; });
    if (!sh || !list.length) return { error: 'no trucks' };
    sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).clearContent();
    sh.getRange(TRUCKS_ROW, 3, list.length, 1).setValues(list);
    var ys = ss.getSheetByName(SH.ship);
    if (ys) ys.getRange('M5:M500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1), true).setAllowInvalid(true).build());
    return { ok: true, n: list.length };
  }
  if (op.t === 'set') {
    sh = ss.getSheetByName(SH.set);
    Object.keys(v).forEach(function (k) {
      if (k === 'ringBuffer') { var h = ss.getSheetByName(SH.ring); if (h) h.getRange(4, 2).setValue(num_(v[k])); return; }
      if (!SET_ROWS[k]) return;
      sh.getRange(SET_ROWS[k], 2).setValue(k === 'depotName' ? v[k] : num_(v[k]));
      var lab = SET_LABELS[k];
      if (lab) [[1, lab[0]], [3, lab[1]]].forEach(function (x) { var c = sh.getRange(SET_ROWS[k], x[0]); if (String(c.getValue()).trim() === '') c.setValue(x[1]); });
    });
    return { ok: true };
  }
  return { error: 'unknown op' };
}

// ───────────── ИИ-импорт манифестов (версия 8) ─────────────
// Сайт присылает промпт, содержимое документа и JSON-схему ответа; скрипт добавляет ключ и модель
// из свойств скрипта, вызывает Claude API и возвращает JSON строго по схеме. Ключ на сайт не попадает.
// Ответ по схеме: инструмент со strict: true и tool_choice на него; модели, которые не принимают
// принудительный tool_choice (Opus 5.5, Fable 5.1 — ошибка 400), получают ту же схему через output_config.format.
var AI_URL = 'https://api.anthropic.com/v1/messages';
var AI_DEFAULT_MODEL = 'claude-sonnet-5';
var AI_NO_FORCED_TOOL = /(opus-5-5|fable-5-1|mythos-5-1)/;
var AI_MAX_BODY = 15 * 1024 * 1024;   // файл до 10 МБ в base64 (≈ 13,4 МБ) + служебные поля
var AI_MAX_TOKENS = 16000;
var AI_LOG = 'ИИ-журнал';
var AI_HEAD = ['Время', 'Пользователь', 'Файл', 'Черновик', 'Действие', 'Модель', 'Часть', 'Токены: вход', 'Токены: кэш', 'Токены: выход', 'Ответ, мс', 'Итог', 'Данные'];

function ai_(body, size) {
  var editor = prop_('EDITOR_TOKEN'), a = body.ai || {};
  // без EDITOR_TOKEN ИИ доступен по обычному паролю скрипта; сайт предупредит, что его может вызвать и вход «только просмотр»
  if (editor && body.editor !== editor) return { error: 'ИИ-импорт доступен только руководителю: секрет редактора не подходит', code: 'editor', v: VERSION };
  var key = apiKey_(), model = prop_('AI_MODEL') || AI_DEFAULT_MODEL;
  var info = { v: VERSION, model: model, editorSet: !!editor, keySet: !!key };
  if (a.action === 'log') { aiLog_(body, a, model, null, 0); return merge_(info, { ok: true }); }
  if (a.action !== 'ping' && a.action !== 'call') return merge_(info, { error: 'Неизвестное действие ИИ', code: 'action' });
  if (!key) return merge_(info, { error: 'В свойствах скрипта нет ANTHROPIC_API_KEY — впишите ключ Claude API и нажмите «Сохранить свойства скрипта». ' + propNames_(), code: 'nokey' });
  if (size > AI_MAX_BODY) return merge_(info, { error: 'Файл слишком большой для ИИ: не больше 10 МБ', code: 'size' });
  var req = a.action === 'ping' ? { system: 'Ты проверка связи. Ответь через инструмент.', content: [{ type: 'text', text: 'Верни reply = "готов".' }], max_tokens: 400,
    schema: { name: 'ping', description: 'Ответ на проверку связи.', input_schema: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false } } } : a;
  if (!req.schema || !req.schema.name || !req.schema.input_schema || !req.content) return merge_(info, { error: 'В запросе нет схемы или содержимого', code: 'bad' });
  var t0 = Date.now(), r = aiCall_(key, model, req), ms = Date.now() - t0;
  aiLog_(body, a, model, r, ms);
  return merge_(info, r, { ms: ms });
}

function aiCall_(key, model, a) {
  var forced = !AI_NO_FORCED_TOOL.test(model), r = aiSend_(key, aiBuild_(model, a, forced));
  if (forced && r.status === 400 && /tool_choice|forced/i.test(r.message)) { forced = false; r = aiSend_(key, aiBuild_(model, a, false)); }
  var mode = forced ? 'tool' : 'json';
  if (r.status !== 200) return { error: aiError_(r, model), code: r.status ? 'http' + r.status : (/time/i.test(r.message) ? 'timeout' : 'net'), detail: r.message, mode: mode };
  var j = r.json || {}, u = j.usage || {};
  var usage = { in: u.input_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), out: u.output_tokens || 0 };
  if (j.stop_reason === 'max_tokens') return { error: 'Ответ ИИ не поместился — разберите документ частями поменьше', code: 'truncated', usage: usage, mode: mode };
  if (j.stop_reason === 'refusal') return { error: 'ИИ отказался разбирать документ', code: 'refusal', usage: usage, mode: mode };
  var result = null;
  (j.content || []).forEach(function (b) {
    if (result !== null) return;
    if (forced && b.type === 'tool_use' && b.name === a.schema.name) result = b.input;
    if (!forced && b.type === 'text') { try { result = JSON.parse(b.text); } catch (err) { /* не JSON */ } }
  });
  if (result === null) return { error: 'ИИ не вернул ответ по схеме', code: 'noresult', usage: usage, mode: mode };
  return { ok: true, result: result, usage: usage, mode: mode, stop: j.stop_reason, model: j.model || '' };
}

function aiBuild_(model, a, forced) {
  var s = a.schema, req = { model: model, max_tokens: Math.max(256, Math.min(+a.max_tokens || 4000, AI_MAX_TOKENS)), messages: [{ role: 'user', content: a.content }] };
  if (a.system) req.system = String(a.system);
  if (forced) { req.tools = [{ name: s.name, description: s.description || '', input_schema: s.input_schema, strict: true }]; req.tool_choice = { type: 'tool', name: s.name }; }
  else req.output_config = { format: { type: 'json_schema', schema: s.input_schema } };
  if (a.effort && !/haiku/.test(model)) { req.output_config = req.output_config || {}; req.output_config.effort = String(a.effort); }   // у Haiku 4.5 нет effort
  return req;
}

function aiSend_(key, req) {
  var res;
  try {
    res = UrlFetchApp.fetch(AI_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
  } catch (err) { return { status: 0, message: String((err && err.message) || err) }; }
  var code = res.getResponseCode(), j = {};
  try { j = JSON.parse(res.getContentText()); } catch (err) { /* не JSON */ }
  return { status: code, json: j, message: (j && j.error && j.error.message) || '' };
}

function aiError_(r, model) {
  var m = r.message || '';
  if (!r.status) return /time/i.test(m) ? 'ИИ не ответил вовремя (Apps Script ждёт около минуты) — попробуйте ещё раз или разберите документ частями' : 'Нет связи с Claude API: ' + m;
  if (/credit balance/i.test(m)) return 'На счёте Claude API закончились деньги — пополните в Claude Console (Billing)';
  if (r.status === 401) return 'Ключ Claude API не подходит — проверьте ANTHROPIC_API_KEY в свойствах скрипта';
  if (r.status === 403) return 'У ключа нет доступа к модели ' + model;
  if (r.status === 404) return 'Модель «' + model + '» не найдена — проверьте AI_MODEL в свойствах скрипта';
  if (r.status === 413) return 'Документ слишком большой для одного запроса';
  if (r.status === 429) return 'Слишком много запросов к ИИ или исчерпан лимит — подождите минуту';
  if (r.status >= 500) return 'Сервис ИИ перегружен — попробуйте ещё раз через минуту';
  return 'ИИ отклонил запрос: ' + m;
}

function aiLog_(body, a, model, r, ms) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(AI_LOG);
    if (!sh) { sh = ss.insertSheet(AI_LOG); sh.getRange(1, 1, 1, AI_HEAD.length).setValues([AI_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
    var m = a.meta || {}, u = (r && r.usage) || {}, cut = function (x, n) { return String(x == null ? '' : x).slice(0, n); };
    var act = a.action === 'log' ? (m.status === 'confirmed' ? 'подтверждение' : 'отклонение') : a.action === 'ping' ? 'проверка связи' : cut(m.step || 'разбор', 40);
    var res = a.action === 'log' ? (m.status === 'confirmed' ? 'подтверждён' : 'отклонён') : r && r.ok ? 'ok' : 'ошибка: ' + cut(r && r.error, 200);
    sh.appendRow([new Date(), cut(body.login, 60), cut(m.file, 200), cut(m.draft, 60), act, a.action === 'log' ? '' : model, cut(m.part, 20),
      u.in || '', u.cache || '', u.out || '', a.action === 'log' ? '' : ms, res, a.action === 'log' ? cut(JSON.stringify(m.data || {}), 4000) : '']);
  } catch (err) { /* журнал не должен ломать ответ */ }
}

function merge_() { var o = {}; for (var i = 0; i < arguments.length; i++) { var x = arguments[i] || {}; Object.keys(x).forEach(function (k) { o[k] = x[k]; }); } return o; }
