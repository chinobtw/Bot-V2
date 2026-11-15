// Cálculo de cumpleaños y edades
const { perfGet } = require('./actividad');
const { MESES } = require('./social');

const socMetaDe = ids => { const u = perfGet(ids); return u?.meta?.pack? u.meta : null; };
const diasEn = (d, m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] >= d;
function cumpleHoy(c, hoy) {   // el 29/02 se festeja el 28/02 en los años que no son bisiestos
  const f = new Date(hoy + 'T00:00:00Z'), d = f.getUTCDate(), m = f.getUTCMonth() + 1, y = f.getUTCFullYear();
  if (c.d === d && c.m === m) return true;
  return c.d === 29 && c.m === 2 && d === 28 && m === 2 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
}
function diasHastaCumple(c, hoy) {
  const f = new Date(hoy + 'T00:00:00Z');
  for (let i = 0; i < 366; i++) { const x = new Date(f.getTime() + i * 86400e3); if (cumpleHoy(c, x.toISOString().slice(0, 10))) return i; }
  return 999;
}
const edadDe = (c, hoy) => { if (!c.a) return null; const y = +hoy.slice(0, 4), md = +hoy.slice(5, 7) * 100 + +hoy.slice(8, 10); return y - c.a - (md < c.m * 100 + c.d? 1 : 0); };
const cumpleTxt = c => `${c.d} de ${MESES[c.m - 1]}`;

module.exports = { cumpleHoy, cumpleTxt, diasEn, diasHastaCumple, edadDe, socMetaDe };
