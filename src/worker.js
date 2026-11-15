// Worker de descargas (Wispbyte): cliente que delega y servidor que ejecuta
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { TT_MAX, WORKER_KEY, WORKER_URL } = require('../config');
const { TT_DIR } = require('./lib/descarga');
const { als, sleep, sock } = require('./lib/state');
const { ytBinario, ytCalentar } = require('./lib/youtube');
const workerTipos = (...a) => require('./plugins').workerTipos(...a);   // se carga al usarla (evita un ciclo)

const W_DIR = './tmp_worker';
const W_MEDIA = ['video', 'image', 'audio', 'document', 'sticker'];
const wFirma = (met, ruta, cuerpo, ts) => crypto.createHmac('sha256', WORKER_KEY).update(`${ts}\n${met}\n${ruta}\n${cuerpo}`).digest('hex');

// ===== lado worker =====
const wJobs = new Map();                        // id -> { id, estado, entradas, archivos, t, error }
const wColas = { pesado: Promise.resolve(), liviano: Promise.resolve() };  // YouTube/APK por un lado, el resto por otro
let wPend = 0;
function wSockFalso(job) {
  return {
    user: { id: 'worker@s.whatsapp.net' },
    async sendMessage(jid, content, opts = {}) {
      const e = { c: {}, q: !!opts.quoted };
      for (const [k, v] of Object.entries(content)) {
        if (!W_MEDIA.includes(k)) { e.c[k] = v; continue; }
        if (v?.url && /^https?:\/\//i.test(v.url)) { e.c[k] = v; continue; }  // URL remota (fotos de TikTok): la baja el bot directo
        // el comando borra su archivo apenas lo "envía": se guarda una copia propia para que el bot lo pueda bajar
        const n = job.archivos++, dest = `${W_DIR}/${job.id}_${n}`;
        if (Buffer.isBuffer(v)) fs.writeFileSync(dest, v);
        else if (v?.url) { try { fs.linkSync(v.url, dest); } catch { fs.copyFileSync(v.url, dest); } }
        else { e.c[k] = v; continue; }
        e.c[k] = { f: n };
      }
      job.entradas.push(e);
      return { key: { id: `W${job.id}_${job.entradas.length}`, remoteJid: jid, fromMe: true } };
    },
    async groupMetadata() { throw new Error('no disponible en el worker'); },
  };
}
function wLanzar(cola, job, fn) {
  wPend++;
  wColas[cola] = wColas[cola].then(async () => {
    job.estado = 'corriendo';
    try { await als.run({ id: 'worker', name: 'worker', sock: wSockFalso(job) }, fn); job.estado = 'listo'; }
    catch (e) { console.error('[worker] el trabajo falló:', e.message); job.estado = 'error'; job.error = String(e.message).slice(0, 200); }
    finally { wPend--; job.fin = Date.now(); }
  });
}
const wMensajeFalso = b => ({ key: b.key || { remoteJid: b.jid, id: 'W' }, message: { extendedTextMessage: { text: b.text || '', contextInfo: b.qt? { quotedMessage: { conversation: String(b.qt) } } : {} } } });
function wCrear(b) {
  const jid = String(b.jid || ''), text = String(b.text || '').slice(0, 2000), m = wMensajeFalso(b);
  const job = { id: crypto.randomBytes(6).toString('hex'), estado: 'cola', entradas: [], archivos: 0, t: Date.now() };
  const t = workerTipos()[b.tipo]; if (!t) return null;
  wJobs.set(job.id, job);
  wLanzar(t.clase, job, () => t.run(m, jid, text, b));
  return job;
}
function wBorrar(job) {
  wJobs.delete(job.id);
  for (let n = 0; n < job.archivos; n++) fs.rmSync(`${W_DIR}/${job.id}_${n}`, { force: true });
}
function wAutorizado(req, ruta, cuerpo) {
  const ts = String(req.headers['x-ts'] || ''), sig = String(req.headers['x-sig'] || '');
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 5 * 60e3) return false;
  const a = Buffer.from(wFirma(req.method, ruta, cuerpo, ts)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function wAtender(req, res) {
  const json = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    const url = new URL(req.url, 'http://x'), ruta = url.pathname;
    if (req.method === 'GET' && ruta === '/') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('worker ok'); }
    let cuerpo = '';
    for await (const c of req) { cuerpo += c; if (cuerpo.length > 64 * 1024) return json(413, { error: 'cuerpo muy grande' }); }
    if (!wAutorizado(req, ruta, cuerpo)) return json(401, { error: 'no autorizado' });
    if (req.method === 'POST' && ruta === '/run') {
      if (wPend >= 6) return json(429, { error: 'ocupado' });
      const job = wCrear(JSON.parse(cuerpo || '{}'));
      return job? json(200, { id: job.id }) : json(400, { error: 'tipo inválido' });
    }
    const mm = /^\/(job|file)\/([0-9a-f]+)(?:\/(\d+))?$/.exec(ruta);
    const job = mm && wJobs.get(mm[2]);
    if (!job) return json(404, { error: 'no existe' });
    if (req.method === 'GET' && mm[1] === 'job') {
      const desde = Math.max(0, Number(url.searchParams.get('from')) || 0);
      return json(200, { estado: job.estado, error: job.error, entradas: job.entradas.slice(desde) });
    }
    if (req.method === 'GET' && mm[1] === 'file' && mm[3] !== undefined) {
      const f = `${W_DIR}/${job.id}_${mm[3]}`;
      if (!fs.existsSync(f)) return json(404, { error: 'no existe' });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(f).size });
      return fs.createReadStream(f).pipe(res);
    }
    if (req.method === 'DELETE' && mm[1] === 'job') { wBorrar(job); return json(200, { ok: true }); }
    json(405, { error: 'método no permitido' });
  } catch (e) { console.error('[worker] pedido inválido:', e.message); if (!res.headersSent) json(400, { error: 'pedido inválido' }); else res.end(); }
}
async function startWorker() {
  if (WORKER_KEY.length < 16) { console.error('❌ [worker] Falta WORKER_KEY (mínimo 16 caracteres) en el .env'); process.exit(1); }
  fs.rmSync(W_DIR, { recursive: true, force: true }); fs.mkdirSync(W_DIR, { recursive: true });
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 0);
  if (!port) { console.error('❌ [worker] No hay puerto (SERVER_PORT / PORT)'); process.exit(1); }
  http.createServer(wAtender).listen(port, '0.0.0.0', () => console.log(`🛠️ Worker de descargas escuchando en el puerto ${port}`));
  setInterval(() => { // limpia trabajos viejos
    const ahora = Date.now();
    for (const j of wJobs.values()) if (ahora - j.t > 40 * 60e3 || (j.fin && ahora - j.fin > 15 * 60e3)) wBorrar(j);
  }, 60e3);
  ytBinario().then(() => { console.log('[worker] yt-dlp listo'); ytCalentar(); }, e => console.error('[worker] no pude preparar yt-dlp:', e.message));
}

// ===== lado bot =====
const wReq = (met, ruta, cuerpo, extra = {}) => {
  const body = cuerpo? JSON.stringify(cuerpo) : '', ts = String(Date.now());
  return axios({ method: met, url: WORKER_URL + ruta, data: body || undefined, timeout: 30000, validateStatus: () => true,
    headers: { 'x-ts': ts, 'x-sig': wFirma(met, ruta.split('?')[0], body, ts), 'Content-Type': 'application/json' },...extra });
};
const textoCitado = m => { const q = m.message?.extendedTextMessage?.contextInfo?.quotedMessage; return q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : ''; };
// reproduce en WhatsApp una de las cosas que el worker quiso enviar
async function wReproducir(m, jid, e, id) {
  const c = { ...e.c }, tmp = [];
  try {
    for (const k of W_MEDIA) if (c[k]?.f !== undefined) {
      const r = await wReq('GET', `/file/${id}/${c[k].f}`, null, { responseType: 'stream', timeout: 60000 });
      if (r.status !== 200) throw new Error('el worker no tiene el archivo');
      fs.mkdirSync(TT_DIR, { recursive: true });
      const dest = `${TT_DIR}/w_${Date.now()}_${Math.random().toString(36).slice(2)}`; tmp.push(dest);
      await new Promise((ok, mal) => {
        let n = 0; const w = fs.createWriteStream(dest);
        r.data.on('data', x => { n += x.length; if (n > TT_MAX) { r.data.destroy(); w.destroy(); mal(new Error('GRANDE')); } });
        r.data.on('error', mal); w.on('error', mal); w.on('finish', ok); r.data.pipe(w);
      });
      c[k] = fs.statSync(dest).size <= 40 * 1048576? fs.readFileSync(dest) : { url: dest };
    }
    if (c.react) c.react = { ...c.react, key: m.key };
    await sock.sendMessage(jid, c, e.q? { quoted: m } : {});
  } finally { for (const f of tmp) fs.rmSync(f, { force: true }); }
}
// pide el trabajo al worker y va enviando lo que genera; "local" es el plan B si el worker no contesta (null = no hay plan B)
async function remoto(m, jid, tipo, params, local) {
  const aviso = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  let id;
  try {
    const r = await wReq('POST', '/run', { tipo, jid, key: m.key, qt: textoCitado(m),...params });
    if (r.status === 429) { await aviso('⏳ El servidor de descargas está muy ocupado. Probá en un momento.'); return; }
    if (r.status !== 200 ||!r.data?.id) throw new Error(`HTTP ${r.status}${r.data?.error? ' ' + r.data.error : ''}`);
    id = r.data.id;
  } catch (e) {
    console.error('[worker] no pude pedirle el trabajo:', e.message);
    if (local) { console.log('[worker] lo hago acá'); return local(); }
    await aviso('❌ El servidor de descargas no responde ahora. Probá de nuevo en un rato.');
    return;
  }
  let desde = 0; const t0 = Date.now();
  try {
    for (;;) {
      const r = await wReq('GET', `/job/${id}?from=${desde}`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      for (const e of r.data.entradas) {
        desde++;
        try { await wReproducir(m, jid, e, id); } catch (err) { console.error('[worker] no pude reproducir un mensaje:', err.message); }
      }
      if (r.data.estado === 'listo') break;
      if (r.data.estado === 'error') { await aviso('❌ No pude descargarlo. Probá de nuevo en un rato.'); break; }
      if (Date.now() - t0 > 25 * 60e3) throw new Error('tardó demasiado');
      await sleep(700);
    }
    console.log(`[worker] ${tipo} listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.error('[worker] se cortó la conexión:', e.message);
    await aviso('❌ Se cortó la conexión con el servidor de descargas. Probá de nuevo.');
  } finally { wReq('DELETE', `/job/${id}`).catch(() => {}); }
}
// punto de entrada de cada comando: con worker configurado va para allá; si no, corre local como siempre
const descargar = (m, jid, tipo, params, local, sinPlanB) => WORKER_URL? remoto(m, jid, tipo, params, sinPlanB? null : local) : local();

module.exports = { descargar, startWorker };
