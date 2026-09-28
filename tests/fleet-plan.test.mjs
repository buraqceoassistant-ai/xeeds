// Планы с машинами поимённо (S.vehicles, карточка машины): «в ремонте» не в планах, своя вместимость, имя машины в рейсе.
// Данные выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const win = {};
new Function('window', fs.readFileSync(new URL('../js/logi-engine.js', import.meta.url), 'utf8'))(win);
const E = win.LogiEngine;

const S = { depotLat: 41.38, depotLon: 69.23, speed: 25, roadK: 1.3, unloadMin: 15, dayStart: 0.375, tripsPerVehicle: 2, aMaxStops: 12, bcMaxStops: 15, maxPlaces: null,
  gazelM3: 19, gazelKg: 4000, gazelBase: 300000, gazelHeavy: 400000, gazelHeavyKg: 3000, gazelPtIn: 50000, gazelPtOut: 80000, baseIncludesPts: 1, gazelCount: 3,
  laboM3: 3, laboKg: 550, laboBase: 150000, laboPt: 30000, laboBaseIncludesPts: 0, laboCount: 0, smartLabo: 0,
  changanM3: 9, changanKg: 2000, changanBase: null, changanPt: null, changanCount: 0,
  cM3: 50, cKg: 15000, kamazBase: null, kamazPt: null, cTrucks: 1, bTolM3: 5, bTolKg: 500, freeOutM3: 1 };
// по 4 точки в 4 направлениях от склада, по 4 м³ — рейсы по 16 м³
let n = 0;
const stops = () => { n = 0; const out = []; [[0.06, 0], [-0.06, 0], [0, 0.08], [0, -0.08]].forEach(([dy, dx]) => { for (let i = 0; i < 4; i++) out.push({ id: 's' + (++n), bl: 'BL-' + n, cbm: 4, kg: 500, places: 1, lat: 41.38 + dy + i * 0.003, lon: 69.23 + dx + i * 0.003, zone: 'in', client: { district: 'D' } }); }); return out; };
const veh = (name, x = {}) => ({ name, kind: E.vehicleKind(name), m3: null, kg: null, repair: false, ...x });

test('без машин поимённо — как раньше: имена «Вид-N»', () => {
  const P = E.buildPlans(stops(), S);
  assert.ok(P.A.trips.every(t => /^Gazel-\d( · рейс \d)?$/.test(t.name)), P.A.trips.map(t => t.name).join());
});

test('имя рейса — имя машины из автопарка; «Принять план» получает его в carName', () => {
  const P = E.buildPlans(stops(), { ...S, vehicles: [veh('Gazel-Ali'), veh('Gazel-Bek'), veh('Gazel-3'), veh('Kamaz-1')] });
  const names = P.A.trips.map(t => t.carName);
  assert.ok(names.every(x => ['Gazel-Ali', 'Gazel-Bek', 'Gazel-3'].includes(x)), names.join());
  assert.ok(P.A.trips.every(t => t.name.startsWith(t.carName)), P.A.trips.map(t => t.name).join());
});

test('машина в ремонте не идёт в планы: машин вида меньше, её рейсы — у других', () => {
  const P = E.buildPlans(stops(), { ...S, vehicles: [veh('Gazel-1'), veh('Gazel-2', { repair: true }), veh('Gazel-3'), veh('Kamaz-1')] });
  ['A', 'B', 'X'].forEach(k => assert.ok(!P[k].trips.some(t => t.carName === 'Gazel-2'), k + ': ' + P[k].trips.map(t => t.name).join()));
  const cars = new Set(P.A.trips.filter(t => t.kind === 'gazel').map(t => t.carName));
  assert.ok(cars.size <= 2, 'Gazel — две машины: ' + [...cars]);
  assert.ok(!P.A.trips.some(t => t.noVehicle), 'вторым рейсом хватает');
});

test('своя вместимость: маленькой машине — только рейсы, которые в неё помещаются', () => {
  const P = E.buildPlans(stops(), { ...S, vehicles: [veh('Gazel-1'), veh('Gazel-2', { m3: 9 }), veh('Gazel-3'), veh('Kamaz-1')] });
  ['A', 'X'].forEach(k => P[k].trips.filter(t => t.carName === 'Gazel-2').forEach(t => {
    assert.ok(t.cbm <= 9 + 1e-6, k + ': ' + t.name + ' везёт ' + t.cbm + ' м³');
    assert.equal(t.vehicle.nomM3, 9, 'в рейсе — вместимость машины');
  }));
});

test('все машины вида маленькие — рейсы строятся по их вместимости', () => {
  const P = E.buildPlans(stops(), { ...S, vehicles: [veh('Gazel-1', { m3: 9 }), veh('Gazel-2', { m3: 9 }), veh('Gazel-3', { m3: 9 }), veh('Kamaz-1')] });
  const g = P.A.trips.filter(t => t.kind === 'gazel');
  assert.ok(g.length && g.every(t => t.cbm <= 9 + 1e-6 && t.vehicle.nomM3 === 9), g.map(t => t.name + ':' + t.cbm).join());
});

test('«Машин в автопарке» больше, чем названных: недостающие — «Вид-N» с вместимостью вида', () => {
  const P = E.buildPlans(stops(), { ...S, gazelCount: 3, vehicles: [veh('Gazel-Ali'), veh('Kamaz-1')] });
  const names = [...new Set(P.A.trips.filter(t => t.kind === 'gazel').map(t => t.carName))].sort();
  assert.ok(names.every(x => ['Gazel-1', 'Gazel-2', 'Gazel-Ali'].includes(x)), names.join());
});
