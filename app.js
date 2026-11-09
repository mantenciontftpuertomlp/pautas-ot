"use strict";
/* Pautas OT — interfaz de la app (Ver. 1.25) */
const VERSION_APP = "Ver. 1.30";
const URL_SITIO = "https://mantenciontftpuertomlp.github.io/pautas-ot/";
const TERMINOS_VER = 2; // 2: se agrega el uso de internet para buscar actualizaciones (Ver. 1.30)

/* ---------- utilidades ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_NO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';
function toast(msg, ms=2600){ $$(".toast").forEach(t=>t.remove()); const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
function busy(on, txt){ $("#busy").classList.toggle("hidden", !on); if (txt) $("#busyTxt").textContent = txt; }
const ceder = () => new Promise(r => setTimeout(r, 0));
const LS = { get(k, d=null){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
             set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
             del(k){ try{ localStorage.removeItem(k); }catch(e){} } };
function b64ToBytes(b64){ const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function blobToB64(blob){ return new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); }); }

/* ---------- puente nativo ---------- */
const NATIVO = typeof window.Android !== "undefined";
const memFiles = {}; // versión web: se guarda también en IndexedDB
const IDB = {
  db: null,
  abrir(){ return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open("pautasot", 1); r.onupgradeneeded = () => r.result.createObjectStore("ots"); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async op(modo, fn){ const db = await this.abrir(); return new Promise((res, rej) => { const tx = db.transaction("ots", modo), st = tx.objectStore("ots"), q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); },
  poner(n, v){ return this.op("readwrite", st => st.put(v, n)).catch(() => toast("No se pudo guardar la OT en el teléfono")); },
  quitar(n){ return this.op("readwrite", st => st.delete(n)).catch(() => {}); },
  async cargar(){ try { const db = await this.abrir(); await new Promise(res => { const tx = db.transaction("ots"), st = tx.objectStore("ots"), c = st.openCursor(); c.onsuccess = () => { const k = c.result; if (k){ memFiles[k.key] = k.value; k.continue(); } else res(); }; c.onerror = () => res(); }); } catch(e){} }
};
async function fotoWeb(){
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.setAttribute("capture", "environment");
  i.onchange = () => { const f = i.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); if (window.__foto) window.__foto(c.toDataURL("image/jpeg", 0.85)); };
    im.onerror = () => toast("No se pudo leer la foto"); im.src = url; };
  i.click();
}
const N = {
  listar(){ if (NATIVO) { try { return JSON.parse(Android.listarOts()); } catch(e){ return []; } } return Object.keys(memFiles).map(n => ({name:n, mtime: memFiles[n].t})); },
  leer(name){ return NATIVO ? Android.leerOt(name) : memFiles[name].b64; },
  borrar(name){ if (NATIVO) Android.borrarOt(name); else { delete memFiles[name]; IDB.quitar(name); } },
  avisar(m){ if (NATIVO) Android.avisar(m); else toast(m); }
};
pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";

/* ---------- perfil y estado ---------- */
const DEF_DEFECTOS = ["Corrosión", "Humedad", "Sello dañado", "Perno suelto", "Cable dañado", "Falla operación", "Sensor dañado", "Suciedad / polvo"];
let perfil = Object.assign({ nombre:"", cargo:"", firma:null, defectos: DEF_DEFECTOS.slice(), subDefault:"NA" }, LS.get("perfil", {}));
function guardarPerfil(){ LS.set("perfil", perfil); }

const COLOR = { blue:"#1e1e1e", red:"#1e1e1e", white:"#ffffff", ink:"#1e1e1e" }; // marcas sobre el PDF: negro suave, como lápiz pasta (Ver. 1.27)
let PDF = null, PAGES = [], S = null, FILE = null, META = null;
let STEPS = [], step = 0;
const imgCache = new Map();
let undoStack = [];

function freshState(){ return { ot:"", file:"", checks:{}, epp:{}, boxes:{}, interv:{}, medidas:{}, obsExtra:[], resp:[], free:[], fotos:{} }; }
const stKey = f => "pauta:" + f, metaKey = f => "meta:" + f;
let saveT = null;
function changed(pushUndo=true, rerender=true){
  if (pushUndo){ undoStack.push(lastSnap); if (undoStack.length > 50) undoStack.shift(); }
  lastSnap = JSON.stringify(S);
  clearTimeout(saveT); saveT = setTimeout(persist, 300);
  redrawOverlays();
  if (rerender && !$("#scr-ot").classList.contains("hidden")) renderStep(false);
}
let lastSnap = "";
function persist(){
  if (!S || !FILE) return;
  if (!LS.set(stKey(FILE), S)) toast("Memoria llena: borra OTs enviadas antiguas");
  const p = progreso();
  if (META.estado !== "enviada" || p.tocado) { if (META.estado !== "enviada") META.estado = p.tocado ? "curso" : "pendiente"; }
  META.done = p.done; META.total = p.total;
  LS.set(metaKey(FILE), META);
}
function progreso(){
  const rows = allRows(); let done = 0;
  rows.forEach(({p, key}) => { const c = S.checks[key]; if (c && c.estado && (c.sub || !subCols(p).length)) done++; });
  const tocado = Object.keys(S.checks).length > 0 || Object.keys(S.epp).length > 0 || Object.keys(S.boxes||{}).length > 0 || S.free.length > 0;
  return { done, total: rows.length, tocado };
}

/* ---------- navegación ---------- */
function show(id){ $$(".scr").forEach(s => s.classList.toggle("hidden", s.id !== id)); }
window.atras = function(){
  if ($("#sheetRoot").firstChild){ closeSheet(); return true; }
  if (!$("#busy").classList.contains("hidden")) return true;
  if (!$("#scr-doc").classList.contains("hidden")){ show("scr-ot"); renderStep(); return true; }
  if (!$("#scr-ot").classList.contains("hidden")){ if (step > 0){ step--; renderStep(); } else { persist(); goHome(); } return true; }
  if (!$("#scr-set").classList.contains("hidden")){ goHome(); return true; }
  if (!$("#scr-terms").classList.contains("hidden") && terminosOk()){ show("scr-set"); renderSettings(); return true; }
  return false;
};
$$("[data-back]").forEach(b => b.onclick = () => window.atras());
$$("[data-home]").forEach(b => b.onclick = () => { closeSheet(); clearTimeout(saveT); persist(); goHome(); toast("Avance guardado"); });

/* ================= BANDEJA ================= */
function semana(){
  const d = new Date(), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const w = Math.ceil(((t - Date.UTC(t.getUTCFullYear(),0,1)) / 86400000 + 1) / 7);
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  return `Semana ${w} · ${dias[d.getDay()]} ${d.getDate()}`;
}
function goHome(){
  PDF = null; FILE = null; S = null; META = null;
  show("scr-home"); renderHome();
}
function renderHome(){
  $("#homeWeek").textContent = semana();
  $("#verPill").textContent = VERSION_APP.toUpperCase();
  const files = N.listar().sort((a,b) => b.mtime - a.mtime);
  const metas = files.map(f => ({ f, m: LS.get(metaKey(f.name), null) }));
  const cnt = {pendiente:0, curso:0, enviada:0};
  metas.forEach(({m}) => { cnt[(m && m.estado) || "pendiente"]++; });
  $("#stPend").textContent = cnt.pendiente; $("#stCurso").textContent = cnt.curso; $("#stEnv").textContent = cnt.enviada;
  if (!files.length){
    $("#homeList").innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><div><b>Aún no hay OTs</b></div><div style="font-size:14px;margin-top:6px">Abre el PDF de una OT o compártelo desde WhatsApp a <b>Pautas OT</b>.</div></div>`;
    return;
  }
  const card = ({f, m}) => {
    const est = (m && m.estado) || "pendiente";
    const pill = est === "enviada" ? `<span class="pill env">Enviada</span>` : est === "curso" ? `<span class="pill curso">En curso${m.total?` · ${m.done}/${m.total}`:""}</span>` : `<span class="pill">Pendiente</span>`;
    const title = m && (m.equipo || m.desc) ? (m.equipo || m.desc) : f.name.replace(/\.pdf$/i,"");
    const sub = m ? [m.equipo ? m.desc : "", m.fecha].filter(Boolean).join(" · ") : "Toca para abrir";
    const bar = est === "curso" && m.total ? `<div class="bar6"><i style="width:${Math.round(100*m.done/m.total)}%"></i></div>` : "";
    return `<div class="card" style="padding:0;display:flex">
      <button class="otc" data-open="${esc(f.name)}" style="border:0;background:transparent;padding:14px;flex:1">
        <div class="top"><span class="num">${m && m.ot ? "OT " + esc(m.ot) : "OT"}</span>${pill}</div>
        <div class="name">${esc(title)}</div><div class="meta">${esc(sub)}</div>${bar}
      </button>
      <button class="icon-btn" data-menu="${esc(f.name)}" aria-label="Opciones" style="color:var(--muted);margin:6px 4px 0 0"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg></button>
    </div>`;
  };
  const act = metas.filter(x => !x.m || x.m.estado !== "enviada"), env = metas.filter(x => x.m && x.m.estado === "enviada");
  $("#homeList").innerHTML = (act.length ? `<div class="sec-t">Por llenar</div>` + act.map(card).join("") : "") + (env.length ? `<div class="sec-t" style="margin-top:14px">Enviadas</div>` + env.map(card).join("") : "");
}
$("#homeList").addEventListener("click", e => {
  const o = e.target.closest("[data-open]"); if (o){ openOt(o.dataset.open); return; }
  const m = e.target.closest("[data-menu]");
  if (m){ const name = m.dataset.menu;
    sheet(`<div class="grab"></div><h3>${esc(name)}</h3>
      <button class="btn big" id="mReset">Borrar lo llenado (empezar de cero)</button>
      <button class="btn big" id="mDel" style="color:var(--def);border-color:#F0C9AE">Eliminar OT del teléfono</button>
      <button class="btn big" data-close>Cancelar</button>`);
    $("#mDel").onclick = () => { N.borrar(name); LS.del(stKey(name)); LS.del(metaKey(name)); closeSheet(); renderHome(); };
    $("#mReset").onclick = () => { LS.del(stKey(name)); const mm = LS.get(metaKey(name)); if (mm){ mm.estado="pendiente"; mm.done=0; LS.set(metaKey(name), mm); } closeSheet(); renderHome(); };
  }
});
$("#btnAbrir").onclick = () => {
  if (NATIVO) Android.elegirPdf();
  else { const i = document.createElement("input"); i.type="file"; i.accept="application/pdf"; i.onchange = async () => { const f=i.files[0]; if(!f) return; memFiles[f.name] = { b64: await blobToB64(f), t: Date.now() }; await IDB.poner(f.name, memFiles[f.name]); window.onOtRecibida([f.name]); }; i.click(); }
};
$("#btnAjustes").onclick = () => { show("scr-set"); renderSettings(); };

/* llamado por Android cuando llega un PDF (compartido o elegido) */
window.onOtRecibida = function(names){
  if (typeof names === "string") { try { names = JSON.parse(names); } catch(e){ names = [names]; } }
  if (!names || !names.length) return;
  if (!terminosOk()){ renderTerminos(false); toast("Acepta los términos para abrir la OT"); return; }
  if (names.length === 1) openOt(names[0]);
  else { goHome(); toast(`${names.length} OTs recibidas`); }
};

/* ================= ABRIR OT ================= */
async function openOt(name){
  busy(true, "Leyendo la OT…");
  try {
    const b64 = N.leer(name);
    if (!b64) throw new Error("vacío");
    PDF = await pdfjsLib.getDocument({ data: b64ToBytes(b64) }).promise;
  } catch(e){ busy(false); toast("No se pudo abrir el PDF"); console.error(e); return; }
  FILE = name; PAGES = []; let lines1 = [], words1 = null, W1 = 612;
  for (let n=1; n<=PDF.numPages; n++){
    const page = await PDF.getPage(n);
    const { words, w, h, lines } = await extractWords(page);
    if (n <= 2) lines1 = lines1.concat(lines);
    if (n === 1){ words1 = words; W1 = w; }
    const text = words.map(x=>x.t).join(" ");
    const esSAP = /ORDEN\s+DE\s+MANTENIMIENTO/i.test(text) || /Orden\s*:\s*\d{5,}/.test(text);
    const isPauta = !esSAP && (/Indicar\s+Nro/i.test(text) || /PAUTA\s+DE\s+MANTENIMIENTO/i.test(text) || /ALCANCE\s+GENERAL|EJECUCI[OÓ]N\s+(INSPECCI|MANTENIMIENTO)|Descripci[oó]n\s+Actividades|OBSERVACIONES|CONTROL\s+DE\s+REVISIONES|Nombre\s+y\s+Apellido/i.test(text));
    const P = { n, w, h, isPauta, page };
    if (isPauta){ const hl = await extractHLines(page); P.otBox = detectOtBox(words); const prevP = PAGES[PAGES.length-1]; P.checklist = detectChecklist(words, w, h, hl, prevP && prevP.isPauta && prevP.checklist ? prevP.checklist : null); P.epp = detectEPP(words, w); P.obs = detectObs(words, w, hl); P.resp = detectResp(words, w);
      const excl = [];
      if (P.checklist) excl.push({ top: P.checklist.top, bottom: P.checklist.bottom });
      if (P.epp){ const ys = P.epp.rows.map(r=>r.y); excl.push({ top: Math.min(...ys) - 14, bottom: Math.max(...ys) + 6 }); }
      if (P.resp){ const ys = P.resp.rows.map(r=>r.y); excl.push({ top: Math.min(...ys) - 20, bottom: Math.max(...ys) + 10 }); }
      if (P.obs) excl.push({ top: P.obs.top - 14, bottom: P.obs.bottom });
      P.interv = detectInterv(words, w);
      if (P.interv) P.interv.forEach(it => it.opts.forEach(o => excl.push({ top: o.y - 3, bottom: o.y + 3 })));
      P.boxes = detectBoxes(words, hl, w, excl);
      const ap = detectAplica(words, hl, w);
      if (ap.length){ P.boxes = P.boxes || { rows: [] }; P.boxes.rows = ap.concat(P.boxes.rows); }
      if (!P.otBox && hl.ot && hl.ot.length){ const b = hl.ot[0]; P.otBox = { x: b.x0 + 8, base: (b.y0 + b.y1)/2 + 3, fh: 8.5 }; } }
    PAGES.push(P); await ceder();
  }
  if (!PAGES.some(p=>p.isPauta)) PAGES.forEach(p => p.isPauta = true);

  // metadatos de la OT
  const all = lines1.join("\n");
  const pick = re => { const m = all.match(re); return m ? m[1].trim() : ""; };
  // valor a la derecha de una etiqueta (columna izquierda de la OT)
  const campo = (re, up, down, filt) => {
    if (!words1) return "";
    const cl = words1.filter(w => /^(Clase|Prioridad|Revisi[oó]n|Fecha)$/.test(w.t)).map(w=>w.x0);
    const limX = cl.length ? Math.min(...cl) - 2 : W1*0.44;
    const i = words1.findIndex((w,k) => re.test(words1.slice(k, k+3).map(x=>x.t).join(" ")));
    if (i < 0) return "";
    const col = words1.slice(i, i+5).find(w => /:$/.test(w.t)); if (!col) return "";
    return words1.filter(w => w.x0 > col.x1 + 1 && w.x1 < limX && w.y > col.y - up && w.y < col.y + down && (!filt || filt(w)))
      .sort((a,b) => Math.abs(a.y-b.y) > 2 ? a.y-b.y : a.x0-b.x0).map(w=>w.t).join(" ").trim();
  };
  const ot = campo(/^Orden :/, 4, 4, w => /^\d{5,}$/.test(w.t)) || pick(/(\d{7,})\s+PM\d/) || ((name.match(/(\d{6,})/)||[])[1] || "");
  let equipo = campo(/^Denominaci[oó]n equipo :/, 3, 3) || pick(/Denominaci[oó]n\s+equipo\s*:\s*(.+?)(?:\s+Grupo\b|$)/im);
  let desc = campo(/^Descripci[oó]n orden :/, 7, 13);
  if (/^Grupo\b|^:/i.test(equipo) || /^\W*$/.test(equipo)) equipo = "";
  const fecha = pick(/Fecha\s+inicio\s+Programada\s*:\s*([\d.]+)/i);
  const hora = pick(/Hora\s+inicio\s*:\s*(\d{1,2}:\d{2})/i);
  const tc = s => s.toLowerCase().replace(/(^|[\s(-])([a-záéíóúñ])/g, (m,a,b)=>a+b.toUpperCase());
  META = Object.assign({ estado:"pendiente", done:0, total:0 }, LS.get(metaKey(name), {}), { ot, equipo: equipo ? tc(equipo) : "", desc, fecha: [fecha, hora].filter(Boolean).join(" ") });

  const saved = LS.get(stKey(name), null);
  S = saved ? Object.assign(freshState(), saved) : freshState();
  S.file = name; if (!S.ot) S.ot = ot;
  if (!S.resp.length) S.resp = [{ nombre: perfil.nombre, cargo: perfil.cargo, sig: perfil.firma }];
  undoStack = []; lastSnap = JSON.stringify(S);
  persist();

  STEPS = [];
  if (allEpp().length || allBoxes().length) STEPS.push({k:"epp", l: allBoxes().length ? "Inicio" : "EPP"});
  if (allRows().length) STEPS.push({k:"act", l:"Actividades"});
  if (PAGES.some(p=>p.resp)) STEPS.push({k:"firma", l:"Firma"});
  STEPS.push({k:"enviar", l:"Enviar"});
  step = 0;
  if (saved){ const p = progreso(); if (p.total && p.done === p.total) step = Math.max(0, STEPS.findIndex(s=>s.k==="firma")); else if (Object.keys(S.checks).length) step = Math.max(0, STEPS.findIndex(s=>s.k==="act")); }
  busy(false);
  $("#otSub").textContent = (S.ot ? "OT " + S.ot : "OT") + " · Pauta";
  $("#otTitle").textContent = META.equipo || META.desc || name.replace(/\.pdf$/i,"");
  show("scr-ot"); renderStep();
  if (STEPS.length === 1) toast("No se reconocieron casillas: usa el botón Documento para marcar a mano", 4500);
}

function allRows(){ const out=[]; PAGES.forEach(p => p.checklist && p.checklist.rows.forEach(r => out.push({p, r, key: p.n+"-"+(r.key||r.item)}))); return out; }
function allBoxes(){ const out=[]; PAGES.forEach(p => p.boxes && p.boxes.rows.forEach(r => out.push({p, r, key: p.n+"-"+r.key}))); return out; }
const subCols = p => p.checklist ? p.checklist.cols.filter(c => c.g === "sub") : [];
const btnCls = k => k === "SD" || k === "NO" ? "ok" : k === "NA" ? "na" : "bad";
function allInterv(){ const out=[]; PAGES.forEach(p => p.interv && p.interv.forEach(it => out.push({p, it, key: p.n+"-"+it.key}))); return out; }
function allEpp(){ const out=[]; PAGES.forEach(p => p.epp && p.epp.rows.forEach(r => out.push({p, r, key: p.n+"-"+r.key}))); return out; }
function obsEntries(){
  const list = [];
  allRows().forEach(({r,key}) => { const c = S.checks[key]; if (c && c.estado==="CD") list.push({ item: r.item, text: (c.detalle||"").trim(), auto:true, key }); });
  S.obsExtra.forEach((o,i) => { if ((o.text||"").trim()) list.push({ item:o.item, text:o.text, idx:i }); });
  return list;
}
const cap = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : "";
const corto = (v, n=70) => v.length > n ? v.slice(0, n-1).replace(/\s+\S*$/, "") + "…" : v;
const extraHtml = (r, omitir) => { const ex = (r.extra || []).filter(e => !(omitir && omitir(e))); return ex.length ? `<span class="x">${ex.map(e => `<b>${esc(e.t)}:</b> ${esc(corto(e.v))}`).join(" · ")}</span>` : ""; };

/* ================= PASOS ================= */
function renderStep(scrollTop=true){
  $("#stepper").innerHTML = STEPS.map((s,i) => `<div class="${i<=step?"on":""} ${i===step?"cur":""}"><i></i><span>${s.l}</span></div>`).join("");
  const k = STEPS[step].k, body = $("#stepBody"), y = body.scrollTop;
  if (k === "epp") renderEpp(); else if (k === "act") renderAct(); else if (k === "firma") renderFirma(); else renderEnviar(scrollTop);
  if (scrollTop) body.scrollTop = 0; else body.scrollTop = y;
}
function footNext(label, fn, extra=""){
  $("#stepFoot").innerHTML = `${extra}<button class="btn pri big" id="nextBtn">${label}</button>`;
  $("#nextBtn").onclick = fn;
}
const nextStep = () => { step = Math.min(STEPS.length-1, step+1); renderStep(); };

/* --- EPP --- */
function renderEpp(){
  const epp = allEpp(), bxAll = allBoxes(), n = epp.filter(({key}) => S.epp[key]).length;
  // la misma casilla repetida en otra hoja (p. ej. la grilla de áreas) se muestra una vez y se marca en todas
  const bx = []; const porNombre = {};
  for (const it of bxAll){ const id = (it.r.grupo || "") + "|" + it.r.label; if (porNombre[id]) porNombre[id].keys.push(it.key); else { porNombre[id] = { r: it.r, key: it.key, keys: [it.key] }; bx.push(porNombre[id]); } }
  const nb = bx.filter(({key}) => S.boxes[key]).length;
  let html = "";
  if (epp.length) html += `<div class="head-row"><div><h2>Elementos de protección</h2><div class="m">${n} marcados · toca los que usaste</div></div></div>
    <div class="chips">${epp.map(({r,key}) => `<button class="chip ${S.epp[key]?"on":""}" data-epp="${key}">${esc(r.key)}. ${esc(cap(r.label))}</button>`).join("")}</div>
    ${perfil.eppUsual && perfil.eppUsual.length ? `<button class="btn outline" id="eppUsual" style="margin-top:14px;width:100%">Usar mis EPP habituales</button>` : ""}`;
  const soloAplica = bx.length && bx.every(({r}) => /^a/.test(r.key));
  if (bx.length) html += `<div class="head-row" style="margin-top:${epp.length?22:0}px"><div><h2>${soloAplica ? "Actividades previas y de cierre" : "Área y equipos inspeccionados"}</h2><div class="m">${nb} marcados · toca ${soloAplica ? "las que aplican" : "los que corresponden"}</div></div>${soloAplica ? `<button class="btn outline sm" id="todasAplican">Todas aplican</button>` : ""}</div>
    ${(() => { let out = "", g = null, open = false;
      for (const {r,key,keys} of bx){
        if (r.grupo !== g){ if (open) out += "</div>"; g = r.grupo; if (g) out += `<div class="sec-t" style="margin:14px 2px 8px">${esc(g)}</div>`; out += `<div class="chips">`; open = true; }
        out += `<button class="chip ${S.boxes[key]?"on":""}" data-box="${keys.join("|")}">${esc(r.label)}</button>`;
      }
      return out + (open ? "</div>" : ""); })()}`;
  $("#stepBody").innerHTML = html;
  footNext(STEPS[step+1] ? `Siguiente: ${STEPS[step+1].l.toLowerCase()}` : "Siguiente", () => {
    if (epp.length){ perfil.eppUsual = epp.filter(({key}) => S.epp[key]).map(({r}) => r.key); guardarPerfil(); } nextStep(); });
  const ta = $("#todasAplican"); if (ta) ta.onclick = () => { bxAll.forEach(({key}) => S.boxes[key] = true); changed(); };
  const u = $("#eppUsual"); if (u) u.onclick = () => { epp.forEach(({r,key}) => { if (perfil.eppUsual.includes(r.key)) S.epp[key] = true; }); changed(); };
}
$("#stepBody").addEventListener("input", e => {
  const t = e.target; if (!t.dataset || !t.dataset.med) return;
  S.medidas = S.medidas || {}; const v = t.value.replace(",", ".").trim();
  if (v) S.medidas[t.dataset.med] = t.value.trim(); else delete S.medidas[t.dataset.med];
  changed(true, false);
});
$("#stepBody").addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.epp){ const k = t.dataset.epp; if (S.epp[k]) delete S.epp[k]; else S.epp[k] = true; changed(); }
  else if (t.dataset.box){ const ks = t.dataset.box.split("|"), on = !S.boxes[ks[0]]; ks.forEach(k => { if (on) S.boxes[k] = true; else delete S.boxes[k]; }); changed(); }
  else if (t.dataset.row){ setCheck(t.dataset.row, t.dataset.g, t.dataset.k); }
  else if (t.dataset.det){ openDefect(t.dataset.det); }
  else if (t.dataset.interv){ S.interv = S.interv || {}; const k = t.dataset.interv; S.interv[k] = S.interv[k] === t.dataset.k ? null : t.dataset.k; changed(); }
});

/* --- Actividades --- */
function renderAct(){
  const rows = allRows(), p = progreso();
  // datos de celdas combinadas iguales para todos los ítems: se muestran una sola vez arriba
  const comunes = [];
  if (rows.length > 1 && rows[0].r.extra) for (const e of rows[0].r.extra){
    if (rows.every(({r}) => r.extra && r.extra.some(x => x.t === e.t && x.v === e.v))) comunes.push(e);
  }
  const esComun = e => comunes.some(c => c.t === e.t && c.v === e.v);
  const card = ({p, r, key}) => {
    const c = S.checks[key] || {}, sc = subCols(p);
    const b = (g,k,l) => `<button class="${btnCls(k)} ${c[g]===k?"on":""}" data-row="${key}" data-g="${g}" data-k="${k}">${esc(l)}</button>`;
    const completo = c.estado && (c.sub || !sc.length);
    const cls = c.estado === "CD" || c.estado === "NR" ? "def" : (completo ? "done" : "");
    const est = p.checklist.estados || [{k:"SD",label:"Sin defecto"},{k:"CD",label:"Con defecto"}];
    const foto = S.fotos[key];
    const det = c.estado === "CD" ? `<button class="detbox" data-det="${key}">${foto?`<img src="${foto}" alt="">`:""}<span>${c.detalle ? esc(c.detalle) : '<span class="ph">Toca para describir el defecto</span>'}</span></button>` : "";
    return `<div class="it ${cls}">
      <div class="h"><span class="n">${esc(r.item)}</span><div style="display:flex;flex-direction:column;gap:2px"><span class="c">${esc(r.comp||"")}</span>${extraHtml(r, esComun)}<span class="d">${esc(r.desc||"")}</span></div></div>
      ${r.limite ? `<span class="x"><b>Límite aceptable:</b> ${esc(r.limite)}</span>` : ""}
      ${r.medidas ? `<div class="medidas">${r.medidas.map(m => `<label class="med"><span>${esc(m.label)}</span><input type="text" inputmode="decimal" data-med="${key}#${m.id}" value="${esc((S.medidas||{})[key+"#"+m.id]||"")}" placeholder="—">${m.unidad ? `<em>${esc(m.unidad)}</em>` : ""}</label>`).join("")}</div>` : ""}
      <div class="seg" style="grid-template-columns:repeat(${est.length},minmax(0,1fr))">${est.map(e => b("estado", e.k, e.label)).join("")}</div>
      ${det}
      ${sc.length ? `<div class="subrow"><span>${esc(p.checklist.subLabel)}</span><div class="seg" style="grid-template-columns:repeat(${sc.length},minmax(0,1fr))">${sc.map(x => b("sub", x.k, x.label)).join("")}</div></div>` : ""}
    </div>`;
  };
  const pend = rows.filter(({key}) => !(S.checks[key]||{}).estado).length;
  $("#stepBody").innerHTML = `<div class="head-row"><div><h2>Actividades</h2><div class="m">${p.done} de ${p.total} completas</div></div>
      ${pend ? `<button class="btn outline sm" id="restoSD">Resto sin defecto</button>` : ""}</div>
    ${allInterv().map(({key}, i, arr) => `<div class="card"><b style="font-size:15px;color:var(--pri-dk)">Tipo de intervención${arr.length>1?" "+(i+1):""}</b>
      <div class="seg two" style="margin-top:8px">${[["COR","Correctiva"],["PRE","Preventiva"]].map(([k,l]) => `<button class="ok ${(S.interv||{})[key]===k?"on":""}" data-interv="${key}" data-k="${k}">${l}</button>`).join("")}</div></div>`).join("")}
    ${comunes.length ? `<div class="card comun">${comunes.map(e => `<div><b>${esc(e.t)}</b><span>${esc(e.v)}</span></div>`).join("")}<div class="m">Aplica a los ${rows.length} ítems</div></div>` : ""}
    ${rows.map(card).join("")}
    <button class="btn dash" id="addObs" style="margin-top:4px">+ Observación adicional</button>
    ${S.obsExtra.map((o,i) => `<div class="card" style="margin-top:10px;display:flex;gap:10px;align-items:center"><b style="min-width:34px">${esc(o.item||"—")}</b><span style="flex:1">${esc(o.text)}</span><button class="btn sm" data-obs="${i}">Editar</button></div>`).join("")}`;
  const rs = $("#restoSD"); if (rs) rs.onclick = () => {
    rows.forEach(({p, key}) => { const c = S.checks[key] || (S.checks[key]={}); if (!c.estado){ c.estado = "SD"; if (!c.sub && subDef(p)) c.sub = subDef(p); } });
    changed(); toast("Ítems pendientes marcados Sin defecto");
  };
  $("#addObs").onclick = () => editObs(-1);
  $$("[data-obs]").forEach(b => b.onclick = () => editObs(+b.dataset.obs));
  const falta = rows.filter(({p, key}) => { const c = S.checks[key]||{}; return !c.estado || (!c.sub && subCols(p).length); }).length;
  footNext(STEPS[step+1] ? `Siguiente: ${STEPS[step+1].l.toLowerCase()}` : "Siguiente", () => {
    if (falta) { sheet(`<div class="grab"></div><h3>Faltan ${falta} ítem(s)</h3><div class="m" style="color:var(--muted)">Hay ítems sin estado o sin subsecuente.</div>
        <button class="btn pri big" data-close>Volver a revisar</button><button class="btn big" id="seguir">Continuar igual</button>`);
      $("#seguir").onclick = () => { closeSheet(); nextStep(); }; }
    else nextStep();
  });
}
const subDef = p => perfil.subDefault && subCols(p).some(x => x.k === perfil.subDefault) ? perfil.subDefault : null;
function setCheck(key, g, k){
  const c = S.checks[key] || (S.checks[key] = {});
  const row = allRows().find(x => x.key === key), sd = row ? subDef(row.p) : null;
  const was = c[g];
  c[g] = was === k ? null : k;
  if (g === "estado" && c.estado === "SD" && !c.sub && sd) c.sub = sd;
  if (g === "estado" && c.estado === "CD" && was !== "CD"){ if (sd && c.sub === sd) c.sub = null; changed(); openDefect(key); return; }
  changed();
}

/* --- Hoja de defecto --- */
function openDefect(key){
  const row = allRows().find(x => x.key === key); if (!row) return;
  const c = S.checks[key] || (S.checks[key] = {});
  let txt = c.detalle || "", sub = c.sub || null, foto = S.fotos[key] || null;
  const chipOn = d => txt.toLowerCase().includes(d.toLowerCase());
  const draw = () => {
    sheet(`<div class="grab"></div>
      <div><div class="kick">Ítem ${esc(row.r.item)} · ${row.p.checklist.mode === "ok" ? "Con observación" : "Con defecto"}</div><h3>${row.p.checklist.mode === "ok" ? "¿Qué observaste?" : "¿Qué encontraste?"}</h3><div style="font-size:13px;color:var(--muted);margin-top:4px">${esc(row.r.comp ? row.r.comp + " — " : "")}${esc((row.r.desc||"").slice(0,90))}${(row.r.desc||"").length>90?"…":""}</div></div>
      <div><label class="f" style="margin-top:0">Frecuentes (toca para agregar)</label>
        <div class="chips">${perfil.defectos.map((d,i) => `<button class="chip def ${chipOn(d)?"on":""}" data-chip="${i}">${esc(d)}</button>`).join("")}</div></div>
      <div><label class="f" for="detTxt">Detalle (va a ${row.p.checklist.mode === "ok" ? "Otras observaciones" : "3.4 Observaciones"})</label>
        <div class="ta-wrap"><textarea id="detTxt" placeholder="Describe el problema…">${esc(txt)}</textarea>
        ${NATIVO ? `<button class="mic" id="mic" aria-label="Dictar por voz"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>` : ""}</div></div>
      ${subCols(row.p).length ? `<div><label class="f" style="margin-top:0">${/subsecuente/i.test(row.p.checklist.subLabel) ? "¿Requiere aviso subsecuente?" : esc(row.p.checklist.subLabel)}</label>
        <div class="seg" style="grid-template-columns:repeat(${subCols(row.p).length},minmax(0,1fr))">${subCols(row.p).map(x => `<button class="${btnCls(x.k)} ${sub===x.k?"on":""}" data-sub="${x.k}">${esc(x.label)}</button>`).join("")}</div></div>` : ""}
      ${foto ? `<div class="fotoprev"><img src="${foto}" alt="Foto del hallazgo"><button class="btn sm" id="fotoDel">Quitar</button></div>` :
        true ? `<button class="btn dash" id="fotoBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Adjuntar foto del hallazgo</button>` : ""}
      <button class="btn pri big" id="detOk">${row.p.checklist.mode === "ok" ? "Guardar observación" : "Guardar defecto"}</button>`);
    const ta = $("#detTxt"); ta.oninput = () => { txt = ta.value; };
    $$("[data-chip]").forEach(b => b.onclick = () => {
      const d = perfil.defectos[+b.dataset.chip];
      if (chipOn(d)) txt = txt.replace(new RegExp("\\s*" + d.replace(/[.*+?^${}()|[\]\\/]/g,"\\$&") + "[.,;]?", "i"), "").trim();
      else txt = (txt.trim() ? txt.trim().replace(/[.,;]?$/, ". ") : "") + d + ".";
      draw();
    });
    $$("[data-sub]").forEach(b => b.onclick = () => { sub = sub === b.dataset.sub ? null : b.dataset.sub; draw(); });
    const mic = $("#mic"); if (mic) mic.onclick = () => { window.__dictado = t => { const base = txt.trim(); if (!base || /[.!?]$/.test(base)) t = t.charAt(0).toUpperCase() + t.slice(1); txt = (base ? base + " " : "") + t; draw(); }; Android.dictar("det"); };
    const fb = $("#fotoBtn"); if (fb) fb.onclick = () => { window.__foto = url => { foto = url; draw(); }; if (NATIVO) Android.foto("det"); else fotoWeb(); };
    const fd = $("#fotoDel"); if (fd) fd.onclick = () => { foto = null; draw(); };
    $("#detOk").onclick = () => { c.estado = "CD"; c.detalle = txt.trim(); c.sub = sub; if (foto) S.fotos[key] = foto; else delete S.fotos[key]; closeSheet(); changed(); };
  };
  draw();
}
window.onDictado = function(id, texto){ if (window.__dictado && texto) window.__dictado(texto); };
window.onFoto = function(id){ try { const url = Android.leerFoto(); if (url && window.__foto) window.__foto(url); } catch(e){ toast("No se pudo leer la foto"); } };

function editObs(idx){
  const o = idx >= 0 ? S.obsExtra[idx] : { item:"", text:"" };
  sheet(`<div class="grab"></div><h3>${idx>=0?"Editar":"Agregar"} observación</h3>
    <div><label class="f" style="margin-top:0">Ítem</label><input type="text" id="oI" value="${esc(o.item)}" inputmode="numeric" placeholder="Ej: 4"></div>
    <div><label class="f" style="margin-top:0">Observación</label><textarea id="oT">${esc(o.text)}</textarea></div>
    <button class="btn pri big" id="oOk">Guardar</button>
    ${idx>=0 ? `<button class="btn big" id="oDel" style="color:var(--def)">Eliminar</button>` : `<button class="btn big" data-close>Cancelar</button>`}`);
  $("#oOk").onclick = () => { const v = { item: $("#oI").value.trim(), text: $("#oT").value.trim() }; if (idx>=0) S.obsExtra[idx] = v; else if (v.text) S.obsExtra.push(v); closeSheet(); changed(); };
  const d = $("#oDel"); if (d) d.onclick = () => { S.obsExtra.splice(idx,1); closeSheet(); changed(); };
}

/* --- Firma --- */
function renderFirma(){
  const rows = allRows(), p = progreso();
  const sd = rows.filter(({key}) => (S.checks[key]||{}).estado === "SD").length, cd = rows.filter(({key}) => (S.checks[key]||{}).estado === "CD").length;
  const nEpp = Object.keys(S.epp).length, rp = PAGES.find(x=>x.resp), maxP = rp ? rp.resp.rows.length : 5;
  const ini = s => (s||"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("") || "?";
  const sinDet = rows.filter(({key}) => { const c = S.checks[key]||{}; return c.estado==="CD" && !(c.detalle||"").trim(); }).map(x=>x.r.item);
  const checks = [
    [p.done === p.total, p.done === p.total ? `${p.total} de ${p.total} actividades completas` : `Faltan ${p.total - p.done} actividades`],
    [!sinDet.length, cd ? (sinDet.length ? `Falta detalle en ítem ${sinDet.join(", ")}` : `Defecto${cd>1?"s":""} con detalle (ítem ${rows.filter(({key}) => (S.checks[key]||{}).estado === "CD").map(x=>x.r.item).join(", ")})`) : "Sin defectos"],
    ...(() => { const faltan = allRows().filter(({r, key}) => r.medidas && r.medidas.some(m => !(S.medidas||{})[key+"#"+m.id])).map(x => x.r.item);
      return allRows().some(({r}) => r.medidas) ? [[!faltan.length, faltan.length ? `Faltan mediciones en ítem ${faltan.join(", ")}` : "Mediciones registradas"]] : []; })(),
    ...(allInterv().length ? [[allInterv().every(({key}) => (S.interv||{})[key]), allInterv().every(({key}) => (S.interv||{})[key]) ? "Tipo de intervención" : "Falta el tipo de intervención (Correctiva / Preventiva)"]] : []),
    [S.resp.some(x=>x.nombre), S.resp.some(x=>x.nombre) ? "Nombre del responsable" : "Falta el nombre del responsable"],
    [S.resp.some(x=>x.sig), S.resp.some(x=>x.sig) ? "Firma del responsable" : "Falta la firma"]
  ];
  $("#stepBody").innerHTML = `
    <div class="card summary"><div><b style="color:var(--pri)">${sd}</b><span>Sin defecto</span></div><div><b style="color:var(--def)">${cd}</b><span>Con defecto</span></div><div><b>${nEpp}</b><span>EPP marcados</span></div></div>
    ${S.resp.map((r,i) => `<div class="card person">
      <div class="row-sb" style="margin-bottom:8px"><b style="font-size:15px">${i===0?"Responsable":"Persona "+(i+1)}</b>${i===0 && r.nombre && r.nombre===perfil.nombre && r.sig && r.sig===perfil.firma ? '<span class="tag">Guardado</span>' : i>0 ? `<button class="btn sm" data-rdel="${i}">Quitar</button>` : ""}</div>
      <div class="who"><div class="avatar">${esc(ini(r.nombre))}</div><div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <input type="text" data-rf="nombre" data-ri="${i}" value="${esc(r.nombre)}" placeholder="Nombre y apellido" aria-label="Nombre y apellido">
        <input type="text" data-rf="cargo" data-ri="${i}" value="${esc(r.cargo)}" placeholder="Cargo" aria-label="Cargo"></div></div>
      <button class="sigbox" data-rsig="${i}" aria-label="Firmar">${r.sig ? `<img src="${r.sig}" alt="Firma">` : '<span class="ph">Toca para firmar</span>'}</button>
      ${r.sig ? `<button class="btn" data-rsig="${i}" style="width:100%">Firmar de nuevo</button>` : ""}
    </div>`).join("")}
    ${S.resp.length < maxP ? `<button class="btn dash" id="addP">+ Otra persona</button>` : ""}
    <div class="card" style="margin-top:10px"><b style="font-size:15px">Revisión</b>
      ${checks.map(([ok,t]) => `<div class="okline ${ok?"y":"n"}">${ok?ICON_OK:ICON_NO}${esc(t)}</div>`).join("")}</div>`;
  footNext("Generar pauta llena", nextStep);
  const ap = $("#addP"); if (ap) ap.onclick = () => { S.resp.push({nombre:"",cargo:"",sig:null}); changed(); };
  $$("[data-rdel]").forEach(b => b.onclick = () => { S.resp.splice(+b.dataset.rdel,1); changed(); });
  $$("[data-rsig]").forEach(b => b.onclick = () => { const i = +b.dataset.rsig; openSignature(url => { S.resp[i].sig = url; if (i===0){ perfil.firma = url; guardarPerfil(); } changed(); }); });
  $$("[data-rf]").forEach(inp => {
    inp.oninput = () => { const i = +inp.dataset.ri; S.resp[i][inp.dataset.rf] = inp.value; if (i===0){ perfil[inp.dataset.rf] = inp.value.trim(); guardarPerfil(); } changed(true, false); };
    inp.onblur = () => setTimeout(() => { if (!document.activeElement || !document.activeElement.dataset || !document.activeElement.dataset.rf) renderStep(false); }, 50);
  });
}

/* --- Enviar --- */
let OUTS = [];
async function renderEnviar(){
  $("#stepBody").innerHTML = `<div class="empty"><div class="spin dark" style="margin:0 auto 12px"></div>Generando imágenes…</div>`;
  $("#stepFoot").innerHTML = "";
  await ceder();
  try { OUTS = await generarImagenes(); } catch(e){ console.error(e); $("#stepBody").innerHTML = `<div class="warn">No se pudieron generar las imágenes.</div>`; return; }
  const p = progreso();
  $("#stepBody").innerHTML = `
    ${p.done < p.total ? `<div class="warn">Atención: faltan ${p.total - p.done} actividades por completar.</div>` : ""}
    <div class="prev">${OUTS.map(o => `<figure><img src="${o.url}" alt=""><figcaption>${esc(o.cap)}</figcaption></figure>`).join("")}</div>
    <div class="hint" style="margin:6px 0 12px">${OUTS.length} imagen${OUTS.length>1?"es":""} · desliza para ver</div>`;
  $("#stepFoot").innerHTML = `
    <button class="btn ok huge" id="wa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.4 7.9L3 21l1.2-4.4A9 9 0 1 1 21 12z"/></svg>Enviar por WhatsApp</button>
    <div class="grid2"><button class="btn" id="pdfBtn">Guardar PDF</button><button class="btn" id="otro">Otro medio</button></div>`;
  $("#wa").onclick = () => compartir("whatsapp");
  $("#otro").onclick = () => compartir("otro");
  $("#pdfBtn").onclick = guardarPdf;
}

async function renderPageImage(P, scale){
  const vp = P.page.getViewport({scale});
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height);
  await P.page.render({ canvasContext: ctx, viewport: vp }).promise;
  const urls = [...S.resp.map(r=>r.sig), ...S.free.filter(a=>a.sig).map(a=>a.sig)].filter(Boolean);
  await Promise.all(urls.map(loadImg));
  drawAnnotations(ctx, P, scale, false);
  return c;
}
async function fotoCanvas(key){
  const row = allRows().find(x => x.key === key), c0 = S.checks[key] || {};
  const im = await loadImg(S.fotos[key]); if (!im) return null;
  const W = 1200, pad = 36, scale = W / im.naturalWidth, ih = Math.round(im.naturalHeight * scale);
  const c = document.createElement("canvas"); const ctx = c.getContext("2d");
  ctx.font = "30px Arial"; const lines = wrap(ctx, c0.detalle || "", W - pad*2);
  const head = 70 + lines.length*38 + 24; c.width = W; c.height = head + ih;
  ctx.fillStyle = "#0D2C4F"; ctx.fillRect(0,0,W,head);
  ctx.fillStyle = "#fff"; ctx.font = "bold 34px Arial"; ctx.textBaseline = "top"; ctx.fillText(`OT ${S.ot} · Hallazgo ítem ${row ? row.r.item : ""}`, pad, 26);
  ctx.font = "30px Arial"; ctx.fillStyle = "#DCE6F2"; lines.forEach((l,i) => ctx.fillText(l, pad, 76 + i*38));
  ctx.drawImage(im, 0, head, W, ih);
  return c;
}
const toBlob = (c, q=0.88) => new Promise(r => c.toBlob(r, "image/jpeg", q));
async function generarImagenes(){
  fijarEstiloOt();
  const sel = PAGES.filter(P => P.isPauta), canv = [];
  for (const P of sel){ canv.push(await renderPageImage(P, 2.6)); await ceder(); }
  const base = `Pauta_OT${S.ot||""}`, outs = [];
  for (let i=0;i<canv.length;i++) outs.push({ canvas:canv[i], blob: await toBlob(canv[i]), name: `${base}_hoja${i+1}.jpg`, cap: `Hoja ${i+1} de ${canv.length}` });
  for (const key of Object.keys(S.fotos)){
    if ((S.checks[key]||{}).estado !== "CD") continue;
    const c = await fotoCanvas(key); if (!c) continue;
    const it = key.split("-")[1];
    outs.push({ canvas:c, blob: await toBlob(c, 0.85), name: `${base}_hallazgo_item${it}.jpg`, cap: `Foto hallazgo ítem ${it}`, foto:true });
  }
  outs.forEach(o => o.url = URL.createObjectURL(o.blob));
  return outs;
}
function marcarEnviada(){ META.estado = "enviada"; META.enviada = Date.now(); persist(); }
async function compartir(modo){
  busy(true, "Preparando…");
  try {
    if (NATIVO){
      const arr = [];
      for (const o of OUTS) arr.push({ name: o.name, b64: await blobToB64(o.blob), mime: "image/jpeg" });
      Android.compartir(JSON.stringify(arr), modo);
      marcarEnviada();
    } else if (navigator.canShare && navigator.canShare({ files: OUTS.map(o => new File([o.blob], o.name, {type:"image/jpeg"})) })){
      await navigator.share({ files: OUTS.map(o => new File([o.blob], o.name, {type:"image/jpeg"})) }); marcarEnviada();
    } else { OUTS.forEach(o => descargar(o.blob, o.name)); marcarEnviada(); }
  } catch(e){ if (e && e.name !== "AbortError") toast("No se pudo compartir"); }
  busy(false);
}
window.onCompartido = function(ok){ if (ok === false) toast("No se encontró WhatsApp; elige otra app"); };
function descargar(blob, name){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
async function guardarPdf(){
  fijarEstiloOt();
  busy(true, "Creando PDF…");
  try {
    if (!window.jspdf) await new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "lib/jspdf.umd.min.js"; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
    const { jsPDF } = window.jspdf; let doc = null;
    for (const P of PAGES.filter(P => P.isPauta)){
      const c = await renderPageImage(P, 2.4);
      if (!doc) doc = new jsPDF({ unit:"pt", format:[P.w,P.h], orientation: P.w > P.h ? "l" : "p" }); else doc.addPage([P.w,P.h], P.w > P.h ? "l" : "p");
      doc.addImage(c.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, P.w, P.h); await ceder();
    }
    for (const o of OUTS.filter(o => o.foto)){
      const w = 612, h = Math.round(o.canvas.height * 612 / o.canvas.width);
      doc.addPage([w, h], h > w ? "p" : "l"); doc.addImage(o.canvas.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, w, h);
    }
    const blob = doc.output("blob"), name = `Pauta_OT${S.ot||""}.pdf`;
    if (NATIVO) Android.guardar(name, await blobToB64(blob), "application/pdf"); else descargar(blob, name);
  } catch(e){ console.error(e); toast("No se pudo crear el PDF"); }
  busy(false);
}
window.onGuardado = function(ok){ toast(ok ? "PDF guardado" : "No se guardó el PDF"); };

/* ================= HOJAS / FIRMA ================= */
function sheet(html){
  $("#sheetRoot").innerHTML = `<div class="sheet-bg"><div class="sheet">${html}</div></div>`;
  $$("[data-close]", $("#sheetRoot")).forEach(b => b.onclick = closeSheet);
  $(".sheet-bg").addEventListener("click", e => { if (e.target.classList.contains("sheet-bg")) closeSheet(); });
}
function closeSheet(){ $("#sheetRoot").innerHTML = ""; }
function openText(title, val, cb){
  sheet(`<div class="grab"></div><h3>${esc(title)}</h3><textarea id="tT">${esc(val)}</textarea><button class="btn pri big" id="tOk">Aceptar</button><button class="btn big" data-close>Cancelar</button>`);
  setTimeout(() => $("#tT").focus(), 80);
  $("#tOk").onclick = () => { const v = $("#tT").value; closeSheet(); cb(v); };
}
function openSignature(cb){
  sheet(`<div class="grab"></div><h3>Firma</h3><div style="font-size:13px;color:var(--muted)">Firma con el dedo dentro del recuadro.</div>
    <canvas class="pad" id="pad"></canvas>
    <div class="grid2"><button class="btn" id="padClr">Limpiar</button><button class="btn pri" id="padOk">Usar firma</button></div>`);
  const c = $("#pad"), dpr = Math.max(1, window.devicePixelRatio || 1), r = c.getBoundingClientRect();
  c.width = r.width*dpr; c.height = r.height*dpr;
  const ctx = c.getContext("2d"); ctx.scale(dpr,dpr); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = COLOR.ink; ctx.lineWidth = 2.6;
  let drawing = false, last = null, any = false;
  const pos = e => { const b = c.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  c.addEventListener("pointerdown", e => { drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, 7); ctx.fillStyle = COLOR.ink; ctx.fill(); any = true; });
  c.addEventListener("pointermove", e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last = p; });
  const end = () => drawing = false; c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  $("#padClr").onclick = () => { ctx.clearRect(0,0,c.width,c.height); any = false; };
  $("#padOk").onclick = () => { if (!any){ toast("Dibuja la firma primero"); return; } const url = trimCanvas(c); closeSheet(); cb(url); };
}
function trimCanvas(c){
  const ctx = c.getContext("2d"), w = c.width, h = c.height, d = ctx.getImageData(0,0,w,h).data;
  let x0=w, y0=h, x1=0, y1=0;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (d[(y*w+x)*4+3] > 10){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  const pad = 6; x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad); x1=Math.min(w-1,x1+pad); y1=Math.min(h-1,y1+pad);
  const o = document.createElement("canvas"); o.width = x1-x0+1; o.height = y1-y0+1;
  o.getContext("2d").drawImage(c, x0,y0,o.width,o.height, 0,0,o.width,o.height);
  return o.toDataURL("image/png");
}
function getImg(url){ if (imgCache.has(url)) return imgCache.get(url); const im = new Image(); im.onload = () => redrawOverlays(); im.src = url; imgCache.set(url, im); return im; }
function loadImg(url){ return new Promise(res => { const im = getImg(url); if (im.complete && im.naturalWidth) res(im); else { im.addEventListener("load", () => res(im), {once:true}); im.addEventListener("error", () => res(null), {once:true}); } }); }

/* ================= DOCUMENTO ================= */
let tool = "auto", zoom = 1;
const views = [];
$("#btnDoc").onclick = () => { show("scr-doc"); $("#toolHint").textContent = HINTS[tool]; renderPages(); };
async function renderPages(){
  const host = $("#pages"); host.innerHTML = ""; views.length = 0;
  const avail = (host.clientWidth || window.innerWidth) - 16, dpr = Math.max(1, window.devicePixelRatio || 1);
  for (const P of PAGES){
    if (!P.isPauta) continue;
    const s = avail / P.w * zoom;
    const wrap = document.createElement("div"); wrap.className = "pg"; wrap.style.width = P.w*s + "px"; wrap.style.height = P.h*s + "px";
    const base = document.createElement("canvas"), over = document.createElement("canvas");
    const pr = Math.min(dpr, 2400/(P.w*s));
    [base, over].forEach(c => { c.width = Math.round(P.w*s*pr); c.height = Math.round(P.h*s*pr); c.style.width = P.w*s+"px"; c.style.height = P.h*s+"px"; });
    wrap.append(base, over); host.appendChild(wrap);
    const v = { P, wrap, base, over, s, pr }; views.push(v);
    over.addEventListener("click", e => onDocTap(v, e));
    await P.page.render({ canvasContext: base.getContext("2d"), viewport: P.page.getViewport({scale: s*pr}) }).promise;
    drawOverlay(v);
  }
}
function drawOverlay(v){ const ctx = v.over.getContext("2d"); ctx.clearRect(0,0,v.over.width,v.over.height); drawAnnotations(ctx, v.P, v.s*v.pr, tool === "auto"); }
function redrawOverlays(){ if (!$("#scr-doc").classList.contains("hidden")) views.forEach(drawOverlay); }
function onDocTap(v, e){
  const b = v.over.getBoundingClientRect(), x = (e.clientX - b.left) / v.s, y = (e.clientY - b.top) / v.s, P = v.P;
  if (tool === "auto"){
    if (P.checklist) for (const r of P.checklist.rows){ const h = Math.min(r.bottom-r.top, 40); if (Math.abs(y-r.y) > h/2) continue;
      const key = P.n+"-"+(r.key||r.item), cl = P.checklist;
      if (cl.mode === "ok"){
        if (x >= cl.okc.l && x <= cl.okc.r){ const c = S.checks[key] || {}; setCheck(key, "estado", c.estado === "SD" ? "NR" : c.estado === "NR" ? "NR" : "SD"); return; }
        if (x >= cl.obc.l && x <= cl.obc.r){ setCheck(key, "estado", "CD"); return; }
        continue;
      }
      for (const col of cl.cols){ if (x >= col.l && x <= col.r){ setCheck(key, col.g, col.k); return; } } }
    if (P.epp) for (const r of P.epp.rows){ if (Math.abs(x-r.x) <= r.w/2 && Math.abs(y-r.y) <= r.h/2+0.5){ const k = P.n+"-"+r.key; if (S.epp[k]) delete S.epp[k]; else S.epp[k] = true; changed(); return; } }
    if (P.interv) for (const it of P.interv) for (const o of it.opts){ if (Math.abs(x - o.x) < 9 && Math.abs(y - o.y) < 6){ S.interv = S.interv || {}; const k = P.n+"-"+it.key; S.interv[k] = S.interv[k] === o.k ? null : o.k; changed(); return; } }
    if (P.boxes) for (const r of P.boxes.rows){ if (Math.abs(x-r.x) <= r.w/2 + 2 && Math.abs(y-r.y) <= r.h/2 + 1){ const k = P.n+"-"+r.key; if (S.boxes[k]) delete S.boxes[k]; else S.boxes[k] = true; changed(); return; } }
    if (P.obs && y > P.obs.top && y < P.obs.bottom && x > P.obs.itemL && x < P.obs.textR){ editObs(-1); return; }
    toast("Usa ✓, ✗, Texto o Firma para marcar fuera de las casillas"); return;
  }
  if (tool === "check" || tool === "x"){ S.free.push({ page:P.n, type:tool, x, y, size:10 }); changed(); }
  else if (tool === "text") openText("Texto a escribir", "", val => { if (val.trim()){ S.free.push({ page:P.n, type:"text", x, y, size:8, text:val }); changed(); } });
  else if (tool === "sig") openSignature(url => { S.free.push({ page:P.n, type:"sig", x, y, w:90, sig:url }); changed(); });
  else if (tool === "erase"){
    let best = -1, d = 1e9;
    S.free.forEach((a,i) => { if (a.page !== P.n) return; const dd = Math.hypot(a.x-x, a.y-y) - (a.type==="sig" ? a.w/2 : 0); if (dd < d){ d = dd; best = i; } });
    if (best >= 0 && d < 14){ S.free.splice(best,1); changed(); } else toast("No hay una marca libre ahí");
  }
}
const HINTS = { auto:"Toca una casilla punteada para marcarla o desmarcarla.", check:"Toca donde quieras poner un ✓.", x:"Toca donde quieras poner una ✗.", text:"Toca donde quieras escribir.", sig:"Toca donde va la firma.", erase:"Toca una marca libre para borrarla." };
$$("#toolbar [data-tool]").forEach(b => b.onclick = () => { tool = b.dataset.tool; $$("#toolbar [data-tool]").forEach(x => x.classList.toggle("on", x === b)); $("#toolHint").textContent = HINTS[tool]; views.forEach(drawOverlay); });
$("#undoBtn").onclick = () => { if (!undoStack.length){ toast("Nada que deshacer"); return; } S = JSON.parse(undoStack.pop()); changed(false); };
$("#zoomIn").onclick = () => { zoom = Math.min(3, zoom*1.35); renderPages(); };
$("#zoomOut").onclick = () => { zoom = Math.max(1, zoom/1.35); renderPages(); };

/* ================= AJUSTES ================= */
function renderSettings(){
  $("#setBody").innerHTML = `
    <div class="card"><b style="font-size:15px">Mis datos</b>
      <label class="f">Nombre y apellido</label><input type="text" id="sN" value="${esc(perfil.nombre)}">
      <label class="f">Cargo</label><input type="text" id="sC" value="${esc(perfil.cargo)}">
      <label class="f">Mi firma</label>
      <button class="sigbox" id="sF" style="margin-top:0">${perfil.firma ? `<img src="${perfil.firma}" alt="Firma">` : '<span class="ph">Toca para firmar</span>'}</button></div>
    <div class="card"><b style="font-size:15px">Defectos frecuentes</b>
      <textarea id="sD" style="min-height:170px;margin-top:10px">${esc(perfil.defectos.join("\n"))}</textarea></div>
    <div class="card"><b style="font-size:15px">Al marcar "Sin defecto", Subsecuente o Corrección queda en</b>
      <div class="seg three" style="margin-top:10px">${[["NA","N/A"],["NO","No"],["","Vacío"]].map(([k,l]) => `<button class="ok ${perfil.subDefault===k?"on":""}" data-sd="${k}">${l}</button>`).join("")}</div></div>
    ${htmlEstilo()}
    <div class="card"><b style="font-size:15px">Términos de uso</b>
      <div style="font-size:12.5px;color:var(--muted);margin:4px 0 8px">${terminosOk() ? `Aceptados por ${esc(perfil.terminos.nombre)} el ${esc(perfil.terminos.fecha)}.` : "Sin aceptar."}</div>
      <button class="btn outline" id="sT" style="width:100%">Ver términos de uso</button>
      <button class="btn outline" id="sNov" style="width:100%;margin-top:8px">Novedades por versión</button></div>
    <div class="card"><b style="font-size:15px">Actualizaciones</b>
      <div style="font-size:13.5px;margin:4px 0 8px" id="updEstado">Tienes la ${VERSION_APP}.</div>
      <button class="btn outline" id="sUpd" style="width:100%">Buscar actualización</button></div>
    <div class="ver">Pautas OT · ${VERSION_APP}</div>`;
  $("#sUpd").onclick = () => buscarActualizacion(true);
  $("#sT").onclick = () => renderTerminos(true);
  enlazarEstilo();
  $("#sNov").onclick = () => mostrarNovedades(true);
  $("#sN").oninput = e => { perfil.nombre = e.target.value.trim(); guardarPerfil(); };
  $("#sC").oninput = e => { perfil.cargo = e.target.value.trim(); guardarPerfil(); };
  $("#sF").onclick = () => openSignature(url => { perfil.firma = url; guardarPerfil(); renderSettings(); });
  $("#sD").oninput = e => { perfil.defectos = e.target.value.split("\n").map(s=>s.trim()).filter(Boolean); guardarPerfil(); };
  $$("[data-sd]").forEach(b => b.onclick = () => { perfil.subDefault = b.dataset.sd; guardarPerfil(); renderSettings(); });
}


/* ================= NOVEDADES POR VERSIÓN ================= */
/* La primera entrada es la versión actual: se muestra una vez al abrir la app tras actualizar. */
const NOVEDADES = [
  { v: "Ver. 1.30", fecha: "09-11-2026", items: [
    "Se agrega la búsqueda de actualizaciones: la app avisa cuando hay una versión nueva y se instala desde el aviso. También en Ajustes → Buscar actualización.",
    "Para revisar si hay versión nueva, la app consulta la página de la app en GitHub. No envía ningún dato.",
    "El estilo de visto ✓ parte en Parejo.",
    "Se quitan textos de ayuda de Ajustes y de la bandeja." ] },
  { v: "Ver. 1.29", fecha: "08-11-2026", items: [
    "Se agrega en Ajustes el estilo de los vistos y X: Parejo, Natural o Máximo, con controles de posición, giro, tamaño y forma del trazo, y vista previa.",
    "Al enviar una OT se guarda el estilo usado: si la reenvías, la imagen sale igual aunque cambies los Ajustes.",
    "Al actualizar se muestran todas las novedades desde la versión que tenías instalada." ] },
  { v: "Ver. 1.28", fecha: "08-11-2026", items: [
    "Se agrega variabilidad a los vistos y X: posición dentro de la casilla, rotación, tamaño e intensidad de trazo, para que se vean hechos a mano.",
    "Se agrega variación en la inclinación de la firma.",
    "Se agrega aviso de novedades al actualizar la app. El historial queda en Ajustes → Novedades por versión." ] },
  { v: "Ver. 1.27", fecha: "08-11-2026", items: [
    "Visto y X estilo bolígrafo.",
    "Todo lo escrito sobre la hoja va en negro suave, como lápiz pasta.",
    "Firma más grande: sobresale 40 % arriba y abajo de la casilla." ] },
  { v: "Ver. 1.26", fecha: "08-11-2026", items: [
    "Términos de uso al abrir la app por primera vez. Tu nombre queda como nombre de firma." ] },
  { v: "Ver. 1.25", fecha: "08-11-2026", items: [
    "Mejor lectura de pautas: columnas Si/No, PM03, grillas de casillas y tablas que siguen en otra hoja." ] }
];
function htmlNovedad(n){ return `<div class="nov"><div class="row-sb"><b>${esc(n.v)}</b><span style="font-size:12px;color:var(--muted)">${esc(n.fecha)}</span></div><ul class="terms">${n.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`; }
const numVer = v => { const m = String(v||"").match(/(\d+)\.(\d+)/); return m ? +m[1]*1000 + +m[2] : 0; };
function novedadesDesde(previa){
  const b = numVer(previa); const l = NOVEDADES.filter(n => numVer(n.v) > b);
  return l.length ? l : NOVEDADES.slice(0, 1);
}
function mostrarNovedades(todas){
  const previa = perfil.ultimaVer || (perfil.terminos && perfil.terminos.app) || "";
  const lista = todas ? NOVEDADES : novedadesDesde(previa);
  const titulo = todas ? "Novedades por versión" : lista.length > 1 ? `Novedades desde la ${esc(previa)}` : "Novedades de la " + esc(VERSION_APP);
  sheet(`<div class="grab"></div><div class="kick">${todas ? "Historial" : "App actualizada a la " + esc(VERSION_APP)}</div><h3>${titulo}</h3>
    <div style="max-height:56vh;overflow:auto;margin:6px 0 12px">${lista.map(htmlNovedad).join("")}</div>
    <button class="btn pri big" data-close>Entendido</button>`);
  perfil.ultimaVer = VERSION_APP; guardarPerfil();
}
function revisarNovedades(){ if (terminosOk() && perfil.ultimaVer !== VERSION_APP) setTimeout(() => mostrarNovedades(false), 400); }

/* ================= ESTILO DE VISTOS ================= */
const ESTILOS = { parejo: {pos:0,rot:0,tam:0,trazo:0}, natural: {pos:55,rot:40,tam:60,trazo:65}, maximo: {pos:100,rot:100,tam:100,trazo:100} };
if (!perfil.estilo || !perfil.estiloV){ perfil.estilo = Object.assign({}, ESTILOS.parejo); perfil.estiloV = 1; guardarPerfil(); }
function fijarEstiloOt(){ if (S && !S.estilo){ S.estilo = Object.assign({}, perfil.estilo); persist(); } }
function presetDe(e){ return Object.keys(ESTILOS).find(k => ["pos","rot","tam","trazo"].every(c => ESTILOS[k][c] === e[c])) || ""; }
let muestraSemilla = "muestra";
function dibujarMuestra(){
  const c = $("#estPrev"); if (!c) return; const dpr = Math.max(1, window.devicePixelRatio || 1), W = c.clientWidth, H = 92;
  c.width = W*dpr; c.height = H*dpr; const g = c.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#fff"; g.fillRect(0,0,W,H);
  const cols = 6, cw = W/cols, rh = H/2; g.strokeStyle = "#bfc6c8"; g.lineWidth = 1;
  for (let r=0;r<2;r++) for (let k=0;k<cols;k++) g.strokeRect(k*cw+0.5, r*rh+0.5, cw-1, rh-1);
  OT_SEMILLA = muestraSemilla; fijarEstilo(perfil.estilo);
  for (let r=0;r<2;r++) for (let k=0;k<cols;k++) drawCheck(g, k*cw + cw/2, r*rh + rh/2, 22, COLOR.ink);
}
function htmlEstilo(){
  const e = perfil.estilo, pr = presetDe(e);
  const fila = (k, l, txt) => `<div class="sl"><label for="es_${k}">${l}</label><input type="range" id="es_${k}" min="0" max="100" step="5" value="${e[k]}"><output id="eo_${k}">${txt}</output></div>`;
  return `<div class="card"><b style="font-size:15px;margin-bottom:10px;display:block">Estilo de visto ✓</b>
    <div class="seg three" id="estSeg">${[["parejo","Parejo"],["natural","Natural"],["maximo","Máximo"]].map(([k,l]) => `<button class="ok ${pr===k?"on":""}" data-est="${k}">${l}</button>`).join("")}</div>
    <div style="margin-top:10px">${fila("pos","Posición",Math.round(e.pos*0.22)+" %")}${fila("rot","Giro",Math.round(e.rot*0.18)+"°")}${fila("tam","Tamaño","± "+Math.round(e.tam*0.25)+" %")}${fila("trazo","Forma del trazo",["Igual","Leve","Media","Fuerte"][Math.min(3,Math.round(e.trazo/100*3))])}</div>
    <canvas id="estPrev" style="width:100%;height:92px;border:1px solid #bfc6c8;border-radius:8px;margin-top:8px;display:block"></canvas>
    <div class="row-sb" style="margin-top:8px"><span style="font-size:12px;color:var(--muted)">Vista previa</span><button class="btn sm outline" id="estOtra">Otra muestra</button></div></div>`;
}
function enlazarEstilo(){
  $$("[data-est]").forEach(b => b.onclick = () => { perfil.estilo = Object.assign({}, ESTILOS[b.dataset.est]); guardarPerfil(); renderSettings(); });
  ["pos","rot","tam","trazo"].forEach(k => { const i = $("#es_"+k); i.oninput = () => {
    perfil.estilo[k] = +i.value; guardarPerfil(); const e = perfil.estilo;
    $("#eo_pos").textContent = Math.round(e.pos*0.22)+" %"; $("#eo_rot").textContent = Math.round(e.rot*0.18)+"°"; $("#eo_tam").textContent = "± "+Math.round(e.tam*0.25)+" %";
    $("#eo_trazo").textContent = ["Igual","Leve","Media","Fuerte"][Math.min(3,Math.round(e.trazo/100*3))];
    const pr = presetDe(e); $$("[data-est]").forEach(b => b.classList.toggle("on", b.dataset.est === pr)); dibujarMuestra(); }; });
  $("#estOtra").onclick = () => { muestraSemilla = "m" + Math.random(); dibujarMuestra(); };
  requestAnimationFrame(dibujarMuestra);
}

/* ================= ACTUALIZACIONES ================= */
/* Android: lee version.json del sitio en GitHub; si hay una versión mayor, ofrece bajar e instalar la APK.
   Web (iPhone): el service worker trae la versión nueva; se ofrece recargar. */
let updManual = false, swNuevo = false;
function estadoUpd(t){ const e = $("#updEstado"); if (e) e.textContent = t; }
function buscarActualizacion(manual){
  updManual = !!manual;
  if (NATIVO){
    if (!manual){ const h = Date.now(), u = +(localStorage.getItem("updVisto") || 0); if (h - u < 20*3600*1000) return; localStorage.setItem("updVisto", String(h)); }
    if (manual) estadoUpd("Buscando…");
    try { Android.revisarVersion(URL_SITIO + "version.json"); } catch(e){ if (manual) estadoUpd("Esta APK no puede buscar actualizaciones."); }
  } else if ("serviceWorker" in navigator){
    if (manual) estadoUpd("Buscando…");
    navigator.serviceWorker.getRegistration().then(r => r ? r.update() : null).then(() => setTimeout(() => {
      if (swNuevo) ofrecerRecarga(); else if (updManual) estadoUpd(`Tienes la última versión (${VERSION_APP}).`);
    }, 2500)).catch(() => { if (updManual) estadoUpd("Sin conexión. Intenta más tarde."); });
  }
}
window.onVersion = function(txt){
  if (!txt){ if (updManual) estadoUpd("Sin conexión. Intenta más tarde."); return; }
  let d; try { d = JSON.parse(txt); } catch(e){ if (updManual) estadoUpd("No se pudo leer la versión publicada."); return; }
  if (numVer(d.version) > numVer(VERSION_APP)){
    estadoUpd(`Hay una versión nueva: Ver. ${d.version}.`);
    const notas = (d.notas || []).map(n => `<li>${esc(n)}</li>`).join("");
    sheet(`<div class="grab"></div><div class="kick">Actualización disponible</div><h3>Hay una versión nueva: Ver. ${esc(d.version)}</h3>
      ${notas ? `<ul class="terms" style="margin:0 0 6px">${notas}</ul>` : ""}
      <div id="updProg" style="display:none"><div style="height:8px;border-radius:4px;background:#E3EAEC;overflow:hidden"><div id="updBar" style="height:8px;width:0;background:var(--pri)"></div></div>
        <div id="updTxt" style="font-size:12.5px;color:var(--muted);margin-top:6px">Descargando…</div></div>
      <button class="btn pri big" id="updOk">Actualizar</button><button class="btn outline" data-close>Más tarde</button>`);
    $("#updOk").onclick = () => { $("#updOk").disabled = true; $("#updProg").style.display = "block"; Android.descargarApk(URL_SITIO + d.apk); };
  } else if (updManual) estadoUpd(`Tienes la última versión (${VERSION_APP}).`);
};
window.onDescarga = function(p){
  const bar = $("#updBar"), t = $("#updTxt");
  if (p === -2){ if (t) t.textContent = "No se pudo descargar. Revisa la conexión e intenta de nuevo."; const b = $("#updOk"); if (b) b.disabled = false; return; }
  if (bar && p >= 0) bar.style.width = p + "%";
  if (t) t.textContent = p >= 100 ? "Listo. Confirma la instalación en la ventana de Android." : p >= 0 ? `Descargando… ${p} %` : "Descargando…";
};
function ofrecerRecarga(){
  estadoUpd("Hay una versión nueva lista.");
  sheet(`<div class="grab"></div><div class="kick">Actualización disponible</div><h3>Hay una versión nueva de la app</h3>
    <button class="btn pri big" id="updRec">Actualizar ahora</button><button class="btn outline" data-close>Más tarde</button>`);
  $("#updRec").onclick = () => location.reload();
}
if (!NATIVO && "serviceWorker" in navigator){
  navigator.serviceWorker.getRegistration().then(r => { if (!r) return;
    const vigilar = w => w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller){ swNuevo = true; ofrecerRecarga(); } });
    if (r.waiting && navigator.serviceWorker.controller){ swNuevo = true; }
    vigilar(r.installing); r.addEventListener("updatefound", () => vigilar(r.installing));
  });
}

/* ================= TÉRMINOS DE USO ================= */
const CREADOR = "Sebastián Padilla – Mantenedor instrumentista – Instrumentación";
const CONTACTO = "padilla107@gmail.com · +56 9 8619 2183";
function terminosOk(){ return !!(perfil.terminos && perfil.terminos.v >= TERMINOS_VER); }
function hoyTxt(){ const d = new Date(), z = n => String(n).padStart(2,"0"); return `${z(d.getDate())}-${z(d.getMonth()+1)}-${d.getFullYear()}`; }
function textoTerminos(){
  const sec = (t, items) => `<div class="card"><b style="font-size:15px;color:var(--pri-dk)">${t}</b><ul class="terms">${items.map(i => `<li>${i}</li>`).join("")}</ul></div>`;
  return `
    <div class="card"><div style="font-size:13.5px;line-height:1.45">Aplicación <b>Pautas OT ${VERSION_APP} (beta)</b>, ${NATIVO ? "para Android" : "versión web para iPhone"}.<br>
      Creador y responsable: <b>${CREADOR}</b>.<br>Contacto: ${CONTACTO}.<br>
      Es una iniciativa personal del creador. No es un sistema oficial de la empresa ni reemplaza a SAP ni a los procedimientos vigentes.</div></div>
    ${sec("1. Propósito", [
      "Automatizar el llenado de las pautas de mantenimiento de las OT: marcar, anotar observaciones, firmar y enviar por WhatsApp.",
      "Uso gratuito y sin fines de lucro. Sin publicidad.",
      "Versión de prueba: puede tener errores o cambiar.",
      "Cada actualización muestra sus novedades al abrir la app. Si cambian estos términos, se vuelven a pedir.",
      "El uso es voluntario."])}
    ${sec("2. Datos personales", [
      "La aplicación no recopila datos personales ni los envía a servidores del creador ni de terceros.",
      "No tiene base de datos de usuarios, no pide cuenta ni contraseña y no usa seguimiento ni estadísticas.",
      "Tu nombre, tu firma y el avance de cada OT se guardan solo en este teléfono. El creador no tiene acceso a ellos.",
      "Las imágenes y PDF solo salen del teléfono cuando tú decides compartirlos.",
      "Al desinstalar la aplicación se borra todo lo guardado."])}
    ${sec("3. Permisos", [
      "Archivos: abrir el PDF de la OT y guardar el resultado.",
      "Cámara: fotos de hallazgos.",
      "Micrófono: dictar observaciones con el servicio de voz del teléfono (Google).",
      "Compartir: enviar por WhatsApp u otra aplicación. Esos servicios tienen sus propias políticas.",
      "Internet: solo para revisar si hay una versión nueva en la página de la app. No se envía ningún dato."])}
    ${sec("4. Responsabilidades", [
      "Revisa que la pauta esté correcta antes de enviarla. La aplicación ayuda a marcar, pero no valida el trabajo.",
      "Las OT y pautas son documentos internos: compártelas solo por los canales autorizados.",
      "No reemplaza procedimientos de seguridad, permisos de trabajo ni instrucciones de la supervisión.",
      "No distribuyas la aplicación fuera del grupo de prueba sin autorización del creador.",
      "Informa los errores al creador indicando el número de OT.",
      "Se entrega tal como está, sin garantía. Puedes dejar de usarla desinstalándola."])}`;
}
function renderTerminos(soloVer){
  show("scr-terms");
  $("#verPill2").textContent = VERSION_APP.toUpperCase();
  $("#scr-terms .sub").textContent = soloVer ? "Pautas OT" : "Bienvenido";
  const ok = terminosOk();
  if (soloVer && ok){
    $("#termsBody").innerHTML = textoTerminos() + `<div class="card" style="font-size:13.5px">Aceptados por <b>${esc(perfil.terminos.nombre)}</b>${perfil.terminos.cargo ? " ("+esc(perfil.terminos.cargo)+")" : ""} el <b>${esc(perfil.terminos.fecha)}</b>, en la ${esc(perfil.terminos.app)}.</div>`;
    $("#termsFoot").innerHTML = `<button class="btn pri big" id="tVolver">Volver a Ajustes</button>`;
    $("#tVolver").onclick = () => { show("scr-set"); renderSettings(); };
    $("#termsBody").scrollTop = 0; return;
  }
  $("#termsBody").innerHTML = textoTerminos() + `
    <div class="card"><b style="font-size:15px">Tus datos</b>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px">Quedan como tu nombre de firma en cada OT. Se guardan solo en este teléfono.</div>
      <label class="f">Nombre y apellido</label><input type="text" id="tN" value="${esc(perfil.nombre)}" autocomplete="name">
      <label class="f">Cargo</label><input type="text" id="tC" value="${esc(perfil.cargo)}">
      <label class="acepto"><input type="checkbox" id="tA"> Leí los términos de uso y los acepto.</label>
      <div style="font-size:12.5px;color:var(--muted)">Fecha de aceptación: ${hoyTxt()}</div></div>`;
  $("#termsFoot").innerHTML = `<button class="btn pri big" id="tOk" disabled>Aceptar y comenzar</button>`;
  const val = () => { $("#tOk").disabled = !($("#tN").value.trim().length >= 3 && $("#tA").checked); };
  $("#tN").oninput = val; $("#tA").onchange = val; val();
  $("#tOk").onclick = () => {
    perfil.nombre = $("#tN").value.trim(); perfil.cargo = $("#tC").value.trim();
    perfil.terminos = { v: TERMINOS_VER, nombre: perfil.nombre, cargo: perfil.cargo, fecha: hoyTxt(), app: VERSION_APP };
    perfil.ultimaVer = VERSION_APP;
    guardarPerfil(); goHome(); toast("¡Listo, " + perfil.nombre.split(" ")[0] + "!");
  };
  $("#termsBody").scrollTop = 0;
}

/* ================= INICIO ================= */
(async () => { if (!NATIVO){ await IDB.cargar(); } if (terminosOk()){ goHome(); revisarNovedades(); setTimeout(() => buscarActualizacion(false), 1500); } else renderTerminos(false); })();
if (NATIVO){ try { const pend = JSON.parse(Android.paginaLista() || "[]"); if (pend.length) window.onOtRecibida(pend); } catch(e){} }
window.__app = { get S(){return S;}, get PAGES(){return PAGES;}, get OUTS(){return OUTS;}, openOt, memFiles, changed };
window.renderPageImageT = renderPageImage;
