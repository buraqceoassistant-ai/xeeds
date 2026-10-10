#!/usr/bin/env node
// Собирает tools/lms-gs/Code.gs — код сервера учебной платформы для Apps Script одним файлом:
// tools/lms-gs/Server.gs + learn/lms-sync.js (разница и применение правок — тот же файл, что на странице).
//   node tools/build-lms-gs.mjs
import { readFileSync, writeFileSync } from 'node:fs';

export function buildLmsGs() {
  const server = readFileSync(new URL('./lms-gs/Server.gs', import.meta.url), 'utf8').trimEnd();
  const sync = readFileSync(new URL('../learn/lms-sync.js', import.meta.url), 'utf8').trimEnd();
  return server + '\n\n/* ---------------- learn/lms-sync.js (собрано tools/build-lms-gs.mjs — правьте исходники) ---------------- */\n'
    + sync + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = buildLmsGs();
  writeFileSync(new URL('./lms-gs/Code.gs', import.meta.url), src);
  console.log('tools/lms-gs/Code.gs ← tools/lms-gs/Server.gs + learn/lms-sync.js, версия', (src.match(/var LMS_VERSION = (\d+)/) || [])[1]);
}
