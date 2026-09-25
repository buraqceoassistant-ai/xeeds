#!/usr/bin/env node
/* Зашифрованное хранилище данных сайта: data/vault.json.
 *
 * Excel-файл с данными шифруется случайным ключом данных (AES-256-GCM). Для каждого
 * пользователя ключ данных дополнительно шифруется ключом из его пароля
 * (PBKDF2-SHA256, 600 000 итераций). Логины хранятся только как хэши.
 * В репозиторий попадает только vault.json — без пароля он бесполезен.
 *
 *   node tools/vault.mjs init <data.xlsx> <логин>        новое хранилище, пароль генерируется
 *   node tools/vault.mjs add-user <логин> [viewer]       добавить пользователя (viewer — только просмотр)
 *   node tools/vault.mjs remove-user <логин>             удалить пользователя
 *   node tools/vault.mjs set-data <data.xlsx>            заменить данные (ключ и пользователи те же)
 *
 * Для add-user и set-data нужен пароль существующего пользователя:
 *   VAULT_LOGIN=… VAULT_PASSWORD=… node tools/vault.mjs …
 * Пароль нового пользователя можно задать через NEW_PASSWORD, иначе он генерируется и печатается один раз.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { subtle } = globalThis.crypto;
const VAULT = fileURLToPath(new URL('../data/vault.json', import.meta.url));
const ITERATIONS = 600000;
const enc = new TextEncoder();
const b64 = u8 => Buffer.from(u8).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

const normLogin = l => String(l || '').trim().toLowerCase();
async function loginId(userSalt, login) {
  const h = await subtle.digest('SHA-256', new Uint8Array([...unb64(userSalt), ...enc.encode(normLogin(login))]));
  return Buffer.from(h).toString('hex');
}
async function kek(password, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function wrapFor(v, login, password, dekRaw, role) {
  const salt = rand(16), iv = rand(12), id = await loginId(v.userSalt, login), keep = role === undefined ? (v.users[id] || {}).role : role;
  const key = await subtle.encrypt({ name: 'AES-GCM', iv }, await kek(password, salt, v.kdf.iterations), dekRaw);
  v.users[id] = { salt: b64(salt), iv: b64(iv), key: b64(new Uint8Array(key)), ...(keep ? { role: keep } : {}) };
}
async function unwrap(v, login, password) {
  const u = v.users[await loginId(v.userSalt, login)];
  if (!u) throw new Error('Неверный логин или пароль');
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(u.iv) }, await kek(password, unb64(u.salt), v.kdf.iterations), unb64(u.key)));
  } catch { throw new Error('Неверный логин или пароль'); }
}
async function sealData(v, dekRaw, bytes) {
  const iv = rand(12), dek = await subtle.importKey('raw', dekRaw, 'AES-GCM', false, ['encrypt']);
  v.data = { iv: b64(iv), ct: b64(new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, dek, bytes))) };
}
function genPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join('')).join('-');
}
function readXlsx(path) {
  const bytes = new Uint8Array(readFileSync(path));
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(path + ' — это не .xlsx');
  return bytes;
}
const load = () => { if (!existsSync(VAULT)) throw new Error('Нет ' + VAULT + ' — сначала init'); return JSON.parse(readFileSync(VAULT, 'utf8')); };
const save = v => writeFileSync(VAULT, JSON.stringify(v) + '\n');
async function existingKey(v) {
  const { VAULT_LOGIN, VAULT_PASSWORD } = process.env;
  if (!VAULT_LOGIN || !VAULT_PASSWORD) throw new Error('Укажите VAULT_LOGIN и VAULT_PASSWORD существующего пользователя');
  return unwrap(v, VAULT_LOGIN, VAULT_PASSWORD);
}
function announce(login, password, generated) {
  console.log('Логин:  ' + normLogin(login));
  if (generated) console.log('Пароль: ' + password + '\nСохраните пароль — восстановить его нельзя.');
}

const [cmd, a1, a2] = process.argv.slice(2);
try {
  if (cmd === 'init') {
    if (!a1 || !a2) throw new Error('init <data.xlsx> <логин>');
    const v = { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS }, userSalt: b64(rand(16)), users: {}, data: null };
    const dekRaw = rand(32), password = process.env.NEW_PASSWORD || genPassword();
    await sealData(v, dekRaw, readXlsx(a1));
    await wrapFor(v, a2, password, dekRaw);
    save(v); announce(a2, password, !process.env.NEW_PASSWORD);
  } else if (cmd === 'add-user') {
    if (!a1) throw new Error('add-user <логин> [viewer]');
    if (a2 && a2 !== 'viewer') throw new Error('Роль — только viewer (только просмотр) или без роли (всё можно)');
    const v = load(), dekRaw = await existingKey(v), password = process.env.NEW_PASSWORD || genPassword();
    await wrapFor(v, a1, password, dekRaw, a2 || null);
    save(v); announce(a1, password, !process.env.NEW_PASSWORD); if (a2) console.log('Роль:   только просмотр');
  } else if (cmd === 'remove-user') {
    if (!a1) throw new Error('remove-user <логин>');
    const v = load(), id = await loginId(v.userSalt, a1);
    if (!v.users[id]) throw new Error('Такого пользователя нет');
    if (Object.keys(v.users).length === 1) throw new Error('Нельзя удалить последнего пользователя');
    delete v.users[id]; save(v); console.log('Удалён: ' + normLogin(a1));
  } else if (cmd === 'set-data') {
    if (!a1) throw new Error('set-data <data.xlsx>');
    const v = load();
    await sealData(v, await existingKey(v), readXlsx(a1));
    save(v); console.log('Данные обновлены');
  } else {
    console.log('Команды: init <data.xlsx> <логин> | add-user <логин> [viewer] | remove-user <логин> | set-data <data.xlsx>');
    process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error('Ошибка: ' + e.message);
  process.exitCode = 1;
}
