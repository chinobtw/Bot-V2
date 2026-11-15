// /cf: cara o cruz
const { saveEco } = require('../../src/db/economia');
const { apuestaArgs, apuestaInicio, conSuspenso, pieSaldo } = require('../../src/lib/apuestas');
const { din, ecoGet, ecoIds } = require('../../src/lib/economia');
const { sock } = require('../../src/lib/state');
const { aleat } = require('../../src/lib/util');

// --- coinflip: 50/50, ganando duplicás ---
const CF_SI = ['Salió lo que querías. Que no se te suba a la cabeza.', 'Ganaste. La moneda hoy está de tu lado.', 'Acertaste. Ahora andá a comprar un pan, que sos un winner.'];
const CF_NO = ['Salió lo contrario. Como todo en tu vida.', 'Perdiste. La moneda ni siquiera se disculpó.', 'Mala suerte. Y mal ojo, también.'];
async function cfCmd(m, jid, text) {
  const { op, arg } = apuestaArgs(text, t => ({ cara: 'cara', heads: 'cara', cruz: 'cruz', tails: 'cruz' })[t]);
  const uso = 'Uso: /cf <monto|all> <cara|cruz>\n> Ejemplo: /cf 5000 cara (el orden no importa)';
  if (!op) { const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now(); return sock.sendMessage(jid, { text: `${uso}\n👛 Billetera: ${din(u.cartera)}` }, { quoted: m }); }
  const a = await apuestaInicio(m, jid, arg, uso); if (!a) return;
  const { u, n } = a;
  const sale = Math.random() < 0.5? 'cara' : 'cruz', gana = sale === op;
  if (gana) u.cartera += n * 2;
  saveEco();
  const fin = `🪙 *Coinflip*\nSalió *${sale}*\n> Apostaste ${din(n)} a ${op}\n\n${aleat(gana? CF_SI : CF_NO)}\n> ${gana? `Ganaste: ${din(n)} (x2)` : `Perdiste: ${din(n)}`}${pieSaldo(u)}`;
  await conSuspenso(m, jid, `🪙 *Coinflip*\nLa moneda está en el aire...\n> Apostaste ${din(n)} a ${op}`, 1200, fin);
}
const CMD_COINFLIP = [{ test: c => /^\/(cf|coinflip)(\s|$)/i.test(c.text), run: c => cfCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_COINFLIP];
