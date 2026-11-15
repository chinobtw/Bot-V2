// /maq: tragamonedas
const { saveEco } = require('../../src/db/economia');
const { apuestaArgs, apuestaInicio, pieSaldo } = require('../../src/lib/apuestas');
const { din } = require('../../src/lib/economia');
const { sleep, sock } = require('../../src/lib/state');
const { aleat } = require('../../src/lib/util');

// --- maquinita: 4 rodillos x 3 filas; cada fila es una línea de pago (se cuenta de izquierda a derecha) ---
const MAQ_SIM = [['🍒', 30], ['🍋', 25], ['🍊', 20], ['🍇', 13], ['🔔', 7], ['💎', 4], ['7️⃣', 1]];
const MAQ_TOT = MAQ_SIM.reduce((a, b) => a + b[1], 0);
const maqSim = () => { let r = Math.random() * MAQ_TOT; for (const [s, w] of MAQ_SIM) if ((r -= w) < 0) return s; return MAQ_SIM[0][0]; };
const maqAzar = () => MAQ_SIM[Math.floor(Math.random() * MAQ_SIM.length)][0];     // para los cuadros de la animación
// multiplicador de la apuesta por fila ganadora: 3 iguales seguidos desde la izquierda, 4 iguales, o 2 cerezas
const MAQ_X3 = { '🍒': 2, '🍋': 3, '🍊': 4, '🍇': 7, '🔔': 12, '💎': 20, '7️⃣': 50 };
const MAQ_X4 = { '🍒': 6, '🍋': 10, '🍊': 14, '🍇': 25, '🔔': 40, '💎': 100, '7️⃣': 500 };
const MAQ_X2_CEREZA = 1;
function maqFila(cols, r) {
  const s = cols[0][r]; let k = 1; while (k < 4 && cols[k][r] === s) k++;
  if (k === 4) return MAQ_X4[s];
  if (k === 3) return MAQ_X3[s];
  if (k === 2 && s === '🍒') return MAQ_X2_CEREZA;
  return 0;
}
function maqPantalla(cols, filas) {
  return [0, 1, 2].map(r => `┃ ${cols.map(c => c[r]).join(' ┃ ')} ┃${filas && filas[r]? ` ◀ x${filas[r]}` : ''}`).join('\n');
}
const MAQ_SI = ['Las frutitas se alinearon. Primera vez que algo se te alinea.', 'Premio. La máquina estaba distraída.', 'Cayó plata. Disfrutala antes de que la devuelvas.'];
const MAQ_NO = ['Nada. La máquina se queda con tu plata y con tus ilusiones.', 'Otra vez será. Y otra. Y otra.', 'La máquina gana, como siempre. Es su único talento.'];
async function maqCmd(m, jid, text) {
  const uso = 'Uso: /maq <monto|all>\n> Ejemplo: /maq 5000';
  const a = await apuestaInicio(m, jid, apuestaArgs(text).arg, uso); if (!a) return;
  const { u, n } = a;
  const cols = [0, 1, 2, 3].map(() => [maqSim(), maqSim(), maqSim()]);          // resultado final: [arriba, medio, abajo] de cada rodillo
  const filas = [0, 1, 2].map(r => maqFila(cols, r)), mult = filas.reduce((x, y) => x + y, 0);
  const pago = Math.floor(n * mult), neto = pago - n;
  u.cartera += pago; saveEco();
  // animación: cada rodillo tiene una tira que baja; los rodillos se frenan de a uno (cuadros 2, 3, 4 y 5)
  const stop = [2, 3, 4, 5];
  const tiras = cols.map((c, i) => [...c, ...Array.from({ length: stop[i] }, maqAzar)]);
  const cuadro = f => tiras.map((t, i) => { const p = Math.max(0, stop[i] - f); return t.slice(p, p + 3); });
  const cab = `🎰 *MAQUINITA* 🎰\n> Apuesta: ${din(n)}\n\n`;
  const s = await sock.sendMessage(jid, { text: `${cab}${maqPantalla(cuadro(0))}\n\n🌀 Girando...` }, { quoted: m });
  for (let f = 1; f <= 4; f++) {
    await sleep(750);
    if (s?.key) await sock.sendMessage(jid, { text: `${cab}${maqPantalla(cuadro(f))}\n\n🌀 Girando...`, edit: s.key }).catch(() => {});
  }
  await sleep(750);
  const res = pago > n? `${mult >= 50? '🎉 *¡JACKPOT!* ' : ''}${aleat(MAQ_SI)}\n> Ganaste: ${din(neto)} (x${mult})`
    : pago === n? `Te devolvió justo lo que apostaste (x${mult}).`
    : `${aleat(MAQ_NO)}\n> Perdiste: ${din(n - pago)}${pago? ` (algo te devolvió: ${din(pago)})` : ''}`;
  const fin = `${cab}${maqPantalla(cuadro(5), filas)}\n\n${res}${pieSaldo(u)}`;
  if (s?.key) await sock.sendMessage(jid, { text: fin, edit: s.key }).catch(() => sock.sendMessage(jid, { text: fin }, { quoted: m }));
  else await sock.sendMessage(jid, { text: fin }, { quoted: m });
}
const CMD_MAQUINITA = [{ test: c => /^\/(maq|maquinita)(\s|$)/i.test(c.text), run: c => maqCmd(c.m, c.jid, c.text) }];

module.exports.commands = [...CMD_MAQUINITA];
