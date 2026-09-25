(function () {
  const R = 6371;
  const rad = d => d * Math.PI / 180;
  function km(a, b) {
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(o, p) {
    const y = Math.sin(rad(p[1] - o[1])) * Math.cos(rad(p[0]));
    const x = Math.cos(rad(o[0])) * Math.sin(rad(p[0])) - Math.sin(rad(o[0])) * Math.cos(rad(p[0])) * Math.cos(rad(p[1] - o[1]));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i], [yj, xj] = poly[j];
      if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function distToRing(pt, poly) {
    const kx = 111.32 * Math.cos(rad(pt[0])), ky = 110.57;
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ax = (a[1] - pt[1]) * kx, ay = (a[0] - pt[0]) * ky, bx = (b[1] - pt[1]) * kx, by = (b[0] - pt[0]) * ky;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  }
  function zoneOf(client, ring, buffer) {
    if (!client) return { zone: '', dist: null, border: false };
    if (client.lat == null || client.lon == null) return { zone: '', dist: null, border: false };
    const p = [client.lat, client.lon];
    const d = distToRing(p, ring);
    const mz = String(client.manualZone || '').toLowerCase();
    if (mz === 'ichida' || mz === 'tashqarida') return { zone: mz === 'ichida' ? 'in' : 'out', dist: d, border: false, manual: true };
    return { zone: inside(p, ring) ? 'in' : 'out', dist: d, border: d < (buffer || 1) };
  }

  const NO_PRICE = ['Bekor qilindi', 'Mijoz ozi oldi', 'Qolib ketgan'];
  const NO_PLAN = ['Bekor qilindi', 'Mijoz ozi oldi'];

  function vehicleKind(truck) {
    if (/^gazel/i.test(truck)) return 'gazel';
    if (/^labo/i.test(truck)) return 'labo';
    if (/^kamaz/i.test(truck)) return 'kamaz';
    if (/^changan/i.test(truck)) return 'changan';
    return null;
  }
  // stops: [{bl, zone, cbm, kg, ref}] in order. kind: gazel|labo|kamaz|auto
  function priceTrip(stops, kind, S) {
    const kg = stops.reduce((a, s) => a + (s.kg || 0), 0);
    const cbm = stops.reduce((a, s) => a + (s.cbm || 0), 0);
    let label, base, ptIn, ptOut;
    if (kind === 'auto') kind = (cbm <= S.laboM3 && kg <= S.laboKg) ? 'labo' : 'gazel';
    if (kind === 'labo') { label = 'Labo'; base = S.laboBase; ptIn = ptOut = S.laboPt; }
    else if (kind === 'kamaz') { label = 'Kamaz'; base = S.kamazBase; ptIn = ptOut = S.kamazPt; }
    else if (kind === 'changan') { label = 'Changan'; base = S.changanBase; ptIn = ptOut = S.changanPt; }
    else { const heavy = kg > S.gazelHeavyKg; label = heavy ? 'Gazel (тяжёлый)' : 'Gazel'; base = heavy ? S.gazelHeavy : S.gazelBase; ptIn = S.gazelPtIn; ptOut = S.gazelPtOut; }
    if (base == null || ptIn == null) return { label, total: null, points: 0, formula: 'нет тарифа', perStop: stops.map(() => null) };
    // points already included in the base price: separate setting per vehicle (Gazel B52, Labo B55, Kamaz B56)
    const inc = +(kind === 'labo' ? S.laboBaseIncludesPts : kind === 'kamaz' ? S.kamazBaseIncludesPts : kind === 'changan' ? S.changanBaseIncludesPts : S.baseIncludesPts) || 0;
    const seen = {}; let idx = 0;
    const pts = [];
    stops.forEach((s, i) => {
      if (seen[s.bl] != null) { pts.push({ dup: seen[s.bl] }); return; }
      seen[s.bl] = i; idx++;
      const w = s.zone === 'out' ? ptOut : ptIn;
      pts.push({ tariff: idx <= inc ? 0 : w, weight: w, zone: s.zone });
    });
    const uniq = pts.filter(p => p.dup == null);
    const total = base + uniq.reduce((a, p) => a + p.tariff, 0);
    const nIn = uniq.filter(p => p.zone !== 'out' && p.tariff).length, nOut = uniq.filter(p => p.zone === 'out' && p.tariff).length;
    let formula = Math.round(base / 1000) + '';
    if (ptIn === ptOut) { if (nIn + nOut) formula += ' + ' + (nIn + nOut) + '×' + Math.round(ptIn / 1000); }
    else {
      if (nIn) formula += ' + ' + nIn + '×' + Math.round(ptIn / 1000);
      if (nOut) formula += ' + ' + nOut + '×' + Math.round(ptOut / 1000);
    }
    // share: proportional to the zone tariff of the point (also for points included in the base,
    // so the first client does not get a zero share); duplicates split their point by cbm
    const sumW = uniq.reduce((a, p) => a + p.weight, 0);
    const perStop = stops.map(() => 0);
    stops.forEach((s, i) => {
      const p = pts[i]; if (p.dup != null) return;
      const group = stops.map((x, j) => j).filter(j => j === i || pts[j].dup === i);
      const pointShare = total * (sumW ? p.weight / sumW : 1 / uniq.length);
      const gc = group.reduce((a, j) => a + (stops[j].cbm || 0), 0);
      group.forEach(j => { perStop[j] = gc ? pointShare * (stops[j].cbm || 0) / gc : pointShare / group.length; });
    });
    return { label, total, points: uniq.length, formula: formula + ' тыс.', perStop, dupFlags: pts.map(p => p.dup != null) };
  }

  function nnOrder(depot, stops) {
    const left = stops.slice(), out = []; let cur = depot;
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((s, i) => { const d = km(cur, [s.lat, s.lon]); if (d < bd) { bd = d; bi = i; } });
      const s = left.splice(bi, 1)[0]; out.push(s); cur = [s.lat, s.lon];
    }
    return out;
  }
  // start — minutes from midnight when the trip leaves the depot (default: the start of the day)
  function tripMetrics(depot, stops, S, start) {
    let cur = depot, dist = 0, t = start != null ? start : S.dayStart * 24 * 60; const arrivals = [];
    stops.forEach(s => { const d = km(cur, [s.lat, s.lon]); dist += d; t += d / S.speed * 60 * S.roadK; arrivals.push(t); t += (s.bl === (arrivals.length > 1 ? stops[arrivals.length - 2].bl : null) ? 0 : S.unloadMin); cur = [s.lat, s.lon]; });
    const back = stops.length ? km(cur, depot) : 0;
    return { dist, back, real: (dist + back) * S.roadK, arrivals, finish: t };
  }
  // ---------- planner ----------
  // Every trip gets a vehicle (Labo, Changan, Gazel or Kamaz) that carries its whole load: volume, weight,
  // places and number of points. A shipment bigger than the largest vehicle is split into parts.
  // Among vehicles that fit, the cheapest by tariff wins. In plans A and B Kamaz (and any vehicle without
  // a tariff) carries only cargo that fits no regular vehicle: Gazel first, Kamaz only when it does not fit.
  // Plan B may load a Gazel above its body by a tolerance (bTolM3 / bTolKg), so Kamaz there only takes cargo bigger than that.
  // Plan A keeps every vehicle within its body: Gazel up to gazelM3 / gazelKg.
  const EPS = 1e-6, UNPRICED = 1e8, KM_COST = 1000;
  const known = s => (s.cbm || 0) > 0 || (s.kg || 0) > 0;
  const small = v => v.kind === 'labo' || v.kind === 'changan';   // груз без объёма и веса на маленькую машину не ставим
  function fleetOf(S, kinds, opt = {}) {
    const all = {
      labo: { kind: 'labo', label: 'Labo', m3: +S.laboM3, kg: +S.laboKg },
      gazel: { kind: 'gazel', label: 'Gazel', m3: +S.gazelM3, kg: +S.gazelKg },
      changan: { kind: 'changan', label: 'Changan', m3: +S.changanM3, kg: +S.changanKg },
      kamaz: { kind: 'kamaz', label: 'Kamaz', m3: +S.cM3, kg: +S.cKg }
    };
    const onlyIfNeeded = opt.onlyIfNeeded || [], tol = opt.tol || {};
    return kinds.map(k => all[k]).filter(v => v.m3 > 0 && v.kg > 0).map(v => {
      const tM3 = Math.max(0, +(tol[v.kind] || {}).m3 || 0), tKg = Math.max(0, +(tol[v.kind] || {}).kg || 0);
      return { ...v, nomM3: v.m3, nomKg: v.kg, tolM3: tM3, tolKg: tKg, m3: v.m3 + tM3, kg: v.kg + tKg, places: +S.maxPlaces || 0,
        priced: priceTrip([{ bl: '-', zone: 'in', cbm: 0, kg: 0 }], v.kind, S).total != null, onlyIfNeeded: onlyIfNeeded.includes(v.kind) };
    });
  }
  function load(stops) {
    let cbm = 0, kg = 0, places = 0; const bl = new Set();
    stops.forEach(s => { cbm += s.cbm || 0; kg += s.kg || 0; places += s.places || 0; bl.add(s.bl); });
    return { cbm, kg, places, points: bl.size };
  }
  const fitsIn = (l, v) => l.cbm <= v.m3 + EPS && l.kg <= v.kg + EPS && (!v.places || l.places <= v.places + EPS);
  // load exceeds every vehicle or the point limit — longer segments will not fit either
  const tooBig = (l, fleet, maxStops) => l.points > maxStops || !fleet.some(v => fitsIn(l, v));
  function evalTrip(stops, fleet, maxStops, S, depot) {
    const l = load(stops);
    if (l.points > maxStops) return null;
    const ordered = nnOrder(depot, stops);
    const regular = fleet.filter(v => v.priced && !v.onlyIfNeeded);
    const needsBig = s => !regular.some(v => fitsIn(load([s]), v) && (!small(v) || known(s)));
    let best = null;
    fleet.forEach(v => {
      if (!fitsIn(l, v)) return;
      if (small(v) && !stops.every(known)) return;   // cargo without volume and weight never goes on a Labo or Changan
      // Kamaz in A/B and vehicles without a tariff carry only cargo that fits no regular vehicle
      if ((v.onlyIfNeeded || !v.priced) && regular.length && !stops.every(needsBig)) return;
      const price = priceTrip(ordered, v.kind, S);
      const cost = price.total != null ? price.total : UNPRICED;
      if (!best || cost < best.cost) best = { v, cost, price };
    });
    if (!best) return null;
    const m = tripMetrics(depot, ordered, S);
    return { stops: ordered, l, ...best, real: m.real, val: best.cost + KM_COST * m.real };
  }
  // a single cargo that fits no vehicle (e.g. one piece that cannot be split): the largest vehicle, flagged as overloaded
  function overTrip(s, fleet, S, depot) {
    const v = fleet.reduce((a, b) => (b.m3 + b.kg / 1000 > a.m3 + a.kg / 1000 ? b : a));
    const price = priceTrip([s], v.kind, S), m = tripMetrics(depot, [s], S);
    return { stops: [s], l: load([s]), v, price, cost: UNPRICED, real: m.real, val: UNPRICED * 2, over: true };
  }
  // A shipment bigger than the largest vehicle: full loads for the largest vehicle, and the rest as one smaller
  // part that the plan treats like any other cargo — it can go on a Gazel or Labo, together with other points.
  function splitOversize(items, fleet, notes) {
    if (!fleet.length) return items;
    const M3 = Math.max(...fleet.map(v => v.m3)), KG = Math.max(...fleet.map(v => v.kg)), PL = fleet[0].places;
    const out = [];
    items.forEach(s => {
      const cbm = s.cbm || 0, kg = s.kg || 0, places = s.places || 0;
      const k = Math.max(1, Math.ceil(cbm / M3 - EPS), Math.ceil(kg / KG - EPS), PL ? Math.ceil(places / PL - EPS) : 1);
      if (k === 1) { out.push(s); return; }
      // share of the shipment one full vehicle takes (the cargo is split in proportion: volume, weight and places together)
      const f = Math.min(cbm > 0 ? M3 / cbm : 1, kg > 0 ? KG / kg : 1, PL && places > 0 ? PL / places : 1);
      let shares = Array.from({ length: k - 1 }, () => f).concat([1 - f * (k - 1)]);
      let pl = shares.slice(0, -1).map(x => Math.floor(places * x + EPS));
      pl.push(places - pl.reduce((a, b) => a + b, 0));
      if (PL && pl[k - 1] > PL) { shares = Array(k).fill(1 / k); const b = Math.floor(places / k), e = places - b * k; pl = shares.map((_, i) => b + (i < e ? 1 : 0)); }
      const parts = shares.map((x, i) => ({ ...s, cbm: cbm * x, kg: kg * x, places: pl[i], part: i + 1, parts: k }));
      notes.push({ bl: s.bl, client: s.client, cbm, kg, places, parts: k, sizes: parts.map(x => ({ cbm: x.cbm, kg: x.kg })), indivisible: places > 0 && places < k });
      out.push(...parts);
    });
    return out;
  }
  // points around the depot by direction, starting after the widest empty sector
  function sweepOrder(items) {
    const seq = items.slice().sort((a, b) => a.angle - b.angle || a.depotKm - b.depotKm);
    if (seq.length < 2) return seq;
    let cut = 0, gap = -1;
    seq.forEach((s, i) => { const g = (seq[(i + 1) % seq.length].angle - s.angle + 360) % 360; if (g > gap) { gap = g; cut = (i + 1) % seq.length; } });
    return seq.slice(cut).concat(seq.slice(0, cut));
  }
  // A trip depends only on its set of points: each set is evaluated once (key — sorted item numbers)
  function evaluator(items, fleet, maxStops, S, depot) {
    const id = new Map(items.map((s, i) => [s, i])), memo = new Map();
    const key = stops => stops.map(s => id.get(s)).sort((a, b) => a - b).join(',');
    const ev = stops => {
      const k = key(stops);
      if (!memo.has(k)) memo.set(k, evalTrip(k.split(',').map(i => items[+i]), fleet, maxStops, S, depot));
      return memo.get(k);
    };
    return { ev, key, id: s => id.get(s) };
  }
  // cut the sweep into consecutive arcs, each with its best vehicle, at the lowest total cost (dynamic programming)
  function partition(seq, fleet, maxStops, S, depot, ev = stops => evalTrip(stops, fleet, maxStops, S, depot)) {
    const n = seq.length, best = new Array(n + 1).fill(Infinity), prev = new Array(n + 1);
    best[0] = 0;
    for (let j = 1; j <= n; j++) {
      for (let i = j - 1; i >= 0; i--) {
        const seg = seq.slice(i, j);
        if (i < j - 1 && tooBig(load(seg), fleet, maxStops)) break;
        if (best[i] === Infinity) continue;
        const t = ev(seg);
        if (t && best[i] + t.val < best[j]) { best[j] = best[i] + t.val; prev[j] = { i, t }; }
      }
      if (best[j] === Infinity) { const t = overTrip(seq[j - 1], fleet, S, depot); best[j] = best[j - 1] + t.val; prev[j] = { i: j - 1, t }; }
    }
    const trips = [];
    for (let j = n; j > 0; j = prev[j].i) trips.unshift(prev[j].t);
    return trips;
  }
  // plan B: start with one trip per cargo and keep merging the pair that saves the most (savings method),
  // then move single points between trips while that lowers the total
  function consolidate(items, fleet, maxStops, S, depot, ev = stops => evalTrip(stops, fleet, maxStops, S, depot)) {
    const mk = stops => ev(stops) || (stops.length === 1 ? overTrip(stops[0], fleet, S, depot) : null);
    let trips = items.map(s => mk([s]));
    const maxM3 = Math.max(...fleet.map(v => v.m3)), maxKg = Math.max(...fleet.map(v => v.kg));
    for (;;) {
      let best = null;
      for (let a = 0; a < trips.length; a++) for (let b = a + 1; b < trips.length; b++) {
        const A = trips[a], B = trips[b];
        if (A.over || B.over || A.l.cbm + B.l.cbm > maxM3 + EPS || A.l.kg + B.l.kg > maxKg + EPS) continue;
        const m = ev(A.stops.concat(B.stops));
        if (!m) continue;
        const gain = A.val + B.val - m.val;
        if (gain > EPS && (!best || gain > best.gain + EPS)) best = { a, b, m, gain };
      }
      if (!best) break;
      trips = trips.filter((_, i) => i !== best.a && i !== best.b).concat([best.m]);
    }
    for (let pass = 0, moved = true; moved && pass < 4; pass++) {
      moved = false;
      for (let a = 0; a < trips.length; a++) for (let k = 0; k < trips[a].stops.length && trips[a].stops.length > 1; k++) {
        const s = trips[a].stops[k], rest = trips[a].stops.filter((_, i) => i !== k), A2 = ev(rest);
        if (!A2) continue;
        for (let b = 0; b < trips.length; b++) {
          if (b === a || trips[b].over) continue;
          const B2 = ev(trips[b].stops.concat([s]));
          if (B2 && A2.val + B2.val < trips[a].val + trips[b].val - EPS) { trips[a] = A2; trips[b] = B2; moved = true; k = -1; break; }
        }
      }
    }
    return trips;
  }
  // plan A — the cheapest: many starting plans (the sweep cut at different directions, the savings method), then local search
  // while the total goes down: empty a whole trip into the others, move one point, swap two points of different trips.
  // The total is the tariff sum plus a small cost per km, so fewer trips come first and routes stay compact.
  function cheapest(items, fleet, maxStops, S, depot) {
    if (!items.length) return [];
    const { ev, key, id } = evaluator(items, fleet, maxStops, S, depot), n = items.length;
    const total = ts => ts.reduce((a, t) => a + t.val, 0);
    const size = s => Math.max((s.cbm || 0) / (+S.gazelM3 || 1), (s.kg || 0) / (+S.gazelKg || 1));
    // quick check before the full evaluation: the load must fit the biggest vehicle and the point limit
    const M3 = Math.max(...fleet.map(v => v.m3)), KG = Math.max(...fleet.map(v => v.kg)), PL = fleet[0].places;
    const has = (t, s) => t.stops.some(x => x !== s && x.bl === s.bl);
    const can = (t, add, rem) => {
      const cbm = t.l.cbm + (add ? add.cbm || 0 : 0) - (rem ? rem.cbm || 0 : 0), kg = t.l.kg + (add ? add.kg || 0 : 0) - (rem ? rem.kg || 0 : 0);
      const pts = t.l.points + (add && !has(t, add) ? 1 : 0), pl = t.l.places + (add ? add.places || 0 : 0) - (rem ? rem.places || 0 : 0);
      return cbm <= M3 + EPS && kg <= KG + EPS && pts <= maxStops + (rem && !has(t, rem) ? 1 : 0) && (!PL || pl <= PL + EPS);
    };
    const EMPTY = { val: 0, empty: true }, evOr = st => st.length ? ev(st) : EMPTY;
    function improve(start) {
      const fixed = start.filter(t => t.over);   // a cargo that fits no vehicle stays as it is
      let ts = start.filter(t => !t.over), cur = total(ts);
      const set = (a, A2, b, B2) => { ts = ts.map((t, i) => i === a ? A2 : i === b ? B2 : t).filter(t => !t.empty); cur = total(ts); };
      // 1) empty a trip: its points go where they add least, the biggest first
      const emptyOne = () => {
        const order = ts.map((_, i) => i).sort((a, b) => ts[a].stops.length - ts[b].stops.length || ts[a].l.cbm - ts[b].l.cbm || a - b);
        for (const r of order) {
          const rest = ts.filter((_, i) => i !== r);
          let ok = true;
          for (const s of ts[r].stops.slice().sort((a, b) => size(b) - size(a))) {
            let bi = -1, bd = Infinity, bt = null;
            rest.forEach((t, i) => { if (!can(t, s)) return; const t2 = ev(t.stops.concat([s])); if (t2 && t2.val - t.val < bd - EPS) { bd = t2.val - t.val; bi = i; bt = t2; } });
            if (bi < 0) { ok = false; break; }
            rest[bi] = bt;
          }
          if (ok && total(rest) < cur - EPS) { ts = rest; cur = total(rest); return true; }
        }
        return false;
      };
      // 2) move one point to another trip (a full pass, improvements applied as found)
      const moveAll = () => {
        let any = false;
        for (let a = 0; a < ts.length; a++) for (let k = 0; k < ts[a].stops.length; k++) {
          const s = ts[a].stops[k], A2 = evOr(ts[a].stops.filter(x => x !== s));
          if (!A2) continue;
          for (let b = 0; b < ts.length; b++) {
            if (b === a || !can(ts[b], s)) continue;
            const B2 = ev(ts[b].stops.concat([s]));
            if (B2 && A2.val + B2.val < ts[a].val + ts[b].val - EPS) { const gone = A2.empty; set(a, A2, b, B2); any = true; if (gone) return true; k = -1; break; }
          }
        }
        return any;
      };
      // 3) swap two points of different trips
      const swapAll = () => {
        let any = false;
        for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) {
          scan: for (const s of ts[a].stops) for (const u of ts[b].stops) {
            if (!can(ts[a], u, s) || !can(ts[b], s, u)) continue;
            const A2 = ev(ts[a].stops.filter(x => x !== s).concat([u])), B2 = A2 && ev(ts[b].stops.filter(x => x !== u).concat([s]));
            if (B2 && A2.val + B2.val < ts[a].val + ts[b].val - EPS) { set(a, A2, b, B2); any = true; break scan; }
          }
        }
        return any;
      };
      for (let round = 0; round < 30; round++) {
        if (emptyOne()) continue;
        const moved = moveAll(), swapped = swapAll();
        if (!moved && !swapped) break;
      }
      return ts.concat(fixed);
    }
    // the tightest packing: the fewest vehicles that hold the cargo (search with a node limit); each point goes first
    // to the trip whose points are nearest, so the trips stay compact. Cargo for Kamaz is packed separately.
    function packStart() {
      const regular = fleet.filter(v => v.priced && !v.onlyIfNeeded), cap = regular.length ? regular.reduce((a, v) => (v.m3 + v.kg / 1000 > a.m3 + a.kg / 1000 ? v : a)) : null;
      const fitsCap = (s, c) => (s.cbm || 0) <= c.m3 + EPS && (s.kg || 0) <= c.kg + EPS;
      const big = fleet.reduce((a, v) => (v.m3 + v.kg / 1000 > a.m3 + a.kg / 1000 ? v : a));
      const groups = cap ? [[items.filter(s => fitsCap(s, cap)), cap], [items.filter(s => !fitsCap(s, cap)), big]] : [[items, big]];
      const out = [];
      for (const [list, c] of groups) {
        if (!list.length) continue;
        const its = list.slice().sort((a, b) => Math.max(b.cbm / c.m3, b.kg / c.kg) - Math.max(a.cbm / c.m3, a.kg / c.kg) || id(a) - id(b));
        const pts = new Set(its.map(s => s.bl)).size;
        const lb = Math.max(1, Math.ceil(its.reduce((a, s) => a + (s.cbm || 0), 0) / c.m3 - EPS), Math.ceil(its.reduce((a, s) => a + (s.kg || 0), 0) / c.kg - EPS), Math.ceil(pts / maxStops));
        let found = null;
        for (let K = lb; K <= its.length && !found; K++) {
          const bins = Array.from({ length: K }, () => ({ c: 0, k: 0, p: 0, bl: new Map(), lat: 0, lon: 0, m: 0, st: [] }));
          let nodes = 0;
          const put = (b, s, sign) => { b.c += sign * (s.cbm || 0); b.k += sign * (s.kg || 0); b.p += sign * (s.places || 0); b.lat += sign * s.lat; b.lon += sign * s.lon; b.m += sign; b.bl.set(s.bl, (b.bl.get(s.bl) || 0) + sign); if (!b.bl.get(s.bl)) b.bl.delete(s.bl); if (sign > 0) b.st.push(s); else b.st.pop(); };
          const rec = i => {
            if (i === its.length) return true;
            if (++nodes > 20000) return false;
            const s = its[i], d = b => b.m ? Math.hypot(b.lat / b.m - s.lat, (b.lon / b.m - s.lon) * 0.75) : Infinity;
            let emptyTried = false;
            for (const b of bins.slice().sort((x, y) => d(x) - d(y))) {
              if (!b.m) { if (emptyTried) continue; emptyTried = true; }
              if (b.c + (s.cbm || 0) > c.m3 + EPS || b.k + (s.kg || 0) > c.kg + EPS || (PL && b.p + (s.places || 0) > PL + EPS) || (!b.bl.has(s.bl) && b.bl.size >= maxStops)) continue;
              put(b, s, 1);
              if (rec(i + 1)) return true;
              put(b, s, -1);
            }
            return false;
          };
          if (rec(0)) found = bins.filter(b => b.m).map(b => b.st.slice());
          else if (nodes > 20000) break;   // too hard to prove — the other starts will do
        }
        if (!found) return null;
        for (const st of found) { const t = ev(st); if (!t) return null; out.push(t); }
      }
      return out;
    }
    const seq = sweepOrder(items), starts = Math.min(n, 24), cands = [];
    const packed = packStart();
    if (packed) cands.push(packed);
    for (let k = 0; k < starts; k++) { const r = Math.floor(k * n / starts); cands.push(partition(seq.slice(r).concat(seq.slice(0, r)), fleet, maxStops, S, depot, ev)); }
    cands.push(consolidate(items, fleet, maxStops, S, depot, ev));
    const sig = ts => ts.map(t => key(t.stops)).sort().join('|'), tried = new Set(), tries = n <= 30 ? 4 : 2;
    let best = null;
    for (const c of cands.map((ts, i) => ({ ts, v: total(ts), i })).sort((x, y) => x.v - y.v || x.i - y.i)) {
      if (tried.has(sig(c.ts))) continue;
      tried.add(sig(c.ts));
      const ts = improve(c.ts), v = total(ts);
      if (!best || v < best.v - EPS) best = { ts, v };
      if (tried.size >= tries) break;
    }
    return best.ts;
  }
  // plan C: only Kamaz; the trucks share the sweep into sectors of similar load, each truck makes several trips
  function kamazRuns(items, fleet, S, depot) {
    const v = fleet[0], trucks = Math.max(1, S.cTrucks | 0), seq = sweepOrder(items);
    const w = s => Math.max((s.cbm || 0) / v.m3, (s.kg || 0) / v.kg, 1e-3), total = seq.reduce((a, s) => a + w(s), 0);
    const sectors = [[]]; let acc = 0;
    seq.forEach(s => {
      if (sectors[sectors.length - 1].length && sectors.length < trucks && acc + w(s) / 2 > total * sectors.length / trucks) sectors.push([]);
      sectors[sectors.length - 1].push(s); acc += w(s);
    });
    const out = [];
    sectors.forEach((sec, k) => partition(sec, fleet, S.bcMaxStops || 99, S, depot).forEach((t, i) => out.push({ ...t, name: 'Kamaz-' + (k + 1) + ' · рейс ' + (i + 1), car: k + 1, round: i + 1 })));
    return out;
  }

  function buildPlans(stopsAll, S) {
    const depot = [S.depotLat, S.depotLon];
    const withC = stopsAll.filter(s => s.lat != null), noC = stopsAll.filter(s => s.lat == null);
    withC.forEach(s => { s.angle = bearing(depot, [s.lat, s.lon]); s.depotKm = km(depot, [s.lat, s.lon]); });
    // Trips go to the vehicles of the fleet (Gazel 9, Changan 1, Labo 1, Kamaz 2 — «Тарифы»): the longest trips first,
    // one per vehicle; the rest as a second trip of the vehicle that is back first (up to tripsPerVehicle a day).
    // A trip beyond that gets no vehicle and is flagged. Plan C brings its own trucks and runs (car, round).
    const COUNT = { gazel: S.gazelCount, changan: S.changanCount, labo: S.laboCount, kamaz: S.cTrucks }, PER = Math.max(1, S.tripsPerVehicle | 0 || 1);
    const back = t => t.finish + t.back / S.speed * 60 * S.roadK;
    const RANK = { labo: 0, changan: 1, gazel: 2, kamaz: 3 };
    const finish = raw => {
      const trips = raw.map(t => ({ name: t.name, car: t.car, round: t.round, stops: t.stops, cbm: t.l.cbm, kg: t.l.kg, places: t.l.places, ...tripMetrics(depot, t.stops, S), start: S.dayStart * 1440,
        price: t.price, kind: t.v.kind, vehicle: t.v, over: !!t.over, outside: t.stops.filter(s => s.zone === 'out') }));
      const leave = (t, at) => Object.assign(t, tripMetrics(depot, t.stops, S, at), { start: at });   // the trip starts later: arrivals move
      // runs given by the plan: each next run of a truck leaves when the previous one is back
      const own = {};
      trips.filter(t => t.car).forEach(t => (own[t.kind + t.car] = own[t.kind + t.car] || []).push(t));
      Object.values(own).forEach(runs => runs.sort((a, b) => a.round - b.round).reduce((at, t) => (leave(t, at), back(t)), S.dayStart * 1440));
      const byKind = {};
      trips.filter(t => !t.car).forEach(t => (byKind[t.kind] = byKind[t.kind] || []).push(t));
      Object.keys(byKind).forEach(kind => {
        const list = byKind[kind], n = COUNT[kind] | 0, label = list[0].vehicle.label;
        if (n <= 0) { list.forEach((t, k) => { t.name = label + '-' + (k + 1); }); return; }   // число машин не задано
        const dur = t => back(t) - t.start;
        const order = list.slice().sort((a, b) => dur(b) - dur(a)), cars = [];
        order.slice(0, n).forEach((t, k) => { cars.push({ no: k + 1, free: back(t), used: 1 }); Object.assign(t, { name: label + '-' + (k + 1), car: k + 1, round: 1 }); });
        order.slice(n).sort((a, b) => dur(a) - dur(b)).forEach(t => {
          const car = cars.filter(c => c.used < PER).sort((a, b) => a.free - b.free || a.no - b.no)[0];
          if (!car) { Object.assign(t, { name: label + ' · нет машины', noVehicle: true }); return; }
          car.used++;
          leave(t, car.free);
          Object.assign(t, { name: label + '-' + car.no + ' · рейс ' + car.used, car: car.no, round: car.used });
          car.free = back(t);
        });
      });
      // по машинам: Labo, Changan, Gazel, Kamaz; у каждой — её рейсы по порядку
      return trips.map((t, i) => ({ t, i })).sort((a, b) => (RANK[a.t.kind] - RANK[b.t.kind]) || ((a.t.car || 999) - (b.t.car || 999)) || ((a.t.round || 0) - (b.t.round || 0)) || a.i - b.i).map(x => x.t);
    };
    const plan = (kinds, build, opt) => {
      const fleet = fleetOf(S, kinds, opt), splits = [];
      if (!fleet.length) return { trips: [], splits, noFleet: true };
      const items = splitOversize(withC, fleet, splits);
      return { trips: finish(build(items, fleet)), splits, fleet };
    };
    const lab = kinds => S.smartLabo !== 0 ? kinds : kinds.filter(k => k !== 'labo');
    const A = plan(lab(['labo', 'changan', 'gazel', 'kamaz']), (items, fleet) => cheapest(items, fleet, S.aMaxStops || 99, S, depot), { onlyIfNeeded: ['kamaz'] });   // строго по кузову
    const B = plan(lab(['labo', 'gazel', 'kamaz']), (items, fleet) => cheapest(items, fleet, S.bcMaxStops || 99, S, depot),   // тот же поиск, свои правила
      { onlyIfNeeded: ['kamaz'], tol: { gazel: { m3: S.bTolM3, kg: S.bTolKg } } });   // Gazel с допуском
    const C = plan(['kamaz'], (items, fleet) => kamazRuns(items, fleet, S, depot));
    const sum = trips => {
      const priced = trips.filter(t => t.price.total != null), n = k => trips.filter(t => t.kind === k).length;
      return {
        trips: trips.length,
        km: trips.reduce((a, t) => a + t.dist, 0),
        real: trips.reduce((a, t) => a + t.real, 0),
        outside: trips.reduce((a, t) => a + t.outside.length, 0),
        outsideCbm: trips.reduce((a, t) => a + t.outside.reduce((x, s) => x + s.cbm, 0), 0),
        price: priced.reduce((a, t) => a + t.price.total, 0),
        unpriced: trips.length - priced.length,
        labo: n('labo'), changan: n('changan'), gazel: n('gazel'), kamaz: n('kamaz'), over: trips.filter(t => t.over).length,
        noVehicle: trips.filter(t => t.noVehicle).length, second: trips.filter(t => t.round > 1).length
      };
    };
    const out = { noCoords: noC };
    [['A', A], ['B', B], ['C', C]].forEach(([k, p]) => { out[k] = { ...p, sum: sum(p.trips) }; });
    return out;
  }

  function yRoute(depot, pts) {
    return 'https://yandex.uz/maps/?rtt=auto&rtext=' + [depot].concat(pts).map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join('~');
  }
  function yPoint(lat, lon) { return 'https://yandex.uz/maps/?pt=' + lon + ',' + lat + '&z=17&l=map'; }

  // ---- minimal XLSX writer (stored zip) ----
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cd.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    const cdSize = cd.reduce((a, p) => a + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  function xlsx(sheets) {
    const sx = sheets.map(sh => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      sh.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = col(ci) + (ri + 1);
        return typeof v === 'number' ? '<c r="' + ref + '"><v>' + v + '</v></c>' : '<c r="' + ref + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('') + '</row>').join('') + '</sheetData></worksheet>');
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' }
    ].concat(sx.map((d, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: d })));
    return zip(files);
  }

  // ТКАД по карте Яндекса (сверено со станциями метро Yashnobod/Rohat), с петлёй вокруг Keles
  const TKAD_V2 = [[41.350512,69.166316],[41.361015,69.173959],[41.368162,69.185104],[41.386242,69.184761],[41.401736,69.189561],[41.413095,69.201906],[41.419807,69.22248],[41.419807,69.243054],[41.413095,69.260199],[41.402769,69.267057],[41.391678,69.270552],[41.385972,69.279892],[41.383978,69.290981],[41.384639,69.304957],[41.38366,69.317525],[41.38211,69.32878],[41.371779,69.335638],[41.360067,69.33781],[41.349017,69.355149],[41.341911,69.367905],[41.333414,69.377178],[41.328781,69.372809],[41.320367,69.360817],[41.312367,69.34838],[41.305017,69.340823],[41.298795,69.349027],[41.2874,69.359336],[41.277685,69.361699],[41.270253,69.363818],[41.260881,69.375284],[41.252141,69.386138],[41.244139,69.395349],[41.236824,69.383579],[41.229201,69.371626],[41.223081,69.36307],[41.213753,69.347811],[41.204424,69.332895],[41.194229,69.32215],[41.186798,69.311635],[41.177061,69.298871],[41.170853,69.288917],[41.164085,69.273847],[41.164622,69.26387],[41.165623,69.250141],[41.166661,69.236425],[41.170279,69.223166],[41.174431,69.209553],[41.180712,69.200534],[41.187602,69.194396],[41.193674,69.188876],[41.201177,69.185519],[41.211816,69.191511],[41.219154,69.197538],[41.226826,69.192367],[41.22809,69.180025],[41.234959,69.168512],[41.234921,69.162232],[41.24795,69.151842],[41.260972,69.14954],[41.271255,69.147041],[41.281583,69.148016],[41.292051,69.150242],[41.302377,69.15156],[41.312788,69.15394],[41.323016,69.158504],[41.332873,69.162923],[41.34281,69.1648]];
  const KELES = [41.398, 69.205];
  const KELES_BULGE = [[41.3860, 69.1830], [41.4020, 69.1800], [41.4160, 69.1900], [41.4190, 69.2080], [41.4130, 69.2260], [41.3980, 69.2340], [41.3850, 69.2360]];
  function withKeles(ring) {
    if (!ring || ring.length < 3 || inside(KELES, ring)) return ring;
    let s = 0; ring.forEach((p, i) => { if (p[0] < ring[s][0]) s = i; });
    const rot = ring.slice(s).concat(ring.slice(0, s));
    const drop = p => p[0] > 41.37 && p[1] > 69.195 && p[1] < 69.239;
    let j = rot.findIndex(drop);
    const kept = rot.filter(p => !drop(p));
    if (j < 0) { let best = 0, bd = Infinity; kept.forEach((p, i) => { const d = km(p, [41.378, 69.195]); if (d < bd) { bd = d; best = i; } }); j = best + 1; }
    kept.splice(j, 0, ...KELES_BULGE);
    return kept;
  }
  function ringLength(ring) { let d = 0; for (let i = 0; i < ring.length; i++) d += km(ring[i], ring[(i + 1) % ring.length]); return d; }

  const DISTRICT_ANCHORS = [['Chilonzor', 41.275, 69.205], ['Uchtepa', 41.300, 69.165], ['Olmazor', 41.345, 69.215], ['Yunusobod', 41.365, 69.285], ['Yashnobod', 41.300, 69.335], ['Shayxontohur', 41.325, 69.240], ['Sergeli', 41.225, 69.225], ['Yangihayot', 41.228, 69.180], ["Mirzo Ulug'bek", 41.335, 69.335], ['Mirobod', 41.290, 69.285], ['Bektemir', 41.210, 69.335], ['Yakkasaroy', 41.285, 69.250]];
  // район по координатам: ближайшие клиенты с известным районом + опорные точки районов
  function guessDistrict(lat, lon, clients, exceptBl) {
    if (lat == null || lon == null) return null;
    const pts = [];
    (clients || []).forEach(c => { if (c.bl !== exceptBl && c.lat != null && c.district && c.district !== 'Aniqlanmagan' && !c.districtAuto) pts.push([c.district, km([lat, lon], [c.lat, c.lon])]); });
    DISTRICT_ANCHORS.forEach(([d, a, b]) => pts.push([d, km([lat, lon], [a, b]) * 1.15]));
    pts.sort((a, b) => a[1] - b[1]);
    const votes = {};
    pts.slice(0, 5).forEach(([d, dist]) => { votes[d] = (votes[d] || 0) + 1 / Math.max(dist, 0.3); });
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return best ? { district: best[0], km: pts[0][1] } : null;
  }

  window.LogiEngine = { guessDistrict, km, bearing, inside, distToRing, zoneOf, priceTrip, vehicleKind, buildPlans, yRoute, yPoint, xlsx, NO_PRICE, NO_PLAN, withKeles, ringLength, KELES, TKAD_V2 };
})();
