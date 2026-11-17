// /tateti: tatetí en el grupo, contra otra persona (/tateti @usuario) o contra el bot (/tateti). Se juega respondiendo al tablero con un número del 1 al 9
const { ecoIds, ecoObjetivo } = require('../../src/lib/economia');
const { comando, responder } = require('../../src/lib/medios');
const { botIds, ctxBot, num, senderIds, sock } = require('../../src/lib/state');

const SIM = ['❌', '⭕'], NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const LINEAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const ESPERA = 10 * 60e3;
const porMsg = new Map(), porChat = new Map();   // id del tablero -> partida; grupo -> partida

const ganador = t => LINEAS.find(([a, b, c]) => t[a] != null && t[a] === t[b] && t[b] === t[c]);
const tableroTxt = t => [0, 3, 6].map(i => [0, 1, 2].map(k => t[i + k] == null? NUM[i + k] : SIM[t[i + k]]).join('')).join('\n');
const nombre = j => j.bot? '🤖 Bot' : `@${num(j.jid)}`;
function fin(st) { clearTimeout(st.timer); if (st.idMsg) porMsg.delete(st.idMsg); if (porChat.get(st.jid) === st) porChat.delete(st.jid); }
function vigila(st) { clearTimeout(st.timer); st.timer = setTimeout(() => fin(st), ESPERA); st.timer.unref?.(); }

// el bot: gana si puede, tapa si hace falta, si no centro, esquinas y lo que quede
function jugadaBot(t, yo) {
  const libres = t.map((v, i) => v == null? i : -1).filter(i => i >= 0);
  const cierra = j => libres.find(i => { const x = [...t]; x[i] = j; return ganador(x); });
  const c = cierra(yo) ?? cierra(1 - yo); if (c != null) return c;
  if (t[4] == null) return 4;
  const esq = [0, 2, 6, 8].filter(i => t[i] == null); if (esq.length) return esq[Math.floor(Math.random() * esq.length)];
  return libres[Math.floor(Math.random() * libres.length)];
}
async function enviar(st, m, encabezado) {
  const mentions = st.jugadores.filter(j => !j.bot).map(j => j.jid);
  const turno = st.jugadores[st.turno];
  const txt = `🎮 *Tateti*\n${SIM[0]} ${nombre(st.jugadores[0])}  vs  ${SIM[1]} ${nombre(st.jugadores[1])}\n\n${tableroTxt(st.tablero)}\n\n${encabezado || `👉 Turno de ${SIM[st.turno]} ${nombre(turno)}\n> Respondé a este mensaje con un número del 1 al 9`}`;
  if (st.idMsg) porMsg.delete(st.idMsg);
  const s = await sock.sendMessage(st.jid, { text: txt, mentions }, { quoted: m });
  st.idMsg = s?.key?.id; if (st.idMsg) porMsg.set(st.idMsg, st);
}
async function tatetiCmd(c) {
  const reply = responder(c), jid = c.jid, args = c.text.replace(/^\/\S+\s*/, '').trim().toLowerCase();
  const previa = porChat.get(jid);
  if (/^(stop|cancelar|fin)$/.test(args)) {
    if (!previa) return reply('No hay ningún tateti en juego');
    const ids = senderIds(c.m, jid);
    if (!previa.jugadores.some(j => j.ids?.some(x => ids.includes(x)))) return reply('Solo los que juegan pueden cancelar la partida');
    fin(previa); return reply('🛑 Tateti cancelado');
  }
  if (previa) return reply('🎮 Ya hay un tateti en juego en este grupo. Respondé al tablero con un número, o cancelalo con /tateti stop');
  const yo = { ids: await ecoIds(c.m, jid), jid: c.m.key.participant || jid };
  let rival = { bot: true };
  const obj = await ecoObjetivo(c.m, jid);
  if (obj && !obj.ids.some(x => botIds().includes(x))) {
    if (obj.ids.some(x => yo.ids.includes(x))) return reply('😅 No podés jugar contra vos mismo');
    rival = { ids: obj.ids, jid: obj.jid };
  }
  const st = { bot: ctxBot(), jid, tablero: Array(9).fill(null), jugadores: [yo, rival], turno: 0 };
  porChat.set(jid, st); vigila(st);
  await enviar(st, c.m);
}
async function tatetiJugar(m, jid, st, qid, mt) {
  if (st.ocupado) return; st.ocupado = true;
  try {
    const ids = senderIds(m, jid), turno = st.jugadores[st.turno];
    const esJugador = st.jugadores.some(j => j.ids?.some(x => ids.includes(x)));
    if (!esJugador) return;
    const reply = t => sock.sendMessage(jid, { text: t }, { quoted: m });
    if (!turno.ids?.some(x => ids.includes(x))) return void await reply('⏳ No es tu turno');
    const i = Number(mt[1]) - 1;
    if (!(i >= 0 && i < 9)) return void await reply('Elegí un número del 1 al 9');
    if (st.tablero[i] != null) return void await reply('Esa casilla ya está ocupada, elegí otra');
    vigila(st);
    st.tablero[i] = st.turno;
    const cierre = () => {
      const w = ganador(st.tablero);
      if (w) return `🏆 *¡Ganó ${SIM[st.turno]} ${nombre(st.jugadores[st.turno])}!*`;
      if (st.tablero.every(v => v != null)) return '🤝 *Empate*';
      return null;
    };
    let f = cierre();
    if (!f) {
      st.turno = 1 - st.turno;
      if (st.jugadores[st.turno].bot) {
        st.tablero[jugadaBot(st.tablero, st.turno)] = st.turno;
        f = cierre();
        if (!f) st.turno = 1 - st.turno;
      }
    }
    if (f) { await enviar(st, m, f); fin(st); return; }
    await enviar(st, m);
  } finally { st.ocupado = false; }
}

module.exports.commands = [{ test: c => c.enGrupo && comando('tateti', 'tictactoe', 'ttt')(c), run: tatetiCmd }];
module.exports.respuestas = [{ re: /^([1-9])\W*$/, mapa: porMsg, run: tatetiJugar }];
