// Datos: lotería (loteria.json), préstamos (prestamos.json) y AFK (afk.json). Los tres se guardan con un pequeño retraso para no escribir en cada cambio
const fs = require('fs');

function archivo(ruta) {
  let datos = {};
  try { if (fs.existsSync(ruta)) datos = JSON.parse(fs.readFileSync(ruta)); } catch (e) { console.error(`[${ruta}] no pude leerlo:`, e.message); }
  const guardarYa = () => fs.writeFileSync(ruta, JSON.stringify(datos));
  let t; const guardar = () => { clearTimeout(t); t = setTimeout(() => { try { guardarYa(); } catch (e) { console.error(`[${ruta}]`, e.message); } }, 800); };
  return { ruta, datos, guardar, guardarYa };
}
const loteria = archivo('./loteria.json');    // { "<grupo>": { boletos: { "<id>": { ids, jid, n } } } }
const prestamos = archivo('./prestamos.json'); // { "<grupo>": { "<id>": { ids, jid, deuda, vence } } }
const afk = archivo('./afk.json');             // { "<grupo>": { "<id>": { ids, jid, motivo, desde } } }

module.exports = { afk, loteria, prestamos };
