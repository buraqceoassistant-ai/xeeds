/* Обвязка сайта вокруг приложения: service worker (офлайн и установка на телефон),
   кнопка «Установить приложение» и прокрутка вкладок к активной на узком экране.
   Само приложение (разметка и логика) — в index.html. */
(function () {
  'use strict';

  // ── Service worker ──
  // На localhost не регистрируется, чтобы правки были видны сразу; ?sw=1 включает его для проверки.
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]sw=1\b/.test(location.search);
  // Новая версия сайта: приложение на телефоне открыто неделями и не перезагружается — само оно новую сборку не
  // увидит (браузер проверяет её только при открытии страницы). Проверяем раз в 30 минут и при возврате в приложение;
  // когда новая сборка установилась, внизу — «Вышла новая версия сайта · Обновить» (перезагрузка — по кнопке:
  // правки журнала хранятся на устройстве, но открытое окно с несохранённым вводом закрылось бы).
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !local) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        var check = function () { reg.update().catch(function () { /* нет сети — в следующий раз */ }); };
        setInterval(check, 30 * 60 * 1000);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
      }).catch(function (e) { console.warn('[sw] регистрация не удалась:', e); });
    });
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }   // первая установка — это не новая версия
      showUpdate();
    });
  }
  function showUpdate() {
    if (document.getElementById('new-version')) return;
    var box = document.createElement('div');
    box.id = 'new-version';
    box.className = 'install-app new-version';
    box.innerHTML = '<span class="new-version-text">Вышла новая версия сайта</span>' +
      '<button type="button" class="btn btn-primary" data-act="reload">Обновить</button>' +
      '<button type="button" class="btn btn-ghost" data-act="close" aria-label="Скрыть">✕</button>';
    box.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'reload') location.reload();
      else box.remove();
    });
    document.body.appendChild(box);
  }
  window.LogiShowUpdate = showUpdate;   // для проверки

  // ── Кнопка установки (Android / Chrome / Edge; на iPhone — «Поделиться → На экран „Домой“») ──
  var DISMISS_KEY = 'logi-install-dismissed';
  var deferred = null;
  function dismissed() { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; } }
  function removeInstall() { var el = document.getElementById('install-app'); if (el) el.remove(); }
  function showInstall() {
    if (!deferred || dismissed() || document.getElementById('install-app')) return;
    var box = document.createElement('div');
    box.id = 'install-app';
    box.className = 'install-app';
    box.innerHTML = '<button type="button" class="btn btn-primary" data-act="install">Установить приложение</button>' +
      '<button type="button" class="btn btn-ghost" data-act="close" aria-label="Скрыть">✕</button>';
    box.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'install' && deferred) {
        deferred.prompt();
        deferred.userChoice.finally(function () { deferred = null; removeInstall(); });
      } else {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (err) { /* private mode */ }
        removeInstall();
      }
    });
    document.body.appendChild(box);
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    showInstall();
  });
  window.addEventListener('appinstalled', function () { deferred = null; removeInstall(); });

  // ── Активная вкладка всегда видна в прокручиваемой строке вкладок ──
  function syncTabs() {
    var nav = document.querySelector('.app-tabs');
    if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return;
    var active = null;
    for (var i = 0; i < nav.children.length; i++) {
      var b = nav.children[i];
      if (b.style.borderBottom && b.style.borderBottom.indexOf('transparent') < 0) { active = b; break; }
    }
    if (!active) return;
    var nr = nav.getBoundingClientRect(), br = active.getBoundingClientRect();
    if (br.left < nr.left + 12 || br.right > nr.right - 28) {
      nav.scrollBy({ left: br.left - nr.left - (nr.width - br.width) / 2, behavior: 'smooth' });
    }
  }
  // Вкладка меняется только после нажатия (вкладка, «Журнал»/«Планы» на дашборде, «Исправить» и т. п.).
  document.addEventListener('click', function () { setTimeout(syncTabs, 0); }, true);
  window.addEventListener('resize', syncTabs);
})();
