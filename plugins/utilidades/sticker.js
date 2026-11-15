// /s: stickers
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { socMetaDe } = require('../../src/lib/cumple');
const { sharp } = require('../../src/lib/optional');
const { als, senderIds, sock } = require('../../src/lib/state');
const { webpConMeta } = require('../../src/lib/webp');

const MAX_STICKERS = 30;           // tope de stickers por pedido (un álbum de WhatsApp llega hasta ahí)
const albumCache = new Map();      // idDelAlbum -> { jid, t, items: [{ m, hecho }] }
const albumsSticker = new Map();   // idDelAlbum -> { jid, hasta }: álbumes a los que ya se les pidió /s
const colaSticker = new Map();     // jid -> promesa: los stickers de cada chat salen de a uno, en orden
const sleepMs = ms => new Promise(r => setTimeout(r, ms));

// id del álbum al que pertenece una foto (si es parte de un álbum)
function albumPadre(m) {
  const a = m.message?.messageContextInfo?.messageAssociation || m.message?.imageMessage?.contextInfo?.messageAssociation;
  const esAlbum = a && (a.associationType === 1 || a.associationType === 'MEDIA_ALBUM');
  return esAlbum? (a.parentMessageKey?.id || null) : null;
}
function guardarAlbum(padre, m, jid) {
  let a = albumCache.get(padre);
  if (!a) { a = { jid, t: Date.now(), items: [] }; albumCache.set(padre, a); }
  if (!a.items.some(i => i.m.key.id === m.key.id)) a.items.push({ m, hecho: false });
  if (albumCache.size > 200) { // se descartan los más viejos
    for (const [k] of [...albumCache.entries()].sort((x, y) => x[1].t - y[1].t).slice(0, 50)) albumCache.delete(k);
  }
}
setInterval(() => {
  const lim = Date.now() - 30 * 60e3;
  for (const [k, a] of albumCache) if (a.t < lim) albumCache.delete(k);
  for (const [k, v] of albumsSticker) if (v.hasta < Date.now()) albumsSticker.delete(k);
}, 5 * 60e3).unref();

// imagen -> WebP 512x512 con fondo transparente: no se estira, no se recorta y las fotos chicas no se agrandan
async function aSticker(buf, meta) {
  const base = await sharp(buf).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  let q = 80, out;
  do { // los stickers tienen que pesar menos de ~100 KB: si se pasa, se baja la calidad
    out = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: base, gravity: 'center' }])
      .webp({ quality: q, alphaQuality: 100 }).toBuffer();
    q -= 15;
  } while (out.length > 100 * 1024 && q >= 25);
  return meta? webpConMeta(out, meta.pack, meta.autor) : out;
}

async function enviarSticker(jid, fuente, quoted, meta) {
  const buf = await downloadMediaMessage(fuente, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
  await sock.sendMessage(jid, { sticker: await aSticker(buf, meta) }, quoted? { quoted } : {});
}

// encola una tarea del chat (respeta la instancia: principal o sub-bot)
function cola(jid, tarea) {
  const inst = als.getStore();
  const sig = (colaSticker.get(jid) || Promise.resolve()).then(() => als.run(inst, tarea)).catch(console.error);
  colaSticker.set(jid, sig);
  sig.finally(() => { if (colaSticker.get(jid) === sig) colaSticker.delete(jid); });
}

// foto de un álbum que llega después de pedir /s: se convierte sola
function stickerHijo(padre, m, jid) {
  const cfg = albumsSticker.get(padre);
  if (!cfg || cfg.jid!== jid) return;
  const item = albumCache.get(padre)?.items.find(i => i.m.key.id === m.key.id);
  if (!item || item.hecho) return;
  item.hecho = true;
  cola(jid, async () => {
    try { await enviarSticker(jid, m, null, socMetaDe(senderIds(m, jid))); }
    catch (e) { item.hecho = false; console.error('[sticker]', e.message); }
    await sleepMs(500);
  });
}

async function stickerCmd(m, jid) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!sharp) { console.error('[sharp] falta el paquete (npm i sharp)'); return reply('❌ No pude crear el sticker ahora. Probá de nuevo más tarde'); }
  const ctx = m.message.extendedTextMessage?.contextInfo;
  const q = ctx?.quotedMessage;
  const orden = i => i.m.message?.messageContextInfo?.messageAssociation?.messageIndex?? 0;
  let fuentes;
  if (m.message.imageMessage) {
    const padre = albumPadre(m);
    if (padre) { // foto de un álbum con /s: se hacen todas las del álbum y las que lleguen después
      albumsSticker.set(padre, { jid, hasta: Date.now() + 2 * 60e3 });
      fuentes = (albumCache.get(padre)?.items || []).filter(i =>!i.hecho);
      if (!fuentes.some(i => i.m.key.id === m.key.id)) fuentes.push({ m, hecho: false });
    } else fuentes = [{ m, hecho: false }];
  } else if (q?.albumMessage) { // respondiendo al álbum: todas las fotos
    const a = albumCache.get(ctx.stanzaId);
    if (!a ||!a.items.length) return reply('❌ No encontré las fotos de ese álbum (las guardo un rato, y solo mientras el bot está encendido). Probá respondiendo a cada foto con /s.');
    fuentes = a.items.slice();
  } else if (q?.imageMessage) { // respondiendo a una foto
    fuentes = [{ m: { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: q }, hecho: false }];
  } else return reply('Respondé a una foto con /s, o mandá una foto con el texto /s.\n(Si respondés a un álbum, convierto todas las fotos.)');

  fuentes.sort((x, y) => orden(x) - orden(y));
  const recortado = fuentes.length > MAX_STICKERS;
  if (recortado) fuentes = fuentes.slice(0, MAX_STICKERS);
  fuentes.forEach(f => { f.hecho = true; });
  if (fuentes.length > 1) await reply(`🖼️ Armando ${fuentes.length} stickers${recortado? ` (máximo ${MAX_STICKERS} por pedido)` : ''}...`);

  const metaSt = socMetaDe(senderIds(m, jid));   // pack y autor del que pidió el sticker (/setmeta)
  cola(jid, async () => {
    let n = 0, fallas = 0;
    for (const f of fuentes) {
      try { await enviarSticker(jid, f.m, n === 0? m : null, metaSt); n++; }
      catch (e) { console.error('[sticker]', e.message); f.hecho = false; fallas++; }
      if (fuentes.length > 1) await sleepMs(500);
    }
    if (fallas) sock.sendMessage(jid, { text: `⚠️ No pude convertir ${fallas} imagen(es).` }, { quoted: m }).catch(() => {});
  });
}
const CMD_STICKER = [{ test: c => /^\/s(\s|$)/i.test(c.cap || c.text), run: c => stickerCmd(c.m, c.jid) }];

module.exports = { albumPadre, albumsSticker, guardarAlbum, stickerHijo };
module.exports.commands = [...CMD_STICKER];
