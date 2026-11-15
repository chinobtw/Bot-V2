// /say: el bot envía el texto (dueño y whitelist)
const { OWNER } = require('../../config');
const { isAllowed } = require('./whitelist');
const { botIds, idsDe, num, sock } = require('../../src/lib/state');

// ---------- mensajes ----------
async function sayCmd(m, jid, text) {
  let t = text.slice(4).trim();
  if (t && (await isAllowed(m, jid))) {
    const ctx = m.message.extendedTextMessage?.contextInfo;
    const mentions = [...(ctx?.mentionedJid || [])];
    if (/@owner\b/i.test(t)) {
      let oj = `${OWNER}@s.whatsapp.net`;
      if (jid.endsWith('@g.us')) { const meta = await sock.groupMetadata(jid); const p = meta.participants.find(p => idsDe(p).includes(OWNER)); if (p) oj = p.id; }
      t = t.replace(/@owner\b/gi, `@${num(oj)}`); mentions.push(oj);
    }
    const opts = {}; if (ctx?.stanzaId && ctx.quotedMessage) {
      const part = ctx.participant; const mine = botIds().includes(num(part));
      opts.quoted = { key: { remoteJid: jid, id: ctx.stanzaId, fromMe:!!part && mine,...(part? { participant: part } : {}) }, message: ctx.quotedMessage };
    }
    await sock.sendMessage(jid, { text: t, mentions }, opts);
  }
}

// ---------- comandos: cada uno dice cuándo le toca (test) y qué hace (run). El orden de COMANDOS es el de la antigua cadena if/else ----------
const CMD_SAY = [{ test: c => /^\/say(\s|$)/i.test(c.text), run: c => sayCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_SAY];
