// /join, /setstatus, /setpfp
const { modCtx } = require('../admin/moderacion');
const { isAllowed } = require('../owner/whitelist');
const { limpiar, puedePersonalizar } = require('../personalizar/index');
const { sharp } = require('../../src/lib/optional');
const { socBajar } = require('../../src/lib/social');
const { num, sock } = require('../../src/lib/state');

const SOC_BOT = {
  async join(c) {
    if (!(await isAllowed(c.m, c.jid).catch(() => false))) return;   // solo dueño y whitelist (los demás, silencio)
    const q = modCtx(c.m)?.quotedMessage, qt = q? (q.conversation || q.extendedTextMessage?.text || '') : '';
    const cod = (`${c.args} ${qt}`.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{15,})/i) || [])[1] || (/^[A-Za-z0-9]{20,24}$/.test(c.args)? c.args : '');
    if (!cod) return c.reply('Uso: /join <link de invitación> (o respondiendo a un mensaje con el link)');
    try { await sock.groupAcceptInvite(cod); return c.reply('✅ Listo, me uní al grupo'); }
    catch (e) {
      const st = String(e?.output?.statusCode || e?.data || '');
      return c.reply(st === '409'? 'Ya estoy en ese grupo' : st === '410' || st === '404'? '❌ Ese link venció o no existe' : st === '403' || st === '401'? '❌ No me dejan entrar a ese grupo' : st === '500'? '❌ El grupo está lleno' : `❌ No pude unirme (${String(e?.message || e).slice(0, 80)})`);
    }
  },
  async setstatus(c) {
    if (!(await puedePersonalizar(c.m, c.jid))) return c.reply('⛔ Solo el dueño del bot puede personalizarlo');
    const s = limpiar(c.args);
    if (!s) return c.reply('Uso: /setstatus <texto> (hasta 139 caracteres)');
    if (s.length > 139) return c.reply('⚠️ El estado puede tener hasta 139 caracteres');
    try { await sock.updateProfileStatus(s); return c.reply('✅ Estado actualizado'); } catch (e) { return c.reply('❌ No pude cambiar el estado: ' + String(e.message).slice(0, 80)); }
  },
  async setpfp(c) {
    if (!(await puedePersonalizar(c.m, c.jid))) return c.reply('⛔ Solo el dueño del bot puede personalizarlo');
    if (!sharp) { console.error('[sharp] falta el paquete (npm i sharp)'); return c.reply('❌ No pude procesar la imagen ahora. Probá de nuevo más tarde'); }
    const ctx = modCtx(c.m), q = ctx?.quotedMessage;
    const fuente = c.m.message.imageMessage? c.m : q?.imageMessage? { key: { remoteJid: c.jid, id: ctx.stanzaId, participant: ctx.participant }, message: q } : null;
    if (!fuente) return c.reply('Mandá una foto con el texto /setpfp, o respondé a una foto con /setpfp');
    try {
      const img = await sharp(await socBajar(fuente)).rotate().resize(640, 640, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
      await sock.updateProfilePicture(`${num(sock.user?.id)}@s.whatsapp.net`, img);
      return c.reply('✅ Foto de perfil actualizada');
    } catch (e) { console.error('[setpfp]', e.message); return c.reply('❌ No pude cambiar la foto: ' + String(e.message).slice(0, 80)); }
  },
};

module.exports = { SOC_BOT };
