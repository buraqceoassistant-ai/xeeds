// ───────────── Телеграм-бот для водителей (версия 9) ─────────────
// Токен бота — в свойстве скрипта TG_TOKEN (от @BotFather); на сайт и в репозиторий он не попадает.
// Telegram присылает обновления на ссылку веб-приложения с ?tg=<секрет> (TG_SECRET создаётся при «Подключить бота» на сайте).
// Ответ Telegram — через HtmlService: ContentService отвечает переадресацией 302, и Telegram слал бы обновление повторно;
// повторы одного update_id всё равно отсекаются (CacheService).
// Водитель: /start → язык → имя → машина из автопарка → госномер → заявка в группу офиса («Разрешить / Отклонить» —
// только администраторы группы) → меню. Рабочий день: «Ishni boshlash» (геолокация) → точки по одной: «Yetkazildi»
// (фото → геолокация) или «Yetkazilmadi» (причина, фото по желанию, геолокация) → статус в журнале, фото на Google Диск,
// отчёт в группу → следующая точка — ближайшая к месту отметки; рейс 2 — после возвращения на склад; «Ishni tugatish».
// Листы: «Haydovchilar» (водители и состояние диалога), «Yetkazish» (отметки доставки), «Ish kuni» (начало и конец дня).
var TG_API = 'https://api.telegram.org/';
var TG = { drivers: 'Haydovchilar', log: 'Yetkazish', days: 'Ish kuni' };
var TG_HEAD = {
  drivers: ['Telegram ID', 'Ism', 'Mashina', 'Davlat raqami', 'Til', 'Holat', 'Ro‘yxatdan o‘tgan', 'Tasdiqlagan', 'Telegram', 'Bot holati (tizim uchun)'],
  log: ['Vaqt', 'Sana', 'Haydovchi', 'Mashina', 'BL', 'Mijoz', 'Natija', 'Sabab', 'Rasmlar', 'Joylashuv', 'Telegram ID', 'Reys'],
  days: ['Sana', 'Haydovchi', 'Mashina', 'Boshlandi', 'Boshlanish joyi', 'Tugadi', 'Tugash joyi', 'Yetkazildi', 'Yetkazilmadi', 'Telegram ID']
};
var TG_DONE = ['Yetkazildi', 'Qolib ketgan', 'Mijoz ozi oldi', 'Bekor qilindi'];   // точка с таким статусом водителю больше не нужна
var TG_NOT_TRUCKS = ['Belgilanmagan', 'Mijoz ozi oladi'];
var TG_REASONS = { uz: ['Mijoz yo‘q', 'Telefonga javob bermayapti', 'Yukni olmadi', 'Boshqa sabab'], ru: ['Клиента нет на месте', 'Не отвечает на телефон', 'Отказался от груза', 'Другая причина'] };

// Тексты: водителю — на его языке (узбекский латиницей или русский), в группу офиса — по-русски.
var TX = {
  uz: {
    hello: 'Assalomu alaykum! Bu BURAQ logistics haydovchilari uchun bot.\nTilni tanlang:',
    askName: 'Ismingiz va familiyangizni yozing (masalan: Akmal Karimov).',
    badName: 'Ismni harflar bilan yozing (2–40 belgi).',
    askTruck: 'Qaysi mashinada ishlaysiz? Tanlang:',
    askPlate: 'Mashinaning davlat raqamini yozing (masalan: 01 A 123 BC).',
    badPlate: 'Raqamni harf va raqamlar bilan yozing (masalan: 01 A 123 BC).',
    check: 'Tekshiring:\n👤 {name}\n🚚 {truck}\n🔢 {plate}', send: '✅ Yuborish', redo: '✏️ Qaytadan',
    sent: 'Arizangiz rahbarga yuborildi. Tasdiqlanganda xabar beramiz.',
    pending: 'Arizangiz ko‘rib chiqilmoqda. Tasdiqlanganda xabar beramiz.',
    approved: 'Ruxsat berildi ✅ Ish kuningizni «🚚 Ishni boshlash» tugmasi bilan boshlang.',
    rejected: 'Arizangiz rad etildi. Savol bo‘lsa, rahbarga murojaat qiling.',
    off: 'Sizga botdan foydalanish ruxsati yo‘q. Rahbarga murojaat qiling.',
    bStart: '🚚 Ishni boshlash', bCur: '📍 Joriy manzil', bEnd: '🏁 Ishni tugatish', bLang: '🌐 Til',
    bLoc: '📍 Joylashuvni yuborish', bCancel: '↩️ Bekor qilish', bDone: '✅ Tayyor', bSkip: '➡️ Rasmsiz davom etish',
    menu: 'Menyu 👇', langSet: 'Til: o‘zbekcha ✅',
    askLocStart: 'Ishni boshlash uchun joylashuvingizni yuboring 👇', askLocEnd: 'Ishni tugatish uchun joylashuvingizni yuboring 👇', askLoc: 'Joylashuvingizni yuboring 👇',
    needLoc: 'Pastdagi «📍 Joylashuvni yuborish» tugmasini bosing.',
    noStops: 'Bugun {truck} uchun manzillar yo‘q. Reja jurnalga yozilgach, «📍 Joriy manzil» tugmasini bosing.',
    stop: '📦 {i}/{n} manzil · {round}-reys', client: 'Mijoz', addr: 'Manzil', recv: 'Qabul qiluvchi', tel: 'Tel', cargo: '{places} joy · {cbm} m³ · {kg} kg', note: 'Izoh', noCoords: 'Xaritada nuqta yo‘q — manzil bo‘yicha boring.',
    bOk: '✅ Yetkazildi', bFail: '❌ Yetkazilmadi',
    askPhoto: 'Yetkazilgan yukning rasmini yuboring (bir yoki bir nechta), keyin «✅ Tayyor» tugmasini bosing.',
    photoOk: '📷 Rasm qabul qilindi: {n}.', needPhoto: 'Kamida bitta rasm yuboring.',
    askReason: 'Sababni tanlang:', askReasonText: 'Sababni qisqacha yozing.',
    askPhotoFail: 'Rasm yuborishingiz mumkin yoki «➡️ Rasmsiz davom etish» tugmasini bosing.',
    saved: 'Saqlandi ✅', next: 'Keyingi manzil 👇',
    roundDone: '{round}-reys tugadi. Omborga qayting, {next}-reys yukini oling va tugmani bosing.', bRound: '▶️ {next}-reysni boshlash',
    allDone: 'Bugungi barcha manzillar tugadi 👏 «🏁 Ishni tugatish» tugmasini bosing.',
    endDay: 'Ish kuni tugadi. Yetkazildi: {ok}, yetkazilmadi: {fail}, qoldi: {left}. Rahmat!',
    notWorking: 'Avval «🚚 Ishni boshlash» tugmasini bosing.', already: 'Ish kuni allaqachon boshlangan.',
    stale: 'Bu tugma eskirgan — joriy manzil pastda.', changed: '⚠️ Bugungi reyslaringiz o‘zgardi.', busy: 'Avval joriy manzilni yakunlang.',
    unknown: 'Tugmalardan foydalaning 👇'
  },
  ru: {
    hello: 'Здравствуйте! Это бот для водителей BURAQ logistics.\nВыберите язык:',
    askName: 'Напишите имя и фамилию (например: Акмал Каримов).',
    badName: 'Напишите имя буквами (2–40 символов).',
    askTruck: 'На какой машине вы работаете? Выберите:',
    askPlate: 'Напишите госномер машины (например: 01 A 123 BC).',
    badPlate: 'Напишите номер буквами и цифрами (например: 01 A 123 BC).',
    check: 'Проверьте:\n👤 {name}\n🚚 {truck}\n🔢 {plate}', send: '✅ Отправить', redo: '✏️ Заново',
    sent: 'Заявка отправлена руководителю. Сообщим, когда её подтвердят.',
    pending: 'Заявка на рассмотрении. Сообщим, когда её подтвердят.',
    approved: 'Доступ открыт ✅ Начинайте рабочий день кнопкой «🚚 Начать работу».',
    rejected: 'Заявка отклонена. Если есть вопросы — обратитесь к руководителю.',
    off: 'У вас нет доступа к боту. Обратитесь к руководителю.',
    bStart: '🚚 Начать работу', bCur: '📍 Текущая точка', bEnd: '🏁 Закончить работу', bLang: '🌐 Язык',
    bLoc: '📍 Отправить геолокацию', bCancel: '↩️ Отмена', bDone: '✅ Готово', bSkip: '➡️ Без фото',
    menu: 'Меню 👇', langSet: 'Язык: русский ✅',
    askLocStart: 'Чтобы начать работу, отправьте геолокацию 👇', askLocEnd: 'Чтобы закончить работу, отправьте геолокацию 👇', askLoc: 'Отправьте геолокацию 👇',
    needLoc: 'Нажмите кнопку «📍 Отправить геолокацию» внизу.',
    noStops: 'На сегодня у {truck} точек нет. Когда план запишут в журнал, нажмите «📍 Текущая точка».',
    stop: '📦 Точка {i} из {n} · рейс {round}', client: 'Клиент', addr: 'Адрес', recv: 'Получатель', tel: 'Тел', cargo: '{places} мест · {cbm} м³ · {kg} кг', note: 'Примечание', noCoords: 'Точки на карте нет — езжайте по адресу.',
    bOk: '✅ Доставлено', bFail: '❌ Не доставлено',
    askPhoto: 'Отправьте фото доставленного груза (одно или несколько), затем нажмите «✅ Готово».',
    photoOk: '📷 Фото принято: {n}.', needPhoto: 'Отправьте хотя бы одно фото.',
    askReason: 'Выберите причину:', askReasonText: 'Коротко напишите причину.',
    askPhotoFail: 'Можно отправить фото или нажать «➡️ Без фото».',
    saved: 'Сохранено ✅', next: 'Следующая точка 👇',
    roundDone: 'Рейс {round} закончен. Вернитесь на склад, загрузите рейс {next} и нажмите кнопку.', bRound: '▶️ Начать рейс {next}',
    allDone: 'Все точки на сегодня пройдены 👏 Нажмите «🏁 Закончить работу».',
    endDay: 'Рабочий день закончен. Доставлено: {ok}, не доставлено: {fail}, осталось: {left}. Спасибо!',
    notWorking: 'Сначала нажмите «🚚 Начать работу».', already: 'Рабочий день уже начат.',
    stale: 'Эта кнопка устарела — текущая точка ниже.', changed: '⚠️ Ваши рейсы на сегодня изменились.', busy: 'Сначала завершите текущую точку.',
    unknown: 'Пользуйтесь кнопками 👇'
  }
};
// нажатая кнопка меню — на любом из двух языков (после смены языка у водителя может остаться старая клавиатура)
function tgIs_(text, k) { return text === TX.uz[k] || text === TX.ru[k]; }
function tx_(lang, k, vars) {
  var s = (TX[lang] || TX.uz)[k] || TX.uz[k] || k;
  Object.keys(vars || {}).forEach(function (v) { s = s.split('{' + v + '}').join(vars[v]); });
  return s;
}

// ── Telegram API ──
function tg_(method, payload) {
  var token = prop_('TG_TOKEN');
  if (!token) return { ok: false, description: 'нет TG_TOKEN' };
  var j;
  try {
    var r = UrlFetchApp.fetch(TG_API + 'bot' + token + '/' + method, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true });
    j = JSON.parse(r.getContentText() || '{}');
  } catch (err) { return { ok: false, description: String((err && err.message) || err) }; }
  // группа стала супергруппой (Telegram меняет её адрес) — запоминаем новый и повторяем
  var to = j && j.parameters && j.parameters.migrate_to_chat_id;
  if (!j.ok && to && payload && String(payload.chat_id) === prop_('TG_GROUP')) { props_().setProperty('TG_GROUP', String(to)); payload.chat_id = to; return tg_(method, payload); }
  return j;
}
function tgSend_(chat, text, markup) { return tg_('sendMessage', { chat_id: chat, text: text, reply_markup: markup, disable_web_page_preview: true }); }
function tgMenu_(lang) { return { keyboard: [[tx_(lang, 'bStart'), tx_(lang, 'bCur')], [tx_(lang, 'bEnd'), tx_(lang, 'bLang')]], resize_keyboard: true, is_persistent: true }; }
function tgLocKb_(lang) { return { keyboard: [[{ text: tx_(lang, 'bLoc'), request_location: true }], [tx_(lang, 'bCancel')]], resize_keyboard: true }; }
function tgInline_(rows) { return { inline_keyboard: rows }; }
function tgNow_(f) { return Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), f || 'yyyy-MM-dd HH:mm'); }
function tgMap_(ll) { return ll ? 'https://maps.google.com/?q=' + ll[0] + ',' + ll[1] : ''; }
function tgEsc_(s) { return String(s == null ? '' : s); }

// ── листы бота ──
function tgSheet_(k) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(TG[k]);
  if (!sh) { sh = ss.insertSheet(TG[k]); sh.getRange(1, 1, 1, TG_HEAD[k].length).setValues([TG_HEAD[k]]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function tgDrivers_() {
  var sh = tgSheet_('drivers'), last = sh.getLastRow(), out = [];
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, TG_HEAD.drivers.length).getValues().forEach(function (r, i) {
    if (r[0] === '' || r[0] === null) return;
    var st = {}; try { st = JSON.parse(r[9] || '{}'); } catch (err) { st = {}; }
    out.push({ row: 2 + i, id: String(r[0]), name: String(r[1]), truck: String(r[2]), plate: String(r[3]), lang: String(r[4] || 'uz'), status: String(r[5] || ''), at: r[6], by: String(r[7] || ''), user: String(r[8] || ''), st: st });
  });
  return out;
}
function tgDriver_(id) { var d = tgDrivers_().filter(function (x) { return x.id === String(id); }); return d[0] || null; }
function tgSave_(d) {
  var sh = tgSheet_('drivers'), row = d.row;
  if (!row) { row = Math.max(2, sh.getLastRow() + 1); d.row = row; }
  sh.getRange(row, 1, 1, TG_HEAD.drivers.length).setValues([[d.id, d.name || '', d.truck || '', d.plate || '', d.lang || 'uz', d.status || '', d.at || '', d.by || '', d.user || '', JSON.stringify(d.st || {})]]);
  sh.getRange(row, 1).setNumberFormat('@');
}
function tgTrucks_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.set);
  if (!sh) return [];
  return sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).getValues().map(function (r) { return String(r[0]).trim(); }).filter(function (t) { return t && TG_NOT_TRUCKS.indexOf(t) < 0; });
}

// ── вход: обновление от Telegram ──
function tgWebhook_(e) {
  var ok = HtmlService.createHtmlOutput('ok'), secret = prop_('TG_SECRET');
  if (!secret || e.parameter.tg !== secret) return ok;
  var u = null;
  try { u = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return ok; }
  if (!u || u.update_id == null) return ok;
  var cache = CacheService.getScriptCache(), k = 'tgu:' + u.update_id;
  if (cache.get(k)) return ok;
  cache.put(k, '1', 21600);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    tgHandle_(u);
  } catch (err) {
    console.error('Телеграм-бот: ' + ((err && err.stack) || err));
  } finally { try { lock.releaseLock(); } catch (err) { /* блокировку не получили */ } }
  return ok;
}

function tgHandle_(u) {
  if (u.callback_query) return tgCallback_(u.callback_query);
  var m = u.message;
  if (!m || !m.chat) return;
  if (m.chat.type === 'group' || m.chat.type === 'supergroup') return tgGroupMsg_(m);
  if (m.chat.type !== 'private') return;
  var id = String(m.from.id), d = tgDriver_(id), text = String(m.text || '').trim();
  if (!d) {
    d = { id: id, lang: 'uz', status: 'yangi', user: m.from.username ? '@' + m.from.username : [m.from.first_name, m.from.last_name].filter(Boolean).join(' '), st: { step: 'lang' } };
    tgSave_(d);
    return tgSend_(id, TX.uz.hello + '\n' + TX.ru.hello.split('\n')[1], tgInline_([[{ text: 'O‘zbekcha', callback_data: 'lang:uz' }, { text: 'Русский', callback_data: 'lang:ru' }]]));
  }
  var L = d.lang;
  if (/^\/start\b/.test(text) && d.status !== 'ruxsat' && d.status !== 'kutilmoqda') { d.st = { step: 'lang' }; tgSave_(d); return tgSend_(id, TX.uz.hello + '\n' + TX.ru.hello.split('\n')[1], tgInline_([[{ text: 'O‘zbekcha', callback_data: 'lang:uz' }, { text: 'Русский', callback_data: 'lang:ru' }]])); }
  // регистрация
  if (d.status !== 'ruxsat') {
    var st = d.st || {};
    if (d.status === 'kutilmoqda') return tgSend_(id, tx_(L, 'pending'));
    if (d.status === 'rad' || d.status === 'o‘chirilgan') return tgSend_(id, tx_(L, d.status === 'rad' ? 'rejected' : 'off'));
    if (st.step === 'name') {
      if (!/^[^\d\/@#]{2,40}$/.test(text)) return tgSend_(id, tx_(L, 'badName'));
      d.name = text.replace(/\s+/g, ' '); d.st = { step: 'truck' }; tgSave_(d);
      return tgAskTruck_(d);
    }
    if (st.step === 'plate') {
      var plate = text.toUpperCase().replace(/[^0-9A-ZА-ЯЁ]+/g, ' ').trim();
      if (!/^[0-9A-ZА-ЯЁ ]{5,12}$/.test(plate) || !/\d/.test(plate)) return tgSend_(id, tx_(L, 'badPlate'));
      d.plate = plate; d.st = { step: 'confirm' }; tgSave_(d);
      return tgSend_(id, tx_(L, 'check', { name: d.name, truck: d.truck, plate: d.plate }), tgInline_([[{ text: tx_(L, 'send'), callback_data: 'reg:send' }, { text: tx_(L, 'redo'), callback_data: 'reg:redo' }]]));
    }
    if (st.step === 'truck') return tgAskTruck_(d);
    if (st.step === 'confirm') return tgSend_(id, tx_(L, 'check', { name: d.name, truck: d.truck, plate: d.plate }), tgInline_([[{ text: tx_(L, 'send'), callback_data: 'reg:send' }, { text: tx_(L, 'redo'), callback_data: 'reg:redo' }]]));
    if (st.step === 'name') return tgSend_(id, tx_(L, 'askName'));
    return tgSend_(id, TX.uz.hello + '\n' + TX.ru.hello.split('\n')[1], tgInline_([[{ text: 'O‘zbekcha', callback_data: 'lang:uz' }, { text: 'Русский', callback_data: 'lang:ru' }]]));
  }
  // водитель с доступом
  var w = d.st.work && d.st.work.date === tgNow_('yyyy-MM-dd') && !d.st.work.ended ? d.st.work : null;
  if (m.location) return tgLocation_(d, w, [m.location.latitude, m.location.longitude]);
  if (m.photo && m.photo.length) return tgPhoto_(d, w, m.photo[m.photo.length - 1].file_id);
  if (tgIs_(text, 'bLang') || /^\/til\b|^\/lang\b/.test(text)) { d.lang = L === 'uz' ? 'ru' : 'uz'; tgSave_(d); return tgSend_(id, tx_(d.lang, 'langSet'), tgMenu_(d.lang)); }
  if (tgIs_(text, 'bStart') || /^\/ish\b/.test(text)) {
    if (w && w.started) return tgSend_(id, tx_(L, 'already'), tgMenu_(L)) && tgCurrent_(d, w);
    d.st.work = { date: tgNow_('yyyy-MM-dd'), stage: 'startLoc' }; tgSave_(d);
    return tgSend_(id, tx_(L, 'askLocStart'), tgLocKb_(L));
  }
  if (tgIs_(text, 'bEnd') || /^\/tugatish\b/.test(text)) {
    if (!w || !w.started) return tgSend_(id, tx_(L, 'notWorking'), tgMenu_(L));
    w.stage = 'endLoc'; tgSave_(d);
    return tgSend_(id, tx_(L, 'askLocEnd'), tgLocKb_(L));
  }
  if (tgIs_(text, 'bCur') || /^\/hozir\b/.test(text)) {
    if (!w || !w.started) return tgSend_(id, tx_(L, 'notWorking'), tgMenu_(L));
    return tgCurrent_(d, w);
  }
  if (tgIs_(text, 'bCancel')) { if (w) { w.stage = w.started ? null : 'none'; if (!w.started) delete d.st.work; tgSave_(d); } return tgSend_(id, tx_(L, 'menu'), tgMenu_(L)); }
  if (w && w.stage === 'photo' && tgIs_(text, 'bDone')) {
    if (!(w.photos || []).length) return tgSend_(id, tx_(L, 'needPhoto'));
    w.stage = 'loc'; tgSave_(d); return tgSend_(id, tx_(L, 'askLoc'), tgLocKb_(L));
  }
  if (w && w.stage === 'failPhoto' && (tgIs_(text, 'bSkip') || tgIs_(text, 'bDone'))) { w.stage = 'loc'; tgSave_(d); return tgSend_(id, tx_(L, 'askLoc'), tgLocKb_(L)); }
  if (w && w.stage === 'reasonText' && text) { w.reason = text.slice(0, 200); w.stage = 'failPhoto'; tgSave_(d); return tgSend_(id, tx_(L, 'askPhotoFail'), { keyboard: [[tx_(L, 'bSkip')], [tx_(L, 'bCancel')]], resize_keyboard: true }); }
  if (w && /Loc$|^loc$/.test(w.stage || '')) return tgSend_(id, tx_(L, 'needLoc'), tgLocKb_(L));
  return tgSend_(id, tx_(L, 'unknown'), tgMenu_(L));
}

function tgAskTruck_(d) {
  var list = tgTrucks_(), rows = [];
  for (var i = 0; i < list.length; i += 3) rows.push(list.slice(i, i + 3).map(function (t, j) { return { text: t, callback_data: 'trk:' + (i + j) }; }));
  return tgSend_(d.id, tx_(d.lang, 'askTruck'), tgInline_(rows));
}

function tgCallback_(q) {
  var data = String(q.data || ''), chat = q.message && q.message.chat, from = String(q.from.id);
  if (chat && (chat.type === 'group' || chat.type === 'supergroup')) return tgGroupCallback_(q, data);
  var d = tgDriver_(from);
  tg_('answerCallbackQuery', { callback_query_id: q.id });
  if (!d) return;
  var L = d.lang;
  if (/^lang:(uz|ru)$/.test(data) && d.status !== 'ruxsat') {
    d.lang = data.slice(5); d.st = { step: 'name' }; tgSave_(d);
    return tgSend_(d.id, tx_(d.lang, 'askName'), { remove_keyboard: true });
  }
  if (/^trk:\d+$/.test(data) && d.st.step === 'truck') {
    var t = tgTrucks_()[Number(data.slice(4))];
    if (!t) return tgAskTruck_(d);
    d.truck = t; d.st = { step: 'plate' }; tgSave_(d);
    return tgSend_(d.id, tx_(L, 'askPlate'));
  }
  if (data === 'reg:redo' && d.status !== 'ruxsat') { d.st = { step: 'name' }; tgSave_(d); return tgSend_(d.id, tx_(L, 'askName')); }
  if (data === 'reg:send' && d.st.step === 'confirm') {
    d.status = 'kutilmoqda'; d.at = tgNow_(); d.st = {}; tgSave_(d);
    tgSend_(d.id, tx_(L, 'sent'), { remove_keyboard: true });
    return tgAskApproval_(d);
  }
  if (d.status !== 'ruxsat') return;
  var w = d.st.work && d.st.work.date === tgNow_('yyyy-MM-dd') && !d.st.work.ended ? d.st.work : null;
  if (!w || !w.started) return tgSend_(d.id, tx_(L, 'notWorking'), tgMenu_(L));
  var m = data.match(/^(ok|fail):(.+)$/);
  if (m) {
    if (!w.cur || w.cur.key !== m[2] || w.stage) return tgSend_(d.id, tx_(L, w.stage ? 'busy' : 'stale')) && tgCurrent_(d, w);
    w.result = m[1]; w.photos = []; w.reason = '';
    if (m[1] === 'ok') { w.stage = 'photo'; tgSave_(d); return tgSend_(d.id, tx_(L, 'askPhoto'), { keyboard: [[tx_(L, 'bDone')], [tx_(L, 'bCancel')]], resize_keyboard: true }); }
    w.stage = 'reason'; tgSave_(d);
    return tgSend_(d.id, tx_(L, 'askReason'), tgInline_(TG_REASONS[L].map(function (r, i) { return [{ text: r, callback_data: 'why:' + i }]; })));
  }
  if (/^why:\d$/.test(data) && w.stage === 'reason') {
    var i = Number(data.slice(4));
    if (i === 3) { w.stage = 'reasonText'; tgSave_(d); return tgSend_(d.id, tx_(L, 'askReasonText')); }
    w.reason = TG_REASONS.ru[i]; w.stage = 'failPhoto'; tgSave_(d);
    return tgSend_(d.id, tx_(L, 'askPhotoFail'), { keyboard: [[tx_(L, 'bSkip')], [tx_(L, 'bCancel')]], resize_keyboard: true });
  }
  if (/^round:\d+$/.test(data) && w.stage === 'roundWait') {
    w.round = Number(data.slice(6)); w.stage = null; w.pos = tgDepot_(); tgSave_(d);
    return tgNext_(d, w);
  }
}

// ── группа офиса: привязка, подтверждение водителей ──
function tgGroupMsg_(m) {
  var text = String(m.text || '').trim(), mm = text.match(/^\/ulash(?:@\w+)?\s+(\S+)/);
  if (!mm) return;
  if (mm[1] !== prop_('TG_GROUP_CODE')) return tgSend_(m.chat.id, 'Код не подходит. Возьмите его на сайте: «Настройки связи» → «Телеграм-бот для водителей».');
  var p = props_();
  p.setProperty('TG_GROUP', String(m.chat.id)); p.setProperty('TG_GROUP_TITLE', String(m.chat.title || ''));
  tgSend_(m.chat.id, 'Группа привязана ✅ Сюда будут приходить заявки водителей и отчёты о доставке. Подтверждать водителей могут администраторы группы.');
  tgDrivers_().filter(function (d) { return d.status === 'kutilmoqda'; }).forEach(tgAskApproval_);
}
function tgGroup_() { return prop_('TG_GROUP'); }
function tgAskApproval_(d) {
  var g = tgGroup_();
  if (!g) return;
  var same = tgDrivers_().filter(function (x) { return x.status === 'ruxsat' && x.truck === d.truck && x.id !== d.id; }).map(function (x) { return x.name; });
  tgSend_(g, '🆕 Новый водитель: ' + d.name + '\n🚚 ' + d.truck + ' · ' + d.plate + '\nTelegram: ' + (d.user || d.id) + (same.length ? '\nНа этой машине уже: ' + same.join(', ') : ''),
    tgInline_([[{ text: '✅ Разрешить', callback_data: 'allow:' + d.id }, { text: '❌ Отклонить', callback_data: 'deny:' + d.id }]]));
}
function tgGroupCallback_(q, data) {
  var chat = q.message.chat, m = data.match(/^(allow|deny):(\d+)$/);
  if (!m || String(chat.id) !== tgGroup_()) return tg_('answerCallbackQuery', { callback_query_id: q.id });
  var mem = tg_('getChatMember', { chat_id: chat.id, user_id: q.from.id }), role = mem.ok && mem.result && mem.result.status;
  if (role !== 'creator' && role !== 'administrator') return tg_('answerCallbackQuery', { callback_query_id: q.id, text: 'Подтверждать водителей могут только администраторы группы', show_alert: true });
  tg_('answerCallbackQuery', { callback_query_id: q.id });
  var d = tgDriver_(m[2]);
  if (!d) return;
  var who = [q.from.first_name, q.from.last_name].filter(Boolean).join(' ');
  tgSetStatus_(d, m[1] === 'allow' ? 'ruxsat' : 'rad', who);
  tg_('editMessageText', { chat_id: chat.id, message_id: q.message.message_id, text: q.message.text + '\n\n' + (m[1] === 'allow' ? '✅ Разрешено' : '❌ Отклонено') + ' — ' + who + ', ' + tgNow_('dd.MM HH:mm') });
}
function tgSetStatus_(d, status, who) {
  d.status = status; d.by = who + ' · ' + tgNow_(); if (status !== 'ruxsat') d.st = {};
  tgSave_(d);
  if (status === 'ruxsat') tgSend_(d.id, tx_(d.lang, 'approved'), tgMenu_(d.lang));
  else tgSend_(d.id, tx_(d.lang, status === 'rad' ? 'rejected' : 'off'), { remove_keyboard: true });
}

// ── рабочий день ──
function tgDepot_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.set);
  if (!sh) return null;
  var lat = Number(sh.getRange(SET_ROWS.depotLat, 2).getValue()), lon = Number(sh.getRange(SET_ROWS.depotLon, 2).getValue());
  return lat && lon ? [lat, lon] : null;
}
// журнал и клиенты читаются один раз за запрос (после записи статуса — заново)
var TG_MEMO = null;
function tgData_() {
  if (TG_MEMO) return TG_MEMO;
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SH.ship), cs = ss.getSheetByName(SH.cli), rows = [], cl = {};
  var last = sh ? lastRow_(sh, 3, 5) : 0;
  if (last >= 5) rows = sh.getRange(5, 1, last - 4, 16).getValues();
  var cl_last = cs ? lastRow_(cs, 1, 5) : 0;
  if (cl_last >= 5) cs.getRange(5, 1, cl_last - 4, 15).getValues().forEach(function (r) {
    cl[String(r[0]).trim()] = { brand: String(r[1] || ''), name: String(r[2] || ''), tel1: String(r[3] || ''), receiver: String(r[5] || ''), recvTel: String(r[6] || ''), district: String(r[7] || ''), address: String(r[8] || ''), lat: Number(r[10]) || null, lon: Number(r[11]) || null, note: String(r[14] || '') };
  });
  TG_MEMO = { rows: rows, cl: cl, tz: ss.getSpreadsheetTimeZone() };
  return TG_MEMO;
}
// точки машины на дату: строки журнала этой машины, по клиенту и номеру рейса; клиент — адрес, получатель, координаты
function tgStops_(truck, date) {
  var D = tgData_(), tz = D.tz, out = {}, order = [];
  D.rows.forEach(function (r, i) {
    var dt = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).slice(0, 10);
    if (dt !== date || String(r[12]).trim() !== truck) return;
    var bl = String(r[2]).trim(), round = Number(r[13]) || 1, key = bl + '|' + round;
    if (!out[key]) { out[key] = { key: key, bl: bl, round: round, rows: [], places: 0, cbm: 0, kg: 0, notes: [], open: false, statuses: [] }; order.push(key); }
    var s = out[key], st = String(r[14]).trim();
    s.rows.push(5 + i); s.places += Number(r[11]) || 0; s.cbm += Number(r[9]) || 0; s.kg += Number(r[10]) || 0;
    if (r[15]) s.notes.push(String(r[15]));
    s.statuses.push(st);
    if (TG_DONE.indexOf(st) < 0) s.open = true;
  });
  if (!order.length) return [];
  return order.map(function (k) { var s = out[k]; s.c = D.cl[s.bl] || {}; s.cbm = Math.round(s.cbm * 1000) / 1000; s.kg = Math.round(s.kg * 10) / 10; return s; });
}
function tgKm_(a, b) {
  var R = 6371, rad = Math.PI / 180, dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad;
  var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
// следующая точка: в текущем рейсе, ближайшая к месту последней отметки (как в плане — от склада к ближайшей)
function tgPick_(stops, round, pos) {
  var open = stops.filter(function (s) { return s.open && s.round === round; });
  if (!open.length) return null;
  if (!pos) return open[0];
  var best = null, bd = Infinity;
  open.forEach(function (s) { var dd = s.c.lat && s.c.lon ? tgKm_(pos, [s.c.lat, s.c.lon]) : 1e6; if (dd < bd) { bd = dd; best = s; } });
  return best;
}
function tgSig_(stops) { return stops.map(function (s) { return s.key + (s.open ? '' : '✓'); }).join(';'); }
function tgFmt_(x) { return String(Math.round(x * 1000) / 1000).replace('.', ','); }
function tgCard_(d, s, stops) {
  var L = d.lang, inRound = stops.filter(function (x) { return x.round === s.round; }), done = inRound.filter(function (x) { return !x.open; }).length, c = s.c;
  var lines = [tx_(L, 'stop', { i: done + 1, n: inRound.length, round: s.round }), '',
    '🏷 ' + s.bl + (c.brand || c.name ? ' · ' + [c.brand, c.name].filter(Boolean).join(' — ') : ''),
    '📍 ' + [c.district, c.address].filter(Boolean).join(', ')];
  if (c.receiver || c.recvTel) lines.push('👤 ' + tx_(L, 'recv') + ': ' + [c.receiver, c.recvTel].filter(Boolean).join(' · '));
  if (c.tel1 && c.tel1 !== c.recvTel) lines.push('☎️ ' + tx_(L, 'tel') + ': ' + c.tel1);
  lines.push('📦 ' + tx_(L, 'cargo', { places: s.places, cbm: tgFmt_(s.cbm), kg: tgFmt_(s.kg) }));
  var notes = s.notes.concat(c.note ? [c.note] : []);
  if (notes.length) lines.push('📝 ' + tx_(L, 'note') + ': ' + notes.join(' · '));
  if (!(c.lat && c.lon)) lines.push('', tx_(L, 'noCoords'));
  return lines.join('\n');
}
function tgNext_(d, w) {
  var L = d.lang, stops = tgStops_(d.truck, w.date);
  w.sig = tgSig_(stops);
  if (!stops.length) { w.cur = null; tgSave_(d); return tgSend_(d.id, tx_(L, 'noStops', { truck: d.truck }), tgMenu_(L)); }
  var round = w.round || Math.min.apply(null, stops.filter(function (s) { return s.open; }).map(function (s) { return s.round; }).concat([99]));
  if (round === 99) { w.cur = null; tgSave_(d); return tgSend_(d.id, tx_(L, 'allDone'), tgMenu_(L)); }
  var s = tgPick_(stops, round, w.pos || tgDepot_());
  if (!s) {
    var later = stops.filter(function (x) { return x.open && x.round > round; }).map(function (x) { return x.round; });
    if (!later.length) { w.cur = null; tgSave_(d); return tgSend_(d.id, tx_(L, 'allDone'), tgMenu_(L)); }
    var nx = Math.min.apply(null, later);
    w.cur = null; w.stage = 'roundWait'; tgSave_(d);
    return tgSend_(d.id, tx_(L, 'roundDone', { round: round, next: nx }), tgInline_([[{ text: tx_(L, 'bRound', { next: nx }), callback_data: 'round:' + nx }]]));
  }
  w.round = round; w.cur = { key: s.key, bl: s.bl, round: s.round }; w.stage = null; tgSave_(d);
  tgSend_(d.id, tgCard_(d, s, stops), tgInline_([[{ text: tx_(L, 'bOk'), callback_data: 'ok:' + s.key }, { text: tx_(L, 'bFail'), callback_data: 'fail:' + s.key }]]));
  if (s.c.lat && s.c.lon) tg_('sendLocation', { chat_id: d.id, latitude: s.c.lat, longitude: s.c.lon, reply_markup: tgMenu_(L) });
  else tgSend_(d.id, tx_(L, 'menu'), tgMenu_(L));
}
function tgCurrent_(d, w) {
  if (w.stage === 'roundWait' || !w.cur) return tgNext_(d, w);
  var stops = tgStops_(d.truck, w.date), s = stops.filter(function (x) { return x.key === w.cur.key && x.open; })[0];
  if (!s) return tgNext_(d, w);
  w.sig = tgSig_(stops); tgSave_(d);
  tgSend_(d.id, tgCard_(d, s, stops), tgInline_([[{ text: tx_(d.lang, 'bOk'), callback_data: 'ok:' + s.key }, { text: tx_(d.lang, 'bFail'), callback_data: 'fail:' + s.key }]]));
  if (s.c.lat && s.c.lon) tg_('sendLocation', { chat_id: d.id, latitude: s.c.lat, longitude: s.c.lon });
}
function tgPhoto_(d, w, fileId) {
  if (!w || (w.stage !== 'photo' && w.stage !== 'failPhoto')) return tgSend_(d.id, tx_(d.lang, w && w.started ? 'unknown' : 'notWorking'), tgMenu_(d.lang));
  w.photos = (w.photos || []).concat([fileId]).slice(0, 10); tgSave_(d);
  return tgSend_(d.id, tx_(d.lang, 'photoOk', { n: w.photos.length }), { keyboard: [[tx_(d.lang, 'bDone')], [tx_(d.lang, 'bCancel')]], resize_keyboard: true });
}
function tgLocation_(d, w, ll) {
  var L = d.lang;
  if (!w) return tgSend_(d.id, tx_(L, 'notWorking'), tgMenu_(L));
  if (w.stage === 'startLoc') {
    w.started = tgNow_('HH:mm'); w.stage = null; w.pos = ll; w.round = null; w.ok = 0; w.fail = 0; tgSave_(d);
    tgSheet_('days').appendRow([w.date, d.name, d.truck, w.started, ll.join(','), '', '', '', '', d.id]);
    var stops = tgStops_(d.truck, w.date);
    tgReport_('🚚 ' + d.name + ' (' + d.truck + ') начал работу в ' + w.started + ' · точек на сегодня: ' + stops.filter(function (s) { return s.open; }).length + ' · 📍 ' + tgMap_(ll));
    return tgNext_(d, w);
  }
  if (w.stage === 'endLoc') {
    var all = tgStops_(d.truck, w.date), left = all.filter(function (s) { return s.open; }).length, end = tgNow_('HH:mm');
    w.ended = end; w.stage = null; tgSave_(d);
    tgDayEnd_(d, w, end, ll);
    tgReport_('🏁 ' + d.name + ' (' + d.truck + ') закончил работу в ' + end + ': доставлено ' + (w.ok || 0) + ', не доставлено ' + (w.fail || 0) + ', осталось ' + left + ' · 📍 ' + tgMap_(ll));
    return tgSend_(d.id, tx_(L, 'endDay', { ok: w.ok || 0, fail: w.fail || 0, left: left }), tgMenu_(L));
  }
  if (w.stage === 'loc' && w.cur) return tgFinish_(d, w, ll);
  w.pos = ll; tgSave_(d);
  return tgSend_(d.id, tx_(L, 'unknown'), tgMenu_(L));
}
function tgDayEnd_(d, w, end, ll) {
  var sh = tgSheet_('days'), last = sh.getLastRow();
  if (last < 2) return;
  var v = sh.getRange(2, 1, last - 1, 10).getValues();
  for (var i = v.length - 1; i >= 0; i--) {
    var dt = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(v[i][0]);
    if (String(v[i][9]) === d.id && dt === w.date) { sh.getRange(2 + i, 6, 1, 4).setValues([[end, ll.join(','), w.ok || 0, w.fail || 0]]); return; }
  }
}
// точка закрыта: статус в журнале, фото на Диск, строка в «Yetkazish», отчёт в группу, следующая точка
function tgFinish_(d, w, ll) {
  var ok = w.result === 'ok', stops = tgStops_(d.truck, w.date), s = stops.filter(function (x) { return x.key === w.cur.key; })[0];
  var photos = (w.photos || []).slice(), reason = w.reason || '', cur = w.cur, now = tgNow_();
  w.pos = ll; w.cur = null; w.stage = null; w.photos = []; w.reason = ''; w[ok ? 'ok' : 'fail'] = (w[ok ? 'ok' : 'fail'] || 0) + 1;
  tgSave_(d);
  if (s) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.ship);
    s.rows.forEach(function (r) { if (String(sh.getRange(r, 3).getValue()).trim() === s.bl && String(sh.getRange(r, 13).getValue()).trim() === d.truck) sh.getRange(r, 15).setValue(ok ? 'Yetkazildi' : 'Qolib ketgan'); });
    TG_MEMO = null;   // журнал изменился — следующую точку считаем по свежим данным
  }
  var links = tgSavePhotos_(photos, w.date, d.truck, cur.bl);
  var c = (s && s.c) || {}, who = [c.brand, c.name].filter(Boolean).join(' — ');
  tgSheet_('log').appendRow([now, w.date, d.name, d.truck, cur.bl, who, ok ? 'Yetkazildi' : 'Yetkazilmadi', reason, links.join(' '), ll.join(','), d.id, cur.round]);
  var cap = (ok ? '✅ ' : '❌ ') + d.truck + ' · ' + d.name + ' — ' + (ok ? 'доставлено' : 'не доставлено') + ': ' + cur.bl + (who ? ' ' + who : '') +
    (reason ? '\nПричина: ' + reason : '') + '\n' + now.slice(11) + ' · 📍 ' + tgMap_(ll);
  tgReport_(cap, photos);
  tgSend_(d.id, tx_(d.lang, 'saved') + '\n' + tx_(d.lang, 'next'), tgMenu_(d.lang));
  return tgNext_(d, w);
}
// фото — на Google Диск: «BURAQ yetkazish» / дата / «дата машина BL n.jpg»; ссылки — в «Yetkazish»
function tgSavePhotos_(ids, date, truck, bl) {
  if (!ids.length) return [];
  var out = [];
  try {
    var p = props_(), rootId = p.getProperty('TG_DRIVE'), root = null;
    if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (err) { root = null; } }
    if (!root) { root = DriveApp.createFolder('BURAQ yetkazish'); p.setProperty('TG_DRIVE', root.getId()); }
    var it = root.getFoldersByName(date), day = it.hasNext() ? it.next() : root.createFolder(date);
    ids.forEach(function (id, i) {
      var f = tg_('getFile', { file_id: id });
      if (!f.ok) return;
      var blob = UrlFetchApp.fetch(TG_API + 'file/bot' + prop_('TG_TOKEN') + '/' + f.result.file_path, { muteHttpExceptions: true }).getBlob();
      blob.setName(date + ' ' + truck + ' ' + bl + ' ' + (i + 1) + '.jpg');
      out.push(day.createFile(blob).getUrl());
    });
  } catch (err) { console.error('Фото на Диск: ' + ((err && err.message) || err)); }
  return out;
}
// отчёт в группу офиса: текст или фото (альбомом, подпись у первого)
function tgReport_(text, photos) {
  var g = tgGroup_();
  if (!g) return;
  photos = photos || [];
  if (!photos.length) return tgSend_(g, text);
  if (photos.length === 1) return tg_('sendPhoto', { chat_id: g, photo: photos[0], caption: text.slice(0, 1000) });
  return tg_('sendMediaGroup', { chat_id: g, media: photos.map(function (p, i) { return i ? { type: 'photo', media: p } : { type: 'photo', media: p, caption: text.slice(0, 1000) }; }) });
}

// ── изменения на сайте: водителям, у которых сегодня рабочий день, — если их точки поменялись ──
function tgAfterOps_(ops) {
  if (!prop_('TG_TOKEN') || !(ops || []).some(function (op) { return /^ship\./.test(op.t); })) return;
  var today = tgNow_('yyyy-MM-dd');
  TG_MEMO = null;
  tgDrivers_().forEach(function (d) {
    var w = d.st && d.st.work;
    if (d.status !== 'ruxsat' || !w || w.date !== today || !w.started || w.ended) return;
    var sig = tgSig_(tgStops_(d.truck, today));
    if (sig === w.sig) return;
    tgSend_(d.id, tx_(d.lang, 'changed'));
    if (!w.stage || w.stage === 'roundWait') tgCurrent_(d, w);
    else { w.sig = sig; tgSave_(d); }
  });
}

// ── сайт: подключить бота, водители ──
function tgSite_(body) {
  var editor = prop_('EDITOR_TOKEN'), a = body.tg || {};
  if (editor && body.editor !== editor) return { error: 'Бот настраивает только руководитель: секрет редактора не подходит', code: 'editor', v: VERSION };
  if (!prop_('TG_TOKEN')) return { error: 'В свойствах скрипта нет TG_TOKEN — впишите токен бота от @BotFather и нажмите «Сохранить свойства скрипта». ' + propNames_(), code: 'notoken', v: VERSION };
  var p = props_();
  if (a.action === 'setup') {
    var me = tg_('getMe', {});
    if (!me.ok) return { error: 'Telegram не принял токен из TG_TOKEN: ' + (me.description || 'нет ответа') + '. Проверьте токен у @BotFather.', code: 'badtoken', v: VERSION };
    if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+|macros)\/s\/[\w-]+\/exec$/.test(String(a.url || ''))) return { error: 'Нужна ссылка веб-приложения …/exec', code: 'url', v: VERSION };
    var secret = prop_('TG_SECRET') || Utilities.getUuid().replace(/-/g, '');
    p.setProperty('TG_SECRET', secret); p.setProperty('TG_BOT', me.result.username);
    if (!prop_('TG_GROUP_CODE')) p.setProperty('TG_GROUP_CODE', String(100000 + Math.floor(Math.random() * 900000)));
    var hook = tg_('setWebhook', { url: a.url + '?tg=' + secret, allowed_updates: ['message', 'callback_query'], max_connections: 10 });
    if (!hook.ok) return { error: 'Telegram не принял ссылку бота: ' + (hook.description || 'нет ответа'), code: 'hook', v: VERSION };
    var cmd = function (l) { return [{ command: 'start', description: l === 'ru' ? 'Регистрация' : 'Ro‘yxatdan o‘tish' }, { command: 'ish', description: tx_(l, 'bStart').slice(2) }, { command: 'hozir', description: tx_(l, 'bCur').slice(2) }, { command: 'tugatish', description: tx_(l, 'bEnd').slice(2) }, { command: 'til', description: tx_(l, 'bLang').slice(2) }]; };
    tg_('setMyCommands', { commands: cmd('uz') });
    tg_('setMyCommands', { commands: cmd('ru'), language_code: 'ru' });
    return { ok: true, v: VERSION, tg: tgInfo_() };
  }
  if (a.action === 'driver') {
    var d = tgDriver_(a.id);
    if (!d) return { error: 'Нет такого водителя', v: VERSION };
    if (['ruxsat', 'rad', 'o‘chirilgan'].indexOf(a.status) < 0) return { error: 'Неизвестный статус', v: VERSION };
    tgSetStatus_(d, a.status, 'сайт');
    return { ok: true, v: VERSION, tg: tgInfo_() };
  }
  return { ok: true, v: VERSION, tg: tgInfo_() };
}
// для сайта: бот, группа, код привязки группы, водители (без состояния диалога)
function tgInfo_() {
  if (!prop_('TG_TOKEN')) return null;
  return { bot: prop_('TG_BOT'), hooked: !!prop_('TG_SECRET'), group: prop_('TG_GROUP_TITLE') || '', grouped: !!prop_('TG_GROUP'), code: prop_('TG_GROUP_CODE'),
    drivers: tgDrivers_().filter(function (d) { return d.status !== 'yangi'; }).map(function (d) {
      var w = d.st && d.st.work, today = tgNow_('yyyy-MM-dd');
      return { id: d.id, name: d.name, truck: d.truck, plate: d.plate, lang: d.lang, status: d.status, at: d.at instanceof Date ? Utilities.formatDate(d.at, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') : String(d.at || ''), user: d.user,
        today: w && w.date === today && w.started ? { started: w.started, ended: w.ended || '', ok: w.ok || 0, fail: w.fail || 0, pos: w.pos || null } : null };
    }) };
}
