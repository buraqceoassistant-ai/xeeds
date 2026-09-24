/* Вход по логину и паролю.
   Данные сайта лежат только в зашифрованном data/vault.json (см. tools/vault.mjs).
   Пароль превращается в ключ (PBKDF2-SHA256), им расшифровывается ключ данных,
   а им — Excel-файл, из которого приложение строит журнал, клиентов и планы.
   Пока вход не выполнен, приложение ждёт window.LOGI_TEMPLATE_B64 и ничего не показывает. */
(function () {
  'use strict';
  var VAULT_URL = 'data/vault.json';
  var KEY = 'logi-auth-key';            // ключ данных: localStorage («запомнить») или sessionStorage
  var BAD = 'Неверный логин или пароль';
  var subtle = window.crypto && window.crypto.subtle;
  var enc = new TextEncoder();

  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function b64(u) { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function store(name) { try { return window[name]; } catch (e) { return null; } }
  function getKey() { var l = store('localStorage'), s = store('sessionStorage'); try { return (l && l.getItem(KEY)) || (s && s.getItem(KEY)) || null; } catch (e) { return null; } }
  function putKey(k, remember) { try { (remember ? store('localStorage') : store('sessionStorage')).setItem(KEY, k); } catch (e) { /* приватный режим: вход до перезагрузки */ } }
  function dropKey() { [store('localStorage'), store('sessionStorage')].forEach(function (st) { try { st && st.removeItem(KEY); } catch (e) { /* нет доступа */ } }); }

  var vaultP = null;
  function vault() {
    return vaultP || (vaultP = fetch(VAULT_URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) { vaultP = null; throw e; }));
  }

  async function keyFromPassword(login, password) {
    var v = await vault();
    var salted = new Uint8Array(unb64(v.userSalt).length + enc.encode(login).length);
    salted.set(unb64(v.userSalt)); salted.set(enc.encode(login), unb64(v.userSalt).length);
    var u = v.users[hex(await subtle.digest('SHA-256', salted))];
    if (!u) throw new Error(BAD);
    var base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    var kek = await subtle.deriveKey({ name: 'PBKDF2', hash: v.kdf.hash, salt: unb64(u.salt), iterations: v.kdf.iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try { return b64(new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(u.iv) }, kek, unb64(u.key)))); }
    catch (e) { throw new Error(BAD); }
  }

  async function openData(keyB64) {
    var v = await vault();
    var dek = await subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt']);
    var xlsx = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.data.iv) }, dek, unb64(v.data.ct));
    window.LOGI_TEMPLATE_B64 = b64(new Uint8Array(xlsx));
  }

  // ── Экран входа ──
  var root, form, err, btn;
  function setState(s) { if (root) root.setAttribute('data-state', s); }
  function unlocked() {
    setState('open');
    document.documentElement.classList.remove('locked');
    setTimeout(function () { if (root) { root.remove(); root = null; } }, 250);
  }
  function showForm(message) {
    setState('login');
    err.textContent = message || '';
    var l = document.getElementById('auth-login');
    (l.value ? document.getElementById('auth-pass') : l).focus();
  }
  function netError(e) { return 'Не удалось загрузить данные: ' + (e && e.message || e) + '. Проверьте интернет и попробуйте снова.'; }

  async function onSubmit(e) {
    e.preventDefault();
    var login = document.getElementById('auth-login').value.trim().toLowerCase();
    var pass = document.getElementById('auth-pass').value;
    if (!login || !pass) { err.textContent = 'Введите логин и пароль'; return; }
    setState('busy'); err.textContent = ''; btn.disabled = true; btn.textContent = 'Проверяю…';
    try {
      var k = await keyFromPassword(login, pass);
      await openData(k);
      putKey(k, document.getElementById('auth-remember').checked);
      document.getElementById('auth-pass').value = '';
      unlocked();
    } catch (ex) {
      showForm(ex.message === BAD ? BAD : netError(ex));
      if (ex.message === BAD) { var p = document.getElementById('auth-pass'); p.value = ''; p.focus(); }
    }
    btn.disabled = false; btn.textContent = 'Войти';
  }

  async function start() {
    root = document.getElementById('auth');
    if (!root) return;
    form = document.getElementById('auth-form'); err = document.getElementById('auth-error'); btn = document.getElementById('auth-submit');
    form.addEventListener('submit', onSubmit);
    if (!subtle) { showForm('Браузер не поддерживает шифрование. Откройте сайт по https:// в Chrome, Safari, Edge или Firefox.'); btn.disabled = true; return; }
    var k = getKey();
    if (!k) return showForm();
    try { await openData(k); unlocked(); }
    catch (e) {
      if (e && e.name === 'OperationError') { dropKey(); showForm('Данные на сайте обновились — войдите заново'); }
      else showForm(netError(e));
    }
  }

  // Выход: стирает с устройства ключ, локальную копию данных, связь с Google Таблицей и Excel-файлом.
  function logout() {
    if (!confirm('Выйти и удалить данные с этого устройства?\n\nПравки, которые не записаны в Excel-файл или Google Таблицу, пропадут. Чтобы сохранить их, сначала нажмите «Скачать Excel».')) return;
    [store('localStorage'), store('sessionStorage')].forEach(function (st) {
      try { for (var i = st.length - 1; i >= 0; i--) { var k = st.key(i); if (k && k.indexOf('logi-') === 0) st.removeItem(k); } } catch (e) { /* нет доступа */ }
    });
    try { indexedDB.deleteDatabase('logi-db'); } catch (e) { /* нет IndexedDB */ }
    location.reload();
  }

  window.LogiAuth = { logout: logout };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
