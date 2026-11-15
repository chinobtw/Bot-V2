// /apk: Aptoide y F-Droid
const axios = require('axios');
const fs = require('fs');
const { TT_MAX } = require('../../config');
const { TT_DIR, TT_UA, ttBajar } = require('../../src/lib/descarga');
const { ecoIds } = require('../../src/lib/economia');
const { dec } = require('../../src/lib/redes');
const { ctxBot, sock } = require('../../src/lib/state');
const { sylphyGet, sylphyOn } = require('../../src/lib/sylphy');
const { ytColaLarga, ytTurno } = require('../../src/lib/youtube');
const { descargar } = require('../../src/worker');

// ---------- /apk: busca en Aptoide y F-Droid (hasta 20 resultados) y manda el APK (se elige respondiendo a la lista con el número) ----------
const APK_API = 'https://ws75.aptoide.com/api/7/apps/search';
const APK_ESPERA = 5 * 60e3;                 // la lista vale 5 minutos
const apkPorMsg = new Map();                 // id del mensaje con la lista -> { bot, jid, ids, items }
const fmtMB = n => `${(n / 1048576).toFixed(n >= 10485760? 0 : 1)} MB`;
const APK_TOTAL = 20, APK_POR_FUENTE = 10;   // la lista tiene hasta 20: 10 de cada fuente (si una trae menos, la otra completa)
const FD_WEB = 'https://f-droid.org';
async function apkAptoide(q) {
  const r = await axios.get(`${APK_API}/query=${encodeURIComponent(q)}/limit=${APK_TOTAL}`, { timeout: 20000, headers: { 'User-Agent': TT_UA, Accept: 'application/json' } });
  const lista = r.data?.datalist?.list || [];
  return lista.filter(a => a.file?.path).slice(0, APK_TOTAL).map(a => ({
    fuente: 'Aptoide', nombre: a.name, paquete: a.package, version: a.file.vername || '', tam: a.file.filesize || a.size || 0,
    url: a.file.path, malware: String(a.file.malware?.rank || '').toUpperCase(), obb: !!a.obb,
  }));
}
// F-Droid: la búsqueda sale de la API de Sylphy (solo devuelve links de fichas) y el nombre, la versión y el APK salen de la ficha pública de F-Droid
const fdPaquete = u => (/\/packages\/([A-Za-z0-9._]+)/.exec(String(u?.url || u)) || [])[1] || null;
const fdBytes = (n, u) => Math.round(parseFloat(String(n).replace(/,/g, '')) * ({ KIB: 1024, MIB: 1048576, GIB: 1073741824 }[String(u).toUpperCase()] || 0)) || 0;
function fdFicha(html, paquete) {
  const esc = paquete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`https://f-droid\\.org/repo/${esc}_(\\d+)(_[0-9a-f]+)?\\.apk`, 'g'), apks = [];
  for (let m; (m = re.exec(html));) apks.push({ code: Number(m[1]), suf: m[2] || '', url: m[0], pos: m.index });
  if (!apks.length) return null;
  const buenos = apks.filter(x => !x.suf), elegido = (buenos.length? buenos : apks).reduce((p, x) => x.code > p.code? x : p);   // la versión más nueva (sin variante de firma)
  const nombre = dec((/<title>\s*([^<|]+?)\s*\|/.exec(html) || [])[1] || '').trim() || paquete;
  const antes = html.slice(Math.max(0, elegido.pos - 1500), elegido.pos), vers = [...antes.matchAll(/<b>\s*(?:Version|Versi[oó]n)\s+([^<]+?)\s*<\/b>/gi)].pop();
  const resto = html.slice(elegido.pos + 30, elegido.pos + 700), corte = resto.indexOf('/repo/'), peso = /([\d][\d.,]*)\s*(KiB|MiB|GiB)/i.exec(corte > 0? resto.slice(0, corte) : resto);   // el peso que figura después del link y antes del siguiente
  return { nombre, paquete, version: vers? dec(vers[1]) : `build ${elegido.code}`, tam: peso? fdBytes(peso[1], peso[2]) : 0, url: elegido.url, malware: '', obb: false, fuente: 'F-Droid' };
}
async function apkPool(lista, n, fn) {   // corre fn sobre cada elemento, de a n por vez; lo que falla queda en null
  const out = new Array(lista.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) { const k = i++; out[k] = await fn(lista[k], k).catch(() => null); } }));
  return out;
}
async function apkFDroid(q) {
  if (!sylphyOn()) return [];
  const res = await sylphyGet('/search/fdroid', { q });
  const paquetes = [...new Set((Array.isArray(res)? res : []).map(fdPaquete).filter(Boolean))].slice(0, APK_POR_FUENTE + 4);
  const fichas = await apkPool(paquetes, 5, async p => {
    const r = await axios.get(`${FD_WEB}/en/packages/${p}/`, { timeout: 9000, responseType: 'text', maxContentLength: 4e6, headers: { 'User-Agent': TT_UA, 'Accept-Language': 'en' } });
    const f = fdFicha(String(r.data), p);
    if (f &&!f.tam) { try { f.tam = Number((await axios.head(f.url, { timeout: 5000, headers: { 'User-Agent': TT_UA } })).headers['content-length']) || 0; } catch {} }   // si la ficha no dice el peso, se lo pregunta al servidor
    return f;
  });
  return fichas.filter(Boolean);
}
async function apkBuscar(q) {
  const [a, f] = await Promise.all([
    apkAptoide(q).catch(e => { console.error('[apk] Aptoide:', e.response?.status || '', e.message); return null; }),
    apkFDroid(q).catch(e => { console.error('[apk] F-Droid:', e.response?.status || '', e.message); return null; }),
  ]);
  if (!a &&!f) throw new Error('APK_FUENTES');
  const A = a || [], F = f || [];
  let nA = Math.min(A.length, APK_POR_FUENTE), nF = Math.min(F.length, APK_POR_FUENTE), resto = APK_TOTAL - nA - nF;
  const extraA = Math.min(A.length - nA, resto); nA += extraA; resto -= extraA;
  nF += Math.min(F.length - nF, resto);
  return [...A.slice(0, nA), ...F.slice(0, nF)];
}
const apkSello = r => r === 'TRUSTED'? '✅' : r === 'UNKNOWN' || !r? '⚠️' : '❌';
async function apkCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const q = text.replace(/^\/\S+\s*/, '').trim();
  if (!q) return reply('Uso: /apk <nombre de la app>\n> Ejemplo: /apk whatsapp\n> Después respondé a la lista con el número de la que querés.');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const items = await apkBuscar(q);
    if (!items.length) return await reply('🔎 No encontré apps con esa búsqueda');
    const bloques = []; let ult = '';
    items.forEach((a, i) => {
      if (a.fuente!== ult) { ult = a.fuente; bloques.push(`── *${ult}* ──`); }
      bloques.push(`*${i + 1}.* ${a.nombre}\n> ${a.paquete}\n> ${/^\d/.test(a.version)? 'v' : ''}${a.version} · ${a.tam? fmtMB(a.tam) : '?'} ${a.fuente === 'F-Droid'? '🌿' : apkSello(a.malware)}${a.tam > TT_MAX? ' · 🚫 pesa más del tope' : ''}${a.obb? ' · ⚠️ usa OBB (no se incluye)' : ''}`);
    });
    const lista = bloques.join('\n\n');
    const s = await sock.sendMessage(jid, { text: `📦 *Resultados para "${q}"*\n\n${lista}\n\n> Respondé a este mensaje con el número (1-${items.length}) para descargarlo\n> ✅ verificado por Aptoide · ⚠️ sin verificar · 🌿 F-Droid (código abierto)` }, { quoted: m });
    if (s?.key?.id) {
      const ids = await ecoIds(m, jid);
      apkPorMsg.set(s.key.id, { bot: ctxBot(), jid, ids, items });
      setTimeout(() => apkPorMsg.delete(s.key.id), APK_ESPERA).unref?.();
    }
  } catch (e) {
    console.error('[apk] ERROR búsqueda', e.response?.status || '', e.message);
    await reply('❌ No pude buscar ahora. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}
// respuesta con el número a la lista de /apk
async function apkElegir(m, jid, st, n) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const ids = await ecoIds(m, jid);
  if (!ids.some(x => st.ids.includes(x))) return reply('Esa lista no es tuya 🙄 Pedí la tuya con /apk');
  const a = st.items[n - 1]; if (!a) return;
  if (a.tam > TT_MAX) return reply(`❌ *${a.nombre}* pesa ${fmtMB(a.tam)} y el tope es ${TT_MAX / 1024 / 1024} MB.`);
  return descargar(m, jid, 'apk', { a }, () => apkEnviar(m, jid, a));
}
// baja el APK elegido y lo envía (en modo worker corre en el worker)
async function apkEnviar(m, jid, a) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  fs.mkdirSync(TT_DIR, { recursive: true });
  const f = `${TT_DIR}/apk_${Date.now()}_${Math.random().toString(36).slice(2)}.apk`;
  try {
    if (ytColaLarga()) await reply('⏳ Hay otra descarga en curso. Te toca en un rato.');
    await ytTurno(async () => {
      console.log(`[apk] bajando ${a.nombre} ${a.version} (${fmtMB(a.tam)})`);
      await ttBajar(a.url, f, a.fuente === 'F-Droid'? 'https://f-droid.org/' : 'https://www.aptoide.com/');
      const peso = fs.statSync(f).size;
      const nombre = `${a.nombre}_${a.version}`.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') + '.apk';
      const doc = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      await sock.sendMessage(jid, { document: doc, mimetype: 'application/vnd.android.package-archive', fileName: nombre,
        caption: `📦 *${a.nombre}*\n> ${/^\d/.test(a.version)? 'v' : ''}${a.version} · ${fmtMB(peso)}\n> ${a.paquete}${a.fuente? `\n> Fuente: ${a.fuente}` : ''}${a.obb? '\n> ⚠️ Esta app usa archivos OBB que no se incluyen' : ''}` }, { quoted: m });
      console.log(`[apk] enviado ${nombre} ${fmtMB(peso)}`);
    });
  } catch (e) {
    console.error('[apk] ERROR', e.response?.status || '', e.message);
    await reply(e.message === 'GRANDE'? `❌ El APK pesa más de ${TT_MAX / 1024 / 1024} MB` : '❌ No pude descargar ese APK. Probá con otro de la lista o de nuevo en un rato');
  } finally { fs.rmSync(f, { force: true }); reaccion(''); }
}
const CMD_APK = [{ test: c => /^\/apk(\s|$)/i.test(c.text), run: c => apkCmd(c.m, c.jid, c.text) }];
const RESP_APK = [{ re: /^(\d{1,2})\W*$/, mapa: apkPorMsg, run: (m, jid, st, qid, mt) => apkElegir(m, jid, st, Number(mt[1])) }];
const WORKER_APK = { apk: { clase: 'pesado', run: (m, jid, text, b) => b.a && /^https:\/\/([\w.-]+\.aptoide\.com|f-droid\.org)\//.test(String(b.a.url)) && apkEnviar(m, jid, b.a) } };

module.exports = { fmtMB };
module.exports.commands = [...CMD_APK];
module.exports.respuestas = [...RESP_APK];
module.exports.worker = Object.assign({}, WORKER_APK);
