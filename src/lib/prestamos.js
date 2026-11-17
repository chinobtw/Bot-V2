// Préstamos del banco: reglas y cobro de los vencidos
const { prestamos } = require('../db/extras');
const { saveEco } = require('../db/economia');
const { din, ecoGet } = require('./economia');
const { senderIds, sock } = require('./state');

const PRESTAMO_MAX = 100000, PRESTAMO_INTERES = 0.10, PRESTAMO_PLAZO = 3 * 86400e3;

function prestamoBuscar(jid, ids) {
  const g = prestamos.datos[jid]; if (!g) return null;
  const k = Object.keys(g).find(k => g[k].ids.some(x => ids.includes(x)));
  return k? { g, k, p: g[k] } : null;
}
// un préstamo vencido se cobra solo la próxima vez que la persona usa un comando: primero de la billetera y después del banco
function prestamoEmbargo(jid, m) {
  const f = prestamoBuscar(jid, senderIds(m, jid));
  if (!f || Date.now() < f.p.vence) return;
  const u = ecoGet(jid, f.p.ids, false); if (!u) return;
  let falta = f.p.deuda;
  const c = Math.min(u.cartera, falta); u.cartera -= c; falta -= c;
  const b = Math.min(u.banco, falta); u.banco -= b; falta -= b;
  if (falta <= 0) delete f.g[f.k]; else { f.p.deuda = falta; f.p.vence = Date.now() + 86400e3; }   // lo que no alcanzó se vuelve a intentar mañana
  saveEco(); prestamos.guardar();
  sock.sendMessage(jid, { text: `🏦 *Embargo*\nTu préstamo estaba vencido: el banco cobró ${din(c + b)}.${falta > 0? `\n> Todavía debés ${din(falta)} (se vuelve a cobrar mañana)` : '\n> Quedaste al día.'}`, mentions: [f.p.jid] }, { quoted: m }).catch(() => {});
}

module.exports = { PRESTAMO_INTERES, PRESTAMO_MAX, PRESTAMO_PLAZO, prestamoBuscar, prestamoEmbargo };
