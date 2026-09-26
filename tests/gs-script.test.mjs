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
  assert.equal(r.ok, true); assert.equal(r.v, 11); assert.equal(r.model, 'claude-sonnet-5'); assert.deepEqual(r.result, { reply: 'готов' });
  assert.equal(r.mode, 'tool'); assert.equal(r.editorSet, false); assert.deepEqual(r.usage, { in: 120, cache: 0, out: 30 });
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
  assert.match(loadScript({ sheets: book() }).post(ping()).error, /не видит ни одного свойства/);
});

test('имя свойства в другом регистре или с пробелами и ключ под другим именем — находятся', () => {
  for (const props of [{ 'anthropic_api_key ': ' sk-ant-1\n' }, { 'ANTHROPIC API KEY': 'sk-ant-1' }, { CLAUDE_KEY: 'sk-ant-1' }]) {
    const s = loadScript({ props, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
    const r = s.post(ping());
    assert.equal(r.ok, true, JSON.stringify(props)); assert.equal(s.calls[0].opts.headers['x-api-key'], 'sk-ant-1');
  }
  const s = loadScript({ props: { ANTHROPIC_API_KEY: 'k', ' editor_token': 'ed-secret\n', ai_model: ' claude-opus-5-5 ' }, sheets: book(), fetch: () => toolReply({ reply: 'готов' }) });
  assert.equal(s.post(ping()).code, 'editor');
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
  assert.equal(s.post(ping()).code, 'editor');
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
  assert.equal(s.get({ token: 'pw' }).v, 11);
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
