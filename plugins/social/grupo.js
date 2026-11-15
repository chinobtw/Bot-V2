// /antilink, /welcome, /goodbye, /setwelcome, /setgoodbye, /del
const { modBotAdmin, modCtx } = require('../admin/moderacion');
const { SOC_texto, socToggle } = require('./_comun');
const { BIENVENIDA, DESPEDIDA } = require('./eventos');
const { botIds, num, sock } = require('../../src/lib/state');

const SOC_GRUPO = {
  async antilink(c) {
    const r = await socToggle(c, 'antilink', '🔗 Antilink', 'antilink', '🔗 Antilink activado: borro los links de grupos de WhatsApp y expulso a quien los mande (los admins pueden)', '✅ Antilink desactivado');
    if (r === 'on') { const meta = await sock.groupMetadata(c.jid).catch(() => null); if (meta && !modBotAdmin(meta)) await c.reply('⚠️ Ojo: necesito ser admin del grupo para poder borrar y expulsar.'); }
  },
  welcome: c => socToggle(c, 'welcome', '👋 Bienvenida', 'welcome', '👋 Bienvenida activada. Podés cambiar el texto con /setwelcome', '✅ Bienvenida desactivada'),
  goodbye: c => socToggle(c, 'goodbye', '👋 Despedida', 'goodbye', '👋 Despedida activada. Podés cambiar el texto con /setgoodbye', '✅ Despedida desactivada'),
  async setwelcome(c) { return SOC_texto(c, 'welcomeMsg', 'setwelcome', BIENVENIDA); },
  async setgoodbye(c) { return SOC_texto(c, 'goodbyeMsg', 'setgoodbye', DESPEDIDA); },
  async del(c) {
    const ctx = modCtx(c.m), q = ctx?.quotedMessage;
    if (!q || !ctx.stanzaId) return c.reply('Uso: respondé al mensaje que quieras borrar con /del');
    const mio = botIds().includes(num(ctx.participant || ''));
    if (c.grupo) { const meta = await sock.groupMetadata(c.jid); if (!mio && !modBotAdmin(meta)) return c.reply('⚠️ Necesito ser admin para borrar mensajes de otros'); }
    else if (!mio) return c.reply('En privado solo puedo borrar mis propios mensajes');
    await sock.sendMessage(c.jid, { delete: { remoteJid: c.jid, fromMe: mio, id: ctx.stanzaId, ...(ctx.participant? { participant: ctx.participant } : {}) } });
    sock.sendMessage(c.jid, { react: { text: '✅', key: c.m.key } }).catch(() => {});
  },
};

module.exports = { SOC_GRUPO };
