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
    else { const heavy = kg > S.gazelHeavyKg; label = heavy ? 'Gazel (тяжёлый)' : 'Gazel'; base = heavy ? S.gazelHeavy : S.gazelBase; ptIn = S.gazelPtIn; ptOut = S.gazelPtOut; }
    if (base == null || ptIn == null) return { label, total: null, points: 0, formula: 'нет тарифа', perStop: stops.map(() => null) };
    // points already included in the base price: separate setting per vehicle (Gazel B52, Labo B55, Kamaz B56)
    const inc = +(kind === 'labo' ? S.laboBaseIncludesPts : kind === 'kamaz' ? S.kamazBaseIncludesPts : S.baseIncludesPts) || 0;
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
    if (nIn) formula += ' + ' + nIn + '×' + Math.round(ptIn / 1000);
    if (nOut) formula += ' + ' + nOut + '×' + Math.round(ptOut / 1000);
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
  function tripMetrics(depot, stops, S) {
    let cur = depot, dist = 0, t = S.dayStart * 24 * 60; const arrivals = [];
    stops.forEach(s => { const d = km(cur, [s.lat, s.lon]); dist += d; t += d / S.speed * 60 * S.roadK; arrivals.push(t); t += (s.bl === (arrivals.length > 1 ? stops[arrivals.length - 2].bl : null) ? 0 : S.unloadMin); cur = [s.lat, s.lon]; });
    const back = stops.length ? km(cur, depot) : 0;
    return { dist, back, real: (dist + back) * S.roadK, arrivals, finish: t };
  }
  function fits(bin, s, cap) {
    return bin.cbm + s.cbm <= cap.m3 + 1e-9 && bin.kg + s.kg <= cap.kg + 1e-9 && bin.stops.length < cap.stops && (!cap.places || bin.places + s.places <= cap.places);
  }
  function newBin() { return { stops: [], cbm: 0, kg: 0, places: 0 }; }
  function add(bin, s) { bin.stops.push(s); bin.cbm += s.cbm; bin.kg += s.kg; bin.places += s.places; }
  function sweepPack(list, cap) {
    const bins = []; let b = null;
    list.forEach(s => { if (!b || (!fits(b, s, cap) && b.stops.length)) { b = newBin(); bins.push(b); } add(b, s); });
    return bins;
  }

  function buildPlans(stopsAll, S) {
    const depot = [S.depotLat, S.depotLon];
    const withC = stopsAll.filter(s => s.lat != null), noC = stopsAll.filter(s => s.lat == null);
    withC.forEach(s => { s.angle = bearing(depot, [s.lat, s.lon]); s.depotKm = km(depot, [s.lat, s.lon]); });
    const isuzu = { m3: S.isuzuM3, kg: S.isuzuKg, places: S.maxPlaces };
    const mkTrip = (nm, ordered, kind) => {
      const m = tripMetrics(depot, ordered, S), price = priceTrip(ordered, kind, S);
      const sm = k => ordered.reduce((a, s) => a + (s[k] || 0), 0);
      return { name: nm, stops: ordered, cbm: sm('cbm'), kg: sm('kg'), places: sm('places'), ...m, price, kind, outside: ordered.filter(s => s.zone === 'out') };
    };
    const finish = (bins, name, kindFn) => bins.map((b, i) => mkTrip(name(i, b), nnOrder(depot, b.stops), kindFn(b)));
    // «умный» подбор машин: каждый рейс режем на подряд идущие участки маршрута, каждый — Labo (если влезает) или Gazel; берём самый дешёвый вариант
    const smart = S.smartLabo !== 0 && S.laboBase != null && S.laboPt != null;
    const known = s => (s.cbm || 0) > 0 || (s.kg || 0) > 0;
    const smartFinish = bins => {
      const out = []; let nL = 0, nG = 0;
      bins.forEach(b => {
        const st = nnOrder(depot, b.stops), n = st.length;
        let segs = [{ from: 0, to: n, kind: 'auto' }];
        if (smart && n) {
          const best = new Array(n + 1).fill(Infinity), prev = new Array(n + 1); best[0] = 0;
          for (let j = 1; j <= n; j++) for (let i = 0; i < j; i++) {
            if (best[i] === Infinity) continue;
            const seg = st.slice(i, j), cbm = seg.reduce((a, s) => a + (s.cbm || 0), 0), kg = seg.reduce((a, s) => a + (s.kg || 0), 0);
            const opts = ['gazel'];
            if (cbm <= S.laboM3 + 1e-9 && kg <= S.laboKg + 1e-9 && seg.every(known)) opts.push('labo');
            opts.forEach(k => { const p = priceTrip(seg, k, S).total; if (p == null) return; const c = best[i] + p + 1; if (c < best[j]) { best[j] = c; prev[j] = { i, k }; } });
          }
          if (best[n] < Infinity) { segs = []; for (let j = n; j > 0; j = prev[j].i) segs.unshift({ from: prev[j].i, to: j, kind: prev[j].k }); }
        }
        segs.forEach(g => { const k = g.kind === 'auto' ? 'auto' : g.kind; const nm = k === 'labo' ? 'Labo-' + (++nL) : 'Gazel-' + (++nG); out.push(mkTrip(nm, st.slice(g.from, g.to), k)); });
      });
      return out;
    };
    // A
    const sorted = withC.slice().sort((a, b) => a.angle - b.angle);
    const A = smartFinish(sweepPack(sorted, { ...isuzu, stops: S.aMaxStops }));
    // B
    const capB = { ...isuzu, stops: S.bcMaxStops };
    const small = sorted.filter(s => s.cbm <= S.bSmallM3), big = withC.filter(s => s.cbm > S.bSmallM3).sort((a, b) => b.cbm - a.cbm);
    const binsB = sweepPack(small, capB);
    big.forEach(s => { let b = binsB.find(x => fits(x, s, capB)); if (!b) { b = newBin(); binsB.push(b); } add(b, s); });
    const B = smartFinish(binsB);
    // C
    const n = Math.max(1, S.cTrucks | 0), per = Math.ceil(sorted.length / n);
    const capC = { m3: S.cM3, kg: S.cKg, places: S.maxPlaces, stops: S.bcMaxStops };
    let C = [];
    for (let k = 0; k < n; k++) {
      const sector = sorted.slice(k * per, (k + 1) * per);
      const bins = sweepPack(sector, capC);
      C = C.concat(finish(bins, i => 'Katta-' + (k + 1) + ' · рейс ' + (i + 1), () => 'kamaz'));
    }
    const sum = (trips) => ({
      trips: trips.length,
      km: trips.reduce((a, t) => a + t.dist, 0),
      real: trips.reduce((a, t) => a + t.real, 0),
      outside: trips.reduce((a, t) => a + t.outside.length, 0),
      outsideCbm: trips.reduce((a, t) => a + t.outside.reduce((x, s) => x + s.cbm, 0), 0),
      price: trips.some(t => t.price.total == null) ? null : trips.reduce((a, t) => a + t.price.total, 0),
      labo: trips.filter(t => /^Labo/.test(t.price.label)).length
    });
    return { A: { trips: A, sum: sum(A) }, B: { trips: B, sum: sum(B) }, C: { trips: C, sum: sum(C) }, noCoords: noC };
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
