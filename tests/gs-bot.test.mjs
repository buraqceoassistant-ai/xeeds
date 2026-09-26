// Телеграм-бот для водителей (tools/gs/Bot.gs) на заглушках: Telegram API, Google Диск, листы таблицы.
// Подключение с сайта, регистрация, привязка группы, подтверждение администратором, рабочий день по точкам
// (фото, геолокация, статус в журнале, отчёт в группу), отказ с причиной, второй рейс, изменения с сайта, конец дня.
// Данные вымышленные. Запуск: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './gs-mock.mjs';

const TODAY = '2026-09-26', day = (y, m, d) => new Date(Date.UTC(y, m - 1, d) - 5 * 3600e3);   // полночь по Ташкенту
const DEPOT = [41.30, 69.20];
function book() {
  const set = []; set[7] = ['', DEPOT[0]]; set[8] = ['', DEPOT[1]];
  ['Gazel-1', 'Gazel-2', 'Gazel-3', 'Labo', 'Kamaz-1', 'Mijoz ozi oladi', 'Belgilanmagan'].forEach((t, i) => { set[23 + i] = ['', '', t]; });
  const ship = [[], [], [], ['Sana']];
  const row = (date, bl, cbm, kg, places, truck, route, status = 'Rejada', note = '') => { const r = []; r[0] = date; r[2] = bl; r[9] = cbm; r[10] = kg; r[11] = places; r[12] = truck; r[13] = route; r[14] = status; r[15] = note; ship.push(r); };
  row(day(2026, 9, 26), 'BL-901', 1.2, 200, 10, 'Gazel-2', 1);
  row(day(2026, 9, 26), 'BL-902', 2, 300, 12, 'Gazel-2', 1, 'Rejada', 'осторожно, стекло');
  row(day(2026, 9, 26), 'BL-901', 0.3, 50, 2, 'Gazel-2', 1, 'Rejada', 'часть 2/2');
  row(day(2026, 9, 26), 'BL-903', 4, 900, 30, 'Gazel-2', 2);
  row(day(2026, 9, 26), 'BL-904', 1, 100, 5, 'Gazel-3', 1);
  row(day(2026, 9, 25), 'BL-905', 1, 100, 5, 'Gazel-2', 1);
  const cli = [[], [], [], ['BL kodi']];
  const c = (bl, brand, name, tel, recv, recvTel, district, address, lat, lon) => { const r = []; Object.assign(r, { 0: bl, 1: brand, 2: name, 3: tel, 5: recv, 6: recvTel, 7: district, 8: address, 10: lat, 11: lon }); cli.push(r); };
  c('BL-901', 'NOVA', 'Aziz', '+998900000001', 'Aziz', '+998900000001', 'Chilonzor', 'Bunyodkor 1', 41.31, 69.21);
  c('BL-902', '', 'Botir', '+998900000002', 'Omon', '+998900000022', 'Yunusobod', 'Amir Temur 2', 41.36, 69.28);
  c('BL-903', 'STAR', 'Dilshod', '+998900000003', '', '', 'Sergeli', 'Yangi Sergeli 3', 41.22, 69.22);
  const dense = rows => Array.from(rows, r => Array.from(r || []));   // без «дыр» в массивах
  return { Yuborishlar: { rows: dense(ship), maxCols: 21 }, Mijozlar: { rows: dense(cli), maxCols: 25 }, Sozlamalar: { rows: dense(set), maxCols: 3 } };
}
function fakeTelegram() {
  const sent = []; let mid = 100;
  const admins = { 900: 'administrator', 901: 'creator' };
  const fetch = (req, opts, n, url) => {
    if (/\/file\/bot/.test(url)) return { body: 'JPEG' };
    const m = url.match(/^https:\/\/api\.telegram\.org\/bot[^/]+\/(\w+)$/);
    if (!m) return { status: 404, body: {} };
    sent.push({ method: m[1], ...req });
    if (m[1] === 'getMe') return { body: { ok: true, result: { id: 1, username: 'buraq_test_bot', first_name: 'BURAQ' } } };
    if (m[1] === 'getChatMember') return { body: { ok: true, result: { status: admins[req.user_id] || 'member' } } };
    if (m[1] === 'getFile') return { body: { ok: true, result: { file_path: 'photos/' + req.file_id + '.jpg' } } };
    return { body: { ok: true, result: { message_id: ++mid } } };
  };
  return { sent, fetch };
}
function setup(props = {}) {
  const tg = fakeTelegram(), now = { value: new Date(Date.UTC(2026, 8, 26, 4, 0)) };   // 09:00 по Ташкенту
  const s = loadScript({ props: { TG_TOKEN: '123:ABC', ...props }, sheets: book(), fetch: tg.fetch, now });
  let uid = 1;
  const upd = x => s.tgPost({ update_id: uid++, ...x });
  const msg = (from, text, extra = {}) => upd({ message: { message_id: uid, from: { id: from, first_name: 'Akmal', username: 'akmal' }, chat: { id: from, type: 'private' }, text, ...extra } });
  const loc = (from, ll) => msg(from, undefined, { location: { latitude: ll[0], longitude: ll[1] } });
  const photo = (from, fid) => msg(from, undefined, { photo: [{ file_id: fid + '-s' }, { file_id: fid }] });
  const cb = (from, data, chat = { id: from, type: 'private' }, message = { message_id: 7, text: 'x', chat }) => upd({ callback_query: { id: 'q' + uid, from: { id: from, first_name: 'Boss' }, data, message } });
  const group = { id: -100500, type: 'supergroup', title: 'BURAQ — доставки' };
  const gmsg = (from, text) => upd({ message: { message_id: uid, from: { id: from, first_name: 'Boss' }, chat: group, text } });
  const last = (method, chat) => [...tg.sent].reverse().find(x => x.method === method && (chat == null || String(x.chat_id) === String(chat)));
  const texts = chat => tg.sent.filter(x => x.method === 'sendMessage' && String(x.chat_id) === String(chat)).map(x => x.text);
  const status = bl => s.book.sheets.Yuborishlar.rows.filter(r => r[2] === bl).map(r => r[14]);
  return { s, tg, now, upd, msg, loc, photo, cb, group, gmsg, last, texts, status };
}
const connect = t => t.s.post({ token: '', editor: '', tg: { action: 'setup', url: 'https://script.google.com/macros/s/AKfy-test_1/exec' } });

test('подключение с сайта: токен из свойств, вебхук с секретом, команды на двух языках; без токена и со старой ссылкой — ошибки', () => {
  const t = setup();
  const r = connect(t);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.v, 9); assert.equal(r.tg.bot, 'buraq_test_bot'); assert.match(r.tg.code, /^\d{6}$/);
  const hook = t.last('setWebhook');
  assert.equal(hook.url, 'https://script.google.com/macros/s/AKfy-test_1/exec?tg=' + t.s.props.TG_SECRET);
  assert.deepEqual(hook.allowed_updates, ['message', 'callback_query']);
  const cmds = t.tg.sent.filter(x => x.method === 'setMyCommands');
  assert.equal(cmds.length, 2); assert.equal(cmds[1].language_code, 'ru'); assert.deepEqual(cmds[0].commands.map(c => c.command), ['start', 'ish', 'hozir', 'tugatish', 'til']);
  assert.equal(connect(t).tg.code, r.tg.code, 'повторное подключение — тот же код группы');
  const n = setup({ TG_TOKEN: '' }), e = connect(n);
  assert.equal(e.code, 'notoken'); assert.match(e.error, /TG_TOKEN/);
  assert.equal(t.s.post({ token: '', tg: { action: 'setup', url: 'https://example.com/x' } }).code, 'url');
  const ed = setup({ EDITOR_TOKEN: 'sec' });
  assert.equal(connect(ed).code, 'editor');
  // ссылка скрипта рабочего аккаунта Google
  assert.equal(t.s.post({ token: '', tg: { action: 'setup', url: 'https://script.google.com/a/macros/buraq.uz/s/AKfy1/exec' } }).ok, true);
});

test('группа стала супергруппой: бот запоминает её новый адрес и повторяет отправку', () => {
  const t = setup(); const r = connect(t);
  t.gmsg(900, '/ulash ' + r.tg.code);
  let migrated = false;
  t.s.props.TG_GROUP = String(t.group.id);
  const orig = t.s.ctx.UrlFetchApp.fetch;
  t.s.ctx.UrlFetchApp.fetch = (url, opts) => {
    const req = opts && opts.payload ? JSON.parse(opts.payload) : {};
    if (!migrated && /sendMessage$/.test(url) && String(req.chat_id) === String(t.group.id)) { migrated = true; return { getContentText: () => JSON.stringify({ ok: false, error_code: 400, description: 'group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -1009999 } }) }; }
    return orig(url, opts);
  };
  register(t);
  assert.equal(t.s.props.TG_GROUP, '-1009999');
  assert.match(t.last('sendMessage', -1009999).text, /Новый водитель/);
});

test('обновление без секрета или с чужим — не обрабатывается; ответ Telegram — HtmlService (без переадресации)', () => {
  const t = setup(); connect(t); const n = t.tg.sent.length;
  const out = t.s.tgPost({ update_id: 1, message: { from: { id: 5 }, chat: { id: 5, type: 'private' }, text: '/start' } }, 'чужой');
  assert.deepEqual(out, { html: 'ok' }); assert.equal(t.tg.sent.length, n);
});

function register(t, id = 501, lang = 'ru', truckIdx = 1) {
  t.msg(id, '/start');
  t.cb(id, 'lang:' + lang);
  t.msg(id, 'Akmal Karimov');
  t.cb(id, 'trk:' + truckIdx);
  t.msg(id, '01a 123-bc');
  t.cb(id, 'reg:send');
}

test('регистрация: язык, имя, машина кнопками (без «Belgilanmagan»), госномер; заявка в группу после привязки; только администратор подтверждает', () => {
  const t = setup(); const r = connect(t);
  t.msg(501, '/start');
  assert.match(t.last('sendMessage', 501).text, /Tilni tanlang[\s\S]*Выберите язык/);
  t.cb(501, 'lang:ru');
  assert.match(t.last('sendMessage', 501).text, /имя и фамилию/);
  t.msg(501, '12');
  assert.match(t.last('sendMessage', 501).text, /буквами/);
  t.msg(501, 'Akmal Karimov');
  const kb = t.last('sendMessage', 501).reply_markup.inline_keyboard.flat().map(b => b.text);
  assert.deepEqual(kb, ['Gazel-1', 'Gazel-2', 'Gazel-3', 'Labo', 'Kamaz-1']);
  t.cb(501, 'trk:1');
  t.msg(501, '01a 123-bc');
  assert.match(t.last('sendMessage', 501).text, /Akmal Karimov\n🚚 Gazel-2\n🔢 01A 123 BC/);
  t.cb(501, 'reg:send');
  assert.match(t.last('sendMessage', 501).text, /Заявка отправлена/);
  const d = t.s.book.sheets.Haydovchilar.rows[1];
  assert.deepEqual([d[0], d[1], d[2], d[3], d[4], d[5]], ['501', 'Akmal Karimov', 'Gazel-2', '01A 123 BC', 'ru', 'kutilmoqda']);
  // группа: неверный код, верный код — привязка и заявка с кнопками
  t.gmsg(900, '/ulash 000000');
  assert.match(t.last('sendMessage', t.group.id).text, /Код не подходит/);
  t.gmsg(900, '/ulash@buraq_test_bot ' + r.tg.code);
  assert.equal(t.s.props.TG_GROUP, String(t.group.id));
  const ask = t.last('sendMessage', t.group.id);
  assert.match(ask.text, /Новый водитель: Akmal Karimov\n🚚 Gazel-2 · 01A 123 BC\nTelegram: @akmal/);
  assert.deepEqual(ask.reply_markup.inline_keyboard[0].map(b => b.callback_data), ['allow:501', 'deny:501']);
  // пока нет разрешения — бот ничего не показывает
  t.msg(501, '🚚 Начать работу');
  assert.match(t.last('sendMessage', 501).text, /на рассмотрении/);
  // не администратор группы
  t.cb(777, 'allow:501', t.group);
  assert.equal(t.last('answerCallbackQuery').show_alert, true);
  assert.equal(t.s.book.sheets.Haydovchilar.rows[1][5], 'kutilmoqda');
  t.cb(900, 'allow:501', t.group, { message_id: 55, text: ask.text, chat: t.group });
  assert.equal(t.s.book.sheets.Haydovchilar.rows[1][5], 'ruxsat');
  assert.match(t.last('sendMessage', 501).text, /Доступ открыт/);
  assert.deepEqual(t.last('sendMessage', 501).reply_markup.keyboard, [['🚚 Начать работу', '📍 Текущая точка'], ['🏁 Закончить работу', '🌐 Язык']]);
  assert.match(t.last('editMessageText').text, /✅ Разрешено — Boss/);
});

test('повтор того же update_id не обрабатывается дважды', () => {
  const t = setup(); connect(t);
  const u = { update_id: 42, message: { from: { id: 7 }, chat: { id: 7, type: 'private' }, text: '/start' } };
  t.s.tgPost(u); const n = t.tg.sent.length; t.s.tgPost(u);
  assert.equal(t.tg.sent.length, n);
});

function approved() {
  const t = setup(); const r = connect(t);
  t.gmsg(900, '/ulash ' + r.tg.code);
  register(t);
  t.cb(900, 'allow:501', t.group);
  return t;
}

test('рабочий день: геолокация → ближайшая точка рейса 1 (части одной отгрузки — одна точка), фото → геолокация → «Yetkazildi», Диск, «Yetkazish», отчёт в группу', () => {
  const t = approved(), g = t.group.id;
  t.msg(501, '🚚 Начать работу');
  assert.match(t.last('sendMessage', 501).text, /отправьте геолокацию/);
  assert.equal(t.last('sendMessage', 501).reply_markup.keyboard[0][0].request_location, true);
  t.loc(501, DEPOT);
  assert.match(t.last('sendMessage', g).text, /Akmal Karimov \(Gazel-2\) начал работу в 09:00 · точек на сегодня: 3/);
  const day = t.s.book.sheets['Ish kuni'].rows[1];
  assert.deepEqual([day[0], day[2], day[3], day[4]], [TODAY, 'Gazel-2', '09:00', DEPOT.join(',')]);
  // первая точка — ближайшая к складу: BL-901 (две строки журнала — одна точка, груз сложен)
  const card = t.tg.sent.filter(x => x.method === 'sendMessage' && x.chat_id === '501').map(x => x.text).find(x => /Точка/.test(x));
  assert.match(card, /📦 Точка 1 из 2 · рейс 1/); assert.match(card, /🏷 BL-901 · NOVA — Aziz/); assert.match(card, /📍 Chilonzor, Bunyodkor 1/);
  assert.match(card, /👤 Получатель: Aziz · \+998900000001/); assert.match(card, /📦 12 мест · 1,5 м³ · 250 кг/);
  assert.deepEqual([t.last('sendLocation', 501).latitude, t.last('sendLocation', 501).longitude], [41.31, 69.21]);
  // «Доставлено»: без фото нельзя
  t.cb(501, 'ok:BL-901|1');
  assert.match(t.last('sendMessage', 501).text, /Отправьте фото/);
  t.msg(501, '✅ Готово');
  assert.match(t.last('sendMessage', 501).text, /хотя бы одно фото/);
  t.photo(501, 'PH1'); t.photo(501, 'PH2');
  assert.match(t.last('sendMessage', 501).text, /Фото принято: 2/);
  t.msg(501, '✅ Готово');
  assert.match(t.last('sendMessage', 501).text, /Отправьте геолокацию/);
  t.msg(501, 'привет');
  assert.match(t.last('sendMessage', 501).text, /Отправить геолокацию/);
  t.loc(501, [41.311, 69.211]);
  assert.deepEqual(t.status('BL-901'), ['Yetkazildi', 'Yetkazildi']);
  assert.deepEqual(t.s.files.map(f => f.name), ['2026-09-26 Gazel-2 BL-901 1.jpg', '2026-09-26 Gazel-2 BL-901 2.jpg']);
  const log = t.s.book.sheets.Yetkazish.rows[1];
  assert.deepEqual([log[1], log[2], log[3], log[4], log[5], log[6]], [TODAY, 'Akmal Karimov', 'Gazel-2', 'BL-901', 'NOVA — Aziz', 'Yetkazildi']);
  assert.match(log[8], /drive\.google\.com\/file\/d\/file1 https:\/\/drive\.google\.com\/file\/d\/file2/); assert.equal(log[9], '41.311,69.211');
  const album = t.last('sendMediaGroup', g);
  assert.deepEqual(album.media.map(m => m.media), ['PH1', 'PH2']);
  assert.match(album.media[0].caption, /✅ Gazel-2 · Akmal Karimov — доставлено: BL-901 NOVA — Aziz\n09:00 · 📍 https:\/\/maps\.google\.com\/\?q=41\.311,69\.211/);
  // следующая точка — BL-902 (последняя в рейсе 1)
  assert.match(t.texts(501).filter(x => /Точка/.test(x)).pop(), /Точка 2 из 2 · рейс 1[\s\S]*BL-902[\s\S]*Получатель: Omon[\s\S]*☎️ Тел: \+998900000002[\s\S]*Примечание: осторожно, стекло/);
  // старая кнопка
  t.cb(501, 'ok:BL-901|1');
  assert.match(t.texts(501).slice(-2)[0], /кнопка устарела/);
});

test('«Не доставлено»: причина, без фото, геолокация → «Qolib ketgan», отчёт с причиной; конец рейса 1 → рейс 2 со склада', () => {
  const t = approved(), g = t.group.id;
  t.msg(501, '🚚 Начать работу'); t.loc(501, DEPOT);
  t.cb(501, 'ok:BL-901|1'); t.photo(501, 'P'); t.msg(501, '✅ Готово'); t.loc(501, [41.31, 69.21]);
  t.cb(501, 'fail:BL-902|1');
  assert.deepEqual(t.last('sendMessage', 501).reply_markup.inline_keyboard.map(r => r[0].text), ['Клиента нет на месте', 'Не отвечает на телефон', 'Отказался от груза', 'Другая причина']);
  t.cb(501, 'why:1');
  assert.match(t.last('sendMessage', 501).text, /Без фото/);
  t.msg(501, '➡️ Без фото');
  t.loc(501, [41.36, 69.28]);
  assert.deepEqual(t.status('BL-902'), ['Qolib ketgan']);
  assert.match(t.last('sendMessage', g).text, /❌ Gazel-2 · Akmal Karimov — не доставлено: BL-902 Botir\nПричина: Не отвечает на телефон/);
  const round = t.last('sendMessage', 501);
  assert.match(round.text, /Рейс 1 закончен/); assert.equal(round.reply_markup.inline_keyboard[0][0].callback_data, 'round:2');
  t.cb(501, 'round:2');
  assert.match(t.texts(501).filter(x => /Точка/.test(x)).pop(), /Точка 1 из 1 · рейс 2[\s\S]*BL-903 · STAR — Dilshod/);
  // «другая причина» — текстом
  const u = approved();
  u.msg(501, '🚚 Начать работу'); u.loc(501, DEPOT); u.cb(501, 'fail:BL-901|1'); u.cb(501, 'why:3');
  assert.match(u.last('sendMessage', 501).text, /Коротко напишите причину/);
  u.msg(501, 'ворота закрыты'); u.msg(501, '➡️ Без фото'); u.loc(501, DEPOT);
  assert.match(u.last('sendMessage', u.group.id).text, /Причина: ворота закрыты/);
});

test('правки на сайте: статус от бота не затирается старым значением сайта; водителю — «рейсы изменились» и новая текущая точка', () => {
  const t = approved();
  t.msg(501, '🚚 Начать работу'); t.loc(501, DEPOT);
  t.cb(501, 'ok:BL-901|1'); t.photo(501, 'P'); t.msg(501, '✅ Готово'); t.loc(501, [41.31, 69.21]);
  // сайт не знает о доставке: шлёт статус «Rejada», но меняет только примечание — статус в таблице остаётся
  const was = { date: TODAY, bl: 'BL-901', cbm: 1.2, kg: 200, places: 10, truck: 'Gazel-2', route: 1, status: 'Rejada', note: '' };
  t.s.post({ token: '', ops: [{ t: 'ship.upsert', row: 5, guard: { bl: 'BL-901', date: TODAY }, was, v: { ...was, note: 'позвонить заранее' } }] });
  assert.equal(t.s.book.sheets.Yuborishlar.rows[4][14], 'Yetkazildi'); assert.equal(t.s.book.sheets.Yuborishlar.rows[4][15], 'позвонить заранее');
  // старый сайт (без was) пишет всё, как раньше
  t.s.post({ token: '', ops: [{ t: 'ship.upsert', row: 8, guard: { bl: 'BL-903', date: TODAY }, v: { date: TODAY, bl: 'BL-903', cbm: 4, kg: 900, places: 30, truck: 'Gazel-2', route: 2, status: 'Rejada', note: 'x' } }] });
  assert.equal(t.s.book.sheets.Yuborishlar.rows[7][15], 'x');
  // текущую точку BL-902 перевели на другую машину — водителю сообщение и конец рейса 1
  const n = t.texts(501).length;
  const w2 = { date: TODAY, bl: 'BL-902', cbm: 2, kg: 300, places: 12, truck: 'Gazel-2', route: 1, status: 'Rejada', note: 'осторожно, стекло' };
  t.s.post({ token: '', ops: [{ t: 'ship.upsert', row: 6, guard: { bl: 'BL-902', date: TODAY }, was: w2, v: { ...w2, truck: 'Gazel-3' } }] });
  const after = t.texts(501).slice(n);
  assert.match(after[0], /рейсы на сегодня изменились/); assert.match(after[1], /Рейс 1 закончен/);
  // правки не про отгрузки — водителям ничего
  const m = t.tg.sent.length; t.s.post({ token: '', ops: [{ t: 'set', v: { speed: 30 } }] }); assert.equal(t.tg.sent.length, m);
});

test('дата с неполным годом («0001-01-01») не пишется в таблицу — иначе строка стала бы 1900 годом и пропала с сайта', () => {
  const t = setup(); const n = t.s.book.sheets.Yuborishlar.rows.length;
  const r = t.s.post({ token: '', ops: [{ t: 'ship.upsert', v: { date: '0001-01-01', bl: 'BL-908', cbm: 1, kg: 1, places: 1, truck: 'Belgilanmagan', route: '', status: 'Rejada', note: '' } }] });
  assert.equal(r.results[0].error, 'bad date'); assert.equal(t.s.book.sheets.Yuborishlar.rows.length, n);
  const ok = t.s.post({ token: '', ops: [{ t: 'ship.upsert', v: { date: '2026-09-26', bl: 'BL-908', cbm: 1, kg: 1, places: 1, truck: 'Belgilanmagan', route: '', status: 'Rejada', note: '' } }] });
  assert.equal(ok.results[0].row, n + 1);
});

test('конец дня: геолокация → «Ish kuni» (конец, итоги), итог водителю и в группу; выгрузка для сайта — водители без состояния диалога', () => {
  const t = approved(), g = t.group.id;
  t.msg(501, '🏁 Закончить работу');
  assert.match(t.last('sendMessage', 501).text, /Сначала нажмите/);
  t.msg(501, '🚚 Начать работу'); t.loc(501, DEPOT);
  t.cb(501, 'ok:BL-901|1'); t.photo(501, 'P'); t.msg(501, '✅ Готово'); t.loc(501, [41.31, 69.21]);
  t.now.value = new Date(Date.UTC(2026, 8, 26, 13, 30));   // 18:30
  t.msg(501, '🏁 Закончить работу'); t.loc(501, DEPOT);
  const day = t.s.book.sheets['Ish kuni'].rows[1];
  assert.deepEqual([day[5], day[6], day[7], day[8]], ['18:30', DEPOT.join(','), 1, 0]);
  assert.match(t.last('sendMessage', 501).text, /Доставлено: 1, не доставлено: 0, осталось: 2/);
  assert.match(t.last('sendMessage', g).text, /Akmal Karimov \(Gazel-2\) закончил работу в 18:30: доставлено 1, не доставлено 0, осталось 2/);
  const info = t.s.get({}).data.tg;
  assert.equal(info.bot, 'buraq_test_bot'); assert.equal(info.grouped, true); assert.equal(info.group, 'BURAQ — доставки');
  assert.equal(info.drivers.length, 1); assert.deepEqual(info.drivers[0].today, { started: '09:00', ended: '18:30', ok: 1, fail: 0, pos: [41.31, 69.21] });
  assert.equal(info.drivers[0].st, undefined);
});

test('сайт отключает водителя: бот ему больше ничего не показывает; язык переключается кнопкой', () => {
  const t = approved();
  t.msg(501, '🌐 Язык');
  assert.match(t.last('sendMessage', 501).text, /Til: o‘zbekcha/);
  assert.equal(t.last('sendMessage', 501).reply_markup.keyboard[0][0], '🚚 Ishni boshlash');
  const r = t.s.post({ token: '', tg: { action: 'driver', id: '501', status: 'o‘chirilgan' } });
  assert.equal(r.ok, true); assert.equal(r.tg.drivers[0].status, 'o‘chirilgan');
  assert.match(t.last('sendMessage', 501).text, /ruxsati yo‘q/);
  t.msg(501, '🚚 Ishni boshlash');
  assert.match(t.last('sendMessage', 501).text, /ruxsati yo‘q/);
});
