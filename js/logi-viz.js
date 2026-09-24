/* Визуализация загрузки рейсов в 3D — вкладка «Визуализация».
 *
 * Размеров мест в данных нет, поэтому груз каждой точки раскладывается кубиками по его объёму (CBM):
 * кузов делится на ячейки, груз заполняет их стенка за стенкой от кабины к дверям, в стенке — снизу вверх.
 * Порядок — как при разгрузке: последнюю точку грузят первой (к кабине), точка 1 оказывается у дверей.
 * Кузов: Labo — бортовой, размеры производителя, высота груза — из объёма во «Тарифах»;
 * Gazel и Kamaz — фургоны с типичными шириной и высотой, длина — из объёма во «Тарифах».
 * Груз больше кузова (допуск плана B) показан за дверями полупрозрачным.
 *
 * layout() — чистый расчёт, работает и без 3D. Сцену рисует three.js
 * (js/vendor/three/three-viz.min.js), он загружается при первом открытии вкладки.
 */
(function () {
  'use strict';
  // flat — бортовой кузов: длина и ширина заданы, высота груза = объём / площадь пола.
  // Иначе фургон: ширина и высота заданы, длина = объём / (ширина × высота).
  // Labo (UzAuto): кузов 1,94 × 1,33 м, борт 0,29 м; машина 3,495 × 1,4 × 1,8 м, колёсная база 1,84 м.
  const BODY = {
    labo: { flat: true, l: 1.94, w: 1.33, side: 0.29, cab: 1.45, cabW: 1.4, cabH: 1.47, wheel: 0.27, front: 0.55, base: 1.84, cabColor: '#f1f2f4' },
    gazel: { w: 2.1, h: 1.9, cab: 1.75, cabH: 2.15, wheel: 0.36, cabColor: '#f1f2f4' },
    kamaz: { w: 2.45, h: 2.6, cab: 2.2, cabH: 3.0, wheel: 0.5, cabColor: '#d9772b' }
  };
  // красный — последним: им же помечено «сверх кузова»
  const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#b07aa1', '#edc948', '#17becf', '#ff9da7', '#9c755f', '#76b7b2', '#bcbd22', '#6b6ecf', '#e377c2', '#393b79', '#98df8a', '#e15759'];
  const colorOf = n => PALETTE[(Math.max(1, n) - 1) % PALETTE.length];
  const light = hex => { const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255; return 0.299 * r + 0.587 * g + 0.114 * b > 160; };

  function bodyOf(kind, m3) {
    const b = BODY[kind] || BODY.gazel, v = Math.max(+m3 || 0, 0.5);
    return b.flat ? { ...b, v, h: v / (b.l * b.w) } : { ...b, v, l: v / (b.w * b.h) };
  }

  // точки рейса в порядке разгрузки; один BL — одна точка (части одной отгрузки и повторы складываются)
  function pointsOf(trip) {
    const pts = [], by = {};
    trip.stops.forEach(s => {
      let p = by[s.bl];
      if (!p) { p = by[s.bl] = { n: pts.length + 1, bl: s.bl, client: s.client || {}, cbm: 0, kg: 0, places: 0, parts: [] }; pts.push(p); }
      p.cbm += s.cbm || 0; p.kg += s.kg || 0; p.places += s.places || 0;
      if (s.parts) p.parts.push(s.part + '/' + s.parts);
    });
    return pts;
  }

  function layout(trip) {
    const veh = trip.vehicle || {}, kind = trip.kind || veh.kind || 'gazel';
    const B = bodyOf(kind, veh.nomM3 != null ? veh.nomM3 : veh.m3);
    const c = Math.cbrt(B.v / (kind === 'labo' ? 250 : 700));   // ~700 ячеек в кузове: видно груз и быстро рисуется
    const n = { x: Math.max(1, Math.round(B.l / c)), y: Math.max(1, Math.round(B.h / c)), z: Math.max(1, Math.round(B.w / c)) };
    const cell = { x: B.l / n.x, y: B.h / n.y, z: B.w / n.z }, cellV = cell.x * cell.y * cell.z, wall = n.y * n.z, cap = n.x * wall;
    const points = pointsOf(trip), cells = [];
    let cum = 0, k = 0;
    points.slice().reverse().forEach(p => {
      cum += p.cbm;
      const end = Math.max(k + 1, Math.round(cum / cellV));
      p.from = k; p.cells = end - k;
      for (; k < end; k++) cells.push({ p: p.n, ix: Math.floor(k / wall), iy: Math.floor((k % wall) / n.z), iz: k % n.z });
    });
    const cbm = points.reduce((a, p) => a + p.cbm, 0), kg = points.reduce((a, p) => a + p.kg, 0);
    let moment = 0;
    points.forEach(p => {
      const own = cells.slice(p.from, p.from + p.cells);
      p.x = own.reduce((a, q) => a + (q.ix + 0.5) * cell.x, 0) / own.length;   // середина груза точки от кабины, м
      p.top = (Math.max(...own.map(q => q.iy)) + 1) * cell.y;
      p.over = own.some(q => q.ix >= n.x);
      moment += p.x * p.kg;
    });
    return {
      name: trip.name, kind, label: veh.label || kind, body: B, n, cell, cellV, cap, points, cells, cbm, kg,
      maxKg: veh.nomKg != null ? veh.nomKg : veh.kg, fill: cbm / B.v, overM3: Math.max(0, cbm - B.v), overCells: Math.max(0, k - cap),
      cg: kg ? moment / kg : null
    };
  }

  // ---------- 3D ----------
  let T = null, loading = null;
  function load() {
    if (T) return Promise.resolve(T);
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('js/vendor/three/three-viz.min.js', document.baseURI).href; s.async = true;
      s.onload = () => { T = window.LogiThree || null; if (T) res(T); else { loading = null; rej(new Error('3D-библиотека не загрузилась')); } };
      s.onerror = () => { loading = null; s.remove(); rej(new Error('Не удалось загрузить 3D. Нужен интернет при первом открытии вкладки.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  const DIRS = { '3d': [1, 0.8, 1.15], side: [0.001, 0.12, 1], top: [0.001, 1, 0.12], back: [1, 0.35, 0.001] };

  function createView(el, h) {
    if (!T) throw new Error('3D ещё не загружен');
    const css = getComputedStyle(document.documentElement), tok = (name, d) => css.getPropertyValue(name).trim() || d;
    const font = tok('--font-heading', 'system-ui, sans-serif');
    // цвета сцены — из токенов design-system.css, чтобы 3D менялся вместе с оформлением сайта
    const C = { danger: tok('--color-danger', '#c0392b'), ink: tok('--color-accent-900', '#1d2d3d'), shell: tok('--color-accent', '#5980a6'), edge: tok('--color-accent-700', '#416180'),
      envelope: tok('--color-accent-500', '#749dc4'), glass: tok('--color-accent-800', '#2c455d'), grid1: tok('--color-neutral-400', '#b7b7ba'), grid2: tok('--color-neutral-300', '#d4d4d7') };
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    const cv = renderer.domElement;
    cv.style.display = 'block'; cv.style.touchAction = 'none'; cv.style.outline = 'none';
    el.appendChild(cv);
    const scene = new T.Scene();
    scene.background = new T.Color(tok('--color-surface', '#e9e9ea'));
    const camera = new T.PerspectiveCamera(38, 1, 0.05, 500);
    const controls = new T.OrbitControls(camera, cv);
    controls.enableDamping = false; controls.screenSpacePanning = true; controls.maxPolarAngle = Math.PI * 0.49;
    scene.add(new T.HemisphereLight(0xffffff, 0x9aa0a8, 1.9));
    const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-5, 12, 7); scene.add(sun);
    const fill = new T.DirectionalLight(0xffffff, 0.5); fill.position.set(8, 4, -6); scene.add(fill);
    let root = null, ground = null, pick = [], cur = {}, disposed = false;

    const render = () => { if (!disposed) renderer.render(scene, camera); };
    controls.addEventListener('change', render);
    const resize = () => {
      const w = el.clientWidth || 1, hh = el.clientHeight || 1;
      renderer.setSize(w, hh, false); cv.style.width = w + 'px'; cv.style.height = hh + 'px';
      camera.aspect = w / hh; camera.updateProjectionMatrix(); render();
    };
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);

    const sprite = (text, o) => {
      const fs = 64, c = document.createElement('canvas'), x = c.getContext('2d');
      x.font = '600 ' + fs + 'px ' + font;
      const round = !!o.round, hgt = Math.round(fs * (round ? 1.5 : 1.35)), w = round ? hgt : Math.ceil(x.measureText(text).width) + 40;
      c.width = w; c.height = hgt;
      x.font = '600 ' + fs + 'px ' + font;
      x.fillStyle = o.bg;
      if (round) { x.beginPath(); x.arc(w / 2, hgt / 2, hgt / 2 - 5, 0, Math.PI * 2); x.fill(); x.lineWidth = 7; x.strokeStyle = '#ffffff'; x.stroke(); }
      else { const r = 18; x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, hgt, r); x.arcTo(w, hgt, 0, hgt, r); x.arcTo(0, hgt, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill(); }
      x.fillStyle = o.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, hgt / 2 + 3);
      const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(o.size * w / hgt, o.size, 1); sp.renderOrder = 10;
      return sp;
    };

    // одна машина с грузом; кабина к x<0, кузов от x=0 (стенка кабины) до x=L (двери), y — вверх, z — поперёк
    function truck(lay, o) {
      const g = new T.Group(), B = lay.body, L = B.l, W = B.w, H = B.h, meshes = [];
      const lam = (color, extra) => new T.MeshLambertMaterial(Object.assign({ color }, extra || {}));
      const box = (sx, sy, sz, x, y, z, m) => { const ms = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m); ms.position.set(x, y, z); g.add(ms); meshes.push(ms); return ms; };
      const dark = lam('#3b3f45');
      box(L, 0.06, W, L / 2, -0.03, 0, lam('#a3a8ae'));                                     // пол кузова
      const CW = B.cabW || W * 0.97, glass = lam(C.glass), k = Math.min(1, Math.max(0.5, (L + B.cab) / 7.5));   // подписи мельче у маленькой машины
      box(L + B.cab + 0.25, 0.14, W * 0.8, (L - B.cab - 0.08) / 2, -0.17, 0, dark);          // рама
      box(B.cab, B.cabH, CW, -B.cab / 2 - 0.08, B.cabH / 2 - 0.3, 0, lam(B.cabColor));        // кабина
      box(0.03, B.cabH * 0.36, CW * 0.87, -B.cab - 0.095, B.cabH * 0.6 - 0.3, 0, glass);        // лобовое стекло
      [-1, 1].forEach(sd => box(B.cab * 0.45, B.cabH * 0.3, 0.02, -B.cab * 0.45 - 0.08, B.cabH * 0.6 - 0.3, sd * (CW / 2 + 0.005), glass));
      const r = B.wheel, wy = -0.24 - r * 0.45, wheelGeo = new T.CylinderGeometry(r, r, 0.26 + r * 0.2, 22);
      const fa = B.base ? -B.cab - 0.08 + B.front : -B.cab * 0.55, ra = B.base ? fa + B.base : L * 0.7;   // оси: у Labo по колёсной базе
      const axles = [fa, ra].concat(lay.kind === 'kamaz' ? [ra + r * 2.3] : []), track = Math.max(W, CW) / 2 - 0.16;
      axles.forEach(ax => [-1, 1].forEach(sd => { const w = new T.Mesh(wheelGeo, dark); w.rotation.x = Math.PI / 2; w.position.set(ax, wy, sd * track); g.add(w); meshes.push(w); }));
      if (B.flat) {
        // бортовой кузов: низкие борта, над ними — контур, до какой высоты уложен груз по объёму из «Тарифов»
        const sideM = lam('#d5d9de'), sh = B.side;
        [-1, 1].forEach(sd => box(L, sh, 0.03, L / 2, sh / 2, sd * (W / 2 - 0.015), sideM));
        box(0.03, sh, W, 0.015, sh / 2, 0, sideM); box(0.03, sh, W, L - 0.015, sh / 2, 0, sideM);
        const env = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(L, H, W)), new T.LineBasicMaterial({ color: C.envelope, transparent: true, opacity: 0.7 }));
        env.position.set(L / 2, H / 2, 0); g.add(env);
      } else {
        // фургон: прозрачные стенки и рёбра
        const shell = new T.Mesh(new T.BoxGeometry(L, H, W), lam(C.shell, { transparent: true, opacity: 0.07, depthWrite: false, side: T.DoubleSide }));
        shell.position.set(L / 2, H / 2, 0); g.add(shell);
        const edges = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(L, H, W)), new T.LineBasicMaterial({ color: C.edge }));
        edges.position.copy(shell.position); g.add(edges);
      }
      // груз
      const hidden = p => o.step && p <= o.step;   // уже выгруженные точки
      const vis = lay.cells.filter(q => !hidden(q.p)), inC = vis.filter(q => q.ix < lay.n.x), outC = vis.filter(q => q.ix >= lay.n.x);
      const cell = lay.cell, geo = new T.BoxGeometry(cell.x * 0.93, cell.y * 0.93, cell.z * 0.93), m4 = new T.Matrix4(), col = new T.Color(), grey = new T.Color('#c9ccd1');
      const colorFor = p => { col.set(colorOf(p)); if (o.sel && o.sel !== p) col.lerp(grey, 0.78); return col; };
      const inst = (list, mat) => {
        if (!list.length) return null;
        const im = new T.InstancedMesh(geo, mat, list.length);
        list.forEach((q, i) => {
          m4.makeTranslation((q.ix + 0.5) * cell.x, (q.iy + 0.5) * cell.y, -W / 2 + (q.iz + 0.5) * cell.z);
          im.setMatrixAt(i, m4); im.setColorAt(i, colorFor(q.p));
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.userData.cells = list; g.add(im); meshes.push(im);
        return im;
      };
      inst(inC, lam('#ffffff'));
      inst(outC, lam('#ffffff', { transparent: true, opacity: 0.5, depthWrite: false }));
      if (outC.length) {
        const x0 = lay.n.x * cell.x, x1 = (Math.max(...outC.map(q => q.ix)) + 1) * cell.x;
        const ob = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(x1 - x0, H, W)), new T.LineBasicMaterial({ color: C.danger }));
        ob.position.set((x0 + x1) / 2, H / 2, 0); g.add(ob);
        if (o.labels) { const s = sprite('сверх кузова ' + (Math.round(lay.overM3 * 10) / 10).toString().replace('.', ',') + ' м³', { bg: C.danger, fg: '#ffffff', size: 0.34 * k }); s.position.set((x0 + x1) / 2 + 0.4, -0.45, 0); g.add(s); }   // под грузом за дверями — не закрывает номера точек
      }
      if (o.labels) {
        const sz = Math.min(0.62, Math.max(0.34, cell.y * 1.5)) * Math.max(0.7, k);
        lay.points.forEach(p => { if (hidden(p.n)) return; const s = sprite(String(p.n), { round: true, bg: colorOf(p.n), fg: light(colorOf(p.n)) ? '#1d1f20' : '#ffffff', size: sz }); s.position.set(p.x, p.top + sz * 0.55, 0); g.add(s); });
        const d = sprite(B.flat ? 'задний борт' : 'двери', { bg: C.ink, fg: '#ffffff', size: 0.3 * k }); d.position.set(L + 0.15, H + 0.3 * k, 0); g.add(d);
      }
      if (o.title) { const s = sprite(o.title, { bg: C.ink, fg: '#ffffff', size: 0.5 }); s.position.set(L / 2 - B.cab / 2, Math.max(H, B.cabH) + 0.75, 0); g.add(s); }
      g.userData.meshes = meshes;
      return g;
    }

    function clear() {
      if (root) {
        root.traverse(ob => {
          if (ob.geometry) ob.geometry.dispose();
          const ms = Array.isArray(ob.material) ? ob.material : ob.material ? [ob.material] : [];
          ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        });
        scene.remove(root);
      }
      if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.dispose(); ground = null; }
      root = null; pick = [];
    }

    function build(spec) {
      clear();
      root = new T.Group(); scene.add(root);
      const items = spec.items || [];
      let z = 0, prevW = 0, minY = -0.3;
      items.forEach((it, i) => {
        const lay = it.lay, W = lay.body.w;
        const g = truck(lay, spec.mode === 'all' ? { title: it.title } : { labels: true, step: spec.step, sel: spec.sel });
        if (i) z += prevW / 2 + 1.6 + W / 2;
        g.position.z = z; prevW = W; g.userData.idx = it.idx;
        root.add(g); pick.push(g);
        minY = Math.min(minY, -0.24 - lay.body.wheel * 1.45);
      });
      root.position.z = -z / 2;
      root.updateMatrixWorld(true);
      if (items.length) {
        const bb = new T.Box3().setFromObject(root), sz = bb.getSize(new T.Vector3()), c = bb.getCenter(new T.Vector3());
        const size = Math.ceil(Math.max(sz.x, sz.z) + 8);
        ground = new T.GridHelper(size, size, C.grid1, C.grid2);
        ground.position.set(c.x, minY, c.z); scene.add(ground);
      }
    }

    function fit(view) {
      if (!root) return;
      root.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(root), c = bb.getCenter(new T.Vector3()), r = Math.max(bb.getSize(new T.Vector3()).length() / 2, 0.8);
      const fov = camera.fov * Math.PI / 180, dist = r / Math.sin(fov / 2) / Math.min(1, Math.max(camera.aspect, 0.55)) * 0.92;
      const d = DIRS[view] || DIRS['3d'], dir = new T.Vector3(d[0], d[1], d[2]).normalize();
      camera.position.copy(c).addScaledVector(dir, dist);
      camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
      controls.target.copy(c); controls.update(); render();
    }

    // выбор мышью или пальцем: короткое нажатие без перетаскивания
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let down = null;
    const onDown = e => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
      down = null;
      const rc = cv.getBoundingClientRect();
      ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const meshes = pick.flatMap(g => g.userData.meshes);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (cur.mode === 'all') {
        if (!hit) return;
        let o = hit.object; while (o && o.userData.idx == null) o = o.parent;
        if (o && h.onPickTrip) h.onPickTrip(o.userData.idx);
      } else if (h.onPickPoint) {
        const q = hit && hit.object.isInstancedMesh && hit.instanceId != null ? hit.object.userData.cells[hit.instanceId] : null;
        h.onPickPoint(q ? q.p : null);
      }
    };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointerup', onUp);

    return {
      show(spec) {
        if (disposed) return;
        const content = spec.contentKey, framing = spec.fitKey;
        if (content !== cur.contentKey) build(spec);
        if (framing !== cur.fitKey) { resize(); fit(spec.view); }
        else if (content !== cur.contentKey) render();
        cur = spec;
      },
      resize,
      dispose() {
        if (disposed) return;
        disposed = true; clear();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointerup', onUp);
        controls.dispose(); renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); cv.remove();
      }
    };
  }

  window.LogiViz = { layout, bodyOf, colorOf, isLight: light, PALETTE, load, ready: () => !!T, createView };
})();
