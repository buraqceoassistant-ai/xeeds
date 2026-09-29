/**
 * Логистика — связь сайта с этой Google Таблицей.
 * 1) Расширения → Apps Script → вставьте этот код вместо всего, что там есть → Сохранить.
 * 2) Развернуть → Новое развертывание → Тип: Веб-приложение.
 *    Выполнять как: Я. Доступ: Все (Anyone). → Развернуть → разрешите доступ.
 * 3) Скопируйте ссылку веб-приложения (…/exec) и вставьте её на сайте.
 * Если сайт пишет про разрешение UrlFetchApp (script.external_request): выберите вверху функцию authorize →
 * ▶ Выполнить → Проверить разрешения → ваш аккаунт → Дополнительные настройки → Перейти к проекту →
 * отметьте все галочки («Выбрать все») → Продолжить.
 * Пароль (обязательно с версии 19): ⚙ Настройки проекта → Свойства скрипта → TOKEN = пароль таблицы, тот же пароль —
 * на сайте («Настройки» → «Связь» → «Пароль скрипта»). Без TOKEN скрипт никого не пускает. Можно и в код ниже, в кавычки,
 * но тогда при каждом обновлении кода его придётся вписывать заново.
 *
 * ИИ-импорт манифестов (версия 8) — там же, в свойствах скрипта:
 *   ANTHROPIC_API_KEY — ключ Claude API (platform.claude.com → API keys); на сайт он не попадает;
 *   AI_MODEL          — модель, например claude-sonnet-5 (пусто — claude-sonnet-5);
 *   EDITOR_TOKEN      — секрет редактора: без него ИИ и бот с сайта не работают (сайт хранит его только у руководителя).
 * Каждый вызов записывается в лист «ИИ-журнал».
 *
 * Телеграм-бот для водителей (версия 9) — свойство TG_TOKEN (токен от @BotFather), затем на сайте
 * «Настройки связи» → «Телеграм-бот для водителей» → «Подключить бота». Листы «Haydovchilar», «Yetkazish», «Ish kuni»
 * бот создаёт сам, фото доставок — в папку «BURAQ yetkazish» на Google Диске.
 * Версия 10: госномера машин (Sozlamalar D24:D39), «Отправить» партию водителям с сайта, итог дня в группу в 20:00.
 * Версия 11: «Клиент не отвечает» — водителю меню со звонком диспетчеру, в группу — тревога с номерами клиента;
 *   номер диспетчера (TG_DISP_PHONE, TG_DISP_NAME) задаётся на сайте во вкладке «Водители».
 * Версия 12: фото только с камеры (driver.html на сайте), маршрут в навигаторе, «Жду клиента» (триггер tgTick каждые 5 мин),
 *   «Проблема в пути», перенос недоставленных на завтра, уведомления клиентам.
 * Версия 13: шаг «фото» проще (кнопки под снимком, «Готово» в камере закрывает точку), часовой пояс таблицы и скрипта — на сайт.
 * Версия 14: напоминания водителям (застрял на шаге, не отметил точку, не начал или не закончил день — потом группе),
 *   план дня водителям утром сам (TG_MORNING, по умолчанию 08:30) — всё в триггере tgTick.
 * Версия 15: «один экран» у водителя — короткая карточка с кнопками «🧭 маршрут · 📷 доставлено (сразу камера) · ❌ не доставлено»,
 *   остальное в «☰ Ещё»; нижнее меню из 2–3 кнопок; у прошлой карточки кнопки снимаются.
 * Версия 16: дата партии — полночь по часовому поясу таблицы, а не скрипта (с другим поясом скрипта, например «Алматы»,
 *   старые даты уезжали на день назад: 04.05.2006 → 03.05.2006); уже сдвинутые даты журнала исправляются один раз сами.
 * Версия 17: «один экран» убран — у водителя снова карточка точки как в версии 14 (все кнопки под точкой, метка на карте,
 *   полное меню); напоминания, план утром и исправление дат остаются. Кнопки карточек версии 15, оставшиеся в чате, работают.
 * Версия 18: план не приходит водителю по нескольку раз. Правки журнала сайт пишет порциями — водителю одно сообщение
 *   «задание изменилось» после последней порции, а перед «Отправить» — только само задание. «Отправить всем» не повторяет
 *   тот же план тому, кто его уже получил (в том числе утром) или уже везёт; кто везёт — не сбрасывается на начало.
 *   «Новое задание» и «Рейсы изменились» — одним сообщением с карточкой точки. Действия сайта с ботом — под блокировкой.
 * Версия 19: без пароля скрипт закрыт. Свойство TOKEN обязательно (без него — ошибка «Задайте TOKEN…»), EDITOR_TOKEN —
 *   для ИИ и бота с сайта; раскрытие ссылок на карту ходит только на Google Карты, goo.gl, Яндекс Карты и 2ГИС (и по
 *   переадресациям тоже). Обновление Telegram (?tg=) и фото с камеры водителя проверяются, как раньше, своей подписью.
 * Версия 20: в «Задании» водителю — только число точек и рейсов, без списка. Адрес, телефон и метку следующей точки
 *   водитель видит только после фото (доставки или места) и геолокации предыдущей.
 * Версия 21: карточка машины — на листе Sozlamalar рядом с названием (C) и госномером (D): E «Holati» (ta’mirda —
 *   в ремонте), F «Marka», G «Yili», H «Hajm, m³», I «Yuk, kg», J «Izoh». Переименование машины — в списке, журнале
 *   (Yuborishlar M) и у водителей бота (Haydovchilar C) одной правкой. Машину в ремонте бот водителю не предлагает.
 * Версия 22: водителю — откуда и куда везти: в «Задании» и в карточке точки строка «🏭 Откуда: склад отправки — адрес»
 *   (адрес склада — по его координатам, геокодер Google) и «📍 Куда: район, адрес клиента».
 * Версия 23: владелец сам выбирает, кто на какой машине: на сайте («Водители» и заявка) — действие бота truck.
 *   Одна машина — один водитель: у прежнего водителя этой машины она снимается, он без машины, пока не назначат новую.
 *   Водитель в рабочем дне получает точки новой машины; без машины точек и начала работы нет.
 *   Ошибка скрипта (или таблица занята дольше 25 с) — сайту текстом, а не страницей Google («Failed to fetch»).
 */
var TOKEN = '';
var VERSION = 23; // сайт сверяет версию и просит обновить код, если он старый

var SH = { ship: 'Yuborishlar', cli: 'Mijozlar', wh: 'Qoshimcha omborlar', set: 'Sozlamalar', ring: 'Halqa zonasi', notes: 'O‘zgarishlar' };
var COLS = { ship: 16, cli: 25, wh: 8, set: 10, ring: 3, notes: 3 };   // Mijozlar Y (25) — маркировки клиента для импорта; Sozlamalar D — госномера, E:J — карточка машины
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
// карточка машины (версия 21): Sozlamalar E:J напротив названия в C; заголовки — в строке 23
var FLEET_HEAD = ['Holati', 'Marka', 'Yili', 'Hajm, m³', 'Yuk, kg', 'Izoh'], FLEET_REPAIR = 'ta’mirda';

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
function token_() { return prop_('TOKEN') || String(TOKEN || '').trim(); }
// Пароль скрипта обязателен (версия 19): без TOKEN — отказ всем, а не доступ всем. null — можно
function access_(given) {
  var tk = token_();
  if (!tk) return { error: 'Задайте TOKEN в свойствах скрипта: Apps Script → ⚙ Настройки проекта → Свойства скрипта → TOKEN = пароль таблицы → «Сохранить свойства скрипта». Тот же пароль — на сайте: «Настройки» → «Связь» → «Пароль скрипта».', code: 'nopass', v: VERSION };
  if (String(given == null ? '' : given) !== tk) return { error: 'Неверный пароль', code: 'pass', v: VERSION };
  return null;
}
// Секрет редактора обязателен (версия 19) для ИИ и бота с сайта: без EDITOR_TOKEN — отказ. wrong — текст для неверного секрета
function editor_(given, wrong) {
  var ed = prop_('EDITOR_TOKEN');
  if (!ed) return { error: 'Задайте EDITOR_TOKEN в свойствах скрипта: без секрета редактора ИИ-импорт и бот с сайта не работают. Секрет — на сайте: «Настройки» → «Связь» → «ИИ-импорт манифестов» → «Показать секрет» → «Скопировать».', code: 'noeditor', v: VERSION };
  if (String(given == null ? '' : given) !== ed) return { error: wrong, code: 'editor', v: VERSION };
  return null;
}

// Запустите один раз из редактора (▶ Выполнить): Google спросит разрешения скрипта, в том числе на внешние запросы
// (Claude API, раскрытие ссылок на карту). Без этого веб-приложение не может вызвать UrlFetchApp.
// На экране разрешений Google у каждого пункта своя галочка — отметьте все («Выбрать все»).
function authorize() {
  // разрешения, с которых галочку сняли раньше, Google спросит заново
  if (typeof ScriptApp !== 'undefined' && ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  SpreadsheetApp.getActiveSpreadsheet();
  var code = UrlFetchApp.fetch('https://api.anthropic.com/v1/models', { muteHttpExceptions: true }).getResponseCode();
  Logger.log('Разрешения выданы: таблица и внешние запросы работают (Claude API ответил ' + code + '). Теперь на сайте — «Проверить ИИ».');
}

// Ошибка в коде или в таблице — сайту текстом. Без этого Google вместо ответа показывает свою страницу, и сайт видит
// только «Failed to fetch», как будто нет связи. Таблица занята другой записью дольше 25 с — «busy»: сайт повторит сам.
function scriptErr_(err) {
  var m = String((err && err.message) || err || '');
  if (/lock|блокир/i.test(m)) return { error: 'Таблица занята другой записью — сайт повторит сам через полминуты', code: 'busy', v: VERSION };
  return { error: 'Ошибка скрипта таблицы: ' + m.slice(0, 300), code: 'script', v: VERSION };
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {}, deny = access_(p.token);
    if (deny) return json_(deny);
    if (p.resolve || p.geo) return json_(locate_(p));
    return json_({ ok: true, v: VERSION, data: dump_(p.tgdays) });
  } catch (err) { return json_(scriptErr_(err)); }
}

function doPost(e) {
  if (e && e.parameter && e.parameter.tg) return tgWebhook_(e);   // обновление от Telegram (ссылка с секретом бота)
  try { return post_(e); } catch (err) { return json_(scriptErr_(err)); }
}
function post_(e) {
  var raw = (e && e.postData && e.postData.contents) || '{}', body = {};
  try { body = JSON.parse(raw); } catch (err) { return json_({ error: 'Плохой запрос' }); }
  if (body.tgphoto) return json_(tgPhotoUpload_(body.tgphoto));   // фото с камеры водителя: вход по подписи Telegram
  var deny = access_(body.token);
  if (deny) return json_(deny);
  if (body.ai) return json_(ai_(body, raw.length));   // ИИ — без блокировки таблицы и без выгрузки данных
  if (body.tg) return json_(tgSiteLocked_(body));   // бот: подключить, водители, отправка
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  var results = [];
  try {
    (body.ops || []).forEach(function (op) { results.push(apply_(op)); });
    SpreadsheetApp.flush();
    try { tgAfterOps_(body.ops, body.more || body.quiet); } catch (err) { console.error('Бот после правок: ' + ((err && err.message) || err)); }   // водителям — если их точки изменились
  } finally { lock.releaseLock(); }
  return json_({ ok: true, v: VERSION, results: results, data: dump_(body.tgdays) });
}

// Ссылки на карту (версия 19): скрипт открывает только Google Карты, goo.gl, Яндекс Карты и 2ГИС — и исходную ссылку,
// и каждый адрес переадресации. Иначе через «раскрыть ссылку» скрипт открывал бы любой адрес от имени владельца таблицы.
// Хост — только буквы, цифры, точки и дефисы (без «логин@», обратных слэшей и чужих портов); у google.* и yandex.* — путь /maps.
function mapUrlOk_(u) {
  var m = String(u || '').match(/^https?:\/\/([a-z0-9.-]+?)\.?(?::(?:80|443))?(?=[\/?#]|$)(.*)$/i);
  if (!m) return false;
  var h = m[1].toLowerCase(), path = m[2] || '/', maps = /^\/maps(?:[\/?#]|$)/.test(path);
  if (h === 'goo.gl' || h === 'maps.app.goo.gl') return true;
  if (/^maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(h)) return true;
  if (/^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(h)) return maps;
  if (/^maps\.yandex\.(?:ru|uz|com|kz|by)$/.test(h)) return true;
  if (/^(?:www\.)?yandex\.(?:ru|uz|com|kz|by|com\.tr)$/.test(h)) return maps;
  return /^(?:www\.)?2gis\.(?:ru|uz|kz|kg|com|ae)$/.test(h) || h === 'go.2gis.com';
}
// адрес из заголовка Location: полный, «//хост/…» или путь на том же хосте
function mapNext_(from, loc) {
  loc = String(loc || '').trim();
  if (/^https?:\/\//i.test(loc)) return loc;
  var base = from.match(/^(https?:)(\/\/[^\/?#]+)/i);
  if (/^\/\//.test(loc)) return base[1] + loc;
  return base[1] + base[2] + (loc.charAt(0) === '/' ? '' : '/') + loc;
}

// Ссылка на карту → куда она ведёт; координаты → адрес. Короткие ссылки (maps.app.goo.gl, yandex…/maps/-/…)
// раскрываются здесь: браузер этого сделать не может. Адрес — геокодер Google Карт, на узбекском.
function locate_(p) {
  var out = { ok: true, v: VERSION };
  if (p.resolve) {
    var u = String(p.resolve).trim(), hops = [], html = '';
    if (!mapUrlOk_(u)) return { error: 'Это не ссылка на карту: подходят только Google Карты, Яндекс Карты и 2ГИС', code: 'host', v: VERSION };
    for (var i = 0; i < 6; i++) {
      hops.push(u);
      var r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'ru,uz;q=0.9,en;q=0.5' } });
      var code = r.getResponseCode(), h = r.getAllHeaders(), loc = h.Location || h.location;
      if (loc && loc.join) loc = loc[0];
      if (code >= 300 && code < 400 && loc) {
        var next = mapNext_(u, loc);
        if (!mapUrlOk_(next)) return { error: 'Ссылка ведёт не на карту (' + (next.match(/^https?:\/\/([^\/?#]*)/i) || ['', next])[1].slice(0, 60) + ') — откройте её в браузере и вставьте полную ссылку на место', code: 'host', v: VERSION, hops: hops };
        u = next; continue;
      }
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

// tgDays — за сколько дней отдать отметки водителей (сайт просит 45 только на вкладке «Водители»)
function dump_(tgDays) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone(), out = { name: ss.getName(), sheets: {}, links: {} };
  try { fixShipDates_(ss); } catch (err) { console.error('Даты журнала: ' + ((err && err.message) || err)); }
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
  try { out.tg = tgInfo_(tgDays); } catch (err) { out.tg = null; }
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
// Дата партии — полночь по часовому поясу ТАБЛИЦЫ. new Date(г, м, д) дал бы полночь по поясу скрипта (Apps Script →
// ⚙ Настройки проекта): если там, например, «Алматы» или «Екатеринбург», то в годы, когда у этих поясов было другое
// смещение, чем у Ташкента, полночь попадала в 23:00 предыдущего дня таблицы — 04.05.2006 превращалось в 03.05.2006.
var SHEET_TZ = '';
function sheetTz_() { return SHEET_TZ || (SHEET_TZ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()); }
function date_(iso) {
  var p = String(iso).split('-').map(Number);
  return Utilities.parseDate(p[0] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[2]).slice(-2), sheetTz_(), 'yyyy-MM-dd');
}
// день из ячейки с датой (в поясе таблицы) — с поправкой на прежний код, который писал полночь по поясу скрипта:
// 18:00 и позже — это полночь следующего дня из пояса восточнее (Алматы до 2024 года — 23:00, Китай — 21:00),
// раньше 18:00 — тот же день из пояса западнее (Москва — 02:00, Лос-Анджелес — 12:00–13:00)
function day_(v, tz) { return v instanceof Date ? Utilities.formatDate(new Date(v.getTime() + 6 * 3600e3), tz || sheetTz_(), 'yyyy-MM-dd') : ''; }
// один раз после обновления кода: даты журнала, записанные прежним кодом не в полночь, — на полночь своего дня (day_)
function fixShipDates_(ss) {
  var p = props_();
  if (p.getProperty('SHIP_DATES_FIXED') === '1') return 0;
  p.setProperty('SHIP_DATES_FIXED', '1');
  var sh = ss.getSheetByName(SH.ship), last = sh ? lastRow_(sh, 3, 5) : 0, n = 0;
  if (last < 5) return 0;
  var tz = ss.getSpreadsheetTimeZone();
  sh.getRange(5, 1, last - 4, 1).getValues().forEach(function (r, i) {
    if (!(r[0] instanceof Date)) return;
    var fixed = Utilities.parseDate(day_(r[0], tz), tz, 'yyyy-MM-dd');
    if (fixed.getTime() !== r[0].getTime()) { sh.getRange(5 + i, 1).setValue(fixed); n++; }
  });
  return n;
}

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
    if (String(v[i][2]).trim() === guard.bl && day_(v[i][0], tz) === guard.date) return 5 + i;
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
    var ch = function (k) { return !row || !op.was || String(op.was[k]) !== String(v[k]); };   // поля, которые сайт правда поменял
    // дата с неполным годом («0001-01-01») записалась бы как 1900 год, и строка пропала бы с сайта — не пишем
    if (ch('date') && !/^20\d\d-\d\d-\d\d$/.test(String(v.date || ''))) return { error: 'bad date', row: row };
    if (!row) row = lastRow_(sh, 3, 5) + 1;
    // только изменённые на сайте поля: статус, который поставил водитель в боте, не перезапишется старым значением сайта
    setRow_(sh, row, { 1: ch('date') ? date_(v.date) : undefined, 3: ch('bl') ? v.bl : undefined, 10: ch('cbm') ? num_(v.cbm) : undefined, 11: ch('kg') ? num_(v.kg) : undefined,
      12: ch('places') ? num_(v.places) : undefined, 13: ch('truck') ? v.truck : undefined, 14: ch('route') ? num_(v.route) : undefined, 15: ch('status') ? v.status : undefined, 16: ch('note') ? v.note : undefined });
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
    // госномер (D) и карточка машины (E:J) держатся за название: список поменялся — они переезжают вместе с названиями
    var wide = Math.min(8, sh.getMaxColumns() - 2), old = wide >= 2 ? sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, wide).getValues() : [], pm = {};
    old.forEach(function (r) { var t = String(r[0]).trim(); if (t && r.slice(1).some(function (x) { return String(x).trim() !== ''; })) pm[t] = r.slice(1); });
    sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).clearContent();
    sh.getRange(TRUCKS_ROW, 3, list.length, 1).setValues(list);
    if (Object.keys(pm).length) {
      var names = sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).getValues();
      sh.getRange(TRUCKS_ROW, 4, TRUCKS_N, 1).setNumberFormat('@');   // госномер — текстом («01…» не превращается в число)
      sh.getRange(TRUCKS_ROW, 4, TRUCKS_N, wide - 1).setValues(names.map(function (r) { var t = String(r[0]).trim(), x = t && pm[t]; return x ? x : new Array(wide - 1).fill(''); }));
    }
    var ys = ss.getSheetByName(SH.ship);
    if (ys) ys.getRange('M5:M500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1), true).setAllowInvalid(true).build());
    return { ok: true, n: list.length };
  }
  if (op.t === 'plates') {   // госномера машин: Sozlamalar D24:D39 напротив названия машины в C
    sh = ss.getSheetByName(SH.set);
    if (!sh) return { error: 'no settings' };
    if (sh.getMaxColumns() < 4) sh.insertColumnsAfter(sh.getMaxColumns(), 4 - sh.getMaxColumns());
    var hd = sh.getRange(TRUCKS_ROW - 1, 4); if (String(hd.getValue()).trim() === '') hd.setValue('Davlat raqami');
    var names = sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).getValues(), pv = op.v || {};
    sh.getRange(TRUCKS_ROW, 4, TRUCKS_N, 1).setNumberFormat('@').setValues(names.map(function (r) { var t = String(r[0]).trim(); return [t && pv[t] ? String(pv[t]) : '']; }));
    return { ok: true };
  }
  if (op.t === 'fleet') return fleet_(ss, op.v || {});
  if (op.t === 'rename') return renameTruck_(ss, String(op.from || '').trim(), String(op.to || '').trim());
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
  var a = body.ai || {}, editor = prop_('EDITOR_TOKEN');
  // без EDITOR_TOKEN — отказ (версия 19; раньше ИИ был доступен всем, кто знает пароль таблицы, в том числе «только просмотр»)
  var deny = editor_(body.editor, 'ИИ-импорт доступен только руководителю: секрет редактора не подходит');
  if (deny) return deny;
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
  if (!r.status && /external_request|UrlFetchApp/i.test(m)) return 'Скрипту не разрешены внешние запросы. В Apps Script этой таблицы (тем же аккаунтом Google, от имени которого развёрнуто веб-приложение) выберите вверху функцию authorize → ▶ Выполнить → Проверить разрешения → ваш аккаунт → Дополнительные настройки → Перейти к проекту → отметьте все галочки («Выбрать все») → Продолжить. Затем «Проверить ИИ»';
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

// карточка машины: E:J напротив названия в C (Holati, Marka, Yili, Hajm m³, Yuk kg, Izoh); пустое — стирается
function fleet_(ss, info) {
  var sh = ss.getSheetByName(SH.set);
  if (!sh) return { error: 'no settings' };
  if (sh.getMaxColumns() < 10) sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());
  var head = sh.getRange(TRUCKS_ROW - 1, 5, 1, 6).getValues()[0];
  if (head.some(function (h, i) { h = String(h).trim(); return h !== '' && h !== FLEET_HEAD[i]; }))
    return { error: 'На листе Sozlamalar ячейки E23:J23 заняты — карточка машины пишется в E:J строк 23–39. Освободите их', code: 'busy' };
  sh.getRange(TRUCKS_ROW - 1, 5, 1, 6).setValues([FLEET_HEAD]).setFontWeight('bold');
  var names = sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).getValues();
  sh.getRange(TRUCKS_ROW, 5, TRUCKS_N, 6).setValues(names.map(function (r) {
    var x = info[String(r[0]).trim()] || {}, num = function (v) { return v === '' || v == null || isNaN(Number(v)) ? '' : Number(v); };
    return [x.repair ? FLEET_REPAIR : '', String(x.model || '').slice(0, 40), num(x.year), num(x.m3), num(x.kg), String(x.note || '').slice(0, 200)];
  }));
  return { ok: true };
}
// переименовать машину: список (C24:C39 — госномер и карточка остаются в той же строке), журнал (Yuborishlar M), водители бота
function renameTruck_(ss, from, to) {
  var sh = ss.getSheetByName(SH.set);
  if (!sh || !from || !to || from === to) return { error: 'bad rename' };
  var names = sh.getRange(TRUCKS_ROW, 3, TRUCKS_N, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  if (names.indexOf(to) >= 0) return { error: 'Машина «' + to + '» уже есть', code: 'exists' };
  var i = names.indexOf(from);
  if (i < 0) return { error: 'Нет машины «' + from + '»', code: 'nofrom' };
  sh.getRange(TRUCKS_ROW + i, 3).setValue(to);
  var n = 0, ys = ss.getSheetByName(SH.ship);
  if (ys && ys.getLastRow() >= 5) {
    var rg = ys.getRange(5, 13, ys.getLastRow() - 4, 1), vals = rg.getValues();
    vals.forEach(function (r) { if (String(r[0]).trim() === from) { r[0] = to; n++; } });
    if (n) rg.setValues(vals);
  }
  var d = 0, ds = ss.getSheetByName(TG.drivers);
  if (ds && ds.getLastRow() >= 2) {
    var dr = ds.getRange(2, 3, ds.getLastRow() - 1, 1), dv = dr.getValues();
    dv.forEach(function (r) { if (String(r[0]).trim() === from) { r[0] = to; d++; } });
    if (d) dr.setValues(dv);
  }
  return { ok: true, ships: n, drivers: d };
}

function merge_() { var o = {}; for (var i = 0; i < arguments.length; i++) { var x = arguments[i] || {}; Object.keys(x).forEach(function (k) { o[k] = x[k]; }); } return o; }
