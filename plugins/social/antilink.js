// Antilink: borra el mensaje y expulsa
const { modBotAdmin, modPuede } = require('../admin/moderacion');
const { socDesenvolver } = require('../../src/lib/social');
const { num, sock } = require('../../src/lib/state');

// ===== antilink: borra el mensaje y expulsa (links de invitación de grupos de WhatsApp) =====
const ANTILINK_RE = /(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?[A-Za-z0-9]{15,}/i;
const alAvisos = new Map();   // grupo -> última vez que se avisó que falta ser admin
const mensajeTexto = m => { const x = socDesenvolver(m.message); return x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || x.documentMessage?.caption || ''; };
async function antilinkVer(m, jid) {
  const txt = mensajeTexto(m);
  if (!ANTILINK_RE.test(txt)) return false;
  if (await modPuede(m, jid).catch(() => false)) return false;       // admins, dueño y whitelist pueden
  const meta = await sock.groupMetadata(jid).catch(() => null); if (!meta) return false;
  if (!modBotAdmin(meta)) {
    if (Date.now() - (alAvisos.get(jid) || 0) > 3600e3) { alAvisos.set(jid, Date.now()); await sock.sendMessage(jid, { text: '⚠️ El antilink está activado pero necesito ser admin para borrar el mensaje y expulsar.' }).catch(() => {}); }
    return false;
  }
  const quien = m.key.participant; if (!quien) return false;
  await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
  await sock.groupParticipantsUpdate(jid, [quien], 'remove').catch(e => console.error('[antilink]', e.message));
  await sock.sendMessage(jid, { text: `🚫 @${num(quien)} mandó un link de grupo y fue expulsado`, mentions: [quien] }).catch(() => {});
  return true;
}

module.exports = { antilinkVer };
