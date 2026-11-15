// /search: busca en YouTube
const axios = require('axios');
const fs = require('fs');
const { sock } = require('../../src/lib/state');

// ---------- /search: busca en YouTube y lista los primeros 20 (título, duración y link) ----------
// Va directo a la web de YouTube con tus cookies (YT_COOKIES=./cookies.txt, formato Netscape), sin yt-dlp: es liviano y no tumba el hosting por memoria.
const YT_WEB = (process.env.YT_WEB_URL || 'https://www.youtube.com').replace(/\/+$/, '');
const YT_UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// lee el cookies.txt y arma el encabezado Cookie solo con las de youtube.com
function ytCookieHeader() {
  const f = process.env.YT_COOKIES;
  if (!f ||!fs.existsSync(f)) return '';
  const v = new Map();
  for (let l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (l.startsWith('#HttpOnly_')) l = l.slice(10); else if (!l.trim() || l.startsWith('#')) continue;
    const c = l.split('\t'); if (c.length < 7) continue;
    if (!/(^|\.)youtube\.com$/i.test(c[0].replace(/^\./, ''))) continue;
    if (Number(c[4]) > 0 && Number(c[4]) < Date.now() / 1000) continue;   // vencida
    v.set(c[5], c.slice(6).join('\t').trim());
  }
  return [...v].map(([k, x]) => `${k}=${x}`).join('; ');
}
// recorre el JSON de YouTube y junta los videos (soporta el formato clásico y el nuevo "lockup")
function ytVideosDe(obj, out = new Map(), cont = { t: null }) {
  if (!obj || typeof obj!== 'object') return out;
  if (Array.isArray(obj)) { for (const x of obj) ytVideosDe(x, out, cont); return out; }
  const vr = obj.videoRenderer;
  if (vr?.videoId &&!out.has(vr.videoId)) {
    const live = (vr.thumbnailOverlays || []).some(o => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE') ||!vr.lengthText;
    out.set(vr.videoId, { id: vr.videoId, titulo: (vr.title?.runs || []).map(r => r.text).join('') || vr.title?.simpleText || '', dur: vr.lengthText?.simpleText || (live? 'en vivo' : '') });
  }
  const lk = obj.lockupViewModel;
  if (lk?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lk.contentId &&!out.has(lk.contentId)) {
    let dur = '';
    for (const o of lk.contentImage?.thumbnailViewModel?.overlays || [])
      for (const b of o.thumbnailBottomOverlayViewModel?.badges || []) dur = dur || b.thumbnailBadgeViewModel?.text || '';
    out.set(lk.contentId, { id: lk.contentId, titulo: lk.metadata?.lockupMetadataViewModel?.title?.content || '', dur });
  }
  const tk = obj.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  if (tk) cont.t = tk;
  for (const k of Object.keys(obj)) if (k!== 'videoRenderer' && k!== 'lockupViewModel') ytVideosDe(obj[k], out, cont);
  return out;
}
async function ytBuscarLista(q, max = 20) {
  const ck = ytCookieHeader();
  const hdr = { 'User-Agent': YT_UA_PC, 'Accept-Language': 'es-AR,es;q=0.9', ...(ck? { Cookie: ck } : {}) };
  const r = await axios.get(`${YT_WEB}/results`, { params: { search_query: q, hl: 'es', gl: 'AR' }, timeout: 20000, headers: hdr });
  const html = String(r.data);
  const m = /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
  if (!m) throw new Error('YT_SIN_DATOS');
  const cont = { t: null }, out = new Map();
  ytVideosDe(JSON.parse(m[1]), out, cont);
  // si la primera página no llega a 20, pide las siguientes
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1], ver = /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1] || '2.20240101.00.00';
  for (let i = 0; i < 3 && out.size < max && cont.t && key; i++) {
    const tk = cont.t; cont.t = null;
    try {
      const r2 = await axios.post(`${YT_WEB}/youtubei/v1/search`, { context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'es', gl: 'AR' } }, continuation: tk }, { params: { key }, timeout: 20000, headers: { ...hdr, 'Content-Type': 'application/json' } });
      ytVideosDe(r2.data, out, cont);
    } catch (e) { console.error('[search] página siguiente falló:', e.message); break; }
  }
  const lista = [...out.values()].filter(v => v.titulo).slice(0, max);
  if (!lista.length) { console.log('[search] sin videos; claves de la página:', Object.keys(JSON.parse(m[1])).join(',')); throw new Error('SIN_RESULTADOS'); }
  return lista;
}
async function searchCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const q = text.replace(/^\/\S+\s*/, '').trim();
  if (!q) return reply('Uso: /search <búsqueda>\n> Ejemplo: /search los gardelitos\n> Te muestro los primeros 20 resultados de YouTube con título, duración y link.');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const lista = await ytBuscarLista(q, 20);
    const cortar = t => t.length > 90? t.slice(0, 89).trimEnd() + '…' : t;
    const cuerpo = lista.map((v, i) => `*${i + 1}.* ${cortar(v.titulo)}\n> ⏱ ${v.dur || '—'}\n> https://youtu.be/${v.id}`).join('\n\n');
    await sock.sendMessage(jid, { text: `🔎 *Resultados para "${q}"*\n\n${cuerpo}` }, { quoted: m });
    console.log(`[search] "${q}": ${lista.length} resultados${process.env.YT_COOKIES? '' : ' (sin cookies)'}`);
  } catch (e) {
    console.error('[search] ERROR', e.response?.status || '', e.message);
    await reply(e.message === 'SIN_RESULTADOS'? '🔎 No encontré nada con esa búsqueda'
      : e.response?.status === 429 || e.response?.status === 403? '❌ YouTube bloqueó la búsqueda ahora. Probá de nuevo en un rato'
      : '❌ No pude buscar en YouTube ahora. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}
const CMD_SEARCH = [{ test: c => /^\/search(\s|$)/i.test(c.text), run: c => searchCmd(c.m, c.jid, c.text) }];

module.exports = { YT_UA_PC, YT_WEB, ytBuscarLista, ytCookieHeader };
module.exports.commands = [...CMD_SEARCH];
