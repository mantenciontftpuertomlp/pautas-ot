"use strict";
/* Motor de detección y dibujo de pautas (Ver. 1.25) */
/* ============ Extracción de texto ============ */
async function extractWords(page){
  const vp = page.getViewport({scale:1});
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items){
    if (!it.str || !it.str.trim()) continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform);
    const fh = Math.hypot(t[2], t[3]) || it.height || 6;
    const horiz = Math.abs(t[1]) < 0.01 && Math.abs(t[2]) < 0.01;
    if (!horiz) continue; // ignora marcas de agua rotadas
    items.push({ str: it.str, x0: t[4], x1: t[4] + it.width * vp.scale, base: t[5], fh });
  }
  items.sort((a,b)=>a.base-b.base);
  const lines = [];
  for (const it of items){
    const L = lines.find(l => Math.abs(l.base - it.base) < 1.6);
    if (L) L.items.push(it); else lines.push({base: it.base, items:[it]});
  }
  const words = [];
  for (const L of lines){
    L.items.sort((a,b)=>a.x0-b.x0);
    const merged = [];
    for (const it of L.items){
      const m = merged[merged.length-1];
      if (m && it.x0 - m.x1 < 0.9 && it.x0 - m.x1 > -2) { m.str += it.str; m.x1 = Math.max(m.x1, it.x1); m.fh=Math.max(m.fh,it.fh); }
      else merged.push({...it});
    }
    for (const m of merged){
      const n = m.str.length; if (!n) continue;
      const cw = (m.x1 - m.x0) / n; const re = /\S+/g; let mm;
      while ((mm = re.exec(m.str))) {
        words.push({ t: mm[0], x0: m.x0 + mm.index*cw, x1: m.x0 + (mm.index+mm[0].length)*cw,
                     y: m.base - m.fh*0.35, base: m.base, fh: m.fh });
      }
    }
  }
  const lineTexts = lines.map(L => L.items.map(i=>i.str.trim()).join(" "));
  return { words, w: vp.width, h: vp.height, lines: lineTexts };
}
const sameLine = (words, y, tol=3) => words.filter(w => Math.abs(w.y - y) < tol).sort((a,b)=>a.x0-b.x0);
const cx = w => (w.x0 + w.x1)/2;

const sinTilde = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
function subKey(t){
  if (/^S[ií]$/i.test(t)) return "SI";
  if (/^No$/i.test(t)) return "NO";
  if (/^N\/?A$/i.test(t)) return "NA";
  return sinTilde(t).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "X";
}
function subLabel(t){
  t = t.replace(/^Correci[oó]n$/i, "Corrección");
  if (/^S[ií]$/i.test(t)) return "Sí";
  if (/^N\/?A$/i.test(t)) return "N/A";
  if (/\d/.test(t)) return t.toUpperCase().replace(/[.,:]$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
// Encabezado formato 1/2: Sin defecto / Con defecto + segundo grupo (Subsecuente, Corrección…)
function headerSinCon(words, W){
  for (const na of words.filter(w => /^N\/?A$/i.test(w.t))){
    const line = sameLine(words, na.y, 4);
    const sin = line.find(w => /^Sin$/i.test(w.t) && w.x1 < na.x0), con = line.find(w => /^Con$/i.test(w.t) && w.x1 < na.x0);
    if (!sin || !con) continue;
    const defAfter = w => line.find(x => /^De[ft]ecto/i.test(x.t) && x.x0 > w.x0 && x.x0 - w.x1 < 8);
    const span = (a,b) => (a.x0 + (b ? b.x1 : a.x1))/2;
    const cdEnd = defAfter(con) || con;
    const cols = [
      {k:"SD", g:"estado", x: span(sin, defAfter(sin)), label:"Sin defecto"},
      {k:"CD", g:"estado", x: span(con, defAfter(con)), label:"Con defecto"}];
    const toks = line.filter(w => w.x0 > cdEnd.x1 + 1 && w.x0 <= na.x0 + 0.5).sort((a,b)=>a.x0-b.x0);
    const frases = [];
    // juntar solo palabras de un mismo título (la siguiente empieza en minúscula); "Si" y "No" van siempre separadas
    for (const w of toks){ const f = frases[frases.length-1]; if (f && w.x0 - f.x1 < 5 && /^[a-záéíóúñ(]/.test(w.t)){ f.t += " " + w.t; f.x1 = w.x1; } else frases.push({t:w.t, x0:w.x0, x1:w.x1}); }
    const usados = new Set(["SD","CD"]);
    for (const f of frases){ let k = subKey(f.t); while (usados.has(k)) k += "X"; usados.add(k); cols.push({k, g:"sub", x:(f.x0+f.x1)/2, label: subLabel(f.t)}); }
    if (cols.length < 3) continue;
    bordes(cols, W);
    const hy = na.y;
    const subs = cols.filter(c => c.g === "sub"), subMid = (subs[0].l + subs[subs.length-1].r)/2;
    const arriba = words.filter(w => w.y < hy - 3 && w.y > hy - 22);
    const tSub = arriba.filter(w => w.x0 < subMid + 30 && w.x1 > subMid - 30 && /^[A-Za-zÁÉÍÓÚáéíóúñ]{4,}$/.test(w.t)).sort((a,b)=>Math.abs(cx(a)-subMid)-Math.abs(cx(b)-subMid))[0];
    return { mode: "sincon", hy, cols, estados: [{k:"SD", label:"Sin defecto"}, {k:"CD", label:"Con defecto"}],
             subLabel: tSub ? subLabel(tSub.t) : "Subsecuente" };
  }
  return null;
}
// Encabezado formato 3: Status / Obs. / OK (tarea realizada ✓/X, observación ✓)
function headerOk(words, W){
  for (const ok of words.filter(w => /^OK$/.test(w.t))){
    const line = sameLine(words, ok.y, 4);
    const obs = line.find(w => /^Obs\.?$/i.test(w.t) && w.x1 < ok.x0);
    if (!obs || !line.some(w => /^[ÍI]tem$/i.test(w.t))) continue;
    const st = line.find(w => /^Status$/i.test(w.t) && w.x1 < obs.x0);
    const cs = [];
    if (st) cs.push({k:"ST", x: cx(st)});
    cs.push({k:"OBS", x: cx(obs)}, {k:"OK", x: cx(ok)});
    bordes(cs, W);
    const okc = cs.find(c => c.k === "OK"), obc = cs.find(c => c.k === "OBS");
    return { mode: "ok", hy: ok.y, cols: [], okc, obc,
             estados: [{k:"SD", label:"OK"}, {k:"CD", label:"Con obs."}, {k:"NR", label:"No realizada"}], subLabel: "" };
  }
  return null;
}
function bordes(cols, W){
  cols.forEach((c,i)=>{ const lb = i>0 ? (c.x+cols[i-1].x)/2 : null, rb = i<cols.length-1 ? (c.x+cols[i+1].x)/2 : null;
    c.l = lb ?? c.x - (rb - c.x); c.r = rb ?? Math.min(c.x + (c.x - lb), W - 32); c.w = c.r - c.l; });
}

function detectChecklist(words, W, H, lines, prev){
  lines = lines || [];
  let hdr = headerSinCon(words, W) || headerOk(words, W), geo = null, cont = false;
  if (!hdr && prev){
    // hoja que continúa la tabla de la hoja anterior sin repetir el encabezado
    const nums0 = words.filter(w => /^\d{1,3}$/.test(w.t) && Math.abs(w.x0 - prev.geo.numX0) < 12).sort((a,b)=>a.y-b.y);
    if (!nums0.length) return null;
    // solo es continuación si la numeración sigue (no vuelve a 1) y no hay otra sección antes
    const maxPrev = Math.max(...prev.rows.map(r => +r.item || 0));
    if (+nums0[0].t <= maxPrev - 3) return null;
    if (words.some(w => /^\d\.\d{1,2}$/.test(w.t) && w.x0 < W*0.12 && w.y < nums0[0].y)) return null;
    hdr = Object.assign({}, prev.hdr, { hy: Math.max(40, nums0[0].y - 40) });
    geo = prev.geo; cont = true;
  }
  if (!hdr) return null;
  const hy = hdr.hy;
  const stops = words.filter(w => w.y > hy+6 && (/^Nota:?$/i.test(w.t) || /^TOTAL$/i.test(w.t) || (/^\d\.\d$/.test(w.t) && w.x0 < W*0.12))).map(w => w.y - w.fh*0.6);
  const stopY = stops.length ? Math.min(...stops) : H - 40;
  const numX = geo ? geo.numX0 : null;
  const nums = words.filter(w => /^\d{1,3}$/.test(w.t) && w.y > hy+4 && w.y < stopY && (numX !== null ? Math.abs(w.x0 - numX) < 12 : w.x0 < W*0.13)).sort((a,b)=>a.y-b.y);
  if (!nums.length) return null;
  const bodyWords = words.filter(w => w.y > hy+2.5 && w.y < stopY);
  if (!geo){
    const cerca = w => Math.abs(w.y - hy) < 16;
    const desc = words.find(w => /^Descripci/i.test(w.t) && cerca(w) && w.x0 > W*0.2);
    const firstCol = hdr.mode === "ok" ? (hdr.cols[0] || hdr.obc) : hdr.cols[0];
    const stCol = hdr.mode === "ok" ? Math.min(hdr.obc.l, ...[hdr.okc.l]) : hdr.cols[0].l;
    // columna siguiente a la descripción (Límite Aceptable, Duración…)
    const der = desc ? words.filter(w => cerca(w) && w.x0 > desc.x1 + 4 && !/^Actividades$/i.test(w.t) && w.x0 < stCol).sort((a,b)=>a.x0-b.x0) : [];
    const descL = desc ? desc.x0 - 40 : W*0.35;
    let descR = der.length ? der[0].x0 - 2 : stCol - 30;
    let descLeft = descL;
    const cand = bodyWords.filter(w => w.x0 > W*0.25 && w.x1 < descR).map(w=>w.x0);
    if (cand.length){ const mode = {}; cand.forEach(x=>{ const k=Math.round(x); mode[k]=(mode[k]||0)+1; }); const best = +Object.entries(mode).sort((a,b)=>b[1]-a[1])[0][0]; if (Math.abs(best-descL) < 80) descLeft = best - 2; }
    // "Límite Aceptable"
    let lim = null;
    const limW = der.find(w => /^L[ií]mite$/i.test(w.t));
    if (limW){ const sig = der.find(w => w.x0 > limW.x1 + 40); lim = { L: limW.x0 - 30, R: sig ? sig.x0 - 2 : stCol - 2 }; descR = Math.min(descR, lim.L - 1); lim.L = descR + 1; }
    // techo del encabezado: la línea horizontal justo sobre la palabra "Ítem"
    let techo = hy - 24;
    const itW = words.find(w => /^[ÍI]tem$/i.test(w.t) && Math.abs(w.y - hy) < 16);
    if (itW && lines.length){ const cb = cellBounds(lines, cx(itW), itW.y); if (cb.top > -1e9 && cb.top > hy - 30) techo = Math.max(techo, cb.top); }
    const hdrW = words.filter(w => w.y > techo && w.y < hy + 2.5 && w.x1 < descLeft - 1 && w.x0 > nums[0].x1 + 1).sort((a,b)=>a.x0-b.x0);
    const grupos = [];
    for (const w of hdrW){ const gq = grupos[grupos.length-1]; if (gq && w.x0 <= gq.x1 + 8){ gq.x1 = Math.max(gq.x1, w.x1); gq.ws.push(w); } else grupos.push({x0:w.x0, x1:w.x1, ws:[w]}); }
    grupos.forEach(gq => gq.cx = (gq.x0 + gq.x1)/2);
    let gi = grupos.findIndex(gq => gq.ws.some(w => /^Componente/i.test(w.t)));
    if (gi < 0) gi = grupos.findIndex(gq => gq.ws.some(w => /^Equipo/i.test(w.t)));
    const colDe = j => ({ L: j > 0 ? (grupos[j-1].cx + grupos[j].cx)/2 : nums[0].x1 + 2, R: j < grupos.length-1 ? (grupos[j].cx + grupos[j+1].cx)/2 : descLeft - 1, cx: grupos[j].cx });
    const comp = gi >= 0 ? colDe(gi) : { L: nums[0].x1 + 2, R: descLeft - 1, cx: (nums[0].x1 + descLeft)/2 };
    const extras = grupos.map((gq, j) => ({ gq, j })).filter(({gq, j}) => j !== gi && !gq.ws.some(w => /^[ÍI]tem$/i.test(w.t))).map(({gq, j}) => {
      let titulo = gq.ws.slice().sort((a,b)=> Math.abs(a.y-b.y) > 2 ? a.y-b.y : a.x0-b.x0).map(w=>w.t).join(" ").replace(/\s*\/\s*$/, "");
      if (/^TAG\b/i.test(titulo)) titulo = "TAG";
      return Object.assign({ titulo }, colDe(j));
    });
    geo = { numX0: nums[0].x0, descLeft, descR, comp, extras, lim };
    // Si el PDF trae las líneas verticales de la tabla, las columnas salen exactas de ellas
    const V = (lines && lines.v) || [];
    const yr = nums[0].y;
    const xs = V.filter(v => v.y0 <= yr + 1 && v.y1 >= yr - 1).map(v => v.x).sort((a,b)=>a-b);
    const xu = []; xs.forEach(x => { if (!xu.length || x - xu[xu.length-1] > 2) xu.push(x); });
    if (xu.length >= 4){
      const colDeX = x => { const L = xu.filter(v => v <= x).pop(), R = xu.find(v => v > x); return (L !== undefined && R !== undefined) ? { L, R, cx: (L+R)/2 } : null; };
      const dW = words.find(w => /^Descripci/i.test(w.t) && Math.abs(w.y - hy) < 16 && w.x0 > W*0.2);
      const dc = dW ? colDeX(cx(dW)) : null;
      if (dc){
        geo.descLeft = dc.L + 0.5; geo.descR = dc.R - 0.5;
        const cW = hdrW.find(w => /^Componente/i.test(w.t)) || hdrW.find(w => /^Equipo/i.test(w.t));
        const cc = cW ? colDeX(cx(cW)) : null; if (cc && cc.R <= dc.L + 1) geo.comp = cc;
        geo.extras = extras.map(e => { const c = colDeX(e.cx); return c && c.R <= dc.L + 1 && !(cc && Math.abs(c.cx - cc.cx) < 1) ? Object.assign({ titulo: e.titulo }, c) : null; }).filter(Boolean);
        if (limW){ const lc = colDeX(cx(limW)); if (lc) geo.lim = { L: lc.L, R: lc.R }; }
      }
    }
  }
  const { descLeft, descR, comp, extras, lim } = geo;
  const centrado = w => cx(w);
  const vistos = {};
  const rows = nums.map((n,i) => {
    const top = i===0 ? hy + 6 : (nums[i-1].y + n.y)/2;
    const bottom = i===nums.length-1 ? Math.min(stopY, n.y + (n.y - top)) : (n.y + nums[i+1].y)/2;
    vistos[n.t] = (vistos[n.t] || 0) + 1;
    return { item: n.t, key: vistos[n.t] > 1 ? n.t + "_" + vistos[n.t] : n.t, y: n.y, top, bottom, numX1: n.x1 };
  });
  const celda = (x, r, max) => { if (!lines.length) return null; const cb = cellBounds(lines, x, r.y); return (cb.top > -1e9 && cb.bot < 1e9 && cb.bot - cb.top < max) ? cb : null; };
  for (const r of rows){ const b = celda((descLeft + descR)/2, r, 220); if (b){ r.top = b.top; r.bottom = b.bot; r.byLines = true; } }
  const ordenar = ws => ws.sort((a,b)=> Math.abs(a.y-b.y) > 2 ? a.y-b.y : a.x0-b.x0).map(w=>w.t).join(" ");
  const textoCelda = (r, col, max) => { const cb = celda(col.cx, r, max) || { top: r.top, bot: r.bottom };
    return ordenar(bodyWords.filter(w => w.y > cb.top && w.y < cb.bot && cx(w) > col.L && cx(w) < col.R)).replace(/\s*\/\s*/g, " / ").replace(/- (?=[a-záéíóúñ])/g, "-").trim(); };
  for (const r of rows){
    const enDesc = bodyWords.filter(w => w.y >= r.top && w.y < r.bottom && cx(w) > descLeft && cx(w) < descR);
    const esLinea = w => /^_{3,}$/.test(w.t);
    r.desc = ordenar(enDesc.filter(w => !esLinea(w))).replace(/\s+:/g, ":");
    // líneas en blanco "______" para anotar un valor (temperatura, corriente…)
    const unidad = (/temperatur/i.test(r.desc) ? "°C" : /corriente|amper/i.test(r.desc) ? "A" : /tensi[oó]n|voltaj/i.test(r.desc) ? "V" : /vibraci/i.test(r.desc) ? "mm/s" : /aislaci|resistenc/i.test(r.desc) ? "MΩ" : /presi[oó]n/i.test(r.desc) ? "bar" : "");
    enDesc.filter(esLinea).sort((a,b)=> Math.abs(a.y-b.y) > 2 ? a.y-b.y : a.x0-b.x0).forEach((ln, i) => {
      const izq = enDesc.filter(w => !esLinea(w) && Math.abs(w.y - ln.y) < 2 && w.x1 <= ln.x0 + 1).sort((a,b)=>a.x0-b.x0);
      const label = izq.map(w=>w.t).join(" ").replace(/:$/, "").trim() || ("Valor " + (i+1));
      (r.medidas = r.medidas || []).push({ id: i, label: label.charAt(0).toUpperCase() + label.slice(1), x0: ln.x0, x1: ln.x1, y: ln.y, unidad });
    });
    r.comp = textoCelda(r, comp, 500);
    for (const e of extras){ const v = textoCelda(r, e, 600); if (v) (r.extra = r.extra || []).push({ t: e.titulo, v }); }
    if (lim){ const v = ordenar(bodyWords.filter(w => w.y >= r.top && w.y < r.bottom && cx(w) > lim.L && cx(w) < lim.R)); if (v) r.limite = v; }
  }
  rows.forEach((r,i) => { if (!r.comp){ let best=null, d=1e9; rows.forEach((o,j)=>{ if (o.comp && j!==i && !o._inh){ const dd=Math.abs(o.y-r.y); if(dd<d){d=dd;best=o;} } }); if (best && d < 45){ r.comp = best.comp; r._inh = true; } } });
  return Object.assign({}, hdr, { rows, headerY: hy, top: cont ? 0 : hy - 9, bottom: stopY, hdr, geo });
}

/* Celda "Intervención": Correctiva □ / Preventiva X (lo elige la persona) */
function detectInterv(words, W){
  const out = [];
  for (const hd of words.filter(w => /Intervenci[oó]n:?$/i.test(w.t) && w.t.length < 16)){
    const L = hd.x0 - 14, R = Math.min(W, hd.x1 + 14);
    const col = words.filter(w => w.y > hd.y + 4 && cx(w) > L && cx(w) < R).sort((a,b)=> Math.abs(a.y-b.y) > 2 ? a.y-b.y : a.x0-b.x0);
    // reconstruir el texto de la columna para encontrar "Correctiva" y "Preventiva" aunque vengan cortadas
    let txt = "", idx = [];
    col.forEach((w,i) => { idx.push(txt.length); txt += w.t + " "; });
    const tokenEn = pos => { let k = 0; for (let i=0;i<idx.length;i++) if (idx[i] <= pos) k = i; return k; };
    const buscar = re => { const r = []; let m; const g = new RegExp(re.source, "gi"); while ((m = g.exec(txt))) r.push({ ini: tokenEn(m.index), fin: tokenEn(m.index + m[0].length - 1) }); return r; };
    const cor = buscar(/Correc\s*t\s*i\s*v\s*a/), pre = buscar(/Preven\s*t\s*i\s*v\s*a/);
    for (let i=0;i<Math.min(cor.length, pre.length);i++){
      const op = (m, k, label) => {
        const last = col[m.fin], mk = col[m.fin + 1];
        const esMarca = mk && Math.abs(mk.y - last.y) < 2 && mk.t.length <= 2 && !/[a-z]{2}/i.test(mk.t);
        const x = esMarca ? cx(mk) : last.x1 + 5, y = last.y;
        return { k, label, x, y, w: esMarca ? Math.max(6, mk.x1 - mk.x0 + 2) : 6, h: 7 };
      };
      out.push({ key: "i" + Math.round(col[cor[i].ini].y), opts: [op(cor[i], "COR", "Correctiva"), op(pre[i], "PRE", "Preventiva")] });
    }
  }
  return out.length ? out : null;
}

/* Columna "Aplica (✓/X)" de las actividades previas y de cierre */
function detectAplica(words, lines, W){
  const out = [];
  for (const ap of words.filter(w => /^Aplica$/i.test(w.t))){
    const line = sameLine(words, ap.y, 3);
    const marca = line.find(w => w.x0 > ap.x1 && w.x0 - ap.x1 < 6 && /✓|X/.test(w.t));
    const x0 = ap.x0, x1 = marca ? marca.x1 : ap.x1;
    const V = (lines && lines.v) || [];
    const vx = V.filter(v => ap.y > v.y0 - 2 && v.y1 > ap.y + 20).map(v => v.x).sort((a,b)=>a-b);
    const L = vx.filter(x => x <= x0 + 1).pop() ?? x0 - 4, R = vx.find(x => x >= x1 - 1) ?? x1 + 4;
    const sec = words.filter(w => /^\d\.\d$/.test(w.t) && w.x0 < W*0.12 && w.y < ap.y && w.y > ap.y - 40).sort((a,b)=>b.y-a.y)[0];
    const titLinea = sec ? sameLine(words, sec.y, 2).map(w=>w.t).join(" ") : "";
    const grupo = /previas/i.test(titLinea) ? "Actividades previas" : /cierre/i.test(titLinea) ? "Actividades de cierre" : (titLinea.replace(/^\d\.\d\s*/, "").replace(/:$/, "") || "Actividades");
    const fin = words.filter(w => w.y > ap.y + 6 && /^\d\.\d$/.test(w.t) && w.x0 < W*0.12).map(w=>w.y).sort((a,b)=>a-b)[0] ?? ap.y + 260;
    const items = words.filter(w => /^\d{1,2}\.-/.test(w.t) && w.y > ap.y + 3 && w.y < fin && w.x1 < x0).sort((a,b)=>a.y-b.y);
    if (!items.length) continue;
    const x0i = items[0].x0;
    items.filter(n => Math.abs(n.x0 - x0i) < 14).forEach((n, i) => {
      const label = sameLine(words, n.y, 2).filter(w => w.x0 >= n.x0 && w.x1 < L - 1).map(w=>w.t).join(" ").replace(/^\d{1,2}\.-\s*/, "").trim();
      const cb = cellBounds(lines || [], (L+R)/2, n.y + 2);
      const top = cb.top > -1e9 ? cb.top : n.y - 6, bot = cb.bot < 1e9 && cb.bot - top < 60 ? cb.bot : n.y + 8;
      out.push({ key: "a" + Math.round(ap.y) + "_" + i, label: label || ("Actividad " + (i+1)), x: (L+R)/2, y: (top+bot)/2, w: R - L, h: bot - top, grupo });
    });
  }
  return out;
}

/* Casillas sueltas: una celda vacía angosta justo a la derecha de un texto (Área / Equipos inspeccionados) */
function detectBoxes(words, lines, W, excl){
  const V = (lines && lines.v) || [];
  if (!V.length) return null;
  const vAt = y => V.filter(v => y > v.y0 + 0.5 && y < v.y1 - 0.5).map(v => v.x).sort((a,b)=>a-b);
  const usados = new Set(), out = [];
  // agrupar palabras en etiquetas (misma línea, separadas por menos de 6 pt)
  const ordenadas = words.slice().sort((a,b)=> Math.abs(a.y-b.y) > 2 ? a.y-b.y : a.x0-b.x0);
  const etiquetas = [];
  for (const w of ordenadas){ const e = etiquetas[etiquetas.length-1]; if (e && Math.abs(e.y - w.y) < 2 && w.x0 - e.x1 < 6){ e.t += " " + w.t; e.x1 = w.x1; } else etiquetas.push({t:w.t, x0:w.x0, x1:w.x1, y:w.y}); }
  for (const e of etiquetas){
    if (excl.some(z => e.y > z.top && e.y < z.bottom)) continue;
    if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]{3,}/.test(e.t)) continue;
    const xs = vAt(e.y);
    const r1 = xs.find(x => x >= e.x1 - 0.5); if (r1 === undefined) continue;
    const r2 = xs.find(x => x > r1 + 2); if (r2 === undefined) continue;
    const w = r2 - r1; if (w < 7 || w > 32) continue;
    const l1 = xs.filter(x => x <= e.x0 + 0.5).pop(); if (l1 === undefined || r1 - l1 < w * 1.5) continue;
    if (words.some(o => Math.abs(o.y - e.y) < 4 && cx(o) > r1 && cx(o) < r2)) continue;
    const cb = cellBounds(lines, (r1+r2)/2, e.y);
    if (!(cb.top > -1e9 && cb.bot < 1e9) || cb.bot - cb.top > 20) continue;
    const key = Math.round(r1) + ":" + Math.round(cb.top);
    if (usados.has(key)){ const prev = out.find(b => b._k === key); if (prev && !prev.label.includes(e.t)) prev.label += " " + e.t; continue; }
    usados.add(key);
    out.push({ key: "b" + out.length, _k: key, label: e.t, x: (r1+r2)/2, y: (cb.top+cb.bot)/2, w, h: cb.bot - cb.top });
  }
  // título de cada grupo: una fila con una sola etiqueta y sin casillas (p. ej. "Osmosis Inversa")
  if (out.length >= 2){
    const y0 = Math.min(...out.map(b=>b.y)) - 30, y1 = Math.max(...out.map(b=>b.y));
    const gx0 = Math.min(...out.map(b=>b.x)) - 160, gx1 = Math.max(...out.map(b=>b.x)) + 20;
    const enGrilla = o => o.x0 > gx0 && o.x1 < gx1;
    const secs = etiquetas.filter(e => e.y > y0 && e.y < y1 && enGrilla(e) && !out.some(b => Math.abs(b.y - e.y) < 3)
      && etiquetas.filter(o => Math.abs(o.y - e.y) < 2 && enGrilla(o)).length === 1)
      .map(e => ({ t: e.t.replace(/:$/, "").replace(/\(s\)/, "s"), y: e.y })).sort((a,b)=>a.y-b.y);
    out.forEach(b => { const sc = secs.filter(x => x.y < b.y).pop(); b.grupo = sc ? sc.t : ""; });
    return { rows: out };
  }
  return null;
}

function detectEPP(words, W){
  const sels = words.filter(w => /^Seleccione$/i.test(w.t) || (/^Estado$/i.test(w.t) && sameLine(words, w.y, 3).some(o => /^EPP$/i.test(o.t)))).sort((a,b)=>a.x0-b.x0);
  if (!sels.length) return null;
  const hy = sels[0].y;
  let nums = words.filter(w => /^\d{1,2}\./.test(w.t) && !/^\d+\.\d/.test(w.t) && w.y > hy+2 && w.y < hy+120).sort((a,b)=>a.y-b.y || a.x0-b.x0);
  const keep = []; let lastY = hy;
  for (const n of nums){ if (n.y - lastY > 16) break; keep.push(n); lastY = Math.max(lastY, n.y); }
  if (!keep.length) return null;
  const ys = [...new Set(keep.map(n=>Math.round(n.y*2)/2))].sort((a,b)=>a-b);
  const rowH = ys.length > 1 ? (ys[ys.length-1]-ys[0])/(ys.length-1) : 7;
  const rows = [];
  for (const n of keep){
    const sel = sels.find(s => s.x0 > n.x1 + 20);
    if (!sel) continue;
    const nextNum = keep.filter(o => o !== n && Math.abs(o.y - n.y) < 2.5 && o.x0 > n.x0).sort((a,b)=>a.x0-b.x0)[0];
    const lim = Math.min(sel.x0 - 2, nextNum ? nextNum.x0 - 1 : 1e9);
    const label = sameLine(words, n.y, 2.2).filter(w => w.x0 >= n.x0 && w.x1 <= lim).map(w=>w.t).join(" ").replace(/^\d{1,2}\.\s*/, "").replace(/\?$/, "");
    const key = n.t.match(/^\d+/)[0];
    const cxs = cx(sel);
    let lab = label.replace(/\?/g,"").trim();
    if (!lab){ lab = words.filter(w => Math.abs(w.y - n.y) < 10 && w !== n && w.x0 > n.x1 - 1 && w.x1 < lim).sort((a,b)=>a.y-b.y || a.x0-b.x0).map(w=>w.t).join(" ").replace(/\?/g,"").trim(); }
    // ancho de la columna: hasta el siguiente "N°" o el margen
    rows.push({ key, label: lab, x: cxs, y: n.y, w: Math.max(sel.x1-sel.x0+8, 26), h: rowH });
  }
  rows.sort((a,b)=>(+a.key)-(+b.key));
  return rows.length ? { rows } : null;
}

function detectObsTarea(words, W, lines){
  const ta = words.find(w => /^Tarea$/i.test(w.t) && sameLine(words, w.y, 2).some(o => /^observaci[oó]n$/i.test(o.t)));
  if (!ta || !lines || !lines.length) return null;
  const nro = sameLine(words, ta.y, 2).find(o => /^N[°º]/.test(o.t) && o.x1 <= ta.x0 + 1);
  const V = lines.v || [];
  const vx = V.filter(v => ta.y > v.y0 - 2 && v.y1 > ta.y + 20).map(v=>v.x).sort((a,b)=>a-b);
  const itemR = vx.find(x => x > ta.x1 - 2) ?? ta.x1 + 3;
  const itemL = (nro ? nro.x0 : ta.x0) - 3;
  const fin = words.filter(w => w.y > ta.y + 10 && /^\d\.$/.test(w.t) && w.x0 < W*0.12).map(w=>w.y).sort((a,b)=>a-b)[0] ?? 760;
  const xm = (itemR + W - 34)/2;
  const ys = lines.filter(l => xm >= l.x0 - 0.5 && xm <= l.x1 + 0.5 && l.y > ta.y - 8 && l.y < fin - 4).map(l => l.y).sort((a,b)=>a-b);
  const u = []; ys.forEach(y => { if (!u.length || y - u[u.length-1] > 2) u.push(y); });
  const filas = []; for (let i=0;i<u.length-1;i++) if (u[i+1] - u[i] > 5 && u[i] > ta.y) filas.push({ top: u[i], bot: u[i+1] });
  if (filas.length < 2) return null;
  return { top: filas[0].top, bottom: filas[filas.length-1].bot, n: filas.length, rowH: filas[0].bot - filas[0].top, filas, flujo: true,
           itemL, itemR: itemR, textL: itemR + 1, textR: W - 34 };
}
function detectObs(words, W, lines){
  const alt = detectObsTarea(words, W, lines); if (alt) return alt;
  const ob = words.find(w => /^Observaci[oó]n\(es\)/i.test(w.t)) || words.find(w => /^Observaci[oó]n/i.test(w.t) && sameLine(words, w.y, 2).some(x => /^Indicar$/i.test(x.t) && x.x0 < w.x0));
  if (!ob) return null;
  const next = words.filter(w => w.y > ob.y + 10 && /^\d\.\d+$/.test(w.t) && w.x0 < W*0.15).sort((a,b)=>a.y-b.y)[0];
  const ind = sameLine(words, ob.y, 2).find(w => /^Indicar$/i.test(w.t) && w.x0 < ob.x0);
  const top = ob.base + ob.fh*0.3 + 1;
  const bottom = next ? next.y - next.fh*0.5 - 5 : top + 95;
  const n = Math.max(1, Math.min(10, Math.round((bottom-top)/19)));
  const left = ind ? ind.x0 - 8 : ob.x0 - 46;
  const res = { top, bottom, n, rowH: (bottom-top)/n, itemL: left, itemR: ob.x0 - 3, textL: ob.x0, textR: W - 34 };
  if (lines && lines.length){
    const xm = (res.textL + res.textR)/2;
    const ys = lines.filter(l => xm >= l.x0 - 0.5 && xm <= l.x1 + 0.5 && l.y > top - 4 && l.y < bottom + 10).map(l => l.y).sort((a,b)=>a-b);
    const u = []; ys.forEach(y => { if (!u.length || y - u[u.length-1] > 2) u.push(y); });
    const filas = [];
    for (let i=0;i<u.length-1;i++) if (u[i+1] - u[i] > 8) filas.push({ top: u[i], bot: u[i+1] });
    if (filas.length >= 1 && filas.length <= 80){ res.filas = filas; res.n = filas.length; res.top = filas[0].top; res.bottom = filas[filas.length-1].bot; }
  }
  return res;
}

function detectResp(words, W){
  for (const c of words.filter(w => /^Cargo$/i.test(w.t))){
    const line = sameLine(words, c.y, 3);
    const nom = line.find(w => /^Nombre$/i.test(w.t)), fir = line.find(w => /^Firma$/i.test(w.t) && w.x0 > c.x0);
    if (!nom || !fir) continue;
    const nums = words.filter(w => /^\d{1,2}\.?$/.test(w.t) && w.x0 < W*0.13 && w.y > c.y + 3 && w.y < c.y + 200).sort((a,b)=>a.y-b.y);
    const rows = []; let last = c.y;
    for (const n of nums){ if (rows.length && Math.abs(n.x0 - rows[0].x0) > 4) continue; if (n.y - last > 22) break; if (rows.length > 1 && n.y - last > (last - rows[0].y)/(rows.length-1) * 1.6) break; rows.push(n); last = n.y; }
    if (!rows.length) continue;
    const rowH = rows.length>1 ? (rows[rows.length-1].y-rows[0].y)/(rows.length-1) : 12;
    const cN = cx(nom), cC = cx(c), cF = cx(fir);
    const b1 = (cN+cC)/2, b2 = (cC+cF)/2;
    const left = Math.max(...rows.map(r=>r.x1)) + 5, right = Math.min(cF + (cF-b2), W - 32);
    return { rows: rows.map(r=>({ y:r.y, item:r.t.replace(/\.$/, "") })), rowH,
             nombre:{l:left, r:b1}, cargo:{l:b1, r:b2}, firma:{l:b2, r:right} };
  }
  return null;
}

function detectOtBox(words){
  const ot = words.find((w,i) => /^OT:?$/i.test(w.t) && sameLine(words, w.y, 2).some(x => /^Indicar$/i.test(x.t) && x.x0 < w.x0));
  return ot ? { x: ot.x1 + 6, base: ot.base, fh: ot.fh } : null;
}

/* ============ Dibujo sobre la página ============ */
/* visto y X estilo bolígrafo, orgánicos (Ver. 1.28, prueba al máximo).
   Cada marca se sortea con una semilla fija (OT + posición): reenviar la pauta da la misma imagen.
   La intensidad se regula en Ajustes (perfil.estilo); al enviar una OT queda fija en S.estilo. */
let ORGANICO = { pos: 0.22, rot: 18, tam: 0.25, trazo: 1.1 };
/* estilo en escala 0–100 (Ajustes) → valores de dibujo */
function fijarEstilo(e){ e = e || {pos:100,rot:100,tam:100,trazo:100}; ORGANICO = { pos: 0.22*e.pos/100, rot: 18*e.rot/100, tam: 0.25*e.tam/100, trazo: 1.1*e.trazo/100 }; }
let OT_SEMILLA = "";
function semilla(str){ let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; }
function azar(seed){ let x = seed % 2147483647 || 1; return () => { x = (x * 16807) % 2147483647; return x / 2147483647 * 2 - 1; }; }
function _q(p0, c, p1, t){ const u = 1-t; return [u*u*p0[0]+2*u*t*c[0]+t*t*p1[0], u*u*p0[1]+2*u*t*c[1]+t*t*p1[1]]; }
function _ctl(P, Q, b){ const mx=(P[0]+Q[0])/2, my=(P[1]+Q[1])/2, dx=Q[0]-P[0], dy=Q[1]-P[1], l=Math.hypot(dx,dy)||1; return [mx-dy/l*b, my+dx/l*b]; }
/* trazo relleno a lo largo de puntos [x,y,t] con ancho W·perfil(t) */
function _trazo(pts, W, prof){
  const L=[], R=[];
  for (let i=0;i<pts.length;i++){ const p=pts[i], a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)];
    const dx=b[0]-a[0], dy=b[1]-a[1], l=Math.hypot(dx,dy)||1, w=W*prof(p[2])/2;
    L.push([p[0]-dy/l*w, p[1]+dx/l*w]); R.push([p[0]+dy/l*w, p[1]-dx/l*w]); }
  const all = L.concat(R.reverse()); const P = new Path2D();
  P.moveTo(all[0][0], all[0][1]); for (let i=1;i<all.length;i++) P.lineTo(all[i][0], all[i][1]); P.closePath(); return P;
}
function _visto(r, v){
  const A=[-10+r()*2.2*v, -0.5+r()*2.2*v], B=[-3+r()*1.3*v, 8+r()*1.3*v], C=[11+r()*2.5*v, -9+r()*3*v];
  const c1=_ctl(A,B,0.8+r()*1.8*v), c2=_ctl(B,C,-1.2+r()*2.6*v), W=2.6*(1+r()*0.3*v), pts=[];
  for (let i=0;i<=10;i++){ const q=_q(A,c1,B,i/10); pts.push([q[0],q[1],i/10*0.35]); }
  for (let i=1;i<=18;i++){ const q=_q(B,c2,C,i/18); pts.push([q[0],q[1],0.35+i/18*0.65]); }
  return _trazo(pts, W, t => t<0.35 ? 0.3+0.7*(t/0.35) : Math.max(0.06, 1-(t-0.35)/0.65*0.95));
}
function _equis(r, v){
  const P = new Path2D(), W = 2.3*(1+r()*0.3*v);
  const linea = (A, B, b) => { const c=_ctl(A,B,b), pts=[]; for (let i=0;i<=16;i++){ const q=_q(A,c,B,i/16); pts.push([q[0],q[1],i/16]); }
    return _trazo(pts, W, t => 0.25 + 0.75*Math.sin(Math.PI*Math.min(1, t*1.15)) ); };
  P.addPath(linea([-8+r()*2*v,-7.5+r()*2*v], [8+r()*2*v,7.5+r()*2*v], r()*2*v));
  P.addPath(linea([8+r()*2*v,-8+r()*2*v], [-7.5+r()*2*v,8+r()*2*v], r()*2*v));
  return P;
}
function _marca(ctx, x, y, size, color, tipo){
  const r = azar(semilla(OT_SEMILLA + "|" + tipo + "|" + Math.round(x/size*8) + "|" + Math.round(y/size*8)));
  const o = ORGANICO, dx = r()*o.pos*size, dy = r()*o.pos*size, rot = r()*o.rot*Math.PI/180, k = (tipo === "v" ? 1.0/21 : 0.8/16) * size * (1 + r()*o.tam);
  const path = tipo === "v" ? _visto(r, o.trazo) : _equis(r, o.trazo);
  ctx.save(); ctx.fillStyle = ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.lineJoin = "round";
  ctx.translate(x + dx, y + dy); ctx.rotate(rot); ctx.scale(k, k); ctx.fill(path); ctx.stroke(path); ctx.restore();
}
function drawCheck(ctx, x, y, size, color){ _marca(ctx, x, y, size, color, "v"); }
function drawX(ctx, x, y, size, color){ _marca(ctx, x, y, size, color, "x"); }
/* firma teñida del color de tinta (las firmas antiguas se guardaron en otro tono) */
function inkImg(im){
  if (im._ink) return im._ink;
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = COLOR.ink; g.fillRect(0, 0, c.width, c.height);
  im._ink = c; return c;
}
function wrap(ctx, text, maxW){
  const words = String(text).split(/\s+/).filter(Boolean), lines=[]; let cur="";
  for (const w of words){ const t = cur ? cur+" "+w : w; if (ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur=w; } else cur=t; }
  if (cur) lines.push(cur); return lines;
}
function fitText(ctx, text, x, y, maxW, s, sizePt, color, align="left", bold=false){
  let size = sizePt;
  ctx.font = `${bold?"700 ":""}${size*s}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(text).width > maxW*s && size > 4.5){ size -= 0.3; ctx.font = `${bold?"700 ":""}${size*s}px Arial, Helvetica, sans-serif`; }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(text, x*s, y*s);
}

function drawAnnotations(ctx, P, s, guides){
  OT_SEMILLA = String(S.ot || S.file || "");
  fijarEstilo(S.estilo || (typeof perfil !== "undefined" && perfil.estilo));
  ctx.save();
  if (P.otBox && S.ot) fitText(ctx, S.ot, P.otBox.x, P.otBox.base - P.otBox.fh*0.35, 90, s, 8, COLOR.white, "left", true);

  if (P.checklist){
    const cl = P.checklist;
    for (const r of cl.rows){
      const key = P.n+"-"+(r.key||r.item), c = S.checks[key] || {};
      const h = Math.min(r.bottom - r.top, 40);
      if (cl.mode === "ok"){
        const sz = Math.min(12, h*0.7);
        if (guides) [cl.okc, cl.obc].forEach(col => { ctx.setLineDash([3,3]); ctx.strokeStyle="rgba(15,94,168,.35)"; ctx.lineWidth=1; ctx.strokeRect((col.l+1.5)*s, (r.y-h/2+1.5)*s, (col.w-3)*s, (h-3)*s); ctx.setLineDash([]); });
        if (c.estado === "SD" || c.estado === "CD") drawCheck(ctx, cl.okc.x*s, r.y*s, sz*s, COLOR.blue);
        if (c.estado === "CD") drawCheck(ctx, cl.obc.x*s, r.y*s, sz*s, COLOR.red);
        if (c.estado === "NR") drawX(ctx, cl.okc.x*s, r.y*s, sz*s, COLOR.red);
        continue;
      }
      if (r.medidas) r.medidas.forEach(m => { const v = S.medidas && S.medidas[key + "#" + m.id];
        if (v) fitText(ctx, v + (m.unidad && !/[a-z°Ω]/i.test(v) ? " " + m.unidad : ""), m.x0 + 1, m.y - 1.6, m.x1 - m.x0 + 12, s, 6.4, COLOR.blue, "left", true);
        else if (guides){ ctx.setLineDash([2,2]); ctx.strokeStyle="rgba(15,94,168,.45)"; ctx.lineWidth=1; ctx.strokeRect(m.x0*s, (m.y-5)*s, (m.x1-m.x0)*s, 8*s); ctx.setLineDash([]); } });
      for (const col of cl.cols){
        if (guides){ ctx.setLineDash([3,3]); ctx.strokeStyle="rgba(15,94,168,.35)"; ctx.lineWidth=1; ctx.strokeRect((col.l+1.5)*s, (r.y-h/2+1.5)*s, (col.w-3)*s, (h-3)*s); ctx.setLineDash([]); }
        if (c[col.g] === col.k) drawCheck(ctx, col.x*s, r.y*s, Math.min(12, h*0.7)*s, (col.k==="CD" || (col.g==="sub" && col.k!=="NO" && col.k!=="NA")) ? COLOR.red : COLOR.blue);
      }
    }
  }
  if (P.epp){
    for (const r of P.epp.rows){
      const key = P.n+"-"+r.key;
      if (guides){ ctx.setLineDash([2,2]); ctx.strokeStyle="rgba(15,94,168,.35)"; ctx.lineWidth=1; ctx.strokeRect((r.x-r.w/2)*s, (r.y-r.h/2)*s, r.w*s, r.h*s); ctx.setLineDash([]); }
      if (S.epp[key]) drawCheck(ctx, r.x*s, r.y*s, 8*s, COLOR.blue);
    }
  }
  if (P.interv){
    for (const it of P.interv){
      const sel = S.interv && S.interv[P.n+"-"+it.key];
      for (const o of it.opts){
        const bx = 5.6;
        ctx.fillStyle = "#ffffff"; ctx.fillRect((o.x - o.w/2 - 0.5)*s, (o.y - 4.2)*s, (o.w + 1)*s, 8.4*s);
        ctx.strokeStyle = guides ? "rgba(15,94,168,.8)" : "#4A5868"; ctx.lineWidth = Math.max(1, 0.7*s);
        ctx.strokeRect((o.x - bx/2)*s, (o.y - bx/2)*s, bx*s, bx*s);
        if (sel === o.k) drawCheck(ctx, o.x*s, (o.y - 0.5)*s, 9*s, COLOR.blue);
      }
    }
  }
  if (P.boxes){
    for (const r of P.boxes.rows){
      const key = P.n+"-"+r.key;
      if (guides){ ctx.setLineDash([2,2]); ctx.strokeStyle="rgba(15,94,168,.45)"; ctx.lineWidth=1; ctx.strokeRect((r.x-r.w/2+1)*s, (r.y-r.h/2+1)*s, (r.w-2)*s, (r.h-2)*s); ctx.setLineDash([]); }
      if (S.boxes && S.boxes[key]) drawCheck(ctx, r.x*s, r.y*s, Math.min(12, r.h*1.15, r.w*0.75)*s, COLOR.blue);
    }
  }
  if (P.obs && P.obs.flujo){
    // muchas filas angostas: cada observación ocupa las filas que necesite
    const o = P.obs, ents = obsEntries(); let fi = 0;
    ctx.font = `${7*s}px Arial, Helvetica, sans-serif`;
    for (const e of ents){
      if (fi >= o.filas.length) break;
      const lns = wrap(ctx, e.text || "", (o.textR - o.textL - 6)*s);
      lns.forEach((l, j) => { if (fi >= o.filas.length) return; const f = o.filas[fi++], yc = (f.top + f.bot)/2;
        if (j === 0 && e.item) fitText(ctx, String(e.item), (o.itemL+o.itemR)/2, yc, o.itemR-o.itemL-2, s, 7, COLOR.blue, "center", true);
        ctx.font = `${7*s}px Arial, Helvetica, sans-serif`; ctx.fillStyle = COLOR.blue; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(l, (o.textL+3)*s, yc*s); });
    }
  }
  else if (P.obs){
    const o = P.obs, ents = obsEntries();
    const rowsOut = ents.slice(0, o.n);
    if (ents.length > o.n){ const rest = ents.slice(o.n-1); rowsOut[o.n-1] = { item: rest.map(e=>e.item).filter(Boolean).join(", "), text: rest.map(e => (e.item?`[${e.item}] `:"") + e.text).join(" · ") }; }
    rowsOut.forEach((e,i) => {
      const yc = o.filas ? (o.filas[i].top + o.filas[i].bot)/2 : o.top + o.rowH*(i+0.5);
      const rh = o.filas ? o.filas[i].bot - o.filas[i].top : o.rowH;
      if (e.item) fitText(ctx, String(e.item), (o.itemL+o.itemR)/2, yc, o.itemR-o.itemL-4, s, 8, COLOR.blue, "center", true);
      if (e.text){
        let size = 7.5, lines;
        for (;;){ ctx.font = `${size*s}px Arial, Helvetica, sans-serif`; lines = wrap(ctx, e.text, (o.textR-o.textL-6)*s); const maxL = Math.floor((rh-1)/(size*1.15)); if (lines.length <= maxL || size <= 4.5){ lines = lines.slice(0, Math.max(1,maxL)); break; } size -= 0.4; }
        const lh = size*1.15, y0 = yc - (lines.length-1)*lh/2;
        ctx.fillStyle = COLOR.blue; ctx.textAlign="left"; ctx.textBaseline="middle";
        lines.forEach((l,j) => ctx.fillText(l, (o.textL+3)*s, (y0+j*lh)*s));
      }
    });
  }
  if (P.resp){
    const R = P.resp;
    S.resp.slice(0, R.rows.length).forEach((p,i) => {
      const y = R.rows[i].y;
      if (p.nombre) fitText(ctx, p.nombre, (R.nombre.l+R.nombre.r)/2, y, R.nombre.r-R.nombre.l-6, s, 7.5, COLOR.blue, "center");
      if (p.cargo) fitText(ctx, p.cargo, (R.cargo.l+R.cargo.r)/2, y, R.cargo.r-R.cargo.l-6, s, 7.5, COLOR.blue, "center");
      if (p.sig){ const im = getImg(p.sig); if (im.complete && im.naturalWidth){
        // grande, como en papel: sobresale 40 % arriba y 40 % abajo de la casilla, centrada y algo inclinada
        const maxH = R.rowH*1.8, maxW = (R.firma.r-R.firma.l)*1.6; let h = maxH, w = h*im.naturalWidth/im.naturalHeight; if (w > maxW){ w = maxW; h = w*im.naturalHeight/im.naturalWidth; }
        ctx.save(); ctx.translate(((R.firma.l+R.firma.r)/2)*s, y*s); const rf = azar(semilla(OT_SEMILLA + "|firma|" + i)); ctx.rotate((-4 + rf()*4)*Math.PI/180);
        ctx.drawImage(inkImg(im), -w/2*s, -h/2*s, w*s, h*s); ctx.restore(); } }
    });
  }
  for (const a of S.free.filter(a => a.page === P.n)){
    if (a.type === "check") drawCheck(ctx, a.x*s, a.y*s, a.size*s, a.color||COLOR.blue);
    else if (a.type === "x") drawX(ctx, a.x*s, a.y*s, a.size*s, a.color||COLOR.red);
    else if (a.type === "text"){ ctx.font = `${a.size*s}px Arial, Helvetica, sans-serif`; ctx.fillStyle=COLOR.blue; ctx.textAlign="left"; ctx.textBaseline="middle"; String(a.text).split("\n").forEach((l,j)=>ctx.fillText(l, a.x*s, (a.y + j*a.size*1.15)*s)); }
    else if (a.type === "sig"){ const im = getImg(a.sig); if (im.complete && im.naturalWidth){ const w=a.w, h=w*im.naturalHeight/im.naturalWidth; ctx.drawImage(inkImg(im), (a.x-w/2)*s, (a.y-h/2)*s, w*s, h*s); } }
  }
  ctx.restore();
}


/* Líneas horizontales de las tablas (bordes dibujados como trazos o rectángulos finos) */
async function extractHLines(page){
  const vp = page.getViewport({scale:1});
  let ol; try { ol = await page.getOperatorList(); } catch(e){ return []; }
  const O = pdfjsLib.OPS, mul = pdfjsLib.Util.transform, ap = pdfjsLib.Util.applyTransform;
  let ctm = vp.transform.slice(); const stack = [];
  const segs = [], vsegs = [], otRects = []; let pending = [], fill = [0,0,0];
  const addBox = (pts) => {
    if (pts.length < 2) return;
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    for (const p of pts){ x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]); }
    if (x1-x0 < 2.2 && y1-y0 > 4) pending.push({v:true, x:(x0+x1)/2, y0, y1});
    else if (x1-x0 > 4 && y1-y0 < 2.2) pending.push({x0, x1, y:(y0+y1)/2});
    else if (x1-x0 > 4 && y1-y0 >= 2.2){ pending.push({x0,x1,y:y0,edge:true}); pending.push({x0,x1,y:y1,edge:true}); pending.push({big:true,x0,x1,y0,y1}); }
  };
  for (let i=0;i<ol.fnArray.length;i++){
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === O.setFillRGBColor) fill = Array.from(a || [0,0,0]);
    else if (fn === O.save) stack.push(ctm.slice());
    else if (fn === O.restore) ctm = stack.pop() || ctm;
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.constructPath){
      const ops = a[0], co = a[1]; let k = 0, cur = [];
      for (const op of ops){
        if (op === O.rectangle){ const [x,y,w,h] = co.slice(k,k+4); k += 4;
          addBox([ap([x,y],ctm), ap([x+w,y+h],ctm), ap([x+w,y],ctm), ap([x,y+h],ctm)]); }
        else if (op === O.moveTo){ if (cur.length) addBox(cur); cur = [ap([co[k],co[k+1]],ctm)]; k += 2; }
        else if (op === O.lineTo){ cur.push(ap([co[k],co[k+1]],ctm)); k += 2; }
        else if (op === O.curveTo){ cur.push(ap([co[k+4],co[k+5]],ctm)); k += 6; }
        else if (op === O.curveTo2 || op === O.curveTo3){ cur.push(ap([co[k+2],co[k+3]],ctm)); k += 4; }
        else if (op === O.closePath){ }
      }
      if (cur.length) addBox(cur);
    }
    else if (fn === O.fill || fn === O.eoFill || fn === O.stroke || fn === O.closeStroke || fn === O.fillStroke || fn === O.eoFillStroke || fn === O.closeFillStroke || fn === O.closeEOFillStroke){
      // en un relleno, solo cuentan los rectángulos finos (líneas); los bordes de cajas grandes se ignoran
      const isStroke = fn === O.stroke || fn === O.closeStroke;
      for (const s of pending){
        if (s.big){ if (!isStroke && s.y1 < 150 && s.x0 > vp.width*0.55 && s.y1-s.y0 >= 10 && s.y1-s.y0 <= 34 && s.x1-s.x0 > 50 && fill[2] > fill[0] + 40) otRects.push(s); continue; }
        if (s.v) vsegs.push(s); else if (isStroke || !s.edge) segs.push(s); }
      pending = [];
    }
    else if (fn === O.endPath) pending = [];
  }
  segs.v = vsegs; segs.ot = otRects;
  return segs;
}
// límite superior/inferior de la celda en la columna x alrededor de y
function cellBounds(lines, x, y){
  let top = -1e9, bot = 1e9;
  for (const s of lines){ if (x < s.x0 - 0.5 || x > s.x1 + 0.5) continue;
    if (s.y < y - 1 && s.y > top) top = s.y;
    if (s.y > y + 1 && s.y < bot) bot = s.y; }
  return { top, bot };
}
