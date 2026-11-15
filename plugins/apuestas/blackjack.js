// /bj: blackjack
const { saveEco } = require('../../src/db/economia');
const { apuestaArgs, apuestaInicio, pieSaldo } = require('../../src/lib/apuestas');
const { din, ecoGet, ecoIds } = require('../../src/lib/economia');
const { als, ctxBot, num, sock } = require('../../src/lib/state');

// --- blackjack: contra el crupier; se responde al mensaje del bot con "get" (otra carta) o "stand" (plantarse) ---
// Reglas: mazo de 52, el crupier saca hasta llegar a 17 y se planta ahí; ganar paga x2, empate devuelve la apuesta, blackjack natural paga 3:2.
const BJ_PALOS = ['♠️', '♥️', '♦️', '♣️'], BJ_RANGOS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const bjMazo = () => {
  const d = []; for (const p of BJ_PALOS) for (const r of BJ_RANGOS) d.push({ r, p });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const bjVal = c => c.r === 'A'? 11 : ['J', 'Q', 'K'].includes(c.r)? 10 : Number(c.r);
function bjTotal(mano) {
  let t = 0, a = 0;
  for (const c of mano) { t += bjVal(c); if (c.r === 'A') a++; }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}
const bjCarta = c => c.r === 'A'? `${c.r}${c.p} (1/11)` : ['J', 'Q', 'K'].includes(c.r)? `${c.r}${c.p} (10)` : `${c.r}${c.p}`;
const BJ_ESPERA = 120e3;                       // si no contestás en 2 min, el crupier planta por vos
const bjPorMsg = new Map();                    // id de mensaje del bot -> partida (para saber a qué partida responde alguien)
const bjPorJugador = new Map();                // jugador (su registro de economía) -> partida en curso

function bjTexto(g, revelar, cierre) {
  const tj = bjTotal(g.jug);
  const crup = revelar? `${g.crup.map(bjCarta).join('  ')}  → *${bjTotal(g.crup)}*` : `${bjCarta(g.crup[0])}  🂠  → *${bjTotal([g.crup[0]])}*`;
  return `🃏 *Blackjack*\n> Apuesta: ${din(g.n)}\n\n🧑 Vos: ${g.jug.map(bjCarta).join('  ')}  → *${tj}*\n🎩 Crupier: ${crup}\n\n${cierre || '> Respondé a este mensaje con *get* (pedir carta) o *stand* (plantarte)'}`;
}
async function bjEnviar(g, m, texto, mentions) {
  const s = await sock.sendMessage(g.jid, { text: texto, mentions: mentions || [] }, m? { quoted: m } : {});
  if (s?.key?.id && !g.fin) { g.msgs.push(s.key.id); bjPorMsg.set(s.key.id, g); }
  return s;
}
function bjLimpiar(g) {
  g.fin = true; clearTimeout(g.timer);
  for (const id of g.msgs) bjPorMsg.delete(id);
  if (bjPorJugador.get(g.u) === g) bjPorJugador.delete(g.u);
}
function bjArmarTimer(g) {
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (g.fin) return;
    als.run(g.bot, () => bjTerminar(g, null, true)).catch(console.error);
  }, BJ_ESPERA);
}
// cierra la partida: juega el crupier (si hace falta), paga y manda el resultado
async function bjTerminar(g, m, porTiempo) {
  if (g.fin) return;
  bjLimpiar(g);
  const tj = bjTotal(g.jug);
  let cierre, vuelve = 0;                       // vuelve = lo que se le devuelve a la billetera (apuesta incluida)
  if (g.natJ || g.natC) {
    if (g.natJ && g.natC) { vuelve = g.n; cierre = '🤝 Blackjack de los dos. Empate: te devuelven tu apuesta.'; }
    else if (g.natJ) { const gan = Math.floor(g.n * 1.5); vuelve = g.n + gan; cierre = `🃏 *¡BLACKJACK!* Pagan 3:2\n> Ganaste: ${din(gan)}`; }
    else cierre = `🎩 El crupier tiene blackjack. Ni te dio chance.\n> Perdiste: ${din(g.n)}`;
  } else if (tj > 21) {
    cierre = `💥 Te pasaste de 21.\n> Perdiste: ${din(g.n)}`;
  } else {
    while (bjTotal(g.crup) < 17) g.crup.push(g.deck.pop());
    const tc = bjTotal(g.crup);
    if (tc > 21) { vuelve = g.n * 2; cierre = `💥 El crupier se pasó de 21.\n> Ganaste: ${din(g.n)}`; }
    else if (tj > tc) { vuelve = g.n * 2; cierre = `🏆 Le ganaste al crupier.\n> Ganaste: ${din(g.n)}`; }
    else if (tj === tc) { vuelve = g.n; cierre = '🤝 Empate: te devuelven tu apuesta.'; }
    else cierre = `🎩 Gana la casa.\n> Perdiste: ${din(g.n)}`;
  }
  g.u.cartera += vuelve; saveEco();
  if (porTiempo) cierre = `⏰ Tardaste demasiado y el crupier plantó por vos.\n${cierre}`;
  await bjEnviar(g, m, bjTexto(g, true, cierre + pieSaldo(g.u)), [g.pjid]);
}
async function bjCmd(m, jid, text) {
  const uso = 'Uso: /bj <monto|all>\n> Ejemplo: /bj 5000';
  const a = await apuestaInicio(m, jid, apuestaArgs(text).arg, uso, u => bjPorJugador.has(u)? 'Ya tenés una partida en curso. Respondé a su mensaje con *get* o *stand*.' : null);
  if (!a) return;
  const { u, n } = a;
  const g = { jid, bot: ctxBot(), u, n, deck: bjMazo(), jug: [], crup: [], msgs: [], fin: false, pjid: m.key.participant || (m.key.fromMe? `${num(sock.user?.id)}@s.whatsapp.net` : jid) };
  g.jug.push(g.deck.pop(), g.deck.pop()); g.crup.push(g.deck.pop(), g.deck.pop());
  g.natJ = bjTotal(g.jug) === 21; g.natC = bjTotal(g.crup) === 21;
  bjPorJugador.set(u, g);
  if (g.natJ || g.natC) return bjTerminar(g, m);
  bjArmarTimer(g);
  await bjEnviar(g, m, bjTexto(g, false), [g.pjid]);
}
// respuesta "get" / "stand" (sin prefijo) citando un mensaje de la partida
async function bjResp(m, jid, g, accion) {
  if (g.fin) return;
  const ids = await ecoIds(m, jid);
  if (ecoGet(jid, ids, false) !== g.u) return sock.sendMessage(jid, { text: 'Esa partida no es tuya 🙄' }, { quoted: m });
  g.u.ult = Date.now();
  if (accion === 'stand') return bjTerminar(g, m);
  g.jug.push(g.deck.pop());
  const t = bjTotal(g.jug);
  if (t >= 21) return bjTerminar(g, m);       // pasarse pierde; llegar a 21 planta solo
  bjArmarTimer(g);
  await bjEnviar(g, m, bjTexto(g, false), [g.pjid]);
}
const CMD_BLACKJACK = [{ test: c => /^\/(bj|blackjack)(\s|$)/i.test(c.text), run: c => bjCmd(c.m, c.jid, c.text) }];
const RESP_BJ = [{ re: /^(get|stand)\W*$/, mapa: bjPorMsg, run: (m, jid, g, qid, mt) => bjResp(m, jid, g, mt[1]) }];

module.exports.commands = [...CMD_BLACKJACK];
module.exports.respuestas = [...RESP_BJ];
