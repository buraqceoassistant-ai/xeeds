/* PDF для ИИ-импорта манифестов. PDF.js (js/vendor/pdfjs) загружается только тогда, когда нужен:
   число страниц, текст страниц строками (у скана текста нет), base64 для ИИ и рисование страницы на холсте. */
(function () {
  'use strict';
  const base = () => new URL('js/vendor/pdfjs/', document.baseURI).href;
  let lib = null;
  function pdfjs() {
    if (!lib) lib = import(base() + 'pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = base() + 'pdf.worker.min.mjs'; return m; }).catch(e => { lib = null; throw e; });
    return lib;
  }
  async function open(buf) {
    const m = await pdfjs();
    try {
      return await m.getDocument({ data: new Uint8Array(buf.slice(0)), cMapUrl: base() + 'cmaps/', cMapPacked: true, standardFontDataUrl: base() + 'standard_fonts/', wasmUrl: base() + 'wasm/', iccUrl: base() + 'iccs/' }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('PDF защищён паролем — пришлите файл без пароля');
      throw new Error('Не удалось открыть PDF: ' + (e && e.message || e));
    }
  }
  // текст страниц строками: элементы с одной высотой строки — слева направо; координаты — для подсветки строки
  async function pageTexts(doc) {
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i), tc = await p.getTextContent(), vp = p.getViewport({ scale: 1 });
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 8 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      items.forEach(it => { const l = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, it.h * 0.45)); if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] }); });
      const L = lines.map(l => { l.items.sort((a, b) => a.x - b.x);
        return { text: l.items.map(x => x.s).join(' ').replace(/\s+/g, ' ').trim(), y: l.y, x1: Math.min(...l.items.map(x => x.x)), x2: Math.max(...l.items.map(x => x.x + x.w)), h: Math.max(...l.items.map(x => x.h)) }; });
      out.push({ page: i, width: vp.width, height: vp.height, text: L.map(l => l.text).join('\n'), lines: L });
    }
    return out;
  }
  function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  // страница на холст шириной width (CSS-пикселей); возвращает масштаб для подсветки строк
  async function render(doc, pageNo, canvas, width) {
    const p = await doc.getPage(pageNo), v1 = p.getViewport({ scale: 1 }), scale = width / v1.width, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = p.getViewport({ scale: scale * dpr });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height); canvas.style.width = width + 'px'; canvas.style.height = Math.round(vp.height / dpr) + 'px';
    await p.render({ canvas, viewport: vp }).promise;
    return { scale, height: v1.height };
  }
  window.LogiPdf = { open, pageTexts, b64, render };
})();
