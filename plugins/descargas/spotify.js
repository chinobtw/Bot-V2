// /spotify
const fs = require('fs');
const { TT_MAX } = require('../../config');
const { ytEnviar } = require('./youtube');
const { sock } = require('../../src/lib/state');
const { sylphyBajar, sylphyGet, sylphyOn } = require('../../src/lib/sylphy');

// ---------- /spotify: audio de Spotify con la API de Sylphy (link de la canción o título) ----------
const SP_RE = /https?:\/\/open\.spotify\.com\/[^\s<>"']+/i;
const NO_URL = /thumb|cover|image|img|icon|preview|avatar|poster/i;
// busca un enlace http dentro de la respuesta: primero en las claves esperadas y, si no, en cualquier otra que no sea una imagen
function spUrl(o, claves = ['dl_url', 'download_url', 'download', 'url', 'link', 'audio']) {
  if (!o || typeof o!== 'object') return null;
  for (const k of claves) if (typeof o[k] === 'string' && /^https?:\/\//i.test(o[k])) return o[k];
  for (const [k, v] of Object.entries(o)) {
    if (NO_URL.test(k)) continue;
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    if (v && typeof v === 'object') { const r = spUrl(v, claves); if (r) return r; }
  }
  return null;
}
function spPrimerTema(res) {
  const lista = Array.isArray(res)? res : (Object.values(res).find(Array.isArray) || []);
  const t = lista[0]; if (!t) return null;
  const link = [t.spotify_url, t.url, t.link, t.external_urls?.spotify].find(x => typeof x === 'string' && SP_RE.test(x))
    || (t.id? `https://open.spotify.com/track/${t.id}` : null) || spUrl(t, ['spotify_url', 'url', 'link']);
  return link? { link, titulo: t.title || t.name || '', artista: t.artist || t.artists?.map?.(a => a.name || a).join(', ') || '' } : null;
}
async function spotifyCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || '') : '';
  const link = (arg.match(SP_RE) || qt.match(SP_RE) || [])[0];
  if (!link &&!arg) return reply('Uso:\n/spotify <link de la canción>\n/spotify <título y artista>\n/spotify (respondiendo a un mensaje con el link)');
  if (!sylphyOn()) { console.error('[sylphy] falta SYLPHY_KEY'); return reply('❌ Este comando no está disponible ahora'); }
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  let it;
  try {
    let url = link, extra = '';
    if (!url) {
      const t = spPrimerTema(await sylphyGet('/search/spotify', { q: arg }));
      if (!t) throw Object.assign(new Error('SIN_RESULTADOS'), { sin: true });
      url = t.link; extra = [t.titulo, t.artista].filter(Boolean).join(' - ');
    }
    const res = await sylphyGet('/download/spotify', { url });
    const dl = spUrl(res);
    if (!dl) { console.log('[spotify] respuesta sin enlace:', JSON.stringify(res).slice(0, 400)); throw new Error('la API no devolvió enlace de descarga'); }
    const titulo = [res.title || res.name, res.artist || res.artists?.map?.(a => a.name || a).join(', ')].filter(x => typeof x === 'string' && x).join(' - ') || extra || 'Spotify';
    it = await sylphyBajar({ dl_url: dl, title: titulo }, true, 'https://open.spotify.com/');
    await ytEnviar(m, jid, it, true);
  } catch (e) {
    console.error('[spotify] ERROR', e.message);
    await reply(e.sin? '🔎 No encontré nada con esa búsqueda' : e.message === 'GRANDE'? `❌ El archivo pesa más de ${TT_MAX / 1024 / 1024} MB`
      : /403|401|certificate|altnames|5\d\d/.test(e.message)? '❌ Spotify no responde ahora. Probá en un rato' : '❌ No pude descargarlo. Revisá el link y probá de nuevo');
  } finally { if (it?.archivo) fs.rmSync(it.archivo, { force: true }); reaccion(''); }
}
const CMD_SPOTIFY = [{ test: c => /^\/spotify(\s|$)/i.test(c.text), run: c => spotifyCmd(c.m, c.jid, c.text) }];

module.exports = { spUrl };
module.exports.commands = [...CMD_SPOTIFY];
