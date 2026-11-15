// Propuestas de /marry y respuesta con sí/no
const { perfDisco } = require('../../src/db/social');
const { perfGet } = require('../../src/lib/actividad');
const { num, senderIds, sock } = require('../../src/lib/state');

const marryPorMsg = new Map();   // id del mensaje de propuesta -> { bot, jid, a, b, t }
const MARRY_MS = 10 * 60e3;
setInterval(() => { for (const [k, v] of marryPorMsg) if (Date.now() - v.t > MARRY_MS) marryPorMsg.delete(k); }, 5 * 60e3).unref();
const durTxt = ms => { const d = Math.floor(ms / 86400e3); return d >= 1? `${d} día${d === 1? '' : 's'}` : 'menos de un día'; };
async function marryResp(m, jid, g, qid, acepta) {
  const reply = (t, mentions = []) => sock.sendMessage(jid, { text: t, mentions }, { quoted: m });
  if (!senderIds(m, jid).some(x => g.b.ids.includes(x))) return;   // solo contesta a quien se le propuso
  marryPorMsg.delete(qid);
  if (Date.now() - g.t > MARRY_MS) return reply('⌛ La propuesta venció. Que lo intenten de nuevo con /marry.');
  const tagA = '@' + num(g.a.jid), tagB = '@' + num(g.b.jid), ms = [g.a.jid, g.b.jid];
  if (!acepta) return reply(`💔 ${tagB} rechazó la propuesta de ${tagA}. Ouch.`, ms);
  const ua = perfGet(g.a.ids, true, g.a.jid), ub = perfGet(g.b.ids, true, g.b.jid);
  if (ua.pareja || ub.pareja) return reply('⚠️ Alguno de los dos ya se casó con otra persona mientras tanto.', ms);
  const t = Date.now();
  ua.pareja = { ids: g.b.ids, jid: g.b.jid, nombre: g.b.nombre, desde: t };
  ub.pareja = { ids: g.a.ids, jid: g.a.jid, nombre: g.a.nombre, desde: t };
  perfDisco.luego();
  return reply(`💍 ¡${tagA} y ${tagB} se casaron! 🎉\n> Que sean felices (o que se divorcien con /divorce).`, ms);
}

// respuestas sin prefijo a un mensaje del bot: sí/no de /marry, número de /apk, get/stand de /bj
const RESP_MARRY = [{ re: /^(s[ií]+|acepto|dale|claro|no|nop|nope|rechazo)\W*$/i, mapa: marryPorMsg, run: (m, jid, g, qid, mt) => marryResp(m, jid, g, qid, /^(s|acepto|dale|claro)/i.test(mt[1])) }];

module.exports = { durTxt, marryPorMsg };
module.exports.respuestas = [...RESP_MARRY];
