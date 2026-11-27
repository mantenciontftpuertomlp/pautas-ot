"use strict";
/* Pautas OT — interfaz de la app (Ver. 1.25) */
const VERSION_APP = "Ver. 1.32";
const URL_SITIO = "https://mantenciontftpuertomlp.github.io/pautas-ot/";
const TERMINOS_VER = 3; // 2: internet para buscar actualizaciones (Ver. 1.30) · 3: biblioteca de pautas y manejo de la información

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
  abrir(){ return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open("pautasot", 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("ots")) d.createObjectStore("ots"); if (!d.objectStoreNames.contains("bib")) d.createObjectStore("bib"); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async op(modo, fn){ const db = await this.abrir(); return new Promise((res, rej) => { const tx = db.transaction("ots", modo), st = tx.objectStore("ots"), q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); },
  poner(n, v){ return this.op("readwrite", st => st.put(v, n)).catch(() => toast("No se pudo guardar la OT en el teléfono")); },
  quitar(n){ return this.op("readwrite", st => st.delete(n)).catch(() => {}); },
  async bib(modo, fn){ const db = await this.abrir(); return new Promise((res, rej) => { const tx = db.transaction("bib", modo), st = tx.objectStore("bib"), q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); },
  bibPoner(k, v){ return this.bib("readwrite", st => st.put(v, k)); },
  bibLeer(k){ return this.bib("readonly", st => st.get(k)); },
  bibQuitar(pref){ return this.bib("readwrite", st => st.delete(IDBKeyRange.bound(pref, pref + "\uffff"))).catch(() => {}); },
  async cargar(){ try { const db = await this.abrir(); await new Promise(res => { const tx = db.transaction("ots"), st = tx.objectStore("ots"), c = st.openCursor(); c.onsuccess = () => { const k = c.result; if (k){ memFiles[k.key] = k.value; k.continue(); } else res(); }; c.onerror = () => res(); }); } catch(e){} }
};
/* elegir de dónde viene la foto: cámara o galería */
function pedirFoto(cb, volver, conEtiqueta){
  sheet(`<div class="grab"></div><h3>Agregar foto</h3>
    <button class="btn big pri" id="pfCam"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Tomar foto</button>
    <button class="btn big" id="pfGal"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>Elegir de la galería</button>
    <button class="btn big" id="pfNo">Cancelar</button>`);
  const fin = () => { if (volver) volver(); else closeSheet(); };
  // después de sacar o elegir la foto se abre el editor: marcarla o guardarla tal cual
  const etq = conEtiqueta ? { def: false, obs: "" } : null;
  window.__foto = url => editarFoto(url, async b => { await cb(b, etq); }, () => { if (volver) volver(); else closeSheet(); }, true, etq);
  $("#pfCam").onclick = () => { fin(); if (NATIVO) Android.foto("f"); else fotoWeb(true); };
  $("#pfGal").onclick = () => { fin(); if (NATIVO) Android.fotoGaleria("f"); else fotoWeb(false); };
  $("#pfNo").onclick = fin;
}
async function fotoWeb(camara = true){
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; if (camara) i.setAttribute("capture", "environment");
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
let PAGES_ALL = [], GRUPOS = [], ACTIVO = 0, SDCOLS = []; // varias pautas en una OT (inspección, mantención…)
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
  if (META.grupos && META.grupos.length > 1){
    if (ACTIVO != null && META.grupos[ACTIVO]){ const G = META.grupos[ACTIVO]; G.done = p.done; G.total = p.total; if (G.estado !== "enviada") G.estado = p.tocado ? "curso" : "pendiente"; }
    const est = META.grupos.map(G => G.estado);
    META.estado = est.every(e => e === "enviada") ? "enviada" : est.some(e => e !== "pendiente") ? "curso" : "pendiente";
    META.done = META.grupos.reduce((a,G) => a + (G.done||0), 0); META.total = META.grupos.reduce((a,G) => a + (G.total||0), 0);
  }
  LS.set(metaKey(FILE), META);
}
function progreso(){
  const rows = allRows(); let done = 0;
  rows.forEach(({p, key}) => { const c = S.checks[key]; if (c && c.estado && (c.sub || !subCols(p).length)) done++; });
  const tocado = rows.some(({key}) => S.checks[key]) || allEpp().some(({key}) => S.epp[key]) || allBoxes().some(({key}) => (S.boxes||{})[key]) || S.free.some(a => PAGES.some(P => P.n === a.page));
  return { done, total: rows.length, tocado };
}

/* ---------- navegación ---------- */
function show(id){ $$(".scr").forEach(s => s.classList.toggle("hidden", s.id !== id)); }
window.atras = function(){
  if (VISOR){ cerrarVisor(); return true; }
  if ($("#sheetRoot").firstChild){ closeSheet(); return true; }
  if (!$("#busy").classList.contains("hidden")) return true;
  if (!$("#scr-doc").classList.contains("hidden")){ show("scr-ot"); renderStep(); return true; }
  if (!$("#scr-ot").classList.contains("hidden")){
    if (ACTIVO != null && step > 0){ step--; renderStep(); }
    else if (ACTIVO != null && GRUPOS.length > 1){ persist(); ACTIVO = null; renderSelector(); }
    else { persist(); goHome(); }
    return true; }
  if (!$("#scr-set").classList.contains("hidden")){ goHome(); return true; }
  if (!$("#scr-ver").classList.contains("hidden")){ cerrarVista(); show("scr-bib"); renderBib(); return true; }
  if (!$("#scr-bib").classList.contains("hidden")){ if (BIB.dir){ const P = BIB.dir.ruta; BIB.dir = P.includes(" / ") ? { fid: BIB.dir.fid, ruta: P.slice(0, P.lastIndexOf(" / ")) } : null; renderBib(); } else goHome(); return true; }
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
  PDF = null; FILE = null; S = null; META = null; PAGES_ALL = []; GRUPOS = []; ACTIVO = 0;
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
    const nEnv = m && m.grupos ? m.grupos.filter(G => G.estado === "enviada").length : 0;
    const pill = m && m.grupos && m.grupos.length > 3
      ? `<span class="pill ${nEnv === m.grupos.length ? "env" : nEnv || m.grupos.some(G => G.estado === "curso") ? "curso" : ""}">${nEnv} de ${m.grupos.length} pautas enviadas</span>`
      : m && m.grupos && m.grupos.length > 1
      ? `<span class="pills">${m.grupos.map(G => `<span class="pill ${G.estado==="enviada"?"env":G.estado==="curso"?"curso":""}">${esc((G.nombre || G.tipo || "pauta").replace(/^./, c => c.toUpperCase()))}${G.estado==="enviada"?" ✓":G.estado==="curso"&&G.total?` ${G.done}/${G.total}`:""}</span>`).join("")}</span>`
      : est === "enviada" ? `<span class="pill env">Enviada</span>` : est === "curso" ? `<span class="pill curso">En curso${m.total?` · ${m.done}/${m.total}`:""}</span>` : `<span class="pill">Pendiente</span>`;
    const title = m && (m.equipo || m.desc) ? (m.equipo || m.desc) : f.name.replace(/\.pdf$/i,"");
    const sub = m ? [m.equipo ? m.desc : "", m.fecha].filter(Boolean).join(" · ") : "Toca para abrir";
    const bar = est === "curso" && m.total ? `<div class="bar6"><i style="width:${Math.round(100*m.done/m.total)}%"></i></div>` : "";
    return `<div class="card" style="padding:0;display:flex">
      <button class="otc" data-open="${esc(f.name)}" style="border:0;background:transparent;padding:14px;flex:1">
        <div class="top"><span class="num">${m && m.ot ? "OT " + esc(m.ot) : m && m.sola ? "OT sin número" : "OT"}</span>${pill}</div>
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
    $("#mDel").onclick = () => { borrarFotosOt(name); N.borrar(name); LS.del(stKey(name)); LS.del(metaKey(name)); closeSheet(); renderHome(); };
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

/* ================= BIBLIOTECA DE PAUTAS ================= */
/* fuentes: carpeta del teléfono o enlace (carpeta pública de Google Drive, archivo de Drive o PDF directo).
   La lista se guarda para verla sin señal; el PDF se trae recién al tocar "Llenar" y queda en el teléfono. */
const NAT = { n: 0, esp: {} };
/* versión web (iPhone): lo mismo con fetch; solo funciona con la API de Drive (Google permite leerla desde la página) */
const NATW = {
  async bajar(url){ let r; try { r = await fetch(url); } catch(e){ throw new Error("Sin conexión o Drive no permitió la lectura"); }
    if (!r.ok){ let m = ""; try { m = (await r.json()).error.message; } catch(e){} throw new Error(r.status === 404 ? "No se encontró: revisa que esté compartido con cualquiera con el enlace" : "Drive: " + (m || "error " + r.status)); }
    return r; },
  async bibTexto(url){ return (await this.bajar(url)).text(); },
  async bytes(url){
    if (url.startsWith("idb:")){ const b = await IDB.bibLeer(url.slice(4)); if (!b) throw new Error("La pauta ya no está: vuelve a cargar el ZIP"); return new Uint8Array(await b.arrayBuffer()); }
    const u = new Uint8Array(await (await this.bajar(url)).arrayBuffer()); if (!(u[0]===37 && u[1]===80 && u[2]===68 && u[3]===70)) throw new Error("El archivo no es un PDF"); return u; },
  async bibVer(url){ const u = await this.bytes(url); NATW.vista = { url, u }; let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); },
  async bibTraer(url, nombre){ const u = NATW.vista && NATW.vista.url === url ? NATW.vista.u : await this.bytes(url);
    const d = new Date(), p = n => String(n).padStart(2, "0"), base = (nombre || "Pauta").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
    let n = `Bib_${base}_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pdf`, k = 2; while (memFiles[n]) n = n.replace(/(_\d+)?\.pdf$/, "_" + (k++) + ".pdf");
    const blob = new Blob([u], { type: "application/pdf" }); memFiles[n] = { b64: await blobToB64(blob), t: Date.now() }; await IDB.poner(n, memFiles[n]); return n; }
};
/* ZIP en la versión web: JSZip se carga solo cuando se necesita */
function cargarJSZip(){ return window.JSZip ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "lib/jszip.min.js"; sc.onload = res; sc.onerror = () => rej(new Error("No se pudo cargar el lector de ZIP")); document.head.appendChild(sc); }); }
NATW.bibZip = async function(files, bibId, reemplazar){
  await cargarJSZip();
  if (reemplazar) await IDB.bibQuitar(bibId + "/");
  const items = []; let otros = 0, n = Date.now();
  for (const file of files){
    let z; try { z = await JSZip.loadAsync(file); } catch(e){ throw new Error("No se pudo leer el ZIP " + file.name); }
    for (const e of Object.values(z.files)){
      const name = e.name.replace(/\\/g, "/"); if (e.dir || name.includes("__MACOSX")) continue;
      const base = name.split("/").pop(); if (!base || base.startsWith(".")) continue;
      if (!/\.pdf$/i.test(base)){ otros++; continue; }
      const k = bibId + "/" + (n++);
      await IDB.bibPoner(k, new Blob([await e.async("uint8array")], { type: "application/pdf" }));
      items.push({ nombre: base, ruta: name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "", ref: "idb:" + k });
    }
  }
  return JSON.stringify({ items, otros });
};
function nat(metodo, ...args){
  if (!NATIVO) return NATW[metodo] ? NATW[metodo](...args) : Promise.reject(new Error("No disponible en esta versión"));
  return new Promise((res, rej) => { const id = "r" + (++NAT.n); NAT.esp[id] = { res, rej }; try { Android[metodo](id, ...args); } catch(e){ delete NAT.esp[id]; rej(e); } }); }
/* llave de la API de Drive (restringida a la página de la app y solo a Drive) */
const DRIVE_KEY = "AIzaSyDC-9kxJPYyKu0AHPi2dHvkn3vdX7hADcg", DAPI = "https://www.googleapis.com/drive/v3/files";
async function listarDriveApi(id, ruta, nivel, out){
  let tok = "";
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
    const j = JSON.parse(await nat("bibTexto", `${DAPI}?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${DRIVE_KEY}${tok ? "&pageToken=" + tok : ""}`));
    for (const f of j.files || []){
      if (f.mimeType === "application/vnd.google-apps.folder"){ if (nivel < 3) await listarDriveApi(f.id, ruta ? ruta + " / " + f.name : f.name, nivel + 1, out); }
      else out.push({ nombre: f.name, ruta, ref: "drive:" + f.id, pdf: f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name) });
    }
    tok = j.nextPageToken || "";
  } while (tok);
}
window.onNat = function(id, ok, dato){ const p = NAT.esp[id]; if (!p) return; delete NAT.esp[id]; ok ? p.res(dato) : p.rej(new Error(dato || "error")); };
const BIB = { get fuentes(){ return LS.get("bib.fuentes", []); }, set fuentes(v){ LS.set("bib.fuentes", v); }, q: "", cargando: {} };
const driveId = u => { const m = u.match(/\/folders\/([\w-]{10,})/) || u.match(/\/file\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/); return m ? m[1] : ""; };
const driveTipo = u => /\/folders\/|embeddedfolderview|drive\/u\/\d+\/folders/.test(u) ? "carpeta" : /\/file\/d\/|[?&]id=/.test(u) && /google\./.test(u) ? "archivo" : "";
function desHtml(t){ const e = document.createElement("textarea"); e.innerHTML = t.replace(/<[^>]+>/g, ""); return e.value.trim(); }
function parseDrive(html){
  const out = [], re = /id="entry-([\w-]+)"[\s\S]*?href="([^"]+)"[\s\S]*?class="flip-entry-title"[^>]*>([\s\S]*?)<\/div>/g; let m;
  while ((m = re.exec(html))) out.push({ id: m[1], nombre: desHtml(m[3]), carpeta: /\/folders\//.test(m[2]) });
  return out;
}
async function listarDrive(id, ruta, nivel, out){
  const html = await nat("bibTexto", "https://drive.google.com/embeddedfolderview?id=" + id);
  if (!/flip-entry|flip-entries/.test(html)){ if (nivel === 0) throw new Error("La carpeta no es pública o el enlace no es válido"); return; }
  for (const e of parseDrive(html)){
    if (e.carpeta){ if (nivel < 2) await listarDrive(e.id, ruta ? ruta + " / " + e.nombre : e.nombre, nivel + 1, out); }
    else out.push({ nombre: e.nombre, ruta, ref: "drive:" + e.id, pdf: /\.pdf$/i.test(e.nombre) });
  }
}
async function refrescarFuente(f){
  BIB.cargando[f.id] = true; renderBib();
  try {
    let items = [];
    if (f.tipo === "carpeta") items = JSON.parse(await nat("bibCarpeta", f.ref)).map(x => Object.assign(x, { pdf: true }));
    else if (f.tipo === "drive"){
      try { await listarDriveApi(f.ref, "", 0, items); if (!items.length && NATIVO) await listarDrive(f.ref, "", 0, items = []); }
      catch(e){ if (!NATIVO) throw e; items = []; await listarDrive(f.ref, "", 0, items); }
    }
    else items = [{ nombre: f.nombre, ruta: "", ref: f.ref, pdf: true }];
    LS.set("bib.lista." + f.id, { t: Date.now(), items });
  } catch(e){ toast(e.message && e.message !== "error" ? e.message : "No se pudo leer la biblioteca", 4000); }
  delete BIB.cargando[f.id]; renderBib();
}
function abrirBib(){ BIB.dir = null; show("scr-bib"); renderBib(); BIB.fuentes.forEach(f => { const l = LS.get("bib.lista." + f.id, null); if (!l && f.tipo !== "zip") refrescarFuente(f); }); }
function renderBib(){
  const fs = BIB.fuentes, q = BIB.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!fs.length){
    $("#bibBody").innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5a2 2 0 0 1 2-2h4v18H6a2 2 0 0 1-2-2z"/><path d="M10 3h4v18h-4zM14 4l4-1 3 17-4 1z"/></svg>
      <div><b>Aún no hay bibliotecas</b></div><div style="font-size:14px;margin-top:6px">${NATIVO ? "Agrega una carpeta del teléfono o un archivo ZIP" : "Agrega un archivo ZIP"} con las pautas de trabajo en PDF (por ejemplo, la carpeta descargada desde Drive).</div></div>`;
    return;
  }
  const norm = t => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let html = `<input type="search" id="bibQ" placeholder="Buscar pauta…" value="${esc(BIB.q)}">`;
  fs.filter(f => q || !BIB.dir || BIB.dir.fid === f.id).forEach(f => {
    const l = LS.get("bib.lista." + f.id, null), items = l ? l.items.filter(x => x.pdf && (!q || norm(x.nombre + " " + x.ruta).includes(q))) : [];
    const noPdf = l ? l.items.filter(x => !x.pdf).length : 0;
    const tipo = f.tipo === "carpeta" ? "Carpeta del teléfono" : f.tipo === "zip" ? "Archivo ZIP" : f.tipo === "drive" ? "Google Drive" : "Enlace";
    html += `<div class="bib-src"><div class="hd"><div style="flex:1"><b>${esc(f.nombre)}</b><div class="m">${tipo}${l ? ` · ${(n => n + (n === 1 ? " pauta" : " pautas"))(l.items.filter(x=>x.pdf).length)} · actualizada ${new Date(l.t).toLocaleDateString("es-CL")}` : ""}</div></div>
      ${BIB.cargando[f.id] ? `<div class="spin dark" style="width:18px;height:18px"></div>` : `<button class="btn sm" data-bibup="${f.id}">Actualizar</button>`}
      <button class="icon-btn" data-bibmenu="${f.id}" aria-label="Opciones" style="color:var(--muted)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg></button></div>`;
    const it = x => `<div class="card bib-it"><span>${esc(x.nombre.replace(/\.pdf$/i, ""))}${q && x.ruta ? `<small>${esc(x.ruta)}</small>` : ""}</span><div class="bt"><button class="btn sm" data-ver="${esc(f.id)}|${esc(x.ref)}|${esc(x.nombre)}">Ver</button><button class="btn sm pri" data-llenar="${esc(f.id)}|${esc(x.ref)}|${esc(x.nombre)}">Llenar</button></div></div>`;
    items.sort((a,b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
    if (q) items.forEach(x => html += it(x));
    else {
      const P = BIB.dir && BIB.dir.fid === f.id ? BIB.dir.ruta : "";
      if (P){ const up = P.includes(" / ") ? P.slice(0, P.lastIndexOf(" / ")) : "";
        html += `<button class="card bib-dir abierta" data-bibdir="${esc(f.id)}|${esc(up)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span>${esc(P.split(" / ").pop())}</span></button>`; }
      const sub = {}, aqui = [];
      items.forEach(x => { const r = x.ruta || "";
        if (r === P) aqui.push(x);
        else if (!P || r.startsWith(P + " / ")){ const resto = P ? r.slice(P.length + 3) : r, n = resto.split(" / ")[0]; sub[n] = (sub[n] || 0) + 1; } });
      Object.keys(sub).sort((a,b) => a.localeCompare(b, "es")).forEach(n => {
        html += `<button class="card bib-dir" data-bibdir="${esc(f.id)}|${esc(P ? P + " / " + n : n)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>${esc(n)}</span><em>${sub[n]}</em></button>`; });
      aqui.forEach(x => html += it(x));
    }
    if (l && !items.length) html += `<div class="hint" style="margin-top:8px">${q ? "Ninguna pauta coincide con la búsqueda." : "No se encontraron PDF."}</div>`;
    if (noPdf) html += `<div class="hint" style="margin-top:6px">${noPdf > 1 ? noPdf + " archivos no son PDF y no se muestran." : "1 archivo no es PDF y no se muestra."}</div>`;
    html += `</div>`;
  });
  $("#bibBody").innerHTML = html;
  const qi = $("#bibQ"); qi.oninput = () => { BIB.q = qi.value; const pos = qi.selectionStart; renderBib(); const n = $("#bibQ"); n.focus(); n.setSelectionRange(pos, pos); };
}
$("#bibBody").addEventListener("click", async e => {
  const dr = e.target.closest("[data-bibdir]"); if (dr){ const [fid, ...r] = dr.dataset.bibdir.split("|"), ruta = r.join("|"); BIB.dir = ruta ? { fid, ruta } : null; renderBib(); $("#bibBody").scrollTop = 0; return; }
  const up = e.target.closest("[data-bibup]"); if (up){ const f = BIB.fuentes.find(x => x.id === up.dataset.bibup); if (f) (f.tipo === "zip" ? menuZip(f) : refrescarFuente(f)); return; }
  const mn = e.target.closest("[data-bibmenu]");
  if (mn){ const f = BIB.fuentes.find(x => x.id === mn.dataset.bibmenu); if (!f) return;
    sheet(`<div class="grab"></div><h3>${esc(f.nombre)}</h3>
      ${f.tipo === "zip" ? `<button class="btn big" id="bZip">Actualizar con ZIP</button>` : ""}
      <button class="btn big" id="bRen">Cambiar nombre</button>
      <button class="btn big" id="bDel" style="color:var(--def);border-color:#F0C9AE">Quitar biblioteca</button>
      <div class="hint" style="margin:4px 0 8px">${f.tipo === "zip" ? "Se borran las pautas que la app guardó de este ZIP. El archivo ZIP original del teléfono no se toca." : f.tipo === "carpeta" ? "La carpeta y sus archivos siguen en el teléfono; la app solo deja de mostrarla." : "Solo se quita de la app."} Las pautas que ya llenaste no se borran.</div>
      <button class="btn big" data-close>Cancelar</button>`);
    $("#bRen").onclick = () => { closeSheet(); openText("Nombre de la biblioteca", f.nombre, v => { v = v.trim(); if (!v) return; BIB.fuentes = BIB.fuentes.map(x => x.id === f.id ? Object.assign(x, { nombre: v }) : x); renderBib(); }); };
    if ($("#bZip")) $("#bZip").onclick = () => { closeSheet(); menuZip(f); };
    $("#bDel").onclick = () => { if (f.tipo === "zip"){ if (NATIVO) Android.bibQuitar(f.id); else IDB.bibQuitar(f.id + "/"); } BIB.dir = null; BIB.fuentes = BIB.fuentes.filter(x => x.id !== f.id); LS.del("bib.lista." + f.id); closeSheet(); renderBib(); };
    return; }
  const vv = e.target.closest("[data-ver]");
  if (vv){ const [fid, ref, ...rest] = vv.dataset.ver.split("|"); verPauta(ref, rest.join("|")); return; }
  const ll = e.target.closest("[data-llenar]");
  if (ll){ const [fid, ref, ...rest] = ll.dataset.llenar.split("|"), nombre = rest.join("|"); llenarBib(ref, nombre); }
});
const srcBib = ref => ref.startsWith("drive:") ? `${DAPI}/${ref.slice(6)}?alt=media&supportsAllDrives=true&key=${DRIVE_KEY}` : ref;
const srcBibAlt = ref => ref.startsWith("drive:") && NATIVO ? "https://drive.google.com/uc?export=download&id=" + ref.slice(6) : "";
async function natBib(metodo, ref, ...mas){ try { return await nat(metodo, srcBib(ref), ...mas); } catch(e){ const alt = srcBibAlt(ref); if (!alt) throw e; return nat(metodo, alt, ...mas); } }
async function llenarBib(ref, nombre){
  {
    if (!terminosOk()){ renderTerminos(false); toast("Acepta los términos para llenar pautas"); return; }
    busy(true, "Trayendo la pauta…");
    try { const n = await natBib("bibTraer", ref, nombre); busy(false); openOt(n); }
    catch(err){ busy(false); toast(err.message && err.message !== "error" ? err.message : "No se pudo traer la pauta", 4000); }
  }
}
/* vista previa: solo lectura, no crea nada en la bandeja */
let VISTA = null;
async function verPauta(ref, nombre){
  busy(true, "Abriendo la pauta…");
  let doc;
  try { const b64 = await natBib("bibVer", ref); doc = await pdfjsLib.getDocument({ data: b64ToBytes(b64) }).promise; }
  catch(err){ busy(false); toast(err.message && err.message !== "error" ? err.message : "No se pudo abrir la pauta", 4000); return; }
  busy(false);
  VISTA = { ref, nombre, doc };
  $("#verTit").textContent = nombre.replace(/\.pdf$/i, "");
  $("#verSub").textContent = `Vista previa · ${doc.numPages} hoja${doc.numPages > 1 ? "s" : ""} · toca para acercar`;
  const body = $("#verBody"); body.innerHTML = ""; body.scrollTop = 0;
  show("scr-ver");
  const ancho = Math.min(2200, Math.max(320, body.clientWidth - 20) * Math.min(2.5, (window.devicePixelRatio || 1) * 1.3) * 2);
  body.classList.remove("zoom");
  for (let n = 1; n <= doc.numPages; n++){
    if (!VISTA || VISTA.doc !== doc) return;
    const pg = await doc.getPage(n), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: ancho / vp0.width });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height); body.appendChild(c);
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  }
}
$("#verBody").addEventListener("click", e => { const c = e.target.closest("canvas"); if (!c) return; const b = $("#verBody"), z = !b.classList.contains("zoom");
  const fy = (e.clientY - c.getBoundingClientRect().top) / c.clientHeight, fx = (e.clientX - c.getBoundingClientRect().left) / c.clientWidth;
  b.classList.toggle("zoom", z);
  if (z){ b.scrollTop = c.offsetTop + fy * c.clientHeight - b.clientHeight / 2; b.scrollLeft = fx * c.clientWidth - b.clientWidth / 2; } else b.scrollTop = c.offsetTop - 10; });
function cerrarVista(){ if (VISTA){ try { VISTA.doc.destroy(); } catch(e){} } VISTA = null; $("#verBody").innerHTML = ""; }
$("#verLlenar").onclick = () => { if (!VISTA) return; const { ref, nombre } = VISTA; cerrarVista(); llenarBib(ref, nombre); };
/* ---- Bibliotecas desde ZIP (p. ej. carpeta descargada de Drive) ---- */
const nombreZip = n => (n || "Pautas").replace(/\.zip$/i, "").replace(/-\d{8}T\d{6}Z(-\d+)?$/i, "").replace(/-\d{3}$/, "").replace(/[_]+/g, " ").trim() || "Pautas";
function normalizarZip(items){
  // si todo viene dentro de una misma carpeta raíz (lo normal en Drive), esa carpeta pasa a ser el nombre
  const segs = items.map(x => (x.ruta || "").split("/").filter(Boolean));
  let raiz = "";
  if (segs.length && segs.every(sg => sg.length && sg[0] === segs[0][0])) raiz = segs[0][0];
  return { raiz, items: items.map((x, i) => ({ nombre: x.nombre, ruta: (raiz ? segs[i].slice(1) : segs[i]).join(" / "), ref: x.ref, pdf: true })) };
}
async function procesarZips(srcs, nombres, destino){
  const nueva = !destino, bibId = nueva ? "z" + Date.now().toString(36) : destino.id, reemplazar = !!(destino && destino.reemplazar);
  busy(true, "Leyendo el ZIP…");
  let r;
  try { r = JSON.parse(NATIVO ? await nat("bibZip", JSON.stringify(srcs), bibId, reemplazar) : await NATW.bibZip(srcs, bibId, reemplazar)); }
  catch(e){ busy(false); toast(e.message && e.message !== "error" ? e.message : "No se pudo leer el ZIP", 4500); return; }
  busy(false);
  const { raiz, items } = normalizarZip(r.items);
  if (!items.length){ toast("El ZIP no tiene archivos PDF", 4000); if (nueva){ if (NATIVO) Android.bibQuitar(bibId); else IDB.bibQuitar(bibId + "/"); } return; }
  let lista = items;
  if (!nueva && !reemplazar){ const prev = (LS.get("bib.lista." + bibId, null) || { items: [] }).items, clave = x => (x.ruta || "") + "|" + x.nombre;
    const nuevos = new Set(items.map(clave)); lista = prev.filter(x => !nuevos.has(clave(x))).concat(items); }
  if (nueva) BIB.fuentes = BIB.fuentes.concat([{ id: bibId, tipo: "zip", nombre: raiz || nombreZip(nombres[0]) }]);
  LS.set("bib.lista." + bibId, { t: Date.now(), items: lista });
  BIB.dir = null; show("scr-bib"); renderBib();
  toast(`${items.length} pauta${items.length > 1 ? "s" : ""} cargada${items.length > 1 ? "s" : ""}${r.otros ? (r.otros > 1 ? ` · ${r.otros} archivos que no son PDF se omitieron` : " · 1 archivo que no es PDF se omitió") : ""}`, 4000);
}
let ZIP_DESTINO = null;
function elegirZip(destino){
  ZIP_DESTINO = destino || null;
  if (NATIVO){ Android.elegirZipBib(); return; }
  const i = document.createElement("input"); i.type = "file"; i.accept = ".zip,application/zip,application/x-zip-compressed"; i.multiple = true;
  i.onchange = () => { const fs = [...i.files]; if (fs.length) procesarZips(fs, fs.map(f => f.name), ZIP_DESTINO); };
  i.click();
}
window.onZipElegidos = function(json){ let l = []; try { l = JSON.parse(json); } catch(e){} if (l.length) procesarZips(l.map(x => x.uri), l.map(x => x.nombre), ZIP_DESTINO); };
function menuZip(f){
  sheet(`<div class="grab"></div><h3>${esc(f.nombre)}</h3>
    <button class="btn big pri" id="zRep">Reemplazar con un ZIP nuevo</button>
    <div class="hint" style="margin:2px 0 10px">Borra las pautas de esta biblioteca y carga las del ZIP nuevo.</div>
    <button class="btn big" id="zAdd">Sumar otro ZIP</button>
    <div class="hint" style="margin:2px 0 10px">Por ejemplo, la segunda parte cuando Drive divide la carpeta (…-002.zip).</div>
    <button class="btn big" data-close>Cancelar</button>`);
  $("#zRep").onclick = () => { closeSheet(); elegirZip({ id: f.id, reemplazar: true }); };
  $("#zAdd").onclick = () => { closeSheet(); elegirZip({ id: f.id, reemplazar: false }); };
}
/* ZIP recibido con "Abrir con / Compartir → Pautas OT" */
window.onZipRecibido = function(){
  if (!NATIVO) return; let l = []; try { l = JSON.parse(Android.zipsPendientes() || "[]"); } catch(e){}
  if (!l.length) return;
  if (!terminosOk()){ toast("Acepta los términos para cargar pautas"); return; }
  const srcs = l.map(x => x.split("|")[0]), nombres = l.map(x => x.split("|").slice(1).join("|"));
  const zs = BIB.fuentes.filter(f => f.tipo === "zip");
  if (!zs.length){ procesarZips(srcs, nombres, null); return; }
  sheet(`<div class="grab"></div><h3>ZIP de pautas</h3><div class="m" style="margin-bottom:8px">${esc(nombres.join(", "))}</div>
    <button class="btn big pri" data-zd="">Biblioteca nueva</button>
    ${zs.map(f => `<button class="btn big" data-zd="${f.id}|1">Reemplazar "${esc(f.nombre)}"</button><button class="btn big" data-zd="${f.id}|0">Sumar a "${esc(f.nombre)}"</button>`).join("")}`);
  $$("[data-zd]").forEach(b => b.onclick = () => { closeSheet(); const [id, rp] = b.dataset.zd.split("|"); procesarZips(srcs, nombres, id ? { id, reemplazar: rp === "1" } : null); });
};
function agregarFuente(f){ f.id = "b" + Date.now().toString(36); BIB.fuentes = BIB.fuentes.concat([f]); renderBib(); refrescarFuente(f); }
window.onCarpetaBib = function(uri, nombre){ if (uri) agregarFuente({ tipo: "carpeta", nombre: nombre || "Carpeta", ref: uri }); };
$("#btnBibAdd").onclick = () => {
  sheet(`<div class="grab"></div><h3>Agregar biblioteca</h3>
    ${NATIVO ? `<button class="btn big" id="aCarp">Carpeta del teléfono</button>
    <div class="hint" style="margin:2px 0 12px">Elige una carpeta con pautas en PDF (también lee sus subcarpetas).</div>` : ""}
    <button class="btn big" id="aZip">Archivo ZIP</button>
    <div class="hint" style="margin:2px 0 12px">Por ejemplo, la carpeta de pautas descargada desde Drive. La app guarda los PDF y respeta las carpetas. Si Drive la dividió en varios ZIP, elígelos todos juntos.</div>
    <button class="btn big" data-close>Cancelar</button>`);
  if ($("#aCarp")) $("#aCarp").onclick = () => { closeSheet(); Android.elegirCarpetaBib(); };
  $("#aZip").onclick = () => { closeSheet(); elegirZip(null); };
};
$("#btnBib").onclick = () => abrirBib();


/* ================= ABRIR OT ================= */
async function openOt(name){
  busy(true, "Leyendo la OT…");
  try {
    const b64 = N.leer(name);
    if (!b64) throw new Error("vacío");
    PDF = await pdfjsLib.getDocument({ data: b64ToBytes(b64) }).promise;
  } catch(e){ busy(false); toast("No se pudo abrir el PDF"); console.error(e); return; }
  FILE = name; PAGES = []; let lines1 = [], words1 = null, W1 = 612; const OPS = []; let haySAP = false; SDCOLS = [];
  for (let n=1; n<=PDF.numPages; n++){
    const page = await PDF.getPage(n);
    const { words, w, h, lines } = await extractWords(page);
    if (n <= 2) lines1 = lines1.concat(lines);
    if (n === 1){ words1 = words; W1 = w; }
    const text = words.map(x=>x.t).join(" ");
    const esSAP = /ORDEN\s+DE\s+MANTENIMIENTO/i.test(text) || /Orden\s*:\s*\d{5,}/.test(text);
    if (esSAP) haySAP = true;
    const isPauta = !esSAP && (/Indicar\s+Nro/i.test(text) || /PAUTA\s+DE\s+MANTENIMIENTO/i.test(text) || /ALCANCE\s+GENERAL|EJECUCI[OÓ]N\s+(INSPECCI|MANTENIMIENTO)|Descripci[oó]n\s+Actividades|OBSERVACIONES|CONTROL\s+DE\s+REVISIONES|Nombre\s+y\s+Apellido/i.test(text));
    const P = { n, w, h, isPauta, page };
    if (esSAP) operacionesOT(words).forEach(o => { if (!OPS.some(x => x.op === o.op)) OPS.push(o); });
    if (isPauta){ const hl = await extractHLines(page); P.otBox = detectOtBox(words); const prevP = PAGES[PAGES.length-1]; P.checklist = detectChecklist(words, w, h, hl, prevP && prevP.isPauta && prevP.checklist ? prevP.checklist : null); P.epp = detectEPP(words, w, hl); P.obs = detectObs(words, w, hl); P.resp = detectResp(words, w);
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
      P.inicio = /ALCANCE\s+GENERAL\s+(DE\s+)?MANTENIMIENTO/i.test(text);
      if (P.inicio){ P.titulo = tituloPauta(words); P.campos = camposAlcance(words); }
      P.fin = detectFinales(words, w, hl);
      // Status / Dur. (min): celda por actividad (3.2) o una para todo el bloque (3.1 / 3.3)
      let sdc = detectStatusDur(words, w, hl);
      if (P.checklist && SDCOLS.length && !sdc.some(c => c.hy > 0 && P.checklist.rows.some(r => r.y > c.top && r.y < c.bot)))
        sdc = sdc.concat(statusDurCont(words, hl, P.checklist.rows.filter(r => !sdc.some(c => r.y > c.top && r.y < c.bot)), SDCOLS));
      { const porFila = sdc.filter(c => P.checklist && P.checklist.rows.some(r => r.y > c.top && r.y < c.bot) && c.bot - c.top < 80);
        if (porFila.length) SDCOLS = ["status", "dur"].map(t => porFila.find(c => c.tipo === t)).filter(Boolean).map(c => ({ tipo: c.tipo, l: c.l, r: c.r })); }
      P.sd = sdc.map(c => {
        const rs = P.checklist ? P.checklist.rows.filter(r => r.y > c.top && r.y < c.bot) : [];
        const as = P.boxes ? P.boxes.rows.filter(r => /^a/.test(r.key) && r.y > c.top && r.y < c.bot) : [];
        if (rs.length === 1 && !as.length) c.row = P.n + "-" + (rs[0].key || rs[0].item);
        else if (as.length && !rs.length) c.grupo = as[0].grupo;
        c.id = P.n + "-" + c.key; return c; }).filter(c => c.row || c.grupo);
      if (!P.otBox && hl.ot && hl.ot.length){ const b = hl.ot[0]; P.otBox = { x: b.x0 + 8, base: (b.y0 + b.y1)/2 + 3, fh: 8.5 }; } }
    PAGES.push(P); await ceder();
  }
  if (!PAGES.some(p=>p.isPauta)) PAGES.forEach(p => p.isPauta = true);
  // cada pauta empieza en la hoja "1. Alcance general mantenimiento"
  GRUPOS = []; let gi = -1;
  PAGES.forEach(P => { if (!P.isPauta) return; if (gi < 0 || (P.inicio && GRUPOS[gi].pages.length)){ gi++; GRUPOS.push({ titulo: "", pages: [] }); }
    P.grupo = gi; GRUPOS[gi].pages.push(P.n); if (P.titulo && !GRUPOS[gi].titulo) GRUPOS[gi].titulo = P.titulo; });
  GRUPOS.forEach(G => G.tipo = tipoPauta(G.titulo));
  if (GRUPOS.length > 1 && OPS.length === GRUPOS.length) GRUPOS.forEach((G,i) => G.op = OPS[i]);
  PAGES_ALL = PAGES; ACTIVO = 0;

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
  const ot = campo(/^Orden :/, 4, 4, w => /^\d{5,}$/.test(w.t)) || pick(/(\d{7,})\s+PM\d/) || (/^Bib_/.test(name) ? "" : (name.match(/(\d{6,})/)||[])[1] || "");
  let equipo = campo(/^Denominaci[oó]n equipo :/, 3, 3) || pick(/Denominaci[oó]n\s+equipo\s*:\s*(.+?)(?:\s+Grupo\b|$)/im);
  let desc = campo(/^Descripci[oó]n orden :/, 7, 13);
  if (/^Grupo\b|^:/i.test(equipo) || /^\W*$/.test(equipo)) equipo = "";
  const fecha = pick(/Fecha\s+inicio\s+Programada\s*:\s*([\d.]+)/i);
  const hora = pick(/Hora\s+inicio\s*:\s*(\d{1,2}:\d{2})/i);
  const tc = s => s.toLowerCase().replace(/(^|[\s(-])([a-záéíóúñ])/g, (m,a,b)=>a+b.toUpperCase());
  META = Object.assign({ estado:"pendiente", done:0, total:0 }, LS.get(metaKey(name), {}), { ot, equipo: equipo ? tc(equipo) : "", desc, fecha: [fecha, hora].filter(Boolean).join(" "), sola: !haySAP });
  if (!haySAP){ const pc = PAGES_ALL.find(p => p.campos), c = (pc && pc.campos) || {}, G0 = GRUPOS[0] || {};
    META.equipo = META.equipo || (c.equipo ? tc(c.equipo) : ""); META.desc = META.desc || G0.titulo || name.replace(/^Bib_/, "").replace(/_\d{8}-\d{4}\.pdf$|\.pdf$/i, "").replace(/_/g, " "); }

  const saved = LS.get(stKey(name), null);
  S = saved ? Object.assign(freshState(), saved) : freshState();
  S.file = name; if (!S.ot) S.ot = ot; if (!S.fin) S.fin = {}; META.ot = S.ot;
  if (!S.resp.length) S.resp = [{ nombre: perfil.nombre, cargo: perfil.cargo, sig: perfil.firma }];
  META.grupos = GRUPOS.map((G,i) => Object.assign({ estado:"pendiente", done:0, total:0 }, (META.grupos||[])[i] || {}, { tipo: G.tipo, titulo: G.titulo, nombre: nombreGrupo(i).replace(/^Pauta de /, "") }));
  undoStack = []; lastSnap = JSON.stringify(S);
  busy(false);
  $("#otTitle").textContent = META.equipo || META.desc || name.replace(/\.pdf$/i,"");
  if (GRUPOS.length > 1){ ACTIVO = null; persist(); show("scr-ot"); renderSelector(); }
  else activarGrupo(0);
  if (META.sola && !S.ot) setTimeout(() => pedirOt(), 350);
}
/* pauta sin OT (viene sola o desde la biblioteca): se le pone el número a mano */
const subOt = extra => (S.ot ? "OT " + S.ot : META && META.sola ? "OT sin número ✎" : "OT") + " · " + extra;
function refrescarOt(){
  if (ACTIVO == null) renderSelector();
  else { $("#otSub").textContent = subOt(GRUPOS.length > 1 ? nombreGrupo(ACTIVO) : "Pauta"); renderStep(false); }
}
function pedirOt(){
  if (!S) return;
  sheet(`<div class="grab"></div><h3>N° de OT</h3>
    <div class="m" style="margin-bottom:8px">${META.sola && !S.ot ? "Esta pauta no viene de una orden de trabajo. Escribe el número de la OT para que salga en la hoja." : "Número de la orden de trabajo que sale en la hoja."}</div>
    <input type="text" id="otN" inputmode="numeric" value="${esc(S.ot||"")}" placeholder="Ej: 5178409">
    <button class="btn pri big" id="otOk">Guardar</button>
    <button class="btn big" data-close>${S.ot ? "Cancelar" : "Más tarde"}</button>`);
  setTimeout(() => $("#otN").focus(), 80);
  $("#otOk").onclick = () => { const v = $("#otN").value.replace(/\D/g, "");
    if (!v && !META.sola){ toast("Escribe el número"); return; }
    S.ot = v; META.ot = v; closeSheet(); persist(); refrescarOt(); if (v) toast("OT " + v); };
}
$("#otSub").onclick = () => { if (S) pedirOt(); };
const nombreBase = g => { const G = GRUPOS[g] || {}; return G.tipo ? "Pauta de " + G.tipo : (G.titulo || "Pauta " + (g+1)); };
// equipo de la operación (ej. "Insp Inst AIT44124 pH LnUF@RO" → "AIT44124 pH LnUF@RO")
const equipoOp = op => op && op.desc ? op.desc.replace(/^(INSP|MANT|REST|CAMB|LUB\w*|REPA\w*|REVI\w*)\.?\s+((OP|DET)\s+)?(\d+D\s+)?(ELECTRICA|MECANICA|INST|ELEC|MEC)?\b\s*/i, "").trim() || op.desc : "";
// título del botón: tipo si las pautas son de tipos distintos; si se repite, el equipo de la operación; si no hay, se numera
const nombreGrupo = g => { const b = nombreBase(g), igual = GRUPOS.map((x,i) => i).filter(i => nombreBase(i) === b);
  if (igual.length < 2) return b;
  const unicos = f => { const v = igual.map(i => f(GRUPOS[i])); return v.every(Boolean) && new Set(v).size === v.length ? v : null; };
  const eq = unicos(G => equipoOp(G.op)) || unicos(G => G.op && G.op.desc);
  return eq ? eq[igual.indexOf(g)] : b + " " + (igual.indexOf(g) + 1); };
const subGrupo = g => { const G = GRUPOS[g], t = nombreGrupo(g) !== nombreBase(g) && !/ \d+$/.test(nombreGrupo(g)) ? nombreBase(g) + " · " : ""; return t + (G.op ? "Operación " + G.op.op : ""); };
const filasGrupo = g => PAGES_ALL.filter(p => p.grupo === g && p.checklist).flatMap(p => p.checklist.rows.map(r => ({ p, r, key: p.n+"-"+(r.key||r.item) })));
/* OT con varias pautas: se elige cuál llenar */
function renderSelector(){
  PAGES = PAGES_ALL;
  $("#otSub").textContent = subOt("Elige la pauta");
  $("#stepper").innerHTML = "";
  $("#stepBody").innerHTML = `<div class="head-row"><div><h2>¿Qué pauta vas a llenar?</h2><div class="m">${META.sola ? "Este documento" : "Esta OT"} trae ${GRUPOS.length} pautas</div></div></div>` +
    GRUPOS.map((G,i) => { const m = META.grupos[i] || {}, n = filasGrupo(i).length;
      const est = m.estado === "enviada" ? `<span class="pill env">Enviada</span>` : m.estado === "curso" ? `<span class="pill curso">En curso${m.total?` · ${m.done}/${m.total}`:""}</span>` : `<span class="pill">Pendiente</span>`;
      return `<button class="card pauta-op" data-grupo="${i}"><div class="top"><b>${esc(nombreGrupo(i))}</b>${est}</div>
        <div class="meta">${esc(G.titulo || "")}${n ? ` · ${n} actividades` : ""}</div>
        ${G.op ? `<div class="meta">${esc(subGrupo(i).replace(/Operación \S+$/, ""))}Operación ${esc(G.op.op)}${G.op.desc && equipoOp(G.op) !== nombreGrupo(i) && G.op.desc !== nombreGrupo(i) ? " · " + esc(G.op.desc) : ""}</div>` : ""}</button>`; }).join("");
  $("#stepFoot").innerHTML = "";
  $$("[data-grupo]").forEach(b => b.onclick = () => activarGrupo(+b.dataset.grupo));
}
function activarGrupo(g){
  ACTIVO = g; PAGES = PAGES_ALL.filter(p => !p.isPauta || p.grupo === g);
  if (!S.fin[g]){ const pc = PAGES_ALL.find(p => p.grupo === g && p.campos), c = (pc && pc.campos) || {};
    S.fin[g] = { eq: { area: c.area || "", desc: c.equipo || META.equipo || "", tag: c.tag || "" }, mat: [], rev: { fecha: "", preparo: "" } }; }
  STEPS = [];
  if (allEpp().length || allBoxes().length) STEPS.push({k:"epp", l: allBoxes().length ? "Inicio" : "EPP"});
  if (allRows().length) STEPS.push({k:"act", l:"Actividades"});
  if (PAGES.some(p=>p.resp)) STEPS.push({k:"firma", l:"Firma"});
  STEPS.push({k:"enviar", l:"Enviar"});
  step = 0;
  const p = progreso();
  if (p.tocado){ if (p.total && p.done === p.total) step = Math.max(0, STEPS.findIndex(s=>s.k==="firma")); else if (allRows().some(({key}) => S.checks[key])) step = Math.max(0, STEPS.findIndex(s=>s.k==="act")); }
  persist();
  $("#otSub").textContent = subOt(GRUPOS.length > 1 ? nombreGrupo(g) : "Pauta");
  show("scr-ot"); renderStep();
  if (STEPS.length === 1) toast("No se reconocieron casillas: usa el botón Documento para marcar a mano", 4500);
}
/* datos del cierre (3.5, 3.6, 4 y 6) para dibujar en la hoja */
function anaEntries(g){
  return filasGrupo(g ?? 0).filter(({key}) => { const c = S.checks[key]; return c && c.estado === "CD" && (c.aviso || c.sub === "SI"); })
    .map(({r, key}) => ({ item: r.item, aviso: (S.checks[key].aviso || "").trim(), text: (S.checks[key].detalle || "").trim(), key }));
}
function finDatos(g){
  const F = (S.fin || {})[g ?? 0] || {};
  return { eq: F.eq, mat: F.mat, ana: anaEntries(g), rev: { fecha: (F.rev && F.rev.fecha) || hoyTxt(), preparo: (F.rev && F.rev.preparo) || (S.resp[0] || {}).nombre || "" } };
}
const hayFin = k => PAGES.some(p => p.fin && p.fin[k]);

function allRows(){ const out=[]; PAGES.forEach(p => p.checklist && p.checklist.rows.forEach(r => out.push({p, r, key: p.n+"-"+(r.key||r.item)}))); return out; }
function allBoxes(){ const out=[]; PAGES.forEach(p => p.boxes && p.boxes.rows.forEach(r => out.push({p, r, key: p.n+"-"+r.key}))); return out; }
const subCols = p => p.checklist ? p.checklist.cols.filter(c => c.g === "sub") : [];
const btnCls = k => k === "SD" || k === "NO" ? "ok" : k === "NA" ? "na" : "bad";
function allInterv(){ const out=[]; PAGES.forEach(p => p.interv && p.interv.forEach(it => out.push({p, it, key: p.n+"-"+it.key}))); return out; }
function allEpp(){ const out=[]; PAGES.forEach(p => p.epp && p.epp.rows.forEach(r => out.push({p, r, key: p.n+"-"+r.key}))); return out; }
function obsEntries(){
  const list = [];
  allRows().forEach(({r,key}) => { const c = S.checks[key]; if (c && c.estado==="CD"){
    const fo = fotosDef(key).map(id => infoFoto(id).obs).filter(Boolean);
    list.push({ item: r.item, text: [(c.detalle||"").trim()].concat(fo).filter(Boolean).join(" · "), auto:true, key }); } });
  S.obsExtra.forEach((o,i) => { if ((o.text||"").trim() && (o.g ?? 0) === (ACTIVO ?? 0)) list.push({ item:o.item, text:o.text, idx:i }); });
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

/* --- Fotos por actividad (sin necesidad de defecto). Se guardan en IndexedDB, no en el estado de la OT --- */
const FOTO_MAX = 4, FOTO_URL = {};
/* cada foto puede ser "normal" o "con defecto" (con su observación), sin depender del orden */
const infoFoto = id => ((S.fotoInfo || {})[id] || {});
function setInfoFoto(id, inf){ S.fotoInfo = S.fotoInfo || {}; if (inf && inf.def) S.fotoInfo[id] = { def: true, obs: (inf.obs || "").trim() }; else delete S.fotoInfo[id]; }
const fotosDef = key => fotosDe(key).filter(id => infoFoto(id).def);
/* bloque Normal / Con defecto + observación (en el editor y al tocar una foto) */
function etiquetaHtml(inf){
  return `<div class="etq"><div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))">
    <button class="ok ${inf.def?"":"on"}" data-etq="0">Normal</button><button class="def ${inf.def?"on":""}" data-etq="1">Con defecto</button></div>
    <div class="ta-wrap etq-obs" style="${inf.def?"":"display:none"}"><textarea id="etqObs" placeholder="Observación de esta foto (ej.: sensor LT-2 con conector suelto)">${esc(inf.obs||"")}</textarea>
    ${NATIVO ? `<button class="mic" id="etqMic" aria-label="Dictar por voz"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>` : ""}</div></div>`;
}
function enlazarEtiqueta(inf){
  $$("[data-etq]").forEach(b => b.onclick = () => { inf.def = b.dataset.etq === "1"; $$("[data-etq]").forEach(x => x.classList.toggle("on", x === b)); $(".etq-obs").style.display = inf.def ? "" : "none"; if (inf.def) setTimeout(() => { const t = $("#etqObs"); if (t) t.focus(); }, 50); });
  const ta = $("#etqObs"); ta.oninput = () => inf.obs = ta.value;
  const mic = $("#etqMic"); if (mic) mic.onclick = () => { window.__dictado = t => { const base = ta.value.trim(); if (!base || /[.!?]$/.test(base)) t = t.charAt(0).toUpperCase() + t.slice(1); ta.value = (base ? base + " " : "") + t; inf.obs = ta.value; }; Android.dictar("etq"); };
}
/* si una foto queda con defecto, la actividad pasa a "Con defecto" */
function actividadConDefecto(key){
  const c = S.checks[key] || (S.checks[key] = {});
  if (c.estado === "CD") return false;
  const row = allRows().find(x => x.key === key), sd = row ? subDef(row.p) : null;
  c.estado = "CD"; if (sd && c.sub === sd) c.sub = null; return true;
}
const fotosDe = key => ((S.fotosAct || {})[key] || []);
function fotosActHtml(key){
  const ids = fotosDe(key);
  const fd = (S.checks[key] || {}).estado === "CD" && S.fotos[key];
  return `<div class="fotos-act">${fd ? `<button class="fth fdef" data-det="${key}" aria-label="Foto del defecto"><img src="${S.fotos[key]}" alt=""><i>${((allRows().find(x => x.key === key) || {}).p || {checklist:{}}).checklist.mode === "ok" ? "Obs." : "Defecto"}</i></button>` : ""}${ids.map((id, i) => `<button class="fth ${infoFoto(id).def ? "fdef" : ""}" data-fver="${key}|${id}" aria-label="Ver foto ${i+1}"><img data-fid="${id}" alt="">${infoFoto(id).def ? "<i>Defecto</i>" : ""}</button>`).join("")}
    ${ids.length < FOTO_MAX ? `<button class="fadd" data-fadd="${key}" aria-label="Agregar foto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>${ids.length ? "" : "<span>Foto</span>"}</button>` : ""}</div>`;
}
async function fotoBlob(id){ try { return await IDB.bibLeer("foto:" + id); } catch(e){ return null; } }
async function fotoUrl(id){ if (FOTO_URL[id]) return FOTO_URL[id]; const b = await fotoBlob(id); if (!b) return ""; return (FOTO_URL[id] = URL.createObjectURL(b)); }
function hidratarFotos(){ $$("img[data-fid]").forEach(async im => { if (!im.src) im.src = await fotoUrl(im.dataset.fid); }); }
async function reducirFoto(dataUrl, max = 1280, q = 0.8){
  const im = await loadImg(dataUrl); if (!im) return null;
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, "image/jpeg", q));
}
async function agregarFotoAct(key, foto, etq){
  closeSheet();
  const b = foto instanceof Blob ? foto : await reducirFoto(foto); if (!b){ toast("No se pudo leer la foto"); return; }
  const id = (FILE || "ot").replace(/[^\w.-]/g, "_").slice(0, 60) + ":" + Date.now().toString(36);
  try { await IDB.bibPoner("foto:" + id, b); } catch(e){ toast("No se pudo guardar la foto"); return; }
  S.fotosAct = S.fotosAct || {}; (S.fotosAct[key] = S.fotosAct[key] || []).push(id);
  FOTO_URL[id] = URL.createObjectURL(b);
  if (etq && etq.def){ setInfoFoto(id, etq); if (actividadConDefecto(key)) toast("La actividad quedó \"Con defecto\""); changed(); return; }
  // solo se actualiza la fila de fotos de esa actividad (sin redibujar toda la lista)
  const add = document.querySelector(`[data-fadd="${CSS.escape(key)}"]`), tira = add && add.parentElement;
  if (tira){ const t = document.createElement("div"); t.innerHTML = fotosActHtml(key); tira.replaceWith(t.firstElementChild); hidratarFotos(); changed(true, false); }
  else changed();
}
function quitarFotoAct(key, id){
  setInfoFoto(id, null);
  S.fotosAct[key] = fotosDe(key).filter(x => x !== id); if (!S.fotosAct[key].length) delete S.fotosAct[key];
  IDB.bib("readwrite", st => st.delete("foto:" + id)).catch(() => {}); if (FOTO_URL[id]){ URL.revokeObjectURL(FOTO_URL[id]); delete FOTO_URL[id]; }
  changed();
}
function borrarFotosOt(name){ IDB.bibQuitar("foto:" + name.replace(/[^\w.-]/g, "_").slice(0, 60) + ":"); }
$("#stepBody").addEventListener("click", async e => {
  const ad = e.target.closest("[data-fadd]");
  if (ad){ const key = ad.dataset.fadd; if (fotosDe(key).length >= FOTO_MAX){ toast("Máximo " + FOTO_MAX + " fotos por actividad"); return; }
    pedirFoto((b, etq) => agregarFotoAct(key, b, etq), null, true); return; }
  const fv = e.target.closest("[data-fver]");
  if (fv){ const [key, id] = fv.dataset.fver.split("|"), url = await fotoUrl(id);
    const inf = Object.assign({ def: false, obs: "" }, infoFoto(id));
    sheet(`<div class="grab"></div><h3>Foto de la actividad</h3><img src="${url}" alt="" style="width:100%;border-radius:10px;margin:6px 0 10px">
      ${etiquetaHtml(inf)}
      <button class="btn big pri" id="fOk">Listo</button>
      <button class="btn big" id="fEdit">Editar (marcar sobre la foto)</button>
      <button class="btn big" id="fQuit" style="color:var(--def);border-color:#F0C9AE">Quitar foto</button><button class="btn big" data-close>Cerrar</button>`);
    enlazarEtiqueta(inf);
    $("#fOk").onclick = () => { const antes = !!infoFoto(id).def; setInfoFoto(id, inf); closeSheet();
      if (inf.def && actividadConDefecto(key)) toast("La actividad quedó \"Con defecto\"");
      if (antes !== !!inf.def || inf.def) changed(); };
    $("#fQuit").onclick = () => { closeSheet(); quitarFotoAct(key, id); };
    $("#fEdit").onclick = () => editarFoto(url, async b => {
      closeSheet();
      const nu = URL.createObjectURL(b), viejo = FOTO_URL[id]; FOTO_URL[id] = nu;
      $$(`img[data-fid="${CSS.escape(id)}"]`).forEach(im => im.src = nu);
      if (viejo) setTimeout(() => URL.revokeObjectURL(viejo), 1000);
      try { await IDB.bibPoner("foto:" + id, b); } catch(e){ toast("No se pudo guardar la foto"); return; }
      toast("Foto editada"); }, closeSheet); }
});

/* --- Editor de fotos: marcar con lápiz, círculo o flecha --- */
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function editarFoto(src, onSave, onCancel, nueva, etiqueta){
  const im = await loadImg(src); if (!im){ toast("No se pudo abrir la foto"); return; }
  const COLS = { rojo: "#E02424", amarillo: "#FFD400", blanco: "#FFFFFF" };
  let tool = "lapiz", color = "rojo", trazos = [], actual = null;
  sheet(`<div class="grab"></div><h3>Marcar la foto</h3>
    <div class="ed-wrap"><canvas id="edC"></canvas></div>
    <div class="ed-bar"><div class="seg ed-seg" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[["lapiz","Lápiz"],["circulo","Círculo"],["flecha","Flecha"],["recorte","Recortar"]].map(([k,l]) => `<button class="ok ${k===tool?"on":""}" data-tool="${k}">${l}</button>`).join("")}</div>
      <div class="ed-cols">${Object.entries(COLS).map(([k,v]) => `<button class="ed-col ${k===color?"on":""}" data-col="${k}" style="background:${v}" aria-label="Color ${k}"></button>`).join("")}
      <button class="btn sm" id="edUndo">Deshacer</button></div></div>
    ${etiqueta ? etiquetaHtml(etiqueta) : ""}
    ${nueva && !etiqueta ? `<div class="hint" style="margin:-4px 0 0">Marca lo que quieras destacar, recórtala o guárdala tal cual.</div>` : ""}
    <button class="btn pri big" id="edOk">${nueva ? "Guardar foto" : "Guardar"}</button><button class="btn big" id="edNo">${nueva ? "Descartar foto" : "Cancelar"}</button>`);
  if (etiqueta) enlazarEtiqueta(etiqueta);
  const cv = $("#edC"), wrap = cv.parentElement;
  const maxW = wrap.clientWidth, maxH = Math.round(window.innerHeight * 0.55), k = Math.min(maxW / im.naturalWidth, maxH / im.naturalHeight);
  const dw = Math.round(im.naturalWidth * k), dh = Math.round(im.naturalHeight * k), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = dw + "px"; cv.style.height = dh + "px"; cv.width = dw * dpr; cv.height = dh * dpr;
  const ctx = cv.getContext("2d");
  const pintar = (g, W, H, lista) => {
    const lw = Math.max(3, W * 0.008);
    for (const t of lista){
      if (t.t === "recorte") continue;
      g.strokeStyle = COLS[t.c]; g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
      g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = lw * 0.6;
      const P = t.p.map(q => [q[0] * W, q[1] * H]); if (!P.length) continue;
      g.beginPath();
      if (t.t === "lapiz"){ g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); if (P.length === 1) g.lineTo(P[0][0] + 0.1, P[0][1]); }
      else if (t.t === "circulo"){ const a = P[0], b = P[P.length-1]; g.ellipse((a[0]+b[0])/2, (a[1]+b[1])/2, Math.max(2, Math.abs(b[0]-a[0])/2), Math.max(2, Math.abs(b[1]-a[1])/2), 0, 0, Math.PI*2); }
      else { const a = P[0], b = P[P.length-1], ang = Math.atan2(b[1]-a[1], b[0]-a[0]), L = lw * 4.5;
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(b[0], b[1]); g.lineTo(b[0] - L*Math.cos(ang - 0.45), b[1] - L*Math.sin(ang - 0.45));
        g.moveTo(b[0], b[1]); g.lineTo(b[0] - L*Math.cos(ang + 0.45), b[1] - L*Math.sin(ang + 0.45)); }
      g.stroke(); g.shadowBlur = 0;
    }
  };
  // recorte: el último rectángulo marcado con "Recortar" (se quita con Deshacer)
  const rectDe = t => { if (!t || t.p.length < 2) return null; const [a, b] = t.p, r = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    return (r.x1 - r.x0 > 0.04 && r.y1 - r.y0 > 0.04) ? r : null; };
  const recorte = lista => { for (let i = lista.length - 1; i >= 0; i--) if (lista[i].t === "recorte"){ const r = rectDe(lista[i]); if (r) return r; } return null; };
  const redibujar = () => {
    const lista = actual ? trazos.concat([actual]) : trazos;
    ctx.drawImage(im, 0, 0, cv.width, cv.height); pintar(ctx, cv.width, cv.height, lista);
    const r = recorte(lista);
    if (r){ const W = cv.width, H = cv.height; ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, W, r.y0*H); ctx.fillRect(0, r.y1*H, W, H - r.y1*H); ctx.fillRect(0, r.y0*H, r.x0*W, (r.y1-r.y0)*H); ctx.fillRect(r.x1*W, r.y0*H, W - r.x1*W, (r.y1-r.y0)*H);
      ctx.setLineDash([8, 6]); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(r.x0*W, r.y0*H, (r.x1-r.x0)*W, (r.y1-r.y0)*H); ctx.setLineDash([]); }
  };
  redibujar();
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); actual = { t: tool, c: color, p: [pos(e)] }; redibujar(); };
  cv.onpointermove = e => { if (!actual) return; const q = pos(e); if (tool === "lapiz") actual.p.push(q); else actual.p[1] = q; redibujar(); };
  cv.onpointerup = cv.onpointercancel = () => { if (actual){ trazos.push(actual); actual = null; redibujar(); } };
  $$("[data-tool]").forEach(b => b.onclick = () => { tool = b.dataset.tool; $$("[data-tool]").forEach(x => x.classList.toggle("on", x === b)); });
  $$("[data-col]").forEach(b => b.onclick = () => { color = b.dataset.col; $$("[data-col]").forEach(x => x.classList.toggle("on", x === b)); });
  $("#edUndo").onclick = () => { trazos.pop(); redibujar(); };
  $("#edNo").onclick = () => onCancel && onCancel();
  let guardando = false;
  $("#edOk").onclick = async () => {
    if (guardando) return;                       // evita guardar dos veces
    guardando = true;
    const bt = $("#edOk"); bt.disabled = true; bt.innerHTML = `<span class="spin" style="width:18px;height:18px;border-width:2px;vertical-align:-3px;margin-right:8px"></span>Guardando…`;
    $("#edNo").disabled = true;
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));   // que se vea el "Guardando…" antes del trabajo
    try {
      if (!trazos.length){
        if (!nueva){ if (etiqueta) onSave(null); else onCancel && onCancel(); return; }
        onSave(await (await fetch(src)).blob()); return;
      }
      const m = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight)), out = document.createElement("canvas");
      out.width = Math.round(im.naturalWidth * m); out.height = Math.round(im.naturalHeight * m);
      const g = out.getContext("2d"); g.drawImage(im, 0, 0, out.width, out.height); pintar(g, out.width, out.height, trazos);
      let fin = out; const r = recorte(trazos);
      if (r){ fin = document.createElement("canvas"); fin.width = Math.round((r.x1 - r.x0) * out.width); fin.height = Math.round((r.y1 - r.y0) * out.height);
        fin.getContext("2d").drawImage(out, r.x0 * out.width, r.y0 * out.height, fin.width, fin.height, 0, 0, fin.width, fin.height); }
      // toDataURL es más rápido que toBlob en el WebView de Android
      onSave(await (await fetch(fin.toDataURL("image/jpeg", 0.8))).blob());
    } catch(e){ guardando = false; bt.disabled = false; bt.textContent = nueva ? "Guardar foto" : "Guardar"; $("#edNo").disabled = false; toast("No se pudo guardar"); }
  };
}

/* --- Status y duración --- */
const STATUS_OPC = ["Revisado", "OK", "En funcionamiento", "No aplica", "Detenido", "En falla", "Fuera de servicio"];
const allSD = () => PAGES.flatMap(P => P.sd || []);
function sdHtml(cs){
  const st = cs.find(c => c.tipo === "status"), du = cs.find(c => c.tipo === "dur");
  if (!st && !du) return "";
  S.stat = S.stat || {}; S.dur = S.dur || {};
  return `<div class="sdrow">${st ? `<select data-stat="${st.id}"><option value="">Status…</option>${STATUS_OPC.map(o => `<option ${S.stat[st.id]===o?"selected":""}>${o}</option>`).join("")}</select>` : ""}
    ${du ? `<label class="min"><input type="text" inputmode="numeric" maxlength="4" data-dur="${du.id}" value="${esc(S.dur[du.id]||"")}" placeholder="—"><span>min</span></label>` : ""}</div>`;
}
$("#stepBody").addEventListener("change", e => {
  const t = e.target; if (!t.dataset || !t.dataset.stat) return;
  S.stat = S.stat || {}; if (t.value) S.stat[t.dataset.stat] = t.value; else delete S.stat[t.dataset.stat];
  changed(true, false);
});
$("#stepBody").addEventListener("input", e => {
  const t = e.target; if (!t.dataset || !t.dataset.dur) return;
  S.dur = S.dur || {}; const v = t.value.replace(/[^\d.,]/g, ""); if (v !== t.value) t.value = v;
  if (v) S.dur[t.dataset.dur] = v; else delete S.dur[t.dataset.dur];
  changed(true, false);
});

function sdBloque(g){ if (!g) return ""; const cs = allSD().filter(c => c.grupo === g); if (!cs.length) return "";
  const grupos = Object.values(cs.reduce((m, c) => { const k = c.id.split("-")[0] + "|" + Math.round(c.top); (m[k] = m[k] || []).push(c); return m; }, {}));
  return grupos.map(x => `<div class="sdbloque"><span>Status y duración del bloque</span>${sdHtml(x)}</div>`).join(""); }
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
        if (r.grupo !== g){ if (open){ out += "</div>"; out += sdBloque(g); } g = r.grupo; if (g) out += `<div class="sec-t" style="margin:14px 2px 8px">${esc(g)}</div>`; out += `<div class="chips">`; open = true; }
        out += `<button class="chip ${S.boxes[key]?"on":""}" data-box="${keys.join("|")}">${esc(r.label)}</button>`;
      }
      return out + (open ? "</div>" + sdBloque(g) : ""); })()}`;
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
    const foObs = c.estado === "CD" ? fotosDef(key).map(id => infoFoto(id).obs).filter(Boolean) : [];
    const det = c.estado === "CD" ? `<button class="detbox" data-det="${key}"><span>${c.detalle || foObs.length ? esc([c.detalle].concat(foObs).filter(Boolean).join(" · ")) : '<span class="ph">Toca para describir el defecto</span>'}</span></button>` : "";
    return `<div class="it ${cls}">
      <div class="h"><span class="n">${esc(r.item)}</span><div style="display:flex;flex-direction:column;gap:2px"><span class="c">${esc(r.comp||"")}</span>${extraHtml(r, esComun)}<span class="d">${esc(r.desc||"")}</span></div></div>
      ${r.limite ? `<span class="x"><b>Límite aceptable:</b> ${esc(r.limite)}</span>` : ""}
      ${r.medidas ? `<div class="medidas">${r.medidas.map(m => `<label class="med"><span>${esc(m.label)}</span><input type="text" inputmode="decimal" data-med="${key}#${m.id}" value="${esc((S.medidas||{})[key+"#"+m.id]||"")}" placeholder="—">${m.unidad ? `<em>${esc(m.unidad)}</em>` : ""}</label>`).join("")}</div>` : ""}
      <div class="seg" style="grid-template-columns:repeat(${est.length},minmax(0,1fr))">${est.map(e => b("estado", e.k, e.label)).join("")}</div>
      ${sdHtml(allSD().filter(x => x.row === key))}
      ${det}
      ${fotosActHtml(key)}
      ${sc.length ? `<div class="subrow"><span>${esc(p.checklist.subLabel)}</span><div class="seg" style="grid-template-columns:repeat(${sc.length},minmax(0,1fr))">${sc.map(x => b("sub", x.k, x.label)).join("")}</div></div>` : ""}
    </div>`;
  };
  const pend = rows.filter(({key}) => !(S.checks[key]||{}).estado).length;
  $("#stepBody").innerHTML = `<div class="head-row"><div><h2>Actividades</h2><div class="m">${p.done} de ${p.total} completas</div></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${pend ? `<button class="btn outline sm" id="restoSD">Resto sin defecto</button>` : ""}
      ${allSD().some(c => c.row && c.tipo === "status") ? `<button class="btn outline sm" id="statTodos">Status a todos</button>` : ""}</div></div>
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
  const stt = $("#statTodos"); if (stt) stt.onclick = () => {
    sheet(`<div class="grab"></div><h3>Status a todos</h3><div class="m" style="margin-bottom:8px">Se pone en las actividades que aún no tienen status.</div>
      ${STATUS_OPC.map(o => `<button class="btn big" data-st="${o}">${o}</button>`).join("")}<button class="btn big" data-close>Cancelar</button>`);
    $$("[data-st]").forEach(bt => bt.onclick = () => { S.stat = S.stat || {}; let n = 0;
      allSD().filter(c => c.row && c.tipo === "status").forEach(c => { if (!S.stat[c.id]){ S.stat[c.id] = bt.dataset.st; n++; } });
      closeSheet(); changed(); toast(n ? `Status "${bt.dataset.st}" en ${n} actividad${n>1?"es":""}` : "Todas ya tenían status"); });
  };
  hidratarFotos();
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
  if (g === "estado" && k !== "CD" && was !== k && fotosDef(key).length){
    const n = fotosDef(key).length;
    sheet(`<div class="grab"></div><h3>Fotos con defecto</h3><div class="m" style="margin-bottom:10px">Esta actividad tiene ${n} foto${n>1?"s":""} marcada${n>1?"s":""} con defecto.</div>
      <button class="btn big pri" id="avNorm">Marcar las fotos como normales y seguir</button><button class="btn big" data-close>Cancelar</button>`);
    $("#avNorm").onclick = () => { fotosDef(key).forEach(id => setInfoFoto(id, null)); closeSheet(); setCheck(key, g, k); };
    return;
  }
  c[g] = was === k ? null : k;
  if (g === "estado" && c.estado === "SD" && !c.sub && sd) c.sub = sd;
  if (g === "estado" && c.estado === "CD" && was !== "CD"){ if (sd && c.sub === sd) c.sub = null; changed(); openDefect(key); return; }
  changed();
}

/* --- Hoja de defecto --- */
function openDefect(key){
  const row = allRows().find(x => x.key === key); if (!row) return;
  const c = S.checks[key] || (S.checks[key] = {});
  let txt = c.detalle || "", sub = c.sub || null, foto = S.fotos[key] || null, aviso = c.aviso || "";
  const conAna = PAGES.some(p => p.fin && p.fin.ana);
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
      ${conAna && (sub === "SI" || !subCols(row.p).length) ? `<div><label class="f" style="margin-top:0" for="avisoTxt">N° aviso subsecuente${subCols(row.p).length ? "" : " (si lo generaste)"}</label>
        <input type="text" id="avisoTxt" inputmode="numeric" value="${esc(aviso)}" placeholder="Ej: 4871503"></div>` : ""}
      ${foto ? `<div class="fotoprev"><img src="${foto}" alt="Foto del hallazgo"><div style="display:flex;flex-direction:column;gap:6px"><button class="btn sm" id="fotoEdit">Editar</button><button class="btn sm" id="fotoDel">Quitar</button></div></div>` :
        true ? `<button class="btn dash" id="fotoBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Adjuntar foto del hallazgo</button>` : ""}
      <button class="btn pri big" id="detOk">${row.p.checklist.mode === "ok" ? "Guardar observación" : "Guardar defecto"}</button>`);
    const ta = $("#detTxt"); ta.oninput = () => { txt = ta.value; };
    const av = $("#avisoTxt"); if (av) av.oninput = () => { aviso = av.value; };
    $$("[data-chip]").forEach(b => b.onclick = () => {
      const d = perfil.defectos[+b.dataset.chip];
      if (chipOn(d)) txt = txt.replace(new RegExp("\\s*" + d.replace(/[.*+?^${}()|[\]\\/]/g,"\\$&") + "[.,;]?", "i"), "").trim();
      else txt = (txt.trim() ? txt.trim().replace(/[.,;]?$/, ". ") : "") + d + ".";
      draw();
    });
    $$("[data-sub]").forEach(b => b.onclick = () => { sub = sub === b.dataset.sub ? null : b.dataset.sub; draw(); });
    const mic = $("#mic"); if (mic) mic.onclick = () => { window.__dictado = t => { const base = txt.trim(); if (!base || /[.!?]$/.test(base)) t = t.charAt(0).toUpperCase() + t.slice(1); txt = (base ? base + " " : "") + t; draw(); }; Android.dictar("det"); };
    const fb = $("#fotoBtn"); if (fb) fb.onclick = () => pedirFoto(async b => { foto = await blobToDataURL(b); draw(); }, draw);
    const fd = $("#fotoDel"); if (fd) fd.onclick = () => { foto = null; draw(); };
    const fe = $("#fotoEdit"); if (fe) fe.onclick = () => editarFoto(foto, async b => { foto = await blobToDataURL(b); draw(); }, draw);
    $("#detOk").onclick = () => { c.estado = "CD"; c.detalle = txt.trim(); c.sub = sub; c.aviso = aviso.trim(); if (foto) S.fotos[key] = foto; else delete S.fotos[key]; closeSheet(); changed(); };
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
  $("#oOk").onclick = () => { const v = { item: $("#oI").value.trim(), text: $("#oT").value.trim(), g: idx >= 0 ? (S.obsExtra[idx].g ?? 0) : (ACTIVO ?? 0) }; if (idx>=0) S.obsExtra[idx] = v; else if (v.text) S.obsExtra.push(v); closeSheet(); changed(); };
  const d = $("#oDel"); if (d) d.onclick = () => { S.obsExtra.splice(idx,1); closeSheet(); changed(); };
}

/* --- Cierre de la pauta: 3.5 equipos, 3.6 materiales, 4 análisis, 6 control de revisiones --- */
function htmlCierre(){
  if (!["eq","mat","ana","rev"].some(hayFin)) return "";
  const F = S.fin[ACTIVO ?? 0], D = finDatos(ACTIVO);
  const inp = (k, v, ph, extra="") => `<input type="text" data-fin="${k}" value="${esc(v||"")}" placeholder="${esc(ph)}" ${extra}>`;
  let h = "";
  if (hayFin("eq")) h += `<div class="card"><b class="ct">3.5 Equipos / instrumentos donde aplica</b>
    <label class="f">Área</label>${inp("eq.area", F.eq.area, "Ej: 540")}
    <label class="f">Descripción</label>${inp("eq.desc", F.eq.desc, "Equipo o instrumento")}
    <label class="f">TAG</label>${inp("eq.tag", F.eq.tag, "Ej: 0540-BM-0002E")}</div>`;
  if (hayFin("mat")) h += `<div class="card"><b class="ct">3.6 Materiales y repuestos</b>
    ${F.mat.length ? F.mat.map((m,i) => `<button class="matrow" data-mat="${i}"><b>${i+1}. ${esc(m.comp || m.desc || "Material")}</b><span>${esc([m.cant && (m.cant + (m.un ? " " + m.un : "")), m.lote && "Lote " + m.lote].filter(Boolean).join(" · "))}</span></button>`).join("") : `<div class="m" style="margin:6px 0">Sin materiales.</div>`}
    <button class="btn dash" id="addMat">+ Agregar material</button></div>`;
  if (hayFin("ana")){ const sinN = D.ana.filter(e => !e.aviso);
    h += `<div class="card"><b class="ct">4. Análisis y mejoramiento</b>
    ${D.ana.length ? D.ana.map(e => `<button class="matrow" data-anadef="${esc(e.key)}"><b>Ítem ${esc(e.item)} · ${e.aviso ? "Aviso " + esc(e.aviso) : '<span style="color:var(--def)">Falta N° de aviso</span>'}</b><span>${esc(corto(e.text || "", 80))}</span></button>`).join("")
      : `<div class="m" style="margin:6px 0">Se llena con los defectos que tienen aviso subsecuente.</div>`}
    ${sinN.length ? `<div class="m" style="margin-top:4px">Toca un ítem para agregar el N° de aviso.</div>` : ""}</div>`; }
  if (hayFin("rev")) h += `<div class="card"><b class="ct">6. Control de revisiones</b>
    <div class="grid2"><div><label class="f">Fecha</label>${inp("rev.fecha", F.rev.fecha, D.rev.fecha)}</div>
    <div><label class="f">Preparó</label>${inp("rev.preparo", F.rev.preparo, D.rev.preparo || "Nombre")}</div></div></div>`;
  return `<div class="sec-t" style="margin-top:14px">Cierre de la pauta</div>` + h;
}
function enlazarCierre(){
  const F = S.fin && S.fin[ACTIVO ?? 0]; if (!F) return;
  $$("[data-fin]").forEach(i => i.oninput = () => { const [a, b] = i.dataset.fin.split("."); F[a][b] = i.value; changed(true, false); });
  $$("[data-mat]").forEach(b => b.onclick = () => editMat(+b.dataset.mat));
  const am = $("#addMat"); if (am) am.onclick = () => editMat(-1);
  $$("[data-anadef]").forEach(b => b.onclick = () => openDefect(b.dataset.anadef));
}
function editMat(i){
  const F = S.fin[ACTIVO ?? 0], m = i >= 0 ? F.mat[i] : { comp:"", desc:"", cant:"", un:"", lote:"" };
  const f = (k, l, ph, im="text") => `<div><label class="f" style="margin-top:0">${l}</label><input type="text" id="m_${k}" inputmode="${im}" value="${esc(m[k]||"")}" placeholder="${esc(ph)}"></div>`;
  sheet(`<div class="grab"></div><h3>${i >= 0 ? "Editar" : "Agregar"} material</h3>
    ${f("comp","Componente / repuesto / material","Ej: Sensor inductivo")}${f("desc","Descripción","Ej: M18, 24 VDC")}
    <div class="grid2">${f("cant","Cantidad","1","decimal")}${f("un","Unidad","Un")}</div>${f("lote","Lote","Opcional")}
    <button class="btn pri big" id="mOk">Guardar</button>
    ${i >= 0 ? `<button class="btn big" id="mDel" style="color:var(--def)">Eliminar</button>` : `<button class="btn big" data-close>Cancelar</button>`}`);
  $("#mOk").onclick = () => { const v = {}; ["comp","desc","cant","un","lote"].forEach(k => v[k] = $("#m_"+k).value.trim());
    if (v.comp || v.desc){ if (i >= 0) F.mat[i] = v; else F.mat.push(v); } closeSheet(); changed(); };
  const d = $("#mDel"); if (d) d.onclick = () => { F.mat.splice(i, 1); closeSheet(); changed(); };
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
    ${htmlCierre()}
    <div class="card" style="margin-top:10px"><b style="font-size:15px">Revisión</b>
      ${checks.map(([ok,t]) => `<div class="okline ${ok?"y":"n"}">${ok?ICON_OK:ICON_NO}${esc(t)}</div>`).join("")}</div>`;
  footNext("Generar pauta llena", nextStep);
  const ap = $("#addP"); if (ap) ap.onclick = () => { S.resp.push({nombre:"",cargo:"",sig:null}); changed(); };
  enlazarCierre();
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
  renderEnviarUI();
}
function renderEnviarUI(){
  const p = progreso(), fmt = perfil.envio === "pdf" ? "pdf" : "img";
  $("#stepBody").innerHTML = `
    ${!S.ot ? `<div class="warn" style="display:flex;gap:10px;align-items:center"><span style="flex:1">La hoja va sin N° de OT.</span><button class="btn sm" id="btnPonerOt">Poner N° OT</button></div>` : ""}
    ${p.done < p.total ? `<div class="warn">Atención: faltan ${p.total - p.done} actividades por completar.</div>` : ""}
    <div class="prev" id="prevBox">${OUTS.map((o, i) => `<figure><div class="zbox"><img src="${o.url}" alt=""></div><figcaption>${esc(o.cap)}</figcaption></figure>`).join("")}</div>
    <div class="hint" style="margin:6px 0 4px">${OUTS.length} ${OUTS.length>1?"imágenes":"imagen"} · desliza para ver</div>`;
  const sel = selEnvio(), ck = `<span class="ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
  $("#stepFoot").innerHTML = `
    <div class="envio2">
      <button class="tg ${sel.img?"on":""}" data-sel="img" role="checkbox" aria-checked="${sel.img}">${ck}<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>Imágenes</button>
      <button class="tg ${sel.pdf?"on":""}" data-sel="pdf" role="checkbox" aria-checked="${sel.pdf}">${ck}<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>PDF</button>
      <button class="send" id="wa" aria-label="Enviar por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></svg><span class="w"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.1-4A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2 2.2 4 4.5 4.6l1-1 1.6.7-.4 1.3c-3 .3-6.6-3-6.9-6l1.3-.5.8 1.5z"/></svg></span></button>
    </div>
    <div class="selmsg" id="selMsg"></div>
    <div class="grid2"><button class="btn" id="pdfBtn">Guardar PDF</button><button class="btn" id="otro">Otro medio</button></div>`;
  const msgSel = () => { const s1 = selEnvio(), n = OUTS.length;
    $("#selMsg").textContent = s1.img && s1.pdf ? `Se envían ${n} ${n>1?"imágenes":"imagen"} y además 1 PDF` : s1.img ? `Se envía${n>1?"n":""} ${n} ${n>1?"imágenes":"imagen"}` : "Se envía 1 PDF con todas las hojas y fotos"; };
  msgSel();
  $$("[data-sel]").forEach(b => b.onclick = () => {
    const s1 = Object.assign({}, selEnvio()), k = b.dataset.sel, otro = k === "img" ? "pdf" : "img";
    if (s1[k] && !s1[otro]){ $("#selMsg").textContent = "Debe quedar al menos una opción marcada"; return; }
    s1[k] = !s1[k]; perfil.envioSel = s1; guardarPerfil();
    b.classList.toggle("on", s1[k]); b.setAttribute("aria-checked", s1[k]); msgSel(); });
  $$("#prevBox .zbox").forEach(zoomEnSitio);
  { const b = $("#btnPonerOt"); if (b) b.onclick = pedirOt; }
  $("#wa").onclick = () => compartir("whatsapp");
  $("#otro").onclick = () => compartir("otro");
  $("#pdfBtn").onclick = guardarPdf;
}
/* zoom dentro de la misma vista previa: pellizcar para acercar, un dedo para mover, doble toque para volver.
   Encabezado y botones no se mueven; mientras hay zoom, el carrusel no cambia de hoja. */
function zoomEnSitio(box){
  const img = box.querySelector("img"), prev = $("#prevBox"); let z = 1;
  const zoom = (nz, cxr = 0.5, cyr = 0.5) => {
    nz = Math.max(1, Math.min(5, nz));
    const fig = box.closest("figure");
    if (nz > 1 && z === 1){ fig.style.height = fig.offsetHeight + "px"; box.style.height = box.clientHeight + "px"; box.style.flex = "none"; box.classList.add("on"); prev.style.overflowX = "hidden"; }
    const px = box.scrollLeft + cxr * box.clientWidth, py = box.scrollTop + cyr * box.clientHeight, f = nz / z;
    z = nz; img.style.width = (z * 100) + "%";
    if (z === 1){ box.classList.remove("on"); box.style.height = ""; box.style.flex = ""; fig.style.height = ""; prev.style.overflowX = ""; box.scrollLeft = 0; box.scrollTop = 0; return; }
    box.scrollLeft = px * f - cxr * box.clientWidth; box.scrollTop = py * f - cyr * box.clientHeight;
  };
  const pts = new Map(); let d0 = 0, z0 = 1, ultimo = 0;
  const rel = (x, y) => { const r = box.getBoundingClientRect(); return [(x - r.left) / r.width, (y - r.top) / r.height]; };
  box.addEventListener("pointerdown", e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2){ const [a, b] = [...pts.values()]; d0 = Math.hypot(a[0]-b[0], a[1]-b[1]); z0 = z; }
    else if (pts.size === 1){ const t = Date.now(); if (t - ultimo < 300){ const [cx, cy] = rel(e.clientX, e.clientY); zoom(z > 1.2 ? 1 : 2.5, cx, cy); ultimo = 0; } else ultimo = t; }
  });
  box.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && d0){ e.preventDefault(); const [a, b] = [...pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]); const [cx, cy] = rel((a[0]+b[0])/2, (a[1]+b[1])/2); zoom(z0 * d / d0, cx, cy); }
  });
  const fin = e => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
  box.addEventListener("pointerup", fin); box.addEventListener("pointercancel", fin);
  // con zoom: si ya estás en el borde de la hoja y deslizas otra vez hacia ese lado, pasa a la hoja siguiente/anterior
  let tx0 = null, bordeD = false, bordeI = false;
  box.addEventListener("touchstart", e => {
    if (e.touches.length !== 1 || z <= 1){ tx0 = null; return; }
    tx0 = e.touches[0].clientX; bordeD = box.scrollLeft >= box.scrollWidth - box.clientWidth - 2; bordeI = box.scrollLeft <= 1;
  }, { passive: true });
  box.addEventListener("touchend", e => {
    if (tx0 == null || z <= 1 || e.touches.length) return;
    const dx = e.changedTouches[0].clientX - tx0; tx0 = null;
    if (dx < -60 && bordeD) irHoja(+1); else if (dx > 60 && bordeI) irHoja(-1);
  });
  const irHoja = d => {
    const fig = box.closest("figure"), dest = d > 0 ? fig.nextElementSibling : fig.previousElementSibling;
    zoom(1); if (!dest) return;
    prev.scrollTo({ left: dest.offsetLeft - (prev.clientWidth - dest.clientWidth) / 2, behavior: "smooth" });
  };
  box._reset = () => { if (z > 1) zoom(1); };
}
let VISOR = null;
function cerrarVisor(){ if (VISOR){ VISOR.remove(); VISOR = null; } }

async function renderPageImage(P, scale){
  const vp = P.page.getViewport({scale});
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height);
  await P.page.render({ canvasContext: ctx, viewport: vp }).promise;
  const urls = [...S.resp.map(r=>r.sig), ...S.free.filter(a=>a.sig).map(a=>a.sig)].filter(Boolean);
  await Promise.all(urls.map(loadImg));
  drawAnnotations(ctx, P, scale, false, true);
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
/* hoja de hallazgo para una foto marcada con defecto (con su observación) */
async function hallazgoFotoCanvas(row, id, n){
  const b = await fotoBlob(id); const im = b ? await loadImg(URL.createObjectURL(b)) : null; if (!im) return null;
  const obs = infoFoto(id).obs || (S.checks[row.key] || {}).detalle || "";
  const W = 1200, pad = 36, ih = Math.round(im.naturalHeight * W / im.naturalWidth);
  const c = document.createElement("canvas"), ctx = c.getContext("2d");
  ctx.font = "30px Arial"; const lines = wrap(ctx, obs, W - pad*2).slice(0, 6);
  const head = 70 + lines.length * 38 + 24; c.width = W; c.height = head + ih;
  ctx.fillStyle = "#0D2C4F"; ctx.fillRect(0, 0, W, head);
  ctx.fillStyle = "#fff"; ctx.font = "bold 34px Arial"; ctx.textBaseline = "top";
  ctx.fillText(`OT ${S.ot || "—"} · Hallazgo ítem ${row.r.item}${n ? " · foto " + n : ""}`, pad, 26);
  ctx.font = "30px Arial"; ctx.fillStyle = "#DCE6F2"; lines.forEach((l, i) => ctx.fillText(l, pad, 76 + i * 38));
  ctx.drawImage(im, 0, head, W, ih);
  return c;
}
/* hoja "Registro fotográfico": 4 fotos por hoja con ítem y componente */
async function hojasFotosAct(keysG){
  const lista = [];
  for (const row of allRows()){ if (!keysG.has(row.key)) continue; const ids = fotosDe(row.key);
    const norm = ids.filter(id => !infoFoto(id).def);
    norm.forEach((id, i) => lista.push({ id, txt: `Ítem ${row.r.item}${row.r.comp ? " · " + row.r.comp : ""}${norm.length > 1 ? " · foto " + (i+1) : ""}` })); }
  const hojas = [], W = 1240, pad = 36, head = 120, cw = (W - pad*3) / 2, ch = 640, capH = 64;
  for (let h = 0; h < lista.length; h += 4){
    const grupo = lista.slice(h, h + 4), filas = Math.ceil(grupo.length / 2);
    const c = document.createElement("canvas"); c.width = W; c.height = head + pad + filas * (ch + capH + pad);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, c.height);
    ctx.fillStyle = "#0D2C4F"; ctx.fillRect(0, 0, W, head); ctx.textBaseline = "top";
    ctx.fillStyle = "#fff"; ctx.font = "bold 36px Arial"; ctx.fillText(`OT ${S.ot || "—"} · Registro fotográfico`, pad, 22);
    ctx.font = "26px Arial"; ctx.fillStyle = "#DCE6F2";
    const sub = [GRUPOS.length > 1 ? nombreGrupo(ACTIVO) : (META.desc || META.equipo || ""), hoyTxt(), lista.length > 4 ? `hoja ${h/4 + 1} de ${Math.ceil(lista.length/4)}` : ""].filter(Boolean).join(" · ");
    ctx.fillText(sub.slice(0, 80), pad, 72);
    for (let i = 0; i < grupo.length; i++){
      const x = pad + (i % 2) * (cw + pad), y = head + pad + Math.floor(i / 2) * (ch + capH + pad);
      ctx.fillStyle = "#F3F5F4"; ctx.fillRect(x, y, cw, ch);
      const b = await fotoBlob(grupo[i].id); const im = b ? await loadImg(URL.createObjectURL(b)) : null;
      if (im){ const k = Math.min(cw / im.naturalWidth, ch / im.naturalHeight), w = im.naturalWidth * k, hh = im.naturalHeight * k; ctx.drawImage(im, x + (cw - w)/2, y + (ch - hh)/2, w, hh); }
      ctx.fillStyle = "#1E1E1E"; ctx.font = "26px Arial";
      const ln = wrap(ctx, grupo[i].txt, cw).slice(0, 2); ln.forEach((l, j) => ctx.fillText(l, x, y + ch + 8 + j * 30));
    }
    hojas.push(c);
  }
  return hojas;
}
const toBlob = (c, q=0.88) => new Promise(r => c.toBlob(r, "image/jpeg", q));
async function generarImagenes(){
  fijarEstiloOt();
  const sel = PAGES.filter(P => P.isPauta), canv = [];
  for (const P of sel){ canv.push(await renderPageImage(P, 2.6)); await ceder(); }
  const G = GRUPOS.length > 1 ? "_" + sinTilde(nombreGrupo(ACTIVO).replace(/^Pauta de /, "")).replace(/[^\w.-]+/g, "_").replace(/_+$/, "").slice(0, 40) : "";
  const base = baseArchivo(), outs = [], keysG = new Set(allRows().map(r => r.key));
  for (let i=0;i<canv.length;i++) outs.push({ canvas:canv[i], blob: await toBlob(canv[i]), name: `${base} - hoja ${i+1}.jpg`, cap: `Hoja ${i+1} de ${canv.length}` });
  for (const key of Object.keys(S.fotos)){
    if ((S.checks[key]||{}).estado !== "CD" || !keysG.has(key)) continue;
    const c = await fotoCanvas(key); if (!c) continue;
    const it = key.split("-")[1];
    outs.push({ canvas:c, blob: await toBlob(c, 0.85), name: `${base} - hallazgo item ${it}.jpg`, cap: `Foto hallazgo ítem ${it}`, foto:true });
  }
  for (const row of allRows()){ if (!keysG.has(row.key)) continue;
    const defs = fotosDef(row.key);
    for (let i = 0; i < defs.length; i++){
      const c = await hallazgoFotoCanvas(row, defs[i], defs.length > 1 ? i + 1 : 0); if (!c) continue;
      outs.push({ canvas:c, blob: await toBlob(c, 0.85), name: `${base} - hallazgo item ${row.r.item}${defs.length > 1 ? " foto " + (i+1) : ""}.jpg`, cap: `Hallazgo ítem ${row.r.item}`, foto:true });
    }
  }
  for (const c of await hojasFotosAct(keysG)) outs.push({ canvas:c, blob: await toBlob(c, 0.85), name: `${base} - fotos ${outs.filter(o => o.reg).length + 1}.jpg`, cap: "Registro fotográfico", foto:true, reg:true });
  outs.forEach(o => o.url = URL.createObjectURL(o.blob));
  return outs;
}
function marcarEnviada(){
  if (META.grupos && META.grupos.length > 1 && ACTIVO != null){ META.grupos[ACTIVO].estado = "enviada"; META.grupos[ACTIVO].enviada = Date.now(); }
  else { META.estado = "enviada"; }
  META.enviada = Date.now(); persist();
}
/* texto que acompaña al envío: "OT 5755828 MANT 28D INST SLEEWING…" (permite encontrarla con el buscador de WhatsApp) */
function textoEnvio(){
  const nombre = (GRUPOS.length > 1 && ACTIVO != null ? nombreGrupo(ACTIVO) : (META.equipo || META.desc || "")).trim();
  return [`OT ${S.ot || "sin número"}`, nombre].filter(Boolean).join(" ");
}
/* qué se envía: imágenes, PDF o ambos (al menos uno). Se recuerda en el perfil. */
function selEnvio(){
  let s0 = perfil.envioSel;
  if (!s0 || typeof s0 !== "object") s0 = perfil.envio === "pdf" ? { img: false, pdf: true } : { img: true, pdf: false };
  if (!s0.img && !s0.pdf) s0 = { img: true, pdf: false };
  return s0;
}
/* nombre de los archivos: "OT 555886 MANT 28D INST SLEEWING" (con espacios, para que el buscador de WhatsApp encuentre el número) */
function baseArchivo(){
  return textoEnvio().replace(/[\\/:*?"<>|#%&{}$!'@+`=]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90).trim() || "OT";
}
async function compartir(modo){
  const sel = selEnvio();
  busy(true, sel.pdf ? "Creando PDF…" : "Preparando…");
  try {
    const items = (sel.img ? OUTS.map(o => ({ blob: o.blob, name: o.name, mime: "image/jpeg" })) : [])
      .concat(sel.pdf ? [Object.assign(await crearPdf(), { mime: "application/pdf" })] : []);
    if (NATIVO){
      const arr = [];
      for (const o of items) arr.push({ name: o.name, b64: await blobToB64(o.blob), mime: o.mime });
      Android.compartirTexto(JSON.stringify(arr), modo, textoEnvio());
      marcarEnviada();
    } else {
      const files = items.map(o => new File([o.blob], o.name, { type: o.mime }));
      if (navigator.canShare && navigator.canShare({ files })){ await navigator.share({ files, text: textoEnvio() }); marcarEnviada(); }
      else { items.forEach(o => descargar(o.blob, o.name)); marcarEnviada(); }
    }
  } catch(e){ if (e && e.name !== "AbortError") toast("No se pudo compartir"); }
  busy(false);
}
window.onCompartido = function(ok){ if (ok === false) toast("No se encontró WhatsApp; elige otra app"); };
function descargar(blob, name){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
async function crearPdf(){
  fijarEstiloOt();
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
  return { blob: doc.output("blob"), name: baseArchivo() + ".pdf" };
}
async function guardarPdf(){
  busy(true, "Creando PDF…");
  try {
    const { blob, name } = await crearPdf();
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
  { v: "Ver. 1.32", fecha: "26-11-2026", items: [
    "Fotos en cualquier actividad: tómalas o elígelas de la galería, y marca cada una como normal o con defecto, con su observación.",
    "Editor de fotos: marca con lápiz, círculo o flecha, y recorta la imagen.",
    "Envío mejorado: elige fotos, PDF o ambos. Los archivos llevan el N° de OT para encontrarlos en WhatsApp.",
    "Zoom en la vista previa: acerca las hojas con los dedos antes de enviar.",
    "Biblioteca: abre pautas desde una carpeta del celular o desde archivos ZIP.",
    "Términos de uso actualizados: se piden de nuevo al abrir." ] },
  { v: "Ver. 1.31", fecha: "22-11-2026", items: [
    "Se crea \"Biblioteca de pautas\": agrega el enlace de una carpeta de Google Drive y llena pautas sin necesidad de una OT. En Android también puedes usar una carpeta del teléfono.",
    "Ver antes de llenar: revisa la pauta antes de elegirla.",
    "N° de OT: las pautas que no vienen de una OT piden el número para que salga en la hoja.",
    "OT con varias pautas: la app las reconoce (inspección, mantención o por equipo) y eliges cuál llenar con un botón.",
    "Cierre del formato nuevo: equipos, materiales, aviso subsecuente, fecha y responsable." ] },
  { v: "Ver. 1.30", fecha: "09-11-2026", items: [
    "Incorporación del proyecto a repositorio.",
    "Verificación de actualización disponible o búsqueda en Android.",
    "Compatibilidad para iPhone mediante aplicación web (Safari)." ] },
  { v: "Ver. 1.29", fecha: "08-11-2026", items: [
    "Incorporación de botones rápidos de estilos: Parejo, Natural o Máximo, con controles de posición, giro, tamaño y forma del trazo, y vista previa.",
    "Verificación de versiones anteriores." ] },
  { v: "Ver. 1.28", fecha: "08-11-2026", items: [
    "Se agrega variabilidad a los vistos: offset, rotación, tamaño e intensidad de trazo, para que se vean hechos a mano.",
    "Se agrega variación de 5° en la inclinación de la firma.",
    "Se agrega aviso de novedades al actualizar la app, e historial de actualizaciones." ] },
  { v: "Ver. 1.27", fecha: "08-11-2026", items: [
    "Estilo de tipografía y aumento de tamaño de firma 40 %, estilo PNG, similar a escritura a mano." ] },
  { v: "Ver. 1.26", fecha: "08-11-2026", items: [
    "Se incorporan los términos de uso de la app." ] },
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
function revisarNovedades(){
  if (!terminosOk() || perfil.ultimaVer === VERSION_APP) return;
  // versiones de prueba (1.30.1, 1.30.2…): no repiten las novedades de la versión base
  if (perfil.ultimaVer && numVer(perfil.ultimaVer) === numVer(VERSION_APP)){ perfil.ultimaVer = VERSION_APP; guardarPerfil(); return; }
  setTimeout(() => mostrarNovedades(false), 400);
}

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
      "Funciona como un editor de PDF selectivo: lee el documento que tú abres, reconoce las tablas de la pauta y escribe sobre ellas solo las marcas, textos y firma que tú indicas. El resto del documento no se modifica.",
      "La aplicación no trae pautas, OT ni documentos propios: trabaja únicamente con los archivos que el usuario abre o carga en su teléfono.",
      "Uso gratuito y sin fines de lucro. Sin publicidad.",
      "Versión de prueba: puede tener errores o cambiar.",
      "Cada actualización muestra sus novedades al abrir la app. Si cambian estos términos, se vuelven a pedir.",
      "El uso es voluntario."])}
    ${sec("2. Datos personales", [
      "La aplicación no recopila datos personales ni los envía a servidores del creador ni de terceros.",
      "No tiene base de datos de usuarios, no pide cuenta ni contraseña y no usa seguimiento ni estadísticas.",
      "Tu nombre, tu firma y el avance de cada OT se guardan solo en este teléfono. El creador no tiene acceso a ellos.",
      "Las imágenes y PDF solo salen del teléfono cuando tú decides compartirlos.",
      "Las fotos que agregas a una OT se guardan solo dentro de la aplicación y se borran al borrar esa OT de la bandeja.",
      "Al enviar, el nombre de los archivos y el texto que los acompaña incluyen el N° de OT y el nombre de la pauta, para encontrarlos en WhatsApp.",
      "Al desinstalar la aplicación se borra todo lo guardado."])}
    ${sec("3. Permisos", [
      "Archivos: abrir el PDF de la OT, cargar pautas desde una carpeta o un archivo ZIP y guardar el resultado.",
      "Cámara: fotos de hallazgos y de las actividades.",
      "Galería: elegir fotos ya guardadas en el teléfono para adjuntarlas a una actividad o a un hallazgo.",
      "Micrófono: dictar observaciones con el servicio de voz del teléfono (Google).",
      "Compartir: enviar por WhatsApp u otra aplicación. Esos servicios tienen sus propias políticas.",
      "Internet: solo para revisar si hay una versión nueva de la aplicación. No se envía ningún dato personal."])}
    ${sec("4. Responsabilidades", [
      "Revisa que la pauta esté correcta antes de enviarla. La aplicación ayuda a marcar, pero no valida el trabajo.",
      "Las OT y pautas son documentos internos: compártelas solo por los canales autorizados.",
      "No reemplaza procedimientos de seguridad, permisos de trabajo ni instrucciones de la supervisión.",
      "Las fotos deben mostrar solo lo necesario para el trabajo. Evita captar personas o información ajena a la mantención.",
      "No distribuyas la aplicación fuera del grupo de prueba sin autorización del creador.",
      "Informa los errores al creador indicando el número de OT.",
      "Se entrega tal como está, sin garantía. Puedes dejar de usarla desinstalándola."])}
    ${sec("5. Biblioteca de pautas y manejo de la información", [
      "La biblioteca muestra las pautas de una carpeta del teléfono o guarda en el teléfono las de un archivo ZIP que tú cargas. La aplicación no las envía a ningún servidor ni al creador.",
      "Las carpetas de pautas las comparte el responsable de cada grupo de trabajo, solo con las personas autorizadas y bajo los criterios de seguridad del grupo.",
      "Quien descarga y carga las pautas es responsable de su resguardo y de no divulgarlas fuera del grupo de trabajo ni de los canales autorizados.",
      "El tratamiento de la información contenida en las pautas y OT, incluida la información sensible o confidencial, es responsabilidad de cada usuario. El creador no tiene acceso a ella ni responde por su uso indebido.",
      "Al quitar una biblioteca o desinstalar la aplicación, se borran las copias de las pautas guardadas dentro de la aplicación. Los archivos originales del teléfono (la carpeta o el ZIP) no se tocan."])}`;
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
if (NATIVO){ try { const pend = JSON.parse(Android.paginaLista() || "[]"); if (pend.length) window.onOtRecibida(pend); } catch(e){} setTimeout(() => { try { window.onZipRecibido(); } catch(e){} }, 900); }
window.__app = { get S(){return S;}, get PAGES(){return PAGES;}, get OUTS(){return OUTS;}, openOt, memFiles, changed };
window.renderPageImageT = renderPageImage;
