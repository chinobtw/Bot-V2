// Utilidades comunes de los juegos de apuestas
const { ecoMonto } = require('../../plugins/economia/economia');
const { din, ecoGet, ecoIds } = require('./economia');
const { sleep, sock } = require('./state');

// ----- apuestas: /rt /cf /bj /maq (se apuesta de la billetera; lo que se pierde no va a nadie) -----
// "5000 rojo" o "rojo 5000": el orden no importa. opcion(t) devuelve la clave de la opción si el texto es una, o undefined.
function apuestaArgs(text, opcion) {
  const toks = text.replace(/^\/\S+\s*/, '').trim().split(/\s+/).filter(Boolean);
  let op = null; const resto = [];
  for (const t of toks) { const k = opcion? opcion(t.toLowerCase()) : null; if (k && !op) op = k; else resto.push(t); }
  return { op, arg: resto.join(' ') };
}
// valida el monto y descuenta la apuesta en el mismo paso (sin awaits en el medio, así no se puede apostar dos veces la misma plata)
async function apuestaInicio(m, jid, arg, uso, bloquea) {
  const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
  const u = ecoGet(jid, await ecoIds(m, jid)); u.ult = Date.now();
  const bloqueo = bloquea?.(u); if (bloqueo) { await reply(bloqueo); return null; }
  if (!arg) { await reply(`${uso}\n👛 Billetera: ${din(u.cartera)}`); return null; }
  if (!/^(\d[\d.,\s]*|all|todo)$/i.test(arg)) { await reply(uso); return null; }
  const n = ecoMonto(arg, u.cartera);
  if (!n || n < 1) { await reply(u.cartera < 1? '👛 No tenés plata afuera del banco para apostar. Sacá del banco con /retirar.' : uso); return null; }
  if (n > u.cartera) { await reply(`No tenés tanto afuera del banco. Tenés ${din(u.cartera)}.`); return null; }
  u.cartera -= n;
  return { u, n, reply };
}
// manda un mensaje de "suspenso" y a los segundos lo edita con el resultado
async function conSuspenso(m, jid, inicial, ms, final) {
  const s = await sock.sendMessage(jid, { text: inicial }, { quoted: m });
  await sleep(ms);
  if (s?.key) await sock.sendMessage(jid, { text: final, edit: s.key }).catch(() => sock.sendMessage(jid, { text: final }, { quoted: m }));
  else await sock.sendMessage(jid, { text: final }, { quoted: m });
}
const pieSaldo = u => `\n👛 Billetera: ${din(u.cartera)}`;

module.exports = { apuestaArgs, apuestaInicio, conSuspenso, pieSaldo };
