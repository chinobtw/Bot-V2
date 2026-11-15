// /rt: ruleta
const { saveEco } = require('../../src/db/economia');
const { apuestaArgs, apuestaInicio, conSuspenso, pieSaldo } = require('../../src/lib/apuestas');
const { din, ecoGet, ecoIds, rnd } = require('../../src/lib/economia');
const { sock } = require('../../src/lib/state');
const { aleat } = require('../../src/lib/util');

// --- ruleta (europea: 37 casilleros, 18 rojos, 18 negros y 1 verde; rojo/negro paga x2 y verde x5) ---
const RT_ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const RT_COL = { r: ['🔴', 'rojo'], n: ['⚫', 'negro'], v: ['🟢', 'verde'] };
const RT_SI = ['La ruleta te sonrió. Aprovechá, que no pasa seguido.', 'Ganaste. El casino lo anota como "error contable".', 'Suerte de principiante, o de alguien que no tiene nada que perder.', 'La bolita cayó de tu lado. Esta vez.'];
const RT_NO = ['La bolita te vio la cara y eligió otro color.', 'Perdiste. La casa te manda un saludo muy afectuoso.', 'El crupier sonríe. Vos no.', 'Esa plata ahora tiene otro dueño. Uno mejor vestido.'];
async function rtCmd(m, jid, text) {
  const { op, arg } = apuestaArgs(text, t => ({ red: 'r', rojo: 'r', black: 'n', negro: 'n', green: 'v', verde: 'v' })[t]);
  const uso = 'Uso: /rt <monto|all> <rojo|negro|verde>\n> Ejemplo: /rt 5000 rojo (el color puede ir primero)';
  if (!op) { const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now(); return sock.sendMessage(jid, { text: `${uso}\n👛 Billetera: ${din(u.cartera)}` }, { quoted: m }); }
  const a = await apuestaInicio(m, jid, arg, uso); if (!a) return;
  const { u, n } = a;
  const num_ = rnd(0, 36), col = num_ === 0? 'v' : RT_ROJOS.has(num_)? 'r' : 'n';
  const gana = col === op, mult = op === 'v'? 5 : 2;
  if (gana) u.cartera += n * mult;
  saveEco();
  const fin = `🎡 *Ruleta*\nCayó el *${num_}* ${RT_COL[col][0]} ${RT_COL[col][1]}\n> Apostaste ${din(n)} al ${RT_COL[op][0]} ${RT_COL[op][1]}\n\n${aleat(gana? RT_SI : RT_NO)}\n> ${gana? `Ganaste: ${din(n * (mult - 1))} (x${mult})` : `Perdiste: ${din(n)}`}${pieSaldo(u)}`;
  await conSuspenso(m, jid, `🎡 *Ruleta*\nLa bolita está girando...\n> Apostaste ${din(n)} al ${RT_COL[op][0]} ${RT_COL[op][1]}`, 1600, fin);
}
const CMD_RULETA = [{ test: c => /^\/(rt|roulette|ruleta)(\s|$)/i.test(c.text), run: c => rtCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_RULETA];
