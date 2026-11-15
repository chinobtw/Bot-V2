// Ficha de información de YouTube (-info y al descargar)
const axios = require('axios');
const { YT_UA_PC, YT_WEB, ytCookieHeader } = require('./search');
const { sock } = require('../../src/lib/state');
const { ytEntrada } = require('../../src/lib/youtube');

// ---------- ficha de información de YouTube (tarjeta con la miniatura): se manda antes del audio/video, o sola con -info ----------
const YT_INFO_RE = /(^|\s)-info(?=\s|$)/i;
const YT_ID_RE = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/;
const ytIdDe = l => (YT_ID_RE.exec(l || '') || [])[1] || null;
const ytNum = t => { const d = String(t || '').replace(/\D/g, ''); return d? Number(d) : null; };
// busca las fichas (título, canal, duración, vistas, fecha) dentro del JSON de la página de resultados (formato clásico y "lockup")
function ytFichasDe(obj, out = new Map()) {
  if (!obj || typeof obj!== 'object') return out;
  if (Array.isArray(obj)) { for (const x of obj) ytFichasDe(x, out); return out; }
  const vr = obj.videoRenderer;
  if (vr?.videoId &&!out.has(vr.videoId)) {
    const txt = o => o?.simpleText || (o?.runs || []).map(r => r.text).join('') || '';
    out.set(vr.videoId, { id: vr.videoId, titulo: txt(vr.title), canal: txt(vr.ownerText) || txt(vr.longBylineText), dur: txt(vr.lengthText), vistas: ytNum(txt(vr.viewCountText)), publicado: txt(vr.publishedTimeText) });
  }
  const lk = obj.lockupViewModel;
  if (lk?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lk.contentId &&!out.has(lk.contentId)) {
    let dur = '';
    for (const o of lk.contentImage?.thumbnailViewModel?.overlays || [])
      for (const b of o.thumbnailBottomOverlayViewModel?.badges || []) dur = dur || b.thumbnailBadgeViewModel?.text || '';
    const filas = (lk.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || []).map(f => (f.metadataParts || []).map(p => p.text?.content || '').filter(Boolean));
    let canal = '', vistas = null, publicado = '';
    for (const fila of filas) for (const t of fila) {
      if (/visualizaci|views|vistas|espectador|watching/i.test(t)) vistas = ytNum(t);
      else if (/\bhace\b|\bago\b|transmitido|streamed/i.test(t)) publicado = t;
      else if (!canal) canal = t;
    }
    out.set(lk.contentId, { id: lk.contentId, titulo: lk.metadata?.lockupMetadataViewModel?.title?.content || '', canal, dur, vistas, publicado });
  }
  for (const k of Object.keys(obj)) if (k!== 'videoRenderer' && k!== 'lockupViewModel') ytFichasDe(obj[k], out);
  return out;
}
// información del video: de un link de YouTube o del primer resultado de un texto. Devuelve null si no se consigue nada (nunca tira error)
async function ytInfo(consulta) {
  const id = ytIdDe(consulta), q = id || String(consulta || '').trim();
  if (!q) return null;
  let f = null;
  try {
    const ck = ytCookieHeader();
    const r = await axios.get(`${YT_WEB}/results`, { params: { search_query: q, hl: 'es', gl: 'AR' }, timeout: 15000, headers: { 'User-Agent': YT_UA_PC, 'Accept-Language': 'es-AR,es;q=0.9', ...(ck? { Cookie: ck } : {}) } });
    const m = /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(String(r.data));
    if (m) { const fichas = ytFichasDe(JSON.parse(m[1])); f = id? fichas.get(id) : [...fichas.values()].find(x => x.titulo); }
  } catch (e) { console.error('[yt-info] búsqueda:', e.message); }
  if (!f && id) {   // plan B: oEmbed (solo título y canal)
    try {
      const r = await axios.get('https://www.youtube.com/oembed', { params: { url: `https://www.youtube.com/watch?v=${id}`, format: 'json' }, timeout: 10000, headers: { 'User-Agent': YT_UA_PC } });
      if (r.data?.title) f = { id, titulo: r.data.title, canal: r.data.author_name || '', dur: '', vistas: null, publicado: '' };
    } catch (e) { console.error('[yt-info] oembed:', e.message); }
  }
  return f && f.titulo? { ...f, link: `https://youtu.be/${f.id}` } : null;
}
const ytLimpio = s => String(s || '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
function ytTarjeta(f, pie = '') {
  const filas = [
    f.canal && `📺 *Canal* ➜ ${ytLimpio(f.canal)}`,
    f.dur && `⏱️ *Duración* ➜ ${f.dur}`,
    f.vistas!= null && `👁️ *Vistas* ➜ ${f.vistas.toLocaleString('es-AR')}`,
    f.publicado && `📅 *Publicado* ➜ ${ytLimpio(f.publicado)}`,
    `🔗 ${f.link || `https://youtu.be/${f.id}`}`,
  ].filter(Boolean);
  const caja = filas.map((t, i) => `${filas.length === 1? '┗' : i === 0? '┏' : i === filas.length - 1? '┗' : '┣'} ${t}`).join('\n');
  return `▶️ *YouTube*\n━━━━━━━━━━━━━━━━━━\n*${ytLimpio(f.titulo)}*\n\n${caja}\n━━━━━━━━━━━━━━━━━━${pie? `\n${pie}` : ''}`;
}
// miniatura en la mejor calidad que exista (las más grandes no están en todos los videos)
async function ytMiniatura(id) {
  for (const n of ['maxresdefault', 'hq720', 'mqdefault']) {
    try {
      const r = await axios.get(`https://i.ytimg.com/vi/${id}/${n}.jpg`, { responseType: 'arraybuffer', timeout: 10000, headers: { 'User-Agent': YT_UA_PC } });
      if (r.data?.length > 2000) return Buffer.from(r.data);
    } catch {}
  }
  return null;
}
async function ytMandarFicha(m, jid, f, pie) {
  const txt = ytTarjeta(f, pie), img = f.id? await ytMiniatura(f.id) : null;
  if (img) {
    try { return await sock.sendMessage(jid, { image: img, caption: txt }, { quoted: m }); }
    catch (e) { console.error('[yt-info] no pude mandar la foto, va solo el texto:', e.message); }
  }
  return sock.sendMessage(jid, { text: txt }, { quoted: m });
}
// /ytmp3 -info <link o título> y /ytmp4 -info <link o título>: solo la ficha, sin descargar nada
async function ytInfoCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const cmd = (text.match(/^\/\S+/) || ['/ytmp4'])[0].toLowerCase();
  const { arg, link } = ytEntrada(m, text.replace(YT_INFO_RE, ' '));
  if (!link &&!arg) return reply(`Uso:\n${cmd} -info <link de YouTube>\n${cmd} -info <título o búsqueda>\n> Te mando solo la información del video, sin descargarlo.`);
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  try {
    const f = await ytInfo(link || arg);
    if (!f) return await reply(link? '❌ No pude obtener la información de ese video. Revisá el link y probá de nuevo en un rato' : '🔎 No encontré nada con esa búsqueda');
    await ytMandarFicha(m, jid, f);   // la MISMA ficha que se manda antes de descargar
  } catch (e) {
    console.error('[yt-info] ERROR', e.message);
    await reply('❌ No pude obtener la información. Probá de nuevo en un rato');
  } finally { reaccion(''); }
}

module.exports = { YT_INFO_RE, ytInfo, ytInfoCmd, ytMandarFicha };
