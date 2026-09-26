#!/usr/bin/env node
// Собирает js/logi-gs-script.js (код для «Скопировать код» на сайте) из tools/gs/Code.gs и tools/gs/Bot.gs (телеграм-бот):
// в Apps Script вставляется один файл.
//   node tools/build-gs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('./gs/Code.gs', import.meta.url), 'utf8').trimEnd() + '\n\n' + readFileSync(new URL('./gs/Bot.gs', import.meta.url), 'utf8');
writeFileSync(new URL('../js/logi-gs-script.js', import.meta.url), 'window.LOGI_GS_SCRIPT=' + JSON.stringify(src) + ';\n');
console.log('js/logi-gs-script.js ← tools/gs/Code.gs + Bot.gs, версия', (src.match(/var VERSION = (\d+)/) || [])[1]);
