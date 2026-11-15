// /whitelist y /unwhitelist
const { OWNER } = require('../../config');
const { saveWl, wl } = require('../../src/db/whitelist');
const { botIds, idsDe, isOwner, num, senderIds, sock } = require('../../src/lib/state');

// ---------- whitelist ----------
async function isAllowed(m, jid) {
  if (await isOwner(m, jid)) return true;
  const ids = senderIds(m, jid);
  return wl.some(e => e.ids.some(x => ids.includes(x)));
}

async function wlCmd(m, jid, text, remove) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!(await isOwner(m, jid))) return; // solo el dueño, sin responder a los demás

  const sub = (text.trim().split(/\s+/)[1] || '').toLowerCase();
  if (!remove && sub === 'list') {
    if (!wl.length) return reply('La whitelist está vacía');
    return reply(
      '✅ Whitelist:\n' + wl.map(e => `• @${num(e.jid || e.ids[0])}`).join('\n'),
      wl.map(e => e.jid).filter(Boolean)
    );
  }

  const ctx = m.message.extendedTextMessage?.contextInfo;
  const target = ctx?.mentionedJid?.[0] || ctx?.participant;
  if (!target) return reply('Uso:\n/whitelist @usuario (o respondiendo a su mensaje)\n/unwhitelist @usuario\n/whitelist list');

  const meta = await sock.groupMetadata(jid);
  const p = meta.participants.find(p => idsDe(p).includes(num(target)));
  const ids = p? idsDe(p) : [num(target)];
  const tag = `@${num(target)}`;

  if (ids.includes(OWNER)) return reply('Vos ya sos el dueño 😄');
  if (ids.some(x => botIds().includes(x))) return reply('No hace falta, soy el bot');

  const idx = wl.findIndex(e => e.ids.some(x => ids.includes(x)));
  if (remove) {
    if (idx < 0) return reply(`${tag} no estaba en la whitelist`, [target]);
    wl.splice(idx, 1); saveWl();
    return reply(`🚫 ${tag} sacado de la whitelist`, [target]);
  }
  if (idx >= 0) return reply(`${tag} ya estaba en la whitelist`, [target]);
  wl.push({ ids, jid: target }); saveWl();
  reply(`✅ ${tag} agregado a la whitelist (puede usar comandos de owner.)`, [target]);
}
const CMD_WHITELIST = [{ test: c => c.enGrupo && /^\/(un)?whitelist(\s|$)/i.test(c.text), run: c => wlCmd(c.m, c.jid, c.text, /^\/unwhitelist/i.test(c.text)) }];

module.exports = { isAllowed };
module.exports.commands = [...CMD_WHITELIST];
