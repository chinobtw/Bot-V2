// /level, /top, /msgcount, /topcount, /topinactive
const { OWNER } = require('../../config');
const { modBots } = require('../admin/moderacion');
const { socDias, socObjetivo } = require('./_comun');
const { act, perf } = require('../../src/db/social');
const { subReg } = require('../../src/db/subbots');
const { actBuscar, actVentana, nivelDe, perfGet, xpDe, xpPuesto } = require('../../src/lib/actividad');
const { ecoIds, fmtTiempo } = require('../../src/lib/economia');
const { rxLimpio, rxNombreDe } = require('../../src/lib/nombres');
const { quienJid, socEtiq, socFecha, socFmt, socMapa, socMiembro, socPag } = require('../../src/lib/social');
const { idsDe, num, sock } = require('../../src/lib/state');

const SOC_NIVEL = {
  async level(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid);
    const u = perfGet(ids), xp = u?.xp || 0, niv = nivelDe(xp), a = xpDe(niv), b = xpDe(niv + 1), nombre = rxNombreDe(ids) || (t? '' : rxLimpio(c.m.pushName));
    return c.reply(`*「✿」Usuario* ◢ ${nombre || '@' + num(quien)} ◤\n\n☆ Experiencia » *${socFmt(xp)}*\n❖ Nivel » *${niv}*\n➨ Progreso » *${xp - a} / ${b - a}*  _(${Math.floor((xp - a) / (b - a) * 100)}%)_\n# Puesto » *#${xpPuesto(xp)}*\n\n❒ Comandos totales » *${u?.cmds || 0}*`, nombre? [] : [quien]);
  },
  async top(c) {
    const filas = Object.values(perf.u).filter(u => (u.xp || 0) > 0).sort((a, b) => b.xp - a.xp);
    if (!filas.length) return c.reply('Todavía nadie tiene XP. Se gana usando los comandos de economía y apuestas.');
    const pg = socPag(filas, parseInt(c.args)), ms = [];
    const lineas = pg.items.map((u, i) => { const n = rxNombreDe(u.ids), j = u.jid || (u.ids[0] + '@s.whatsapp.net'); if (!n) ms.push(j); const pos = pg.ini + i; return `${['🥇', '🥈', '🥉'][pos] || `*${pos + 1}.*`} ${n || '@' + num(j)} — nivel ${nivelDe(u.xp)} · ${socFmt(u.xp)} XP · ${socFmt(u.cmds || 0)} cmds`; });
    return c.reply(`🏆 *Ranking global de nivel*\n\n${lineas.join('\n')}\n\n> Página ${pg.p}/${pg.total}${pg.p < pg.total? ` · /top ${pg.p + 1} para la siguiente` : ''}`, ms);
  },
  async msgcount(c) {
    const t = await socObjetivo(c.m, c.jid, c.args.replace(/(^|\s)@\S+/g, ' ')), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid);
    const dias = socDias(c.args.replace(/(^|\s)\+?\d{8,15}(?=\s|$)/g, ' ')), r = actBuscar(c.jid, ids), desde = act[c.jid]?.desde;
    if (!r) return c.reply(`📊 @${num(quien)} todavía no tiene mensajes contados en este grupo.${desde? `\n> Cuento desde el ${socFecha(desde)}.` : ''}`, [quien]);
    const lin = [`📊 *Mensajes de @${num(quien)}*`, ''];
    if (dias) lin.push(`📅 Últimos ${dias} día${dias === 1? '' : 's'}: *${socFmt(actVentana(r, dias))}*`);
    lin.push(`💬 Total contado: *${socFmt(r.n)}*`, `🕒 Último mensaje: ${r.t? 'hace ' + fmtTiempo(Date.now() - r.t) : '—'}`, '', `> Cuento desde el ${socFecha(desde)}`);
    return c.reply(lin.join('\n'), [quien]);
  },
  async topcount(c) {
    const dias = socDias(c.args), meta = await sock.groupMetadata(c.jid), mp = socMapa(meta), filas = [];
    for (const r of Object.values(act[c.jid]?.u || {})) { const p = socMiembro(mp, r.ids), n = actVentana(r, dias); if (p && n > 0) filas.push({ r, p, n }); }
    filas.sort((a, b) => b.n - a.n);
    if (!filas.length) return c.reply('Todavía no hay mensajes contados' + (dias? ` en los últimos ${dias} días` : '') + '.');
    const ms = [], lineas = filas.slice(0, 15).map((f, i) => { const e = socEtiq(f.p, f.r.ids); if (e.jid) ms.push(e.jid); return `${['🥇', '🥈', '🥉'][i] || `*${i + 1}.*`} ${e.txt} — ${socFmt(f.n)} mensajes`; });
    return c.reply(`💬 *Top de mensajes${dias? ` (últimos ${dias} días)` : ''}*\n\n${lineas.join('\n')}\n\n> Cuento desde el ${socFecha(act[c.jid]?.desde || Date.now())} · /topcount 7 para la última semana`, ms);
  },
  // la lista sale con el formato que lee /killinactive: "*#N* @usuario ..." y las menciones en el mismo orden
  async topinactive(c) {
    const nums = c.args.split(/\s+/).filter(Boolean);
    let pagina = 1, dias = 7;
    const sueltos = nums.filter(x => /^\d{1,3}$/.test(x)), conD = nums.find(x => /^\d{1,3}d$/i.test(x));
    if (sueltos[0]) pagina = +sueltos[0];
    if (sueltos[1]) dias = +sueltos[1]; else if (conD) dias = parseInt(conD);
    dias = Math.min(Math.max(1, dias), 365);
    const meta = await sock.groupMetadata(c.jid), g = act[c.jid], limite = Date.now() - dias * 86400e3, bots = [...modBots(),...Object.keys(subReg)];
    const desde = g?.desde || Date.now();
    if (Date.now() - desde < dias * 86400e3) return c.reply(`💤 Todavía no puedo saber quién está inactivo hace ${dias} día${dias === 1? '' : 's'}: recién empecé a contar el ${socFecha(desde)}.\n> Probá con menos días (ej: /topinactive 1 ${Math.max(1, Math.floor((Date.now() - desde) / 86400e3))}) o esperá un poco.`);
    const filas = [];
    for (const p of meta.participants) {
      const ids = idsDe(p);
      if (p.admin || ids.includes(OWNER) || ids.some(x => bots.includes(x))) continue;   // no se listan admins, el dueño ni los bots
      const r = actBuscar(c.jid, ids), ult = r? (r.t || r.p) : desde;
      if (ult < limite) filas.push({ p, r, ult });
    }
    filas.sort((a, b) => a.ult - b.ult);
    if (!filas.length) return c.reply(`✅ Nadie lleva más de ${dias} día${dias === 1? '' : 's'} sin escribir.`);
    const pg = socPag(filas, pagina, 20), ms = pg.items.map(f => f.p.id);
    const lineas = pg.items.map((f, i) => `*#${pg.ini + i + 1}* @${num(f.p.id)} · ${Math.floor((Date.now() - f.ult) / 86400e3)} d sin escribir · ${socFmt(f.r?.n || 0)} msj`);
    return c.reply(`💤 *Inactivos* (más de ${dias} día${dias === 1? '' : 's'} sin escribir)\n> Página ${pg.p}/${pg.total} · ${filas.length} en total · cuento desde el ${socFecha(desde)}\n\n${lineas.join('\n')}\n\n> Para sacarlos, respondé a este mensaje con /killinactive all | 5 | 1-8${pg.p < pg.total? `\n> Siguiente página: /topinactive ${pg.p + 1} ${dias}` : ''}`, ms);
  },
};

module.exports = { SOC_NIVEL };
