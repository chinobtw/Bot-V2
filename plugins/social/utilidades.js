// /toimg, /pfp, /setmeta, /delmeta
const { modCtx } = require('../admin/moderacion');
const { limpiar } = require('../personalizar/index');
const { rxMp4, rxTurno } = require('../reacciones/reacciones');
const { socObjetivo } = require('./_comun');
const { perfDisco } = require('../../src/db/social');
const { perfGet } = require('../../src/lib/actividad');
const { ecoIds } = require('../../src/lib/economia');
const { rxLimpio } = require('../../src/lib/nombres');
const { sharp } = require('../../src/lib/optional');
const { quienJid, socBajar, socDesenvolver } = require('../../src/lib/social');
const { num, sock } = require('../../src/lib/state');

const SOC_UTIL = {
  async toimg(c) {
    if (!sharp) { console.error('[sharp] falta el paquete (npm i sharp)'); return c.reply('❌ No pude procesar la imagen ahora. Probá de nuevo más tarde'); }
    const ctx = modCtx(c.m), q = ctx?.quotedMessage;
    const base = socDesenvolver(q || c.m.message);
    const tipo = base.stickerMessage? 'stickerMessage' : base.imageMessage? 'imageMessage' : base.videoMessage? 'videoMessage' : null;
    if (!tipo) return c.reply('Respondé a un sticker o a una foto (también las de "ver una vez") con /toimg');
    const fuente = q? { key: { remoteJid: c.jid, id: ctx.stanzaId, participant: ctx.participant }, message: base } : { key: c.m.key, message: base };
    let buf; try { buf = await socBajar(fuente); } catch (e) { console.error('[toimg]', e.message); return c.reply('❌ No pude descargar eso (puede haber vencido o ya no estar disponible)'); }
    try {
      if (tipo === 'videoMessage') return void await sock.sendMessage(c.jid, { video: buf, mimetype: 'video/mp4', caption: base.videoMessage.caption || '' }, { quoted: c.m });
      if (tipo === 'imageMessage') return void await sock.sendMessage(c.jid, { image: buf, caption: base.imageMessage.caption || '' }, { quoted: c.m });
      if (base.stickerMessage.isAnimated) {   // sticker animado: pasa a GIF-video
        try { const mp4 = await rxTurno(async () => rxMp4(await sharp(buf, { animated: true }).gif().toBuffer())); return void await sock.sendMessage(c.jid, { video: mp4, mimetype: 'video/mp4', gifPlayback: true }, { quoted: c.m }); }
        catch (e) { console.error('[toimg] animado:', e.message); }
      }
      await sock.sendMessage(c.jid, { image: await sharp(buf).png().toBuffer() }, { quoted: c.m });
    } catch (e) { console.error('[toimg]', e.message); await c.reply('❌ No pude convertirlo'); }
  },
  async pfp(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), quien = t? t.jid : quienJid(c.m, c.jid);
    const cand = [...new Set([quien, ...(t?.ids || []).map(x => x + '@s.whatsapp.net')])];
    let url = null;
    for (const j of cand) { try { url = await sock.profilePictureUrl(j, 'image'); if (url) break; } catch {} }
    if (!url) return c.reply(`🖼️ @${num(quien)} no tiene foto de perfil, o la tiene oculta.`, [quien]);
    await sock.sendMessage(c.jid, { image: { url }, caption: `🖼️ Foto de perfil de @${num(quien)}`, mentions: [quien] }, { quoted: c.m });
  },
  async setmeta(c) {
    if (!c.args) { const u = perfGet(await ecoIds(c.m, c.jid)); return c.reply(`Uso: /setmeta Pack | Autor\n> Ej: /setmeta Memes del grupo | Vand4lw\nActual: ${u?.meta? `*${u.meta.pack}* de *${u.meta.autor || '—'}*` : 'sin configurar'}\n(/delmeta para quitarlo)`); }
    const [pack, ...r] = c.args.split('|'), autor = limpiar(r.join('|')) || rxLimpio(c.m.pushName), pk = limpiar(pack);
    if (!pk) return c.reply('Uso: /setmeta Pack | Autor');
    if (pk.length > 40 || autor.length > 40) return c.reply('⚠️ El pack y el autor pueden tener hasta 40 caracteres cada uno');
    const ids = await ecoIds(c.m, c.jid), u = perfGet(ids, true, quienJid(c.m, c.jid));
    u.meta = { pack: pk, autor }; perfDisco.luego();
    return c.reply(`✅ Tus stickers ahora salen con pack *${pk}* y autor *${autor}*\n> Probalo con /s`);
  },
  async delmeta(c) {
    const u = perfGet(await ecoIds(c.m, c.jid));
    if (!u?.meta) return c.reply('No tenías pack ni autor configurados');
    delete u.meta; perfDisco.luego();
    return c.reply('🗑️ Listo: tus stickers vuelven a salir sin pack ni autor');
  },
};

module.exports = { SOC_UTIL };
