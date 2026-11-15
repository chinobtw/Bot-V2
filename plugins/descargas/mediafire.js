// /mf: MediaFire
const axios = require('axios');
const fs = require('fs');
const { TT_MAX } = require('../../config');
const { fmtMB } = require('./apk');
const { YT_UA_PC } = require('./search');
const { TT_DIR, ttBajar } = require('../../src/lib/descarga');
const { dec } = require('../../src/lib/redes');
const { sock } = require('../../src/lib/state');
const { ytColaLarga, ytTurno } = require('../../src/lib/youtube');
const { descargar } = require('../../src/worker');

// ---------- /mf /mediafire: archivos de MediaFire (links públicos de un archivo; no pide cuenta) ----------
// Saca el enlace directo de la página del archivo y lo baja. Si la página pide contraseña, captcha o verificación, avisa y no intenta esquivarlo.
const MF_RE = /https?:\/\/(?:www\.|download\d*\.)?mediafire\.com\/[^\s<>"']+/i;
const mfHostOk = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)mediafire\.com$/i.test(x.hostname); } catch { return false; } };
const MF_MIME = { zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', apk: 'application/vnd.android.package-archive', xapk: 'application/zip',
  pdf: 'application/pdf', mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', json: 'application/json', js: 'text/javascript',
  mcpack: 'application/zip', mcaddon: 'application/zip', mcworld: 'application/zip', mctemplate: 'application/zip', iso: 'application/x-iso9660-image' };
// baja la página del archivo (o detecta que el link ya es la descarga directa)
async function mfPagina(link) {
  const r = await axios.get(link, { responseType: 'stream', timeout: 20000, maxRedirects: 5, validateStatus: () => true,
    headers: { 'User-Agent': YT_UA_PC, 'Accept-Language': 'es-AR,es;q=0.9', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
  const final = r.request?.res?.responseUrl || link;
  if (!mfHostOk(final)) { r.data.destroy(); throw new Error('MF_HOST'); }
  if (r.status >= 400) { r.data.destroy(); throw Object.assign(new Error('MF_HTTP'), { status: r.status }); }
  if (!/text\/html/i.test(String(r.headers['content-type'] || ''))) { r.data.destroy(); return { directo: final }; }
  r.data.setEncoding('utf8');
  let html = ''; for await (const c of r.data) { html += c; if (html.length > 3e6) { r.data.destroy(); break; } }
  return { html, final };
}
// busca el enlace de descarga dentro de la página; null si no está
function mfEnlace(html) {
  const limpio = u => { u = dec(u); return mfHostOk(u)? u : null; };
  const scr = /data-scrambled-url="([^"]+)"/.exec(html)?.[1];
  if (scr) { try { const u = limpio(Buffer.from(scr, 'base64').toString('utf8')); if (u) return u; } catch {} }
  for (const re of [/id="downloadButton"[^>]*?href="([^"]+)"/, /href="([^"]+)"[^>]*?id="downloadButton"/, /aria-label="Download file"[^>]*?href="([^"]+)"/, /href="([^"]+)"[^>]*?aria-label="Download file"/]) {
    const u = limpio(re.exec(html)?.[1] || ''); if (u) return u;
  }
  return limpio(/https:\/\/download\d*\.mediafire\.com\/[^"'\s<>]+/.exec(html)?.[0] || '');
}
function mfEstado(html) {
  if (/Invalid or Deleted File|has been (removed|deleted)|file (is )?(no longer|not) (available|found)|key you provided for file download was invalid/i.test(html)) return 'MF_BORRADO';
  if (/type="password"|Enter Password|passwordForm/i.test(html)) return 'MF_CLAVE';
  if (/g-recaptcha|h-captcha|cf-turnstile|Just a moment\.\.\.|Attention Required/i.test(html)) return 'MF_BLOQUEO';
  return 'MF_SIN_ENLACE';
}
async function mfCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/\S+\s*/, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : '';
  const link = ((arg.match(MF_RE) || qt.match(MF_RE) || [])[0] || '').replace(/[)\].,;!?]+$/, '');
  if (!link) return reply('Uso:\n/mf <link de MediaFire>\n/mediafire <link>\n/mf (respondiendo a un mensaje con el link)');
  if (/mediafire\.com\/folder\//i.test(link)) return reply('📁 Ese link es una carpeta. Por ahora bajo archivos sueltos: abrí la carpeta y mandame el link de cada archivo.');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  fs.mkdirSync(TT_DIR, { recursive: true });
  let f = null;
  try {
    const p = await mfPagina(link);
    let url = p.directo || mfEnlace(p.html);
    if (!url) throw new Error(mfEstado(p.html));
    let nombre = p.html && /<div class="filename"[^>]*>([^<]+)</.exec(p.html)?.[1];
    if (!nombre) { try { nombre = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch { nombre = ''; } }
    nombre = String(nombre || 'archivo').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').trim().slice(0, 120) || 'archivo';
    const ext = (nombre.match(/\.([a-z0-9]{1,8})$/i) || [])[1]?.toLowerCase() || '';
    f = `${TT_DIR}/mf_${Date.now()}_${Math.random().toString(36).slice(2)}${ext? '.' + ext : ''}`;
    if (ytColaLarga()) await reply('⏳ Hay otra descarga en curso. Te toca en un rato.');
    await ytTurno(async () => {
      console.log(`[mf] bajando ${nombre}`);
      await ttBajar(url, f, 'https://www.mediafire.com/');
      const peso = fs.statSync(f).size;
      if (peso < 1) throw new Error('MF_VACIO');
      const doc = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      await sock.sendMessage(jid, { document: doc, mimetype: MF_MIME[ext] || 'application/octet-stream', fileName: nombre, caption: `📁 *${nombre}*\n> ${fmtMB(peso)} · MediaFire` }, { quoted: m });
      console.log(`[mf] enviado ${nombre} ${fmtMB(peso)}`);
    });
  } catch (e) {
    console.error('[mf] ERROR', e.status || e.response?.status || '', e.message);
    await reply(
      e.message === 'GRANDE'? `❌ El archivo pesa más de ${TT_MAX / 1024 / 1024} MB` :
      e.message === 'MF_BORRADO' || e.status === 404? '❌ Ese archivo ya no existe en MediaFire (lo borraron o el link está mal).' :
      e.message === 'MF_CLAVE'? '🔒 Ese archivo tiene contraseña. No puedo bajarlo.' :
      e.message === 'MF_BLOQUEO'? '🛡️ MediaFire pide una verificación (captcha) y desde el bot no se puede pasar. Probá más tarde o bajalo vos.' :
      e.message === 'MF_HOST'? '❌ Ese link no es de MediaFire.' :
      '❌ No pude sacar el archivo de ese link. Revisá que sea público y probá de nuevo');
  } finally { if (f) fs.rmSync(f, { force: true }); reaccion(''); }
}
const CMD_MF = [{ test: c => /^\/(mf|mediafire)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'mf', { text: c.text }, () => mfCmd(c.m, c.jid, c.text)) }];
const WORKER_MF = { mf: { clase: 'pesado', run: (m, jid, text) => mfCmd(m, jid, text) } };

module.exports.commands = [...CMD_MF];
module.exports.worker = Object.assign({}, WORKER_MF);
