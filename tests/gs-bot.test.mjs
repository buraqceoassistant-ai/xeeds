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
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.v, 10); assert.equal(t.s.triggers.length, 1); assert.equal(t.s.triggers[0].fn, 'tgDailySummary'); assert.equal(t.s.triggers[0].hour, 20); assert.equal(r.tg.bot, 'buraq_test_bot'); assert.match(r.tg.code, /^\d{6}$/);
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
  assert.match(t.last('sendMessage', g).text, /Akmal Karimov \(Gazel-2\) начал работу в 09:00 · точек: 3/);
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
  assert.equal(info.drivers.length, 1); assert.deepEqual(info.drivers[0].today, { started: '09:00', ended: '18:30', ok: 1, fail: 0, pos: DEPOT, posAt: '18:30', date: TODAY, cur: { bl: 'BL-902', round: 1 } });
  assert.equal(info.log.length, 1); assert.equal(info.log[0].bl, 'BL-901'); assert.equal(info.log[0].ok, true); assert.equal(info.log[0].photos.length, 1);
  assert.deepEqual([info.days[0].day, info.days[0].start, info.days[0].end, info.days[0].ok, info.days[0].date], [TODAY, '09:00', '18:30', 1, TODAY]);
  assert.equal(info.drivers[0].st, undefined);
  // отметки: по умолчанию за 2 дня (опрос каждые 30 с), вкладка «Водители» просит до 45
  t.s.book.sheets.Yetkazish.rows.push(['2026-09-16 10:00', '2026-09-16', 'Akmal Karimov', 'Gazel-2', 'BL-800', 'Old', 'Yetkazildi', '', '', '', '501', 1]);
  assert.deepEqual([info.span, info.log.length], [2, 1]);
  const all = t.s.get({ tgdays: '45' }).data.tg;
  assert.deepEqual([all.span, all.log.map(x => x.bl).sort().join(',')], [45, 'BL-800,BL-901']);
  assert.equal(t.s.get({ tgdays: '999' }).data.tg.span, 45, 'не больше 45');
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

// автопарк с госномерами: Sozlamalar D24:D39
function withPlates(t) { const sh = t.s.book.sheets.Sozlamalar; sh.maxCols = 4; sh.set(25, 4, '01 A 222 BB'); return t; }

test('госномер машины из автопарка: водитель его не пишет, кнопки машин — с номерами; «plates» с сайта пишет столбец D', () => {
  const t = withPlates(setup()); connect(t);
  t.msg(501, '/start'); t.cb(501, 'lang:ru'); t.msg(501, 'Akmal Karimov');
  const kb = t.last('sendMessage', 501).reply_markup.inline_keyboard.flat().map(b => b.text);
  assert.deepEqual(kb.slice(0, 2), ['Gazel-1', 'Gazel-2 · 01 A 222 BB']);
  t.cb(501, 'trk:1');
  assert.match(t.last('sendMessage', 501).text, /Gazel-2\n🔢 01 A 222 BB/);
  t.cb(501, 'reg:send');
  assert.equal(t.s.book.sheets.Haydovchilar.rows[1][3], '01 A 222 BB');
  const r = t.s.post({ token: '', ops: [{ t: 'plates', v: { 'Gazel-1': '01 A 111 AA', 'Kamaz-1': '01 K 555 KK' } }] });
  assert.equal(r.results[0].ok, true);
  const set = t.s.book.sheets.Sozlamalar.rows;
  assert.deepEqual([set[23][3], set[24][3], set[27][3], set[22][3]], ['01 A 111 AA', '', '01 K 555 KK', 'Davlat raqami']);
  assert.equal(t.s.get({}).data.sheets.Sozlamalar[23].length, 4, 'выгрузка — 4 столбца');
  // список машин поменялся (Gazel-1 убрали, Kamaz-3 добавили) — номера остаются у своих машин
  const names = set.slice(23, 39).map(r => r[2]).filter(Boolean), next = names.filter(n => n !== 'Gazel-1').concat(['Kamaz-3']);
  assert.equal(t.s.post({ token: '', ops: [{ t: 'trucks', v: next }] }).results[0].ok, true);
  const now = Object.fromEntries(set.slice(23, 39).filter(r => r[2]).map(r => [r[2], r[3] || '']));
  assert.deepEqual([now['Gazel-1'], now['Gazel-2'], now['Kamaz-1'], now['Kamaz-3']], [undefined, '', '01 K 555 KK', '']);
  assert.equal(set[26][2] + ' ' + set[26][3], 'Kamaz-1 01 K 555 KK', 'Kamaz-1 сдвинулась вверх вместе с номером');
});

test('«Отправить» партию с сайта: задание со списком точек по рейсам; «Начать работу» — точки этой партии, даже если дата не сегодня', () => {
  const t = approved(), g = t.group.id;
  // партия вчерашняя (25.09): переносим отгрузки Gazel-2 на 25.09
  t.s.book.sheets.Yuborishlar.rows.forEach(r => { if (r[12] === 'Gazel-2' && r[2] !== 'BL-905') r[0] = day(2026, 9, 25); });
  const r = t.s.post({ token: '', tg: { action: 'dispatch', date: '2026-09-25' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.sent.map(x => [x.truck, x.n]), [['Gazel-2', 4]]);
  assert.deepEqual(r.skipped, []);
  const a = t.last('sendMessage', 501).text;
  assert.match(a, /Задание: партия 25\.09\.2026\n🚚 Gazel-2 · точек: 4/); assert.match(a, /— рейс 1 —\n1\. BL-901 · NOVA · Chilonzor\n2\. BL-902 · Botir · Yunusobod/); assert.match(a, /3\. BL-905\n— рейс 2 —\n4\. BL-903 · STAR · Sergeli/);
  assert.equal(r.tg.drivers[0].assign.date, '2026-09-25');
  t.msg(501, '🚚 Начать работу'); t.loc(501, DEPOT);
  assert.match(t.last('sendMessage', g).text, /партия 25\.09\.2026 · точек: 4/);
  assert.match(t.texts(501).filter(x => /Точка/.test(x)).pop(), /BL-901/);
  const dayRow = t.s.book.sheets['Ish kuni'].rows[1];
  assert.deepEqual([dayRow[0], dayRow[10]], [TODAY, '2026-09-25']);
  // водитель уже работает — новое задание сразу меняет партию и присылает первую точку
  t.s.book.sheets.Yuborishlar.rows.forEach(r => { if (r[2] === 'BL-904') r[12] = 'Gazel-2'; });
  const r2 = t.s.post({ token: '', tg: { action: 'dispatch', date: TODAY, ids: ['501'] } });
  assert.deepEqual(r2.sent.map(x => x.n), [1]);
  const last3 = t.texts(501).slice(-3);
  assert.match(last3[0], /Новое задание: партия 26\.09\.2026 — точек: 1/); assert.match(last3[1], /Точка 1 из 1 · рейс 1\n\n🏷 BL-904\n📦 5 мест/);
  // партия без водителя в боте — в пропущенных
  const r3 = t.s.post({ token: '', tg: { action: 'dispatch', date: '2026-09-25' } });
  assert.ok(r3.skipped.some(x => x.truck === 'Gazel-2' && x.why === 'нет точек') || r3.sent.length === 1);
});

test('«Отправить всем»: машины с точками, но без водителя в боте — в ответе сайту', () => {
  const t = approved();
  const r = t.s.post({ token: '', tg: { action: 'dispatch', date: TODAY } });
  assert.deepEqual(r.sent.map(x => x.truck), ['Gazel-2']); assert.deepEqual(r.skipped, [{ truck: 'Gazel-3', why: 'нет водителя в боте' }]);
  assert.equal(t.s.post({ token: '', tg: { action: 'dispatch', date: '26.09.2026' } }).error, 'Выберите партию');
});

test('задание изменилось на сайте до начала работы — водителю новый список', () => {
  const t = approved();
  t.s.post({ token: '', tg: { action: 'dispatch', date: TODAY } });
  const n = t.texts(501).length;
  const w2 = { date: TODAY, bl: 'BL-902', cbm: 2, kg: 300, places: 12, truck: 'Gazel-2', route: 1, status: 'Rejada', note: 'осторожно, стекло' };
  t.s.post({ token: '', ops: [{ t: 'ship.upsert', row: 6, guard: { bl: 'BL-902', date: TODAY }, was: w2, v: { ...w2, truck: 'Gazel-3' } }] });
  const m = t.texts(501).slice(n);
  assert.equal(m.length, 1); assert.match(m[0], /Задание изменилось\.\n\n📋 Задание: партия 26\.09\.2026\n🚚 Gazel-2 · точек: 2/);
});

test('«Написать водителю»: выбранным и всем на линии', () => {
  const t = approved();
  assert.equal(t.s.post({ token: '', tg: { action: 'message', ids: ['501'], text: 'Позвоните в офис' } }).sent, 1);
  assert.match(t.last('sendMessage', 501).text, /Сообщение от руководителя:\nПозвоните в офис/);
  assert.equal(t.s.post({ token: '', tg: { action: 'message', ids: 'online', text: 'x' } }).sent, 0, 'никто не на линии');
  t.msg(501, '🚚 Начать работу'); t.loc(501, DEPOT);
  assert.equal(t.s.post({ token: '', tg: { action: 'message', ids: 'online', text: 'Обед до 14:00' } }).sent, 1);
  assert.equal(t.s.post({ token: '', tg: { action: 'message', ids: ['501'], text: '  ' } }).error, 'Пустое сообщение');
});

test('итог дня в группу: по машинам — доставлено, не доставлено, осталось, время; по кнопке и по расписанию', () => {
  const t = approved(), g = t.group.id;
  assert.match(t.s.post({ token: '', tg: { action: 'summary' } }).error, /ещё не работали/);
  t.msg(501, '🚚 Начать работу'); t.loc(501, DEPOT);
  t.cb(501, 'ok:BL-901|1'); t.photo(501, 'P'); t.msg(501, '✅ Готово'); t.loc(501, [41.31, 69.21]);
  t.cb(501, 'fail:BL-902|1'); t.cb(501, 'why:0'); t.msg(501, '➡️ Без фото'); t.loc(501, DEPOT);
  const r = t.s.post({ token: '', tg: { action: 'summary' } });
  assert.equal(r.ok, true);
  assert.match(r.text, /Итог дня 26\.09\.2026\n\n🚚 Gazel-2 · Akmal Karimov: доставлено 1, не доставлено 1, осталось 1 \(09:00–не закончил\)\n\nВсего: доставлено 1, не доставлено 1, осталось 1/);
  assert.equal(t.last('sendMessage', g).text, r.text);
  const n = t.tg.sent.length; t.s.ctx.tgDailySummary(); assert.equal(t.tg.sent.length, n + 1);
});
