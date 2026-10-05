// Одно место — одна точка (клиенты ближе 200 м) и «с клиента» — фиксированная доплата (меньше 1 м³ или за кольцом).
// Данные выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const win = {};
new Function('window', fs.readFileSync(new URL('../js/logi-engine.js', import.meta.url), 'utf8'))(win);
const E = win.LogiEngine;

const S = { depotLat: 41.38, depotLon: 69.23, speed: 25, roadK: 1.3, unloadMin: 15, dayStart: 0.375, tripsPerVehicle: 2, aMaxStops: 10, bcMaxStops: 15, maxPlaces: null,
  gazelM3: 19, gazelKg: 4000, gazelBase: 450000, gazelHeavy: 500000, gazelHeavyKg: 1500, gazelPtIn: 100000, gazelPtOut: 150000, baseIncludesPts: 1, gazelCount: 9,
  laboM3: 3, laboKg: 550, laboBase: 250000, laboPt: 75000, laboBaseIncludesPts: 1, laboCount: 1, smartLabo: 1,
  changanM3: 9, changanKg: 2000, changanBase: null, changanPt: null, changanCount: 1, cM3: 50, cKg: 15000, kamazBase: null, kamazPt: null, cTrucks: 2, bTolM3: 5, bTolKg: 500, freeOutM3: 1 };
const st = (bl, lat, lon, cbm = 4, zone = 'in') => ({ id: bl, bl, cbm, kg: cbm * 100, places: 1, lat, lon, zone, client: { district: 'D' } });

test('клиенты ближе 200 м — одна точка: доплаты нет, доля делится по объёму', () => {
  // рынок: три магазина в 50–120 м друг от друга, четвёртый клиент — в 3 км
  const stops = [st('A', 41.3000, 69.2400, 4), st('B', 41.3004, 69.2405, 2), st('C', 41.3009, 69.2410, 2), st('D', 41.3270, 69.2400, 4)];
  const p = E.priceTrip(stops, 'gazel', S);
  assert.equal(p.total, 450000 + 100000, 'база с первым адресом + один заезд (D): ' + p.formula);
  assert.equal(p.points, 2, 'адресов два');
  assert.deepEqual(p.placeFlags, [false, true, true, false]);
  const market = p.perStop[0] + p.perStop[1] + p.perStop[2];
  assert.ok(Math.abs(p.perStop[1] - market * 2 / 8) < 1, 'доля рынка — по объёму');
  // без координат — как раньше: каждый клиент — точка
  const q = E.priceTrip(stops.map(s => ({ ...s, lat: null, lon: null })), 'gazel', S);
  assert.equal(q.total, 450000 + 3 * 100000);
});

test('план держит клиентов одного места в одной машине', () => {
  const market = [0, 1, 2, 3, 4, 5].map(i => st('M' + i, 41.3000 + i * 0.0002, 69.2400 + i * 0.0002, 1.5));   // 9 м³ — влезает к любому рейсу
  const far = [st('F1', 41.45, 69.30, 9), st('F2', 41.30, 69.10, 9), st('F3', 41.25, 69.35, 9)];
  const P = E.buildPlans(market.concat(far), S);
  ['A', 'B'].forEach(k => {
    const holders = P[k].trips.filter(t => t.stops.some(s => s.bl.startsWith('M')));
    assert.equal(holders.length, 1, k + ': рынок — одной машиной: ' + P[k].trips.map(t => t.name + ':' + t.stops.map(s => s.bl).join('+')).join(' | '));
  });
});

test('с клиента: меньше 1 м³ внутри — заезд 100 000, за кольцом — 150 000, компания — остальное', () => {
  const stops = [st('BIG', 41.30, 69.24, 8), st('SMALL', 41.32, 69.25, 0.5), st('OUT', 41.45, 69.40, 3, 'out')];
  const p = E.priceTrip(stops, 'gazel', S), c = E.costSplit(stops, p, S);
  assert.equal(p.total, 450000 + 100000 + 150000);
  assert.deepEqual(c.why, [null, 'small', 'out']);
  assert.equal(Math.round(c.charge[1]), 100000);
  assert.equal(Math.round(c.charge[2]), 150000);
  assert.equal(Math.round(c.small), 100000); assert.equal(Math.round(c.outside), 150000);
  assert.equal(Math.round(c.ours), 450000, 'компания платит');
  assert.equal(Math.round(c.notPaid), 250000, 'с клиентов');
});

test('машина только к клиенту за кольцом — с него вся цена рейса', () => {
  const stops = [st('OUT', 41.45, 69.40, 6, 'out'), { ...st('OUT', 41.45, 69.40, 2, 'out'), id: 'OUT-2' }];
  const p = E.priceTrip(stops, 'gazel', S), c = E.costSplit(stops, p, S);
  assert.equal(Math.round(c.notPaid), p.total);
  assert.equal(Math.round(c.ours), 0);
  assert.ok(Math.abs(c.charge[0] - p.total * 6 / 8) < 1, 'по строкам клиента — по объёму');
});

test('с клиентов вместе — не больше цены рейса; Labo — свой тариф точки', () => {
  // шесть мелких на одном рынке: рейс 450 000, доплат 6 × 100 000 — берём не больше 450 000
  const market = [0, 1, 2, 3, 4, 5].map(i => st('S' + i, 41.3000 + i * 0.0002, 69.2400, 0.5));
  const p = E.priceTrip(market, 'gazel', S), c = E.costSplit(market, p, S);
  assert.equal(p.total, 450000);
  assert.equal(Math.round(c.notPaid), 450000);
  assert.ok(c.ours >= -1e-6);
  const lab = [st('L1', 41.30, 69.24, 0.4), st('L2', 41.33, 69.27, 1.5)];
  const pl = E.priceTrip(lab, 'labo', S), cl = E.costSplit(lab, pl, S);
  assert.equal(Math.round(cl.charge[0]), 75000, 'Labo: заезд 75 000');
});

test('направление: мелкий груз едет попутно с машиной своей стороны, а не крюком', () => {
  // склад 41.38, 69.23: на севере — полная машина клиентов, на юге — мелкий клиент (0,5 м³)
  const north = [0, 1, 2].map(i => st('N' + i, 41.47 + i * 0.004, 69.24 + i * 0.004, 5));
  const small = st('S', 41.28, 69.22, 0.5);
  const P = E.buildPlans(north.concat([small]), S);
  ['A', 'B'].forEach(k => {
    const t = P[k].trips.find(x => x.stops.some(s => s.bl === 'S'));
    assert.ok(!t.stops.some(s => s.bl.startsWith('N')), k + ': юг не в северной машине: ' + P[k].trips.map(x => x.stops.map(s => s.bl).join('+')).join(' | '));
  });
  // есть машина на юг — мелкий клиент едет с ней (заезд, а не отдельная машина)
  const south = [0, 1].map(i => st('U' + i, 41.27 - i * 0.004, 69.21 - i * 0.004, 6));
  const Q = E.buildPlans(north.concat(south, [small]), S);
  ['A', 'B'].forEach(k => {
    const t = Q[k].trips.find(x => x.stops.some(s => s.bl === 'S'));
    assert.ok(t.stops.some(s => s.bl.startsWith('U')), k + ': юг — с южной машиной: ' + Q[k].trips.map(x => x.stops.map(s => s.bl).join('+')).join(' | '));
  });
});
