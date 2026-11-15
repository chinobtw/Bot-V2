// Descarga de archivos a disco (con tope de peso) usada por todos los comandos de descarga
const axios = require('axios');
const fs = require('fs');
const { TT_MAX } = require('../../config');

const TT_DIR = './tmp_tt';          // descargas temporales (se borran solas)
const TT_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
fs.rmSync(TT_DIR, { recursive: true, force: true });

async function ttBajar(url, dest, referer = 'https://www.tiktok.com/') {
  const r = await axios.get(url, { responseType: 'stream', timeout: 30000, maxRedirects: 5, headers: { 'User-Agent': TT_UA, Referer: referer } });
  if (/text\/html|json/i.test(r.headers['content-type'] || '')) { r.data.destroy(); throw new Error('el enlace no devolvió un video'); }
  if (Number(r.headers['content-length'] || 0) > TT_MAX) { r.data.destroy(); throw new Error('GRANDE'); }
  await new Promise((ok, mal) => {
    let n = 0; const w = fs.createWriteStream(dest);
    r.data.on('data', c => { n += c.length; if (n > TT_MAX) { r.data.destroy(); w.destroy(); mal(new Error('GRANDE')); } });
    r.data.on('error', mal); w.on('error', mal); w.on('finish', ok);
    r.data.pipe(w);
  });
}

module.exports = { TT_DIR, TT_UA, ttBajar };
