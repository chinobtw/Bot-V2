// /pay, /baltop, /economyinfo, /economy
const { ACCIONES, ecoMonto } = require('../economia/economia');
const { socToggle } = require('./_comun');
const { eco, saveEco } = require('../../src/db/economia');
const { grp } = require('../../src/db/social');
const { cdRestante, din, ecoGet, ecoIds, ecoObjetivo, ecoRacha, fmtTiempo, hoyAR } = require('../../src/lib/economia');
const { quienJid, socEtiq, socMapa, socMiembro, socPag } = require('../../src/lib/social');
const { botIds, num, sock } = require('../../src/lib/state');

const SOC_ECONOMIA = {
  async pay(c) {
    const t = await ecoObjetivo(c.m, c.jid);
    if (!t) return c.reply('Uso: /pay @usuario <monto|all> (o respondiendo a su mensaje)');
    const ids = await ecoIds(c.m, c.jid), arg = c.args.replace(/(^|\s)@\S+/g, ' ').trim();
    if (t.ids.some(x => ids.includes(x))) return c.reply('No podés pagarte a vos mismo 🤨');
    if (t.ids.some(x => botIds().includes(x))) return c.reply('Yo no cobro propinas 🙂');
    const u = ecoGet(c.jid, ids); u.ult = Date.now();
    if (!/^(\d[\d.,\s]*|all|todo)$/i.test(arg)) return c.reply(`Uso: /pay @usuario <monto|all>\n👛 Billetera: ${din(u.cartera)}`);
    const n = ecoMonto(arg, u.cartera);
    if (!n || n < 1) return c.reply(u.cartera < 1? '👛 No tenés plata afuera del banco para pagar. Sacá del banco con /retirar.' : 'Uso: /pay @usuario <monto|all>');
    if (n > u.cartera) return c.reply(`No tenés tanto afuera del banco. Tenés ${din(u.cartera)}.`);
    const v = ecoGet(c.jid, t.ids);
    u.cartera -= n; v.cartera += n; saveEco();
    const yo = quienJid(c.m, c.jid);
    return c.reply(`💸 @${num(yo)} le pagó ${din(n)} a @${num(t.jid)}\n\n👛 Te quedan: ${din(u.cartera)}`, [yo, t.jid]);
  },
  async baltop(c) {
    const meta = await sock.groupMetadata(c.jid), mp = socMapa(meta), filas = [];
    for (const u of Object.values(eco[c.jid] || {})) { const p = socMiembro(mp, u.ids), tot = u.cartera + u.banco; if (p && tot > 0) filas.push({ u, p, tot }); }
    filas.sort((a, b) => b.tot - a.tot);
    if (!filas.length) return c.reply('Todavía nadie tiene plata en este grupo. Empezá con /daily 😉');
    const pg = socPag(filas, parseInt(c.args)), ms = [];
    const lineas = pg.items.map((f, i) => {
      const e = socEtiq(f.p, f.u.ids); if (e.jid) ms.push(e.jid);
      const pos = pg.ini + i;
      return `${['🥇', '🥈', '🥉'][pos] || `*${pos + 1}.*`} ${e.txt} — ${din(f.tot)}`;
    });
    return c.reply(`🏆 *Ranking de economía*\n\n${lineas.join('\n')}\n\n> Página ${pg.p}/${pg.total}${pg.p < pg.total? ` · /baltop ${pg.p + 1} para la siguiente` : ''}`, ms);
  },
  async einfo(c) {
    const t = await ecoObjetivo(c.m, c.jid), ids = t? t.ids : await ecoIds(c.m, c.jid);
    const u = ecoGet(c.jid, ids, false), quien = t? t.jid : quienJid(c.m, c.jid);
    if (!u) return c.reply(`💼 @${num(quien)} todavía no tiene movimientos de economía en este grupo.`, [quien]);
    const orden = Object.values(eco[c.jid] || {}).map(x => x.cartera + x.banco).sort((a, b) => b - a), tot = u.cartera + u.banco;
    const puesto = orden.indexOf(tot) + 1, r = ecoRacha(ids), hoy = hoyAR();
    const cd = (k, ms) => { const x = cdRestante(u, k, ms); return x > 0? `⏳ ${fmtTiempo(x)}` : '✅ listo'; };
    return c.reply(`💼 *Economía de @${num(quien)}*\n\n👛 Billetera: ${din(u.cartera)}\n🏦 Banco: ${din(u.banco)}\n💰 Total: ${din(tot)}\n🏆 Puesto: #${puesto} de ${orden.length}\n\n🔥 Racha de daily: ${r.dias} día${r.dias === 1? '' : 's'} (${u.ultDaily === hoy? 'hoy ya cobraste' : 'hoy te falta cobrar'})\n\n⏱️ *Tiempos*\n• /w: ${cd('w', ACCIONES.w.cd)}\n• /crime: ${cd('crime', ACCIONES.crime.cd)}\n• /minar: ${cd('minar', ACCIONES.minar.cd)}\n• /hacking: ${cd('hacking', ACCIONES.hacking.cd)}\n• /rob: ${cd('rob', 3600e3)}`, [quien]);
  },
  economy: c => socToggle(c, 'noeco', '💰 Economía', 'economy', '✅ Economía activada en este grupo', '🚫 Economía desactivada en este grupo (los comandos de plata no van a responder)', () => !grp[c.jid]?.noeco),
};

module.exports = { SOC_ECONOMIA };
