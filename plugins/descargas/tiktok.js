// /tt: TikTok sin marca de agua (videos y slides como video)
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { TT_MAX } = require('../../config');
const { TT_DIR, TT_UA, ttBajar } = require('../../src/lib/descarga');
const { sharp } = require('../../src/lib/optional');
const { sleep, sock } = require('../../src/lib/state');
const { execP, ytTieneFfmpeg } = require('../../src/lib/youtube');
const { descargar } = require('../../src/worker');

const TT_RE = /https?:\/\/(?:[\w-]+\.)?tiktok\.com\/[^\s<>"']+/i;
const TT_ALBUM = 30;                // fotos por álbum

let ttUltimo = 0; // tikwm deja 1 pedido por segundo: se espacian
async function ttTikwm(ruta, params) {
  for (let intento = 0; intento < 2; intento++) {
    const espera = ttUltimo + 1200 - Date.now(); ttUltimo = Math.max(Date.now(), ttUltimo + 1200);
    if (espera > 0) await sleep(espera);
    const r = await axios.post('https://www.tikwm.com' + ruta, new URLSearchParams(params).toString(), {
      timeout: 20000, headers: { 'User-Agent': TT_UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    });
    if (r.data?.code === 0 && r.data.data) return r.data.data;
    if (!/limit/i.test(r.data?.msg || '')) throw new Error('tikwm: ' + (r.data?.msg || 'sin datos'));
  }
  throw new Error('tikwm: límite de pedidos');
}
const ttUrl = u => !u? '' : u.startsWith('//')? 'https:' + u : u.startsWith('/')? 'https://www.tikwm.com' + u : u;
function ttItem(d) { // respuesta de tikwm -> { videos: [urls], images: [urls], music: url, caption }
  const imgs = (d.images || []).map(ttUrl).filter(Boolean);
  const videos = imgs.length? [] : [...new Set([d.hdplay, d.play].map(ttUrl).filter(Boolean))];
  if (!imgs.length &&!videos.length) throw new Error('tikwm: sin archivos');
  const autor = d.author?.unique_id || '';
  return { videos, images: imgs, music: ttUrl(d.music || d.music_info?.play || ''), caption: `${autor? '🎵 @' + autor + '\n' : ''}${(d.title || '').slice(0, 400)}`.trim() };
}
const ttPorLink = async link => ttItem(await ttTikwm('/api/', { url: link, hd: 1 }));
async function ttPorBusqueda(q) {
  const d = await ttTikwm('/api/feed/search', { keywords: q, count: 5, cursor: 0, web: 1, hd: 1 });
  const v = (d.videos || [])[0];
  if (!v) throw new Error('SIN_RESULTADOS');
  return ttItem(v);
}
// respaldo: ssstik.io (no tiene API: se lee su página, se saca el token y se parsea el HTML que devuelve)
async function ttSsstik(link) {
  const H = { 'User-Agent': TT_UA, 'Accept-Language': 'en-US,en;q=0.9' };
  const home = await axios.get('https://ssstik.io/en', { headers: H, timeout: 15000 });
  const html = String(home.data);
  const tt = (html.match(/tt\s*:\s*(?:'|&#39;|&quot;|")([^'"&]+)/) || [])[1];
  const ruta = (html.match(/hx-post="([^"]+)"/) || [])[1] || '/abc?url=dl';
  if (!tt) throw new Error('ssstik: no encontré el token');
  const r = await axios.post(new URL(ruta.replace(/&amp;/g, '&'), 'https://ssstik.io/').href, new URLSearchParams({ id: link, locale: 'en', tt }).toString(), {
    timeout: 20000,
    headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'HX-Request': 'true', 'HX-Target': 'target', 'HX-Current-URL': 'https://ssstik.io/en', Origin: 'https://ssstik.io', Referer: 'https://ssstik.io/en' },
  });
  const h = String(r.data);
  const anchors = [...h.matchAll(/<a\b([^>]*)>/gi)].map(x => ({ cls: (x[1].match(/class="([^"]*)"/) || [])[1] || '', href: ((x[1].match(/href="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&') })).filter(a => /^https?:/.test(a.href));
  const esImg = a => /slide|photo|image/i.test(a.cls) || /\.(jpe?g|webp|png|heic)(\?|$)/i.test(a.href) || /photomode|tos-[\w-]*-i-/i.test(a.href);
  const imgs = [...new Set(anchors.filter(a =>!/music|mp3/i.test(a.cls) && esImg(a)).map(a => a.href))];
  const vid = anchors.find(a => /without_watermark/i.test(a.cls) &&!/music|mp3/i.test(a.cls) &&!esImg(a));
  const titulo = (h.match(/<p[^>]*class="[^"]*maintext[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '';
  const caption = titulo.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim().slice(0, 400);
  const musica = anchors.find(a => /music|mp3/i.test(a.cls) || /\.mp3(\?|$)/i.test(a.href));
  if (imgs.length) return { videos: [], images: imgs, music: musica?.href || '', caption };
  if (vid) return { videos: [vid.href], images: [], caption };
  throw new Error('ssstik: no encontré el video en la respuesta');
}
const TT_FOTO_S = 15, TT_FOTOS_MAX = 35;   // cada foto dura 15 s en el video de slides (hasta 35 fotos)
// slides: arma un video vertical (720x1280, cada foto entera sobre un fondo borroso de sí misma) con la música de fondo repetida hasta cubrir todo
async function ttSlidesVideo(it) {
  if (!sharp) throw new Error('falta sharp');
  fs.mkdirSync(TT_DIR, { recursive: true });
  const base = `${TT_DIR}/s_${Date.now()}_${Math.random().toString(36).slice(2)}`, fotos = [];
  try {
    for (const u of it.images.slice(0, TT_FOTOS_MAX)) {
      try {
        const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 30e6, headers: { 'User-Agent': TT_UA, Referer: 'https://www.tiktok.com/' } });
        const buf = Buffer.from(r.data), f = `${base}_${fotos.length}.jpg`;
        const fondo = await sharp(buf).rotate().resize(720, 1280, { fit: 'cover' }).blur(25).modulate({ brightness: 0.6 }).jpeg({ quality: 60 }).toBuffer();
        const frente = await sharp(buf).rotate().resize(720, 1280, { fit: 'inside' }).toBuffer();
        await sharp(fondo).composite([{ input: frente, gravity: 'centre' }]).jpeg({ quality: 85 }).toFile(f);
        fotos.push(f);
      } catch (e) { console.error('[tt] foto del video falló:', e.message); }
    }
    if (!fotos.length) throw new Error('ninguna foto se pudo preparar');
    let audio = null;
    if (it.music) { try { audio = `${base}.mp3`; await ttBajar(it.music, audio); } catch (e) { console.error('[tt] música falló:', e.message); audio = null; fs.rmSync(`${base}.mp3`, { force: true }); } }
    const total = fotos.length * TT_FOTO_S, lista = `${base}.txt`, salida = `${base}.mp4`;
    fs.writeFileSync(lista, fotos.map(f => `file '${path.resolve(f)}'\nduration ${TT_FOTO_S}`).join('\n') + `\nfile '${path.resolve(fotos[fotos.length - 1])}'\n`);
    const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista];
    if (audio) args.push('-stream_loop', '-1', '-i', audio);
    args.push('-t', String(total), '-r', '4', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '30', '-pix_fmt', 'yuv420p', '-threads', '1');
    if (audio) args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-af', `afade=t=out:st=${Math.max(0, total - 2)}:d=2`);
    args.push('-movflags', '+faststart', salida);
    await execP('ffmpeg', args, { timeout: 300000 });
    if (fs.statSync(salida).size > TT_MAX) throw new Error('GRANDE');
    return { archivo: salida, audio: !!audio, fotos: fotos.length, segundos: total };
  } finally { for (const f of fotos) fs.rmSync(f, { force: true }); fs.rmSync(`${base}.mp3`, { force: true }); fs.rmSync(`${base}.txt`, { force: true }); }
}
async function ttEnviar(m, jid, it) {
  let citar = m;
  if (it.images.length && await ytTieneFfmpeg()) {   // slides como video con música; si algo falla se mandan las fotos como antes
    let v = null;
    try {
      v = await ttSlidesVideo(it);
      const peso = fs.statSync(v.archivo).size, video = peso <= 40 * 1048576? fs.readFileSync(v.archivo) : { url: v.archivo };
      const sent = await sock.sendMessage(jid, { video, mimetype: 'video/mp4', caption: it.caption }, { quoted: m });
      console.log(`[tt] slides como video: ${v.fotos} foto(s), ${v.segundos} s, ${v.audio? 'con' : 'sin'} música, ${(peso / 1048576).toFixed(1)} MB`);
      return sent;
    } catch (e) { console.error('[tt] slides a video falló, mando las fotos:', e.message); }
    finally { if (v?.archivo) fs.rmSync(v.archivo, { force: true }); }
  }
  if (it.images.length) { // slides (fotos sueltas: sin ffmpeg o si falló el video)
    // con Baileys 7.0.0-rc14 el envío como álbum (album: [...]) no mandaba nada, así que por defecto van de a una;
    // con la variable TT_ALBUM=1 prueba primero el álbum y, si falla, de a una
    const probar = process.env.TT_ALBUM === '1';
    for (let i = 0; i < it.images.length; i += TT_ALBUM) {
      const grupo = it.images.slice(i, i + TT_ALBUM).map((u, j) => ({ image: { url: u },...(i === 0 && j === 0 && it.caption? { caption: it.caption } : {}) }));
      let hecho = false;
      if (probar) {
        try { await sock.sendMessage(jid, { album: grupo }, { quoted: citar }); hecho = true; console.log('[tt] álbum enviado'); }
        catch (e) { console.error('[tt] álbum:', e.message); }
      }
      if (!hecho) {
        let n = 0;
        for (const g of grupo) {
          try { await sock.sendMessage(jid, g, { quoted: citar }); n++; }
          catch (e) { console.error('[tt] foto falló:', e.message); }
          await sleep(500);
        }
        console.log(`[tt] fotos enviadas: ${n}/${grupo.length}`);
        if (!n) throw new Error('no se pudo enviar ninguna foto');
      }
      citar = null;
    }
    return;
  }
  fs.mkdirSync(TT_DIR, { recursive: true });
  let ultimo;
  for (const u of it.videos) { // primero la versión HD; si pesa de más, la normal
    const f = `${TT_DIR}/${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
    try {
      await ttBajar(u, f);
      const peso = fs.statSync(f).size;
      console.log(`[tt] bajado ${(peso / 1048576).toFixed(1)} MB de ${u.slice(0, 80)}`);
      // los chicos se mandan desde memoria (más seguro con Baileys); los grandes desde el archivo para no llenar la RAM
      const video = peso <= 40 * 1048576? fs.readFileSync(f) : { url: f };
      const sent = await sock.sendMessage(jid, { video, mimetype: 'video/mp4', caption: it.caption }, { quoted: m });
      console.log('[tt] video enviado', sent?.key?.id || '(sin id)');
      return sent;
    } catch (e) { ultimo = e; }
    finally { fs.rmSync(f, { force: true }); }
  }
  throw ultimo || new Error('sin video');
}

async function tiktokCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const arg = text.replace(/^\/(tt|tiktok)\s*/i, '').trim();
  const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const qt = q? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '') : '';
  const quitar = l => l && l.replace(/[)\].,;!?]+$/, '');
  const link = quitar((arg.match(TT_RE) || qt.match(TT_RE) || [])[0]);
  if (!link &&!arg) return reply('Uso:\n/tt <link de TikTok>\n/tt (respondiendo a un mensaje con el link)\n/tt <búsqueda>');
  const reaccion = t => sock.sendMessage(jid, { react: { text: t, key: m.key } }).catch(() => {});
  await reaccion('⏳');
  console.log('[tt] pedido:', link || `búsqueda "${arg}"`);
  try {
    let it;
    if (link) {
      try { it = await ttPorLink(link); }
      catch (e) { console.error('[tt] tikwm falló, pruebo ssstik:', e.message); it = await ttSsstik(link); }
    } else it = await ttPorBusqueda(arg);
    console.log(`[tt] listo: ${it.videos.length} video(s), ${it.images.length} foto(s)`);
    await ttEnviar(m, jid, it);
  } catch (e) {
    console.error('[tt] ERROR', e.response?.status || '', e.stack || e.message);
    await reply(e.message === 'GRANDE'? `❌ El video pesa más de ${TT_MAX / 1024 / 1024} MB` : e.message === 'SIN_RESULTADOS'? '🔎 No encontré videos con esa búsqueda' : '❌ No pude descargarlo. Revisá que el link sea público y probá de nuevo');
  } finally { reaccion(''); }
}
const CMD_TT = [{ test: c => /^\/(tt|tiktok)(\s|$)/i.test(c.text), run: c => descargar(c.m, c.jid, 'tt', { text: c.text }, () => tiktokCmd(c.m, c.jid, c.text)) }];

// trabajos que el worker de descargas sabe hacer (el bot principal se los pide con descargar())
const WORKER_TT = { tt: { clase: 'liviano', run: (m, jid, text) => tiktokCmd(m, jid, text) } };

module.exports.commands = [...CMD_TT];
module.exports.worker = Object.assign({}, WORKER_TT);
