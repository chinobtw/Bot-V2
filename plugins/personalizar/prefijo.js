// /setprefix
const { limpiar } = require('./index');
const { setCfg } = require('../../src/db/ajustes');
const { eleccion } = require('../../src/lib/eleccion');
const { prefijo } = require('../../src/lib/prefijo');
const { ctxBot, isOwner, senderIds, sock } = require('../../src/lib/state');

async function setPrefix(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const id = ctxBot().id;
  // solo el dueño del bot: la cuenta del sub-bot, o el creador en el principal
  const dueno = id === 'main'? await isOwner(m, jid) : senderIds(m, jid).includes(id);
  if (!dueno) return;
  const arg = limpiar(text.replace(/^\/setprefix\s*/i, ''));
  if (!arg) return reply(`Prefijo actual: *${prefijo()}*\nUso: /setprefix <un símbolo o letra> (ej: $ # . S)\n/setprefix reset - volver a /`);
  if (/^(reset|default)$/i.test(arg)) { setCfg(id, { prefix: null }); eleccion.clear(); return reply('✅ Prefijo vuelto a */*'); }
  const ch = Array.from(arg);
  if (ch.length!== 1 ||!/^[\p{L}\p{P}\p{S}]$/u.test(ch[0])) return reply('❌ Tiene que ser un solo símbolo o letra (ej: $ # . ! S)');
  setCfg(id, { prefix: ch[0] === '/'? null : ch[0] });
  eleccion.clear();
  await reply(`✅ Prefijo cambiado a *${ch[0]}*\nAhora se usa así: ${ch[0]}menu`);
}
const CMD_PREFIJO = [{ test: c => /^\/setprefix(\s|$)/i.test(c.text), run: c => setPrefix(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_PREFIJO];
