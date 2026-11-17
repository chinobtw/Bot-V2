// /short, /qrgen, /readqr, /tr, /tts, /ocr, /removebg, /tomp3, /tovn
const axios = require('axios');
const { geminiError, geminiPedir } = require('../../src/lib/ia');
const { aMp3, aNotaDeVoz, argsDe, comando, mediaDe, responder, socBajar, textoCitado } = require('../../src/lib/medios');
const { QRCode, jsQR, sharp } = require('../../src/lib/optional');
const { sock } = require('../../src/lib/state');

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAX_MEDIA = 30 * 1024 * 1024;   // no se convierten audios/videos de más de 30 MB (el host tiene poca memoria)
const NO_BAJO = '❌ No pude descargar eso (puede haber vencido o ya no estar disponible)';

// ----- /short: acorta un link (is.gd y, si falla, TinyURL; sin key) -----
async function shortCmd(c) {
  const reply = responder(c);
  let url = argsDe(c) || textoCitado(c.m);
  url = (url.match(/https?:\/\/\S+/i) || [])[0] || (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)? 'https://' + url : '');
  if (!url) return reply('Uso: /short <link> (o respondé a un mensaje con el link)');
  const fuentes = [
    async () => (await axios.get('https://is.gd/create.php', { params: { format: 'simple', url }, timeout: 15000, headers: { 'User-Agent': UA } })).data,
    async () => (await axios.get('https://tinyurl.com/api-create.php', { params: { url }, timeout: 15000, headers: { 'User-Agent': UA } })).data,
  ];
  for (const f of fuentes) {
    try { const r = String(await f()).trim(); if (/^https?:\/\/\S+$/.test(r)) return void await reply(`🔗 *Link acortado*\n${r}`); }
    catch (e) { console.error('[short]', e.message); }
  }
  await reply('❌ No pude acortar ese link ahora. Probá de nuevo más tarde');
}

// ----- /qrgen: QR de un texto o link -----
async function qrgenCmd(c) {
  const reply = responder(c);
  const txt = argsDe(c) || textoCitado(c.m);
  if (!txt) return reply('Uso: /qrgen <texto o link> (o respondé a un mensaje)');
  if (txt.length > 1000) return reply('⚠️ Ese texto es muy largo para un QR (máximo 1000 caracteres)');
  if (!QRCode) { console.error('[qr] falta el paquete qrcode (npm i qrcode)'); return reply('❌ No pude generar el QR ahora. Probá de nuevo más tarde'); }
  try { await sock.sendMessage(c.jid, { image: await QRCode.toBuffer(txt, { width: 512, margin: 2 }), caption: '📷 Tu código QR' }, { quoted: c.m }); }
  catch (e) { console.error('[qrgen]', e.message); await reply('❌ No pude generar el QR'); }
}

// ----- /readqr: lee el QR de una foto -----
async function readqrCmd(c) {
  const reply = responder(c);
  const f = mediaDe(c.m, c.jid, ['imageMessage', 'stickerMessage']);
  if (!f) return reply('Uso: respondé a una foto con un QR con /readqr (o mandá la foto con ese texto)');
  if (!sharp || !jsQR) { console.error('[readqr] faltan paquetes (npm i sharp jsqr)'); return reply('❌ No pude leer el QR ahora. Probá de nuevo más tarde'); }
  let buf; try { buf = await socBajar(f.fuente); } catch (e) { console.error('[readqr]', e.message); return reply(NO_BAJO); }
  try {
    for (const lado of [1200, 700]) {   // si no lo lee en tamaño grande, prueba más chico
      const { data, info } = await sharp(buf).rotate().resize(lado, lado, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const r = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      if (r?.data) return void await reply(`📖 *QR leído*\n${r.data}`);
    }
    await reply('🤷 No encontré ningún QR en esa imagen. Probá con una foto más nítida y de cerca');
  } catch (e) { console.error('[readqr]', e.message); await reply('❌ No pude leer esa imagen'); }
}

// ----- /tr: traducir (Google Translate, sin key) -----
const IDIOMAS = { es: 'es', en: 'en', pt: 'pt', fr: 'fr', it: 'it', de: 'de', ja: 'ja', ru: 'ru', ko: 'ko', ar: 'ar', zh: 'zh-CN', hi: 'hi', tr: 'tr', nl: 'nl', pl: 'pl', la: 'la',
  español: 'es', espanol: 'es', castellano: 'es', ingles: 'en', inglés: 'en', portugues: 'pt', portugués: 'pt', frances: 'fr', francés: 'fr', italiano: 'it', aleman: 'de', alemán: 'de',
  japones: 'ja', japonés: 'ja', ruso: 'ru', chino: 'zh-CN', coreano: 'ko', arabe: 'ar', árabe: 'ar', hindi: 'hi', turco: 'tr', holandes: 'nl', polaco: 'pl', latin: 'la', latín: 'la' };
async function trCmd(c) {
  const reply = responder(c);
  const toks = argsDe(c).split(/\s+/).filter(Boolean), citado = textoCitado(c.m);
  let tl = 'es';
  if (toks.length && IDIOMAS[toks[0].toLowerCase()]) { tl = IDIOMAS[toks[0].toLowerCase()]; toks.shift(); }
  const texto = (toks.join(' ') || citado).slice(0, 3000);
  if (!texto) return reply('Uso: respondé a un mensaje con /tr en (idioma: es, en, pt, fr, it, de, ja, ru...)\n> O escribí: /tr en hola, ¿cómo andás?\n> Sin idioma traduzco al español');
  try {
    const r = await axios.get('https://translate.googleapis.com/translate_a/single', { params: { client: 'gtx', sl: 'auto', tl, dt: 't', q: texto }, timeout: 15000, headers: { 'User-Agent': UA } });
    const out = (r.data?.[0] || []).map(s => s?.[0] || '').join('').trim();
    if (!out) return void await reply('🤷 No pude traducir eso');
    await reply(`🌐 *Traducción* (${r.data?.[2] || '?'} → ${tl})\n${out}`);
  } catch (e) { console.error('[tr]', e.message); await reply('❌ No pude traducir ahora. Probá de nuevo más tarde'); }
}

// ----- /tts: texto a voz (voz de Google Translate, sin key) -----
const trozos = (t, max = 180) => {   // el servicio acepta ~200 caracteres por pedido: se corta en palabras
  const out = []; let cur = '';
  for (const w of t.replace(/\s+/g, ' ').trim().split(' ')) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w.slice(0, max); } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
};
async function ttsCmd(c) {
  const reply = responder(c);
  const toks = argsDe(c).split(/\s+/).filter(Boolean);
  let tl = 'es';
  if (toks.length > 1 && IDIOMAS[toks[0].toLowerCase()]) tl = IDIOMAS[toks.shift().toLowerCase()];
  const texto = (toks.join(' ') || textoCitado(c.m)).slice(0, 600);
  if (!texto) return reply('Uso: /tts <texto> (o respondé a un mensaje)\n> Con idioma: /tts en hello everyone');
  try {
    const partes = [];
    for (const t of trozos(texto)) {
      const r = await axios.get('https://translate.google.com/translate_tts', { params: { ie: 'UTF-8', q: t, tl, client: 'tw-ob' }, responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA, Referer: 'https://translate.google.com/' } });
      partes.push(Buffer.from(r.data));
    }
    const mp3 = Buffer.concat(partes);
    if (mp3.length < 500) throw new Error('audio vacío');
    let nota; try { nota = await aNotaDeVoz(mp3); } catch (e) { console.error('[tts] sin ffmpeg, va como mp3:', e.message); }
    await sock.sendMessage(c.jid, nota? { audio: nota, mimetype: 'audio/ogg; codecs=opus', ptt: true } : { audio: mp3, mimetype: 'audio/mpeg' }, { quoted: c.m });
  } catch (e) { console.error('[tts]', e.message); await reply('❌ No pude generar el audio ahora. Probá de nuevo más tarde'); }
}

// ----- /ocr: texto de una imagen (Gemini) -----
async function ocrCmd(c) {
  const reply = responder(c);
  const f = mediaDe(c.m, c.jid, ['imageMessage']);
  if (!f) return reply('Uso: respondé a una foto con /ocr (o mandá la foto con ese texto)');
  let buf; try { buf = await socBajar(f.fuente); } catch (e) { console.error('[ocr]', e.message); return reply(NO_BAJO); }
  if (buf.length > 8 * 1024 * 1024) return reply('⚠️ Esa imagen es muy pesada');
  sock.sendPresenceUpdate('composing', c.jid).catch(() => {});
  try {
    const out = await geminiPedir({ imagen: { mime: f.msg.imageMessage.mimetype || 'image/jpeg', buf }, tokens: 2048,
      sistema: 'Sos un OCR. Transcribí exactamente el texto que aparece en la imagen, respetando saltos de línea y sin agregar nada. Si no hay texto legible respondé solo: SIN_TEXTO',
      texto: 'Transcribí el texto de esta imagen.' });
    if (/^SIN_TEXTO\b/i.test(out)) return void await reply('🤷 No encontré texto en esa imagen');
    await reply(`📝 *Texto de la imagen*\n${out.slice(0, 3500)}`);
  } catch (e) { console.error('[ocr]', e.motivo || '', e.message); await reply(geminiError(e)); }
}

// ----- /removebg: saca el fondo (remove.bg; hace falta REMOVEBG_KEY) -----
async function removebgCmd(c) {
  const reply = responder(c);
  const f = mediaDe(c.m, c.jid, ['imageMessage']);
  if (!f) return reply('Uso: respondé a una foto con /removebg (o mandá la foto con ese texto)');
  const key = (process.env.REMOVEBG_KEY || '').trim();
  if (!key) { console.error('[removebg] falta REMOVEBG_KEY'); return reply('❌ Esto no está disponible ahora. Probá más tarde'); }
  let buf; try { buf = await socBajar(f.fuente); } catch (e) { console.error('[removebg]', e.message); return reply(NO_BAJO); }
  try {
    const fd = new FormData();
    fd.append('image_file', new Blob([buf], { type: f.msg.imageMessage.mimetype || 'image/jpeg' }), 'foto.jpg');
    fd.append('size', 'auto');
    const r = await axios.post('https://api.remove.bg/v1.0/removebg', fd, { headers: { 'X-Api-Key': key }, responseType: 'arraybuffer', timeout: 60000 });
    // sale como archivo para que no pierda la transparencia
    await sock.sendMessage(c.jid, { document: Buffer.from(r.data), mimetype: 'image/png', fileName: 'sin-fondo.png', caption: '✂️ Fondo eliminado' }, { quoted: c.m });
  } catch (e) {
    const st = e.response?.status; console.error('[removebg]', st, e.message);
    if (st === 402) return void await reply('⏳ Se acabaron los créditos gratuitos de este mes. Probá más adelante');
    await reply('❌ No pude sacar el fondo ahora. Probá de nuevo más tarde');
  }
}

// ----- /tomp3 y /tovn: audio o video -> mp3 / nota de voz -----
async function convertirCmd(c, modo) {
  const reply = responder(c);
  const f = mediaDe(c.m, c.jid, ['audioMessage', 'videoMessage']);
  if (!f) return reply(`Uso: respondé a un audio o a un video con /${modo}`);
  if (Number(f.msg[f.tipo].fileLength || 0) > MAX_MEDIA) return reply('⚠️ Ese archivo es muy pesado (máximo 30 MB)');
  let buf; try { buf = await socBajar(f.fuente); } catch (e) { console.error('[' + modo + ']', e.message); return reply(NO_BAJO); }
  try {
    const out = await (modo === 'tomp3'? aMp3 : aNotaDeVoz)(buf);
    await sock.sendMessage(c.jid, modo === 'tomp3'? { audio: out, mimetype: 'audio/mpeg', fileName: 'audio.mp3' } : { audio: out, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: c.m });
  } catch (e) { console.error('[' + modo + ']', e.message); await reply('❌ No pude convertirlo ahora. Probá de nuevo más tarde'); }
}

module.exports.commands = [
  { test: comando('short', 'acortar'), run: shortCmd },
  { test: comando('qrgen', 'qrcode'), run: qrgenCmd },
  { test: comando('readqr', 'leerqr'), run: readqrCmd },
  { test: comando('tr', 'translate', 'traducir'), run: trCmd },
  { test: comando('tts', 'voz'), run: ttsCmd },
  { test: comando('ocr'), run: ocrCmd },
  { test: comando('removebg', 'sinfondo'), run: removebgCmd },
  { test: comando('tomp3'), run: c => convertirCmd(c, 'tomp3') },
  { test: comando('tovn'), run: c => convertirCmd(c, 'tovn') },
];
