// /p: ping
const { sock } = require('../../src/lib/state');

async function pingCmd(m, jid) {
  const t0 = Date.now(); const sent = await sock.sendMessage(jid, { text: '🏓 Pong...' }, { quoted: m });
  await sock.sendMessage(jid, { text: `*🏓 Pong*\n> ${Date.now() - t0} ms`, edit: sent.key }).catch(() => {});
}
const CMD_PING = [{ test: c => /^\/p(\s|$)/i.test(c.text), run: c => pingCmd(c.m, c.jid) }];

module.exports.commands = [...CMD_PING];
