// Код Apps Script (tools/gs/Code.gs) на заглушках: ИИ-посредник, секрет редактора, «ИИ-журнал»,
// маркировки клиентов (Mijozlar Y) и новые строки «Sozlamalar». Запуск: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './gs-mock.mjs';

const toolReply = (input, usage = { input_tokens: 120, output_tokens: 30 }) => ({ body: { content: [{ type: 'tool_use', name: 'ping', input }], stop_reason: 'tool_use', usage, model: 'claude-sonnet-5' } });
const book = () => ({
  Yuborishlar: { rows: [[], [], [], ['Sana']], maxCols: 21 },
  Mijozlar: { rows: [[], [], [], ['BL kodi']], maxCols: 24 },
  Sozlamalar: { rows: [] },
  'Halqa zonasi': { rows: [] }
});
const ping = (extra = {}) => ({ token: '', login: 'buraq', ai: { action: 'ping', meta: { file: '' } }, ...extra });
const schema = { name: 'manifest', description: 'разбор', input_schema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { m: { type: 'string' } }, required: ['m'], additionalProperties: false } } }, required: ['rows'], additionalProperties: false } };
const call = (extra = {}) => ({ token: '', login: 'buraq', ai: { action: 'call', system: 'данные', content: [{ type: 'text', text: 'S1 R5 | A:BL-1' }], schema, max_tokens: 3000, effort: 'low', meta: { file: 'm.xlsx', draft: 'd1', part: '1/1' } }, ...extra });

test('проверка связи: ключ из свойств, модель по умолчанию, инструмент strict и tool_choice на него, запись в журнал', () => {
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'sk-test' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  const r = s.post(ping());
  assert.equal(r.ok, true); assert.equal(r.v, 20); assert.equal(r.model, 'claude-sonnet-5'); assert.deepEqual(r.result, { reply: 'готов' });
  assert.equal(r.mode, 'tool'); assert.equal(r.editorSet, true); assert.deepEqual(r.usage, { in: 120, cache: 0, out: 30 });
  const c = s.calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.opts.headers['x-api-key'], 'sk-test'); assert.equal(c.opts.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.req.model, 'claude-sonnet-5'); assert.equal(c.req.tools[0].strict, true); assert.deepEqual(c.req.tool_choice, { type: 'tool', name: 'ping' });
  const log = s.book.sheets['ИИ-журнал'];
  assert.equal(log.rows[0][0], 'Время'); assert.equal(log.rows[1][1], 'buraq'); assert.equal(log.rows[1][4], 'проверка связи'); assert.equal(log.rows[1][11], 'ok');
  assert.equal(log.rows[1][7], 120); assert.equal(log.rows[1][9], 30); assert.ok(log.rows[1][10] >= 0);
});

test('нет ключа — понятная ошибка, в API ничего не уходит', () => {
  const s = loadScript({ sheets: book(), fetch: () => { throw new Error('не должно вызываться'); } });
  const r = s.post(ping());
  assert.equal(r.code, 'nokey'); assert.match(r.error, /ANTHROPIC_API_KEY/); assert.equal(s.calls.length, 0);
});

test('нет ключа — в ошибке имена свойств, которые видит скрипт (без значений)', () => {
  const s = loadScript({ props: { EDITOR_TOKEN: 'ed-secret', AI_MODEL: 'claude-sonnet-5' }, sheets: book(), fetch: () => { throw new Error('не должно вызываться'); } });
  const r = s.post(ping({ editor: 'ed-secret' }));
  assert.equal(r.code, 'nokey'); assert.match(r.error, /Сохранить свойства скрипта/); assert.match(r.error, /видит свойства: EDITOR_TOKEN, AI_MODEL/);
  assert.doesNotMatch(r.error, /ed-secret/);
  const bare = loadScript({ sheets: book() }).post(ping()).error;   // TOKEN и EDITOR_TOKEN теперь есть всегда (версия 19)
  assert.match(bare, /видит свойства: TOKEN, EDITOR_TOKEN\./); assert.doesNotMatch(bare, /pw-test|ed-test/);
});

test('имя свойства в другом регистре или с пробелами и ключ под другим именем — находятся', () => {
  for (const props of [{ 'anthropic_api_key ': ' sk-ant-1\n' }, { 'ANTHROPIC API KEY': 'sk-ant-1' }, { CLAUDE_KEY: 'sk-ant-1' }]) {
    const s = loadScript({ props, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
    const r = s.post(ping());
    assert.equal(r.ok, true, JSON.stringify(props)); assert.equal(s.calls[0].opts.headers['x-api-key'], 'sk-ant-1');
  }
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k', ' editor_token': 'ed-secret\n', ai_model: ' claude-opus-5-5 ' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  assert.equal(s.post(ping({ editor: '' })).code, 'editor');
  const r = s.post(ping({ editor: 'ed-secret' }));
  assert.equal(r.editorSet, true); assert.equal(r.model, 'claude-opus-5-5');
});

test('нет разрешения на внешние запросы — подсказка про authorize; authorize() делает внешний запрос', () => {
  const denied = new Error('У вас нет разрешения на вызов функции "UrlFetchApp.fetch". Требуемые разрешения: https://www.googleapis.com/auth/script.external_request');
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'sk-ant-1' }, sheets: book(), fetch: () => denied });
  const r = s.post(ping());
  assert.equal(r.ok, undefined); assert.match(r.error, /функцию authorize → ▶ Выполнить/); assert.match(r.error, /Выбрать все/);
  const a = loadScript({ sheets: book(), fetch: () => ({ status: 401, body: {} }) });
  a.ctx.authorize();
  assert.equal(a.logs[0], 'requireAllScopes FULL');
  assert.equal(a.calls[0].url, 'https://api.anthropic.com/v1/models'); assert.match(a.logs[1], /Разрешения выданы.*401/);
});

test('секрет редактора: без него и с неверным — отказ; с верным — вызов', () => {
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k', EDITOR_TOKEN: 'ed-secret' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  assert.equal(s.post(ping({ editor: '' })).code, 'editor');
  assert.equal(s.post(ping({ editor: 'чужой' })).code, 'editor');
  assert.equal(s.calls.length, 0);
  const r = s.post(ping({ editor: 'ed-secret' }));
  assert.equal(r.ok, true); assert.equal(r.editorSet, true);
});

test('пароль скрипта из свойства TOKEN проверяется и для ИИ, и для выгрузки', () => {
  const s = loadScript({ props: { TOKEN: 'pw', ANTHROPIC_API_KEY: 'k' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  assert.equal(s.post(ping({ token: 'x' })).error, 'Неверный пароль');
  assert.equal(s.get({ token: 'x' }).error, 'Неверный пароль');
  assert.equal(s.post(ping({ token: 'pw' })).ok, true);
  assert.equal(s.get({ token: 'pw' }).v, 20);
});

test('Opus 5.5 и Fable 5.1 не принимают принудительный tool_choice — схема уходит через output_config.format', () => {
  for (const model of ['claude-opus-5-5', 'claude-fable-5-1']) {
    const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k', AI_MODEL: model }, sheets: book(), fetch: () => ({ body: { content: [{ type: 'text', text: '{"rows":[{"m":"BL-1"}]}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } }) });
    const r = s.post(call());
    const q = s.calls[0].req;
    assert.equal(r.ok, true, model); assert.equal(r.mode, 'json'); assert.deepEqual(r.result, { rows: [{ m: 'BL-1' }] });
    assert.equal(q.tools, undefined); assert.equal(q.tool_choice, undefined);
    assert.deepEqual(q.output_config.format, { type: 'json_schema', schema: schema.input_schema }); assert.equal(q.output_config.effort, 'low');
  }
});

test('если API отвечает 400 на tool_choice — повтор через output_config.format', () => {
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-new-model' }, sheets: book(), fetch: (req, o, n) => n === 1
    ? { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice type "tool" is not supported for this model' } } }
    : { body: { content: [{ type: 'text', text: '{"rows":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } } });
  const r = s.post(call());
  assert.equal(r.ok, true); assert.equal(r.mode, 'json'); assert.equal(s.calls.length, 2);
  assert.ok(s.calls[0].req.tool_choice); assert.ok(!s.calls[1].req.tool_choice);
});

test('Haiku 4.5 — без effort; max_tokens ограничен', () => {
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k', AI_MODEL: 'claude-haiku-4-5' }, sheets: book(), fetch: () => ({ body: { content: [{ type: 'tool_use', name: 'manifest', input: { rows: [] } }], stop_reason: 'tool_use', usage: {} } }) });
  const b = call(); b.ai.max_tokens = 999999;
  assert.equal(s.post(b).ok, true);
  assert.equal(s.calls[0].req.output_config, undefined); assert.equal(s.calls[0].req.max_tokens, 16000);
});

test('ошибки API и тайм-аут — понятные сообщения, строка «ошибка» в журнале', () => {
  const cases = [
    [{ status: 401, body: { error: { message: 'invalid x-api-key' } } }, /ANTHROPIC_API_KEY/, 'http401'],
    [{ status: 404, body: { error: { message: 'model: claude-x' } } }, /AI_MODEL/, 'http404'],
    [{ status: 400, body: { error: { message: 'Your credit balance is too low' } } }, /закончились деньги/, 'http400'],
    [{ status: 529, body: { error: { message: 'Overloaded' } } }, /перегружен/, 'http529'],
    [new Error('Timeout: https://api.anthropic.com/v1/messages'), /не ответил вовремя/, 'timeout'],
    [{ body: { content: [], stop_reason: 'max_tokens', usage: { output_tokens: 3000 } } }, /не поместился/, 'truncated']
  ];
  for (const [resp, re, code] of cases) {
    const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k' }, sheets: book(), fetch: () => resp });
    const r = s.post(call());
    assert.equal(r.ok, undefined); assert.match(r.error, re); assert.equal(r.code, code);
    assert.match(s.book.sheets['ИИ-журнал'].rows[1][11], /^ошибка/);
  }
});

test('слишком большой запрос не уходит в API', () => {
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k' }, sheets: book(), fetch: () => toolReply({}) });
  const b = call(); b.ai.content = [{ type: 'text', text: 'x'.repeat(15 * 1024 * 1024 + 10) }];
  const r = s.post(b);
  assert.equal(r.code, 'size'); assert.equal(s.calls.length, 0);
});

test('подтверждение пишется в журнал и возвращается в выгрузке для проверки дубликатов', () => {
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  s.post(ping());
  const data = { date: '2026-09-20', route: 'HORGOS TO TASHKENT', places: 120, cbm: 45.5, kg: 9100, edits: 3 };
  assert.equal(s.post({ token: '', login: 'buraq', ai: { action: 'log', meta: { status: 'confirmed', draft: 'd7', file: 'm.xlsx', data } } }).ok, true);
  s.post({ token: '', login: 'buraq', ai: { action: 'log', meta: { status: 'rejected', draft: 'd8', data: { date: '2026-09-21' } } } });
  const log = s.book.sheets['ИИ-журнал'].rows;
  assert.deepEqual(log.slice(2).map(r => [r[4], r[11]]), [['подтверждение', 'подтверждён'], ['отклонение', 'отклонён']]);
  const d = s.get();
  assert.equal(d.data.imports.length, 1); assert.equal(d.data.imports[0].route, 'HORGOS TO TASHKENT'); assert.equal(d.data.imports[0].draft, 'd7'); assert.equal(d.data.imports[0].edits, 3);
});

test('маркировки клиента — столбец Y (добавляется, если листа не хватает) и выгрузка 25 столбцов', () => {
  const s = loadScript({ sheets: book(), fetch: () => toolReply({}) });
  const r = s.post({ token: '', ops: [{ t: 'cli.upsert', v: { bl: 'BL-7', brand: 'SVETKO', marks: 'CBETKO, СВЕТКО' } }] });
  assert.equal(r.ok, true);
  const m = s.book.sheets.Mijozlar;
  assert.equal(m.maxCols, 25); assert.equal(m.rows[3][24], 'Markirovkalar'); assert.equal(m.rows[4][0], 'BL-7'); assert.equal(m.rows[4][24], 'CBETKO, СВЕТКО');
  assert.equal(r.data.sheets.Mijozlar[4][24], 'CBETKO, СВЕТКО');
  // правка без marks не трогает столбец Y
  s.post({ token: '', ops: [{ t: 'cli.upsert', key: 'BL-7', v: { bl: 'BL-7', brand: 'SVETKO 2' } }] });
  assert.equal(m.rows[4][24], 'CBETKO, СВЕТКО'); assert.equal(m.rows[4][1], 'SVETKO 2');
});

test('пределы плотности — строки 71–72 листа «Sozlamalar» с подписями', () => {
  const s = loadScript({ sheets: book(), fetch: () => toolReply({}) });
  s.post({ token: '', ops: [{ t: 'set', v: { densityMin: 40, densityMax: 800 } }] });
  const z = s.book.sheets.Sozlamalar.rows;
  assert.equal(z[70][1], 40); assert.equal(z[71][1], 800); assert.match(z[70][0], /zichlik/i); assert.match(z[71][0], /zichlik/i);
});

// Сайт выбирает дату партии 04.05.2006, скрипт с поясом «Алматы» (в 2006 году — UTC+6) записывал её как полночь
// своего пояса = 23:00 03.05.2006 в таблице с поясом Ташкента (UTC+5), и дата на сайте становилась 03.05.2006.
// В заглушке таблица — Ташкент; пояс скрипта — это пояс процесса Node (new Date(г, м, д) в скрипте).
test('дата партии — полночь по поясу таблицы, а не скрипта: при поясе скрипта «Алматы» 04.05.2006 не становится 03.05.2006', () => {
  const tz0 = process.env.TZ; process.env.TZ = 'Asia/Almaty';
  try {
    const s = loadScript({ props: { TOKEN: 'pw' }, sheets: book() });
    const up = (row, date, bl) => s.post({ token: 'pw', ops: [{ t: 'ship.upsert', row, guard: { bl, date }, v: { date, bl, cbm: 1, kg: 10, places: 1, truck: 'Gazel-1', route: 1, status: 'Rejada', note: '' } }] });
    up(0, '2006-05-04', 'BL-1'); up(0, '2026-09-28', 'BL-2'); up(0, '2023-02-01', 'BL-3');
    const tash = d => new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    assert.deepEqual(s.book.sheets.Yuborishlar.rows.slice(4).map(r => tash(r[0])), ['2006-05-04 00:00', '2026-09-28 00:00', '2023-02-01 00:00'], 'в таблице — полночь нужного дня');
    // сайт получает дату целым числом дней: 04.05.2006 → 38841
    const ship = s.get({ token: 'pw' }).data.sheets.Yuborishlar.slice(4).map(r => r[0]);
    assert.deepEqual(ship, [38841, 46293, 44958]);
    // правка той же строки по дате находит её (защита от сдвига строк)
    assert.equal(up(9, '2006-05-04', 'BL-1').results[0].row, 5);
  } finally { if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0; }
});

test('даты, которые прежний код уже записал со сдвигом пояса, исправляются один раз сами: 18:00 и позже — следующий день, раньше — тот же', () => {
  const sheets = book(), tash = (y, m, d, h = 0) => new Date(Date.UTC(y, m - 1, d, h) - 5 * 3600e3);
  sheets.Yuborishlar.rows.push([tash(2006, 5, 3, 23), '', 'BL-1'], [tash(2026, 9, 28), '', 'BL-2'], [tash(2026, 9, 27, 5), '', 'BL-3'], ['31.08.2026', '', 'BL-4'],
    [tash(2026, 9, 27, 13), '', 'BL-5'], [tash(2026, 9, 26, 21), '', 'BL-6']);
  const s = loadScript({ props: { TOKEN: 'pw' }, sheets });
  const ship = s.get({ token: 'pw' }).data.sheets.Yuborishlar.slice(4).map(r => r[0]);
  // 23:00 (скрипт в «Алматы», 2006) и 21:00 (скрипт в Китае) → следующий день; 05:00 (UTC) и 13:00 (Лос-Анджелес) → тот же
  assert.deepEqual(ship, [38841, 46293, 46292, '31.08.2026', 46292, 46292], 'текст не трогаем');
  assert.equal(s.props.SHIP_DATES_FIXED, '1');
  // второй раз не трогает: даже если кто-то вписал время руками
  s.book.sheets.Yuborishlar.rows[5][0] = tash(2026, 9, 28, 23);
  assert.ok(Math.abs(s.get({ token: 'pw' }).data.sheets.Yuborishlar[5][0] - (46293 + 23 / 24)) < 1e-6, 'повторно не исправляет');
});

// ── версия 19: без пароля скрипт закрыт ──
import { TEST_TOKEN, TEST_EDITOR } from './gs-mock.mjs';
const noFetch = () => { throw new Error('внешний запрос не должен уходить'); };

test('версия 19: без свойства TOKEN скрипт никого не пускает — «Задайте TOKEN…», данные и ИИ не отдаются', () => {
  const s = loadScript({ auth: false, props: { ANTHROPIC_API_KEY: 'k', EDITOR_TOKEN: 'ed' }, sheets: book(), fetch: noFetch });
  for (const r of [s.rawGet({}), s.rawGet({ token: 'что-угодно' }), s.rawGet({ resolve: 'https://maps.app.goo.gl/x' }), s.rawPost({ ops: [] }), s.rawPost(ping({ token: '', editor: 'ed' })), s.rawPost({ token: 'x', tg: { action: 'setup' }, editor: 'ed' })]) {
    assert.equal(r.code, 'nopass', JSON.stringify(r)); assert.match(r.error, /^Задайте TOKEN в свойствах скрипта/); assert.equal(r.v, 20);
    assert.equal(r.data, undefined); assert.equal(r.ok, undefined);
  }
  assert.equal(s.calls.length, 0, 'ни ИИ, ни раскрытия ссылок');
  assert.equal(s.book.sheets.Yuborishlar.rows.length, 4, 'запись в таблицу не прошла');
  assert.equal(s.rawPost({ token: '', ops: [{ t: 'ship.upsert', v: { date: '2026-09-28', bl: 'BL-1', cbm: 1, kg: 1, places: 1, truck: 'Gazel-1', route: 1, status: 'Rejada', note: '' } }] }).code, 'nopass');
  assert.equal(s.book.sheets.Yuborishlar.rows.length, 4);
});

test('версия 19: TOKEN задан — без пароля и с чужим «Неверный пароль» (code pass); свойство находится и в другом регистре', () => {
  const s = loadScript({ auth: false, props: { ' token ': ' pw \n', EDITOR_TOKEN: 'ed' }, sheets: book(), fetch: noFetch });
  for (const r of [s.rawGet({}), s.rawGet({ token: '' }), s.rawGet({ token: 'PW' }), s.rawPost({ ops: [] }), s.rawPost({ token: 'x', ops: [] })]) {
    assert.deepEqual([r.error, r.code, r.v, r.data], ['Неверный пароль', 'pass', 20, undefined]);
  }
  const ok = s.rawGet({ token: 'pw' });
  assert.equal(ok.ok, true); assert.ok(ok.data.sheets.Yuborishlar);
  assert.equal(s.rawPost({ token: 'pw', ops: [] }).ok, true);
});

test('версия 19: обновления Telegram (?tg=) и фото с камеры водителя проверяются своей подписью, TOKEN им не нужен', () => {
  const sent = [];
  const s = loadScript({ auth: false, props: { TG_TOKEN: '123:ABC', TG_SECRET: 'hook-secret' }, sheets: book(), fetch: (req, o, n, url) => { sent.push(url); return { body: { ok: true, result: { message_id: 1 } } }; } });
  const out = s.tgPost({ update_id: 1, message: { message_id: 1, from: { id: 501, first_name: 'Akmal' }, chat: { id: 501, type: 'private' }, text: '/start' } });
  assert.deepEqual(out, { html: 'ok' }); assert.ok(sent.some(u => /sendMessage$/.test(u)), 'бот ответил без TOKEN');
  const n = sent.length;
  s.tgPost({ update_id: 2, message: { message_id: 2, from: { id: 501 }, chat: { id: 501, type: 'private' }, text: '/start' } }, 'чужой');
  assert.equal(sent.length, n, 'с чужим секретом — не обрабатывается');
  const ph = s.rawPost({ tgphoto: { init: 'испорчено', key: 'BL-1|1', ping: 1 } });
  assert.notEqual(ph.code, 'nopass'); assert.ok(ph.error, 'фото: отказ по подписи Telegram, а не по TOKEN');
});

test('версия 19: без EDITOR_TOKEN — отказ ИИ и боту с сайта («Задайте EDITOR_TOKEN…»), а не доступ по паролю таблицы', () => {
  const s = loadScript({ auth: false, props: { TOKEN: 'pw', ANTHROPIC_API_KEY: 'k', TG_TOKEN: '123:ABC' }, sheets: book(), fetch: noFetch });
  for (const r of [s.rawPost(ping({ token: 'pw' })), s.rawPost(ping({ token: 'pw', editor: 'любой' })), s.rawPost({ token: 'pw', tg: { action: 'setup', url: 'https://script.google.com/macros/s/A/exec' } }),
    s.rawPost({ token: 'pw', editor: '', tg: { action: 'dispatch', date: '2026-09-28' } })]) {
    assert.equal(r.code, 'noeditor', JSON.stringify(r)); assert.match(r.error, /^Задайте EDITOR_TOKEN в свойствах скрипта/); assert.equal(r.v, 20);
  }
  assert.equal(s.calls.length, 0, 'ни Claude, ни Telegram');
  assert.equal(s.book.sheets['ИИ-журнал'], undefined, 'в журнал ИИ ничего не записано');
  // с EDITOR_TOKEN: пустой и чужой — «editor», свой — работает
  const e = loadScript({ auth: false, props: { TOKEN: 'pw', EDITOR_TOKEN: 'ed', ANTHROPIC_API_KEY: 'k' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  assert.equal(e.rawPost(ping({ token: 'pw', editor: '' })).code, 'editor'); assert.equal(e.rawPost(ping({ token: 'pw', editor: 'ED' })).code, 'editor');
  assert.equal(e.rawPost(ping({ token: 'pw', editor: 'ed' })).ok, true);
});

// ── раскрытие ссылок на карту: только Google Карты, goo.gl, Яндекс Карты, 2ГИС ──
function mapScript(routes) {
  const s = loadScript({ sheets: book(), fetch: (req, o, n, url) => { const r = routes[url]; if (!r) throw new Error('непредусмотренный запрос: ' + url); return r; } });
  s.resolve = link => s.get({ resolve: link });
  s.urls = () => s.calls.map(c => c.url);
  return s;
}
const to = loc => ({ status: 302, headers: { Location: loc }, body: '' });

test('версия 19: чужие адреса не открываются — ни исходная ссылка, ни с «логин@», портом или путём не /maps', () => {
  const s = mapScript({});
  for (const bad of ['https://evil.example/x', 'http://169.254.169.254/latest/meta-data', 'https://maps.google.com@evil.example/x', 'https://maps.google.com.evil.example/maps',
    'https://www.google.com/search?q=1', 'https://yandex.ru/search?text=1', 'https://maps.google.com:8080/x', 'https://evil.example/?u=https://maps.google.com', 'ftp://maps.google.com/x',
    'https://maps.google.com\\@evil.example/', 'https://docs.google.com/maps/x', 'javascript:alert(1)']) {
    const r = s.resolve(bad);
    assert.equal(r.code, 'host', bad + ' → ' + JSON.stringify(r)); assert.match(r.error, /не ссылка на карту/);
  }
  assert.equal(s.calls.length, 0, 'ни одного внешнего запроса');
});

test('версия 19: короткие ссылки Google, goo.gl, Яндекс и 2ГИС раскрываются, в том числе по относительной переадресации', () => {
  const s = mapScript({
    'https://maps.app.goo.gl/abc': to('https://www.google.com/maps/place/@41.311,69.279,17z'),
    'https://www.google.com/maps/place/@41.311,69.279,17z': { body: '<html></html>' },
    'https://goo.gl/maps/xyz': to('https://maps.app.goo.gl/abc2'),
    'https://maps.app.goo.gl/abc2': to('/maps/place/@41.3,69.2,17z'),
    'https://maps.app.goo.gl/maps/place/@41.3,69.2,17z': to('https://maps.google.com/?q=41.3,69.2'),
    'https://maps.google.com/?q=41.3,69.2': { body: '' },
    'https://yandex.uz/maps/-/CDabc': to('https://yandex.uz/maps/10335/tashkent/?ll=69.2%2C41.3&z=17'),
    'https://yandex.uz/maps/10335/tashkent/?ll=69.2%2C41.3&z=17': { body: '"coordinates":[69.2,41.3]' },
    'https://go.2gis.com/k1': to('https://2gis.uz/tashkent/geo/70000001/69.2,41.3'),
    'https://2gis.uz/tashkent/geo/70000001/69.2,41.3': { body: '' }
  });
  let r = s.resolve('https://maps.app.goo.gl/abc');
  assert.equal(r.ok, true); assert.deepEqual(r.hops, ['https://maps.app.goo.gl/abc', 'https://www.google.com/maps/place/@41.311,69.279,17z']);
  r = s.resolve('https://goo.gl/maps/xyz');
  assert.equal(r.ok, true); assert.equal(r.url, 'https://maps.google.com/?q=41.3,69.2'); assert.equal(r.hops.length, 4);
  r = s.resolve('https://yandex.uz/maps/-/CDabc');
  assert.equal(r.ok, true); assert.deepEqual(r.ll, [41.3, 69.2]);
  r = s.resolve('https://go.2gis.com/k1');
  assert.equal(r.ok, true); assert.equal(r.url, 'https://2gis.uz/tashkent/geo/70000001/69.2,41.3');
});

test('версия 19: переадресация на чужой адрес не открывается — ни полная, ни «//хост», ни на Яндекс не /maps', () => {
  const s = mapScript({
    'https://maps.app.goo.gl/a': to('https://evil.example/steal'),
    'https://maps.app.goo.gl/b': to('//evil.example/steal'),
    'https://goo.gl/c': to('https://maps.app.goo.gl/d'),
    'https://maps.app.goo.gl/d': to('http://169.254.169.254/'),
    'https://yandex.ru/maps/-/e': to('https://yandex.ru/showcaptcha?retpath=x')
  });
  for (const [link, host] of [['https://maps.app.goo.gl/a', 'evil.example'], ['https://maps.app.goo.gl/b', 'evil.example'], ['https://goo.gl/c', '169.254.169.254'], ['https://yandex.ru/maps/-/e', 'yandex.ru']]) {
    const r = s.resolve(link);
    assert.equal(r.code, 'host', link); assert.match(r.error, new RegExp('ведёт не на карту \\(' + host.replace(/\./g, '\\.') + '\\)'));
  }
  assert.ok(!s.urls().some(u => /evil|169\.254|showcaptcha/.test(u)), 'чужие адреса не запрашивались: ' + s.urls().join(' '));
});
