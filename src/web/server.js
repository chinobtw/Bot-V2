// Página web y API para vincular y administrar sub-bots
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { BOT_NAME, HTTP_PORT, PUBLIC_URL, WEB_CANAL, WEB_NOMBRE } = require('../../config');
const { limpiar } = require('../../plugins/personalizar/index');
const { MAX_SUBBOTS, PEND_MS, SUB_DIR, bajaSub, pendientes } = require('../../plugins/subbots/index');
const { cfgOf, setCfg } = require('../db/ajustes');
const { saveSubs, subReg } = require('../db/subbots');
const { BANNER_BODY, BANNER_DIR, DEFAULT_CURRENCY, bannerBuf, bannerCard, bannerPath, bannerVer } = require('../lib/banner');
const { idBySlug, nameOfId, slugOf } = require('../lib/identidad');
const { startInstance } = require('../lib/instancias');
const { QRCode, sharp } = require('../lib/optional');
const { prefijo } = require('../lib/prefijo');
const { botIds, instances, num } = require('../lib/state');
const { buildMenu, countCmds } = require('../menu');
const { WEB_PAGE } = require('./pagina');

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const webJobs = new Map();   // id de vinculación -> estado (lo consulta la página)
const limites = new Map();   // "clave|ip" -> [horas de los intentos]
const ipDe = req => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '');
function limite(clave, max, ms) {
  const ahora = Date.now(), a = (limites.get(clave) || []).filter(t => ahora - t < ms);
  if (a.length >= max) { limites.set(clave, a); return false; }
  a.push(ahora); limites.set(clave, a); return true;
}
setInterval(() => {
  const ahora = Date.now();
  for (const [k, a] of limites) { const f = a.filter(t => ahora - t < 3600e3); f.length? limites.set(k, f) : limites.delete(k); }
  for (const [k, j] of webJobs) if (ahora - j.t > 10 * 60e3) webJobs.delete(k);
}, 60e3).unref();

const jsonRes = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); };
function leerCuerpo(req, max) {
  return new Promise((ok, mal) => {
    const ch = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { mal(Object.assign(new Error('Archivo demasiado grande'), { code: 413 })); req.destroy(); return; } ch.push(c); });
    req.on('end', () => ok(Buffer.concat(ch))); req.on('error', mal);
  });
}
// los "dueños" se reconocen por un secreto que el navegador guarda al vincular; acá solo se guarda su hash
const tokensDe = req => String(req.headers['x-owner-tokens'] || '').split(',').map(s => s.trim()).filter(s => /^[a-f0-9]{48}$/.test(s)).slice(0, 20).map(sha);
const esMio = (id, hs) => id!== 'main' &&!!subReg[id]?.tok && hs.includes(subReg[id].tok);
const idPorSlug = slug => ['main',...Object.keys(subReg)].find(id => slugOf(id) === slug) || null;

const gruposCache = new Map(); // id -> { n, t, cargando }
function gruposDe(id) {
  const c = gruposCache.get(id) || {}, inst = instances.get(id);
  if (inst?.online &&!c.cargando && (!c.t || Date.now() - c.t > 5 * 60e3)) {
    c.cargando = true; gruposCache.set(id, c);
    Promise.resolve().then(() => inst.sock.groupFetchAllParticipating())
      .then(g => { c.n = Object.keys(g).length; }).catch(() => {})
      .finally(() => { c.t = Date.now(); c.cargando = false; });
  }
  return c.n?? null;
}
function infoBot(id, hs) {
  const inst = instances.get(id), slug = slugOf(id), bp = bannerPath(id), mio = esMio(id, hs);
  return {
    slug, nombre: nameOfId(id), principal: id === 'main', online:!!inst?.online, desde: inst?.since || null, grupos: gruposDe(id),
    banner: fs.existsSync(bp)? `/b/${slug}.jpg?v=${Math.floor(fs.statSync(bp).mtimeMs)}` : null,
    mio,...(mio? { numero: id, prefijo: prefijo(id), moneda: cfgOf(id).currency || DEFAULT_CURRENCY } : {}),
  };
}

function opcionesWeb(numero, modo, job) {
  const fallar = msg => { if (job.estado === 'conectado') return; job.estado = 'error'; job.error = msg; bajaSub(numero); };
  return {
    authDir: `${SUB_DIR}/${numero}`,
    name: BOT_NAME,
    pairingNumber: modo === 'code'? numero : null,
    onPairing: code => { if (job.estado!== 'conectado') { job.code = code; job.estado = 'codigo'; } },
    onQR: async qr => {
      if (modo!== 'qr' ||!pendientes.has(numero)) return;
      try { job.qr = await QRCode.toDataURL(qr, { scale: 8, margin: 1 }); job.estado = 'qr'; } catch (e) { console.error('[web qr]', e.message); }
    },
    onOpen: async s => {
      const p = pendientes.get(numero);
      if (!p) return; // reconexión normal de un sub-bot ya registrado
      if (modo === 'qr' && num(s.user?.id)!== numero) { // con QR puede escanear cualquier cuenta: tiene que ser la del número indicado
        const otro = num(s.user?.id);
        try { await s.logout(); } catch {}
        return fallar(`Ese QR lo escaneó otra cuenta (${otro}) y no el número ${numero}. Probá de nuevo con la cuenta correcta.`);
      }
      clearTimeout(p.timer); pendientes.delete(numero);
      const token = crypto.randomBytes(24).toString('hex');
      subReg[numero] = { name: BOT_NAME, chat: null, quien: null, since: Date.now(), tok: sha(token), web: true }; saveSubs();
      job.token = token; job.estado = 'conectado';
    },
    onClose: code => {
      if (!pendientes.has(numero) || code === DisconnectReason.restartRequired) return false;
      fallar(modo === 'qr'? 'El QR venció. Probá de nuevo.' : 'El código venció o se cortó la conexión. Probá de nuevo.');
      return true;
    },
    onLoggedOut: () => { const era = pendientes.has(numero); if (era) fallar('No se pudo vincular. Probá de nuevo.'); else bajaSub(numero); },
  };
}

const MIME_IMG = b => (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP');

async function webApi(req, res, path) {
  const ip = ipDe(req), hs = tokensDe(req);
  let m;
  if (req.method === 'GET' && path === '/api/stats') {
    const ids = ['main',...Object.keys(subReg)];
    const gs = ids.map(id => gruposDe(id)).filter(n => n!= null);
    return jsonRes(res, 200, {
      nombre: nameOfId('main'), online: ids.filter(id => instances.get(id)?.online).length, total: ids.length,
      grupos: gs.length? gs.reduce((a, b) => a + b, 0) : null,
      comandos: countCmds(buildMenu({ botName: '', system: '', user: '', totalCommands: 0, owner: true })),
      uptime: Math.floor(process.uptime()), usados: Object.keys(subReg).length, max: MAX_SUBBOTS,
    });
  }
  if (req.method === 'GET' && path === '/api/bots') {
    return jsonRes(res, 200, { bots: ['main',...Object.keys(subReg)].map(id => infoBot(id, hs)), max: MAX_SUBBOTS });
  }
  if (req.method === 'POST' && path === '/api/link') {
    let b; try { b = JSON.parse((await leerCuerpo(req, 2000)).toString() || '{}'); } catch { return jsonRes(res, 400, { error: 'Pedido inválido' }); }
    const numero = String(b.numero || '').replace(/\D/g, ''), modo = b.modo === 'qr'? 'qr' : 'code';
    if (numero.length < 8 || numero.length > 15) return jsonRes(res, 400, { error: 'Ingresá un número válido, con código de país.' });
    if (botIds().includes(numero)) return jsonRes(res, 400, { error: 'Ese número es el del bot principal.' });
    if (subReg[numero]) return jsonRes(res, 409, { error: 'Ese número ya es un sub-bot activo.' });
    if (pendientes.has(numero)) return jsonRes(res, 409, { error: 'Ya hay una vinculación en curso para ese número. Esperá un par de minutos.' });
    if (Object.keys(subReg).length + pendientes.size >= MAX_SUBBOTS) return jsonRes(res, 409, { error: `Se alcanzó el máximo de sub-bots (${MAX_SUBBOTS}).` });
    if (modo === 'qr' &&!QRCode) return jsonRes(res, 500, { error: 'El QR no está disponible en este servidor. Usá el código.' });
    if (!limite('link|' + ip, 3, 3600e3)) return jsonRes(res, 429, { error: 'Hiciste demasiados intentos. Probá de nuevo en un rato.' });
    const id = crypto.randomBytes(8).toString('hex');
    const job = { id, numero, modo, estado: 'esperando', code: null, qr: null, error: null, token: null, t: Date.now() };
    webJobs.set(id, job);
    const pend = { qrCount: 0 };
    pend.timer = setTimeout(() => {
      if (pendientes.get(numero)!== pend) return;
      job.estado = 'error'; job.error = 'Se agotó el tiempo. Probá de nuevo.'; bajaSub(numero);
    }, PEND_MS);
    pendientes.set(numero, pend);
    startInstance(numero, opcionesWeb(numero, modo, job)).catch(e => {
      console.error('[web] no pude iniciar', e.message);
      if (job.estado!== 'conectado') { job.estado = 'error'; job.error = 'No pude iniciar la vinculación. Probá de nuevo.'; bajaSub(numero); }
    });
    return jsonRes(res, 200, { id });
  }
  if (req.method === 'GET' && (m = path.match(/^\/api\/link\/([a-f0-9]{16})$/))) {
    const j = webJobs.get(m[1]);
    if (!j) return jsonRes(res, 404, { error: 'Vinculación no encontrada' });
    return jsonRes(res, 200, { estado: j.estado, code: j.estado === 'codigo'? j.code : null, qr: j.estado === 'qr'? j.qr : null, error: j.error, token: j.estado === 'conectado'? j.token : null, restante: Math.max(0, Math.round((j.t + PEND_MS - Date.now()) / 1000)) });
  }
  if (req.method === 'POST' && (m = path.match(/^\/api\/bot\/([a-f0-9]{12})\/(config|banner|banner\/borrar)$/))) {
    const id = idPorSlug(m[1]);
    if (!id ||!esMio(id, hs)) return jsonRes(res, 403, { error: 'Este bot no está vinculado desde este navegador.' });
    if (!limite('cfg|' + ip, 40, 600e3)) return jsonRes(res, 429, { error: 'Demasiados cambios seguidos. Esperá un momento.' });
    if (m[2] === 'config') {
      let b; try { b = JSON.parse((await leerCuerpo(req, 4000)).toString() || '{}'); } catch { return jsonRes(res, 400, { error: 'Pedido inválido' }); }
      const nombre = limpiar(b.nombre?? ''), moneda = limpiar(b.moneda?? ''), pref = Array.from(limpiar(b.prefijo?? ''));
      if (nombre.length > 40) return jsonRes(res, 400, { error: 'El nombre puede tener hasta 40 caracteres.' });
      if (moneda.length > 20) return jsonRes(res, 400, { error: 'La moneda puede tener hasta 20 caracteres.' });
      if (pref.length > 1 || (pref.length === 1 &&!/^[\p{L}\p{P}\p{S}]$/u.test(pref[0]))) return jsonRes(res, 400, { error: 'El prefijo tiene que ser un solo símbolo o letra.' });
      const nuevo = { name: nombre || null, currency: moneda && moneda!== DEFAULT_CURRENCY? moneda : null, prefix: pref[0] && pref[0]!== '/'? pref[0] : null };
      setCfg(id, nuevo);
      return jsonRes(res, 200, { ok: true });
    }
    if (m[2] === 'banner/borrar') { fs.rmSync(bannerPath(id), { force: true }); return jsonRes(res, 200, { ok: true }); }
    let buf;
    try { buf = await leerCuerpo(req, 8 * 1048576); } catch (e) { return jsonRes(res, e.code === 413? 413 : 400, { error: 'La imagen pesa demasiado (máx. 8 MB).' }); }
    if (!buf.length ||!MIME_IMG(buf)) return jsonRes(res, 400, { error: 'Tiene que ser una imagen JPG, PNG o WEBP.' });
    if (sharp) { try { buf = await sharp(buf).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); } catch { return jsonRes(res, 400, { error: 'No pude leer esa imagen.' }); } }
    else if (buf.length > 1.5e6) return jsonRes(res, 413, { error: 'La imagen pesa demasiado (máx. 1.5 MB).' });
    fs.mkdirSync(BANNER_DIR, { recursive: true });
    fs.writeFileSync(bannerPath(id), buf);
    return jsonRes(res, 200, { ok: true });
  }
  return jsonRes(res, 404, { error: 'No encontrado' });
}

function startWeb() {
  if (!PUBLIC_URL ||!HTTP_PORT) { // solo si se configuró el dominio y hay puerto
    console.log(`🌐 Web de banners apagada: ${!PUBLIC_URL? 'falta BANNER_PUBLIC_URL' : ''}${!PUBLIC_URL &&!HTTP_PORT? ' y ' : ''}${!HTTP_PORT? 'no hay puerto (SERVER_PORT / WEB_PORT / PORT)' : ''}`);
    return;
  }
  http.createServer((req, res) => {
    let m;
    const path = (req.url || '/').split('?')[0];
    if (path === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.end(WEB_PAGE.replace(/__NOMBRE__/g, esc(WEB_NOMBRE)).replace(/__CANAL__/g, esc(WEB_CANAL)).replace(/__IMG__/g, esc(`${PUBLIC_URL}/b/${slugOf('main')}.jpg?v=${bannerVer('main')}`)));
    }
    if (path.startsWith('/api/')) return webApi(req, res, path).catch(e => { console.error('[web]', e.message); if (!res.headersSent) jsonRes(res, 500, { error: 'Error interno' }); });
    if ((m = path.match(/^\/b\/([a-f0-9]{12})\.jpg$/)) && idBySlug(m[1])) {
      const img = bannerBuf(idBySlug(m[1])); // el del bot o, si no tiene, el de fábrica
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=300' });
      return res.end(img);
    }
    if ((m = path.match(/^\/c\/([a-f0-9]{12})\.jpg$/)) && idBySlug(m[1])) {   // la foto del menú ya acomodada para la tarjeta
      return bannerCard(idBySlug(m[1])).then(img => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=300' });
        res.end(img);
      }).catch(() => { res.writeHead(500); res.end(); });
    }
    if ((m = path.match(/^\/p\/([a-f0-9]{12})$/)) && idBySlug(m[1])) {
      const id = idBySlug(m[1]), nombre = esc(nameOfId(id)), img = `${PUBLIC_URL}/b/${m[1]}.jpg`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nombre}</title>
<meta property="og:type" content="website"><meta property="og:title" content="${nombre}">
<meta property="og:description" content="${esc(BANNER_BODY)}"><meta property="og:image" content="${img}">
<style>body{margin:0;background:#0b0b0f;color:#eee;font-family:system-ui,sans-serif;text-align:center}img{max-width:100%;display:block;margin:0 auto}h1{font-weight:600}</style>
</head><body><img src="${img}" alt=""><h1>${nombre}</h1><p>${esc(BANNER_BODY)}</p></body></html>`);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  }).on('error', e => console.error('[web]', e.message))
    .listen(HTTP_PORT, '0.0.0.0', () => console.log(`🌐 Web de banners en el puerto ${HTTP_PORT} (${PUBLIC_URL})`));
}

module.exports = { startWeb };
