#!/usr/bin/env node
// Собирает js/logi-gs-script.js (код для «Скопировать код» на сайте) из tools/gs/Code.gs.
//   node tools/build-gs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('./gs/Code.gs', import.meta.url), 'utf8');
writeFileSync(new URL('../js/logi-gs-script.js', import.meta.url), 'window.LOGI_GS_SCRIPT=' + JSON.stringify(src) + ';\n');
console.log('js/logi-gs-script.js ← tools/gs/Code.gs, версия', (src.match(/var VERSION = (\d+)/) || [])[1]);
