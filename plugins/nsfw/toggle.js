// /nsfw on|off por grupo
const { nsfw, nsfwOn, saveNsfw } = require('../../src/db/nsfw');
const { isAdmin, isOwner, sock } = require('../../src/lib/state');

// ---------- /nsfw on|off: habilita o deshabilita los comandos NSFW (como /r34) en el grupo; lo cambian los admins y el dueño ----------
// Para bloquear otro comando NSFW, ponele esta línea al principio:  if (!nsfwOn(jid)) return reply('🔞 Los comandos NSFW están desactivados en este grupo. Un admin puede activarlos con /nsfw on');
async function nsfwCmd(m, jid, text) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  if (!jid.endsWith('@g.us')) return reply('🔞 En el privado los comandos NSFW están siempre habilitados. /nsfw es solo para grupos');
  const arg = text.replace(/^\/\S+\s*/, '').trim().toLowerCase();
  if (!arg) return reply(`🔞 Comandos NSFW: *${nsfwOn(jid)? 'activados' : 'desactivados'}* en este grupo\n> Los cambia un admin con /nsfw on o /nsfw off`);
  if (arg!== 'on' && arg!== 'off') return reply('Uso: /nsfw on | /nsfw off | /nsfw (ver el estado)');
  if (!(await isAdmin(jid, m).catch(() => false)) &&!(await isOwner(m, jid).catch(() => false))) return reply('⛔ Solo admins');
  if (arg === 'on') nsfw[jid] = true; else delete nsfw[jid];
  saveNsfw();
  await reply(arg === 'on'? '🔞 Comandos NSFW *activados* en este grupo' : '✅ Comandos NSFW *desactivados* en este grupo');
}
const CMD_NSFW = [{ test: c => /^\/nsfw(\s|$)/i.test(c.text), run: c => nsfwCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_NSFW];
