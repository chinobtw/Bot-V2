// Prefijo de comandos de cada bot
const { cfgOf } = require('../db/ajustes');
const { ctxBot } = require('./state');

// ---------- prefijo por bot (cada instancia tiene el suyo) ----------
const prefijo = (id = ctxBot().id) => cfgOf(id).prefix || '/';
// pasa el prefijo del bot a "/" para que el resto del código funcione igual; si no empieza con el prefijo, no es comando.
// También acepta "inicial + prefijo + comando" (ej: J/s) y devuelve la inicial (en minúscula) en ini
function normalizar(t, px) {
  if (!t) return { t: '', ini: null };
  if (/^\/setprefix(\s|$)/i.test(t)) return { t, ini: null }; // con "/" siempre anda, así nadie se queda sin poder cambiarlo
  if (t.startsWith(px)) return { t: '/' + t.slice(px.length), ini: null };
  const c = Array.from(t)[0], resto = t.slice(c.length);
  if (/^\p{L}$/u.test(c)) {
    if (resto.startsWith(px)) return { t: '/' + resto.slice(px.length), ini: c.toLowerCase() };
    if (/^\/setprefix(\s|$)/i.test(resto)) return { t: resto, ini: c.toLowerCase() };
  }
  return { t: '', ini: null };
}

module.exports = { normalizar, prefijo };
