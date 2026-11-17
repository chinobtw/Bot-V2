// Economía extra: /dados, /loteria y /prestamo
const { saveEco } = require('../../src/db/economia');
const { loteria, prestamos } = require('../../src/db/extras');
const { apuestaArgs, apuestaInicio, conSuspenso, pieSaldo } = require('../../src/lib/apuestas');
const { din, ecoGet, ecoIds, fmtTiempo } = require('../../src/lib/economia');
const { comando, responder } = require('../../src/lib/medios');
const { PRESTAMO_INTERES, PRESTAMO_MAX, PRESTAMO_PLAZO, prestamoBuscar } = require('../../src/lib/prestamos');
const { sock } = require('../../src/lib/state');
const { ecoMonto } = require('./economia');
const { modPuede } = require('../admin/moderacion');

// ----- /dados: dos dados; si sale doble cobrás x3 -----
const dado = () => 1 + Math.floor(Math.random() * 6), CARA = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
async function dadosCmd(c) {
  const { arg } = apuestaArgs(c.text);
  const uso = 'Uso: /dados <monto|all>\n> Si salen dos dados iguales ganás x3, si no perdés lo apostado';
  const a = await apuestaInicio(c.m, c.jid, arg, uso); if (!a) return;
  const { u, n } = a, d1 = dado(), d2 = dado(), gana = d1 === d2;
  if (gana) u.cartera += n * 3;
  saveEco();
  const fin = `🎲 *Dados*\n${CARA[d1]} ${d1}  y  ${CARA[d2]} ${d2}\n> Apostaste ${din(n)}\n\n${gana? `🎉 *¡Doble!* Ganaste ${din(n * 2)} (x3)` : `Perdiste ${din(n)}`}${pieSaldo(u)}`;
  await conSuspenso(c.m, c.jid, `🎲 *Dados*\nLos dados ruedan...\n> Apostaste ${din(n)}`, 1200, fin);
}

// ----- /loteria: boletos de $5.000 (máx. 20 por persona); un admin hace el sorteo y el ganador se lleva todo el pozo -----
const BOLETO = 5000, BOLETOS_MAX = 20;
const estado = jid => (loteria.datos[jid] ||= { boletos: {} });
const totales = g => Object.values(g.boletos).reduce((a, b) => a + b.n, 0);
async function loteriaCmd(c) {
  const reply = responder(c), jid = c.jid, arg = c.text.replace(/^\/\S+\s*/, '').trim().toLowerCase();
  const g = estado(jid), tot = totales(g);
  if (/^sortear\b/.test(arg)) {
    if (!(await modPuede(c.m, jid))) return reply('⛔ Solo admins pueden hacer el sorteo');
    if (Object.keys(g.boletos).length < 2) return reply('🎟️ Hacen falta al menos 2 jugadores para sortear');
    let k = Math.floor(Math.random() * tot), ganador;
    for (const e of Object.values(g.boletos)) { if (k < e.n) { ganador = e; break; } k -= e.n; }
    const pozo = tot * BOLETO, u = ecoGet(jid, ganador.ids);
    u.cartera += pozo; saveEco();
    delete loteria.datos[jid]; loteria.guardar();
    return reply(`🎟️ *¡Sorteo de la lotería!*\n\n🏆 Ganador: @${ganador.jid.split('@')[0].split(':')[0]}\n💰 Premio: ${din(pozo)}\n> Tenía ${ganador.n} boleto(s) de ${tot}`, [ganador.jid]);
  }
  const comprar = arg.match(/^(?:comprar|buy)\s*(\d*)$/);
  if (comprar) {
    const n = Number(comprar[1] || 1);
    if (!(n >= 1)) return reply('Uso: /loteria comprar <cantidad>');
    const ids = await ecoIds(c.m, jid), u = ecoGet(jid, ids); u.ult = Date.now();
    const k = Object.keys(g.boletos).find(k => g.boletos[k].ids.some(x => ids.includes(x)));
    const tiene = k? g.boletos[k].n : 0;
    if (tiene + n > BOLETOS_MAX) return reply(`🎟️ Podés tener hasta ${BOLETOS_MAX} boletos por sorteo (ya tenés ${tiene}).`);
    const costo = n * BOLETO;
    if (u.cartera < costo) return reply(`No te alcanza: ${n} boleto(s) salen ${din(costo)} y tenés ${din(u.cartera)} afuera del banco.`);
    u.cartera -= costo;
    if (k) { g.boletos[k].n += n; g.boletos[k].ids = [...new Set([...g.boletos[k].ids, ...ids])]; }
    else g.boletos[ids[0]] = { ids, jid: c.m.key.participant || jid, n };
    saveEco(); loteria.guardar();
    return reply(`🎟️ Compraste ${n} boleto(s) por ${din(costo)}\n> Tenés ${tiene + n} en total. Pozo: ${din(totales(g) * BOLETO)}${pieSaldo(u)}`);
  }
  const ids = await ecoIds(c.m, jid), mio = Object.values(g.boletos).find(e => e.ids.some(x => ids.includes(x)))?.n || 0;
  await reply(`🎟️ *Lotería del grupo*\n💰 Pozo: ${din(tot * BOLETO)}\n🎫 Boletos vendidos: ${tot} (${Object.keys(g.boletos).length} jugador(es))\n🙋 Los tuyos: ${mio}\n\n> /loteria comprar <cantidad>: cada boleto sale ${din(BOLETO)} (máx. ${BOLETOS_MAX})\n> Un admin hace el sorteo con /loteria sortear`);
}

// ----- /prestamo: hasta $100.000, con 10% de interés, a pagar en 3 días. Si vence, el banco lo cobra solo -----
async function prestamoCmd(c) {
  const reply = responder(c), jid = c.jid, arg = c.text.replace(/^\/\S+\s*/, '').trim();
  const ids = await ecoIds(c.m, jid), u = ecoGet(jid, ids); u.ult = Date.now();
  const f = prestamoBuscar(jid, ids);
  if (/^(pagar|pay)\b/i.test(arg)) {
    if (!f) return reply('🏦 No tenés ningún préstamo para pagar');
    const resto = arg.replace(/^\S+\s*/, '').trim() || 'all';
    const n = Math.min(ecoMonto(resto, Math.min(u.cartera, f.p.deuda)) || 0, f.p.deuda);
    if (!n || n < 1) return reply(u.cartera < 1? '👛 No tenés plata afuera del banco para pagar. Sacá del banco con /retirar.' : 'Uso: /prestamo pagar <monto|all>');
    if (n > u.cartera) return reply(`No tenés tanto afuera del banco. Tenés ${din(u.cartera)}.`);
    u.cartera -= n; f.p.deuda -= n;
    if (f.p.deuda <= 0) delete f.g[f.k];
    saveEco(); prestamos.guardar();
    return reply(`🏦 Pagaste ${din(n)}.${f.g[f.k]? `\n> Todavía debés ${din(f.p.deuda)}` : '\n> ¡Quedaste al día!'}${pieSaldo(u)}`);
  }
  if (!arg) {
    if (!f) return reply(`🏦 *Préstamos*\nNo tenés deudas.\n> /prestamo <monto>: hasta ${din(PRESTAMO_MAX)}, ${PRESTAMO_INTERES * 100}% de interés, a pagar en ${PRESTAMO_PLAZO / 86400e3} días\n> Si no pagás a tiempo, el banco te lo cobra solo`);
    const falta = f.p.vence - Date.now();
    return reply(`🏦 *Tu préstamo*\nDebés: ${din(f.p.deuda)}\n${falta > 0? `⏳ Vence en ${fmtTiempo(falta)}` : '⚠️ Está vencido: se cobra en tu próximo comando'}\n> Pagalo con /prestamo pagar <monto|all>`);
  }
  if (f) return reply(`🏦 Ya tenés un préstamo: debés ${din(f.p.deuda)}. Pagalo antes de pedir otro.`);
  if (!/^\d[\d.,\s]*$/.test(arg)) return reply('Uso: /prestamo <monto>');
  const n = ecoMonto(arg, 0);
  if (!n || n < 1) return reply('Uso: /prestamo <monto>');
  if (n > PRESTAMO_MAX) return reply(`🏦 El máximo es ${din(PRESTAMO_MAX)}.`);
  const deuda = Math.round(n * (1 + PRESTAMO_INTERES));
  u.cartera += n;
  (prestamos.datos[jid] ||= {})[ids[0]] = { ids, jid: c.m.key.participant || jid, deuda, vence: Date.now() + PRESTAMO_PLAZO };
  saveEco(); prestamos.guardar();
  await reply(`🏦 *Préstamo aprobado*\nRecibís: ${din(n)}\nDevolvés: ${din(deuda)} (${PRESTAMO_INTERES * 100}% de interés)\n⏳ Plazo: ${PRESTAMO_PLAZO / 86400e3} días\n> Pagá con /prestamo pagar <monto|all>${pieSaldo(u)}`);
}

module.exports.commands = [
  { test: c => c.enGrupo && comando('dados', 'dice')(c), run: dadosCmd },
  { test: c => c.enGrupo && comando('loteria', 'lotería', 'lottery')(c), run: loteriaCmd },
  { test: c => c.enGrupo && comando('prestamo', 'préstamo', 'loan')(c), run: prestamoCmd },
];
