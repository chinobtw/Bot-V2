// /qc: sticker con la burbuja de un mensaje, como los de Telegram
const axios = require('axios');
const path = require('path');
const { aSticker } = require('./sticker');
const { socMetaDe } = require('../../src/lib/cumple');
const { argsDe, comando, ctxDe, responder, textoCitado } = require('../../src/lib/medios');
const { rxLimpio, rxNombreDe } = require('../../src/lib/nombres');
const { sharp } = require('../../src/lib/optional');
const { num, senderIds, sock } = require('../../src/lib/state');

// las fuentes van en el repo para que no dependa de las del host
const FUENTE = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf'), FUENTE_B = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');
const COLORES = ['#ff8a65', '#ffb74d', '#aed581', '#4fc3f7', '#ba68c8', '#f06292', '#4db6ac', '#fff176'];
const MAX_TEXTO = 350;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// las fuentes no tienen emojis (saldrían cuadraditos): se sacan
const limpiar = t => t.replace(/[\u0000-\u0008\u000b-\u001f​-‏‪-‮⁦-⁩️]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/[ \t]+/g, ' ').trim();

async function texto(t, color, ancho, negrita) {
  const { data, info } = await sharp({ text: { text: `<span foreground="${color}">${esc(t)}</span>`, font: negrita? 'DejaVu Sans Bold' : 'DejaVu Sans', fontfile: negrita? FUENTE_B : FUENTE, width: ancho, rgba: true, dpi: 130, wrap: 'word-char' } })
    .png().toBuffer({ resolveWithObject: true });
  return { input: data, w: info.width, h: info.height };
}
async function avatar(jidFoto, nombre, color, lado) {
  let foto = null;
  try { const url = await sock.profilePictureUrl(jidFoto, 'image'); if (url) foto = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 })).data); } catch {}
  const mascara = Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}" fill="#fff"/></svg>`);
  if (foto) { try { return await sharp(foto).resize(lado, lado, { fit: 'cover' }).composite([{ input: mascara, blend: 'dest-in' }]).png().toBuffer(); } catch {} }
  const inicial = limpiar(nombre).charAt(0).toUpperCase() || '?';   // sin foto: círculo de color con la inicial
  const l = await texto(inicial, '#ffffff', lado, true);
  return sharp(Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}" fill="${color}"/></svg>`))
    .composite([{ input: l.input, left: Math.round((lado - l.w) / 2), top: Math.round((lado - l.h) / 2) }]).png().toBuffer();
}
async function burbuja(nombre, cuerpo, jidFoto) {
  const color = COLORES[[...nombre].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORES.length];
  const [n, b] = [await texto(nombre.slice(0, 40), color, 380, true), await texto(cuerpo, '#ffffff', 380, false)];
  const pad = 26, lado = 78, sep = 16, ancho = Math.max(n.w, b.w) + pad * 2, alto = n.h + 8 + b.h + pad * 2;
  const W = lado + sep + ancho, H = Math.max(alto, lado);
  const fondo = Buffer.from(`<svg width="${ancho}" height="${alto}"><rect width="${ancho}" height="${alto}" rx="34" fill="#1f1b2e"/></svg>`);
  const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: fondo, left: lado + sep, top: H - alto },
    { input: await avatar(jidFoto, nombre, color, lado), left: 0, top: H - lado },
    { input: n.input, left: lado + sep + pad, top: H - alto + pad },
    { input: b.input, left: lado + sep + pad, top: H - alto + pad + n.h + 8 },
  ]).png().toBuffer();
  return sharp(png).resize(512, 512, { fit: 'inside' }).png().toBuffer();   // llena el ancho del sticker
}

async function qcCmd(c) {
  const reply = responder(c);
  if (!sharp) { console.error('[sharp] falta el paquete (npm i sharp)'); return reply('❌ No pude crear el sticker ahora. Probá de nuevo más tarde'); }
  const ctx = ctxDe(c.m), citado = textoCitado(c.m), args = argsDe(c);
  const propio = !citado;                                         // /qc <texto>: la burbuja es del que escribe
  const cuerpo = limpiar(citado || args).slice(0, MAX_TEXTO);
  if (!cuerpo) return reply('Uso: respondé a un mensaje con /qc (o escribí /qc <texto>)\n> Los emojis no salen en la burbuja');
  const autorJid = propio? (c.m.key.participant || c.jid) : (ctx.participant || c.jid);
  const nombre = limpiar((propio? rxLimpio(c.m.pushName) : rxNombreDe([num(autorJid)])) || num(autorJid)) || 'Alguien';
  try {
    const img = await burbuja(nombre, cuerpo, autorJid);
    await sock.sendMessage(c.jid, { sticker: await aSticker(img, socMetaDe(senderIds(c.m, c.jid))) }, { quoted: c.m });
  } catch (e) { console.error('[qc]', e.message); await reply('❌ No pude crear el sticker ahora. Probá de nuevo más tarde'); }
}

module.exports.commands = [{ test: comando('qc', 'quote'), run: qcCmd }];
module.exports.burbuja = burbuja;
