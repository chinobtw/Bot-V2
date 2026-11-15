// Cliente de la API de Sylphy
const axios = require('axios');
const fs = require('fs');
const { TT_DIR, TT_UA, ttBajar } = require('./descarga');

// ---------- API de Sylphy (sylphyy.xyz): primera opción para YouTube y Spotify; yt-dlp queda de respaldo ----------
// .env: SYLPHY_KEY=tu_clave (sin la clave no se usa y todo sigue como antes). Opcionales: SYLPHY_URL, SYLPHY_Q (calidad del video, 720 por defecto)
const SYLPHY_URL = (process.env.SYLPHY_URL || 'https://sylphyy.xyz').replace(/\/+$/, '');
const sylphyOn = () => !!process.env.SYLPHY_KEY;
async function sylphyGet(ruta, params) {
  const r = await axios.get(SYLPHY_URL + ruta, { params, timeout: 60000, validateStatus: () => true,
    headers: { 'X-API-Key': process.env.SYLPHY_KEY, 'User-Agent': TT_UA, Accept: 'application/json' } });
  const d = r.data, res = d && typeof d === 'object'? d.result : null;
  if (r.status !== 200 || !d || d.status === false || !res || res.success === false || (typeof res === 'object' &&!Array.isArray(res) &&!Object.keys(res).length)) {
    const motivo = typeof d === 'string'? d : JSON.stringify(d?.error || res?.error || d || '');
    throw new Error(`sylphy ${ruta} -> ${r.status} ${String(motivo).slice(0, 200)}`);
  }
  return res;
}
const extDe = u => { try { return (new URL(u).pathname.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() || ''; } catch { return ''; } };
// baja el archivo que indica la API; devuelve { archivo, titulo }
async function sylphyBajar(res, audio, ref) {
  const u = res.dl_url || res.download_url || res.url;
  if (!/^https?:\/\//i.test(u || '')) throw new Error('la API no devolvió enlace de descarga');
  const ext = extDe(u);
  if (audio? ext &&!/^(mp3|m4a)$/.test(ext) : ext && ext!== 'mp4') throw new Error('formato inesperado: ' + ext);
  fs.mkdirSync(TT_DIR, { recursive: true });
  const archivo = `${TT_DIR}/yt_${Date.now()}_${Math.random().toString(36).slice(2)}.${audio? (ext || 'mp3') : 'mp4'}`;
  try {
    await ttBajar(u, archivo, ref);
    if (fs.statSync(archivo).size < 10 * 1024) throw new Error('archivo vacío');
  } catch (e) { fs.rmSync(archivo, { force: true }); throw e; }
  return { archivo, titulo: String(res.title || res.name || 'Sin título').trim() };
}
// YouTube: audio por /download/ytdl; video por /download/ytdl (720p) y, si falla, /download/v2/ytmp4 (360p)
async function sylphyYT(link, audio) {
  const fuentes = audio
    ? [() => sylphyGet('/download/ytdl', { url: link, mode: 'audio', q: 128 })]
    : [() => sylphyGet('/download/ytdl', { url: link, mode: 'video', q: process.env.SYLPHY_Q || 720 }),
       () => sylphyGet('/download/v2/ytmp4', { url: link })];
  let grande = false, ultimo;
  for (const f of fuentes) {
    try { return await sylphyBajar(await f(), audio, 'https://www.youtube.com/'); }
    catch (e) { if (e.message === 'GRANDE') grande = true; ultimo = e; console.error('[sylphy] YouTube:', e.message); }
  }
  throw grande? new Error('GRANDE') : ultimo;
}

module.exports = { sylphyBajar, sylphyGet, sylphyOn, sylphyYT };
