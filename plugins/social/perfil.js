// /profile, /setdesc, /setbirth, /birthdays, /marry, /divorce
const { modBots } = require('../admin/moderacion');
const { limpiar } = require('../personalizar/index');
const { rxObjetivo } = require('../reacciones/reacciones');
const { nombreDe, socObjetivo } = require('./_comun');
const { durTxt, marryPorMsg } = require('./marry');
const { perf, perfDisco } = require('../../src/db/social');
const { actBuscar, nivelDe, perfGet } = require('../../src/lib/actividad');
const { cumpleTxt, diasEn, diasHastaCumple, edadDe } = require('../../src/lib/cumple');
const { din, ecoGet, ecoIds, hoyAR } = require('../../src/lib/economia');
const { rxNombreDe } = require('../../src/lib/nombres');
const { quienJid, socFecha, socFmt, socMapa, socMiembro } = require('../../src/lib/social');
const { ctxBot, num, sock } = require('../../src/lib/state');

const SOC_PERFIL = {
  async profile(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid), hoy = hoyAR();
    const u = perfGet(ids), r = c.grupo? actBuscar(c.jid, ids) : null, e = c.grupo? ecoGet(c.jid, ids, false) : null;
    const lin = [`👤 *Perfil de @${num(quien)}*`, ''];
    lin.push(`📝 ${u?.desc || '_Sin descripción (se cambia con /setdesc)_'}`);
    lin.push(`🎂 Cumpleaños: ${u?.cumple? cumpleTxt(u.cumple) + (edadDe(u.cumple, hoy) != null? ` (${edadDe(u.cumple, hoy)} años)` : '') : '_sin definir (/setbirth)_'}`);
    const ms = [quien];
    if (u?.pareja) { lin.push(`💍 Pareja: @${num(u.pareja.jid)} · hace ${durTxt(Date.now() - u.pareja.desde)}`); ms.push(u.pareja.jid); } else lin.push('💍 Pareja: _soltero/a_');
    if (u?.xp) lin.push('', `⭐ Nivel ${nivelDe(u.xp)} · ${socFmt(u.xp)} XP · ${socFmt(u.cmds || 0)} comandos`);
    if (r) lin.push(`💬 ${socFmt(r.n)} mensajes en este grupo`);
    if (e) lin.push(`💰 Plata: ${din(e.cartera + e.banco)}`);
    let url = null; try { url = await sock.profilePictureUrl(quien, 'image'); } catch {}
    const txt = lin.join('\n');
    if (url) { try { return void await sock.sendMessage(c.jid, { image: { url }, caption: txt, mentions: ms }, { quoted: c.m }); } catch {} }
    return c.reply(txt, ms);
  },
  async setdesc(c) {
    const ids = await ecoIds(c.m, c.jid);
    if (!c.args) return c.reply('Uso: /setdesc <texto> (hasta 200 caracteres)\n> /setdesc reset para borrarla');
    if (/^(reset|borrar|off)$/i.test(c.args)) { const u = perfGet(ids); if (u) { delete u.desc; perfDisco.luego(); } return c.reply('🗑️ Descripción borrada'); }
    const d = limpiar(c.args);
    if (d.length > 200) return c.reply('⚠️ La descripción puede tener hasta 200 caracteres');
    perfGet(ids, true, quienJid(c.m, c.jid)).desc = d; perfDisco.luego();
    return c.reply('✅ Descripción guardada. Mirala con /profile');
  },
  async setbirth(c) {
    const r = c.args.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{4}))?$/);
    if (!r) return c.reply('Uso: /setbirth día/mes (o día/mes/año)\n> Ej: /setbirth 15/03 o /setbirth 15/03/1999');
    const d = +r[1], mes = +r[2], a = r[3]? +r[3] : null;
    if (mes < 1 || mes > 12 || d < 1 || !diasEn(d, mes)) return c.reply('⚠️ Esa fecha no existe');
    if (a && (a < 1930 || a > new Date().getUTCFullYear() - 5)) return c.reply('⚠️ Ese año no me cierra');
    perfGet(await ecoIds(c.m, c.jid), true, quienJid(c.m, c.jid)).cumple = { d, m: mes, ...(a? { a } : {}) }; perfDisco.luego();
    return c.reply(`🎂 Listo, tu cumpleaños es el *${cumpleTxt({ d, m: mes })}*${a? ` de ${a}` : ''}. Te voy a saludar ese día.`);
  },
  async delbirth(c) {
    const u = perfGet(await ecoIds(c.m, c.jid));
    if (!u?.cumple) return c.reply('No tenías cumpleaños guardado');
    delete u.cumple; perfDisco.luego();
    return c.reply('🗑️ Cumpleaños borrado');
  },
  async birthdays(c) {
    const meta = await sock.groupMetadata(c.jid), mp = socMapa(meta), hoy = hoyAR(), filas = [];
    for (const u of Object.values(perf.u)) { if (!u.cumple) continue; const p = socMiembro(mp, u.ids); if (p) filas.push({ u, p, en: diasHastaCumple(u.cumple, hoy) }); }
    filas.sort((a, b) => a.en - b.en);
    if (!filas.length) return c.reply('🎂 Nadie del grupo cargó su cumpleaños todavía. Se hace con /setbirth 15/03');
    const ms = [], lineas = filas.slice(0, 10).map(f => { ms.push(f.p.id); return `• @${num(f.p.id)} — ${cumpleTxt(f.u.cumple)} (${f.en === 0? '¡hoy! 🎉' : f.en === 1? 'mañana' : `en ${f.en} días`})`; });
    return c.reply(`🎂 *Próximos cumpleaños*\n\n${lineas.join('\n')}`, ms);
  },
  async marry(c) {
    const t = await rxObjetivo(c.m, c.jid);
    if (!t) return c.reply('Uso: /marry @usuario (o respondiendo a su mensaje)');
    const ids = await ecoIds(c.m, c.jid), yo = quienJid(c.m, c.jid);
    if (t.ids.some(x => ids.includes(x))) return c.reply('No podés casarte con vos mismo 🤨');
    if (t.ids.some(x => modBots().includes(x))) return c.reply('Soy un bot, no tengo tiempo para el amor 💔');
    const ua = perfGet(ids), ub = perfGet(t.ids);
    if (ua?.pareja) return c.reply(`Ya estás casado/a con @${num(ua.pareja.jid)}. Primero /divorce.`, [ua.pareja.jid]);
    if (ub?.pareja) return c.reply(`@${num(t.jid)} ya está casado/a con @${num(ub.pareja.jid)} 😬`, [t.jid, ub.pareja.jid]);
    const s = await sock.sendMessage(c.jid, { text: `💍 @${num(yo)} le propuso casamiento a @${num(t.jid)}\n\n@${num(t.jid)}, respondé a este mensaje con *sí* o *no* (tenés 10 minutos).`, mentions: [yo, t.jid] }, { quoted: c.m });
    if (s?.key?.id) marryPorMsg.set(s.key.id, { bot: ctxBot(), jid: c.jid, t: Date.now(), a: { ids, jid: yo, nombre: nombreDe(c.m, ids) }, b: { ids: t.ids, jid: t.jid, nombre: t.nombre || rxNombreDe(t.ids) } });
  },
  async divorce(c) {
    const ids = await ecoIds(c.m, c.jid), ua = perfGet(ids);
    if (!ua?.pareja) return c.reply('No estás casado/a con nadie 🤷');
    const ub = perfGet(ua.pareja.ids), ahora = Date.now(), p = ua.pareja, yo = quienJid(c.m, c.jid);
    ua.hist.push({ ids: p.ids, jid: p.jid, nombre: p.nombre, desde: p.desde, hasta: ahora });
    if (ub?.pareja) { ub.hist.push({ ids: ua.ids, jid: ua.jid || yo, nombre: nombreDe(c.m, ids), desde: ub.pareja.desde, hasta: ahora }); delete ub.pareja; }
    delete ua.pareja; perfDisco.luego();
    return c.reply(`💔 @${num(yo)} y @${num(p.jid)} se divorciaron después de ${durTxt(ahora - p.desde)}.`, [yo, p.jid]);
  },
  async marryhistory(c) {
    const t = await socObjetivo(c.m, c.jid, c.args), ids = t? t.ids : await ecoIds(c.m, c.jid), quien = t? t.jid : quienJid(c.m, c.jid);
    const u = perfGet(ids);
    if (!u || (!u.pareja && !(u.hist || []).length)) return c.reply(`💍 @${num(quien)} nunca se casó.`, [quien]);
    const ms = [quien], lin = [`💍 *Matrimonios de @${num(quien)}*`, ''];
    if (u.pareja) { lin.push(`• Actual: @${num(u.pareja.jid)} · desde el ${socFecha(u.pareja.desde)} (${durTxt(Date.now() - u.pareja.desde)})`); ms.push(u.pareja.jid); }
    for (const h of [...u.hist].reverse().slice(0, 15)) lin.push(`• ${h.nombre || '+' + num(h.jid)} · ${socFecha(h.desde)} → ${socFecha(h.hasta)} (${durTxt(h.hasta - h.desde)})`);
    return c.reply(lin.join('\n'), ms);
  },
};

module.exports = { SOC_PERFIL };
