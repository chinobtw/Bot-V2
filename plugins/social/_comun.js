// Ayudas compartidas de los comandos sociales
const { modPuede } = require('../admin/moderacion');
const { grp, grpDisco } = require('../../src/db/social');
const { ecoObjetivo } = require('../../src/lib/economia');
const { rxLimpio, rxNombreDe } = require('../../src/lib/nombres');
const { SOC_DIAS_MAX } = require('../../src/lib/social');
const { idsDe, sock } = require('../../src/lib/state');

// objetivo de un comando: mención o mensaje citado; o un número a secas. Devuelve { ids, jid } (con todos los ids que el grupo le conoce)
async function socObjetivo(m, jid, args) {
  const t = await ecoObjetivo(m, jid); if (t) return t;
  const tok = String(args || '').split(/\s+/).map(x => x.replace(/[+\-()]/g, '')).find(x => /^\d{8,15}$/.test(x));
  if (!tok) return null;
  let ids = [tok], j = tok + '@s.whatsapp.net';
  if (jid.endsWith('@g.us')) { const meta = await sock.groupMetadata(jid).catch(() => null), p = meta?.participants.find(p => idsDe(p).includes(tok)); if (p) { ids = [...new Set([...ids,...idsDe(p)])]; j = p.id; } }
  return { ids, jid: j };
}
const socDias = args => { for (const t of String(args || '').split(/\s+/)) { const r = t.match(/^(\d{1,3})d?$/i); if (r && +r[1] >= 1) return Math.min(+r[1], SOC_DIAS_MAX); } return 0; };
const nombreDe = (m, ids) => rxNombreDe(ids) || rxLimpio(m.pushName);

async function socToggle(c, clave, etiqueta, cmd, textoOn, textoOff, activoFn) {
  const a = c.args.toLowerCase(), activo = activoFn? activoFn() : !!grp[c.jid]?.[clave];
  if (!a) return c.reply(`${etiqueta}: *${activo? 'activado' : 'desactivado'}* en este grupo\n> Se cambia con /${cmd} on o /${cmd} off`);
  if (a !== 'on' && a !== 'off') return c.reply(`Uso: /${cmd} on | /${cmd} off | /${cmd} (ver el estado)`);
  if (!(await modPuede(c.m, c.jid))) return c.reply('⛔ Solo admins');
  const g = (grp[c.jid] ||= {});
  if (clave === 'noeco') { if (a === 'off') g.noeco = true; else delete g.noeco; }
  else if (a === 'on') g[clave] = true; else delete g[clave];
  grpDisco.luego();
  await c.reply(a === 'on'? textoOn : textoOff);
  return a;
}
async function SOC_texto(c, clave, cmd, defecto) {
  if (!c.args) { const g = grp[c.jid] || {}; return c.reply(`Uso: /${cmd} <texto>\n> Podés usar @user (la persona), {grupo} y {miembros}\n> /${cmd} reset vuelve al texto original\n\nActual:\n${g[clave] || defecto}`); }
  if (/^(reset|borrar)$/i.test(c.args)) { if (grp[c.jid]) delete grp[c.jid][clave]; grpDisco.luego(); return c.reply('✅ Texto restablecido'); }
  const t = c.args.slice(0, 500);
  (grp[c.jid] ||= {})[clave] = t; grpDisco.luego();
  return c.reply(`✅ Texto guardado${/@user/i.test(t)? '' : '\n> Tip: poné @user donde quieras que mencione a la persona'}`);
}

module.exports = { SOC_texto, nombreDe, socDias, socObjetivo, socToggle };
