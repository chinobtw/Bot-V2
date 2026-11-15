// Comandos sociales: junta las tablas de cada grupo y despacha por nombre o alias
const { modPuede } = require('../admin/moderacion');
const { SOC_BOT } = require('./bot');
const { SOC_ECONOMIA } = require('./economia');
const { SOC_GRUPO } = require('./grupo');
const { SOC_NIVEL } = require('./nivel');
const { SOC_PERFIL } = require('./perfil');
const { SOC_UTIL } = require('./utilidades');
const { sock } = require('../../src/lib/state');

// ===== los comandos =====
const SOC_ALIAS = {
  pay: 'pay', givecoins: 'pay', coinsgive: 'pay',
  baltop: 'baltop', economyboard: 'baltop', eboard: 'baltop',
  economyinfo: 'einfo', einfo: 'einfo',
  economy: 'economy', economia: 'economy',
  antilink: 'antilink', antienlace: 'antilink',
  welcome: 'welcome', bienvenida: 'welcome', goodbye: 'goodbye', despedida: 'goodbye',
  setwelcome: 'setwelcome', setgoodbye: 'setgoodbye',
  del: 'del', delete: 'del',
  toimg: 'toimg', toimage: 'toimg',
  pfp: 'pfp', getpic: 'pfp',
  setmeta: 'setmeta', setstickermeta: 'setmeta', delmeta: 'delmeta', delstickermeta: 'delmeta',
  level: 'level', lvl: 'level',
  top: 'top', leaderboard: 'top', lboard: 'top',
  msgcount: 'msgcount', count: 'msgcount', messages: 'msgcount', mensajes: 'msgcount',
  topcount: 'topcount', topmessages: 'topcount', topmsgcount: 'topcount', topmensajes: 'topcount',
  topinactive: 'topinactive', topinactivos: 'topinactive', topinactiveusers: 'topinactive',
  profile: 'profile', perfil: 'profile',
  setdesc: 'setdesc', setdescription: 'setdesc',
  setbirth: 'setbirth', delbirth: 'delbirth',
  birthdays: 'birthdays', cumpleaños: 'birthdays', cumpleanos: 'birthdays', births: 'birthdays',
  marry: 'marry', casarse: 'marry', divorce: 'divorce',
  marryhistory: 'marryhistory', marriagehistory: 'marryhistory', historialmatrimonio: 'marryhistory',
  join: 'join', setstatus: 'setstatus', setpfp: 'setpfp',
};
const SOC_RE = new RegExp('^\\/(' + Object.keys(SOC_ALIAS).join('|') + ')(\\s|$)', 'iu');
const SOLO_GRUPO = new Set(['pay', 'baltop', 'einfo', 'economy', 'antilink', 'welcome', 'goodbye', 'setwelcome', 'setgoodbye', 'msgcount', 'topcount', 'topinactive', 'birthdays', 'marry']);
const SOLO_ADMIN = new Set(['setwelcome', 'setgoodbye', 'del', 'topinactive']);
const SOC = { ...SOC_ECONOMIA, ...SOC_GRUPO, ...SOC_UTIL, ...SOC_NIVEL, ...SOC_PERFIL, ...SOC_BOT };
async function socCmd(m, jid, text) {
  const nombre = SOC_ALIAS[((text.match(/^\/(\S+)/u) || [])[1] || '').toLowerCase()];
  const grupo = jid.endsWith('@g.us');
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!nombre || !SOC[nombre]) return;
  if (!grupo && SOLO_GRUPO.has(nombre)) return reply('Este comando es solo para grupos');
  if (grupo && SOLO_ADMIN.has(nombre) && !(await modPuede(m, jid))) return reply('⛔ Solo admins');
  await SOC[nombre]({ m, jid, text, args: text.replace(/^\/\S+\s*/, '').trim(), grupo, reply });
}
const CMD_SOC = [{ test: c => SOC_RE.test(c.text), run: c => socCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_SOC];
